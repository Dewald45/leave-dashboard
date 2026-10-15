import { NextResponse } from "next/server";
import { q1 } from "@/lib/db";
import { getSessionProfile } from "@/lib/session";
import { canViewRequest } from "@/lib/data";

export const dynamic = "force-dynamic";

const INLINE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getSessionProfile();
  if (!me) return new NextResponse("Not signed in", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new NextResponse("Not found", { status: 404 });

  const file = await q1<{
    request_id: string;
    filename: string;
    content_type: string;
    data: Buffer;
  }>(
    "select request_id, filename, content_type, data from request_attachments where id = $1",
    [params.id]
  );
  // Same 404 whether it doesn't exist or you can't see it.
  if (!file || !(await canViewRequest(file.request_id, me.id))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const disposition = INLINE_TYPES.has(file.content_type) ? "inline" : "attachment";
  const asciiName = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.content_type,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
