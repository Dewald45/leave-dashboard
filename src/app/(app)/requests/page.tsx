import RequestsTable from "@/components/RequestsTable";
import { requireProfile } from "@/lib/auth";
import { getMyRequests, getThreadStats } from "@/lib/data";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import RequestFilters from "@/components/RequestFilters";
import { todaySA } from "@/lib/leave";
import type { RequestWithRelations } from "@/lib/types";

const STATUSES = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

function matchesStatus(r: RequestWithRelations, status: string, today: string) {
  if (status === "all") return true;
  if (status === "upcoming") {
    return (r.status === "approved" || r.status === "pending") && r.end_date >= today;
  }
  return r.status === status;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { status?: string; type?: string };
}) {
  const { userId } = await requireProfile();
  const all = await getMyRequests(userId);
  const today = todaySA();

  const status = STATUSES.some((s) => s.value === searchParams.status) ? searchParams.status! : "all";
  const typeCodes = Array.from(
    new Map(
      all.filter((r) => r.leave_types).map((r) => [r.leave_types!.code, r.leave_types!.name])
    )
  );
  const type = typeCodes.some(([c]) => c === searchParams.type) ? searchParams.type! : "all";

  const byType = (r: RequestWithRelations) => type === "all" || r.leave_types?.code === type;
  const rows = all.filter((r) => byType(r) && matchesStatus(r, status, today));

  const statusOptions = STATUSES.map((s) => ({
    ...s,
    count: all.filter((r) => byType(r) && matchesStatus(r, s.value, today)).length,
  })).filter((s) => s.value === "all" || s.value === status || s.count > 0);
  const typeOptions = [
    { value: "all", label: "All types", count: all.filter((r) => matchesStatus(r, status, today)).length },
    ...typeCodes.map(([code, name]) => ({
      value: code,
      label: name,
      count: all.filter((r) => r.leave_types?.code === code && matchesStatus(r, status, today)).length,
    })),
  ];

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
      {all.length ? (
        <RequestFilters
          status={status}
          type={type}
          statusOptions={statusOptions}
          typeOptions={typeOptions}
        />
      ) : null}
      <RequestsTable
        rows={rows}
        stats={stats}
        allowCancel
        fill
        emptyLabel={
          all.length
            ? "No requests match these filters."
            : "Nothing here. Either you love this place or you're due a break."
        }
      />
    </ScreenPage>
  );
}
