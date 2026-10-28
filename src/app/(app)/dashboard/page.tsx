import Link from "next/link";
import RequestList from "@/components/RequestList";
import YearStrip from "@/components/YearStrip";
import { requireProfile } from "@/lib/auth";
import {
  ensureCurrentBalances,
  getBalances,
  getMyRequests,
  getThreadStats,
} from "@/lib/data";
import { getHolidays } from "@/lib/holidays";
import { buildYearStrip, findNudge, type Nudge } from "@/lib/dashboard";
import { describeDuration, formatDate, formatDateRange, leaveAccent, todaySA } from "@/lib/leave";
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
    <svg viewBox="0 0 120 120" className="h-24 w-24 shrink-0 -rotate-90 short:h-20 short:w-20" aria-hidden="true">
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
    <section aria-label="Your other leave" className="flex flex-col justify-center gap-2.5 rounded-3xl bg-white p-5 short:p-4">
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
  const next = nextUp(allReqs, today);
  const expiring = bs.filter((b) => carryExpiringSoon(b, today));
  const nudge = findNudge(today, allReqs, holidays, profile.employment_start_date ?? null);
  const stats = await getThreadStats(reqs.map((r) => r.id), userId);

  const annual = bs.find((b) => b.leave_code === "annual");
  const closure = bs.find((b) => b.bookable === false);
  const others = bs.filter((b) => b.bookable !== false && b !== annual);
  const strip = annual ? buildYearStrip(annual.cycle_start, annual.cycle_end, today, allReqs, holidays) : null;

  const gifted = Number(closure?.entitled_days ?? 0);
  const held = Number(annual?.reserved_days ?? 0);
  const total = Number(annual?.full_entitled_days ?? annual?.entitled_days ?? 0);
  const available = annual ? Number(annual.available_days) : 0;
  const pending = annual ? Number(annual.pending_days) : 0;
  const left = available - pending; // what's left once pending requests are approved
  const negative = left < 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  const pendingPct = total > 0 ? Math.max(0, Math.min(100 - pct, (Math.min(pending, Math.max(available, 0)) / total) * 100)) : 0;
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
          <p className="mt-1 text-sm text-sand-600">Everything you&apos;re owed. No judgement. Some judgement.</p>
        </div>
        <Link
          href="/apply"
          className="inline-flex min-h-[44px] items-center rounded-full bg-brand-500 px-6 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          Plot an escape →
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
      <div className="grid gap-4 short:gap-3 md:grid-cols-2 xl:grid-cols-3">
        {annual ? (
          <section aria-label="Annual leave" className="flex items-center gap-5 rounded-3xl bg-ink-900 p-5 short:p-4">
            <div className="relative">
              <Ring pct={pct} pendingPct={pendingPct} color={accent} />
              <span
                className={`absolute inset-0 flex items-center justify-center text-xl font-bold ${
                  negative ? "text-rose-300" : "text-white"
                }`}
              >
                {fmt(left)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-sand-400">{negative ? "Annual leave: you're over" : "Annual leave left"}</p>
              <p className={`mt-0.5 text-3xl font-bold leading-tight ${negative ? "text-rose-300" : "text-white"}`}>
                {fmt(left)} <span className="text-base font-medium text-sand-400">of {fmt(total)}</span>
              </p>
              {negative ? (
                <p className="mt-1.5 inline-flex rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200">
                  {fmt(-left)} {Math.abs(left) === 1 ? "day" : "days"} into next year&apos;s leave
                </p>
              ) : pending > 0 ? (
                <p className="mt-1 text-xs text-sand-400">
                  {fmt(available)} now · {fmt(pending)} pending
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <NextUp req={next} today={today} />

        {others.length ? <OtherLeave balances={others} /> : null}
      </div>

      {strip && annual ? <YearStrip weeks={strip} cycleStart={annual.cycle_start} cycleEnd={annual.cycle_end} /> : null}

      <div className="grid gap-4 short:gap-3 lg:grid-cols-2">
        {closure || held ? (
          closureSeason ? (
            <section aria-labelledby="closure-h" className="rounded-3xl bg-white p-5 short:p-4">
              <h2 id="closure-h" className="text-base font-semibold text-ink-900">
                Year-end closure: {fmt(gifted + held)} working days
              </h2>
              <p className="mt-1 text-sm text-ink-800">Everyone&apos;s off. You don&apos;t need to apply.</p>
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
                The office closes for {fmt(gifted + held)} working days over December. {fmt(gifted)} are a gift
                from the company; {fmt(held)} are set aside from your annual leave at the start of your leave
                year, so you can&apos;t book them for anything else.
              </p>
            </details>
          )
        ) : null}

        <section className="flex flex-col rounded-3xl bg-white p-2">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h2 className="text-base font-semibold text-ink-900">Recent requests</h2>
            <Link href="/requests" className="text-sm font-medium text-brand-700 hover:underline">
              All →
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
  );
}

/** The soonest approved or pending leave that hasn't finished yet. */
function nextUp(rows: RequestWithRelations[], today: string) {
  return (
    rows
      .filter((r) => (r.status === "approved" || r.status === "pending") && r.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null
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

function NextUp({ req, today }: { req: RequestWithRelations | null; today: string }) {
  if (!req) {
    return (
      <Link href="/apply" className="block rounded-3xl bg-white p-5 transition hover:bg-sand-50 short:p-4">
        <p className="text-sm text-sand-600">Next up</p>
        <p className="mt-1 text-base font-semibold text-ink-900">Nothing booked yet. Plot an escape →</p>
      </Link>
    );
  }
  const accent = req.leave_types ? leaveAccent(req.leave_types.code, req.leave_types.color) : "#94a3b8";
  const inDays = Math.round((Date.parse(req.start_date) - Date.parse(today)) / 86_400_000);
  const when = inDays <= 0 ? "on now" : inDays === 1 ? "tomorrow" : `in ${inDays} days`;
  return (
    <Link href={`/requests/${req.id}`} className="block rounded-3xl bg-white p-5 transition hover:bg-sand-50 short:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-sand-600">Next up</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            req.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-brand-50 text-brand-800"
          }`}
        >
          {req.status === "approved" ? "Approved" : "Pending"}
        </span>
      </div>
      <p className="mt-1 text-xl font-bold text-ink-900">{formatDateRange(req.start_date, req.end_date)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-sand-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        {req.leave_types?.name ?? "Leave"} · {describeDuration(Number(req.days), req.half_day)} · {when}
      </p>
    </Link>
  );
}
