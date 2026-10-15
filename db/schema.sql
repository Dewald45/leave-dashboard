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
-- Per-person yearly allowance for a leave type, overriding leave_types.default_days
-- for every leave year this person starts (set on Add employee or in Admin).
create table if not exists public.profile_leave_entitlements (
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  leave_type_id int  not null references public.leave_types(id) on delete cascade,
  days          numeric not null check (days >= 0),
  primary key (profile_id, leave_type_id)
);

create or replace function public.provision_balances(p_profile uuid, p_asof date default current_date)
returns void language plpgsql as $$
declare v_start date; v_gender text;
begin
  select employment_start_date, gender into v_start, v_gender from public.profiles where id = p_profile;
  if v_start is null then return; end if;

  insert into public.leave_balances (profile_id, leave_type_id, year, entitled_days, reserved_days)
  select p_profile, lt.id,
    extract(year from public.leave_cycle_start(v_start, lt.cycle_months, lt.cycle_anchor, p_asof))::int,
    coalesce(e.days, lt.default_days, 0), lt.default_reserved
  from public.leave_types lt
  left join public.profile_leave_entitlements e
    on e.profile_id = p_profile and e.leave_type_id = lt.id
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
  c.entitled_days, c.full_entitled_days, c.reserved_days, c.service_met,
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
    -- The cycle's full allocation, before the first-six-months sick leave cap.
    b.entitled_days as full_entitled_days,
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
         c.cycle_months, c.cycle_anchor, c.carry_months, c.min_service_months, c.entitled_days, c.full_entitled_days, c.service_met,
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
-- default_days / default_reserved are only set when a type is first created:
-- after that they're the company defaults edited on the Admin page.
on conflict (code) do update set
  name=excluded.name, description=excluded.description, deducts_balance=excluded.deducts_balance,
  accrues=excluded.accrues, bookable=excluded.bookable, cycle_months=excluded.cycle_months,
  cycle_anchor=excluded.cycle_anchor, carry_months=excluded.carry_months,
  min_service_months=excluded.min_service_months, applies_to=excluded.applies_to,
  color=excluded.color, sort_order=excluded.sort_order;

-- ============================================================================
-- v2: threads, sick notes, half days, reminders/backup approvers, calendar,
--     password resets, admin-managed public holidays. All additive + idempotent.
-- ============================================================================

-- ---------- Profile extras ----------
-- Stand-in who may approve this manager's reports while they're away.
alter table public.profiles add column if not exists backup_approver_id uuid
  references public.profiles(id) on delete set null;
-- Secret token for the personal iCal subscription feed (/api/calendar/<token>).
alter table public.profiles add column if not exists calendar_token text unique;

-- ---------- Request extras ----------
alter table public.leave_requests add column if not exists half_day text;
do $$ begin
  alter table public.leave_requests add constraint leave_requests_half_day_chk
    check (half_day is null or (half_day in ('am','pm') and start_date = end_date));
exception when duplicate_object then null; end $$;
alter table public.leave_requests add column if not exists reminded_at  timestamptz;
alter table public.leave_requests add column if not exists escalated_at timestamptz;
-- Bumped on every change so calendar clients replace (not duplicate) the event.
alter table public.leave_requests add column if not exists calendar_seq int not null default 0;

-- ---------- Request threads ----------
create table if not exists public.request_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_request on public.request_messages(request_id, created_at);

-- Last time each person opened a request — drives the unread badges.
create table if not exists public.request_reads (
  request_id   uuid not null references public.leave_requests(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (request_id, profile_id)
);

-- ---------- Attachments (sick notes etc.) ----------
-- Stored in Postgres so the single pgdata volume remains the only thing to back up.
create table if not exists public.request_attachments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.leave_requests(id) on delete cascade,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  filename     text not null,
  content_type text not null,
  size_bytes   int  not null,
  data         bytea not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_attachments_request on public.request_attachments(request_id);

-- ---------- Password resets ----------
create table if not exists public.password_resets (
  token_hash text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index if not exists idx_password_resets_user on public.password_resets(user_id);

-- ---------- Public holidays (edited in Admin) ----------
create table if not exists public.public_holidays (
  holiday_date date primary key,
  name         text not null
);
-- 'auto' = calculated from the Public Holidays Act; 'manual' = added by an admin
-- (e.g. a specially declared election day).
alter table public.public_holidays add column if not exists source text not null default 'manual';

-- Years already filled in automatically. Generating a year once (and never
-- again) means a holiday an admin removes stays removed.
create table if not exists public.holiday_years (
  year         int primary key,
  generated_at timestamptz not null default now()
);

-- Easter Sunday (Gregorian, anonymous algorithm).
create or replace function public.easter_sunday(y int)
returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a := y % 19; b := y / 100; c := y % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  return make_date(y, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

-- South African statutory public holidays for a year (Public Holidays Act
-- 36 of 1994). A holiday on a Sunday moves to the Monday; if that Monday is
-- already a holiday (25 Dec on a Sunday) it moves to the next free day, as
-- happened in 2016 and 2022.
create or replace function public.sa_public_holidays(y int)
returns table (holiday_date date, name text)
language plpgsql immutable as $$
declare
  fixed record;
  taken date[] := array[]::date[];
  obs date;
  easter date := public.easter_sunday(y);
begin
  for fixed in
    select * from (values
      (make_date(y, 1, 1),   'New Year''s Day'),
      (make_date(y, 3, 21),  'Human Rights Day'),
      (easter - 2,           'Good Friday'),
      (easter + 1,           'Family Day'),
      (make_date(y, 4, 27),  'Freedom Day'),
      (make_date(y, 5, 1),   'Workers'' Day'),
      (make_date(y, 6, 16),  'Youth Day'),
      (make_date(y, 8, 9),   'National Women''s Day'),
      (make_date(y, 9, 24),  'Heritage Day'),
      (make_date(y, 12, 16), 'Day of Reconciliation'),
      (make_date(y, 12, 25), 'Christmas Day'),
      (make_date(y, 12, 26), 'Day of Goodwill')
    ) as t(d, n) order by d
  loop
    holiday_date := fixed.d; name := fixed.n;
    taken := taken || fixed.d;
    return next;
  end loop;

  for fixed in
    select * from (values
      (make_date(y, 1, 1),   'New Year''s Day'),
      (make_date(y, 3, 21),  'Human Rights Day'),
      (make_date(y, 4, 27),  'Freedom Day'),
      (make_date(y, 5, 1),   'Workers'' Day'),
      (make_date(y, 6, 16),  'Youth Day'),
      (make_date(y, 8, 9),   'National Women''s Day'),
      (make_date(y, 9, 24),  'Heritage Day'),
      (make_date(y, 12, 16), 'Day of Reconciliation'),
      (make_date(y, 12, 25), 'Christmas Day'),
      (make_date(y, 12, 26), 'Day of Goodwill')
    ) as t(d, n) order by d
  loop
    if extract(isodow from fixed.d) = 7 then
      obs := fixed.d + 1;
      while obs = any(taken) loop obs := obs + 1; end loop;
      holiday_date := obs; name := fixed.n || ' (observed)';
      taken := taken || obs;
      return next;
    end if;
  end loop;
end $$;

-- Fill in any year in [p_from, p_from + p_years) that hasn't been generated.
-- Existing dates (e.g. admin-added) are left untouched. Returns rows added.
create or replace function public.ensure_sa_holidays(p_from int, p_years int)
returns int language plpgsql as $$
declare yr int; added int := 0; n int;
begin
  for yr in p_from .. p_from + p_years - 1 loop
    if not exists (select 1 from public.holiday_years where year = yr) then
      insert into public.public_holidays (holiday_date, name, source)
      select h.holiday_date, h.name, 'auto' from public.sa_public_holidays(yr) h
      on conflict (holiday_date) do nothing;
      get diagnostics n = row_count;
      insert into public.holiday_years (year) values (yr);
      added := added + n;
      if n > 0 then
        insert into public.audit_log (action, entity_type, entity_id, summary, details)
        values ('holiday.generated', 'holiday', yr::text,
                'Added ' || n || ' South African public holidays for ' || yr || ' automatically',
                jsonb_build_object('year', yr, 'count', n));
      end if;
    end if;
  end loop;
  return added;
end $$;

-- ---------- Approval rules ----------
-- A manager is "away" while they're on approved leave today.
create or replace function public.manager_is_away(p_manager uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.leave_requests
     where profile_id = p_manager and status = 'approved'
       and current_date between start_date and end_date)
$$;

-- Who may approve/reject a request: admins, the line manager, or the line
-- manager's backup approver while the manager is away or the request has been
-- escalated for sitting too long.
create or replace function public.can_approve(p_request uuid, p_user uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
      from public.leave_requests r
      join public.profiles e on e.id = r.profile_id
      join public.profiles u on u.id = p_user
      left join public.profiles m on m.id = e.manager_id
     where r.id = p_request
       and (u.role = 'admin'
         or (r.profile_id <> p_user and e.manager_id = p_user)
         or (r.profile_id <> p_user and m.backup_approver_id = p_user
             and (public.manager_is_away(m.id) or r.escalated_at is not null))))
$$;

-- Who may open a request and its thread/attachments.
create or replace function public.can_view_request(p_request uuid, p_user uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.leave_requests r
     where r.id = p_request and (r.profile_id = p_user or r.approver_id = p_user))
  or public.can_approve(p_request, p_user)
$$;

-- ============================================================================
-- Audit trail: every change in the system, append-only.
-- No foreign keys on purpose — history must outlive deleted employees, so the
-- actor's and subject's names are snapshotted onto each row.
-- ============================================================================
create table if not exists public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,          -- null = system (reminders, seed) or signed-out user
  actor_name   text,
  actor_email  text,
  action       text not null, -- e.g. request.approved, profile.updated
  entity_type  text not null, -- request | profile | balance | holiday | account | message | attachment
  entity_id    text,
  subject_id   uuid,          -- the person the change is about
  subject_name text,
  summary      text not null, -- human-readable one-liner
  details      jsonb not null default '{}'::jsonb, -- before/after values etc.
  ip           text
);
create index if not exists idx_audit_at      on public.audit_log(at desc);
create index if not exists idx_audit_subject on public.audit_log(subject_id, at desc);
create index if not exists idx_audit_actor   on public.audit_log(actor_id, at desc);
create index if not exists idx_audit_action  on public.audit_log(action);

create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create or replace trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create or replace trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- One-time backfill: reconstruct history for requests that existed before the
-- audit trail did. Runs once (guarded by the audit.backfilled marker row).
-- Cancellation times were never stored, so those show only in the details.
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'audit.backfilled') then
    insert into public.audit_log (at, actor_id, actor_name, actor_email, action, entity_type,
                                  entity_id, subject_id, subject_name, summary, details)
    select r.created_at, p.id, p.full_name, p.email, 'request.submitted', 'request', r.id::text,
           p.id, p.full_name,
           'Applied for ' || lt.name || ', ' || to_char(r.start_date, 'DD Mon YYYY')
             || case when r.end_date <> r.start_date then ' – ' || to_char(r.end_date, 'DD Mon YYYY') else '' end
             || ' — ' || r.days || ' day(s)',
           jsonb_build_object('backfilled', true, 'leave_type', lt.name,
             'start_date', r.start_date, 'end_date', r.end_date, 'days', r.days,
             'reason', r.reason, 'current_status', r.status)
      from public.leave_requests r
      join public.profiles p on p.id = r.profile_id
      join public.leave_types lt on lt.id = r.leave_type_id;

    insert into public.audit_log (at, actor_id, actor_name, actor_email, action, entity_type,
                                  entity_id, subject_id, subject_name, summary, details)
    select r.decided_at, a.id, a.full_name, a.email, 'request.' || r.status, 'request', r.id::text,
           p.id, p.full_name,
           initcap(r.status::text) || ' ' || p.full_name || '''s ' || lt.name || ', '
             || to_char(r.start_date, 'DD Mon YYYY')
             || case when r.end_date <> r.start_date then ' – ' || to_char(r.end_date, 'DD Mon YYYY') else '' end,
           jsonb_build_object('backfilled', true, 'note', r.decision_note, 'days', r.days)
      from public.leave_requests r
      join public.profiles p on p.id = r.profile_id
      join public.leave_types lt on lt.id = r.leave_type_id
      left join public.profiles a on a.id = r.approver_id
     where r.status in ('approved','rejected') and r.decided_at is not null;

    insert into public.audit_log (action, entity_type, summary, details)
    values ('audit.backfilled', 'account',
            'Audit trail started — earlier leave requests reconstructed from their records',
            jsonb_build_object('requests', (select count(*) from public.leave_requests)));
  end if;
end $$;

-- ---------- Upcoming-holiday reminder emails ----------
-- Per-person opt-out (Account page).
alter table public.profiles add column if not exists holiday_emails boolean not null default true;
-- One reminder per holiday, ever: the row is claimed before sending.
create table if not exists public.holiday_reminders (
  holiday_date date primary key,
  sent_at      timestamptz not null default now(),
  recipients   int
);

-- Keep last year, this year and the next two years of public holidays filled in
-- (also re-checked daily by the reminder job, so new years appear on their own).
select public.ensure_sa_holidays(extract(year from current_date)::int - 1, 4);
