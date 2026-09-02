-- ============================================================================
-- Leave Application Dashboard — initial schema
-- South African policy (BCEA-aligned) with year-end closure handling.
--   Annual leave: 15 days/year, 5 reserved for the year-end closure.
--   Year-end closure: 5 days from annual balance + 5 company-paid days.
--   Sick leave: 30 days per 36-month cycle.
--   Family responsibility: 3 days/year.
--   Approval flow: Employee -> Line manager (approve/reject). Admin/HR oversees.
-- ============================================================================

-- ---------- Enums ----------
do $$ begin
  create type public.user_role as enum ('employee','manager','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending','approved','rejected','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  full_name             text not null,
  email                 text not null,
  role                  public.user_role not null default 'employee',
  manager_id            uuid references public.profiles(id) on delete set null,
  department            text,
  job_title             text,
  employment_start_date date not null default current_date,
  created_at            timestamptz not null default now()
);

-- ---------- Leave types ----------
create table if not exists public.leave_types (
  id              serial primary key,
  code            text unique not null,
  name            text not null,
  description     text,
  default_days    numeric,               -- yearly entitlement
  default_reserved numeric not null default 0,  -- auto-reserved (e.g. closure)
  deducts_balance boolean not null default true, -- false = company-paid, no cost
  color           text not null default '#64748b',
  sort_order      int not null default 0
);

-- ---------- Leave balances (per user / type / year) ----------
create table if not exists public.leave_balances (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  leave_type_id int  not null references public.leave_types(id) on delete cascade,
  year          int  not null,
  entitled_days numeric not null default 0,
  reserved_days numeric not null default 0,  -- e.g. 5 days pre-committed to closure
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
create index if not exists idx_profiles_manager on public.profiles(manager_id);

-- ============================================================================
-- Helper functions (SECURITY DEFINER to avoid recursive RLS on profiles)
-- ============================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.manages(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = target and manager_id = auth.uid());
$$;

-- ============================================================================
-- Provisioning: create a profile + seed balances when a user signs up
-- ============================================================================
create or replace function public.provision_balances(p_profile uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.leave_balances (profile_id, leave_type_id, year, entitled_days, reserved_days)
  select p_profile, lt.id, p_year, coalesce(lt.default_days, 0), lt.default_reserved
  from public.leave_types lt
  on conflict (profile_id, leave_type_id, year) do nothing;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_first boolean;
begin
  select count(*) = 0 into v_is_first from public.profiles;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    case when v_is_first then 'admin'::public.user_role else 'employee'::public.user_role end
  )
  on conflict (id) do nothing;

  perform public.provision_balances(new.id, extract(year from current_date)::int);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Approval-guard trigger on leave_requests
--   * Only the requester's line manager or an admin may approve/reject.
--   * Requesters may only cancel their own still-pending requests.
--   * Stamps approver_id + decided_at automatically on a decision.
-- ============================================================================
create or replace function public.guard_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Requests always start pending and belong to the creator (RLS also enforces).
    new.status := 'pending';
    new.approver_id := null;
    new.decided_at := null;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if new.status in ('approved','rejected') then
      if not (public.manages(old.profile_id) or public.is_admin()) then
        raise exception 'Only the line manager or an admin can approve or reject this request';
      end if;
      new.approver_id := auth.uid();
      new.decided_at  := now();
    elsif new.status = 'cancelled' then
      if not (auth.uid() = old.profile_id or public.is_admin()) then
        raise exception 'Only the requester or an admin can cancel this request';
      end if;
      if old.status <> 'pending' and not public.is_admin() then
        raise exception 'Only pending requests can be cancelled';
      end if;
    elsif new.status = 'pending' then
      if not public.is_admin() then
        raise exception 'Cannot move a request back to pending';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_request on public.leave_requests;
create trigger trg_guard_request
  before insert or update on public.leave_requests
  for each row execute function public.guard_request_change();

-- ============================================================================
-- Balance summary view (RLS of underlying tables applies via security_invoker)
-- ============================================================================
create or replace view public.balance_summary
with (security_invoker = on) as
select
  b.id,
  b.profile_id,
  b.leave_type_id,
  lt.code  as leave_code,
  lt.name  as leave_name,
  lt.color as leave_color,
  lt.deducts_balance,
  b.year,
  b.entitled_days,
  b.reserved_days,
  coalesce(sum(r.days) filter (where r.status = 'approved'), 0) as used_days,
  coalesce(sum(r.days) filter (where r.status = 'pending'),  0) as pending_days,
  b.entitled_days - b.reserved_days
    - coalesce(sum(r.days) filter (where r.status = 'approved'), 0) as available_days
from public.leave_balances b
join public.leave_types lt on lt.id = b.leave_type_id
left join public.leave_requests r
  on  r.profile_id = b.profile_id
  and r.leave_type_id = b.leave_type_id
  and extract(year from r.start_date)::int = b.year
group by b.id, lt.code, lt.name, lt.color, lt.deducts_balance;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.profiles       enable row level security;
alter table public.leave_types    enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;

-- Profiles: everyone signed in can read the staff directory (names/managers).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_admin());

-- Leave types: readable by all; writable by admin.
drop policy if exists leave_types_select on public.leave_types;
create policy leave_types_select on public.leave_types
  for select to authenticated using (true);

drop policy if exists leave_types_write on public.leave_types;
create policy leave_types_write on public.leave_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Balances: own, your reports', or admin. Writes admin-only.
drop policy if exists balances_select on public.leave_balances;
create policy balances_select on public.leave_balances
  for select to authenticated
  using (profile_id = auth.uid() or public.manages(profile_id) or public.is_admin());

drop policy if exists balances_write on public.leave_balances;
create policy balances_write on public.leave_balances
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Requests: own, your reports', or admin can read. Employees insert their own.
drop policy if exists requests_select on public.leave_requests;
create policy requests_select on public.leave_requests
  for select to authenticated
  using (profile_id = auth.uid() or public.manages(profile_id) or public.is_admin());

drop policy if exists requests_insert on public.leave_requests;
create policy requests_insert on public.leave_requests
  for insert to authenticated with check (profile_id = auth.uid());

drop policy if exists requests_update on public.leave_requests;
create policy requests_update on public.leave_requests
  for update to authenticated
  using (profile_id = auth.uid() or public.manages(profile_id) or public.is_admin())
  with check (profile_id = auth.uid() or public.manages(profile_id) or public.is_admin());

-- ============================================================================
-- Seed leave types
-- ============================================================================
insert into public.leave_types (code, name, description, default_days, default_reserved, deducts_balance, color, sort_order)
values
  ('annual', 'Annual Leave', 'Statutory annual leave (BCEA). 5 days are reserved for the year-end closure.', 15, 5, true, '#2563eb', 1),
  ('sick',   'Sick Leave', 'Paid sick leave — 30 days per 36-month cycle (BCEA).', 30, 0, true, '#d97706', 2),
  ('family', 'Family Responsibility', 'Family responsibility leave — 3 days per year (BCEA).', 3, 0, true, '#7c3aed', 3),
  ('closure','Year-End Closure (Company Paid)', 'Company-paid year-end shutdown days. Do not reduce your annual balance.', 5, 0, false, '#059669', 4)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      default_days = excluded.default_days,
      default_reserved = excluded.default_reserved,
      deducts_balance = excluded.deducts_balance,
      color = excluded.color,
      sort_order = excluded.sort_order;
