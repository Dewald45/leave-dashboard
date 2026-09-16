-- ============================================================================
-- 0004 — Gender-based parental / maternity leave
--
-- This company runs the traditional split rather than the shared pool:
--   * Fathers  (male)   → Parental Leave  — 10 days (BCEA s25A)
--   * Mothers  (female) → Maternity Leave — 4 consecutive months (BCEA s25)
--
-- Each employee is only granted, and can only apply for, the leave their
-- profile gender qualifies for. (Note: post-Van Wyk (ConCourt, Oct 2025) the
-- statutory scheme is gender-neutral/shared — this split is company policy.)
-- ============================================================================

-- 1. Gender on the employee profile (nullable until HR sets it).
alter table public.profiles
  add column if not exists gender text;
do $$ begin
  alter table public.profiles
    add constraint profiles_gender_chk check (gender in ('male','female'));
exception when duplicate_object then null; end $$;

-- 2. Which gender a leave type is offered to.
alter table public.leave_types
  add column if not exists applies_to text not null default 'all';
do $$ begin
  alter table public.leave_types
    add constraint leave_types_applies_to_chk
    check (applies_to in ('all','male','female'));
exception when duplicate_object then null; end $$;

-- 3a. Parental Leave → fathers, 10 days.
update public.leave_types set
  name             = 'Parental Leave',
  description      = '10 days for new dads to meet the tiny human, panic quietly and lose all sleep. Take them within four months of the birth.',
  default_days     = 10,
  default_reserved = 0,
  deducts_balance  = true,
  accrues          = false,
  cycle_months     = 12,
  min_service_months = 0,
  applies_to       = 'male',
  color            = '#0ea5e9',
  sort_order       = 5
where code = 'parental';

-- 3b. Maternity Leave → mothers, 4 consecutive months (~90 working days).
insert into public.leave_types
  (code, name, description, default_days, default_reserved, deducts_balance,
   accrues, cycle_months, min_service_months, applies_to, color, sort_order)
values
  ('maternity', 'Maternity Leave',
   'Four consecutive months to grow, deliver and keep a brand-new human alive — the hardest leave you will ever earn. Roughly 90 working days; HR sorts the fine print.',
   90, 0, true, false, 12, 0, 'female', '#ec4899', 6)
on conflict (code) do update set
  name = excluded.name, description = excluded.description,
  default_days = excluded.default_days, default_reserved = excluded.default_reserved,
  deducts_balance = excluded.deducts_balance, accrues = excluded.accrues,
  cycle_months = excluded.cycle_months, applies_to = excluded.applies_to,
  color = excluded.color, sort_order = excluded.sort_order;

-- 4. Gender-aware provisioning — only grant types the gender (or 'all') qualifies for.
create or replace function public.provision_balances(p_profile uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_start  date;
  v_gender text;
begin
  select employment_start_date, gender into v_start, v_gender
    from public.profiles where id = p_profile;
  if v_start is null then v_start := make_date(p_year, 1, 1); end if;

  insert into public.leave_balances (profile_id, leave_type_id, year, entitled_days, reserved_days)
  select
    p_profile,
    lt.id,
    case when lt.cycle_months = 12 then p_year
         else extract(year from public.cycle_start(v_start, lt.cycle_months))::int end,
    coalesce(lt.default_days, 0),
    lt.default_reserved
  from public.leave_types lt
  where lt.applies_to = 'all' or lt.applies_to = v_gender
  on conflict (profile_id, leave_type_id, year) do nothing;
end $$;

-- 5. Reconcile one employee after their gender is set or changed: drop balances
--    they no longer qualify for, then top up the ones they do.
create or replace function public.sync_leave_eligibility(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_gender text;
begin
  select gender into v_gender from public.profiles where id = p_profile;

  delete from public.leave_balances b
  using public.leave_types lt
  where b.leave_type_id = lt.id
    and b.profile_id    = p_profile
    and lt.applies_to  <> 'all'
    and lt.applies_to is distinct from v_gender;

  perform public.provision_balances(p_profile, extract(year from current_date)::int);
end $$;

-- Only the service role (admin server actions) may reconcile arbitrary profiles.
revoke execute on function public.sync_leave_eligibility(uuid) from public;
grant execute on function public.sync_leave_eligibility(uuid) to service_role;

-- 6. Remove legacy gendered balances (old 130-day shared "parental", granted to
--    everyone). They are re-created correctly once each profile's gender is set.
delete from public.leave_balances b
using public.leave_types lt
where b.leave_type_id = lt.id
  and lt.code in ('parental', 'maternity');
