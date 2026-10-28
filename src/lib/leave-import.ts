import "server-only";
import { parseXlsxSheet, excelSerialToISO } from "@/lib/xlsx";

/**
 * Parser for the "Leave Transactions Report" .xlsx export (one row per leave
 * application). Produces per-employee groups with their individual transactions,
 * mapped onto this app's leave-type codes. Nothing is written here.
 */

export type ImportStatus = "approved" | "pending" | "skip";

export interface ImportTxn {
  leaveCode: string | null; // mapped code (annual/sick/family/…) or null if unknown
  leaveLabel: string; // original label from the report
  status: ImportStatus;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  reason: string | null;
}

export interface ImportEmployee {
  key: string; // stable id: company|name|initials
  empNo: string;
  name: string; // "Employee Name" from the report (usually a surname)
  initials: string;
  company: string;
  suggestedStart: string; // earliest transaction date (a lower-bound hint)
  transactions: ImportTxn[];
  approvedDays: number;
  pendingDays: number;
  unknownTypes: string[];
}

const TYPE_MAP: Record<string, string> = {
  annual: "annual",
  "annual leave": "annual",
  sick: "sick",
  "sick leave": "sick",
  family: "family",
  "family responsibility": "family",
  parental: "parental",
  paternity: "parental",
  maternity: "maternity",
};

function mapType(label: string): string | null {
  return TYPE_MAP[label.trim().toLowerCase()] ?? null;
}

function mapStatus(s: string): ImportStatus {
  const v = s.trim().toLowerCase();
  if (v.startsWith("approve")) return "approved";
  if (v.startsWith("wait") || v.startsWith("pend")) return "pending";
  return "skip";
}

function toISO(v: string): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToISO(Math.round(parseFloat(s)));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function detectCompany(rows: string[][]): string {
  for (const r of rows) {
    for (const c of r) {
      const m = (c || "").match(/Company\s*:\s*(.+)/i);
      if (m) return m[1].trim();
    }
  }
  return "Unknown";
}

/** Parse one report file's bytes into grouped employees. */
export function parseLeaveReport(buf: Uint8Array): ImportEmployee[] {
  const rows = parseXlsxSheet(buf);
  const headerIdx = rows.findIndex((r) =>
    r.some((c) => (c || "").trim() === "Emp. Number")
  );
  if (headerIdx < 0) return [];
  const company = detectCompany(rows);

  const employees = new Map<string, ImportEmployee>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const empNo = (r[0] || "").trim();
    const name = (r[1] || "").trim();
    const initials = (r[2] || "").trim();
    const typeLabel = (r[4] || "").trim();
    const status = (r[6] || "").trim();
    const startISO = toISO(r[7] || "");
    const endISO = toISO(r[8] || "");
    const days = parseFloat((r[9] || "").trim());
    const reason = (r[12] || "").trim() || null;

    // Skip header/group noise rows and anything incomplete.
    if (!empNo || !name) continue;
    if (empNo.includes(":") || name.includes(":")) continue;
    if (empNo === "Emp. Number") continue;
    if (!startISO || !endISO || !isFinite(days) || days <= 0) continue;

    const key = `${company}|${name}|${initials}`;
    let emp = employees.get(key);
    if (!emp) {
      emp = {
        key,
        empNo,
        name,
        initials,
        company,
        suggestedStart: startISO,
        transactions: [],
        approvedDays: 0,
        pendingDays: 0,
        unknownTypes: [],
      };
      employees.set(key, emp);
    }
    if (startISO < emp.suggestedStart) emp.suggestedStart = startISO;

    const leaveCode = mapType(typeLabel);
    const st = mapStatus(status);
    if (!leaveCode && !emp.unknownTypes.includes(typeLabel)) {
      emp.unknownTypes.push(typeLabel);
    }
    if (st === "approved") emp.approvedDays += days;
    else if (st === "pending") emp.pendingDays += days;

    emp.transactions.push({
      leaveCode,
      leaveLabel: typeLabel,
      status: st,
      startDate: startISO,
      endDate: endISO,
      days,
      reason,
    });
  }
  return [...employees.values()];
}

export function parseLeaveReports(files: Uint8Array[]): ImportEmployee[] {
  return files.flatMap((f) => parseLeaveReport(f));
}
