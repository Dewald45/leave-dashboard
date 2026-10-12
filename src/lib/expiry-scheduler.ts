import { sendExpiryAlerts } from "@/lib/expiry-alerts";

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Check for expiring leave shortly after boot, then every six hours. */
export function startExpiryReminders() {
  const g = globalThis as unknown as {
    _expiryTimer?: ReturnType<typeof setInterval>;
  };
  if (g._expiryTimer) return; // already scheduled (dev hot-reload)

  const run = async () => {
    try {
      const sent = await sendExpiryAlerts();
      console.log(`[expiry] checked carried-over leave — ${sent} reminder(s) sent`);
    } catch (err) {
      console.error("[expiry] reminder run failed:", err);
    }
  };

  // Running often is harmless: each warning is only ever sent once.
  g._expiryTimer = setInterval(run, SIX_HOURS);
  setTimeout(run, 60 * 1000);
}
