/**
 * Reading and checking an employee spreadsheet (CSV) for the bulk import.
 * Pure functions: the admin action does the database checks and the import.
 */

export type ImportRow = {
  line: number;
  full_name: string;
  email: string;
  role: string;
  manager_email: string;
  department: string;
  job_title: string;
  gender: string;
  start_date: string;
  problems: string[];
};

export const MAX_IMPORT_ROWS = 500;

/**
 * RFC 4180-ish: quoted fields, doubled quotes, separators and line breaks
 * inside quotes. Excel set to a South African locale saves with semicolons, so
 * the separator is whichever the heading row uses.
 */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = !firstLine.includes(",") && firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Column headings people are likely to use, mapped to our fields. */
const HEADINGS: Record<string, keyof Omit<ImportRow, "line" | "problems">> = {
  "full name": "full_name",
  name: "full_name",
  "full_name": "full_name",
  email: "email",
  "work email": "email",
  "email address": "email",
  role: "role",
  "manager email": "manager_email",
  manager_email: "manager_email",
  "line manager email": "manager_email",
  manager: "manager_email",
  department: "department",
  "job title": "job_title",
  job_title: "job_title",
  title: "job_title",
  gender: "gender",
  "start date": "start_date",
  start_date: "start_date",
  "employment start date": "start_date",
  "employment_start_date": "start_date",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** YYYY-MM-DD, or SA-style DD/MM/YYYY, to ISO; "" when blank; null when unreadable. */
export function toIsoDate(v: string): string | null {
  const t = v.trim();
  if (!t) return "";
  let y: number, m: number, d: number;
  let match = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)))
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Rows from the spreadsheet with anything wrong listed per row. `existing` is
 * the set of emails that already have an account (lower-case).
 */
export function readImport(text: string, existing: Set<string>): { rows: ImportRow[]; error?: string } {
  const grid = parseCsv(text);
  if (grid.length < 2) return { rows: [], error: "The file needs a heading row and at least one person." };
  const header = grid[0].map((h) => HEADINGS[h.trim().toLowerCase()]);
  if (!header.includes("full_name") || !header.includes("email")) {
    return { rows: [], error: "Couldn't find the Full name and Email columns. Start from the template." };
  }
  if (grid.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], error: `That's more than ${MAX_IMPORT_ROWS} people. Split the file and import it in parts.` };
  }

  const rows: ImportRow[] = grid.slice(1).map((cells, i) => {
    const r: ImportRow = {
      line: i + 2,
      full_name: "",
      email: "",
      role: "",
      manager_email: "",
      department: "",
      job_title: "",
      gender: "",
      start_date: "",
      problems: [],
    };
    header.forEach((key, col) => {
      if (key) r[key] = (cells[col] ?? "").trim();
    });
    r.email = r.email.toLowerCase();
    r.manager_email = r.manager_email.toLowerCase();
    r.role = r.role.toLowerCase() || "employee";
    r.gender = r.gender.toLowerCase();
    return r;
  });

  const inFile = new Map<string, number>();
  for (const r of rows) {
    if (!r.full_name) r.problems.push("Name is missing");
    if (!r.email) r.problems.push("Email is missing");
    else if (!EMAIL.test(r.email)) r.problems.push("Email doesn't look right");
    else if (existing.has(r.email)) r.problems.push("Already has an account");
    else if (inFile.has(r.email)) r.problems.push(`Same email as row ${inFile.get(r.email)}`);
    else inFile.set(r.email, r.line);

    if (!["employee", "manager", "admin"].includes(r.role)) r.problems.push("Role must be employee, manager or admin");
    if (r.gender && !["male", "female"].includes(r.gender)) r.problems.push("Gender must be male, female or blank");

    const iso = toIsoDate(r.start_date);
    if (iso === null) r.problems.push("Start date should look like 2024-03-01");
    else r.start_date = iso;
  }
  // Rows that will be skipped, so people reporting to them aren't added
  // without their manager.
  const skipped = new Set(rows.filter((r) => r.problems.length).map((r) => r.email));
  for (const r of rows) {
    if (!r.manager_email) continue;
    if (r.manager_email === r.email) r.problems.push("Can't be their own manager");
    else if (existing.has(r.manager_email)) continue;
    else if (!inFile.has(r.manager_email)) {
      r.problems.push("Manager not found (needs an account, or a row in this file)");
    } else if (skipped.has(r.manager_email)) {
      r.problems.push(`Their manager's row (${inFile.get(r.manager_email)}) has a problem`);
    }
  }
  return { rows };
}
