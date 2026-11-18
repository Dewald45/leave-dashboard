"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { formatDate, formatDateRange } from "@/lib/leave";
import type { CalendarData, DayKind } from "@/lib/dashboard";

/**
 * The dashboard calendar.
 *
 * Replaces the old year strip, which drew one 3-pixel square per working day
 * across the whole cycle. That showed the shape of a year but you could not
 * read a date off it: the squares carried no numbers, the month labels sat on
 * week columns rather than months, and it scrolled sideways on a laptop.
 *
 * Two levels instead, so overview and detail stop fighting each other:
 *   1. A row of month chips — the whole leave year at a glance, each showing
 *      how many days of leave fall in it. Click one to open it.
 *   2. A real month grid with dates, weekday headings and today marked.
 *
 * Every marked day states what it is in text (in the cell's title and in the
 * list below), so nothing depends on telling two colours apart.
 */

/** Cell styling per kind. Fill, text and ring differ, never hue alone. */
const STYLE: Record<DayKind, string> = {
  out: "text-sand-300",
  free: "text-ink-800",
  weekend: "text-sand-300",
  holiday: "bg-amber-100 text-amber-900 border border-amber-300 font-semibold",
  closed: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  taken: "bg-ink-900 text-white font-semibold",
  booked: "bg-brand-500 text-white font-semibold",
  pending: "bg-brand-50 text-brand-800 border border-dashed border-brand-400 font-semibold",
};

const LEGEND: { kind: DayKind; label: string }[] = [
  { kind: "taken", label: "Taken" },
  { kind: "booked", label: "Booked" },
  { kind: "pending", label: "Awaiting approval" },
  { kind: "holiday", label: "Public holiday" },
  { kind: "closed", label: "Office closed" },
];

const WEEKDAYS = [
  { short: "M", full: "Monday" },
  { short: "T", full: "Tuesday" },
  { short: "W", full: "Wednesday" },
  { short: "T", full: "Thursday" },
  { short: "F", full: "Friday" },
  { short: "S", full: "Saturday" },
  { short: "S", full: "Sunday" },
];

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The Monday-first grid for a month, padded to whole weeks. */
function monthGrid(monthKey: string): (string | null)[][] {
  const [y, m] = monthKey.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // getUTCDay() is Sunday-first; shift so Monday is 0.
  const lead = (new Date(first).getUTCDay() + 6) % 7;

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 0; d < daysInMonth; d++) cells.push(iso(first + d * DAY));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * True when `next` follows `prev` with nothing but weekend days in between —
 * so a Friday and the Monday after it count as one unbroken run.
 */
function bridgesOnlyWeekend(prev: string, next: string): boolean {
  let t = Date.parse(prev + "T00:00:00Z") + DAY;
  const end = Date.parse(next + "T00:00:00Z");
  while (t < end) {
    if (!isWeekend(iso(t))) return false;
    t += DAY;
  }
  return t === end;
}

function isWeekend(date: string): boolean {
  const dow = new Date(date + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
}

export default function LeaveCalendar({
  data,
  cycleStart,
  cycleEnd,
  today,
}: {
  data: CalendarData;
  cycleStart: string;
  cycleEnd: string;
  today: string;
}) {
  const [month, setMonth] = useState(data.initialMonth);
  const index = data.months.findIndex((m) => m.key === month);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const current = data.months[index];

  /**
   * What this month holds, as a list — the calendar's text equivalent, and the
   * only part a screen reader has to read to get the whole picture.
   *
   * Runs of consecutive days with the same note collapse into one range, so
   * the December shutdown reads as a single line instead of ten identical
   * ones. Weekends inside a run don't break it: they are not leave, but they
   * are not a gap in the shutdown either.
   */
  const entries = useMemo(() => {
    const sorted = Object.entries(data.days)
      .filter(([date]) => date.startsWith(month))
      .sort(([a], [b]) => a.localeCompare(b));

    const runs: { from: string; to: string; note: string }[] = [];
    for (const [date, info] of sorted) {
      const last = runs[runs.length - 1];
      if (last && last.note === info.note && bridgesOnlyWeekend(last.to, date)) {
        last.to = date;
      } else {
        runs.push({ from: date, to: date, note: info.note });
      }
    }
    return runs;
  }, [data.days, month]);

  const totalLeave = data.months.reduce((n, m) => n + m.leaveDays, 0);

  return (
    <section aria-labelledby="cal-h" className="rounded-3xl bg-white p-5 short:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="cal-h" className="text-base font-semibold text-ink-900">
          Your leave year
        </h2>
        <p className="text-xs text-sand-600">
          {formatDate(cycleStart)} – {formatDate(cycleEnd)}
          {totalLeave > 0 ? ` · ${totalLeave} ${totalLeave === 1 ? "day" : "days"} of leave in it` : ""}
        </p>
      </div>

      {/* Level 1: the year at a glance. Each chip jumps to that month. */}
      <div
        role="tablist"
        aria-label="Months in your leave year"
        className="mt-3 flex gap-1.5 overflow-x-auto pb-1"
      >
        {data.months.map((m) => {
          const selected = m.key === month;
          const isNow = m.key === today.slice(0, 7);
          return (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMonth(m.key)}
              className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center rounded-2xl px-3 text-xs transition ${
                selected
                  ? "bg-ink-900 text-white"
                  : "bg-sand-100 text-ink-800 hover:bg-sand-200"
              }`}
            >
              <span className={`font-semibold ${isNow && !selected ? "text-brand-700" : ""}`}>
                {m.label}
              </span>
              <span className={selected ? "text-sand-300" : "text-sand-600"}>
                {m.leaveDays > 0 ? `${m.leaveDays}d` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Level 2: the month itself. */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth(data.months[Math.max(0, index - 1)].key)}
          disabled={index <= 0}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sand-300 text-ink-900 transition hover:bg-sand-50 disabled:opacity-30"
        >
          <Icon name="chevron-left" className="h-4 w-4" title="Previous month" />
        </button>
        <p className="text-sm font-semibold text-ink-900" aria-live="polite">
          {current?.label ?? month}
        </p>
        <button
          type="button"
          onClick={() => setMonth(data.months[Math.min(data.months.length - 1, index + 1)].key)}
          disabled={index >= data.months.length - 1}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sand-300 text-ink-900 transition hover:bg-sand-50 disabled:opacity-30"
        >
          <Icon name="chevron-right" className="h-4 w-4" title="Next month" />
        </button>
      </div>

      <table className="mt-2 w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">
          {current?.label ?? month}: your leave, public holidays and office closure days.
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d, i) => (
              <th
                key={i}
                scope="col"
                className="pb-1 text-[11px] font-medium uppercase tracking-wide text-sand-500"
              >
                <abbr title={d.full} className="no-underline">
                  {d.short}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                if (!date) return <td key={di} />;
                const outside = date < cycleStart || date > cycleEnd;
                const info = data.days[date];
                const kind: DayKind = outside
                  ? "out"
                  : info?.kind ?? (isWeekend(date) ? "weekend" : "free");
                const isToday = date === today;
                const label = outside
                  ? `${formatDate(date)} — outside your leave year`
                  : `${formatDate(date)}${info ? ` — ${info.note}` : ""}`;
                return (
                  <td key={di} className="p-0 align-middle">
                    <span
                      title={label}
                      aria-label={label}
                      className={`flex h-9 items-center justify-center rounded-xl text-sm tabular-nums short:h-8 ${
                        STYLE[kind]
                      } ${isToday ? "outline outline-2 outline-offset-1 outline-brand-500" : ""}`}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-700">
        {LEGEND.map(({ kind, label }) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span className={`h-3.5 w-3.5 rounded-[5px] ${STYLE[kind]}`} aria-hidden="true" />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            className="h-3.5 w-3.5 rounded-[5px] bg-sand-100 outline outline-2 outline-offset-1 outline-brand-500"
            aria-hidden="true"
          />
          Today
        </li>
      </ul>

      {entries.length ? (
        <ul className="mt-3 space-y-1 border-t border-sand-200 pt-3 text-xs text-ink-800">
          {entries.map((e) => (
            <li key={e.from} className="flex gap-2">
              <span className="w-36 shrink-0 tabular-nums text-sand-600">
                {e.from === e.to ? formatDate(e.from) : formatDateRange(e.from, e.to)}
              </span>
              <span>{e.note}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-sand-200 pt-3 text-xs text-sand-600">
          Nothing booked this month.
        </p>
      )}
    </section>
  );
}
