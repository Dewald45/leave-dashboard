import Link from "next/link";
import BalanceCard from "@/components/BalanceCard";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { CURRENT_YEAR } from "@/lib/queries";
import { ensureYearBalances, getBalances, getMyRequests } from "@/lib/data";

export default async function DashboardPage() {
  const { profile, userId } = await requireProfile();

  // Ensure the current year's balances exist (annual reset / new-year rollover).
  await ensureYearBalances(userId);

  const [bs, reqs] = await Promise.all([
    getBalances(userId, CURRENT_YEAR),
    getMyRequests(userId, 5),
  ]);

  const annual = bs.find((b) => b.leave_code === "annual");

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-ink-900 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Right then, {profile.full_name.split(" ")[0]}.
            </h1>
            <p className="mt-1.5 text-sm text-sand-400">
              Everything you&apos;re owed in {CURRENT_YEAR}, and everything
              you&apos;ve already spent. No judgement. Some judgement.
            </p>
          </div>
          <Link
            href="/apply"
            className="rounded-full bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            Plot an escape →
          </Link>
        </div>
      </div>

      {/* Year-end closure notice */}
      <div className="rounded-3xl bg-white p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs text-white">
            ❄
          </span>
          <h2 className="text-sm font-semibold text-ink-900">
            The December shutdown
          </h2>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="border-l-2 border-[#ff6440] pl-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-sand-600">
              5 days — yours
            </dt>
            <dd className="mt-1 text-sm text-ink-800">
              Deducted from annual leave. Already reserved, so don&apos;t go
              spending them.
            </dd>
          </div>
          <div className="border-l-2 border-[#22c55e] pl-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-sand-600">
              5 days — on us
            </dt>
            <dd className="mt-1 text-sm text-ink-800">
              Company-paid. As close to free money as this page gets.
            </dd>
          </div>
          <div className="border-l-2 border-sand-300 pl-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-sand-600">
              How it builds
            </dt>
            <dd className="mt-1 text-sm text-ink-800">
              1.25 days a month (BCEA), wiped clean every 1 January.
            </dd>
          </div>
        </dl>

        {annual ? (
          <p className="mt-4 border-t border-sand-200 pt-3 text-sm text-sand-600">
            You&apos;ve banked{" "}
            <strong className="text-ink-900">
              {Number(annual.accrued_days)} of {annual.entitled_days}
            </strong>
            , with{" "}
            <strong className="text-ink-900">
              {Number(annual.available_days)}
            </strong>{" "}
            bookable today.
          </p>
        ) : null}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink-900">
          What you&apos;re working with
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {bs.map((b) => (
            <BalanceCard key={b.id} b={b} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">
            Recently attempted
          </h2>
          <Link
            href="/requests"
            className="text-sm font-medium text-brand-700 hover:underline"
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
