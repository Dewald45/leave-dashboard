"use client";

import { useState } from "react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(s + "T00:00:00Z");

/**
 * Pick a date range on a month grid: first click sets the start, second the
 * end (clicking before the start restarts). Weekends and public holidays are
 * shown muted, since they don't cost leave.
 */
export default function RangeCalendar({
  start,
  end,
  holidays,
  holidayNames = {},
  onChange,
}: {
  start: string;
  end: string;
  holidays: ReadonlySet<string>;
  holidayNames?: Record<string, string>;
  onChange: (start: string, end: string) => void;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
  const first = parse((start || today).slice(0, 8) + "01");
  const [month, setMonth] = useState(first);
  // True while waiting for the second click.
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState("");

  const year = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const lead = (new Date(Date.UTC(year, m, 1)).getUTCDay() + 6) % 7; // Monday first
  const count = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => iso(new Date(Date.UTC(year, m, i + 1)))),
  ];

  const shift = (n: number) => setMonth(new Date(Date.UTC(year, m + n, 1)));

  const choose = (d: string) => {
    if (!picking || !start || d < start) {
      onChange(d, d);
      setPicking(true);
    } else {
      onChange(start, d);
      setPicking(false);
    }
  };

  // While picking the end, preview the range under the pointer.
  const rangeEnd = picking && hover && hover >= start ? hover : end;

  return (
    <div className="rounded-2xl border border-sand-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-800 hover:bg-sand-100"
        >
          ←
        </button>
        <p className="text-sm font-semibold text-ink-900" aria-live="polite">
          {month.toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" })}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-800 hover:bg-sand-100"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => setHover("")}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-xs font-medium text-sand-500" aria-hidden="true">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const dow = parse(d).getUTCDay();
          const off = dow === 0 || dow === 6 || holidays.has(d);
          const isStart = d === start;
          const isEnd = d === rangeEnd;
          const inRange = !!start && !!rangeEnd && d > start && d < rangeEnd;
          const label = parse(d).toLocaleDateString("en-ZA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          });
          return (
            <div
              key={d}
              className={`flex justify-center ${inRange ? "bg-brand-50" : ""} ${
                isStart && rangeEnd > start ? "rounded-l-full bg-brand-50" : ""
              } ${isEnd && rangeEnd > start ? "rounded-r-full bg-brand-50" : ""}`}
            >
              <button
                type="button"
                onClick={() => choose(d)}
                onMouseEnter={() => setHover(d)}
                aria-pressed={isStart || isEnd || inRange}
                aria-label={`${label}${holidays.has(d) ? `, public holiday${holidayNames[d] ? `: ${holidayNames[d]}` : ""}` : ""}`}
                title={holidayNames[d]}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm tabular-nums transition ${
                  isStart || isEnd
                    ? "bg-ink-900 font-semibold text-white"
                    : off
                      ? "text-sand-400 hover:bg-sand-100"
                      : "text-ink-900 hover:bg-sand-100"
                } ${d === today && !(isStart || isEnd) ? "ring-1 ring-inset ring-sand-300" : ""}`}
              >
                {Number(d.slice(8))}
                {holidays.has(d) ? (
                  <span aria-hidden="true" className="absolute bottom-1 h-1 w-1 rounded-full bg-brand-500" />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-sand-500">
        {picking ? "Now pick your last day off (or the same day for one day)." : "Pick your first day off."}{" "}
        Weekends and public holidays (dotted) are free.
      </p>
    </div>
  );
}
