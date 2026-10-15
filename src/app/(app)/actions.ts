"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { getSessionProfile } from "@/lib/session";
import { workingDaysBetween, isWeekendOrHoliday, type HalfDay } from "@/lib/leave";
import { getHolidaySet } from "@/lib/holidays";
import {
  getLeaveType,
  getBalanceForType,
  getRequestForDecision,
  getApproverContacts,
  getThreadParticipants,
  canApproveRequest,
  canViewRequest,
  markRequestRead,
  type RequestForNotify,
} from "@/lib/data";
import {
  fileFromForm,
  validateAttachment,
  saveAttachment,
  SICK_NOTE_THRESHOLD_DAYS,
} from "@/lib/attachments";
import { buildInvite } from "@/lib/ics";
import { audit, leaveLabel } from "@/lib/audit";
import {
  notifyManagerOfRequest,
  notifyEmployeeOfSubmission,
  notifyEmployeeOfDecision,
  notifyCancellation,
  notifyNewMessage,
} from "@/lib/email";

export type ActionResult = { error?: string; success?: string };

function revalidateLeavePages(requestId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/requests");
  revalidatePath("/approvals");
  revalidatePath("/team");
  revalidatePath("/admin");
  if (requestId) revalidatePath(`/requests/${requestId}`);
}

function icsFor(r: RequestForNotify, status: string, seq: number) {
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

/** Employee submits a new leave request. */
export async function createRequest(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const me = await getSessionProfile();
  if (!me) return { error: "Not signed in." };

  const leaveTypeId = Number(formData.get("leave_type_id"));
  const startDate = String(formData.get("start_date") || "");
  let endDate = String(formData.get("end_date") || "");
  const reason = String(formData.get("reason") || "").trim() || null;
  const duration = String(formData.get("duration") || "full");
  const halfDay: HalfDay | null = duration === "am" || duration === "pm" ? duration : null;
  if (halfDay && !endDate) endDate = startDate;

  if (!leaveTypeId || !startDate || !endDate) {
    return { error: "Please choose a leave type and both dates." };
  }
  if (endDate < startDate) {
    return { error: "End date cannot be before the start date." };
  }
  if (halfDay && startDate !== endDate) {
    return { error: "Half days are for a single date — set the start and end to the same day." };
  }

  const holidays = await getHolidaySet();
  let days: number;
  if (halfDay) {
    if (isWeekendOrHoliday(startDate, holidays)) {
      return { error: "That date is a weekend or public holiday — no leave needed." };
    }
    days = 0.5;
  } else {
    days = workingDaysBetween(startDate, endDate, holidays);
  }
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

  // Sick note: required by policy for more than two consecutive sick days.
  const file = fileFromForm(formData, "attachment");
  if (file) {
    const problem = validateAttachment(file);
    if (problem) return { error: problem };
  }
  if (lt.code === "sick" && days > SICK_NOTE_THRESHOLD_DAYS && !file) {
    return {
      error: `Sick leave longer than ${SICK_NOTE_THRESHOLD_DAYS} days needs a medical certificate — please attach it.`,
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

  const created = await q1<{ id: string }>(
    `insert into leave_requests (profile_id, leave_type_id, start_date, end_date, days, half_day, reason, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'pending') returning id`,
    [me.id, leaveTypeId, startDate, endDate, days, halfDay, reason]
  );
  if (!created) return { error: "Could not save the request — try again." };
  const requestId = created.id;

  if (file) await saveAttachment(requestId, me.id, file);
  await markRequestRead(requestId, me.id);

  await audit({
    actor: me,
    action: "request.submitted",
    entityType: "request",
    entityId: requestId,
    subject: me,
    summary: `Applied for ${leaveLabel({ leave_name: lt.name, start_date: startDate, end_date: endDate, half_day: halfDay })} — ${days} day(s)`,
    details: {
      leave_type: lt.name,
      start_date: startDate,
      end_date: endDate,
      days,
      half_day: halfDay,
      reason,
      attachment: file ? { filename: file.name, bytes: file.size } : null,
    },
  });

  const summary = {
    requestId,
    leaveType: lt.name,
    startDate,
    endDate,
    days,
    halfDay,
  };

  // Notify the approver(s) — best-effort.
  try {
    const { contacts, managerAway, managerName } = await getApproverContacts(me.id);
    if (contacts.length) {
      await notifyManagerOfRequest({
        ...summary,
        to: contacts.map((c) => c.email),
        employeeName: me.full_name,
        reason,
        hasAttachment: !!file,
        awayNote: managerAway
          ? `Heads-up: ${managerName} is on leave today, so this has also gone to their stand-in.`
          : null,
      });
    }
  } catch (e) {
    console.error("[createRequest] approver notification failed:", e);
  }

  // Employee's copy with the out-of-office calendar invite.
  try {
    await notifyEmployeeOfSubmission({
      ...summary,
      employeeEmail: me.email,
      employeeName: me.full_name,
      ics: buildInvite({
        id: requestId,
        start_date: startDate,
        end_date: endDate,
        half_day: halfDay,
        leave_name: lt.name,
        status: "pending",
        calendar_seq: 0,
        employee_name: me.full_name,
        employee_email: me.email,
      }),
    });
  } catch (e) {
    console.error("[createRequest] calendar invite failed:", e);
  }

  revalidateLeavePages();
  // The request page confirms it, including what's left to book afterwards.
  const left = leftAfter === null ? "" : `&left=${encodeURIComponent(String(leftAfter))}`;
  redirect(`/requests/${requestId}?submitted=1${left}`);
}

/** Requester cancels their own pending or approved request (admins may cancel either). */
export async function cancelRequest(formData: FormData): Promise<void> {
  const me = await getSessionProfile();
  if (!me) return;
  const id = String(formData.get("id") || "");
  if (!id) return;

  const req = await getRequestForDecision(id);
  if (!req) return;
  const wasApproved = req.status === "approved";

  const updated = await q1<{ calendar_seq: number }>(
    `update leave_requests set status = 'cancelled', calendar_seq = calendar_seq + 1
      where id = $1 and status in ('pending', 'approved') and (profile_id = $2 or $3)
      returning calendar_seq`,
    [id, me.id, me.role === "admin"]
  );
  if (!updated) return;

  await audit({
    actor: me,
    action: "request.cancelled",
    entityType: "request",
    entityId: id,
    subject: { id: req.profile_id, full_name: req.employee_name },
    summary: `Cancelled ${me.id === req.profile_id ? "own" : `${req.employee_name}'s`} ${leaveLabel(req)} (was ${req.status})`,
    details: { previous_status: req.status, days: Number(req.days) },
  });

  try {
    const { contacts } = await getApproverContacts(req.profile_id);
    await notifyCancellation({
      requestId: id,
      leaveType: req.leave_name,
      startDate: req.start_date,
      endDate: req.end_date,
      days: Number(req.days),
      halfDay: req.half_day,
      employeeEmail: req.employee_email,
      employeeName: req.employee_name,
      wasApproved,
      cancelledByName: me.id === req.profile_id ? "you" : me.full_name,
      approverEmails: contacts.filter((c) => c.id !== me.id).map((c) => c.email),
      ics: icsFor(req, "cancelled", updated.calendar_seq),
    });
  } catch (e) {
    console.error("[cancelRequest] notification failed:", e);
  }

  revalidateLeavePages(id);
}

/** Manager/admin (or a backup approver) approves or rejects a request. */
export async function decideRequest(formData: FormData): Promise<void> {
  const me = await getSessionProfile();
  if (!me) return;
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").trim() || null;
  if (!id || !["approved", "rejected"].includes(decision)) return;

  const req = await getRequestForDecision(id);
  if (!req) return;
  if (!(await canApproveRequest(id, me.id))) return;

  const updated = await q1<{ calendar_seq: number }>(
    `update leave_requests
        set status = $1, decision_note = $2, approver_id = $3, decided_at = now(),
            calendar_seq = calendar_seq + 1
      where id = $4 and status = 'pending'
      returning calendar_seq`,
    [decision, note, me.id, id]
  );
  if (!updated) return; // already decided / cancelled

  await audit({
    actor: me,
    action: `request.${decision}`,
    entityType: "request",
    entityId: id,
    subject: { id: req.profile_id, full_name: req.employee_name },
    summary: `${decision === "approved" ? "Approved" : "Rejected"} ${req.employee_name}'s ${leaveLabel(req)}`,
    details: { note, days: Number(req.days), as_manager: req.manager_id === me.id },
  });

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
        decision: decision as "approved" | "rejected",
        note,
        deciderName: me.full_name,
        ics: icsFor(req, decision, updated.calendar_seq),
      });
    }
  } catch (e) {
    console.error("[decideRequest] employee notification failed:", e);
  }

  revalidateLeavePages(id);
}

/** Post a message (and/or a file) to a request's thread. */
export async function postMessage(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const me = await getSessionProfile();
  if (!me) return { error: "Not signed in." };
  const requestId = String(formData.get("request_id") || "");
  let body = String(formData.get("body") || "").trim();
  const file = fileFromForm(formData, "attachment");

  if (!requestId) return { error: "No request specified." };
  if (!body && !file) return { error: "Write a message or attach a file." };
  if (body.length > 4000) return { error: "Keep it under 4,000 characters." };
  if (!(await canViewRequest(requestId, me.id))) {
    return { error: "You don't have access to this request." };
  }
  if (file) {
    const problem = validateAttachment(file);
    if (problem) return { error: problem };
    await saveAttachment(requestId, me.id, file);
    if (!body) body = `Uploaded a file: ${file.name}`;
  }

  await q(
    "insert into request_messages (request_id, author_id, body) values ($1, $2, $3)",
    [requestId, me.id, body]
  );
  await markRequestRead(requestId, me.id);

  const owner = await getRequestForDecision(requestId);
  const subject = owner ? { id: owner.profile_id, full_name: owner.employee_name } : null;
  if (file) {
    await audit({
      actor: me,
      action: "attachment.uploaded",
      entityType: "attachment",
      entityId: requestId,
      subject,
      summary: `Uploaded “${file.name}” to ${owner ? leaveLabel(owner) : "a request"}`,
      details: { filename: file.name, bytes: file.size, type: file.type },
    });
  }
  await audit({
    actor: me,
    action: "message.posted",
    entityType: "message",
    entityId: requestId,
    subject,
    summary: `Posted in the thread on ${owner ? `${owner.employee_name}'s ${leaveLabel(owner)}` : "a request"}`,
    details: { body },
  });

  try {
    const req = owner;
    const participants = await getThreadParticipants(requestId);
    const to = participants.filter((p) => p.id !== me.id).map((p) => p.email);
    if (req && to.length) {
      await notifyNewMessage({
        to,
        requestId,
        authorName: me.full_name,
        employeeName: req.employee_name,
        leaveType: req.leave_name,
        startDate: req.start_date,
        endDate: req.end_date,
        halfDay: req.half_day,
        body,
      });
    }
  } catch (e) {
    console.error("[postMessage] notification failed:", e);
  }

  revalidateLeavePages(requestId);
  return { success: "Sent." };
}
