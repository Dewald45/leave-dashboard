import Link from "next/link";
import type { ThreadStats } from "@/lib/types";

function ChatIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-4 w-4">
      <path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 3v-3h0a2 2 0 0 1-2-2v-6Z" strokeLinejoin="round" />
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.6-1.7l5.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Open request" link showing message count, unread dot and attachments. */
export default function ThreadBadge({
  requestId,
  stats,
  compact = false,
}: {
  requestId: string;
  stats?: ThreadStats;
  /** Icon + count only, for tight phone rows. */
  compact?: boolean;
}) {
  const messages = stats?.messages ?? 0;
  const unread = stats?.unread ?? 0;
  const attachments = stats?.attachments ?? 0;
  const label =
    messages === 0
      ? "Open request and message"
      : `Open request — ${messages} message${messages === 1 ? "" : "s"}${unread ? `, ${unread} unread` : ""}`;

  return (
    <Link
      href={`/requests/${requestId}`}
      aria-label={label}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        unread
          ? "border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100"
          : "border-sand-200 text-sand-600 hover:bg-sand-50 hover:text-ink-900"
      }`}
    >
      <ChatIcon />
      {messages > 0 ? messages : compact ? null : "Chat"}
      {unread ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" /> : null}
      {attachments > 0 && !compact ? (
        <span className="ml-0.5 inline-flex items-center gap-0.5 text-sand-500">
          <ClipIcon />
          {attachments}
        </span>
      ) : null}
    </Link>
  );
}
