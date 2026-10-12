-- ============================================================================
-- Leave Dashboard — self-hosted Postgres schema (no Supabase / no RLS)
-- Idempotent: safe to run on every container start. Authorization is enforced
-- in the application layer (server components + server actions), not in the DB.
-- ============================================================================

-- gen_random_uuid() is built into PostgreSQL 13+ (our target is 16) — no extension needed.

-- ---------- Enums ----------
do $$ begin
  create type public.user_role as enum ('employee','manager','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending','approved','rejected','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- Auth: users + sessions ----------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.sessions (
  token      text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_sessions_user on public.sessions(user_id);
create index if not exists idx_sessions_expires on public.sessions(expires_at);

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id                    uuid primary key references public.users(id) on delete cascade,
  full_name             text not null,
  email                 text not null,
  role                  public.user_role not null default 'employee',
  manager_id            uuid references public.profiles(id) on delete set null,
  department            text,
  job_title             text,
  gender                text,
  employment_start_date date not null default current_date,
  created_at            timestamptz not null default now()
);
do $$ begin
  alter table public.profiles add constraint profiles_gender_chk check (gender in ('male','female'));
exception when duplicate_object then null; end $$;
create index if not exists idx_profiles_manager on public.profiles(manager_id);

-- ---------- Leave types ----------
create table if not exists public.leave_types (
  id                 serial primary key,
  code               text unique not null,
  name               text not null,
  description        text,
  default_days       numeric,
  default_reserved   numeric not null default 0,
  deducts_balance    boolean not null default true,
  accrues            boolean not null default false,
  bookable           boolean not null default true,
  cycle_months       int not null default 12,
  min_service_months int not null default 0,
  applies_to         text not null default 'all',
  color              text not null default '#64748b',
  sort_order         int not null default 0
);
do $$ begin
  alter table public.leave_types add constraint leave_types_applies_to_chk
    check (applies_to in ('all','male','female'));
exception when duplicate_object then null; end $$;

-- ---------- Leave balances ----------
create table if not exists public.leave_balances (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  leave_type_id int  not null references public.leave_types(id) on delete cascade,
  year          int  not null,
  entitled_days numeric not null default 0,
  reserved_days numeric not null default 0,
  unique (profile_id, leave_type_id, year)
);

-- ---------- Leave requests ----------
create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  leave_type_id int  not null references public.leave_types(id),
  start_date    date not null,
  end_date      date not null,
  days          numeric not null check (days > 0),
  reason        text,
  status        public.request_status not null default 'pending',
  approver_id   uuid references public.profiles(id) on delete set null,
  decision_note text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_requests_profile on public.leave_requests(profile_id);
create index if not exists idx_requests_status  on public.leave_requests(status);

-- ============================================================================
-- Leave business logic (pure SQL — no auth dependency)
-- ============================================================================

-- Where a leave type's cycle is anchored:
--   'start'    — rolls forward from the employee's start date (annual, sick,
--                family responsibility: BCEA leave cycles run from employment).
--   'calendar' — 1 January to 31 December (company-wide things like the closure).
alter table public.leave_types add column if not exists cycle_anchor text not null default 'calendar';
do $$ begin
  alter table public.leave_types add constraint leave_types_cycle_anchor_chk
    check (cycle_anchor in ('calendar','start'));
exception when duplicate_object then null; end $$;

-- Carry-over: unused days from a finished cycle stay usable for carry_months
-- into the next one, then expire (BCEA s20(4): annual leave must be taken
-- within six months of the end of the cycle). 0 = this type never carries over.
alter table public.leave_types add column if not exists carry_months int not null default 0;
-- Days brought into this cycle from the previous one. Worked out once, when the
-- cycle starts (carry_settled), and editable by an admin after that.
alter table public.leave_balances add column if not exists carried_days numeric not null default 0;
alter table public.leave_balances add column if not exists carry_settled boolean not null default false;

-- One row per expiry reminder sent, so nobody is emailed twice for the same warning.
create table if not exists public.leave_expiry_alerts (
  balance_id  uuid not null references public.leave_balances(id) on delete cascade,
  days_before int  not null,
  sent_at     timestamptz not null default now(),
  primary key (balance_id, days_before)
);

-- Replaced by the leave_cycle_* functions below (the view depends on them).
drop view if exists public.balance_summary;
drop function if exists public.cycle_start(date, int, date);
drop function if exists public.cycle_end(date, int, date);
drop function if exists public.accrued_days(numeric, boolean, date, int);
drop function if exists public.provision_balances(uuid, int);

-- How many whole cycles have elapsed since the start date, as of a date.
create or replace function public.leave_cycle_index(p_start date, p_cycle_months int, p_asof date default current_date)
returns int language sql stable as $$
  select floor(( extract(year  from age(greatest(p_asof, p_start), p_start)) * 12
               + extract(month from age(greatest(p_asof, p_start), p_start)) ) / p_cycle_months)::int
$$;

create or replace function public.leave_cycle_start(p_start date, p_cycle_months int, p_anchor text, p_asof date default current_date)
returns date language sql stable as $$
  select case
    when p_anchor = 'calendar' then make_date(extract(year from p_asof)::int, 1, 1)
    else (p_start + make_interval(months =>
            public.leave_cycle_index(p_start, p_cycle_months, p_asof) * p_cycle_months))::date
  end
$$;

-- Last day of the cycle: the day before the next cycle starts (so 29 Feb
-- start dates never leave a gap between cycles).
create or replace function public.leave_cycle_end(p_start date, p_cycle_months int, p_anchor text, p_asof date default current_date)
returns date language sql stable as $$
  select case
    when p_anchor = 'calendar'
      then (make_date(extract(year from p_asof)::int, 1, 1) + make_interval(months => p_cycle_months))::date - 1
    else (p_start + make_interval(months =>
            (public.leave_cycle_index(p_start, p_cycle_months, p_asof) + 1) * p_cycle_months))::date - 1
  end
$$;

-- Days earned so far in a cycle: straight-line across the cycle (annual leave
-- = 15 days over 12 months = 1.25 a month). Informational only — see
-- available_days below for what may actually be booked.
create or replace function public.leave_accrued(p_entitled numeric, p_accrues boolean, p_cycle_start date, p_cycle_end date)
returns numeric language sql stable as $$
  select case
    when not p_accrues then p_entitled
    else least(p_entitled, greatest(0, round(
      p_entitled
      * greatest(0, (least(current_date, p_cycle_end) - p_cycle_start + 1))::numeric
      / (p_cycle_end - p_cycle_start + 1)::numeric, 2)))
  end
$$;

-- BCEA s22(2): first-6-months sick leave is capped at 1 day per 26 days worked.
create or replace function public.sick_entitlement(p_start date, p_default numeric, p_asof date default current_date)
returns numeric language sql stable as $$
  select case
    when p_asof < (p_start + interval '6 months')::date
      then least(p_default, floor(greatest(0, (p_asof - p_start))::numeric * 5.0 / 7.0 / 26.0))
    else p_default
  end
$$;

-- Provision the leave a profile's gender qualifies for, for the cycles that
-- contain p_asof. A balance row's `year` is the year its cycle starts in.
create or replace function public.provision_balances(p_profile uuid, p_asof date default current_date)
returns void language plpgsql as $$
declare v_start date; v_gender text;
begin
  select employment_start_date, gender into v_start, v_gender from public.profiles where id = p_profile;
  if v_start is null then return; end if;

  insert into public.leave_balances (profile_id, leave_type_id, year, entitled_days, reserved_days)
  select p_profile, lt.id,
    extract(year from public.leave_cycle_start(v_start, lt.cycle_months, lt.cycle_anchor, p_asof))::int,
    coalesce(lt.default_days, 0), lt.default_reserved
  from public.leave_types lt
  where lt.applies_to = 'all' or lt.applies_to = v_gender
  on conflict (profile_id, leave_type_id, year) do nothing;

  -- Once a cycle has started, fix what it inherits from the cycle before it:
  -- whatever was still bookable there (never the reserved closure days).
  update public.leave_balances b
     set carry_settled = true,
         carried_days = case when cur.carry_months > 0 then coalesce((
           select greatest(0, pv.available_days - pv.pending_days)
             from public.balance_summary pv
            where pv.profile_id = b.profile_id and pv.leave_type_id = b.leave_type_id
              and pv.cycle_end = cur.cycle_start - 1), 0) else 0 end
    from public.balance_summary cur
   where cur.id = b.id and b.profile_id = p_profile
     and not b.carry_settled and cur.cycle_start <= current_date;
end $$;

-- Drop balances a profile no longer qualifies for (gender change), then top up.
create or replace function public.sync_leave_eligibility(p_profile uuid)
returns void language plpgsql as $$
declare v_gender text;
begin
  select gender into v_gender from public.profiles where id = p_profile;
  delete from public.leave_balances b using public.leave_types lt
   where b.leave_type_id = lt.id and b.profile_id = p_profile
     and lt.applies_to <> 'all' and lt.applies_to is distinct from v_gender;
  perform public.provision_balances(p_profile, current_date);
end $$;

-- ---------- Balance summary view ----------
-- One row per balance, with the cycle it belongs to.
--
-- available_days = entitled - reserved - approved (+ carry-over, below). It is
-- deliberately NOT capped by what has accrued so far: an employee may book
-- ahead of accrual (go into arrears), but never past the cycle's entitlement,
-- and never into the reserved days (the 5 annual days held from day one of
-- every cycle for the December closure).
--
-- Carry-over: carried_days are spent first, by leave starting on or before
-- carry_expires. Until that date they add to available_days; after it only the
-- part actually used still counts, and the rest is gone. carry_left is what is
-- still unbooked and due to expire.
create view public.balance_summary as
select
  c.id, c.profile_id, c.leave_type_id,
  c.leave_code, c.leave_name, c.leave_color,
  c.deducts_balance, c.accrues, c.bookable, c.cycle_months, c.cycle_anchor, c.carry_months, c.min_service_months,
  c.year, c.cycle_start, c.cycle_end,
  (current_date between c.cycle_start and c.cycle_end) as is_current,
  c.entitled_days, c.reserved_days, c.service_met,
  public.leave_accrued(c.entitled_days, c.accrues, c.cycle_start, c.cycle_end) as accrued_days,
  coalesce(sum(r.days) filter (where r.status='approved'),0) as used_days,
  coalesce(sum(r.days) filter (where r.status='pending'),0)  as pending_days,
  c.carried_days, c.carry_expires,
  least(c.carried_days,
        coalesce(sum(r.days) filter (where r.status='approved' and r.start_date <= c.carry_expires),0)) as carry_used,
  case when current_date <= c.carry_expires
       then c.carried_days - least(c.carried_days,
              coalesce(sum(r.days) filter (where r.status in ('approved','pending') and r.start_date <= c.carry_expires),0))
       else 0 end as carry_left,
  c.entitled_days - c.reserved_days
    - coalesce(sum(r.days) filter (where r.status='approved'),0)
    + case when current_date <= c.carry_expires then c.carried_days
           else least(c.carried_days,
                  coalesce(sum(r.days) filter (where r.status='approved' and r.start_date <= c.carry_expires),0))
      end as available_days
from (
  select
    b.id, b.profile_id, b.leave_type_id, b.year, b.reserved_days,
    lt.code as leave_code, lt.name as leave_name, lt.color as leave_color,
    lt.deducts_balance, lt.accrues, lt.bookable, lt.cycle_months, lt.cycle_anchor, lt.carry_months, lt.min_service_months,
    case when lt.code = 'sick' then public.sick_entitlement(p.employment_start_date, b.entitled_days)
         else b.entitled_days end as entitled_days,
    case when lt.carry_months > 0 then b.carried_days else 0 end as carried_days,
    -- Last day carried-over leave may start on; null when the type never carries over.
    case when lt.carry_months > 0 then
      (public.leave_cycle_start(p.employment_start_date, lt.cycle_months, lt.cycle_anchor, make_date(b.year,12,31))
        + make_interval(months => lt.carry_months))::date - 1 end as carry_expires,
    (current_date >= (p.employment_start_date + make_interval(months => lt.min_service_months))::date) as service_met,
    public.leave_cycle_start(p.employment_start_date, lt.cycle_months, lt.cycle_anchor, make_date(b.year,12,31)) as cycle_start,
    public.leave_cycle_end(p.employment_start_date, lt.cycle_months, lt.cycle_anchor, make_date(b.year,12,31))   as cycle_end
  from public.leave_balances b
  join public.leave_types lt on lt.id = b.leave_type_id
  join public.profiles p on p.id = b.profile_id
) c
left join public.leave_requests r
  on r.profile_id = c.profile_id and r.leave_type_id = c.leave_type_id
  and r.start_date between c.cycle_start and c.cycle_end
-- Ignore rows whose year no longer matches a real cycle (e.g. the start date was edited).
where extract(year from c.cycle_start)::int = c.year
group by c.id, c.profile_id, c.leave_type_id, c.year, c.reserved_days,
         c.leave_code, c.leave_name, c.leave_color, c.deducts_balance, c.accrues, c.bookable,
         c.cycle_months, c.cycle_anchor, c.carry_months, c.min_service_months, c.entitled_days, c.service_met,
         c.carried_days, c.carry_expires, c.cycle_start, c.cycle_end;

-- ============================================================================
-- Seed leave types (idempotent upsert)
-- ============================================================================
insert into public.leave_types
  (code, name, description, default_days, default_reserved, deducts_balance, accrues, bookable, cycle_months, cycle_anchor, carry_months, min_service_months, applies_to, color, sort_order)
values
  ('annual','Annual Leave','Statutory annual leave (BCEA): 15 days per leave year, which runs from your start date. It builds at 1.25 days a month and you may book ahead of it, but 5 days are held back from day one for the year-end closure. Unused days carry over for six months, then expire.',15,5,true,true,true,12,'start',6,0,'all','#ff3300',1),
  ('sick','Sick Leave','Paid sick leave — 30 days per 36-month cycle (BCEA). Capped to 1 day per 26 days worked in your first six months.',30,0,true,false,true,36,'start',0,0,'all','#f59e0b',2),
  ('family','Family Responsibility','Family responsibility leave — 3 days a year (BCEA). Kicks in after four months'' service.',3,0,true,false,true,12,'start',0,4,'all','#22c55e',3),
  ('closure','Year-End Closure (Company Paid)','Company-paid festive shutdown. Granted automatically — everyone gets these, nobody applies.',5,0,false,false,false,12,'calendar',0,0,'all','#0ea5e9',4),
  ('parental','Parental Leave','10 days for new dads to meet the tiny human, panic quietly and lose all sleep. Take them within four months of the birth. None of this is set in stone — every family (and the law) is different, so come speak to HR before you bank on it.',10,0,true,false,true,12,'calendar',0,0,'male','#8b5cf6',5),
  ('maternity','Maternity Leave','Four consecutive months to grow, deliver and keep a brand-new human alive — the hardest leave you will ever earn (roughly 90 working days). None of this is set in stone — come speak to HR and they will sort the details with you.',90,0,true,false,true,12,'calendar',0,0,'female','#ec4899',6)
on conflict (code) do update set
  name=excluded.name, description=excluded.description, default_days=excluded.default_days,
  default_reserved=excluded.default_reserved, deducts_balance=excluded.deducts_balance,
  accrues=excluded.accrues, bookable=excluded.bookable, cycle_months=excluded.cycle_months,
  cycle_anchor=excluded.cycle_anchor, carry_months=excluded.carry_months,
  min_service_months=excluded.min_service_months, applies_to=excluded.applies_to,
  color=excluded.color, sort_order=excluded.sort_order;
