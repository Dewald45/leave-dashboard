import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getAllProfiles, getMyRequests } from "@/lib/data";
import { q } from "@/lib/db";
import { STATUS_STYLES, formatDate, formatDateRange, formatDays } from "@/lib/leave";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import AdminTabs from "@/components/AdminTabs";
import type { RequestWithRelations } from "@/lib/types";

type Year = {
  cycle_start: string;
  cycle_end: string;
  entitled: number;
  accrued: number;
  used: number;
  reserved: number;
  carried: number;
  adjusted: number;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));

/** Every leave request one person has ever made, grouped by their leave year. */
export default async function LeaveHistoryPage({ searchParams }: { searchParams: { person?: string } }) {
  const { profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const people = await getAllProfiles();
  const person = people.find((p) => p.id === searchParams.person) ?? null;

  const [requests, years] = person
    ? await Promise.all([
        getMyRequests(person.id),
        q<Year>(
          `select cycle_start::text, cycle_end::text, entitled_days::float8 as entitled,
                  accrued_days::float8 as accrued, used_days::float8 as used,
                  reserved_days::float8 as reserved, carried_days::float8 as carried,
                  adjusted_days::float8 as adjusted
             from balance_summary
            where profile_id = $1 and leave_code = 'annual'
            order by cycle_start desc`,
          [person.id]
        ),
      ])
    : [[] as RequestWithRelations[], [] as Year[]];

  // Put each request under the leave year it starts in; anything outside a known year goes to "Other".
  const groups = years.map((y) => ({
    year: y,
    rows: requests
      .filter((r) => r.start_date >= y.cycle_start && r.start_date <= y.cycle_end)
      .sort((a, b) => b.start_date.localeCompare(a.start_date)),
  }));
  const other = requests.filter((r) => !years.some((y) => r.start_date >= y.cycle_start && r.start_date <= y.cycle_end));

  return (
    <ScreenPage>
      <PageHeader title="Leave history">Pick someone to see every day of leave they&apos;ve had, year by year.</PageHeader>
      <AdminTabs active="history" />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-3xl bg-white p-4">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm font-medium text-ink-900">
          Employee
          <select
            name="person"
            defaultValue={person?.id ?? ""}
            className="min-h-[44px] rounded-xl border border-sand-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="" disabled>
              Choose a person…
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-[44px] rounded-full bg-ink-900 px-6 text-sm font-semibold text-white hover:bg-ink-800">
          Show history
        </button>
      </form>

      {person ? (
        <div className="flex flex-col gap-4">
          {groups.length === 0 && other.length === 0 ? (
            <p className="rounded-3xl bg-white p-6 text-center text-sm text-sand-600">No leave on record for {person.full_name} yet.</p>
          ) : null}
          {groups.map(({ year, rows }) => (
            <YearBlock key={year.cycle_start} title={`Leave year ${formatDateRange(year.cycle_start, year.cycle_end)}`} year={year} rows={rows} />
          ))}
          {other.length ? <YearBlock title="Other dates" rows={other} /> : null}
        </div>
      ) : null}
    </ScreenPage>
  );
}

function YearBlock({ title, year, rows }: { title: string; year?: Year; rows: RequestWithRelations[] }) {
  const annualLeft = year ? year.entitled - year.reserved - year.used + year.carried + year.adjusted : 0;
  return (
    <section className="rounded-3xl bg-white p-2">
      <div className="px-4 pb-2 pt-3">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {year ? (
          <dl className="mt-2 flex flex-wrap gap-2 text-xs">
            <Stat label="Earned" value={`${fmt(year.accrued)} of ${fmt(year.entitled)}`} />
            <Stat label="Annual leave taken" value={fmt(year.used)} />
            <Stat label="Held for closure" value={fmt(year.reserved)} />
            {year.carried ? <Stat label="Carried in" value={fmt(year.carried)} /> : null}
            {year.adjusted ? <Stat label="Adjusted" value={fmt(year.adjusted)} /> : null}
            <Stat label="Left to book for the year" value={fmt(annualLeft)} />
          </dl>
        ) : null}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-sand-600">
              <tr>
                <th className="px-4 py-2 font-medium">Dates</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Days</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Decided by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((r) => {
                const st = STATUS_STYLES[r.status] ?? STATUS_STYLES.pending;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-ink-900">{formatDateRange(r.start_date, r.end_date)}</td>
                    <td className="px-4 py-2.5 text-ink-800">{r.leave_types?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-800">{formatDays(r.days, r.half_day)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${st.className}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sand-600">
                      {r.approver?.full_name ?? "—"}
                      {r.decided_at ? ` · ${formatDate(r.decided_at.slice(0, 10))}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 pb-4 text-sm text-sand-600">No requests in this leave year.</p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full bg-sand-100 px-3 py-1">
      <dt className="inline text-sand-600">{label}: </dt>
      <dd className="inline font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
