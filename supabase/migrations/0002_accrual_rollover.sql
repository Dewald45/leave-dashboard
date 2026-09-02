-- ============================================================================
-- 0002 — Accrual + annual reset (1 January) + year rollover
--   * Annual leave accrues over the cycle at the BCEA rate (15 days / year,
--     i.e. 1.25 days per month) instead of being fully available up front.
--   * The leave cycle is the calendar year; balances reset every 1 January.
--   * New-year balances are provisioned by a lazy per-user RPC and a yearly
--     pg_cron job so managers see everyone.
-- ============================================================================

-- Which leave types accrue over the cycle (vs. granted in full).
alter table public.leave_types
  add column if not exists accrues boolean not null default false;

update public.leave_types set accrues = true  where code = 'annual';
update public.leave_types set accrues = false where code in ('sick', 'family', 'closure');

-- ---------- Accrual helper ----------
-- Days accrued so far this cycle: entitlement pro-rated by elapsed days from
-- the later of 1 Jan and the employment start date, to today (capped at year
-- end). Non-accruing types return the full entitlement.
create or replace function public.accrued_days(
  p_entitled numeric,
  p_accrues  boolean,
  p_start    date,
  p_year     int
) returns numeric
language sql stable as $$
  select case
    when not p_accrues then p_entitled
    else least(
      p_entitled,
      greatest(0, round(
        p_entitled
        -- days worked so far this cycle (from the later of 1 Jan / start date)
        * greatest(
            0,
            (least(current_date, make_date(p_year, 12, 31))
             - greatest(make_date(p_year, 1, 1), p_start) + 1)
          )::numeric
        -- ...over the full calendar year, so mid-year joiners are pro-rated
        / (make_date(p_year, 12, 31) - make_date(p_year, 1, 1) + 1)::numeric,
        2))
    )
  end
$$;

-- ---------- Accrual-aware balance summary ----------
-- available_days = min(accrued so far, entitlement − reserved) − approved used.
-- (Reserved = the 5 annual days earmarked for the year-end closure.)
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
  b.year,
  b.entitled_days,
  b.reserved_days,
  public.accrued_days(b.entitled_days, lt.accrues, p.employment_start_date, b.year)
    as accrued_days,
  coalesce(sum(r.days) filter (where r.status = 'approved'), 0) as used_days,
  coalesce(sum(r.days) filter (where r.status = 'pending'),  0) as pending_days,
  least(
    public.accrued_days(b.entitled_days, lt.accrues, p.employment_start_date, b.year),
    b.entitled_days - b.reserved_days
  ) - coalesce(sum(r.days) filter (where r.status = 'approved'), 0) as available_days
from public.leave_balances b
join public.leave_types lt on lt.id = b.leave_type_id
join public.profiles p on p.id = b.profile_id
left join public.leave_requests r
  on  r.profile_id = b.profile_id
  and r.leave_type_id = b.leave_type_id
  and extract(year from r.start_date)::int = b.year
group by b.id, lt.code, lt.name, lt.color, lt.deducts_balance, lt.accrues,
         p.employment_start_date;

-- ---------- Year rollover ----------
-- Provision the current-year balances for the calling user (lazy, idempotent).
create or replace function public.ensure_my_year_balances()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    perform public.provision_balances(auth.uid(), extract(year from current_date)::int);
  end if;
end $$;

grant execute on function public.ensure_my_year_balances() to authenticated;

-- Provision a given year's balances for every employee (used by the cron job).
create or replace function public.provision_all_balances(p_year int)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.provision_balances(r.id, p_year);
  end loop;
end $$;

-- Schedule the 1 January rollover (best-effort: skip if pg_cron unavailable).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('yearly-leave-rollover')
    from cron.job where jobname = 'yearly-leave-rollover';
  perform cron.schedule(
    'yearly-leave-rollover',
    '5 0 1 1 *',
    $cron$ select public.provision_all_balances(extract(year from now())::int) $cron$
  );
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
