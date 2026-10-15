import "server-only";
import { q } from "@/lib/db";

export const AUDIT_CATEGORIES = {
  requests: { label: "Leave requests", prefixes: ["request."] },
  people: { label: "Employees & profiles", prefixes: ["employee.", "profile."] },
  balances: { label: "Balances", prefixes: ["balance."] },
  security: { label: "Passwords, sign-ins & exports", prefixes: ["password.", "auth.", "calendar.", "audit."] },
  holidays: { label: "Public holidays", prefixes: ["holiday."] },
  threads: { label: "Messages & files", prefixes: ["message.", "attachment."] },
} as const;

export type AuditFilters = {
  from?: string; // yyyy-mm-dd (SAST), inclusive
  to?: string; // yyyy-mm-dd (SAST), inclusive
  category?: string;
  person?: string; // matches actor or subject name/email
};

export type AuditRow = {
  id: string;
  at: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  subject_name: string | null;
  summary: string;
  details: Record<string, unknown>;
  ip: string | null;
};

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined);
  return {
    from: isDate(one("from")) ? one("from") : undefined,
    to: isDate(one("to")) ? one("to") : undefined,
    category: one("category") && one("category")! in AUDIT_CATEGORIES ? one("category") : undefined,
    person: one("person")?.slice(0, 100) || undefined,
  };
}

function where(f: AuditFilters) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    values.push(v);
    clauses.push(sql.replace("?", `$${values.length}`));
  };
  // Dates are interpreted in South African time.
  if (f.from) add("at >= (?::date)::timestamp at time zone 'Africa/Johannesburg'", f.from);
  if (f.to) add("at < ((?::date) + 1)::timestamp at time zone 'Africa/Johannesburg'", f.to);
  if (f.category) {
    const prefixes = AUDIT_CATEGORIES[f.category as keyof typeof AUDIT_CATEGORIES].prefixes;
    values.push(prefixes.map((p) => p + "%"));
    clauses.push(`action like any($${values.length}::text[])`);
  }
  if (f.person) {
    values.push(`%${f.person.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
    const n = `$${values.length}`;
    clauses.push(
      `(actor_name ilike ${n} or actor_email ilike ${n} or subject_name ilike ${n})`
    );
  }
  return { sql: clauses.length ? `where ${clauses.join(" and ")}` : "", values };
}

const COLS = `id::text, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at,
  actor_name, actor_email, action, entity_type, entity_id, subject_name, summary, details, ip`;

export async function searchAudit(f: AuditFilters, limit: number, offset = 0) {
  const w = where(f);
  const [rows, total] = await Promise.all([
    q<AuditRow>(
      `select ${COLS} from audit_log ${w.sql} order by at desc, id desc
        limit ${Number(limit)} offset ${Number(offset)}`,
      w.values
    ),
    q<{ n: number }>(`select count(*)::int as n from audit_log ${w.sql}`, w.values),
  ]);
  return { rows, total: total[0]?.n ?? 0 };
}

/** Everything matching, oldest first — for the CSV download. */
export function allAudit(f: AuditFilters) {
  const w = where(f);
  return q<AuditRow>(`select ${COLS} from audit_log ${w.sql} order by at asc, id asc`, w.values);
}

export function filtersToQuery(f: AuditFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}
