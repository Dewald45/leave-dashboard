import { redirect } from "next/navigation";
import ApprovalCard from "@/components/ApprovalCard";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile, isManagerOrAdmin } from "@/lib/auth";
import { getPendingApprovals, getRecentDecisions } from "@/lib/data";
import PageHeader from "@/components/PageHeader";

export default async function ApprovalsPage() {
  const { profile } = await requireProfile();
  if (!isManagerOrAdmin(profile.role)) redirect("/dashboard");

  const [pendingRows, decidedRows] = await Promise.all([
    getPendingApprovals(profile),
    getRecentDecisions(profile),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Approvals">
        {profile.role === "admin"
          ? "Every request in the building, awaiting your royal assent."
          : "Your reports would like to leave. You get to decide how they feel about it."}
      </PageHeader>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sand-600">
            Awaiting decision
          </h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {pendingRows.length}
          </span>
        </div>
        {pendingRows.length ? (
          <div className="grid gap-4">
            {pendingRows.map((r) => (
              <ApprovalCard key={r.id} r={r} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-sand-200 bg-white p-8 text-center text-sm text-sand-500">
            Nothing awaiting your approval. 🎉
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sand-600">
          Recently decided
        </h2>
        <RequestsTable
          rows={decidedRows}
          showEmployee
          emptyLabel="No verdicts handed down yet."
        />
      </section>
    </div>
  );
}
