import ApplyForm from "./ApplyForm";
import { requireProfile } from "@/lib/auth";
import { ensureCurrentBalances, getBalances, getLeaveTypes } from "@/lib/data";
import type { LeaveType } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import { leaveAccent } from "@/lib/leave";

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const { userId } = await requireProfile();

  await ensureCurrentBalances(userId);

  const [types, balanceRows] = await Promise.all([
    getLeaveTypes(),
    getBalances(userId),
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

  const num = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

  return (
    <div className="space-y-6">
      <PageHeader title="Plot your escape">
        We count the working days for you — weekends and South African public
        holidays don&apos;t count against you, so no need to do sneaky maths.
        Your manager gets the final word.
      </PageHeader>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ApplyForm
            key={initialTypeId}
            types={eligibleTypes}
            balances={balanceRows}
            initialTypeId={initialTypeId}
          />
        </div>

        <aside className="rounded-3xl bg-white p-6">
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
        </aside>
      </div>
    </div>
  );
}
