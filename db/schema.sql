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

-- Cycle window: 12-month types use the calendar year; longer cycles (sick =
-- 36 months) roll forward from the employment start date.
create or replace function public.cycle_start(p_start date, p_cycle_months int, p_asof date default current_date)
returns date language sql stable as $$
  select case
    when p_cycle_months = 12 then make_date(extract(year from p_asof)::int, 1, 1)
    else (p_start + make_interval(months =>
      floor(( extract(year from age(p_asof, p_start)) * 12
            + extract(month from age(p_asof, p_start)) ) / p_cycle_months)::int * p_cycle_months))::date
  end
$$;

create or replace function public.cycle_end(p_start date, p_cycle_months int, p_asof date default current_date)
returns date language sql stable as $$
  select (public.cycle_start(p_start, p_cycle_months, p_asof)
          + make_interval(months => p_cycle_months) - interval '1 day')::date
$$;

-- Annual-style monthly accrual, pro-rated across the calendar year.
create or replace function public.accrued_days(p_entitled numeric, p_accrues boolean, p_start date, p_year int)
returns numeric language sql stable as $$
  select case
    when not p_accrues then p_entitled
    else least(p_entitled, greatest(0, round(
      p_entitled
      * greatest(0, (least(current_date, make_date(p_year,12,31)) - greatest(make_date(p_year,1,1), p_start) + 1))::numeric
      / (make_date(p_year,12,31) - make_date(p_year,1,1) + 1)::numeric, 2)))
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

-- Provision the leave a profile's gender qualifies for, for a given year.
create or replace function public.provision_balances(p_profile uuid, p_year int)
returns void language plpgsql as $$
declare v_start date; v_gender text;
begin
  select employment_start_date, gender into v_start, v_gender from public.profiles where id = p_profile;
  if v_start is null then v_start := make_date(p_year,1,1); end if;

  insert into public.leave_balances (profile_id, leave_type_id, year, entitled_days, reserved_days)
  select p_profile, lt.id,
    case when lt.cycle_months = 12 then p_year
         else extract(year from public.cycle_start(v_start, lt.cycle_months))::int end,
    coalesce(lt.default_days, 0), lt.default_reserved
  from public.leave_types lt
  where lt.applies_to = 'all' or lt.applies_to = v_gender
  on conflict (profile_id, leave_type_id, year) do nothing;
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
  perform public.provision_balances(p_profile, extract(year from current_date)::int);
end $$;

-- ---------- Balance summary view ----------
drop view if exists public.balance_summary;
create view public.balance_summary as
select
  b.id, b.profile_id, b.leave_type_id,
  lt.code as leave_code, lt.name as leave_name, lt.color as leave_color,
  lt.deducts_balance, lt.accrues, lt.bookable, lt.cycle_months, lt.min_service_months,
  b.year,
  public.cycle_start(p.employment_start_date, lt.cycle_months) as cycle_start,
  public.cycle_end(p.employment_start_date, lt.cycle_months)   as cycle_end,
  case when lt.code = 'sick' then public.sick_entitlement(p.employment_start_date, b.entitled_days)
       else b.entitled_days end as entitled_days,
  b.reserved_days,
  (current_date >= (p.employment_start_date + make_interval(months => lt.min_service_months))::date) as service_met,
  public.accrued_days(
    case when lt.code='sick' then public.sick_entitlement(p.employment_start_date, b.entitled_days) else b.entitled_days end,
    lt.accrues, p.employment_start_date, b.year) as accrued_days,
  coalesce(sum(r.days) filter (where r.status='approved'),0) as used_days,
  coalesce(sum(r.days) filter (where r.status='pending'),0)  as pending_days,
  least(
    public.accrued_days(
      case when lt.code='sick' then public.sick_entitlement(p.employment_start_date, b.entitled_days) else b.entitled_days end,
      lt.accrues, p.employment_start_date, b.year),
    (case when lt.code='sick' then public.sick_entitlement(p.employment_start_date, b.entitled_days) else b.entitled_days end) - b.reserved_days
  ) - coalesce(sum(r.days) filter (where r.status='approved'),0) as available_days
from public.leave_balances b
join public.leave_types lt on lt.id = b.leave_type_id
join public.profiles p on p.id = b.profile_id
left join public.leave_requests r
  on r.profile_id = b.profile_id and r.leave_type_id = b.leave_type_id
  and (case when lt.cycle_months = 12
            then extract(year from r.start_date)::int = b.year
            else r.start_date between public.cycle_start(p.employment_start_date, lt.cycle_months)
                                  and public.cycle_end(p.employment_start_date, lt.cycle_months) end)
group by b.id, lt.code, lt.name, lt.color, lt.deducts_balance, lt.accrues, lt.bookable,
         lt.cycle_months, lt.min_service_months, p.employment_start_date;

-- ============================================================================
-- Seed leave types (idempotent upsert)
-- ============================================================================
insert into public.leave_types
  (code, name, description, default_days, default_reserved, deducts_balance, accrues, bookable, cycle_months, min_service_months, applies_to, color, sort_order)
values
  ('annual','Annual Leave','Statutory annual leave (BCEA). Accrues at 1.25 days a month; 5 days are held back for the year-end closure.',15,5,true,true,true,12,0,'all','#ff3300',1),
  ('sick','Sick Leave','Paid sick leave — 30 days per 36-month cycle (BCEA). Capped to 1 day per 26 days worked in your first six months.',30,0,true,false,true,36,0,'all','#f59e0b',2),
  ('family','Family Responsibility','Family responsibility leave — 3 days a year (BCEA). Kicks in after four months'' service.',3,0,true,false,true,12,4,'all','#22c55e',3),
  ('closure','Year-End Closure (Company Paid)','Company-paid festive shutdown. Granted automatically — everyone gets these, nobody applies.',5,0,false,false,false,12,0,'all','#0ea5e9',4),
  ('parental','Parental Leave','10 days for new dads to meet the tiny human, panic quietly and lose all sleep. Take them within four months of the birth. None of this is set in stone — every family (and the law) is different, so come speak to HR before you bank on it.',10,0,true,false,true,12,0,'male','#8b5cf6',5),
  ('maternity','Maternity Leave','Four consecutive months to grow, deliver and keep a brand-new human alive — the hardest leave you will ever earn (roughly 90 working days). None of this is set in stone — come speak to HR and they will sort the details with you.',90,0,true,false,true,12,0,'female','#ec4899',6)
on conflict (code) do update set
  name=excluded.name, description=excluded.description, default_days=excluded.default_days,
  default_reserved=excluded.default_reserved, deducts_balance=excluded.deducts_balance,
  accrues=excluded.accrues, bookable=excluded.bookable, cycle_months=excluded.cycle_months,
  min_service_months=excluded.min_service_months, applies_to=excluded.applies_to,
  color=excluded.color, sort_order=excluded.sort_order;
