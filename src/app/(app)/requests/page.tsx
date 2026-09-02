import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_SELECT } from "@/lib/queries";
import type { RequestWithRelations } from "@/lib/types";

export default async function RequestsPage() {
  const { userId } = await requireProfile();
  const supabase = createClient();

  const { data } = await supabase
    .from("leave_requests")
    .select(REQUEST_SELECT)
    .eq("profile_id", userId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as RequestWithRelations[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">My requests</h1>
        <p className="text-sm text-sand-600">
          Every leave request you&apos;ve submitted, with its approval status.
        </p>
      </div>
      <RequestsTable
        rows={rows}
        allowCancel
        emptyLabel="You haven't applied for any leave yet."
      />
    </div>
  );
}
