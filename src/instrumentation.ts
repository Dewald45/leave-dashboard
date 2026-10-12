/**
 * Runs once when the server boots. The app is a single long-lived container
 * with no external cron, so the leave-expiry reminders are scheduled in-process.
 */
export async function register() {
  // Keep the import inside this check: it is what stops the Edge build from
  // trying to bundle the Postgres client.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startExpiryReminders } = await import("./lib/expiry-scheduler");
    startExpiryReminders();
  }
}
