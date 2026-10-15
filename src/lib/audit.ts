import "server-only";
import { headers } from "next/headers";
import { q } from "@/lib/db";

type Person = { id: string; full_name: string; email?: string | null };

export type AuditEntry = {
  /** Who did it. Omit (or null) for the system or a signed-out visitor. */
  actor?: Person | null;
  action: string;
  entityType: "request" | "profile" | "balance" | "holiday" | "account" | "message" | "attachment";
  entityId?: string | null;
  /** Who it's about (the employee whose leave/profile changed). */
  subject?: Person | null;
  summary: string;
  details?: Record<string, unknown>;
};

function clientIp(): string | null {
  try {
    const h = headers();
    return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  } catch {
    return null; // outside a request (shouldn't happen, but never block on it)
  }
}

/**
 * Append a row to the audit trail. Awaited on purpose: a change that can't be
 * recorded should surface as an error, not vanish silently.
 */
export async function audit(e: AuditEntry): Promise<void> {
  await q(
    `insert into audit_log (actor_id, actor_name, actor_email, action, entity_type, entity_id,
                            subject_id, subject_name, summary, details, ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      e.actor?.id ?? null,
      e.actor?.full_name ?? null,
      e.actor?.email ?? null,
      e.action,
      e.entityType,
      e.entityId ?? null,
      e.subject?.id ?? null,
      e.subject?.full_name ?? null,
      e.summary,
      JSON.stringify(e.details ?? {}),
      clientIp(),
    ]
  );
}

/** { field: { from, to } } for the fields that actually changed. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    if (String(a) !== String(b)) out[k] = { from: a, to: b };
  }
  return out;
}

/** "Annual Leave, 20 Oct 2026 (morning)" — compact leave description for summaries. */
export function leaveLabel(r: {
  leave_name: string;
  start_date: string;
  end_date: string;
  half_day?: "am" | "pm" | null;
}) {
  const f = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
  const dates =
    r.start_date === r.end_date ? f(r.start_date) : `${f(r.start_date)} – ${f(r.end_date)}`;
  const half = r.half_day ? ` (${r.half_day === "am" ? "morning" : "afternoon"})` : "";
  return `${r.leave_name}, ${dates}${half}`;
}
