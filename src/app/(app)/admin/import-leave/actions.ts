"use server";

import { revalidatePath } from "next/cache";
import { q, q1 } from "@/lib/db";
import { getSessionProfile } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { parseLeaveReports, type ImportEmployee } from "@/lib/leave-import";

async function assertAdmin() {
  const me = await getSessionProfile();
  if (!me) throw new Error("Not signed in.");
  if (me.role !== "admin") throw new Error("Administrator access required.");
  return me;
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return (
    Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("") +
    "#7"
  );
}

async function filesFromForm(formData: FormData): Promise<{ name: string; b64: string }[]> {
  const out: { name: string; b64: string }[] = [];
  for (const f of formData.getAll("files")) {
    if (f instanceof File && f.size > 0) {
      const buf = Buffer.from(await f.arrayBuffer());
      out.push({ name: f.name, b64: buf.toString("base64") });
    }
  }
  return out;
}

function toUint8(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export interface PreviewEmployee {
  idx: number;
  key: string;
  name: string;
  initials: string;
  company: string;
  empNo: string;
  suggestedStart: string;
  approvedDays: number;
  pendingDays: number;
  txnCount: number;
  unknownTypes: string[];
  suggestedProfileId: string | null;
}

export interface LeavePreview {
  employees?: PreviewEmployee[];
  profiles?: { id: string; full_name: string; email: string }[];
  filesB64?: { name: string; b64: string }[];
  error?: string;
  done?: {
    people: number;
    created: number;
    matched: number;
    leaveAdded: number;
    leaveSkipped: number;
    warnings: string[];
    credentials: { name: string; email: string; password: string }[];
  };
}

/** Best-effort auto-match: a profile whose full name contains the report surname. */
function suggestMatch(
  emp: ImportEmployee,
  profiles: { id: string; full_name: string }[]
): string | null {
  const surname = emp.name.trim().toLowerCase();
  if (!surname) return null;
  const hits = profiles.filter((p) =>
    p.full_name.toLowerCase().split(/\s+/).includes(surname)
  );
  return hits.length === 1 ? hits[0].id : null;
}

export async function previewLeaveImport(
  _prev: LeavePreview,
  formData: FormData
): Promise<LeavePreview> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  const files = await filesFromForm(formData);
  if (files.length === 0) return { error: "Choose at least one .xlsx report to upload." };

  let employees: ImportEmployee[];
  try {
    employees = parseLeaveReports(files.map((f) => toUint8(f.b64)));
  } catch {
    return { error: "Could not read that file. Is it a valid .xlsx leave report?" };
  }
  if (employees.length === 0) {
    return { error: "No leave rows found. Expected a 'Leave Transactions Report' export." };
  }

  const profiles = await q<{ id: string; full_name: string; email: string }>(
    "select id, full_name, email from profiles order by full_name"
  );

  return {
    filesB64: files,
    profiles,
    employees: employees.map((emp, idx) => ({
      idx,
      key: emp.key,
      name: emp.name,
      initials: emp.initials,
      company: emp.company,
      empNo: emp.empNo,
      suggestedStart: emp.suggestedStart,
      approvedDays: emp.approvedDays,
      pendingDays: emp.pendingDays,
      txnCount: emp.transactions.length,
      unknownTypes: emp.unknownTypes,
      suggestedProfileId: suggestMatch(emp, profiles),
    })),
  };
}

export async function runLeaveImport(
  _prev: LeavePreview,
  formData: FormData
): Promise<LeavePreview> {
  let admin;
  try {
    admin = await assertAdmin();
  } catch (e) {
    return { error: (e as Error).message };
  }

  let files: { name: string; b64: string }[];
  try {
    files = JSON.parse(String(formData.get("filesB64") || "[]"));
  } catch {
    return { error: "Upload expired — please check the file again." };
  }
  if (!files.length) return { error: "Upload expired — please check the file again." };

  const employees = parseLeaveReports(files.map((f) => toUint8(f.b64)));
  const includeWaiting = formData.get("include_waiting") === "on";

  // Cache leave-type ids by code.
  const typeRows = await q<{ id: number; code: string }>("select id, code from leave_types");
  const typeByCode = new Map(typeRows.map((t) => [t.code, t.id]));

  let created = 0,
    matched = 0,
    leaveAdded = 0,
    leaveSkipped = 0,
    people = 0;
  const warnings: string[] = [];
  const credentials: { name: string; email: string; password: string }[] = [];

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    if (String(formData.get(`key_${i}`)) !== emp.key) {
      // Parse order drifted — safer to abort than import to the wrong person.
      return { error: "Something changed between check and import. Please check the file again." };
    }
    if (formData.get(`inc_${i}`) !== "on") continue;

    const match = String(formData.get(`match_${i}`) || "");
    const startInput = String(formData.get(`start_${i}`) || "").trim();
    const genderRaw = String(formData.get(`gender_${i}`) || "").trim().toLowerCase();
    const gender = genderRaw === "male" || genderRaw === "female" ? genderRaw : null;
    const start = startInput || emp.suggestedStart;

    let profileId: string | null = null;

    if (match && match !== "new") {
      // Matched to an existing profile.
      const exists = await q1<{ id: string }>("select id from profiles where id = $1", [match]);
      if (!exists) {
        warnings.push(`${emp.name}: selected employee no longer exists — skipped.`);
        continue;
      }
      profileId = match;
      matched++;
      if (startInput) {
        await q("update profiles set employment_start_date = $1 where id = $2", [start, profileId]);
      }
      if (gender) {
        await q("update profiles set gender = $1 where id = $2", [gender, profileId]);
      }
    } else {
      // Create a new employee.
      const email = String(formData.get(`email_${i}`) || "").trim().toLowerCase();
      if (!email) {
        warnings.push(`${emp.name}: no email given and not matched — skipped.`);
        continue;
      }
      const dup = await q1<{ id: string }>("select id from users where lower(email) = lower($1)", [email]);
      if (dup) {
        profileId = dup.id;
        matched++;
        if (startInput) await q("update profiles set employment_start_date = $1 where id = $2", [start, profileId]);
        if (gender) await q("update profiles set gender = $1 where id = $2", [gender, profileId]);
      } else {
        const tempPw = randomPassword();
        const hash = await hashPassword(tempPw);
        const user = await q1<{ id: string }>(
          "insert into users (email, password_hash) values ($1, $2) returning id",
          [email, hash]
        );
        profileId = user!.id;
        const nameInput = String(formData.get(`name_${i}`) || "").trim();
        const fullName =
          nameInput || (emp.initials ? `${emp.name} (${emp.initials})` : emp.name);
        await q(
          `insert into profiles (id, full_name, email, role, gender, employment_start_date)
           values ($1, $2, $3, 'employee', $4, $5)`,
          [profileId, fullName, email, gender, start]
        );
        created++;
        credentials.push({ name: fullName, email, password: tempPw });
      }
    }

    people++;

    // 1) Insert the leave first, so the engine's carry-over settles against
    //    real usage when we provision the cycles below.
    for (const t of emp.transactions) {
      if (!t.leaveCode) continue; // unmapped type — shown as a warning in preview
      if (t.status === "skip") continue;
      if (t.status === "pending" && !includeWaiting) continue;
      const typeId = typeByCode.get(t.leaveCode);
      if (!typeId) continue;

      const existing = await q1(
        `select 1 from leave_requests
          where profile_id = $1 and leave_type_id = $2 and start_date = $3 and end_date = $4 and days = $5`,
        [profileId, typeId, t.startDate, t.endDate, t.days]
      );
      if (existing) {
        leaveSkipped++;
        continue;
      }

      await q(
        `insert into leave_requests
           (profile_id, leave_type_id, start_date, end_date, days, reason, status, approver_id, decided_at, source)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'import')`,
        [
          profileId,
          typeId,
          t.startDate,
          t.endDate,
          t.days,
          t.reason,
          t.status,
          t.status === "approved" ? admin.id : null,
          t.status === "approved" ? new Date() : null,
        ]
      );
      leaveAdded++;
    }

    // 2) Provision the cycles the leave falls in — oldest first, then today —
    //    so the existing start-date/cycle/carry-over logic does its thing.
    const asOfDates = Array.from(
      new Set([
        ...emp.transactions.map((t) => t.startDate),
        new Date().toISOString().slice(0, 10),
      ])
    ).sort();
    for (const d of asOfDates) {
      await q("select public.provision_balances($1, $2::date)", [profileId, d]);
    }
    // Apply gender eligibility (parental vs maternity) once balances exist.
    await q("select public.sync_leave_eligibility($1)", [profileId]);
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/requests");

  return {
    done: { people, created, matched, leaveAdded, leaveSkipped, warnings, credentials },
  };
}
