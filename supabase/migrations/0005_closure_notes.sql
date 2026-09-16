-- ============================================================================
-- 0005 — Non-bookable leave + "speak to HR" notes
--
--   * Year-End Closure is granted to everyone automatically — nobody applies
--     for it. Mark it non-bookable so it is hidden from the Apply form and
--     rejected server-side, while still showing on the dashboard as "5 days".
--   * Parental / Maternity leave carry a note that the arrangement is not set
--     in stone — come speak to HR.
-- ============================================================================

-- 1. Bookable flag — can an employee actually apply for this type?
alter table public.leave_types
  add column if not exists bookable boolean not null default true;

update public.leave_types set bookable = false where code = 'closure';

-- 2. "Not set in stone — speak to HR" notes (keeps the house voice).
update public.leave_types
  set description = '10 days for new dads to meet the tiny human, panic quietly and lose all sleep. Take them within four months of the birth. None of this is set in stone — every family (and the law) is different, so come speak to HR before you bank on it.'
  where code = 'parental';

update public.leave_types
  set description = 'Four consecutive months to grow, deliver and keep a brand-new human alive — the hardest leave you will ever earn (roughly 90 working days). None of this is set in stone — come speak to HR and they will sort the details with you.'
  where code = 'maternity';

-- 3. Recreate balance_summary to expose lt.bookable (view can't add a column
--    in place). Body is identical to 0003 plus the new column.
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
  lt.bookable,
  lt.cycle_months,
  lt.min_service_months,
  b.year,
  w.cycle_start,
  w.cycle_end,
  case when lt.code = 'sick'
       then public.sick_entitlement(p.employment_start_date, b.entitled_days)
       else b.entitled_days
  end as entitled_days,
  b.reserved_days,
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
  and (
    case when lt.cycle_months = 12
         then extract(year from r.start_date)::int = b.year
         else r.start_date between w.cycle_start and w.cycle_end
    end
  )
group by b.id, lt.code, lt.name, lt.color, lt.deducts_balance, lt.accrues,
         lt.bookable, lt.cycle_months, lt.min_service_months,
         p.employment_start_date, w.cycle_start, w.cycle_end;
