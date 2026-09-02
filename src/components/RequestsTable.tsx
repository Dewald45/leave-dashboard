import StatusBadge from "@/components/StatusBadge";
import { formatDate } from "@/lib/leave";
import { cancelRequest } from "@/app/(app)/actions";
import type { RequestWithRelations } from "@/lib/types";

export default function RequestsTable({
  rows,
  showEmployee = false,
  allowCancel = false,
  emptyLabel = "No requests yet.",
}: {
  rows: RequestWithRelations[];
  showEmployee?: boolean;
  allowCancel?: boolean;
  emptyLabel?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-sand-200 bg-white p-8 text-center text-sm text-sand-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
      <table className="min-w-full divide-y divide-sand-100 text-sm">
        <thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-sand-600">
          <tr>
            {showEmployee ? <th className="px-4 py-3">Employee</th> : null}
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Dates</th>
            <th className="px-4 py-3">Days</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Note</th>
            {allowCancel ? <th className="px-4 py-3"></th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-sand-50/60">
              {showEmployee ? (
                <td className="px-4 py-3">
                  <div className="font-medium text-ink-900">
                    {r.profiles?.full_name ?? "—"}
                  </div>
                  <div className="text-xs text-sand-500">
                    {r.profiles?.department ?? ""}
                  </div>
                </td>
              ) : null}
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: r.leave_types?.color ?? "#94a3b8" }}
                  />
                  {r.leave_types?.name ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-sand-600">
                {formatDate(r.start_date)} → {formatDate(r.end_date)}
              </td>
              <td className="px-4 py-3 font-medium text-ink-900">{r.days}</td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-3 max-w-[16rem] text-sand-600">
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
              {allowCancel ? (
                <td className="px-4 py-3 text-right">
                  {r.status === "pending" ? (
                    <form action={cancelRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-sand-200 px-2.5 py-1 text-xs text-sand-600 hover:bg-rose-50 hover:text-rose-600"
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
  );
}
