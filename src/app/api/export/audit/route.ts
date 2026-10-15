import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/session";
import { allAudit, parseFilters } from "@/lib/auditQuery";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Cell = string | number | null | undefined;

function csvCell(v: Cell) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // no spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sast(iso: string) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Africa/Johannesburg" });
}

export async function GET(req: NextRequest) {
  const me = await getSessionProfile();
  if (!me) return new NextResponse("Not signed in", { status: 401 });
  if (me.role !== "admin") return new NextResponse("Administrator access required", { status: 403 });

  const filters = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const rows = await allAudit(filters);

  // Downloading the trail is itself recorded.
  await audit({
    actor: me,
    action: "audit.exported",
    entityType: "account",
    entityId: me.id,
    subject: me,
    summary: `Downloaded the audit trail (${rows.length} entries)`,
    details: { filters },
  });

  const header = ["Entry #", "When (SAST)", "Done by", "Done by email", "Action", "About", "Summary",
    "Record type", "Record id", "Details", "IP address"];
  const lines = rows.map((r) =>
    [r.id, sast(r.at), r.actor_name ?? "System", r.actor_email, r.action, r.subject_name, r.summary,
     r.entity_type, r.entity_id, JSON.stringify(r.details), r.ip].map(csvCell).join(",")
  );
  const csv = "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timeoff-audit-trail-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
