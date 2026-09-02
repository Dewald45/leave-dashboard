import { redirect } from "next/navigation";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile, isManagerOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_SELECT, CURRENT_YEAR } from "@/lib/queries";
import type {
  BalanceSummary,
  Profile,
  RequestWithRelations,
} from "@/lib/types";

export default async function TeamPage() {
  const { profile, userId } = await requireProfile();
  if (!isManagerOrAdmin(profile.role)) redirect("/dashboard");

  const supabase = createClient();
  const isAdmin = profile.role === "admin";

  const membersQuery = supabase
    .from("profiles")
    .select("*")
    .order("full_name");
  if (!isAdmin) membersQuery.eq("manager_id", userId);

  const [{ data: members }, { data: balances }, { data: upcoming }] =
    await Promise.all([
      membersQuery,
      supabase
        .from("balance_summary")
        .select("*")
        .eq("leave_code", "annual")
        .eq("year", CURRENT_YEAR),
      supabase
        .from("leave_requests")
        .select(REQUEST_SELECT)
        .eq("status", "approved")
        .gte("end_date", new Date().toISOString().slice(0, 10))
        .neq("profile_id", userId)
        .order("start_date", { ascending: true })
        .limit(20),
    ]);

  const team = (members ?? []) as Profile[];
  const annualByProfile = new Map<string, BalanceSummary>();
  ((balances ?? []) as BalanceSummary[]).forEach((b) =>
    annualByProfile.set(b.profile_id, b)
  );
  const upcomingRows = (upcoming ?? []) as unknown as RequestWithRelations[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Team</h1>
        <p className="text-sm text-sand-600">
          {isAdmin
            ? "Everyone in the company and their annual leave standing."
            : "Your direct reports and their annual leave standing."}
        </p>
      </div>

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
          emptyLabel="No upcoming approved leave."
        />
      </section>
    </div>
  );
}
