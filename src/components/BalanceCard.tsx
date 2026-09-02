import type { BalanceSummary } from "@/lib/types";
import { formatDate } from "@/lib/leave";

export default function BalanceCard({ b }: { b: BalanceSummary }) {
  const total = Number(b.entitled_days);
  const available = Number(b.available_days);
  const used = Number(b.used_days);
  const pending = Number(b.pending_days);
  const reserved = Number(b.reserved_days);
  const accrued = Number(b.accrued_days);

  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

  const pct =
    total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0;

  // Sick leave runs on a 36-month BCEA cycle, so "resets in January" would be
  // a lie. Say when it actually resets.
  // These columns arrive with migration 0003; until it is applied they are
  // undefined, so fall back to the old (year-based) presentation rather than
  // rendering "Locked until undefined months".
  const isLongCycle = Number(b.cycle_months ?? 12) > 12;

  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: b.leave_color }}
          />
          <h3 className="text-sm font-semibold text-white">{b.leave_name}</h3>
        </div>
        {!b.deducts_balance ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            On the house
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-white">
          {b.deducts_balance ? fmt(available) : total}
        </span>
        <span className="text-sm text-sand-500">
          / {total} days {b.deducts_balance ? "left" : ""}
        </span>
      </div>

      {b.service_met === false ? (
        <p className="mt-1 text-xs text-brand-400">
          Locked until you&apos;ve done {b.min_service_months} months. Rules are
          rules.
        </p>
      ) : b.accrues ? (
        <p className="mt-1 text-xs text-sand-500">
          Earned so far: {fmt(accrued)} of {total} — drip-fed at 1.25 days/month.
        </p>
      ) : isLongCycle && b.cycle_end ? (
        <p className="mt-1 text-xs text-sand-500">
          This pot refills {formatDate(b.cycle_end)}. Not January. Pace yourself.
        </p>
      ) : null}

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: b.leave_color }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <dt className="text-sand-600">Burned</dt>
          <dd className="font-semibold text-white">{used}</dd>
        </div>
        <div>
          <dt className="text-sand-600">In limbo</dt>
          <dd className="font-semibold text-white">{pending}</dd>
        </div>
        <div>
          <dt className="text-sand-600">Spoken for</dt>
          <dd className="font-semibold text-white">{reserved}</dd>
        </div>
      </dl>
    </div>
  );
}
