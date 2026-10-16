import ApplyForm from "./ApplyForm";
import { requireProfile } from "@/lib/auth";
import { ensureCurrentBalances, getBalances, getLeaveTypes } from "@/lib/data";
import { getHolidayDates } from "@/lib/holidays";
import type { LeaveType } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import { leaveAccent, earnedBy, formatDate } from "@/lib/leave";

/** A yyyy-mm-dd query value, or undefined. */
const isoDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: { type?: string; start?: string; end?: string };
}) {
  const { userId } = await requireProfile();

  await ensureCurrentBalances(userId);

  const [types, balanceRows, holidays] = await Promise.all([
    getLeaveTypes(),
    getBalances(userId),
    getHolidayDates(),
  ]);
  // Only offer leave the employee is actually entitled to (scopes parental vs
  // maternity to the right person) AND that can be applied for — auto-granted
  // leave like the year-end closure is shown on the dashboard, never booked.
  const eligibleTypeIds = new Set(balanceRows.map((b) => b.leave_type_id));
  const eligibleTypes = ((types ?? []) as LeaveType[]).filter(
    (t) => eligibleTypeIds.has(t.id) && t.bookable
  );

  // ?type=<id> preselects a leave type (the mobile + menu links here).
  const wanted = Number(searchParams?.type);
  const initialTypeId =
    eligibleTypes.find((t) => t.id === wanted)?.id ?? eligibleTypes[0]?.id ?? 0;

  // Month-end milestones for leave that builds up (annual), from now to the
  // end of the leave year — at most six rows, always ending on the last day.
  const annual = balanceRows.find((b) => b.accrues && b.deducts_balance && b.bookable !== false);
  const forecast: Array<{ date: string; label: string; earned: number; yearEnd: boolean }> = [];
  if (annual) {
    const entitled = Number(annual.entitled_days);
    const today = new Date().toISOString().slice(0, 10);
    const monthEnds: string[] = [];
    let d = new Date(today + "T00:00:00Z");
    while (monthEnds.length < 4) {
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      if (end >= annual.cycle_end) break;
      monthEnds.push(end);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    for (const date of [...monthEnds, annual.cycle_end]) {
      forecast.push({
        date,
        label: formatDate(date),
        yearEnd: date === annual.cycle_end,
        earned: earnedBy(date, annual.cycle_start, annual.cycle_end, entitled),
      });
    }
  }

  const num = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

  return (
    <ScreenPage>
      <PageHeader title="Plot your escape">
        We count the working days for you — weekends and South African public
        holidays don&apos;t count against you, so no need to do sneaky maths.
        Your manager gets the final word.
      </PageHeader>
      <div className="grid items-start gap-4 fit:min-h-0 fit:flex-1 lg:grid-cols-3 fit:grid-rows-[minmax(0,1fr)]">
        <div className="fit:max-h-full fit:overflow-y-auto fit:rounded-3xl lg:col-span-2">
          <ApplyForm
            key={initialTypeId}
            types={eligibleTypes}
            balances={balanceRows}
            holidays={holidays}
            initialTypeId={initialTypeId}
            initialStart={isoDate(searchParams?.start)}
            initialEnd={isoDate(searchParams?.end) ?? isoDate(searchParams?.start)}
          />
        </div>

        <aside className="rounded-3xl bg-white p-6 fit:max-h-full fit:overflow-y-auto">
          <h2 className="text-sm font-semibold text-ink-900">
            What you have left
          </h2>
          <ul className="mt-3 divide-y divide-sand-100">
            {balanceRows
              .filter((b) => b.bookable !== false && b.deducts_balance)
              .map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-ink-800">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: leaveAccent(b.leave_code, b.leave_color),
                      }}
                    />
                    <span className="truncate">{b.leave_name}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-ink-900">
                    {b.service_met === false
                      ? "Locked"
                      : `${num(
                          Math.max(
                            0,
                            Number(b.available_days) - Number(b.pending_days)
                          )
                        )} days`}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-xs text-sand-600">
            After requests still waiting on a manager.
          </p>

          {forecast.length ? (
            <>
              <h2 className="mt-6 text-sm font-semibold text-ink-900">
                How your annual leave builds
              </h2>
              <p className="mt-1 text-xs text-sand-600">
                Earned by the end of each month. You can book ahead of it.
              </p>
              <ul className="mt-2 divide-y divide-sand-100">
                {forecast.map((f) => (
                  <li key={f.date} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex items-center gap-2 whitespace-nowrap text-ink-800">
                      {f.label}
                      {f.yearEnd ? (
                        <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-medium text-sand-600">
                          Year end
                        </span>
                      ) : null}
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular-nums text-ink-900">
                      {num(f.earned)} days
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      </div>
    </ScreenPage>
  );
}
