import { formatDays } from "@/lib/leave";
import type { BalanceSummary } from "@/lib/types";

/**
 * What the requester has for this leave type, shown to whoever decides the
 * request. `days` is the pending request being decided — it is already counted
 * in `pending_days`, so "other pending" excludes it.
 */
export default function ApproverBalance({
  balance,
  days,
  name,
}: {
  balance: BalanceSummary | null;
  days: number;
  name?: string;
}) {
  if (!balance || !balance.deducts_balance) return null;
  const available = Number(balance.available_days);
  const otherPending = Math.max(0, Number(balance.pending_days) - Number(days));
  const after = available - Number(days);
  const afterAll = after - otherPending;
  const short = after < 0;

  const cell = (label: string, value: string, tone = "text-ink-900") => (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-sand-500">{label}</dt>
      <dd className={`text-sm font-semibold ${tone}`}>{value}</dd>
    </div>
  );

  return (
    <div className="mt-3 rounded-xl bg-sand-50 px-3 py-2">
      <p className="text-xs text-sand-600">
        {name ? `${name}'s ` : ""}
        {balance.leave_name} balance
      </p>
      <dl className="mt-1 grid grid-cols-3 gap-2">
        {cell("Available", formatDays(available))}
        {cell("Other pending", formatDays(otherPending))}
        {cell("If approved", formatDays(after), short ? "text-rose-700" : "text-ink-900")}
      </dl>
      {short ? (
        <p className="mt-1 text-xs font-medium text-rose-700">
          Approving this puts them {formatDays(-after)} day{-after === 1 ? "" : "s"} into negative leave.
        </p>
      ) : otherPending > 0 && afterAll < 0 ? (
        <p className="mt-1 text-xs font-medium text-amber-700">
          Enough for this one, but not for all their pending requests.
        </p>
      ) : null}
    </div>
  );
}
