/**
 * Email notifications via Resend (https://resend.com).
 * Uses the REST API directly (no SDK dependency). All sends are best-effort:
 * failures are logged but never block the leave action.
 *
 * Env:
 *   RESEND_API_KEY  — required to actually send.
 *   RESEND_FROM     — verified sender, e.g. "TimeOff <leave@yourco.co.za>".
 *                     Defaults to Resend's sandbox sender (onboarding@resend.dev),
 *                     which can only deliver to your own Resend account email
 *                     until you verify a domain.
 *   APP_URL         — base URL used in links (defaults to http://localhost:3000).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type Attachment = {
  filename: string;
  /** Raw text/binary content; base64-encoded for the API. */
  content: string | Buffer;
  contentType?: string;
};

type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
};

/** Resolves true only when Resend accepted the message. */
export async function sendEmail({ to, subject, html, attachments }: SendArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM || "TimeOff <onboarding@resend.dev>";
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", recipients.join(", "));
    if (process.env.EMAIL_OUTBOX_DIR) await saveToOutbox(recipients, subject, html, attachments);
    return false;
  }
  if (recipients.length === 0) return false;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString("base64"),
          content_type: a.contentType,
        })),
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend responded", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}

/**
 * Local development only: with no RESEND_API_KEY and EMAIL_OUTBOX_DIR set,
 * write each email (and any attachment) to that folder so it can be opened
 * in a browser instead of being dropped.
 */
async function saveToOutbox(to: string[], subject: string, html: string, attachments?: Attachment[]) {
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const dir = process.env.EMAIL_OUTBOX_DIR as string;
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const header = `<div style="font:13px/1.5 monospace;background:#fffbe6;border-bottom:1px solid #e5e5e5;padding:10px 16px">
      <b>To:</b> ${esc(to.join(", "))}<br><b>Subject:</b> ${esc(subject)}${
        attachments?.length ? `<br><b>Attachments:</b> ${esc(attachments.map((a) => a.filename).join(", "))}` : ""
      }</div>`;
    await writeFile(join(dir, `${stamp}-${slug}.html`), header + html);
    for (const a of attachments ?? []) await writeFile(join(dir, `${stamp}-${a.filename}`), a.content);
  } catch (err) {
    console.error("[email] could not write to outbox:", err);
  }
}

/** HTML-escape user-supplied text before it goes into an email. */
function esc(v: string | null | undefined) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

function layout(
  title: string,
  bodyHtml: string,
  cta?: { href: string; label: string },
  footer = "Automated by TimeOff. Replying to this email reaches no one — use the app."
) {
  return `
  <div style="font-family:'Inter',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:28px 16px">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
      <!-- header -->
      <div style="background:#0a0a0a;padding:18px 24px">
        <span style="display:inline-block;height:9px;width:9px;border-radius:50%;background:#ff3300;margin-right:8px;vertical-align:middle"></span>
        <span style="color:#ffffff;font-weight:800;font-size:16px;letter-spacing:-0.02em;vertical-align:middle">TimeOff</span>
        <span style="color:#8f8f8f;font-size:12px;margin-left:8px;vertical-align:middle">Media Rocket</span>
      </div>
      <!-- body -->
      <div style="padding:26px 24px;color:#2e2e2e;font-size:14px;line-height:1.65">
        <h1 style="margin:0 0 14px;font-size:20px;font-weight:800;color:#0a0a0a;letter-spacing:-0.02em">${title}</h1>
        ${bodyHtml}
        ${
          cta
            ? `<div style="margin-top:22px">
                 <a href="${cta.href}" style="display:inline-block;background:#ff3300;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;font-size:14px">${cta.label}</a>
               </div>`
            : ""
        }
      </div>
      <!-- footer -->
      <div style="padding:16px 24px;color:#8f8f8f;font-size:12px;border-top:1px solid #f5f5f5;background:#fafafa">
        ${footer}
      </div>
    </div>
  </div>`;
}

/** A key/value details block styled to the brand. */
function detailRows(rows: Array<[string, string]>) {
  return `
    <table style="width:100%;border-collapse:collapse;margin:14px 0;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">
      ${rows
        .map(
          ([k, v], i) => `
        <tr style="background:${i % 2 ? "#fafafa" : "#ffffff"}">
          <td style="padding:9px 14px;color:#8f8f8f;font-size:13px;white-space:nowrap">${esc(k)}</td>
          <td style="padding:9px 14px;text-align:right;color:#0a0a0a;font-weight:600;font-size:13px">${esc(v)}</td>
        </tr>`
        )
        .join("")}
    </table>`;
}

function fmt(dateISO: string) {
  return new Date(dateISO + "T00:00:00Z").toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateRange(startDate: string, endDate: string, halfDay?: "am" | "pm" | null) {
  if (halfDay) return `${fmt(startDate)} (${halfDay === "am" ? "morning" : "afternoon"})`;
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} → ${fmt(endDate)}`;
}

function daysLabel(days: number, halfDay?: "am" | "pm" | null) {
  return halfDay ? "½" : String(days);
}

function requestUrl(id: string) {
  return `${appUrl()}/requests/${id}`;
}

function invite(ics: { ics: string; method: string } | undefined): Attachment[] | undefined {
  if (!ics) return undefined;
  return [
    {
      filename: ics.method === "CANCEL" ? "cancel.ics" : "out-of-office.ics",
      content: ics.ics,
      contentType: `text/calendar; charset=utf-8; method=${ics.method}`,
    },
  ];
}

type LeaveSummary = {
  requestId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  halfDay?: "am" | "pm" | null;
};

function leaveRows(l: LeaveSummary): Array<[string, string]> {
  return [
    ["Type", l.leaveType],
    ["Dates", dateRange(l.startDate, l.endDate, l.halfDay)],
    ["Working days", daysLabel(l.days, l.halfDay)],
  ];
}

/** New request submitted → notify the approver(s). */
export async function notifyManagerOfRequest(
  args: LeaveSummary & {
    to: string[];
    employeeName: string;
    reason: string | null;
    hasAttachment: boolean;
    awayNote?: string | null;
  }
) {
  const rows = leaveRows(args);
  if (args.reason) rows.push(["Reason", args.reason]);
  if (args.hasAttachment) rows.push(["Attachment", "Sick note uploaded"]);

  const body = `
    <p style="margin:0 0 10px">Hi there,</p>
    <p style="margin:0"><strong>${esc(args.employeeName)}</strong> would like to disappear for a bit and needs your blessing.</p>
    ${args.awayNote ? `<p style="margin:10px 0 0;color:#b82500">${esc(args.awayNote)}</p>` : ""}
    ${detailRows(rows)}
    <p style="margin:0;color:#7a7a7a">Approve it, deny it, or ask a question in the request thread — your call.</p>
  `;
  await sendEmail({
    to: args.to,
    subject: `${args.employeeName} wants time off — your call`,
    html: layout("A leave request needs your verdict", body, {
      href: requestUrl(args.requestId),
      label: "Review & decide",
    }),
  });
}

/** Employee's own copy of a submission, carrying the out-of-office invite. */
export async function notifyEmployeeOfSubmission(
  args: LeaveSummary & {
    employeeEmail: string;
    employeeName: string;
    /** Omitted for people whose Google Calendar is connected (it's already there). */
    ics?: { ics: string; method: string };
  }
) {
  const calLine = args.ics
    ? `We've attached an <strong>out-of-office</strong> event — open it to drop it into your calendar. It updates itself once your manager decides.`
    : `It's already in your Google Calendar as <strong>Out of office</strong> (pending approval), and it updates itself once your manager decides.`;
  const body = `
    <p style="margin:0 0 10px">Hi ${esc(args.employeeName) || "there"},</p>
    <p style="margin:0">Your request is in. ${calLine}</p>
    ${detailRows(leaveRows(args))}
  `;
  await sendEmail({
    to: args.employeeEmail,
    subject: `Out of office: ${dateRange(args.startDate, args.endDate, args.halfDay)} (pending)`,
    html: layout("Request sent up the chain", body, {
      href: requestUrl(args.requestId),
      label: "View request",
    }),
    attachments: invite(args.ics),
  });
}

/** Request approved/rejected → notify the employee (with calendar update). */
export async function notifyEmployeeOfDecision(
  args: LeaveSummary & {
    employeeEmail: string;
    employeeName: string;
    decision: "approved" | "rejected";
    note: string | null;
    deciderName: string;
    ics?: { ics: string; method: string };
    googleCalendar?: boolean;
  }
) {
  const approved = args.decision === "approved";
  const color = approved ? "#16a34a" : "#e02d00";
  const title = approved ? "You're cleared for takeoff" : "Not this time";
  const lede = approved
    ? `Good news — <strong style="color:${color}">${esc(args.deciderName)} approved</strong> your leave. Go enjoy it (responsibly).`
    : `<strong style="color:${color}">${esc(args.deciderName)} declined</strong> this one. Deep breaths — the details are below.`;
  const calNote = args.googleCalendar
    ? `<p style="margin:0;color:#7a7a7a">${
        approved
          ? "Your Google Calendar's out-of-office block is now confirmed."
          : "We've removed the out-of-office block from your Google Calendar."
      }</p>`
    : args.ics
    ? approved
      ? `<p style="margin:0;color:#7a7a7a">Your calendar's out-of-office event is now confirmed.</p>`
      : `<p style="margin:0;color:#7a7a7a">The attached update removes the out-of-office event from your calendar.</p>`
    : "";

  const rows = leaveRows(args);
  if (args.note) rows.push(["Note from your manager", args.note]);

  const body = `
    <p style="margin:0 0 10px">Hi ${esc(args.employeeName) || "there"},</p>
    <p style="margin:0">${lede}</p>
    ${detailRows(rows)}
    ${calNote}
  `;
  await sendEmail({
    to: args.employeeEmail,
    subject: approved
      ? `Your ${args.leaveType} was approved 🎉`
      : `Your ${args.leaveType} request was declined`,
    html: layout(title, body, {
      href: requestUrl(args.requestId),
      label: "View request",
    }),
    attachments: invite(args.ics),
  });
}

/** Request cancelled → employee gets the calendar removal, approvers a heads-up. */
export async function notifyCancellation(
  args: LeaveSummary & {
    employeeEmail: string;
    employeeName: string;
    wasApproved: boolean;
    cancelledByName: string;
    approverEmails: string[];
    ics?: { ics: string; method: string };
  }
) {
  await sendEmail({
    to: args.employeeEmail,
    subject: `Cancelled: ${args.leaveType}, ${dateRange(args.startDate, args.endDate, args.halfDay)}`,
    html: layout(
      "Leave cancelled",
      `<p style="margin:0">This request was cancelled by ${esc(args.cancelledByName)}. ${
        args.ics ? "The attached update removes it from your calendar." : "It's been removed from your Google Calendar."
      }</p>
       ${detailRows(leaveRows(args))}`,
      { href: requestUrl(args.requestId), label: "View request" }
    ),
    attachments: invite(args.ics),
  });

  if (args.approverEmails.length) {
    await sendEmail({
      to: args.approverEmails,
      subject: `${args.employeeName} cancelled their ${args.leaveType}`,
      html: layout(
        "Plans changed",
        `<p style="margin:0"><strong>${esc(args.employeeName)}</strong> ${
          args.wasApproved ? "cancelled approved leave" : "withdrew a pending request"
        } — nothing for you to do.</p>
         ${detailRows(leaveRows(args))}`,
        { href: requestUrl(args.requestId), label: "View request" }
      ),
    });
  }
}

/** New message in a request thread. */
export async function notifyNewMessage(args: {
  to: string[];
  requestId: string;
  authorName: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  halfDay?: "am" | "pm" | null;
  body: string;
}) {
  const quoted = esc(args.body).replace(/\n/g, "<br>");
  const html = layout(
    `${esc(args.authorName)} replied`,
    `<p style="margin:0 0 12px;color:#7a7a7a">${esc(args.employeeName)} · ${esc(args.leaveType)} · ${dateRange(
      args.startDate,
      args.endDate,
      args.halfDay
    )}</p>
     <div style="border-left:3px solid #ff3300;background:#fafafa;padding:12px 14px;border-radius:0 10px 10px 0;color:#0a0a0a">${quoted}</div>`,
    { href: requestUrl(args.requestId), label: "Reply in TimeOff" }
  );
  await sendEmail({
    to: args.to,
    subject: `New message on ${args.employeeName}'s ${args.leaveType} request`,
    html,
  });
}

/** A pending request is going stale → nudge (or escalate to) the approvers. */
export async function notifyApprovalReminder(
  args: LeaveSummary & {
    to: string[];
    employeeName: string;
    waitingDays: number;
    escalated: boolean;
  }
) {
  const title = args.escalated ? "Escalated: a request needs a decision" : "Gentle nudge";
  const lede = args.escalated
    ? `<strong>${esc(args.employeeName)}</strong> has been waiting <strong>${args.waitingDays} days</strong> for an answer, so this has been escalated to you. You can approve or decline it directly.`
    : `<strong>${esc(args.employeeName)}</strong> has been waiting <strong>${args.waitingDays} days</strong> for an answer. A yes, a no, or even a question would make their week.`;
  await sendEmail({
    to: args.to,
    subject: args.escalated
      ? `Escalated: ${args.employeeName}'s leave has waited ${args.waitingDays} days`
      : `Reminder: ${args.employeeName}'s leave is waiting on you`,
    html: layout(title, `<p style="margin:0">${lede}</p>${detailRows(leaveRows(args))}`, {
      href: requestUrl(args.requestId),
      label: "Review & decide",
    }),
  });
}

/** Carried-over leave is about to expire → warn the employee. */
export async function notifyEmployeeOfExpiry(args: {
  employeeEmail: string;
  employeeName: string;
  leaveType: string;
  days: number;
  expiresOn: string;
  daysLeft: number;
}): Promise<boolean> {
  const dayWord = args.days === 1 ? "day" : "days";
  const when =
    args.daysLeft <= 0
      ? "today"
      : args.daysLeft === 1
        ? "tomorrow"
        : `in ${args.daysLeft} days`;

  const body = `
    <p style="margin:0 0 10px">Hi ${esc(args.employeeName) || "there"},</p>
    <p style="margin:0">You still have <strong>${args.days} ${dayWord}</strong> of ${esc(args.leaveType)} left over from your last leave year, and they expire <strong style="color:#e02d00">${when}</strong>.</p>
    ${detailRows([
      ["Days about to expire", String(args.days)],
      ["Leave must start on or before", fmt(args.expiresOn)],
    ])}
    <p style="margin:0;color:#7a7a7a">Leave carried over from one leave year has to be taken within six months of the next. After that it's gone — book it or wave it goodbye.</p>
  `;
  return sendEmail({
    to: args.employeeEmail,
    subject: `${args.days} leave ${dayWord} expire ${when} — use them or lose them`,
    html: layout("Your leftover leave is about to expire", body, {
      href: `${appUrl()}/apply`,
      label: "Book it now",
    }),
  });
}

/** Self-service password reset link. */
export async function sendPasswordResetEmail(args: {
  to: string;
  name: string;
  token: string;
}) {
  const href = `${appUrl()}/reset-password?token=${encodeURIComponent(args.token)}`;
  await sendEmail({
    to: args.to,
    subject: "Reset your TimeOff password",
    html: layout(
      "Forgot something?",
      `<p style="margin:0 0 10px">Hi ${esc(args.name) || "there"},</p>
       <p style="margin:0">Someone (hopefully you) asked to reset your password. The link works once and expires in an hour.</p>
       <p style="margin:12px 0 0;color:#7a7a7a">Didn't ask? Ignore this — your password stays as it is.</p>`,
      { href, label: "Choose a new password" }
    ),
  });
}

/** Public holiday(s) coming up → heads-up for work planning + a nudge to bridge it. */
export async function notifyUpcomingHolidays(args: {
  to: string;
  name: string;
  holidays: Array<{ date: string; name: string; note: string | null }>;
  bridge: { date: string; label: string; href: string } | null;
  annualLeft: number | null;
}): Promise<boolean> {
  const dayFmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-ZA", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    });
  const list = args.holidays
    .map(
      (h) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #f5f5f5">
          <div style="font-weight:700;color:#0a0a0a">${esc(h.name)}</div>
          <div style="color:#7a7a7a;font-size:13px">${dayFmt(h.date)}${h.note ? ` · ${esc(h.note)}` : ""}</div>
        </td>
      </tr>`
    )
    .join("");

  const bridge = args.bridge
    ? `<div style="margin:16px 0 0;padding:14px 16px;border-radius:14px;background:#fff1ed;color:#6b1600">
         <strong>Make it a long one:</strong> ${esc(args.bridge.label)}
       </div>`
    : "";
  const left =
    args.annualLeft !== null
      ? `<p style="margin:12px 0 0;color:#7a7a7a">You have <strong style="color:#0a0a0a">${
          Number.isInteger(args.annualLeft) ? args.annualLeft : args.annualLeft.toFixed(1)
        }</strong> annual leave day${args.annualLeft === 1 ? "" : "s"} left to book.</p>`
      : "";

  const body = `
    <p style="margin:0 0 10px">Hi ${esc(args.name) || "there"},</p>
    <p style="margin:0">Heads-up: the office is closed for ${
      args.holidays.length === 1 ? "a public holiday" : "public holidays"
    } coming up. Plan deadlines, client comms and handovers around ${
      args.holidays.length === 1 ? "it" : "them"
    }.</p>
    <table style="width:100%;border-collapse:collapse;margin:14px 0 0;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">${list}</table>
    ${bridge}
    ${left}
  `;
  const names = args.holidays.map((h) => h.name.replace(/ \(observed\)$/, ""));
  const subject =
    names.length === 1
      ? `Public holiday coming up: ${names[0]} (${dayFmt(args.holidays[0].date).split(",")[0]})`
      : `Public holidays coming up: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return sendEmail({
    to: args.to,
    subject,
    html: layout(
      args.holidays.length === 1 ? "A public holiday is coming up" : "Public holidays are coming up",
      body,
      args.bridge
        ? { href: args.bridge.href, label: "Book the bridge day" }
        : { href: `${appUrl()}/apply`, label: "Plan some leave" },
      `Sent by TimeOff a few days before each public holiday. Don't want these? <a href="${appUrl()}/account" style="color:#7a7a7a">Turn them off on your Account page</a>.`
    ),
  });
}
