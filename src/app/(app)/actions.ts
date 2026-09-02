"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { workingDaysBetween } from "@/lib/leave";

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

  // Balance guard for deductible leave types.
  const { data: bal } = await supabase
    .from("balance_summary")
    .select("available_days, deducts_balance, leave_name")
    .eq("profile_id", user.id)
    .eq("leave_type_id", leaveTypeId)
    .eq("year", new Date(startDate).getUTCFullYear())
    .maybeSingle();

  if (bal && bal.deducts_balance && days > Number(bal.available_days)) {
    return {
      error: `Not enough ${bal.leave_name}: ${days} working day(s) requested but only ${bal.available_days} available.`,
    };
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
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").trim() || null;
  if (!id || !["approved", "rejected"].includes(decision)) return;

  await supabase
    .from("leave_requests")
    .update({ status: decision, decision_note: note })
    .eq("id", id);

  revalidatePath("/approvals");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}
