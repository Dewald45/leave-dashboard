import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { getMyRequests, getThreadStats } from "@/lib/data";
import PageHeader from "@/components/PageHeader";

export default async function RequestsPage() {
  const { userId } = await requireProfile();
  const rows = await getMyRequests(userId);
  const stats = await getThreadStats(
    rows.map((r) => r.id),
    userId
  );

  return (
    <div className="space-y-5">
      <PageHeader title="My requests">
        Every escape you&apos;ve ever attempted, and how it went.
      </PageHeader>
      <RequestsTable
        rows={rows}
        stats={stats}
        allowCancel
        emptyLabel="Nothing here. Either you love this place or you're due a break."
      />
    </div>
  );
}
