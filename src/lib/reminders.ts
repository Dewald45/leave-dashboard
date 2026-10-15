import "server-only";
import { q, q1 } from "@/lib/db";
import { getApproverContacts, type Contact } from "@/lib/data";
import { notifyApprovalReminder } from "@/lib/email";
import { audit, leaveLabel } from "@/lib/audit";

/** Nudge approvers once a request has waited this many days… */
const REMIND_AFTER_DAYS = Number(process.env.REMINDER_AFTER_DAYS) || 3;
/** …then again every this many days while it's still pending… */
const REMIND_EVERY_DAYS = 2;
/** …and hand it to the backup approver (or admins) after this many. */
const ESCALATE_AFTER_DAYS = Number(process.env.ESCALATE_AFTER_DAYS) || 5;

type Stale = {
  id: string;
  profile_id: string;
  employee_name: string;
  leave_name: string;
  start_date: string;
  end_date: string;
  days: number;
  half_day: "am" | "pm" | null;
  waiting_days: number;
  escalated_at: string | null;
};

/** Backup approver of the employee's manager, or every admin if none is set. */
async function escalationContacts(employeeId: string): Promise<Contact[]> {
  const backup = await q1<Contact>(
    `select b.id, b.email, b.full_name
       from profiles e
       join profiles m on m.id = e.manager_id
       join profiles b on b.id = m.backup_approver_id
      where e.id = $1 and b.id <> $1`,
    [employeeId]
  );
  if (backup) return [backup];
  return q<Contact>(
    "select id, email, full_name from profiles where role = 'admin' and id <> $1",
    [employeeId]
  );
}

function merge(...lists: Contact[][]) {
  const seen = new Map<string, Contact>();
  for (const c of lists.flat()) seen.set(c.id, c);
  return [...seen.values()];
}

export async function runReminders(): Promise<{ reminded: number; escalated: number }> {
  const stale = await q<Stale>(
    `select r.id, r.profile_id, p.full_name as employee_name, lt.name as leave_name,
            r.start_date::text as start_date, r.end_date::text as end_date,
            r.days::float8 as days, r.half_day,
            floor(extract(epoch from now() - r.created_at) / 86400)::int as waiting_days,
            r.escalated_at::text as escalated_at
       from leave_requests r
       join profiles p on p.id = r.profile_id
       join leave_types lt on lt.id = r.leave_type_id
      where r.status = 'pending'
        and r.created_at < now() - make_interval(days => $1)`,
    [REMIND_AFTER_DAYS]
  );

  let reminded = 0;
  let escalated = 0;

  for (const r of stale) {
    const escalateNow = !r.escalated_at && r.waiting_days >= ESCALATE_AFTER_DAYS;

    // Claim the row first so overlapping runs can't double-send.
    const claimed = await q1(
      escalateNow
        ? `update leave_requests set escalated_at = now(), reminded_at = now()
            where id = $1 and status = 'pending' and escalated_at is null returning id`
        : `update leave_requests set reminded_at = now()
            where id = $1 and status = 'pending'
              and (reminded_at is null or reminded_at < now() - make_interval(days => $2))
            returning id`,
      escalateNow ? [r.id] : [r.id, REMIND_EVERY_DAYS]
    );
    if (!claimed) continue;

    if (escalateNow) {
      await audit({
        action: "request.escalated",
        entityType: "request",
        entityId: r.id,
        subject: { id: r.profile_id, full_name: r.employee_name },
        summary: `Escalated ${r.employee_name}'s ${leaveLabel(r)} after ${r.waiting_days} days without a decision`,
        details: { waiting_days: r.waiting_days },
      });
    }

    const { contacts } = await getApproverContacts(r.profile_id);
    const to = escalateNow || r.escalated_at
      ? merge(contacts, await escalationContacts(r.profile_id))
      : contacts;
    if (!to.length) continue;

    await notifyApprovalReminder({
      to: to.map((c) => c.email),
      requestId: r.id,
      employeeName: r.employee_name,
      leaveType: r.leave_name,
      startDate: r.start_date,
      endDate: r.end_date,
      days: Number(r.days),
      halfDay: r.half_day,
      waitingDays: r.waiting_days,
      escalated: escalateNow,
    });
    if (escalateNow) escalated++;
    else reminded++;
  }

  return { reminded, escalated };
}
