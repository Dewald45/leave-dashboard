import type { BalanceSummary } from "@/lib/types";

export default function BalanceCard({ b }: { b: BalanceSummary }) {
  const total = Number(b.entitled_days);
  const available = Number(b.available_days);
  const used = Number(b.used_days);
  const pending = Number(b.pending_days);
  const reserved = Number(b.reserved_days);

  const pct =
    total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: b.leave_color }}
          />
          <h3 className="text-sm font-semibold text-slate-800">
            {b.leave_name}
          </h3>
        </div>
        {!b.deducts_balance ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Company paid
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-slate-900">
          {b.deducts_balance ? available : total}
        </span>
        <span className="text-sm text-slate-400">
          / {total} days {b.deducts_balance ? "available" : ""}
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: b.leave_color }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <dt className="text-slate-400">Used</dt>
          <dd className="font-semibold text-slate-700">{used}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Pending</dt>
          <dd className="font-semibold text-slate-700">{pending}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Reserved</dt>
          <dd className="font-semibold text-slate-700">{reserved}</dd>
        </div>
      </dl>
    </div>
  );
}
