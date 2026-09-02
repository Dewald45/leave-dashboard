-- ============================================================================
-- 0003 — BCEA-correct leave cycles
--
-- FIXES A REAL COMPLIANCE BUG: sick leave was provisioned per calendar year,
-- so every employee silently received a fresh 30 days each 1 January. The
-- BCEA (s22) grants 30 days per *36-month cycle*, measured from the date
-- employment commenced (or the end of the previous cycle) — not per year.
--
-- Also adds:
--   * s22(2) — during the first 6 months of employment, sick leave is capped
--     at one day per 26 days worked.
--   * s27 — family responsibility leave requires 4 months' service.
--   * Parental leave (Van Wyk, CC, 3 Oct 2025) as a trackable leave type.
--
-- Annual leave deliberately stays on the calendar year. The BCEA's annual
-- cycle runs from the employment anniversary, but an employer may use the
-- calendar year where it is not less favourable — and this company's 1 Jan
-- reset with a 5-day closure reserve is company policy, not a defect.
-- ============================================================================

-- ---------- Per-type cycle length ----------
alter table public.leave_types
  add column if not exists cycle_months int not null default 12;

update public.leave_types set cycle_months = 36 where code = 'sick';
update public.leave_types set cycle_months = 12 where code <> 'sick';

-- ---------- Minimum service before a type may be taken (BCEA s27) ----------
alter table public.leave_types
  add column if not exists min_service_months int not null default 0;

update public.leave_types set min_service_months = 4 where code = 'family';

-- ---------- Cycle window ----------
-- For 12-month types the cycle is the calendar year (company policy).
-- For 36-month types (sick) the cycle runs from the employment start date,
-- rolling forward in whole 36-month blocks.
create or replace function public.cycle_start(
  p_start        date,
  p_cycle_months int,
  p_asof         date default current_date
) returns date
language sql stable as $$
  select case
    when p_cycle_months = 12 then make_date(extract(year from p_asof)::int, 1, 1)
    else (
      p_start + make_interval(
        months => (
          floor(
            ( extract(year  from age(p_asof, p_start)) * 12
            + extract(month from age(p_asof, p_start)) ) / p_cycle_months
          )::int * p_cycle_months
        )
      )
    )::date
  end
$$;

create or replace function public.cycle_end(
  p_start        date,
  p_cycle_months int,
  p_asof         date default current_date
) returns date
language sql stable as $$
  select (public.cycle_start(p_start, p_cycle_months, p_asof)
          + make_interval(months => p_cycle_months)
          - interval '1 day')::date
$$;

-- ---------- BCEA s22(2): first-6-months sick accrual ----------
-- One day's paid sick leave per 26 days worked. "Days worked" is approximated
-- as calendar days x 5/7 (a standard 5-day week); this is an approximation and
-- errs low, which is the safe direction for an entitlement floor.
create or replace function public.sick_entitlement(
  p_start   date,
  p_default numeric,
  p_asof    date default current_date
) returns numeric
language sql stable as $$
  select case
    when p_asof < (p_start + interval '6 months')::date
      then least(
        p_default,
        floor(greatest(0, (p_asof - p_start))::numeric * 5.0 / 7.0 / 26.0)
      )
    else p_default
  end
$$;

-- ---------- Parental leave (Van Wyk v Minister of Employment and Labour) ----------
-- The Constitutional Court (3 Oct 2025) consolidated maternity / paternity /
-- adoption leave into ONE shared pool of 4 months + 10 days (~130 calendar
-- days), split between the parents as they choose. The split is a per-family
-- arrangement this schema cannot infer, so the balance is tracked but not
-- auto-capped — HR confirms the division. deducts_balance = false.
insert into public.leave_types
  (code, name, description, default_days, default_reserved, deducts_balance, color, sort_order)
values
  ('parental', 'Parental Leave',
   'Shared parental leave — 4 months + 10 days per birth/adoption/surrogacy, split between parents (Van Wyk, ConCourt 2025). Arrange the split with HR.',
   130, 0, false, '#0a0a0a', 5)
on conflict (code) do update
  set name            = excluded.name,
      description     = excluded.description,
      default_days    = excluded.default_days,
      deducts_balance = excluded.deducts_balance,
      sort_order      = excluded.sort_order;

update public.leave_types set accrues = false, cycle_months = 12 where code = 'parental';

-- ---------- Cycle-aware balance summary ----------
-- The material change vs 0002: `used_days` / `pending_days` for a 36-month
-- type are counted across the whole cycle window, not the calendar year.
drop view if exists public.balance_summary;
create view public.balance_summary
with (security_invoker = on) as
select
  b.id,
  b.profile_id,
  b.leave_type_id,
  lt.code  as leave_code,
  lt.name  as leave_name,
  lt.color as leave_color,
  lt.deducts_balance,
  lt.accrues,
  lt.cycle_months,
  lt.min_service_months,
  b.year,
  w.cycle_start,
  w.cycle_end,
  -- Sick leave is additionally throttled during the first 6 months of service.
  case when lt.code = 'sick'
       then public.sick_entitlement(p.employment_start_date, b.entitled_days)
       else b.entitled_days
  end as entitled_days,
  b.reserved_days,
  -- Has the employee served long enough to use this type at all?
  (current_date >= (p.employment_start_date
                    + make_interval(months => lt.min_service_months))::date)
    as service_met,
  public.accrued_days(
    case when lt.code = 'sick'
         then public.sick_entitlement(p.employment_start_date, b.entitled_days)
         else b.entitled_days end,
    lt.accrues, p.employment_start_date, b.year) as accrued_days,
  coalesce(sum(r.days) filter (where r.status = 'approved'), 0) as used_days,
  coalesce(sum(r.days) filter (where r.status = 'pending'),  0) as pending_days,
  least(
    public.accrued_days(
      case when lt.code = 'sick'
           then public.sick_entitlement(p.employment_start_date, b.entitled_days)
           else b.entitled_days end,
      lt.accrues, p.employment_start_date, b.year),
    (case when lt.code = 'sick'
          then public.sick_entitlement(p.employment_start_date, b.entitled_days)
          else b.entitled_days end) - b.reserved_days
  ) - coalesce(sum(r.days) filter (where r.status = 'approved'), 0) as available_days
from public.leave_balances b
join public.leave_types lt on lt.id = b.leave_type_id
join public.profiles p on p.id = b.profile_id
cross join lateral (
  select
    public.cycle_start(p.employment_start_date, lt.cycle_months) as cycle_start,
    public.cycle_end(p.employment_start_date, lt.cycle_months)   as cycle_end
) w
left join public.leave_requests r
  on  r.profile_id    = b.profile_id
  and r.leave_type_id = b.leave_type_id
  -- 12-month types stay year-scoped; 36-month types span the whole cycle.
  and (
    case when lt.cycle_months = 12
         then extract(year from r.start_date)::int = b.year
         else r.start_date between w.cycle_start and w.cycle_end
    end
  )
group by b.id, lt.code, lt.name, lt.color, lt.deducts_balance, lt.accrues,
         lt.cycle_months, lt.min_service_months, p.employment_start_date,
         w.cycle_start, w.cycle_end;

-- ---------- Stop re-granting sick leave every January ----------
-- Sick balances are provisioned once per cycle, not once per year: the row for
-- the year in which the cycle started is the canonical one.
create or replace function public.provision_balances(p_profile uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_start date;
begin
  select employment_start_date into v_start from public.profiles where id = p_profile;
  if v_start is null then v_start := make_date(p_year, 1, 1); end if;

  insert into public.leave_balances (profile_id, leave_type_id, year, entitled_days, reserved_days)
  select
    p_profile,
    lt.id,
    case when lt.cycle_months = 12
         then p_year
         -- anchor a 36-month type to the year its current cycle began
         else extract(year from public.cycle_start(v_start, lt.cycle_months))::int
    end,
    coalesce(lt.default_days, 0),
    lt.default_reserved
  from public.leave_types lt
  on conflict (profile_id, leave_type_id, year) do nothing;
end $$;
