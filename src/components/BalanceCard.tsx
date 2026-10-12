import type { BalanceSummary } from "@/lib/types";
import { formatDate, leaveAccent } from "@/lib/leave";

export default function BalanceCard({ b }: { b: BalanceSummary }) {
  const total = Number(b.entitled_days);
  const available = Number(b.available_days);
  const used = Number(b.used_days);
  const pending = Number(b.pending_days);
  const reserved = Number(b.reserved_days);

  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

  const pct =
    total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0;

  const locked = b.service_met === false;
  // A locked type still has an entitlement, but showing it in full colour
  // reads as "available now", which it isn't.
  const accent = locked ? "#7a7a7a" : leaveAccent(b.leave_code, b.leave_color);
  // Pastel wash of the leave colour; text stays ink so it clears AA on any tint.
  const tint = {
    backgroundColor: `color-mix(in srgb, ${accent} ${locked ? 6 : 13}%, white)`,
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
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700">
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
        ? `Refills ${formatDate(b.cycle_end)}`
        : b.accrues
          ? `${fmt(Number(b.accrued_days))} of ${total} earned${
              used + pending > Number(b.accrued_days)
                ? ` · ${fmt(used + pending - Number(b.accrued_days))} borrowed ahead`
                : ""
            } · leave year ends ${formatDate(b.cycle_end)}`
          : null;

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
        {!b.deducts_balance ? (
          <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700">
            Free
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold leading-none text-ink-900">
          {b.deducts_balance ? fmt(available) : total}
        </span>
        <span className="text-sm text-ink-700">/ {total}</span>
      </div>

      {meta ? <p className="mt-1.5 text-xs text-ink-700">{meta}</p> : null}

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-900/10">
        <div
          className="h-full rounded-full"
          style={{ width: locked ? "0%" : `${pct}%`, backgroundColor: accent }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-ink-900/10 pt-3 text-center text-xs">
        <div>
          <dt className="text-[11px] text-ink-700">Used</dt>
          <dd className="font-semibold text-ink-900">{used}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-700">Pending</dt>
          <dd className="font-semibold text-ink-900">{pending}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-700">Held</dt>
          <dd className="font-semibold text-ink-900">{reserved}</dd>
        </div>
      </dl>
    </div>
  );
}
