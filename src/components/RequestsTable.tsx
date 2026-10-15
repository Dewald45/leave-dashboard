import RequestList from "@/components/RequestList";
import StatusBadge from "@/components/StatusBadge";
import ThreadBadge from "@/components/ThreadBadge";
import { formatDate, formatDays, leaveAccent } from "@/lib/leave";
import { cancelRequest } from "@/app/(app)/actions";
import type { RequestWithRelations, ThreadStats } from "@/lib/types";

/** Same colour the balance cards use for this leave type. */
const typeColor = (r: RequestWithRelations) =>
  r.leave_types
    ? leaveAccent(r.leave_types.code, r.leave_types.color)
    : "#94a3b8";

export default function RequestsTable({
  rows,
  stats = {},
  showEmployee = false,
  allowCancel = false,
  emptyLabel = "No requests yet.",
}: {
  rows: RequestWithRelations[];
  /** Thread counts keyed by request id (see getThreadStats). */
  stats?: Record<string, ThreadStats>;
  showEmployee?: boolean;
  allowCancel?: boolean;
  emptyLabel?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-dashed border-sand-300 bg-white/60 p-8 text-center text-sm text-sand-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
    {/* Phones: a compact list — a six-column table doesn't fit. */}
    <RequestList
      rows={rows}
      stats={stats}
      showEmployee={showEmployee}
      allowCancel={allowCancel}
      className="rounded-3xl bg-white md:hidden"
    />

    <div className="hidden overflow-x-auto rounded-3xl bg-white md:block">
      <table className="min-w-full divide-y divide-sand-100 text-sm">
        <thead className="text-left text-xs font-medium text-sand-600">
          <tr>
            {showEmployee ? <th className="px-5 py-2.5 font-medium">Employee</th> : null}
            <th className="px-5 py-2.5 font-medium">Type</th>
            <th className="px-5 py-2.5 font-medium">Dates</th>
            <th className="px-5 py-2.5 font-medium">Days</th>
            <th className="px-5 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 font-medium">Note</th>
            <th className="px-5 py-2.5 font-medium">
              <span className="sr-only">Thread</span>
            </th>
            {allowCancel ? (
              <th className="px-5 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-sand-50/60">
              {showEmployee ? (
                <td className="px-5 py-2.5">
                  <div className="font-medium text-ink-900">
                    {r.profiles?.full_name ?? "—"}
                  </div>
                  <div className="text-xs text-sand-500">
                    {r.profiles?.department ?? ""}
                  </div>
                </td>
              ) : null}
              <td className="px-5 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: typeColor(r) }}
                  />
                  {r.leave_types?.name ?? "—"}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-2.5 text-sand-600">
                {r.start_date === r.end_date
                  ? formatDate(r.start_date)
                  : `${formatDate(r.start_date)} → ${formatDate(r.end_date)}`}
              </td>
              <td className="px-5 py-2.5 font-medium tabular-nums text-ink-900">
                {formatDays(r.days, r.half_day)}
              </td>
              <td className="px-5 py-2.5">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-5 py-2.5 max-w-[16rem] text-sand-600">
                {r.reason ? (
                  <span title={r.reason} className="line-clamp-2">
                    {r.reason}
                  </span>
                ) : (
                  <span className="text-sand-300">—</span>
                )}
                {r.decision_note ? (
                  <div className="mt-0.5 text-xs italic text-sand-500">
                    Manager: {r.decision_note}
                  </div>
                ) : null}
              </td>
              <td className="px-5 py-2.5">
                <ThreadBadge requestId={r.id} stats={stats[r.id]} />
              </td>
              {allowCancel ? (
                <td className="px-5 py-2.5 text-right">
                  {r.status === "pending" || r.status === "approved" ? (
                    <form action={cancelRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-sand-200 px-3 py-1 text-xs text-sand-600 hover:bg-rose-50 hover:text-rose-600"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
