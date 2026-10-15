import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/session";
import { backfillUpcoming, connectWithCode } from "@/lib/googleCalendar";
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
  const [expected, forProfile] = (req.cookies.get(STATE_COOKIE)?.value ?? "").split(".");
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
    return back("connected");
  } catch (err) {
    console.error("[google] connect failed:", err);
    return back("failed");
  }
}
