/**
 * Runs once when the server boots. The app is a single long-lived container
 * with no external cron, so background jobs are scheduled in-process:
 *  - leave-expiry reminders (carried-over annual leave), every six hours;
 *  - approval reminders / escalations, hourly, by calling our own
 *    /api/cron/reminders endpoint. Set REMINDERS=off to disable that one
 *    (e.g. to call the endpoint from an external cron with CRON_SECRET).
 */
export async function register() {
  // Keep the imports inside this check: it is what stops the Edge build from
  // trying to bundle the Postgres client.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startExpiryReminders } = await import("./lib/expiry-scheduler");
    startExpiryReminders();

    if (process.env.REMINDERS !== "off") startApprovalReminders();
  }
}

function startApprovalReminders() {
  const g = globalThis as unknown as { _approvalReminderTimer?: ReturnType<typeof setInterval> };
  if (g._approvalReminderTimer) return; // already scheduled (dev hot-reload)

  // Shared with the route handler through the process environment.
  if (!process.env.CRON_SECRET) process.env.CRON_SECRET = crypto.randomUUID();

  const port = process.env.PORT || "3000";
  const run = () =>
    fetch(`http://127.0.0.1:${port}/api/cron/reminders`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET as string },
    }).catch((err) => console.error("[reminders] run failed:", err));

  g._approvalReminderTimer = setInterval(run, 60 * 60 * 1000); // hourly…
  setTimeout(run, 60_000); // …and once shortly after boot.
}
