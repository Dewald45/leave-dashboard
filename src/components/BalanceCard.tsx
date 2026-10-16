import type { BalanceSummary } from "@/lib/types";
import { formatDate, leaveAccent } from "@/lib/leave";

export default function BalanceCard({ b }: { b: BalanceSummary }) {
  const total = Number(b.entitled_days);
  // The cycle's full allocation — more than `total` only while sick leave is
  // still capped in the first six months.
  const fullTotal = Number(b.full_entitled_days ?? b.entitled_days);
  const capped = fullTotal > total;
  const available = Number(b.available_days);
  const used = Number(b.used_days);
  const pending = Number(b.pending_days);
  const reserved = Number(b.reserved_days);

  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

  const pct =
    fullTotal > 0
      ? Math.max(0, Math.min(100, ((available - pending) / fullTotal) * 100))
      : 0;

  const locked = b.service_met === false;
  // A locked type still has an entitlement, but showing it in full colour
  // reads as "available now", which it isn't.
  const accent = locked ? "#7a7a7a" : leaveAccent(b.leave_code, b.leave_color);
  // Pastel wash of the leave colour; text stays ink so it clears AA on any tint.
  // Locked types get a flat mid-grey so they stand apart from the page.
  const tint = {
    backgroundColor: locked
      ? "#dedede"
      : `color-mix(in srgb, ${accent} 13%, white)`,
  };

  // Auto-granted leave (e.g. the year-end closure): everyone gets it, nobody
  // applies for it. Show the headline number only — no used / pending / held.
  if (b.bookable === false) {
    return (
      <div className="rounded-3xl p-5" style={tint}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <h3 className="text-sm font-semibold text-ink-900">{b.leave_name}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-700">
            Automatic
          </span>
        </div>

        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-4xl font-bold leading-none text-ink-900">
            {fmt(total)}
          </span>
          <span className="text-sm text-ink-700">days</span>
        </div>

        <p className="mt-1.5 text-xs text-ink-700">
          Everyone gets these. No applying, no maths — just enjoy the shutdown.
        </p>
      </div>
    );
  }

  const isLongCycle = Number(b.cycle_months ?? 12) > 12;

  // One short line, not a paragraph.
  const meta =
    locked
      ? `Unlocks after ${b.min_service_months} months`
      : isLongCycle && b.cycle_end
        ? capped
          ? `${fmt(total)} of ${fmt(fullTotal)} unlocked so far (builds over your first 6 months)`
          : `${fmt(fullTotal)} days per ${Number(b.cycle_months) / 12}-year cycle · refills ${formatDate(b.cycle_end)}`
        : b.accrues
          ? `${fmt(Number(b.accrued_days))} of ${total} earned${
              used + pending > Number(b.accrued_days)
                ? ` · ${fmt(used + pending - Number(b.accrued_days))} borrowed ahead`
                : ""
            } · leave year ends ${formatDate(b.cycle_end)}`
          : null;

  // Carried-over days that will vanish if they aren't booked in time.
  const expiring =
    !locked && Number(b.carry_left) > 0 && b.carry_expires
      ? `${fmt(Number(b.carry_left))} carried over — use by ${formatDate(b.carry_expires)}`
      : null;

  return (
    <div className="flex h-full flex-col rounded-3xl p-5 short:p-4" style={tint}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <h3 className="text-sm font-semibold text-ink-900">{b.leave_name}</h3>
        </div>
        {!b.deducts_balance ? (
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-700">
            Free
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5 short:mt-2">
        <span className="text-4xl font-bold leading-none text-ink-900">
          {b.deducts_balance ? fmt(Math.max(0, available - pending)) : total}
        </span>
        <span className="text-sm text-ink-700">/ {fmt(fullTotal)}</span>
      </div>

      {meta ? <p className="mt-1.5 text-xs text-ink-700">{meta}</p> : null}
      {expiring ? (
        <p className="mt-2 inline-flex rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-brand-700">
          {expiring}
        </p>
      ) : null}

      <div className="mt-auto pt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-900/10">
        <div
          className="h-full rounded-full"
          style={{ width: locked ? "0%" : `${pct}%`, backgroundColor: accent }}
        />
      </div>

      <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
        <div className="flex gap-1">
          <dt>Used</dt>
          <dd className="font-semibold text-ink-900">{used}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Pending</dt>
          <dd className="font-semibold text-ink-900">{pending}</dd>
        </div>
        {reserved > 0 ? (
          <div className="flex gap-1">
            <dt>Held for closure</dt>
            <dd className="font-semibold text-ink-900">{reserved}</dd>
          </div>
        ) : null}
      </dl>
      </div>
    </div>
  );
}
