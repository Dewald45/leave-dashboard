import { NextResponse, type NextRequest } from "next/server";
import { destroySession, getSessionProfile } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const me = await getSessionProfile();
  await destroySession();
  if (me) {
    await audit({
      actor: me,
      action: "auth.signed_out",
      entityType: "account",
      entityId: me.id,
      subject: me,
      summary: "Signed out",
    });
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
