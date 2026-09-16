/**
 * Email notifications via Resend (https://resend.com).
 * Uses the REST API directly (no SDK dependency). All sends are best-effort:
 * failures are logged but never block the leave action.
 *
 * Env:
 *   RESEND_API_KEY  — required to actually send.
 *   RESEND_FROM     — verified sender, e.g. "Leave Dashboard <leave@yourco.co.za>".
 *                     Defaults to Resend's sandbox sender (onboarding@resend.dev),
 *                     which can only deliver to your own Resend account email
 *                     until you verify a domain.
 *   APP_URL         — base URL used in links (defaults to http://localhost:3000).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendArgs): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM || "Leave Dashboard <onboarding@resend.dev>";

  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", to);
    return;
  }
  if (!to) return;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error("[email] Resend responded", res.status, await res.text());
    }
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

function layout(
  title: string,
  bodyHtml: string,
  cta?: { href: string; label: string },
  footer = "Automated by the Leave Dashboard. Replying to this email reaches no one — use the app."
) {
  return `
  <div style="font-family:'Inter',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f5;padding:28px 16px">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:18px;overflow:hidden">
      <!-- header -->
      <div style="background:#0a0a0a;padding:18px 24px">
        <span style="display:inline-block;height:9px;width:9px;border-radius:50%;background:#ff3300;margin-right:8px;vertical-align:middle"></span>
        <span style="color:#ffffff;font-weight:800;font-size:16px;letter-spacing:-0.02em;vertical-align:middle">Leave</span>
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
          <td style="padding:9px 14px;color:#8f8f8f;font-size:13px;white-space:nowrap">${k}</td>
          <td style="padding:9px 14px;text-align:right;color:#0a0a0a;font-weight:600;font-size:13px">${v}</td>
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

/** New request submitted → notify the line manager. */
export async function notifyManagerOfRequest(args: {
  managerEmail: string;
  managerName: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
}) {
  const rows: Array<[string, string]> = [
    ["Type", args.leaveType],
    ["Dates", `${fmt(args.startDate)} → ${fmt(args.endDate)}`],
    ["Working days", String(args.days)],
  ];
  if (args.reason) rows.push(["Reason", args.reason]);

  const body = `
    <p style="margin:0 0 10px">Hi ${args.managerName || "there"},</p>
    <p style="margin:0"><strong>${args.employeeName}</strong> would like to disappear for a bit and needs your blessing.</p>
    ${detailRows(rows)}
    <p style="margin:0;color:#7a7a7a">Approve it, deny it, or sit on it forever — your call.</p>
  `;
  await sendEmail({
    to: args.managerEmail,
    subject: `${args.employeeName} wants time off — your call`,
    html: layout("A leave request needs your verdict", body, {
      href: `${appUrl()}/approvals`,
      label: "Review & decide",
    }),
  });
}

/** Request approved/rejected → notify the employee. */
export async function notifyEmployeeOfDecision(args: {
  employeeEmail: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  decision: "approved" | "rejected";
  note: string | null;
  deciderName: string;
}) {
  const approved = args.decision === "approved";
  const color = approved ? "#16a34a" : "#e02d00";
  const word = approved ? "approved" : "declined";
  const title = approved ? "You're cleared for takeoff" : "Not this time";
  const lede = approved
    ? `Good news — <strong style="color:${color}">${args.deciderName} approved</strong> your leave. Go enjoy it (responsibly).`
    : `<strong style="color:${color}">${args.deciderName} declined</strong> this one. Deep breaths — the details are below.`;

  const rows: Array<[string, string]> = [
    ["Type", args.leaveType],
    ["Dates", `${fmt(args.startDate)} → ${fmt(args.endDate)}`],
    ["Working days", String(args.days)],
  ];
  if (args.note) rows.push(["Note from your manager", args.note]);

  const body = `
    <p style="margin:0 0 10px">Hi ${args.employeeName || "there"},</p>
    <p style="margin:0">${lede}</p>
    ${detailRows(rows)}
  `;
  await sendEmail({
    to: args.employeeEmail,
    subject: approved
      ? `Your ${args.leaveType} was approved 🎉`
      : `Your ${args.leaveType} request was declined`,
    html: layout(title, body, {
      href: `${appUrl()}/requests`,
      label: "View my requests",
    }),
  });
}
