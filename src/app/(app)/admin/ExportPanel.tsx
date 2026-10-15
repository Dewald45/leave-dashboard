"use client";

import { useState } from "react";

const EXPORTS = [
  { kind: "monthly", label: "Monthly leave taken", hint: "Approved days per person, per type, per month — for payroll." },
  { kind: "requests", label: "All requests", hint: "Every request with status, approver, notes and dates." },
  { kind: "balances", label: "Balances", hint: "Per person and type, for leave years starting in this year — incl. carry-over." },
] as const;

export default function ExportPanel({ currentYear }: { currentYear: number }) {
  const [year, setYear] = useState(currentYear);
  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];

  return (
    <div className="rounded-3xl bg-white p-6">
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="export-year" className="text-sm font-medium text-ink-800">
          Year
        </label>
        <select
          id="export-year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="min-h-[40px] rounded-xl border border-sand-300 px-3 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {EXPORTS.map((e) => (
          <a
            key={e.kind}
            href={`/api/export/${e.kind}?year=${year}`}
            download
            className="group rounded-2xl border border-sand-200 p-4 transition hover:border-ink-900 hover:bg-sand-50"
          >
            <span className="flex items-center justify-between text-sm font-semibold text-ink-900">
              {e.label}
              <span className="text-xs font-medium text-brand-700">CSV ↓</span>
            </span>
            <span className="mt-1 block text-xs text-sand-500">{e.hint}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
