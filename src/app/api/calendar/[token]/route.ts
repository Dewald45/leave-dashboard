import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { buildFeed, type IcsLeave } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * Personal iCal subscription feed. Authenticated by the secret token in the
 * URL (calendar apps can't send cookies). Contains the owner's pending and
 * approved leave, plus — for managers/admins — their team's approved leave.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{48}$/.test(token)) return new NextResponse("Not found", { status: 404 });

  const owner = await q1<{ id: string; full_name: string; role: string }>(
    "select id, full_name, role from profiles where calendar_token = $1",
    [token]
  );
  if (!owner) return new NextResponse("Not found", { status: 404 });

  const teamScope =
    owner.role === "admin"
      ? "or (r.status = 'approved')"
      : owner.role === "manager"
        ? "or (r.status = 'approved' and p.manager_id = $1)"
        : "";

  const rows = await q<IcsLeave & { profile_id: string }>(
    `select r.id, r.profile_id, r.start_date::text as start_date, r.end_date::text as end_date,
            r.half_day, lt.name as leave_name, r.status::text as status, r.calendar_seq,
            p.full_name as employee_name
       from leave_requests r
       join profiles p on p.id = r.profile_id
       join leave_types lt on lt.id = r.leave_type_id
      where r.end_date >= current_date - interval '90 days'
        and ((r.profile_id = $1 and r.status in ('pending','approved')) ${teamScope})
      order by r.start_date`,
    [owner.id]
  );

  const feed = buildFeed(
    owner.role === "employee" ? "TimeOff — my leave" : "TimeOff — me & my team",
    rows.map((r) => ({ ...r, mine: r.profile_id === owner.id }))
  );
  return new NextResponse(feed, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="timeoff.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
