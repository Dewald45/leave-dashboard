import ApplyForm from "./ApplyForm";
import { requireProfile } from "@/lib/auth";
import { ensureCurrentBalances, getBalances, getLeaveTypes } from "@/lib/data";
import type { LeaveType } from "@/lib/types";
import PageHeader from "@/components/PageHeader";

export default async function ApplyPage() {
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

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Plot your escape">
        We count the working days for you — weekends and South African public
        holidays don&apos;t count against you, so no need to do sneaky maths.
        Your manager gets the final word.
      </PageHeader>
      <div className="mt-6">
        <ApplyForm types={eligibleTypes} balances={balanceRows} />
      </div>
    </div>
  );
}
