import Link from "next/link";
import BalanceCard from "@/components/BalanceCard";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { ensureCurrentBalances, getBalances, getMyRequests } from "@/lib/data";
import { formatDate } from "@/lib/leave";

export default async function DashboardPage() {
  const { profile, userId } = await requireProfile();

  // Ensure balances exist for the cycles in progress (they roll over on the
  // employee's own start-date anniversary).
  await ensureCurrentBalances(userId);

  const [bs, reqs] = await Promise.all([
    getBalances(userId),
    getMyRequests(userId, 5),
  ]);

  const annual = bs.find((b) => b.leave_code === "annual");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex rounded-3xl bg-ink-900 p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Right then, {profile.full_name.split(" ")[0]}.
              </h1>
              <p className="mt-1.5 text-sm text-sand-400">
                Everything you&apos;re owed this leave year, and everything
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
        <div className="rounded-3xl bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-xs text-white">
              ❄
            </span>
            <h2 className="text-sm font-semibold text-ink-900">
              The December shutdown
            </h2>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 lg:gap-3">
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
                1.25 days a month (BCEA). Your leave year runs from your start
                date
                {annual ? <> and ends {formatDate(annual.cycle_end)}</> : null}
                .
              </dd>
            </div>
          </dl>

          {annual ? (
            <p className="mt-4 border-t border-sand-200 pt-3 text-sm text-sand-600">
              You&apos;ve earned{" "}
              <strong className="text-ink-900">
                {Number(annual.accrued_days)} of {annual.entitled_days}
              </strong>{" "}
              so far and can still book{" "}
              <strong className="text-ink-900">
                {Math.max(
                  0,
                  Number(annual.available_days) - Number(annual.pending_days)
                )}
              </strong>{" "}
              this leave year. Borrowing ahead is allowed; the closure days
              are not.
            </p>
          ) : null}
        </div>
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
