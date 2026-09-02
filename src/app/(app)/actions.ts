"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { workingDaysBetween } from "@/lib/leave";
import {
  notifyManagerOfRequest,
  notifyEmployeeOfDecision,
} from "@/lib/email";

export type ActionResult = { error?: string; success?: string };

/** Employee submits a new leave request. */
export async function createRequest(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const leaveTypeId = Number(formData.get("leave_type_id"));
  const startDate = String(formData.get("start_date") || "");
  const endDate = String(formData.get("end_date") || "");
  const reason = String(formData.get("reason") || "").trim() || null;

  if (!leaveTypeId || !startDate || !endDate) {
    return { error: "Please choose a leave type and both dates." };
  }
  if (endDate < startDate) {
    return { error: "End date cannot be before the start date." };
  }

  const days = workingDaysBetween(startDate, endDate);
  if (days <= 0) {
    return { error: "The selected range has no working days (weekends/holidays only)." };
  }

  // Balance guard for deductible leave types — accrued minus already-pending.
  const { data: bal } = await supabase
    .from("balance_summary")
    .select("available_days, pending_days, deducts_balance, leave_name")
    .eq("profile_id", user.id)
    .eq("leave_type_id", leaveTypeId)
    .eq("year", new Date(startDate).getUTCFullYear())
    .maybeSingle();

  if (bal && bal.deducts_balance) {
    const remaining = Number(bal.available_days) - Number(bal.pending_days);
    if (days > remaining) {
      return {
        error: `Not enough ${bal.leave_name}: ${days} working day(s) requested but only ${remaining} available (after accrual and pending requests).`,
      };
    }
  }

  const { error } = await supabase.from("leave_requests").insert({
    profile_id: user.id,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    days,
    reason,
  });

  if (error) return { error: error.message };

  // Notify the line manager (best-effort).
  try {
    const { data: me } = await supabase
      .from("profiles")
      .select("full_name, manager_id")
      .eq("id", user.id)
      .single();
    if (me?.manager_id) {
      const [{ data: mgr }, { data: lt }] = await Promise.all([
        supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", me.manager_id)
          .single(),
        supabase
          .from("leave_types")
          .select("name")
          .eq("id", leaveTypeId)
          .single(),
      ]);
      if (mgr?.email) {
        await notifyManagerOfRequest({
          managerEmail: mgr.email,
          managerName: mgr.full_name,
          employeeName: me.full_name,
          leaveType: lt?.name ?? "Leave",
          startDate,
          endDate,
          days,
          reason,
        });
      }
    }
  } catch (e) {
    console.error("[createRequest] manager notification failed:", e);
  }

  revalidatePath("/dashboard");
  revalidatePath("/requests");
  revalidatePath("/approvals");
  return { success: `Request submitted for ${days} working day(s).` };
}

/** Requester cancels their own pending request. */
export async function cancelRequest(formData: FormData): Promise<void> {
  const supabase = createClient();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id);
  revalidatePath("/dashboard");
  revalidatePath("/requests");
}

/** Manager/admin approves or rejects a report's request. */
export async function decideRequest(formData: FormData): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").trim() || null;
  if (!id || !["approved", "rejected"].includes(decision)) return;

  const { error } = await supabase
    .from("leave_requests")
    .update({ status: decision, decision_note: note })
    .eq("id", id);

  if (!error) {
    // Notify the employee of the outcome (best-effort).
    try {
      const { data: req } = await supabase
        .from("leave_requests")
        .select(
          "start_date,end_date,days,decision_note,status,profiles:profiles!profile_id(email,full_name),leave_types(name)"
        )
        .eq("id", id)
        .single();
      const { data: decider } = user
        ? await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single()
        : { data: null };

      const emp = (req as any)?.profiles;
      if (emp?.email) {
        await notifyEmployeeOfDecision({
          employeeEmail: emp.email,
          employeeName: emp.full_name,
          leaveType: (req as any)?.leave_types?.name ?? "Leave",
          startDate: (req as any).start_date,
          endDate: (req as any).end_date,
          days: Number((req as any).days),
          decision: decision as "approved" | "rejected",
          note,
          deciderName: decider?.full_name ?? "Your manager",
        });
      }
    } catch (e) {
      console.error("[decideRequest] employee notification failed:", e);
    }
  }

  revalidatePath("/approvals");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}
