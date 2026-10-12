"use server";

import { revalidatePath } from "next/cache";
import { q, q1 } from "@/lib/db";
import { getSessionProfile } from "@/lib/session";
import { workingDaysBetween } from "@/lib/leave";
import {
  getLeaveType,
  getBalanceForType,
  getRequestForDecision,
} from "@/lib/data";
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
  const me = await getSessionProfile();
  if (!me) return { error: "Not signed in." };

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

  const lt = await getLeaveType(leaveTypeId);
  if (!lt) return { error: "Unknown leave type." };
  if (lt.bookable === false) {
    return {
      error: `${lt.name} is granted to everyone automatically — no need to apply for it.`,
    };
  }

  // The request counts against the cycle its first day falls in.
  const bal = await getBalanceForType(me.id, leaveTypeId, startDate);
  if (!bal) {
    return { error: `You're not eligible for ${lt.name}.` };
  }
  let leftAfter: number | null = null;
  if (bal.deducts_balance) {
    let remaining = Number(bal.available_days) - Number(bal.pending_days);
    // Carried-over days can only pay for leave that starts before they expire.
    if (bal.carry_expires && startDate > bal.carry_expires) {
      remaining -= Number(bal.carry_left);
    }
    if (days > remaining) {
      return {
        error: `Not enough ${lt.name}: ${days} working day(s) requested but only ${remaining} left to book in this leave cycle (after pending requests and any days held for the year-end closure).`,
      };
    }
    leftAfter = remaining - days;
  }

  await q(
    `insert into leave_requests (profile_id, leave_type_id, start_date, end_date, days, reason, status)
     values ($1, $2, $3, $4, $5, $6, 'pending')`,
    [me.id, leaveTypeId, startDate, endDate, days, reason]
  );

  // Notify the line manager (best-effort).
  try {
    if (me.manager_id) {
      const mgr = await q1<{ email: string; full_name: string }>(
        "select email, full_name from profiles where id = $1",
        [me.manager_id]
      );
      if (mgr?.email) {
        await notifyManagerOfRequest({
          managerEmail: mgr.email,
          managerName: mgr.full_name,
          employeeName: me.full_name,
          leaveType: lt.name,
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
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
  return {
    success:
      `Request sent for ${fmt(days)} working day${days === 1 ? "" : "s"}.` +
      (leftAfter === null
        ? ""
        : ` Counting this one, you have ${fmt(leftAfter)} day${leftAfter === 1 ? "" : "s"} of ${lt.name} left to book.`),
  };
}

/** Requester cancels their own pending request (admins may cancel any pending). */
export async function cancelRequest(formData: FormData): Promise<void> {
  const me = await getSessionProfile();
  if (!me) return;
  const id = String(formData.get("id") || "");
  if (!id) return;

  await q(
    `update leave_requests set status = 'cancelled'
      where id = $1 and status = 'pending' and (profile_id = $2 or $3)`,
    [id, me.id, me.role === "admin"]
  );

  revalidatePath("/dashboard");
  revalidatePath("/requests");
  revalidatePath("/approvals");
}

/** Manager/admin approves or rejects a report's request. */
export async function decideRequest(formData: FormData): Promise<void> {
  const me = await getSessionProfile();
  if (!me) return;
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").trim() || null;
  if (!id || !["approved", "rejected"].includes(decision)) return;

  const req = await getRequestForDecision(id);
  if (!req) return;

  // Only the requester's line manager or an admin may decide.
  const allowed = me.role === "admin" || req.manager_id === me.id;
  if (!allowed) return;

  const updated = await q(
    `update leave_requests
        set status = $1, decision_note = $2, approver_id = $3, decided_at = now()
      where id = $4 and status = 'pending'
      returning id`,
    [decision, note, me.id, id]
  );
  if (updated.length === 0) return; // already decided / cancelled

  try {
    if (req.employee_email) {
      await notifyEmployeeOfDecision({
        employeeEmail: req.employee_email,
        employeeName: req.employee_name,
        leaveType: req.leave_name,
        startDate: req.start_date,
        endDate: req.end_date,
        days: Number(req.days),
        decision: decision as "approved" | "rejected",
        note,
        deciderName: me.full_name,
      });
    }
  } catch (e) {
    console.error("[decideRequest] employee notification failed:", e);
  }

  revalidatePath("/approvals");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}
