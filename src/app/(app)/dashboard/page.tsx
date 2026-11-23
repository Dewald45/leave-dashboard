import Link from "next/link";
import Icon from "@/components/Icon";
import RequestList from "@/components/RequestList";
import LeaveCalendar from "@/components/LeaveCalendar";
import { requireProfile } from "@/lib/auth";
import {
  ensureCurrentBalances,
  getBalances,
  getMyRequests,
  getThreadStats,
} from "@/lib/data";
import { getHolidays } from "@/lib/holidays";
import { buildCalendar, earnedPosition, findNudge, type Nudge } from "@/lib/dashboard";
import { describeDuration, formatDate, formatDateRange, leaveAccent, todaySA, yearAllowance } from "@/lib/leave";
import type { BalanceSummary, RequestWithRelations } from "@/lib/types";

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

/** Ring showing how much of the allowance is left. */
function Ring({ pct, pendingPct = 0, color }: { pct: number; pendingPct?: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const solid = (c * pct) / 100;
  const pending = (c * pendingPct) / 100;
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 -rotate-90 short:h-24 short:w-24" aria-hidden="true">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${solid} ${c}`}
      />
      {pending > 0 ? (
        // Days held by pending requests: same colour, faded.
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity="0.45"
          strokeWidth="10"
          strokeDasharray={`${pending} ${c}`}
          strokeDashoffset={-solid}
        />
      ) : null}
    </svg>
  );
}

/** One line per other leave type: what's left, or why it isn't available yet. */
function OtherLeave({ balances }: { balances: BalanceSummary[] }) {
  return (
    <section aria-label="Your other leave" className="flex h-full flex-col justify-center gap-2.5 rounded-3xl bg-white p-5 short:p-4">
      {balances.map((b) => {
        const locked = b.service_met === false;
        const left = Number(b.available_days) - Number(b.pending_days);
        const negative = b.deducts_balance && left < 0;
        const accent = locked ? "#7a7a7a" : leaveAccent(b.leave_code, b.leave_color);
        return (
          <div key={b.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink-800">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
              <span className="truncate">{b.leave_name.replace(/ leave$/i, "")}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {locked ? (
                <span className="text-sand-600">after {b.min_service_months} months</span>
              ) : (
                <>
                  <strong className={negative ? "text-rose-600" : "text-ink-900"}>
                    {fmt(b.deducts_balance ? left : Number(b.entitled_days))}
                  </strong>{" "}
                  <span className="text-sand-600">
                    of {fmt(Number(b.full_entitled_days ?? b.entitled_days))}
                  </span>
                </>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}

export default async function DashboardPage() {
  const { profile, userId } = await requireProfile();

  // Ensure balances exist for the cycles in progress (they roll over on the
  // employee's own start-date anniversary).
  await ensureCurrentBalances(userId);

  const [bs, allReqs, holidays] = await Promise.all([
    getBalances(userId),
    getMyRequests(userId),
    getHolidays(),
  ]);
  const reqs = allReqs.slice(0, 3);
  const today = todaySA();
  const expiring = bs.filter((b) => carryExpiringSoon(b, today));
  const nudge = findNudge(today, allReqs, holidays, profile.employment_start_date ?? null);
  const stats = await getThreadStats(reqs.map((r) => r.id), userId);

  const annual = bs.find((b) => b.leave_code === "annual");
  const closure = bs.find((b) => b.bookable === false);
  const others = bs.filter((b) => b.bookable !== false && b !== annual);
  const calendar = annual
    ? buildCalendar(annual.cycle_start, annual.cycle_end, today, allReqs, holidays)
    : null;

  const gifted = Number(closure?.entitled_days ?? 0);
  const held = Number(annual?.reserved_days ?? 0);
  const total = Number(annual?.full_entitled_days ?? annual?.entitled_days ?? 0);
  const available = annual ? Number(annual.available_days) : 0;
  const pending = annual ? Number(annual.pending_days) : 0;
  // What you've actually earned so far (1.25 lands on each 25th), less what's used or booked.
  const pos = annual
    ? earnedPosition({
        today,
        cycleStart: annual.cycle_start,
        cycleEnd: annual.cycle_end,
        entitled: Number(annual.entitled_days),
        available,
        pending,
        reserved: held,
      })
    : null;
  const year = annual ? yearAllowance(annual) : null;
  const left = pos ? pos.balance : 0;
  const negative = left < 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  const pendingPct = 0;
  const accent = negative ? "#f43f5e" : annual ? leaveAccent("annual", annual.leave_color) : "#22c55e";
  // The closure only matters as December approaches: full card Oct–Dec, one line otherwise.
  const closureSeason = Number(today.slice(5, 7)) >= 10;

  return (
    <div className="flex flex-col gap-4 short:gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Right then, {profile.full_name.split(" ")[0]}.
          </h1>
        </div>
        <Link
          href="/apply"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-500 px-6 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          Plot an escape
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>

      {nudge ? <NudgeBanner nudge={nudge} /> : null}

      {expiring.length ? (
        <div role="status" className="flex items-start gap-3 rounded-3xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            <span className="font-semibold">Use it or lose it: </span>
            {expiring
              .map((b) => `${fmt(Number(b.carry_left))} carried-over ${b.leave_name.toLowerCase()} days by ${formatDate(b.carry_expires!)}`)
              .join("; ")}
            .{" "}
            <Link href="/apply" className="font-semibold underline">
              Book them
            </Link>
          </p>
        </div>
      ) : null}

      {/* The numbers that matter */}
      <div className="grid items-start gap-4 short:gap-3 lg:grid-cols-2">
        <div className="grid gap-4 short:gap-3">
        {annual ? (
          <section aria-label="Annual leave" className="flex items-center gap-5 rounded-3xl bg-ink-900 p-5 short:p-4">
            <div className="relative">
              <Ring pct={pct} pendingPct={pendingPct} color={accent} />
              <span
                className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${
                  negative ? "text-rose-300" : "text-white"
                }`}
              >
                {fmt(left)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-sand-400">{negative ? "You are over" : "You have earned"}</p>
              <p className={`mt-0.5 text-5xl font-bold leading-none tracking-tight ${negative ? "text-rose-300" : "text-white"}`}>
                {fmt(Math.abs(left))} <span className="text-base font-medium text-sand-400">{Math.abs(left) === 1 ? "day" : "days"}</span>
              </p>
              {negative ? (
                <p className="mt-1.5 rounded-2xl bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200">
                  {pos?.backToZero
                    ? `Back to 0 on ${formatDate(pos.backToZero)}`
                    : "Comes off next year's leave"}
                </p>
              ) : null}
              {pos?.nextDate ? (
                <p className="mt-1 text-xs text-sand-400">
                  +{fmt(pos.step)} on {formatDate(pos.nextDate)}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {year ? (
          <section aria-label="Leave used this year" className="flex flex-col justify-center rounded-3xl bg-ink-900 p-5 short:p-4">
            <p className="text-sm text-sand-400">You have used up</p>
            <p className="mt-1 text-5xl font-bold leading-none tracking-tight text-white">
              {fmt(year.used)} <span className="text-base font-medium text-sand-400">of {fmt(year.total)} days for the year</span>
            </p>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div className="bg-white" style={{ width: `${year.total > 0 ? Math.min(100, (year.used / year.total) * 100) : 0}%` }} />
              <div className="bg-white/40" style={{ width: `${year.total > 0 ? Math.min(100, (year.pending / year.total) * 100) : 0}%` }} />
            </div>
          </section>
        ) : null}

      {calendar && annual ? (
        <LeaveCalendar
          data={calendar}
          cycleStart={annual.cycle_start}
          cycleEnd={annual.cycle_end}
          today={today}
        />
      ) : null}

        </div>

        <div className="grid gap-4 short:gap-3">
          {others.length ? <OtherLeave balances={others} /> : null}
        {closure || held ? (
          closureSeason ? (
            <section aria-labelledby="closure-h" className="rounded-3xl bg-white p-5 short:p-4">
              <h2 id="closure-h" className="text-base font-semibold text-ink-900">
                Year-end closure: {fmt(gifted + held)} working days
              </h2>
              <p className="mt-1 text-sm text-ink-800">18 Dec – 6 Jan. No need to apply.</p>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <dt className="sr-only">Gifted</dt>
                  <dd className="text-xl font-bold text-emerald-800">+{fmt(gifted)} days</dd>
                  <dd className="text-xs text-emerald-800">Gift from the company</dd>
                </div>
                <div className="rounded-2xl bg-brand-50 p-3">
                  <dt className="sr-only">From your leave</dt>
                  <dd className="text-xl font-bold text-brand-800">−{fmt(held)} days</dd>
                  <dd className="text-xs text-brand-800">From your annual leave</dd>
                </div>
              </dl>
            </section>
          ) : (
            <details className="group rounded-3xl bg-white p-5 short:p-4">
              <summary className="flex min-h-[28px] cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong className="text-ink-900">Dec closure</strong>{" "}
                  <span className="text-sand-600">
                    · +{fmt(gifted)} gifted · −{fmt(held)} from your leave
                  </span>
                </span>
                <span className="font-semibold text-brand-700 group-open:hidden">Details</span>
              </summary>
              <p className="mt-2 text-sm text-ink-800">
                18 Dec – 6 Jan. No need to apply. {fmt(held)} of your 15 days are kept for it, so you can book {fmt(Number(annual?.full_entitled_days ?? 15) - held)}.
              </p>
            </details>
          )
        ) : null}

        <section className="flex flex-col rounded-3xl bg-white p-2">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h2 className="text-base font-semibold text-ink-900">Recent requests</h2>
            <Link
              href="/requests"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            >
              All
              <Icon name="arrow-right" className="h-3.5 w-3.5" />
            </Link>
          </div>
          {reqs.length ? (
            <RequestList rows={reqs} stats={stats} allowCancel />
          ) : (
            <p className="px-4 py-6 text-center text-sm text-sand-600">Nothing yet.</p>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}

/** Carried-over days that lapse within the next 60 days. */
function carryExpiringSoon(b: BalanceSummary, today: string) {
  if (!b.carry_expires || Number(b.carry_left) <= 0) return false;
  const days = (Date.parse(b.carry_expires) - Date.parse(today)) / 86_400_000;
  return days >= 0 && days <= 60;
}

function NudgeBanner({ nudge }: { nudge: Nudge }) {
  const weekday = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-ZA", { weekday: "short", timeZone: "UTC" });
  const days = nudge.cost === 1 ? weekday(nudge.start) : `${weekday(nudge.start)} and ${weekday(nudge.end)}`;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl bg-white p-4 px-5">
      <p className="min-w-[16rem] flex-1 text-sm text-ink-800">
        <strong className="text-ink-900">
          It&apos;s been {nudge.monthsSince} months since your last day off.
        </strong>{" "}
        {nudge.holiday.name} is on {weekday(nudge.holiday.holiday_date)} {formatDate(nudge.holiday.holiday_date)}:
        take {days} off for a {nudge.breakDays}-day break that costs {nudge.cost}{" "}
        {nudge.cost === 1 ? "day" : "days"}.
      </p>
      <Link
        href={`/apply?start=${nudge.start}&end=${nudge.end}`}
        className="inline-flex min-h-[44px] items-center rounded-full border border-sand-300 bg-white px-5 text-sm font-semibold text-ink-900 hover:bg-sand-50"
      >
        Book {formatDateRange(nudge.start, nudge.end)}
      </Link>
    </div>
  );
}
