import Link from "next/link";
import RequestList from "@/components/RequestList";
import { requireProfile } from "@/lib/auth";
import {
  ensureCurrentBalances,
  getBalances,
  getMyRequests,
  getThreadStats,
} from "@/lib/data";
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
        // Days held by pending requests: same colour, faded and dashed.
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

function MiniCard({ b }: { b: BalanceSummary }) {
  const locked = b.service_met === false;
  const full = Number(b.full_entitled_days ?? b.entitled_days);
  const left = Number(b.available_days) - Number(b.pending_days);
  const negative = b.deducts_balance && left < 0;
  const accent = locked ? "#7a7a7a" : leaveAccent(b.leave_code, b.leave_color);
  return (
    <div className="rounded-3xl bg-white p-5 short:p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-sand-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        {b.leave_name}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-3xl font-bold leading-none ${negative ? "text-rose-600" : "text-ink-900"}`}>
          {locked ? "–" : b.deducts_balance ? fmt(left) : fmt(Number(b.entitled_days))}
        </span>
        <span className="text-sm text-sand-600">
          {locked
            ? `unlocks after ${b.min_service_months} months`
            : negative
              ? `days over your ${fmt(full)}`
              : `of ${fmt(full)} days`}
        </span>
      </div>
      {!locked && b.carry_expires && Number(b.carry_left) > 0 ? (
        <p className="mt-2 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
          {fmt(Number(b.carry_left))} carried over, use by {formatDate(b.carry_expires)}
        </p>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  const { profile, userId } = await requireProfile();

  // Ensure balances exist for the cycles in progress (they roll over on the
  // employee's own start-date anniversary).
  await ensureCurrentBalances(userId);

  const [bs, allReqs] = await Promise.all([getBalances(userId), getMyRequests(userId)]);
  const reqs = allReqs.slice(0, 4);
  const today = todaySA();
  const next = nextUp(allReqs, today);
  const expiring = bs.filter((b) => carryExpiringSoon(b, today));
  const stats = await getThreadStats(reqs.map((r) => r.id), userId);

  const annual = bs.find((b) => b.leave_code === "annual");
  const closure = bs.find((b) => b.bookable === false);
  const others = bs.filter((b) => b.bookable !== false && b !== annual);

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

  return (
    // One screen on laptops (see ScreenPage); stacked and scrolling on phones.
    <div className="flex flex-col gap-4 [@media(min-width:1024px)_and_(min-height:640px)]:h-[calc(100vh-5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Right then, {profile.full_name.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-sm text-sand-600">
            Everything you&apos;re owed, and everything you&apos;ve already spent. No judgement. Some judgement.
          </p>
        </div>
        <Link
          href="/apply"
          className="inline-flex min-h-[44px] items-center rounded-full bg-brand-500 px-6 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          Plot an escape →
        </Link>
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-5 lg:grid-rows-[minmax(0,1fr)]">
        {/* Left: the number that matters, then the other balances */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {annual ? (
            <div className="flex items-center gap-6 rounded-3xl bg-ink-900 p-6 short:p-5">
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
                <p className="text-sm font-medium text-sand-400">
                  {negative ? "Annual leave: you're over" : "Annual leave left"}
                </p>
                <p className={`mt-1 text-3xl font-bold leading-tight ${negative ? "text-rose-300" : "text-white"}`}>
                  {fmt(left)} <span className="text-lg font-medium text-sand-400">of {fmt(total)} days</span>
                </p>
                {negative ? (
                  <p className="mt-2 inline-flex rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-200">
                    You&apos;re {fmt(-left)} {Math.abs(left) === 1 ? "day" : "days"} into next year&apos;s leave
                  </p>
                ) : pending > 0 ? (
                  <p className="mt-2 text-xs text-sand-400">
                    {fmt(available)} available now · {fmt(pending)} pending → {fmt(left)} once approved
                  </p>
                ) : null}
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-sand-400">
                  <div className="flex gap-1.5">
                    <dt>Used</dt>
                    <dd className="font-semibold text-white">{fmt(Number(annual.used_days))}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Pending</dt>
                    <dd className="font-semibold text-white">{fmt(Number(annual.pending_days))}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}

          {expiring.length ? (
            <div role="status" className="flex items-start gap-3 rounded-3xl bg-amber-50 p-4 text-sm text-amber-900">
              <span aria-hidden="true" className="mt-0.5">⏳</span>
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

          <section aria-label="Your other leave" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((b) => (
              <MiniCard key={b.id} b={b} />
            ))}
          </section>

          {/* Recent requests sit under the balances */}
          <section className="flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-3xl bg-white p-2 lg:min-h-0">
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <h2 className="text-base font-semibold text-ink-900">Recently attempted</h2>
              <Link href="/requests" className="text-sm font-medium text-brand-700 hover:underline">
                Full history →
              </Link>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {reqs.length ? (
                <RequestList rows={reqs} stats={stats} allowCancel />
              ) : (
                <p className="px-4 py-6 text-center text-sm text-sand-600">
                  Nothing here. Either you love this place or you&apos;re due a break.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4 self-start lg:col-span-2">
        <NextUp req={next} />

        {/* The December closure, in plain English */}
        <section className="rounded-3xl bg-white p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-xs text-white" aria-hidden="true">
              ❄
            </span>
            <h2 className="text-base font-semibold text-ink-900">Year-end closure</h2>
          </div>
          <p className="mt-3 text-sm text-ink-800">
            The office closes for {fmt(gifted + held)} working days over December. Everyone is off, and you
            don&apos;t apply for any of it.
          </p>
          <dl className="mt-3 grid gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3.5">
              <dt className="text-sm font-semibold text-emerald-800">+{fmt(gifted)} days: a gift from the company</dt>
              <dd className="mt-1 text-xs text-ink-700">Extra paid days off. They don&apos;t come out of your leave.</dd>
            </div>
            <div className="rounded-2xl bg-brand-50 p-3.5">
              <dt className="text-sm font-semibold text-brand-800">−{fmt(held)} days: taken from your annual leave</dt>
              <dd className="mt-1 text-xs text-ink-700">
                Set aside from the start of your leave year, so you can&apos;t book them for anything else.
              </dd>
            </div>
          </dl>
        </section>
        </div>
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

function NextUp({ req }: { req: RequestWithRelations | null }) {
  if (!req) {
    return (
      <Link href="/apply" className="block rounded-3xl bg-white p-5 transition hover:bg-sand-50">
        <p className="text-sm font-medium text-sand-600">Next up</p>
        <p className="mt-1 text-base font-semibold text-ink-900">Nothing booked yet. Plot an escape →</p>
      </Link>
    );
  }
  const accent = req.leave_types ? leaveAccent(req.leave_types.code, req.leave_types.color) : "#94a3b8";
  return (
    <Link href={`/requests/${req.id}`} className="block rounded-3xl bg-white p-5 transition hover:bg-sand-50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-sand-600">Next up</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            req.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
          }`}
        >
          {req.status === "approved" ? "Approved" : "Pending"}
        </span>
      </div>
      <p className="mt-1 text-lg font-bold text-ink-900">{formatDateRange(req.start_date, req.end_date)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-sand-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        {req.leave_types?.name ?? "Leave"} · {describeDuration(Number(req.days), req.half_day)}
      </p>
    </Link>
  );
}
