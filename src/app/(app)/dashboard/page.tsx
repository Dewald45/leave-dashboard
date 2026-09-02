import Link from "next/link";
import BalanceCard from "@/components/BalanceCard";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_SELECT, CURRENT_YEAR } from "@/lib/queries";
import type { BalanceSummary, RequestWithRelations } from "@/lib/types";

export default async function DashboardPage() {
  const { profile, userId } = await requireProfile();
  const supabase = createClient();

  // Ensure the current year's balances exist (annual reset / new-year rollover).
  await supabase.rpc("ensure_my_year_balances");

  const [{ data: balances }, { data: requests }, { data: pendingForMe }] =
    await Promise.all([
      supabase
        .from("balance_summary")
        .select("*")
        .eq("profile_id", userId)
        .eq("year", CURRENT_YEAR)
        .order("leave_type_id"),
      supabase
        .from("leave_requests")
        .select(REQUEST_SELECT)
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      profile.role === "manager" || profile.role === "admin"
        ? supabase
            .from("leave_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
        : Promise.resolve({ data: null, count: 0 } as any),
    ]);

  const bs = (balances ?? []) as BalanceSummary[];
  const reqs = (requests ?? []) as unknown as RequestWithRelations[];

  const annual = bs.find((b) => b.leave_code === "annual");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">
            Welcome, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="text-sm text-sand-600">
            Your {CURRENT_YEAR} leave balances and recent activity.
          </p>
        </div>
        <Link
          href="/apply"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-ink-800"
        >
          + Apply for leave
        </Link>
      </div>

      {/* Year-end closure notice */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white">
            ❄
          </span>
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Year-end closure</p>
            <p className="mt-0.5 text-emerald-800/90">
              The company closes for <strong>10 working days</strong> over the
              festive season: <strong>5 days</strong> are deducted from your
              annual leave (reserved on your Annual Leave balance) and{" "}
              <strong>5 days</strong> are company-paid and don&apos;t reduce
              your balance. Annual leave <strong>accrues at 1.25 days/month</strong>{" "}
              (BCEA) and resets every 1 January.
              {annual
                ? ` You've accrued ${Number(annual.accrued_days)} of ${annual.entitled_days} days so far, with ${Number(annual.available_days)} available to book now.`
                : ""}
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sand-600">
          Leave balances
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bs.map((b) => (
            <BalanceCard key={b.id} b={b} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sand-600">
            Recent requests
          </h2>
          <Link
            href="/requests"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            View all →
          </Link>
        </div>
        <RequestsTable
          rows={reqs}
          allowCancel
          emptyLabel="You haven't applied for any leave yet."
        />
      </section>
    </div>
  );
}
