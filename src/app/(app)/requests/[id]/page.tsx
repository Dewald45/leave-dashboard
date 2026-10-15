import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  canApproveRequest,
  canViewRequest,
  getAttachments,
  getMessages,
  getRequestById,
  markRequestRead,
} from "@/lib/data";
import { formatBytes } from "@/lib/attachments";
import { describeDuration, formatDate, formatDateTime, formatDays } from "@/lib/leave";
import { cancelRequest } from "@/app/(app)/actions";
import PageHeader from "@/components/PageHeader";
import ScreenPage from "@/components/ScreenPage";
import StatusBadge from "@/components/StatusBadge";
import DecisionForm from "@/components/DecisionForm";
import MessageForm from "./MessageForm";
import AutoRefresh from "./AutoRefresh";
import ScrollToLatest from "./ScrollToLatest";

type TimelineItem =
  | { kind: "message"; at: string; id: string; authorId: string | null; author: string; body: string }
  | { kind: "event"; at: string; id: string; text: string };

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { submitted?: string; left?: string };
}) {
  const { profile } = await requireProfile();
  const id = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!(await canViewRequest(id, profile.id))) notFound();

  const [r, messages, attachments, canDecide] = await Promise.all([
    getRequestById(id),
    getMessages(id),
    getAttachments(id),
    canApproveRequest(id, profile.id),
  ]);
  if (!r) notFound();
  await markRequestRead(id, profile.id);

  const mine = r.profile_id === profile.id;
  const firstName = r.profiles?.full_name?.split(" ")[0] ?? "Their";
  const dateText =
    r.start_date === r.end_date
      ? formatDate(r.start_date)
      : `${formatDate(r.start_date)} → ${formatDate(r.end_date)}`;
  const canCancel =
    (mine || profile.role === "admin") && (r.status === "pending" || r.status === "approved");
  const isSick = r.leave_types?.code === "sick";

  const timeline: TimelineItem[] = [
    {
      kind: "event",
      at: r.created_at,
      id: "submitted",
      text: `${mine ? "You" : r.profiles?.full_name} applied${r.reason ? `: “${r.reason}”` : ""}`,
    },
    ...messages.map((m) => ({
      kind: "message" as const,
      at: m.created_at,
      id: m.id,
      authorId: m.author_id,
      author: m.author_id === profile.id ? "You" : m.author_name ?? "Former employee",
      body: m.body,
    })),
  ];
  if (r.decided_at && (r.status === "approved" || r.status === "rejected")) {
    timeline.push({
      kind: "event",
      at: r.decided_at,
      id: "decided",
      text: `${r.approver?.full_name ?? "A manager"} ${r.status === "approved" ? "approved" : "rejected"} this${
        r.decision_note ? `: “${r.decision_note}”` : ""
      }`,
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ScreenPage>
      <AutoRefresh />
      <Link
        href={mine ? "/requests" : "/approvals"}
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-sand-600 hover:text-ink-900"
      >
        ← {mine ? "My requests" : "Approvals"}
      </Link>

      <PageHeader title={mine ? `Your ${r.leave_types?.name ?? "leave"}` : `${firstName}'s ${r.leave_types?.name ?? "leave"}`}>
        {dateText} · {describeDuration(r.days, r.half_day)}
      </PageHeader>

      {searchParams.submitted ? (
        <div role="status" className="rounded-3xl bg-emerald-50 px-6 py-4 text-sm text-emerald-800">
          <strong className="font-semibold">Request sent.</strong> We&apos;ve emailed you an
          out-of-office event — open it to add it to your calendar. It updates itself when your
          manager decides.
          {searchParams.left !== undefined && !isNaN(Number(searchParams.left)) ? (
            <>
              {" "}Counting this one, you have{" "}
              <strong className="font-semibold">{formatDays(Number(searchParams.left))}</strong>{" "}
              day{Number(searchParams.left) === 1 ? "" : "s"} of {r.leave_types?.name} left to book.
            </>
          ) : null}{" "}
          Questions for them? Ask below.
        </div>
      ) : null}

      <div className="grid gap-4 fit:min-h-0 fit:flex-1 lg:grid-cols-3 fit:grid-rows-[minmax(0,1fr)]">
        {/* Conversation: messages scroll, the reply box stays put */}
        <section className="flex flex-col rounded-3xl bg-white fit:min-h-0 lg:col-span-2" aria-labelledby="thread-heading">
          <div className="border-b border-sand-100 px-5 py-4">
            <h2 id="thread-heading" className="text-base font-semibold text-ink-900">
              Conversation
            </h2>
            <p className="mt-0.5 text-xs text-sand-500">
              Everyone on this request gets an email when someone posts.
            </p>
          </div>

          <ScrollToLatest targetId="thread-messages" count={timeline.length} />
          <ol id="thread-messages" className="space-y-4 px-5 py-5 fit:min-h-0 fit:flex-1 fit:overflow-y-auto" aria-live="polite">
            {timeline.map((item) =>
              item.kind === "event" ? (
                <li key={item.id} className="flex items-center gap-3 text-xs text-sand-500">
                  <span className="h-px flex-1 bg-sand-200" aria-hidden="true" />
                  <span className="max-w-[80%] text-center">
                    {item.text} · {formatDateTime(item.at)}
                  </span>
                  <span className="h-px flex-1 bg-sand-200" aria-hidden="true" />
                </li>
              ) : (
                <li
                  key={item.id}
                  className={`flex flex-col ${item.authorId === profile.id ? "items-end" : "items-start"}`}
                >
                  <div className="mb-1 text-xs text-sand-500">
                    <span className="font-medium text-ink-800">{item.author}</span> ·{" "}
                    {formatDateTime(item.at)}
                  </div>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      item.authorId === profile.id
                        ? "rounded-br-md bg-ink-900 text-white"
                        : "rounded-bl-md border border-sand-200 bg-sand-50 text-ink-900"
                    }`}
                  >
                    {item.body}
                  </div>
                </li>
              )
            )}
            {messages.length === 0 ? (
              <li className="py-4 text-center text-sm text-sand-500">
                No messages yet. {mine ? "Need to explain something? Say it here." : "Got a question before you decide? Ask it here."}
              </li>
            ) : null}
          </ol>

          <div className="border-t border-sand-100 px-5 py-4">
            <MessageForm requestId={r.id} />
          </div>
        </section>

        {/* Sidebar */}
        <aside className="space-y-4 fit:max-h-full fit:overflow-y-auto">
          <div className="rounded-3xl bg-white p-6">
            <h2 className="mb-3 text-base font-semibold text-ink-900">Details</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">Status</dt>
                <dd><StatusBadge status={r.status} /></dd>
              </div>
              {!mine ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">Employee</dt>
                  <dd className="text-right font-medium text-ink-900">{r.profiles?.full_name}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">Type</dt>
                <dd className="text-right font-medium text-ink-900">{r.leave_types?.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">Dates</dt>
                <dd className="text-right font-medium text-ink-900">{dateText}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">Working days</dt>
                <dd className="text-right font-medium tabular-nums text-ink-900">{formatDays(r.days, r.half_day)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">Applied</dt>
                <dd className="text-right text-ink-900">{formatDateTime(r.created_at)}</dd>
              </div>
              {r.approver ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">Decided by</dt>
                  <dd className="text-right text-ink-900">{r.approver.full_name}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-3xl bg-white p-6">
            <h2 className="mb-3 text-base font-semibold text-ink-900">Attachments</h2>
            {attachments.length ? (
              <ul className="space-y-2">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener"
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-full border border-sand-200 px-3 py-2 text-sm hover:bg-sand-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-900">{a.filename}</span>
                        <span className="block text-xs text-sand-500">
                          {formatBytes(a.size_bytes)} · {a.uploaded_by_name ?? "Unknown"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-brand-700">Open</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-sand-500">
                {isSick && r.days > 2
                  ? "No medical certificate yet — attach it with the paperclip in the conversation."
                  : "Nothing attached."}
              </p>
            )}
          </div>

          {canDecide && r.status === "pending" ? (
            <div className="rounded-3xl bg-white p-6">
              <h2 className="mb-3 text-base font-semibold text-ink-900">Your call</h2>
              <DecisionForm requestId={r.id} stacked />
            </div>
          ) : null}

          {canCancel ? (
            <form action={cancelRequest} className="rounded-3xl bg-rose-50 p-6">
              <input type="hidden" name="id" value={r.id} />
              <p className="mb-3 text-xs text-rose-800/90">
                Plans changed? Cancelling releases the days and removes the calendar event.
              </p>
              <button
                type="submit"
                className="min-h-[40px] w-full rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              >
                Cancel this request
              </button>
            </form>
          ) : null}
        </aside>
      </div>
    </ScreenPage>
  );
}
