import { redirect } from "next/navigation";
import ApprovalCard from "@/components/ApprovalCard";
import { requireProfile, isManagerOrAdmin } from "@/lib/auth";
import {
  getPendingApprovals,
  getRecentDecisions,
  getThreadStats,
} from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import Panel from "@/components/Panel";
import RequestList from "@/components/RequestList";
import TeamTabs from "@/components/TeamTabs";

export default async function ApprovalsPage() {
  const { profile } = await requireProfile();
  if (!isManagerOrAdmin(profile.role)) redirect("/dashboard");

  const [pendingRows, decidedRows] = await Promise.all([
    getPendingApprovals(profile),
    getRecentDecisions(profile),
  ]);
  const stats = await getThreadStats(
    [...pendingRows, ...decidedRows].map((r) => r.id),
    profile.id
  );

  return (
    <ScreenPage>
      <PageHeader title="Approvals">
        {profile.role === "admin"
          ? "Every request in the building, awaiting your royal assent."
          : "Your reports would like to leave. You get to decide how they feel about it."}
      </PageHeader>

      <TeamTabs active="approvals" pending={pendingRows.length} />

      <div className="grid gap-4 fit:min-h-0 fit:flex-1 lg:grid-cols-5 fit:grid-rows-[minmax(0,1fr)]">
        {/* Waiting requests: their own scrolling column of cards */}
        <section aria-labelledby="pending-heading" className="flex flex-col fit:min-h-0 lg:col-span-3">
          <div className="mb-3 flex items-center gap-2">
            <h2 id="pending-heading" className="text-base font-semibold text-ink-900">
              Awaiting decision
            </h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pendingRows.length}
            </span>
          </div>
          <div className="space-y-4 fit:min-h-0 fit:flex-1 fit:overflow-y-auto fit:pr-1">
            {pendingRows.length ? (
              pendingRows.map((r) => (
                <ApprovalCard key={r.id} r={r} stats={stats[r.id]} />
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-sand-300 bg-white/60 p-8 text-center text-sm text-sand-500">
                Nothing awaiting your approval. 🎉
              </div>
            )}
          </div>
        </section>

        <Panel title="Recently decided" count={decidedRows.length} className="lg:col-span-2">
          {decidedRows.length ? (
            <RequestList rows={decidedRows} stats={stats} showEmployee />
          ) : (
            <p className="px-5 pb-6 text-sm text-sand-500">No verdicts handed down yet.</p>
          )}
        </Panel>
      </div>
    </ScreenPage>
  );
}
