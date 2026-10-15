import "server-only";
import { q, q1 } from "@/lib/db";
import type {
  AttachmentMeta,
  BalanceSummary,
  LeaveType,
  Profile,
  RequestMessage,
  RequestWithRelations,
  ThreadStats,
} from "@/lib/types";

// ---------- column selects (with casts so dates are strings, numerics numbers) ----------

const BALANCE_COLS = `
  b.id, b.profile_id, b.leave_type_id, b.leave_code, b.leave_name, b.leave_color,
  b.deducts_balance, b.accrues, b.bookable, b.cycle_months, b.cycle_anchor, b.carry_months, b.min_service_months, b.year,
  b.cycle_start::text as cycle_start, b.cycle_end::text as cycle_end, b.is_current,
  b.entitled_days::float8 as entitled_days, b.full_entitled_days::float8 as full_entitled_days,
  b.reserved_days::float8 as reserved_days,
  b.service_met,
  b.accrued_days::float8 as accrued_days, b.used_days::float8 as used_days,
  b.pending_days::float8 as pending_days, b.available_days::float8 as available_days,
  b.carried_days::float8 as carried_days, b.carry_expires::text as carry_expires,
  b.carry_left::float8 as carry_left`;

const REQUEST_SELECT = `
  select r.id, r.profile_id, r.leave_type_id,
         r.start_date::text as start_date, r.end_date::text as end_date,
         r.days::float8 as days, r.half_day, r.reason, r.status, r.approver_id,
         r.decision_note, to_char(r.decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as decided_at, to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
         json_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'department',p.department,'manager_id',p.manager_id) as profiles,
         json_build_object('id',lt.id,'code',lt.code,'name',lt.name,'color',lt.color) as leave_types,
         case when ap.id is null then null
              else json_build_object('id',ap.id,'full_name',ap.full_name) end as approver
    from leave_requests r
    join profiles p on p.id = r.profile_id
    join leave_types lt on lt.id = r.leave_type_id
    left join profiles ap on ap.id = r.approver_id`;

const PROFILE_COLS = `
  id, full_name, email, role, manager_id, department, job_title, gender,
  employment_start_date::text as employment_start_date, created_at, backup_approver_id`;

// ---------- balances ----------

/**
 * Provision a profile's balances for the cycles in progress today (idempotent).
 * Cycles roll over on each person's own start-date anniversary, so this runs
 * on page load rather than on 1 January.
 */
export async function ensureCurrentBalances(profileId: string): Promise<void> {
  await q("select public.provision_balances($1, current_date)", [profileId]);
}

/** Same, for everyone — so admin and team views never miss someone whose cycle just rolled over. */
export async function ensureAllCurrentBalances(): Promise<void> {
  await q("select public.provision_balances(id, current_date) from profiles");
}

/** A profile's balances for the cycles in progress today. */
export function getBalances(profileId: string) {
  return q<BalanceSummary>(
    `select ${BALANCE_COLS} from balance_summary b
      where b.profile_id = $1 and b.is_current order by b.leave_type_id`,
    [profileId]
  );
}

export async function getAllBalances() {
  await ensureAllCurrentBalances();
  return q<BalanceSummary>(
    `select ${BALANCE_COLS} from balance_summary b where b.is_current order by b.leave_type_id`
  );
}

/** Current annual balances for a set of profiles (used on the Team page). */
export async function getAnnualBalances(profileIds: string[]) {
  if (profileIds.length === 0) return [] as BalanceSummary[];
  await ensureAllCurrentBalances();
  return q<BalanceSummary>(
    `select ${BALANCE_COLS} from balance_summary b
      where b.leave_code = 'annual' and b.is_current and b.profile_id = any($1::uuid[])`,
    [profileIds]
  );
}

/** The balance whose cycle contains `onDate` (ISO date) — provisioned on demand for future cycles. */
export async function getBalanceForType(profileId: string, typeId: number, onDate: string) {
  await q("select public.provision_balances($1, $2::date)", [profileId, onDate]);
  return q1<BalanceSummary>(
    `select ${BALANCE_COLS} from balance_summary b
      where b.profile_id = $1 and b.leave_type_id = $2
        and $3::date between b.cycle_start and b.cycle_end`,
    [profileId, typeId, onDate]
  );
}

// ---------- leave types ----------

export function getLeaveTypes() {
  return q<LeaveType>("select * from leave_types order by sort_order");
}

export function getLeaveType(id: number) {
  return q1<Pick<LeaveType, "id" | "code" | "name" | "bookable">>(
    "select id, code, name, bookable from leave_types where id = $1",
    [id]
  );
}

// ---------- requests ----------

export function getMyRequests(profileId: string, limit?: number) {
  return q<RequestWithRelations>(
    `${REQUEST_SELECT} where r.profile_id = $1 order by r.created_at desc ${
      limit ? "limit " + Number(limit) : ""
    }`,
    [profileId]
  );
}

/**
 * Requests awaiting decision — admins see all, managers see their reports, and
 * backup approvers see their manager's reports while the manager is away or
 * once a request has been escalated (see can_approve() in schema.sql).
 */
export function getPendingApprovals(profile: Profile) {
  return q<RequestWithRelations>(
    `${REQUEST_SELECT} where r.status = 'pending' and r.profile_id <> $1
       and public.can_approve(r.id, $1) order by r.created_at asc`,
    [profile.id]
  );
}

export function getRecentDecisions(profile: Profile) {
  const scope =
    profile.role === "admin" ? "" : "and (p.manager_id = $1 or r.approver_id = $1)";
  return q<RequestWithRelations>(
    `${REQUEST_SELECT} where r.status in ('approved','rejected') and r.profile_id <> $1
       ${scope} order by r.decided_at desc nulls last limit 15`,
    [profile.id]
  );
}

export function getUpcomingApproved(profile: Profile) {
  const scope = profile.role === "admin" ? "" : "and p.manager_id = $1";
  return q<RequestWithRelations>(
    `${REQUEST_SELECT} where r.status = 'approved' and r.end_date >= current_date
       and r.profile_id <> $1 ${scope} order by r.start_date asc limit 20`,
    [profile.id]
  );
}

export type RequestForNotify = {
  id: string;
  profile_id: string;
  manager_id: string | null;
  status: string;
  start_date: string;
  end_date: string;
  days: number;
  half_day: "am" | "pm" | null;
  calendar_seq: number;
  employee_email: string;
  employee_name: string;
  leave_name: string;
};

/** Row needed to authorise + notify a decision / cancellation / message. */
export function getRequestForDecision(id: string) {
  return q1<RequestForNotify>(
    `select r.id, r.profile_id, p.manager_id, r.status, r.start_date::text as start_date,
            r.end_date::text as end_date, r.days::float8 as days, r.half_day,
            r.calendar_seq, p.email as employee_email, p.full_name as employee_name,
            lt.name as leave_name
       from leave_requests r
       join profiles p on p.id = r.profile_id
       join leave_types lt on lt.id = r.leave_type_id
      where r.id = $1`,
    [id]
  );
}

// ---------- people ----------

export function getTeamMembers(profile: Profile) {
  if (profile.role === "admin") {
    return q<Profile>(`select ${PROFILE_COLS} from profiles order by full_name`);
  }
  return q<Profile>(
    `select ${PROFILE_COLS} from profiles where manager_id = $1 order by full_name`,
    [profile.id]
  );
}

export function getAllProfiles() {
  return q<Profile>(`select ${PROFILE_COLS} from profiles order by full_name`);
}

// ---------- single request, threads, attachments ----------

export function getRequestById(id: string) {
  return q1<RequestWithRelations>(`${REQUEST_SELECT} where r.id = $1`, [id]);
}

export async function canViewRequest(requestId: string, userId: string) {
  const row = await q1<{ ok: boolean }>(
    "select public.can_view_request($1, $2) as ok",
    [requestId, userId]
  );
  return !!row?.ok;
}

export async function canApproveRequest(requestId: string, userId: string) {
  const row = await q1<{ ok: boolean }>(
    "select public.can_approve($1, $2) as ok",
    [requestId, userId]
  );
  return !!row?.ok;
}

export function getMessages(requestId: string) {
  return q<RequestMessage>(
    `select m.id, m.request_id, m.author_id, p.full_name as author_name, m.body,
            to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
       from request_messages m
       left join profiles p on p.id = m.author_id
      where m.request_id = $1
      order by m.created_at asc`,
    [requestId]
  );
}

export function getAttachments(requestId: string) {
  return q<AttachmentMeta>(
    `select a.id, a.request_id, a.filename, a.content_type, a.size_bytes,
            p.full_name as uploaded_by_name, to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
       from request_attachments a
       left join profiles p on p.id = a.uploaded_by
      where a.request_id = $1
      order by a.created_at asc`,
    [requestId]
  );
}

export async function markRequestRead(requestId: string, profileId: string) {
  await q(
    `insert into request_reads (request_id, profile_id, last_read_at) values ($1, $2, now())
     on conflict (request_id, profile_id) do update set last_read_at = now()`,
    [requestId, profileId]
  );
}

/** Message, unread and attachment counts per request for one viewer. */
export async function getThreadStats(
  requestIds: string[],
  viewerId: string
): Promise<Record<string, ThreadStats>> {
  if (requestIds.length === 0) return {};
  const rows = await q<{ request_id: string } & ThreadStats>(
    `select r.id as request_id,
            (select count(*) from request_messages m where m.request_id = r.id)::int as messages,
            (select count(*) from request_messages m
               left join request_reads rr on rr.request_id = r.id and rr.profile_id = $2
              where m.request_id = r.id and m.author_id is distinct from $2
                and m.created_at > coalesce(rr.last_read_at, '-infinity'))::int as unread,
            (select count(*) from request_attachments a where a.request_id = r.id)::int as attachments
       from leave_requests r
      where r.id = any($1::uuid[])`,
    [requestIds, viewerId]
  );
  return Object.fromEntries(
    rows.map(({ request_id, ...stats }) => [request_id, stats])
  );
}

// ---------- notification routing ----------

export type Contact = { id: string; email: string; full_name: string };

/**
 * Who should hear about a request from this employee: the line manager, plus
 * the manager's backup approver (or every admin, if no backup is set) while
 * the manager is away. Employees with no manager route to the admins.
 */
export async function getApproverContacts(employeeId: string): Promise<{
  contacts: Contact[];
  managerAway: boolean;
  managerName: string | null;
}> {
  const mgr = await q1<Contact & { backup_approver_id: string | null; away: boolean }>(
    `select m.id, m.email, m.full_name, m.backup_approver_id,
            public.manager_is_away(m.id) as away
       from profiles e join profiles m on m.id = e.manager_id
      where e.id = $1`,
    [employeeId]
  );

  const admins = () =>
    q<Contact>(
      "select id, email, full_name from profiles where role = 'admin' and id <> $1",
      [employeeId]
    );

  if (!mgr) return { contacts: await admins(), managerAway: false, managerName: null };

  const contacts: Contact[] = [{ id: mgr.id, email: mgr.email, full_name: mgr.full_name }];
  if (mgr.away) {
    const backups = mgr.backup_approver_id
      ? await q<Contact>("select id, email, full_name from profiles where id = $1", [
          mgr.backup_approver_id,
        ])
      : await admins();
    for (const b of backups) {
      if (b.id !== employeeId && !contacts.some((c) => c.id === b.id)) contacts.push(b);
    }
  }
  return { contacts, managerAway: mgr.away, managerName: mgr.full_name };
}

/** Everyone involved in a request's thread: requester, approvers, anyone who posted. */
export function getThreadParticipants(requestId: string) {
  return q<Contact>(
    `select distinct p.id, p.email, p.full_name
       from leave_requests r
       join profiles p on p.id = r.profile_id
          or p.id = r.approver_id
          or p.id = (select manager_id from profiles where id = r.profile_id)
          or p.id in (select author_id from request_messages where request_id = r.id)
      where r.id = $1`,
    [requestId]
  );
}

export function getManagersAndAdmins() {
  return q<Pick<Profile, "id" | "full_name">>(
    "select id, full_name from profiles where role in ('manager','admin') order by full_name"
  );
}
