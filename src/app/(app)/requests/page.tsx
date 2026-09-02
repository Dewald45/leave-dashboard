import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_SELECT } from "@/lib/queries";
import type { RequestWithRelations } from "@/lib/types";
import PageHeader from "@/components/PageHeader";

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
      <PageHeader title="My requests">
        Every escape you&apos;ve ever attempted, and how it went.
      </PageHeader>
      <RequestsTable
        rows={rows}
        allowCancel
        emptyLabel="Nothing here. Either you love this place or you're due a break."
      />
    </div>
  );
}
