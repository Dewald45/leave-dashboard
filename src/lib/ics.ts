/**
 * iCalendar (RFC 5545) builders for out-of-office events.
 *
 * Every request maps to ONE event (stable UID), so the invite emailed on
 * submission is updated in place on approval and removed on rejection or
 * cancellation — calendar clients match on UID + SEQUENCE.
 *
 * Outlook/Exchange honour X-MICROSOFT-CDO-BUSYSTATUS:OOF and show the block as
 * "Out of office". Google Calendar shows it as a busy all-day event (Google's
 * own "Out of office" event type is only settable through its API).
 */

export type IcsLeave = {
  id: string;
  start_date: string; // ISO yyyy-mm-dd
  end_date: string;
  half_day: "am" | "pm" | null;
  leave_name: string;
  status: string; // pending | approved | rejected | cancelled
  calendar_seq: number;
  employee_name: string;
  employee_email?: string;
};

// Half-day blocks in SAST (UTC+2, no daylight saving): 08:00–12:00 / 13:00–17:00.
const HALF_DAY_UTC = {
  am: { start: "060000Z", end: "100000Z" },
  pm: { start: "110000Z", end: "150000Z" },
} as const;

function escapeText(v: string) {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines to 75 octets as the spec requires. */
function fold(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (Buffer.byteLength(cur + ch, "utf8") > limit) {
      parts.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const compactDate = (iso: string) => iso.replace(/-/g, "");

function addDay(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Address part of a "Name <addr@x>" sender string. */
export function senderAddress() {
  const from = process.env.RESEND_FROM || "TimeOff <onboarding@resend.dev>";
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

function vevent(
  l: IcsLeave,
  opts: { attendee?: boolean; prefixName?: boolean } = {}
): string[] {
  const cancelled = l.status === "rejected" || l.status === "cancelled";
  const pending = l.status === "pending";
  const who = opts.prefixName ? `${l.employee_name} — ` : "";
  const summary = `${who}Out of office${pending ? " (pending approval)" : ""}`;

  const lines = [
    "BEGIN:VEVENT",
    `UID:${l.id}@timeoff`,
    `DTSTAMP:${stamp()}`,
    `SEQUENCE:${l.calendar_seq}`,
  ];
  if (l.half_day) {
    const t = HALF_DAY_UTC[l.half_day];
    lines.push(`DTSTART:${compactDate(l.start_date)}T${t.start}`);
    lines.push(`DTEND:${compactDate(l.start_date)}T${t.end}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(l.start_date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDay(l.end_date))}`);
    lines.push("X-MICROSOFT-CDO-ALLDAYEVENT:TRUE");
  }
  lines.push(
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(
      `${l.leave_name}${pending ? " — awaiting approval" : ""}. Managed in TimeOff.`
    )}`,
    `STATUS:${cancelled ? "CANCELLED" : pending ? "TENTATIVE" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "X-MICROSOFT-CDO-BUSYSTATUS:OOF",
    "X-MICROSOFT-CDO-INTENDEDSTATUS:OOF",
    "CLASS:PUBLIC"
  );
  if (opts.attendee && l.employee_email) {
    lines.push(`ORGANIZER;CN=TimeOff:mailto:${senderAddress()}`);
    lines.push(
      `ATTENDEE;CN=${escapeText(l.employee_name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${l.employee_email}`
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

function wrap(lines: string[], extra: string[] = []) {
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Media Rocket//TimeOff//EN",
      "CALSCALE:GREGORIAN",
      ...extra,
      ...lines,
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}

/** Invite / update / cancellation for a single request, for email attachment. */
export function buildInvite(l: IcsLeave): { ics: string; method: "REQUEST" | "CANCEL" } {
  const method = l.status === "rejected" || l.status === "cancelled" ? "CANCEL" : "REQUEST";
  return {
    method,
    ics: wrap(vevent(l, { attendee: true }), [`METHOD:${method}`]),
  };
}

/** Subscription feed (own leave, plus a team's leave for managers). */
export function buildFeed(name: string, events: Array<IcsLeave & { mine: boolean }>) {
  return wrap(
    events.flatMap((e) => vevent(e, { prefixName: !e.mine })),
    [
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeText(name)}`,
      "X-WR-TIMEZONE:Africa/Johannesburg",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ]
  );
}
