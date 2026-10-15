import DecisionForm from "@/components/DecisionForm";
import ThreadBadge from "@/components/ThreadBadge";
import { describeDuration, formatDate, leaveAccent } from "@/lib/leave";
import type { RequestWithRelations, ThreadStats } from "@/lib/types";

/** Same colour the balance cards use for this leave type. */
const typeColor = (r: RequestWithRelations) =>
  r.leave_types
    ? leaveAccent(r.leave_types.code, r.leave_types.color)
    : "#94a3b8";

export default function ApprovalCard({
  r,
  stats,
}: {
  r: RequestWithRelations;
  stats?: ThreadStats;
}) {
  const sameDay = r.start_date === r.end_date;
  const isSick = r.leave_types?.code === "sick";
  return (
    <div className="rounded-3xl bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: typeColor(r) }}
            />
            <span className="font-semibold text-ink-900">
              {r.profiles?.full_name ?? "—"}
            </span>
            <span className="text-xs text-sand-500">
              {r.profiles?.department ?? ""}
            </span>
          </div>
          <p className="mt-1 text-sm text-sand-600">
            {r.leave_types?.name} · {formatDate(r.start_date)}
            {sameDay ? "" : <> → {formatDate(r.end_date)}</>}{" "}
            <span className="font-medium text-ink-900">
              ({describeDuration(r.days, r.half_day)})
            </span>
          </p>
          {r.reason ? (
            <p className="mt-2 rounded-xl bg-sand-50 px-3 py-2 text-sm text-sand-600">
              “{r.reason}”
            </p>
          ) : null}
          {isSick && r.days > 2 && !stats?.attachments ? (
            <p className="mt-2 text-xs font-medium text-brand-700">No medical certificate attached yet.</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-sand-500">
            Applied {formatDate(r.created_at.slice(0, 10))}
          </span>
          <ThreadBadge requestId={r.id} stats={stats} />
        </div>
      </div>

      <div className="mt-4">
        <DecisionForm requestId={r.id} />
      </div>
    </div>
  );
}
