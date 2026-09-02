import { decideRequest } from "@/app/(app)/actions";
import { formatDate } from "@/lib/leave";
import type { RequestWithRelations } from "@/lib/types";

export default function ApprovalCard({ r }: { r: RequestWithRelations }) {
  return (
    <div className="rounded-2xl border border-sand-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: r.leave_types?.color ?? "#94a3b8" }}
            />
            <span className="font-semibold text-ink-900">
              {r.profiles?.full_name ?? "—"}
            </span>
            <span className="text-xs text-sand-500">
              {r.profiles?.department ?? ""}
            </span>
          </div>
          <p className="mt-1 text-sm text-sand-600">
            {r.leave_types?.name} · {formatDate(r.start_date)} →{" "}
            {formatDate(r.end_date)}{" "}
            <span className="font-medium text-ink-900">
              ({r.days} day{r.days === 1 ? "" : "s"})
            </span>
          </p>
          {r.reason ? (
            <p className="mt-2 rounded-lg bg-sand-50 px-3 py-2 text-sm text-sand-600">
              “{r.reason}”
            </p>
          ) : null}
        </div>
        <span className="text-xs text-sand-500">
          Applied {formatDate(r.created_at.slice(0, 10))}
        </span>
      </div>

      <form action={decideRequest} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="id" value={r.id} />
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-sand-600">
            Note to employee (optional)
          </label>
          <input
            name="note"
            type="text"
            placeholder="Reason for decision…"
            className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            name="decision"
            value="rejected"
            className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            Reject
          </button>
          <button
            type="submit"
            name="decision"
            value="approved"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Approve
          </button>
        </div>
      </form>
    </div>
  );
}
