import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/session";
import { authUrl, isGoogleConfigured } from "@/lib/googleCalendar";
import { publicUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

/** Start "Connect Google Calendar": send the person to Google's consent screen. */
export async function GET(req: NextRequest) {
  const me = await getSessionProfile();
  if (!me) return NextResponse.redirect(publicUrl("/login", req));
  if (!isGoogleConfigured()) return NextResponse.redirect(publicUrl("/account?google=unavailable", req));

  // ?gmail=1 comes from "Turn on Gmail auto-reply": ask for that permission too.
  const withGmail = req.nextUrl.searchParams.get("gmail") === "1";
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authUrl(state, me.email, withGmail));
  res.cookies.set(STATE_COOKIE, `${state}.${me.id}${withGmail ? ".gmail" : ""}`, {
    httpOnly: true,
    sameSite: "lax", // sent on Google's top-level redirect back to us
    secure: process.env.NODE_ENV === "production",
    path: "/api/google",
    maxAge: 600,
  });
  return res;
}
