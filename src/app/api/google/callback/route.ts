import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/session";
import { backfillUpcoming, connectWithCode, getGoogleLink } from "@/lib/googleCalendar";
import { syncGmailAutoReply } from "@/lib/gmailAutoReply";
import { q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publicUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

/** Google sends people back here after they approve (or decline) calendar access. */
export async function GET(req: NextRequest) {
  const back = (outcome: string) => {
    const res = NextResponse.redirect(publicUrl(`/account?google=${outcome}`, req));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const me = await getSessionProfile();
  if (!me) return NextResponse.redirect(publicUrl("/login", req));

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("declined");

  // The state must match what we set for this same person a moment ago.
  const [expected, forProfile, flag] = (req.cookies.get(STATE_COOKIE)?.value ?? "").split(".");
  const wantedGmail = flag === "gmail";
  const state = params.get("state");
  const code = params.get("code");
  if (!expected || !state || state !== expected || forProfile !== me.id || !code) {
    return back("failed");
  }

  try {
    const email = await connectWithCode(me.id, code);
    await audit({
      actor: me,
      action: "calendar.google_connected",
      entityType: "account",
      entityId: me.id,
      subject: me,
      summary: `Connected Google Calendar (${email})`,
      details: { google_email: email },
    });
    await backfillUpcoming(me.id);

    if (wantedGmail) {
      // People can untick the Gmail permission on Google's screen.
      const link = await getGoogleLink(me.id);
      if (!link?.gmail_allowed) return back("gmail_declined");
      await q("update google_calendar_links set gmail_reply_on = true where profile_id = $1", [me.id]);
      await audit({
        actor: me,
        action: "calendar.gmail_reply_on",
        entityType: "account",
        entityId: me.id,
        subject: me,
        summary: "Turned on the Gmail auto-reply for approved leave",
      });
      await syncGmailAutoReply(me.id, true);
      return back("gmail_on");
    }
    return back("connected");
  } catch (err) {
    console.error("[google] connect failed:", err);
    return back("failed");
  }
}
