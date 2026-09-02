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

function layout(title: string, bodyHtml: string, cta?: { href: string; label: string }) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
      <div style="background:#2563eb;padding:16px 24px;color:#fff;font-weight:700;font-size:15px">Leave Dashboard</div>
      <div style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6">
        <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
        ${bodyHtml}
        ${
          cta
            ? `<div style="margin-top:20px">
                 <a href="${cta.href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${cta.label}</a>
               </div>`
            : ""
        }
      </div>
      <div style="padding:14px 24px;color:#94a3b8;font-size:12px;border-top:1px solid #f1f5f9">
        This is an automated message from your company leave system.
      </div>
    </div>
  </div>`;
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
  const body = `
    <p>Hi ${args.managerName || "there"},</p>
    <p><strong>${args.employeeName}</strong> has submitted a leave request that needs your approval:</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 0;color:#64748b">Type</td><td style="padding:4px 0;text-align:right"><strong>${args.leaveType}</strong></td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Dates</td><td style="padding:4px 0;text-align:right">${fmt(args.startDate)} → ${fmt(args.endDate)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Working days</td><td style="padding:4px 0;text-align:right"><strong>${args.days}</strong></td></tr>
      ${args.reason ? `<tr><td style="padding:4px 0;color:#64748b">Reason</td><td style="padding:4px 0;text-align:right">${args.reason}</td></tr>` : ""}
    </table>
  `;
  await sendEmail({
    to: args.managerEmail,
    subject: `Leave request from ${args.employeeName} — approval needed`,
    html: layout("Leave request awaiting your approval", body, {
      href: `${appUrl()}/approvals`,
      label: "Review request",
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
  const color = approved ? "#059669" : "#e11d48";
  const word = approved ? "approved" : "declined";
  const body = `
    <p>Hi ${args.employeeName || "there"},</p>
    <p>Your leave request has been
       <strong style="color:${color}">${word}</strong> by ${args.deciderName}.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 0;color:#64748b">Type</td><td style="padding:4px 0;text-align:right"><strong>${args.leaveType}</strong></td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Dates</td><td style="padding:4px 0;text-align:right">${fmt(args.startDate)} → ${fmt(args.endDate)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Working days</td><td style="padding:4px 0;text-align:right"><strong>${args.days}</strong></td></tr>
      ${args.note ? `<tr><td style="padding:4px 0;color:#64748b">Note</td><td style="padding:4px 0;text-align:right">${args.note}</td></tr>` : ""}
    </table>
  `;
  await sendEmail({
    to: args.employeeEmail,
    subject: `Your ${args.leaveType} request was ${word}`,
    html: layout(`Leave request ${word}`, body, {
      href: `${appUrl()}/requests`,
      label: "View my requests",
    }),
  });
}
