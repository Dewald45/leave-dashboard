import ApplyForm from "./ApplyForm";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_YEAR } from "@/lib/queries";
import type { BalanceSummary, LeaveType } from "@/lib/types";
import PageHeader from "@/components/PageHeader";

export default async function ApplyPage() {
  const { userId } = await requireProfile();
  const supabase = createClient();

  await supabase.rpc("ensure_my_year_balances");

  const [{ data: types }, { data: balances }] = await Promise.all([
    supabase.from("leave_types").select("*").order("sort_order"),
    supabase
      .from("balance_summary")
      .select("*")
      .eq("profile_id", userId)
      .eq("year", CURRENT_YEAR),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Plot your escape">
        We count the working days for you — weekends and South African public
        holidays don&apos;t count against you, so no need to do sneaky maths.
        Your manager gets the final word.
      </PageHeader>
      <div className="mt-6">
        <ApplyForm
          types={(types ?? []) as LeaveType[]}
          balances={(balances ?? []) as BalanceSummary[]}
        />
      </div>
    </div>
  );
}
