import ApplyForm from "./ApplyForm";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_YEAR } from "@/lib/queries";
import type { BalanceSummary, LeaveType } from "@/lib/types";

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
      <h1 className="text-2xl font-bold text-slate-900">Apply for leave</h1>
      <p className="mt-1 text-sm text-slate-500">
        Working days are calculated automatically, excluding weekends and South
        African public holidays. Your request goes to your line manager for
        approval.
      </p>
      <div className="mt-6">
        <ApplyForm
          types={(types ?? []) as LeaveType[]}
          balances={(balances ?? []) as BalanceSummary[]}
        />
      </div>
    </div>
  );
}
