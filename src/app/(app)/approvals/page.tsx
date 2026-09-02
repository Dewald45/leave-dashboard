import { redirect } from "next/navigation";
import ApprovalCard from "@/components/ApprovalCard";
import RequestsTable from "@/components/RequestsTable";
import { requireProfile, isManagerOrAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_SELECT } from "@/lib/queries";
import type { RequestWithRelations } from "@/lib/types";

export default async function ApprovalsPage() {
  const { profile, userId } = await requireProfile();
  if (!isManagerOrAdmin(profile.role)) redirect("/dashboard");

  const supabase = createClient();

  // RLS already limits a manager to their direct reports; admin sees all.
  const { data: pending } = await supabase
    .from("leave_requests")
    .select(REQUEST_SELECT)
    .eq("status", "pending")
    .neq("profile_id", userId)
    .order("created_at", { ascending: true });

  const { data: decided } = await supabase
    .from("leave_requests")
    .select(REQUEST_SELECT)
    .in("status", ["approved", "rejected"])
    .neq("profile_id", userId)
    .order("decided_at", { ascending: false })
    .limit(15);

  const pendingRows = (pending ?? []) as unknown as RequestWithRelations[];
  const decidedRows = (decided ?? []) as unknown as RequestWithRelations[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
        <p className="text-sm text-slate-500">
          {profile.role === "admin"
            ? "All pending leave requests across the company."
            : "Leave requests awaiting your approval from your direct reports."}
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
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
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
            Nothing awaiting your approval. 🎉
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recently decided
        </h2>
        <RequestsTable
          rows={decidedRows}
          showEmployee
          emptyLabel="No decisions yet."
        />
      </section>
    </div>
  );
}
