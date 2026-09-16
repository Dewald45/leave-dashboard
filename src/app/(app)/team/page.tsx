import { redirect } from "next/navigation";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile, isManagerOrAdmin } from "@/lib/auth";
import { CURRENT_YEAR } from "@/lib/queries";
import {
  getTeamMembers,
  getAnnualBalances,
  getUpcomingApproved,
} from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import type { BalanceSummary } from "@/lib/types";

export default async function TeamPage() {
  const { profile } = await requireProfile();
  if (!isManagerOrAdmin(profile.role)) redirect("/dashboard");

  const isAdmin = profile.role === "admin";
  const team = await getTeamMembers(profile);
  const [balances, upcomingRows] = await Promise.all([
    getAnnualBalances(
      team.map((m) => m.id),
      CURRENT_YEAR
    ),
    getUpcomingApproved(profile),
  ]);

  const annualByProfile = new Map<string, BalanceSummary>();
  balances.forEach((b) => annualByProfile.set(b.profile_id, b));

  return (
    <div className="space-y-8">
      <PageHeader title="Team">
        {isAdmin
          ? "The whole roster, and exactly how much holiday each of them is sitting on."
          : "Your reports, and how much holiday they're quietly hoarding."}
      </PageHeader>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sand-600">
          People ({team.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
          <table className="min-w-full divide-y divide-sand-100 text-sm">
            <thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-sand-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Annual available</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {team.map((m) => {
                const b = annualByProfile.get(m.id);
                return (
                  <tr key={m.id} className="hover:bg-sand-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">
                        {m.full_name}
                      </div>
                      <div className="text-xs text-sand-500">{m.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize text-sand-600">
                      {m.role}
                    </td>
                    <td className="px-4 py-3 text-sand-600">
                      {m.department ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {b ? (
                        <span className="font-semibold text-ink-900">
                          {b.available_days}
                          <span className="font-normal text-sand-500">
                            {" "}
                            / {b.entitled_days}
                          </span>
                        </span>
                      ) : (
                        <span className="text-sand-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!team.length ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-sand-500"
                  >
                    No team members yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sand-600">
          Upcoming approved leave
        </h2>
        <RequestsTable
          rows={upcomingRows}
          showEmployee
          emptyLabel="Nobody's going anywhere. Suspicious."
        />
      </section>
    </div>
  );
}
