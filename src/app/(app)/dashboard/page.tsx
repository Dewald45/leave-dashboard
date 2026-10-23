import Link from "next/link";
import RequestList from "@/components/RequestList";
import { requireProfile } from "@/lib/auth";
import {
  ensureCurrentBalances,
  getBalances,
  getMyRequests,
  getThreadStats,
} from "@/lib/data";
import { formatDate, leaveAccent } from "@/lib/leave";
import type { BalanceSummary } from "@/lib/types";

const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

/** Ring showing how much of the allowance is left. */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
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
        strokeDasharray={`${(c * pct) / 100} ${c}`}
      />
    </svg>
  );
}

function MiniCard({ b }: { b: BalanceSummary }) {
  const locked = b.service_met === false;
  const full = Number(b.full_entitled_days ?? b.entitled_days);
  const left = Math.max(0, Number(b.available_days) - Number(b.pending_days));
  const accent = locked ? "#7a7a7a" : leaveAccent(b.leave_code, b.leave_color);
  return (
    <div className="rounded-3xl bg-white p-5 short:p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-sand-600">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
        {b.leave_name}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold leading-none text-ink-900">
          {locked ? "–" : b.deducts_balance ? fmt(left) : fmt(Number(b.entitled_days))}
        </span>
        <span className="text-sm text-sand-600">
          {locked ? `unlocks after ${b.min_service_months} months` : `of ${fmt(full)} days`}
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

  const [bs, reqs] = await Promise.all([getBalances(userId), getMyRequests(userId, 4)]);
  const stats = await getThreadStats(reqs.map((r) => r.id), userId);

  const annual = bs.find((b) => b.leave_code === "annual");
  const closure = bs.find((b) => b.bookable === false);
  const others = bs.filter((b) => b.bookable !== false && b !== annual);

  const gifted = Number(closure?.entitled_days ?? 0);
  const held = Number(annual?.reserved_days ?? 0);
  const total = Number(annual?.full_entitled_days ?? annual?.entitled_days ?? 0);
  const left = annual ? Math.max(0, Number(annual.available_days) - Number(annual.pending_days)) : 0;
  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0;
  const accent = annual ? leaveAccent("annual", annual.leave_color) : "#22c55e";

  return (
    // One screen on laptops (see ScreenPage); stacked and scrolling on phones.
    <div className="flex flex-col gap-4 [@media(min-width:1024px)_and_(min-height:640px)]:h-[calc(100vh-5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          Hi {profile.full_name.split(" ")[0]}
        </h1>
        <Link
          href="/apply"
          className="inline-flex min-h-[44px] items-center rounded-full bg-brand-500 px-6 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          Apply for leave →
        </Link>
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-5 lg:grid-rows-[minmax(0,1fr)]">
        {/* Left: the number that matters, then the other balances */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          {annual ? (
            <div className="flex items-center gap-6 rounded-3xl bg-ink-900 p-6 short:p-5">
              <div className="relative">
                <Ring pct={pct} color={accent} />
                <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">
                  {fmt(left)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-sand-400">Annual leave left</p>
                <p className="mt-1 text-3xl font-bold leading-tight text-white">
                  {fmt(left)} <span className="text-lg font-medium text-sand-400">of {fmt(total)} days</span>
                </p>
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

          <section aria-label="Your other leave" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((b) => (
              <MiniCard key={b.id} b={b} />
            ))}
          </section>

          {closure ? (
            <p className="rounded-3xl bg-white px-5 py-3.5 text-sm text-ink-800 short:py-3">
              <span className="mr-1.5" aria-hidden="true">❄</span>
              <strong className="font-semibold">December closure:</strong> {fmt(gifted + held)} days off for
              everyone. {fmt(gifted)} are a gift, {fmt(held)} come from your annual leave.
            </p>
          ) : null}
        </div>

        {/* Right: what happened lately */}
        <section className="flex min-h-[12rem] flex-col overflow-hidden rounded-3xl bg-white p-2 lg:col-span-2 lg:min-h-0">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h2 className="text-base font-semibold text-ink-900">Recent requests</h2>
            <Link href="/requests" className="text-sm font-medium text-brand-700 hover:underline">
              See all →
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {reqs.length ? (
              <RequestList rows={reqs} stats={stats} allowCancel />
            ) : (
              <p className="px-4 py-6 text-center text-sm text-sand-600">No requests yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
