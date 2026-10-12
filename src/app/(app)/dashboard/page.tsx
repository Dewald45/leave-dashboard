import Link from "next/link";
import BalanceCard from "@/components/BalanceCard";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { ensureCurrentBalances, getBalances, getMyRequests } from "@/lib/data";

export default async function DashboardPage() {
  const { profile, userId } = await requireProfile();

  // Ensure balances exist for the cycles in progress (they roll over on the
  // employee's own start-date anniversary).
  await ensureCurrentBalances(userId);

  const [bs, reqs] = await Promise.all([
    getBalances(userId),
    getMyRequests(userId, 3),
  ]);

  const annual = bs.find((b) => b.leave_code === "annual");
  // Auto-granted leave (the closure) gets its own explainer card rather than a
  // balance card: there is nothing to book or track.
  const closure = bs.find((b) => b.bookable === false);
  const bookable = bs.filter((b) => b.bookable !== false);

  const gifted = Number(closure?.entitled_days ?? 0);
  const taken = Number(annual?.reserved_days ?? 0);
  const num = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

  return (
    // One bento. On a laptop or bigger (1024px wide, 640px tall) it is exactly
    // as tall as the shell, so the page never scrolls: the last row takes
    // whatever height is left and scrolls inside itself if it has to. Smaller
    // screens fall back to a normal stacked, scrolling page.
    // (5rem = the shell's page margin plus <main>'s vertical padding.)
    <div className="flex flex-col gap-4 [@media(min-width:1024px)_and_(min-height:640px)]:h-[calc(100vh-5rem)]">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-ink-900 p-6 lg:col-span-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Right then, {profile.full_name.split(" ")[0]}.
            </h1>
            <p className="mt-1.5 text-sm text-sand-400">
              Everything you&apos;re owed this leave year, and everything
              you&apos;ve already spent. No judgement. Some judgement.
            </p>
          </div>
          <Link
            href="/apply"
            className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            Plot an escape →
          </Link>
        </div>

        {/* Year-end closure, in plain English */}
        <div className="rounded-3xl bg-white p-6 lg:col-span-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-xs text-white">
              ❄
            </span>
            <h2 className="text-sm font-semibold text-ink-900">
              Year-end closure
            </h2>
          </div>
          <p className="mt-3 text-sm text-ink-800">
            The office closes for {num(gifted + taken)} working days over
            December. Everyone is off, and you don&apos;t apply for any of it.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 p-3.5">
              <dt className="text-sm font-semibold text-emerald-800">
                +{num(gifted)} days: a gift from the company
              </dt>
              <dd className="mt-1 text-xs text-ink-700">
                Extra paid days off. They don&apos;t come out of your leave.
              </dd>
            </div>
            <div className="rounded-2xl bg-brand-50 p-3.5">
              <dt className="text-sm font-semibold text-brand-800">
                −{num(taken)} days: taken from your annual leave
              </dt>
              <dd className="mt-1 text-xs text-ink-700">
                Set aside from the start of your leave year, so you can&apos;t
                book them for anything else.
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <section
        aria-label="Your leave balances"
        className="grid gap-4 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none"
      >
        {bookable.map((b) => (
          <BalanceCard key={b.id} b={b} />
        ))}
      </section>

      <section className="flex min-h-[8.5rem] flex-1 flex-col overflow-hidden rounded-3xl bg-white p-2">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h2 className="text-sm font-semibold text-ink-900">
            Recently attempted
          </h2>
          <Link
            href="/requests"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            See the full history →
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RequestsTable
            rows={reqs}
            allowCancel
            emptyLabel="Nothing here. Either you love this place or you're due a break."
          />
        </div>
      </section>
    </div>
  );
}
