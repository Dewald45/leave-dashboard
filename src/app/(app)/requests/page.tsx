import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { getMyRequests, getThreadStats } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";

export default async function RequestsPage() {
  const { userId } = await requireProfile();
  const rows = await getMyRequests(userId);
  const stats = await getThreadStats(
    rows.map((r) => r.id),
    userId
  );

  return (
    <ScreenPage>
      <PageHeader
        title="My requests"
        action={
          <a
            href={`/api/export/mine?year=${new Date().getUTCFullYear()}`}
            download
            className="inline-flex min-h-[44px] items-center rounded-full border border-sand-300 bg-white px-5 text-sm font-semibold text-ink-900 hover:bg-sand-50"
          >
            Export my leave days (CSV) ↓
          </a>
        }
      >
        Every escape you&apos;ve ever attempted, and how it went.
      </PageHeader>
      <RequestsTable
        rows={rows}
        stats={stats}
        allowCancel
        fill
        emptyLabel="Nothing here. Either you love this place or you're due a break."
      />
    </ScreenPage>
  );
}
