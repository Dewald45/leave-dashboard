import "server-only";
import { q1 } from "@/lib/db";
import {
  getRequestForDecision,
  canApproveRequest,
  type RequestForNotify,
} from "@/lib/data";
import { buildInvite } from "@/lib/ics";
import { hasGoogleCalendar, syncRequestToGoogle } from "@/lib/googleCalendar";
import { audit, leaveLabel } from "@/lib/audit";
import { notifyEmployeeOfDecision } from "@/lib/email";

type Person = { id: string; full_name: string; email?: string | null };

export type DecisionOutcome = "done" | "missing" | "not_allowed" | "not_pending";

export function icsFor(r: RequestForNotify, status: string, seq: number) {
  return buildInvite({
    id: r.id,
    start_date: r.start_date,
    end_date: r.end_date,
    half_day: r.half_day,
    leave_name: r.leave_name,
    status,
    calendar_seq: seq,
    employee_name: r.employee_name,
    employee_email: r.employee_email,
  });
}

/**
 * Approve or reject a request as `me`: checks they may, records it, updates
 * calendars and tells the employee. Shared by the app and the emailed links;
 * callers handle sign-in / link checks and refreshing pages.
 */
export async function applyDecision(
  me: Person,
  id: string,
  decision: "approved" | "rejected",
  note: string | null,
  via: "app" | "email"
): Promise<DecisionOutcome> {
  const req = await getRequestForDecision(id);
  if (!req) return "missing";
  if (!(await canApproveRequest(id, me.id))) return "not_allowed";

  const updated = await q1<{ calendar_seq: number }>(
    `update leave_requests
        set status = $1, decision_note = $2, approver_id = $3, decided_at = now(),
            calendar_seq = calendar_seq + 1
      where id = $4 and status = 'pending'
      returning calendar_seq`,
    [decision, note, me.id, id]
  );
  if (!updated) return "not_pending"; // already decided / cancelled

  await audit({
    actor: me,
    action: `request.${decision}`,
    entityType: "request",
    entityId: id,
    subject: { id: req.profile_id, full_name: req.employee_name },
    summary: `${decision === "approved" ? "Approved" : "Rejected"} ${req.employee_name}'s ${leaveLabel(req)}${
      via === "email" ? " from the email link" : ""
    }`,
    details: { note, days: Number(req.days), as_manager: req.manager_id === me.id, via },
  });

  const google = await hasGoogleCalendar(req.profile_id);
  if (google) await syncRequestToGoogle(id);

  try {
    if (req.employee_email) {
      await notifyEmployeeOfDecision({
        requestId: id,
        leaveType: req.leave_name,
        startDate: req.start_date,
        endDate: req.end_date,
        days: Number(req.days),
        halfDay: req.half_day,
        employeeEmail: req.employee_email,
        employeeName: req.employee_name,
        decision,
        note,
        deciderName: me.full_name,
        ics: google ? undefined : icsFor(req, decision, updated.calendar_seq),
        googleCalendar: google,
      });
    }
  } catch (e) {
    console.error("[applyDecision] employee notification failed:", e);
  }
  return "done";
}
