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

  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(authUrl(state, me.email));
  res.cookies.set(STATE_COOKIE, `${state}.${me.id}`, {
    httpOnly: true,
    sameSite: "lax", // sent on Google's top-level redirect back to us
    secure: process.env.NODE_ENV === "production",
    path: "/api/google",
    maxAge: 600,
  });
  return res;
}
