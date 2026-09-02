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
      <div className="rounded-2xl bg-ink-900 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Right then, {profile.full_name.split(" ")[0]}.
            </h1>
            <p className="mt-1 text-sm text-sand-500">
              Everything you&apos;re owed in {CURRENT_YEAR}, and everything
              you&apos;ve already spent. No judgement. Some judgement.
            </p>
          </div>
          <Link
            href="/apply"
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
          >
            Plot an escape →
          </Link>
        </div>
      </div>

      {/* Year-end closure notice */}
      <div className="rounded-2xl border border-sand-200 bg-white p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-white">
            ❄
          </span>
          <div className="text-sm text-ink-800">
            <p className="font-semibold text-ink-900">
              The December shutdown, explained
            </p>
            <p className="mt-0.5 text-sand-600">
              The office goes dark for <strong>10 working days</strong>. Five
              come out of your annual leave whether you like it or not (already
              reserved — don&apos;t go spending them). The other five are on
              the company, which is as close to free money as this page gets.
              Annual leave trickles in at{" "}
              <strong>1.25 days a month</strong>, because the BCEA says so, and
              wipes clean every 1 January.
              {annual
                ? ` You've banked ${Number(annual.accrued_days)} of ${annual.entitled_days}, with ${Number(annual.available_days)} actually bookable today.`
                : ""}
            </p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sand-600">
          What you&apos;re working with
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
            Recently attempted
          </h2>
          <Link
            href="/requests"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            See the full history →
          </Link>
        </div>
        <RequestsTable
          rows={reqs}
          allowCancel
          emptyLabel="Nothing here. Either you love this place or you're due a break."
        />
      </section>
    </div>
  );
}
