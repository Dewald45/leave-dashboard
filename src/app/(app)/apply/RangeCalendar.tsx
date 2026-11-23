"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

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
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sand-300 text-ink-900 transition hover:bg-sand-50"
        >
          <Icon name="chevron-left" className="h-4 w-4" title="Previous month" />
        </button>
        <p className="text-sm font-semibold text-ink-900" aria-live="polite">
          {month.toLocaleDateString("en-ZA", { month: "short", year: "2-digit", timeZone: "UTC" })}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sand-300 text-ink-900 transition hover:bg-sand-50"
        >
          <Icon name="chevron-right" className="h-4 w-4" title="Next month" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center" onMouseLeave={() => setHover("")}>
        {WEEKDAYS.map((w, i) => (
          <div key={`${w}${i}`} className="pb-0.5 text-[10px] font-medium uppercase tracking-wide text-sand-500" aria-hidden="true">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const dow = parse(d).getUTCDay();
          const off = dow === 0 || dow === 6 || holidays.has(d);
          const isStart = d === start;
          const isEnd = d === rangeEnd;
          const label = parse(d).toLocaleDateString("en-ZA", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          });
          const sel = (x: string | null) => !!x && !!start && !!rangeEnd && x >= start && x <= rangeEnd;
          const hol = (x: string | null) => !!x && holidays.has(x);
          const col = i % 7;
          const prev = col > 0 ? cells[i - 1] : null;
          const next = col < 6 ? cells[i + 1] ?? null : null;
          const selected = sel(d);
          const holiday = !selected && hol(d);
          const joinL = selected ? sel(prev) : holiday && hol(prev) && !sel(prev);
          const joinR = selected ? sel(next) : holiday && hol(next) && !sel(next);
          const fill = selected
            ? isStart || isEnd
              ? "bg-ink-900 text-white font-semibold"
              : "bg-brand-500 text-white font-semibold"
            : holiday
              ? "bg-amber-100 text-amber-900 border border-amber-300 font-semibold"
              : off
                ? "text-sand-300 hover:bg-sand-100"
                : "text-ink-800 hover:bg-sand-100";
          const shape = [
            joinL ? "rounded-l-none border-l-0" : "rounded-l-lg ml-0.5",
            joinR ? "rounded-r-none border-r-0" : "rounded-r-lg mr-0.5",
          ].join(" ");
          return (
            <button
              key={d}
              type="button"
              onClick={() => choose(d)}
              onMouseEnter={() => setHover(d)}
              aria-pressed={selected}
              aria-label={`${label}${holidays.has(d) ? `, public holiday${holidayNames[d] ? `: ${holidayNames[d]}` : ""}` : ""}`}
              title={holidayNames[d]}
              className={`relative flex h-8 items-center justify-center text-[13px] tabular-nums transition ${shape} ${fill} ${
                d === today ? "z-10 rounded-lg outline outline-2 outline-offset-[-2px] outline-brand-500" : ""
              }`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-sand-500">
        {picking ? "Now pick your last day off (or the same day for one day)." : "Pick your first day off."}{" "}
        Weekends and public holidays are free.
      </p>
    </div>
  );
}
