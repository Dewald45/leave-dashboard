import { formatDate } from "@/lib/leave";
import type { DayKind, StripWeek } from "@/lib/dashboard";

/**
 * Fill per kind. Taken / booked / pending also differ in lightness (black,
 * accent, pale accent) so they stay apart without relying on hue.
 */
const FILL: Record<DayKind, string> = {
  out: "bg-transparent",
  free: "bg-sand-200",
  holiday: "bg-white border-2 border-sand-500",
  taken: "bg-ink-900",
  booked: "bg-brand-500",
  pending: "bg-brand-200",
};

const LEGEND: [DayKind, string][] = [
  ["taken", "Taken"],
  ["booked", "Booked"],
  ["pending", "Pending"],
  ["holiday", "Public holiday"],
];

export default function YearStrip({
  weeks,
  cycleStart,
  cycleEnd,
}: {
  weeks: StripWeek[];
  cycleStart: string;
  cycleEnd: string;
}) {
  const count = (k: DayKind) => weeks.reduce((n, w) => n + w.days.filter((d) => d.kind === k).length, 0);
  const summary = `Your leave year, ${formatDate(cycleStart)} to ${formatDate(cycleEnd)}: ${count("taken")} days taken, ${count("booked")} booked, ${count("pending")} pending.`;

  return (
    <section aria-labelledby="year-h" className="rounded-3xl bg-white p-5 short:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="year-h" className="text-base font-semibold text-ink-900">
          Your leave year
        </h2>
        <span className="text-xs text-sand-600">
          {formatDate(cycleStart)} – {formatDate(cycleEnd)} · each square is a working day
        </span>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div role="img" aria-label={summary} className="flex min-w-[680px] gap-[3px]">
          {weeks.map((w) => (
            <div key={w.days[0].date} className="flex min-w-[9px] flex-1 flex-col gap-[3px]">
              <span className="h-3.5 whitespace-nowrap text-[10px] leading-none text-sand-600">{w.label}</span>
              {w.days.map((d) => (
                <span
                  key={d.date}
                  title={d.kind === "out" ? undefined : `${formatDate(d.date)}${d.note ? ` · ${d.note}` : ""}`}
                  className={`block h-3 rounded-[3px] ${FILL[d.kind]} ${
                    d.today ? "outline outline-2 outline-offset-1 outline-ink-900" : ""
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-700">
        {LEGEND.map(([k, label]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-[3px] ${FILL[k]}`} aria-hidden="true" />
            {label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-sand-200 outline outline-2 outline-offset-1 outline-ink-900" aria-hidden="true" />
          Today
        </li>
      </ul>
    </section>
  );
}
