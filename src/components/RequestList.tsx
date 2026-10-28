import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import ThreadBadge from "@/components/ThreadBadge";
import { canCancel, describeDuration, formatDateRange, leaveAccent } from "@/lib/leave";
import { cancelRequest } from "@/app/(app)/actions";
import type { RequestWithRelations, ThreadStats } from "@/lib/types";

/**
 * Requests as a compact list: a calendar chip for the start date, what and
 * when, then status. Used on phones everywhere and on the dashboard at any size.
 */
export default function RequestList({
  rows,
  stats = {},
  showEmployee = false,
  allowCancel = false,
  className = "",
}: {
  rows: RequestWithRelations[];
  /** Thread counts keyed by request id (see getThreadStats). */
  stats?: Record<string, ThreadStats>;
  showEmployee?: boolean;
  allowCancel?: boolean;
  className?: string;
}) {
  return (
    <ul className={`divide-y divide-sand-100 ${className}`}>
      {rows.map((r) => {
        // Same colour the balance cards use for this leave type.
        const color = r.leave_types
          ? leaveAccent(r.leave_types.code, r.leave_types.color)
          : "#94a3b8";
        const start = new Date(r.start_date + "T00:00:00Z");
        const typeName = r.leave_types?.name ?? "Leave";
        const when = `${formatDateRange(r.start_date, r.end_date)} · ${
          r.half_day ? describeDuration(r.days, r.half_day) : `${r.days} ${r.days === 1 ? "day" : "days"}`
        }`;

        return (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl leading-none"
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 14%, white)`,
              }}
            >
              <span className="text-sm font-bold text-ink-900">
                {start.getUTCDate()}
              </span>
              <span className="mt-0.5 text-[11px] font-semibold uppercase text-ink-700">
                {start.toLocaleDateString("en-ZA", {
                  month: "short",
                  timeZone: "UTC",
                })}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <Link
                href={`/requests/${r.id}`}
                className="block truncate text-sm font-semibold text-ink-900 hover:underline"
              >
                {showEmployee ? (r.profiles?.full_name ?? "—") : typeName}
              </Link>
              <div className="text-xs text-sand-600">
                {showEmployee ? `${typeName} · ${when}` : when}
              </div>
              {r.decision_note ? (
                <div className="truncate text-xs italic text-sand-600">
                  Manager: {r.decision_note}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={r.status} />
              <ThreadBadge requestId={r.id} stats={stats[r.id]} compact />
              {allowCancel && canCancel(r) ? (
                <form action={cancelRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    aria-label={`Cancel ${typeName} request, ${when}`}
                    title="Cancel this request"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-sand-200 text-sand-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 sm:w-auto sm:px-3"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 sm:hidden"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                    <span className="hidden text-xs font-medium sm:inline">
                      Cancel
                    </span>
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
