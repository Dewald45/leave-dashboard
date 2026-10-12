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
      <div className="rounded-3xl border border-dashed border-sand-300 bg-white/60 p-8 text-center text-sm text-sand-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-3xl bg-white">
      <table className="min-w-full divide-y divide-sand-100 text-sm">
        <thead className="text-left text-xs font-medium text-sand-600">
          <tr>
            {showEmployee ? <th className="px-5 py-2.5 font-medium">Employee</th> : null}
            <th className="px-5 py-2.5 font-medium">Type</th>
            <th className="px-5 py-2.5 font-medium">Dates</th>
            <th className="px-5 py-2.5 font-medium">Days</th>
            <th className="px-5 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 font-medium">Note</th>
            {allowCancel ? <th className="px-5 py-2.5 font-medium"></th> : null}
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
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: r.leave_types?.color ?? "#94a3b8" }}
                  />
                  {r.leave_types?.name ?? "—"}
                </span>
              </td>
              <td className="px-5 py-2.5 text-sand-600">
                {formatDate(r.start_date)} → {formatDate(r.end_date)}
              </td>
              <td className="px-5 py-2.5 font-medium text-ink-900">{r.days}</td>
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
              {allowCancel ? (
                <td className="px-5 py-2.5 text-right">
                  {r.status === "pending" ? (
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
  );
}
