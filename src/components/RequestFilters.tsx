import Link from "next/link";

type Option = { value: string; label: string; count: number };

/** One row of pill filters; each pill is a link, so it works without JS. */
function PillRow({
  label,
  param,
  current,
  options,
  hrefFor,
}: {
  label: string;
  param: string;
  current: string;
  options: Option[];
  hrefFor: (param: string, value: string) => string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs font-medium text-sand-600">{label}</span>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {options.map((o) => {
          const active = o.value === current;
          return (
            <Link
              key={o.value}
              href={hrefFor(param, o.value)}
              aria-current={active ? "true" : undefined}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition ${
                active
                  ? "bg-ink-900 text-white"
                  : "border border-sand-200 bg-white text-ink-800 hover:bg-sand-50"
              }`}
            >
              {o.label}
              <span className={`text-xs tabular-nums ${active ? "text-sand-300" : "text-sand-500"}`}>
                {o.count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function RequestFilters({
  status,
  type,
  statusOptions,
  typeOptions,
}: {
  status: string;
  type: string;
  statusOptions: Option[];
  typeOptions: Option[];
}) {
  const hrefFor = (param: string, value: string) => {
    const next = new URLSearchParams();
    const s = param === "status" ? value : status;
    const t = param === "type" ? value : type;
    if (s !== "all") next.set("status", s);
    if (t !== "all") next.set("type", t);
    const qs = next.toString();
    return qs ? `/requests?${qs}` : "/requests";
  };
  return (
    <nav aria-label="Filter requests" className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-6">
      <PillRow label="Status" param="status" current={status} options={statusOptions} hrefFor={hrefFor} />
      {typeOptions.length > 2 ? (
        <PillRow label="Type" param="type" current={type} options={typeOptions} hrefFor={hrefFor} />
      ) : null}
    </nav>
  );
}
