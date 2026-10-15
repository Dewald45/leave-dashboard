import "server-only";
import { q } from "@/lib/db";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
};

/**
 * BCEA s23: an employer may ask for a medical certificate when an employee is
 * off sick for more than two consecutive days.
 */
export const SICK_NOTE_THRESHOLD_DAYS = 2;

/** A File from FormData, or null if the field was left empty. */
export function fileFromForm(formData: FormData, field: string): File | null {
  const f = formData.get(field);
  if (!f || typeof f === "string") return null;
  return f.size > 0 ? f : null;
}

/** Returns an error message, or null if the file is acceptable. */
export function validateAttachment(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "That file is over 5 MB — try a smaller scan or a photo.";
  }
  if (!ALLOWED_TYPES[file.type]) {
    return "Upload a PDF or an image (JPEG, PNG, WebP or HEIC).";
  }
  return null;
}

function cleanFilename(name: string) {
  const base = name.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "attachment";
}

export async function saveAttachment(requestId: string, userId: string, file: File) {
  const data = Buffer.from(await file.arrayBuffer());
  await q(
    `insert into request_attachments (request_id, uploaded_by, filename, content_type, size_bytes, data)
     values ($1, $2, $3, $4, $5, $6)`,
    [requestId, userId, cleanFilename(file.name), file.type, data.length, data]
  );
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
