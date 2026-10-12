import "server-only";
import { q, q1 } from "@/lib/db";
import type {
  BalanceSummary,
  LeaveType,
  Profile,
  RequestWithRelations,
} from "@/lib/types";

// ---------- column selects (with casts so dates are strings, numerics numbers) ----------

const BALANCE_COLS = `
  b.id, b.profile_id, b.leave_type_id, b.leave_code, b.leave_name, b.leave_color,
  b.deducts_balance, b.accrues, b.bookable, b.cycle_months, b.cycle_anchor, b.min_service_months, b.year,
  b.cycle_start::text as cycle_start, b.cycle_end::text as cycle_end, b.is_current,
  b.entitled_days::float8 as entitled_days, b.reserved_days::float8 as reserved_days,
  b.service_met,
  b.accrued_days::float8 as accrued_days, b.used_days::float8 as used_days,
  b.pending_days::float8 as pending_days, b.available_days::float8 as available_days`;

const REQUEST_SELECT = `
  select r.id, r.profile_id, r.leave_type_id,
         r.start_date::text as start_date, r.end_date::text as end_date,
         r.days::float8 as days, r.reason, r.status, r.approver_id,
         r.decision_note, r.decided_at::text as decided_at, r.created_at::text as created_at,
         json_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'department',p.department) as profiles,
         json_build_object('id',lt.id,'code',lt.code,'name',lt.name,'color',lt.color) as leave_types,
         case when ap.id is null then null
              else json_build_object('id',ap.id,'full_name',ap.full_name) end as approver
    from leave_requests r
    join profiles p on p.id = r.profile_id
    join leave_types lt on lt.id = r.leave_type_id
    left join profiles ap on ap.id = r.approver_id`;

const PROFILE_COLS = `
  id, full_name, email, role, manager_id, department, job_title, gender,
  employment_start_date::text as employment_start_date, created_at`;

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
async function ensureAllCurrentBalances(): Promise<void> {
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
  return q1<Pick<LeaveType, "id" | "name" | "bookable">>(
    "select id, name, bookable from leave_types where id = $1",
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

/** Requests awaiting decision — admin sees all, managers see their reports. */
export function getPendingApprovals(profile: Profile) {
  if (profile.role === "admin") {
    return q<RequestWithRelations>(
      `${REQUEST_SELECT} where r.status = 'pending' and r.profile_id <> $1
        order by r.created_at asc`,
      [profile.id]
    );
  }
  return q<RequestWithRelations>(
    `${REQUEST_SELECT} where r.status = 'pending' and r.profile_id <> $1
       and p.manager_id = $1 order by r.created_at asc`,
    [profile.id]
  );
}

export function getRecentDecisions(profile: Profile) {
  const scope = profile.role === "admin" ? "" : "and p.manager_id = $1";
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

/** Row needed to authorise + notify a decision. */
export function getRequestForDecision(id: string) {
  return q1<{
    profile_id: string;
    manager_id: string | null;
    start_date: string;
    end_date: string;
    days: number;
    employee_email: string;
    employee_name: string;
    leave_name: string;
  }>(
    `select r.profile_id, p.manager_id, r.start_date::text as start_date,
            r.end_date::text as end_date, r.days::float8 as days,
            p.email as employee_email, p.full_name as employee_name,
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
