import { NextResponse, type NextRequest } from "next/server";
import { q } from "@/lib/db";
import { getSessionProfile } from "@/lib/session";
import { getHolidaySet } from "@/lib/holidays";
import { isWeekendOrHoliday } from "@/lib/leave";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Cell = string | number | null | undefined;

function csvCell(v: Cell) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Stop spreadsheets from evaluating user-entered text as a formula.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: Cell[][]) {
  // BOM so Excel opens it as UTF-8.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

async function requestsCsv(year: number) {
  const rows = await q<Record<string, Cell>>(
    `select p.full_name, p.email, p.department, lt.name as leave_type,
            r.start_date::text as start_date, r.end_date::text as end_date,
            r.days::float8 as days, r.half_day, r.status::text as status,
            to_char(r.created_at at time zone 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI') as applied,
            to_char(r.decided_at at time zone 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI') as decided,
            ap.full_name as decided_by, r.reason, r.decision_note,
            (select count(*) from request_attachments a where a.request_id = r.id)::int as attachments
       from leave_requests r
       join profiles p on p.id = r.profile_id
       join leave_types lt on lt.id = r.leave_type_id
       left join profiles ap on ap.id = r.approver_id
      where extract(year from r.start_date) = $1 or extract(year from r.end_date) = $1
      order by r.start_date, p.full_name`,
    [year]
  );
  return toCsv(
    ["Employee", "Email", "Department", "Leave type", "Start", "End", "Working days", "Half day",
     "Status", "Applied", "Decided", "Decided by", "Reason", "Manager note", "Attachments"],
    rows.map((r) => [r.full_name, r.email, r.department, r.leave_type, r.start_date, r.end_date,
      r.days, r.half_day, r.status, r.applied, r.decided, r.decided_by, r.reason, r.decision_note,
      r.attachments])
  );
}

async function balancesCsv(year: number) {
  const rows = await q<Record<string, Cell>>(
    `select p.full_name, p.email, p.department, b.leave_name,
            b.cycle_start::text as cycle_start, b.cycle_end::text as cycle_end,
            b.entitled_days::float8 as entitled, b.reserved_days::float8 as reserved,
            b.accrued_days::float8 as accrued, b.used_days::float8 as used,
            b.pending_days::float8 as pending, b.available_days::float8 as available,
            b.carried_days::float8 as carried, b.carry_left::float8 as carry_left,
            b.carry_expires::text as carry_expires
       from balance_summary b join profiles p on p.id = b.profile_id
      -- Leave years run from each person's start date; "year" is the one they start in.
      where b.year = $1
      order by p.full_name, b.leave_type_id`,
    [year]
  );
  return toCsv(
    ["Employee", "Email", "Department", "Leave type", "Leave year start", "Leave year end", "Entitled",
     "Reserved", "Accrued", "Used", "Pending", "Available", "Carried over", "Carry-over left",
     "Carry-over expires"],
    rows.map((r) => [r.full_name, r.email, r.department, r.leave_name, r.cycle_start, r.cycle_end,
      r.entitled, r.reserved, r.accrued, r.used, r.pending, r.available, r.carried, r.carry_left,
      r.carry_expires])
  );
}

/** Approved working days per person, per leave type, per month — for payroll. */
async function monthlyCsv(year: number) {
  const holidays = await getHolidaySet();
  const rows = await q<{
    full_name: string; email: string; department: string | null; leave_type: string;
    start_date: string; end_date: string; half_day: string | null;
  }>(
    `select p.full_name, p.email, p.department, lt.name as leave_type,
            r.start_date::text as start_date, r.end_date::text as end_date, r.half_day
       from leave_requests r
       join profiles p on p.id = r.profile_id
       join leave_types lt on lt.id = r.leave_type_id
      where r.status = 'approved'
        and r.start_date <= make_date($1, 12, 31) and r.end_date >= make_date($1, 1, 1)`,
    [year]
  );

  const buckets = new Map<string, { info: Cell[]; months: number[] }>();
  for (const r of rows) {
    const key = `${r.email}|${r.leave_type}`;
    const b = buckets.get(key) ?? {
      info: [r.full_name, r.email, r.department, r.leave_type],
      months: Array(12).fill(0),
    };
    const cur = new Date(r.start_date + "T00:00:00Z");
    const end = new Date(r.end_date + "T00:00:00Z");
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      if (cur.getUTCFullYear() === year && !isWeekendOrHoliday(iso, holidays)) {
        b.months[cur.getUTCMonth()] += r.half_day ? 0.5 : 1;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    buckets.set(key, b);
  }

  const out = [...buckets.values()]
    .sort((a, b) => String(a.info[0]).localeCompare(String(b.info[0])))
    .map((b) => [...b.info, ...b.months, b.months.reduce((s, n) => s + n, 0)]);
  return toCsv(["Employee", "Email", "Department", "Leave type", ...MONTHS, "Total"], out);
}

const BUILDERS: Record<string, (year: number) => Promise<string>> = {
  requests: requestsCsv,
  balances: balancesCsv,
  monthly: monthlyCsv,
};

export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  const me = await getSessionProfile();
  if (!me) return new NextResponse("Not signed in", { status: 401 });
  if (me.role !== "admin") return new NextResponse("Administrator access required", { status: 403 });

  const build = BUILDERS[params.kind];
  if (!build) return new NextResponse("Unknown export", { status: 404 });

  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getUTCFullYear();
  if (year < 2000 || year > 2100) return new NextResponse("Bad year", { status: 400 });

  const csv = await build(year);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timeoff-${params.kind}-${year}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
