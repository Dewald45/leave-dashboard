import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/leave";
import {
  AUDIT_CATEGORIES,
  filtersToQuery,
  parseFilters,
  searchAudit,
  type AuditRow,
} from "@/lib/auditQuery";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import AdminTabs from "@/components/AdminTabs";

const PAGE_SIZE = 50;

const inputClass =
  "min-h-[40px] w-full rounded-xl border border-sand-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

/** Colour-code by what kind of thing happened; the text label carries the meaning too. */
function actionTone(action: string) {
  if (/deleted|removed|rejected|cancelled|failed/.test(action)) return "bg-rose-50 text-rose-700 ring-rose-600/20";
  if (/approved|created|added|completed/.test(action)) return "bg-emerald-50 text-emerald-800 ring-emerald-600/20";
  if (/submitted|escalated|reset/.test(action)) return "bg-amber-50 text-amber-800 ring-amber-600/20";
  return "bg-sand-100 text-sand-600 ring-sand-600/20";
}

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function Details({ row }: { row: AuditRow }) {
  const d = row.details ?? {};
  const changes = (d as { changes?: Record<string, { from: unknown; to: unknown }> }).changes;
  const rest = Object.entries(d).filter(([k]) => k !== "changes");
  if (!changes && rest.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-sand-500 hover:text-ink-900">
        Details
      </summary>
      <dl className="mt-2 space-y-1 rounded-xl bg-sand-50 p-3 text-xs">
        {changes
          ? Object.entries(changes).map(([field, c]) => (
              <div key={field} className="flex flex-wrap gap-x-2">
                <dt className="font-medium capitalize text-ink-800">{field.replace(/_/g, " ")}:</dt>
                <dd className="text-sand-600">
                  <span className="line-through decoration-rose-400">{show(c.from)}</span> →{" "}
                  <span className="font-medium text-ink-900">{show(c.to)}</span>
                </dd>
              </div>
            ))
          : null}
        {rest.map(([k, v]) => (
          <div key={k} className="flex flex-wrap gap-x-2">
            <dt className="font-medium capitalize text-ink-800">{k.replace(/_/g, " ")}:</dt>
            <dd className="max-w-full whitespace-pre-wrap break-words text-sand-600">
              {typeof v === "object" && v !== null ? (
                <code className="text-[11px]">{JSON.stringify(v, null, 1)}</code>
              ) : (
                show(v)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { profile } = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");

  const filters = parseFilters(searchParams);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { rows, total } = await searchAudit(filters, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const qs = filtersToQuery(filters);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => `/admin/audit?${[qs, `page=${n}`].filter(Boolean).join("&")}`;

  return (
    <ScreenPage>
      <PageHeader title="Audit trail">
        Every submission, decision, cancellation, profile change, deletion and sign-in —
        recorded permanently. Entries can&apos;t be edited or removed, even by admins.
      </PageHeader>

      <AdminTabs active="audit" />

      {/* Filters */}
      <form method="get" className="grid gap-3 rounded-3xl bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-sand-600">From</label>
          <input id="from" name="from" type="date" defaultValue={filters.from} className={inputClass} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-sand-600">To</label>
          <input id="to" name="to" type="date" defaultValue={filters.to} className={inputClass} />
        </div>
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-sand-600">What</label>
          <select id="category" name="category" defaultValue={filters.category ?? ""} className={inputClass}>
            <option value="">Everything</option>
            {Object.entries(AUDIT_CATEGORIES).map(([k, c]) => (
              <option key={k} value={k}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="person" className="mb-1 block text-xs font-medium text-sand-600">Person</label>
          <input id="person" name="person" defaultValue={filters.person} placeholder="Name or email" className={inputClass} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="min-h-[40px] flex-1 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800">
            Filter
          </button>
          {qs ? (
            <Link href="/admin/audit" className="inline-flex min-h-[40px] items-center rounded-full border border-sand-300 px-3 text-sm text-sand-600 hover:bg-sand-50">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {/* The download sits with the results it exports, below the tabs. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sand-600">
          {total.toLocaleString("en-ZA")} entr{total === 1 ? "y" : "ies"}
          {qs ? " match these filters" : ""}. The download includes all of them, not just this page.
        </p>
        <a
          href={`/api/export/audit${qs ? `?${qs}` : ""}`}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800 sm:min-h-[40px]"
        >
          Download CSV
        </a>
      </div>

      {/* Entries */}
      {rows.length ? (
        <div className="overflow-x-auto rounded-3xl bg-white fit:min-h-0 fit:flex-1 fit:overflow-y-auto">
          <table className="min-w-full divide-y divide-sand-100 text-sm">
            <thead className="sticky top-0 z-10 bg-sand-50 text-left text-xs uppercase tracking-wide text-sand-600">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">When</th>
                <th className="px-4 py-3">Done by</th>
                <th className="px-4 py-3">What happened</th>
                <th className="px-4 py-3">About</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-sand-50/60">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-sand-600">{formatDateTime(r.at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">{r.actor_name ?? "System"}</div>
                    {r.ip ? <div className="text-xs text-sand-500">{r.ip}</div> : null}
                  </td>
                  <td className="min-w-[18rem] px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] ring-1 ring-inset ${actionTone(r.action)}`}>
                      {r.action}
                    </span>
                    <div className="mt-1 text-ink-900">{r.summary}</div>
                    <Details row={r} />
                  </td>
                  <td className="px-4 py-3 text-sand-600">{r.subject_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-sand-300 bg-white/60 p-8 text-center text-sm text-sand-500">
          Nothing recorded {qs ? "for these filters" : "yet"}.
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Audit pages" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-full border border-sand-300 px-4 py-2 hover:bg-sand-50">← Newer</Link>
          ) : <span />}
          <span className="text-sand-500">Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="rounded-full border border-sand-300 px-4 py-2 hover:bg-sand-50">Older →</Link>
          ) : <span />}
        </nav>
      ) : null}
    </ScreenPage>
  );
}
