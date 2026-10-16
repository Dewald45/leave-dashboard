import "server-only";
import { q, q1 } from "@/lib/db";
import { open, seal } from "@/lib/secretBox";

/**
 * Per-person Google Calendar sync ("Connect Google Calendar" on Account).
 *
 * Each person grants TimeOff access to their own calendar once (OAuth, offline
 * access). After that their leave is written to their primary calendar as a
 * Google "Out of office" event: created on submit (marked pending), confirmed
 * on approval, removed on rejection or cancellation.
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (a "Web application" OAuth client
 * whose redirect URI is <APP_URL>/api/google/callback).
 */

// Overridable only so the flow can be tested against a local stand-in for Google.
const AUTH_BASE = process.env.GOOGLE_AUTH_BASE || "https://accounts.google.com";
const OAUTH2_BASE = process.env.GOOGLE_OAUTH2_BASE || "https://oauth2.googleapis.com";
const API_BASE = process.env.GOOGLE_API_BASE || "https://www.googleapis.com";
const AUTH_URL = `${AUTH_BASE}/o/oauth2/v2/auth`;
const TOKEN_URL = `${OAUTH2_BASE}/token`;
const REVOKE_URL = `${OAUTH2_BASE}/revoke`;
const EVENTS_URL = `${API_BASE}/calendar/v3/calendars/primary/events`;
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];
/** Asked for only when someone turns on the Gmail auto-reply. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.settings.basic";
const TZ = "Africa/Johannesburg";

export function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function appUrl() {
  return process.env.APP_URL || "http://localhost:3000";
}

export function redirectUri() {
  return `${appUrl()}/api/google/callback`;
}

/** Where to send someone to approve calendar access. */
export function authUrl(state: string, loginHint?: string, withGmail = false) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: (withGmail ? [...SCOPES, GMAIL_SCOPE] : SCOPES).join(" "),
    access_type: "offline",
    // Always show consent so Google returns a refresh token every time.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  /** Space-separated permissions actually granted (including earlier ones). */
  scope?: string;
  error?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      ...body,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw Object.assign(new Error(json.error || `token ${res.status}`), { code: json.error });
  return json;
}

/** Email inside an ID token received straight from Google's token endpoint. */
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Finish the OAuth flow and remember the person's calendar. */
export async function connectWithCode(profileId: string, code: string) {
  const t = await tokenRequest({
    code,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
  if (!t.refresh_token) throw new Error("Google didn't return offline access — try again.");
  const email = emailFromIdToken(t.id_token) ?? "unknown";
  await q(
    `insert into google_calendar_links (profile_id, google_email, refresh_token_enc, scopes)
     values ($1, $2, $3, $4)
     on conflict (profile_id) do update
       set google_email = excluded.google_email,
           refresh_token_enc = excluded.refresh_token_enc,
           scopes = excluded.scopes,
           connected_at = now()`,
    [profileId, email, seal(t.refresh_token), t.scope ?? ""]
  );
  tokenCache.set(profileId, { token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 });
  return email;
}

export function getGoogleLink(profileId: string) {
  return q1<{
    google_email: string;
    connected_at: string;
    gmail_allowed: boolean;
    gmail_reply_on: boolean;
    gmail_reply_message: string | null;
  }>(
    `select google_email, connected_at::text,
            position($2 in scopes) > 0 as gmail_allowed,
            gmail_reply_on, gmail_reply_message
       from google_calendar_links where profile_id = $1`,
    [profileId, GMAIL_SCOPE]
  );
}

/** Forget the link and revoke TimeOff's access at Google. Events already made stay. */
export async function disconnect(profileId: string) {
  // Switch off an auto-reply TimeOff set while it still has access to do so.
  try {
    const { stopOurAutoReply } = await import("@/lib/gmailAutoReply");
    await stopOurAutoReply(profileId);
  } catch (err) {
    console.error("[gmail] couldn't switch off auto-reply on disconnect:", err);
  }
  const row = await q1<{ refresh_token_enc: string }>(
    "delete from google_calendar_links where profile_id = $1 returning refresh_token_enc",
    [profileId]
  );
  tokenCache.delete(profileId);
  if (!row) return;
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(open(row.refresh_token_enc))}`, {
      method: "POST",
    });
  } catch (err) {
    console.error("[google] revoke failed:", err);
  }
}

// Short-lived access tokens, per person, in memory.
const g = globalThis as unknown as { _gTokens?: Map<string, { token: string; expires: number }> };
const tokenCache = (g._gTokens ??= new Map());

/** A fresh access token, or null if this person hasn't connected (or revoked it). */
export async function accessToken(profileId: string): Promise<string | null> {
  const cached = tokenCache.get(profileId);
  if (cached && cached.expires > Date.now()) return cached.token;

  const row = await q1<{ refresh_token_enc: string }>(
    "select refresh_token_enc from google_calendar_links where profile_id = $1",
    [profileId]
  );
  if (!row) return null;
  let refreshToken: string;
  try {
    refreshToken = open(row.refresh_token_enc);
  } catch {
    // Encryption key changed (TOKEN_ENCRYPTION_KEY / client secret rotated):
    // the stored token is unreadable, so ask the person to reconnect.
    await q("delete from google_calendar_links where profile_id = $1", [profileId]);
    console.error("[google] stored token unreadable — link removed, person must reconnect");
    return null;
  }
  try {
    const t = await tokenRequest({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    tokenCache.set(profileId, { token: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 });
    return t.access_token;
  } catch (err) {
    // Access was revoked at Google, or the password changed: drop the link so
    // the Account page offers to reconnect instead of failing silently.
    if ((err as { code?: string }).code === "invalid_grant") {
      await q("delete from google_calendar_links where profile_id = $1", [profileId]);
      tokenCache.delete(profileId);
    }
    console.error("[google] token refresh failed:", err);
    return null;
  }
}

export async function hasGoogleCalendar(profileId: string) {
  if (!isGoogleConfigured()) return false;
  return !!(await q1("select 1 from google_calendar_links where profile_id = $1", [profileId]));
}

function addDay(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type LeaveForEvent = {
  id: string;
  start_date: string;
  end_date: string;
  half_day: "am" | "pm" | null;
  leave_name: string;
  status: string;
};

/** Event body. Whole days run midnight to midnight SA time; half days 08–12 / 13–17. */
export function eventBody(r: LeaveForEvent, outOfOffice = true) {
  const pending = r.status === "pending";
  const [start, end] = r.half_day
    ? r.half_day === "am"
      ? [`${r.start_date}T08:00:00`, `${r.start_date}T12:00:00`]
      : [`${r.start_date}T13:00:00`, `${r.start_date}T17:00:00`]
    : [`${r.start_date}T00:00:00`, `${addDay(r.end_date)}T00:00:00`];
  const body: Record<string, unknown> = {
    summary: pending ? "Out of office (pending approval)" : "Out of office",
    description: `${r.leave_name}${pending ? " — waiting for approval" : ""}. Managed in TimeOff: ${appUrl()}/requests/${r.id}`,
    start: { dateTime: start, timeZone: TZ },
    end: { dateTime: end, timeZone: TZ },
    transparency: "opaque",
    extendedProperties: { private: { timeoffRequestId: r.id } },
  };
  if (outOfOffice) {
    body.eventType = "outOfOffice";
    body.outOfOfficeProperties = {
      autoDeclineMode: "declineOnlyNewConflictingInvitations",
      declineMessage: "I'm on leave — I'll get back to you when I'm back.",
    };
  }
  return body;
}

async function gfetch(token: string, url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/**
 * Bring a request's Google event in line with its status. Best-effort: never
 * throws, so leave actions don't fail because Google is unhappy.
 */
export async function syncRequestToGoogle(requestId: string): Promise<void> {
  if (!isGoogleConfigured()) return;
  await syncCalendarEvent(requestId);
  // The Gmail auto-reply follows the person's next approved leave, so any
  // change to their requests may move it.
  try {
    const owner = await q1<{ profile_id: string }>(
      "select profile_id from leave_requests where id = $1",
      [requestId]
    );
    if (owner) {
      const { syncGmailAutoReply } = await import("@/lib/gmailAutoReply");
      await syncGmailAutoReply(owner.profile_id);
    }
  } catch (err) {
    console.error("[gmail] auto-reply sync failed:", err);
  }
}

async function syncCalendarEvent(requestId: string): Promise<void> {
  try {
    const r = await q1<LeaveForEvent & { profile_id: string; google_event_id: string | null }>(
      `select r.id, r.profile_id, r.start_date::text as start_date, r.end_date::text as end_date,
              r.half_day, lt.name as leave_name, r.status::text as status, e.google_event_id
         from leave_requests r
         join leave_types lt on lt.id = r.leave_type_id
         left join request_google_events e on e.request_id = r.id
        where r.id = $1`,
      [requestId]
    );
    if (!r) return;
    const token = await accessToken(r.profile_id);
    if (!token) return;

    const gone = r.status === "rejected" || r.status === "cancelled";

    if (gone) {
      if (r.google_event_id) {
        const res = await gfetch(token, `${EVENTS_URL}/${encodeURIComponent(r.google_event_id)}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          console.error("[google] delete failed", res.status, await res.text());
          return;
        }
        await q("delete from request_google_events where request_id = $1", [r.id]);
      }
      return;
    }

    if (r.google_event_id) {
      // Already there: update the wording (pending → approved).
      const body = eventBody(r);
      const res = await gfetch(token, `${EVENTS_URL}/${encodeURIComponent(r.google_event_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ summary: body.summary, description: body.description }),
      });
      if (res.ok) return;
      if (res.status !== 404 && res.status !== 410) {
        console.error("[google] update failed", res.status, await res.text());
        return;
      }
      // Deleted by hand in Google: fall through and recreate it.
      await q("delete from request_google_events where request_id = $1", [r.id]);
    }

    let res = await gfetch(token, EVENTS_URL, { method: "POST", body: JSON.stringify(eventBody(r)) });
    if (res.status === 400) {
      // "Out of office" events need a Google Workspace calendar; plain Gmail
      // accounts get an ordinary busy event instead.
      res = await gfetch(token, EVENTS_URL, { method: "POST", body: JSON.stringify(eventBody(r, false)) });
    }
    if (!res.ok) {
      console.error("[google] create failed", res.status, await res.text());
      return;
    }
    const created = (await res.json()) as { id: string };
    await q(
      `insert into request_google_events (request_id, profile_id, google_event_id) values ($1, $2, $3)
       on conflict (request_id) do update set google_event_id = excluded.google_event_id`,
      [r.id, r.profile_id, created.id]
    );
  } catch (err) {
    console.error("[google] sync failed:", err);
  }
}

/** After connecting: put upcoming pending/approved leave into the calendar. */
export async function backfillUpcoming(profileId: string) {
  const rows = await q<{ id: string }>(
    `select id from leave_requests
      where profile_id = $1 and status in ('pending','approved') and end_date >= current_date`,
    [profileId]
  );
  for (const r of rows) await syncRequestToGoogle(r.id);
  return rows.length;
}
