/**
 * White card with a title row and a body that scrolls inside itself on
 * laptop-size screens (see ScreenPage). Phones: a normal card.
 */
export default function Panel({
  title,
  count,
  action,
  children,
  id,
  className = "",
  bodyClassName = "",
}: {
  title: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  className?: string;
  bodyClassName?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`flex scroll-mt-20 flex-col rounded-3xl bg-white fit:min-h-0 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold text-ink-900">
          {title}
          {count !== undefined ? (
            <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-sand-600">
              {count}
            </span>
          ) : null}
        </h2>
        {action}
      </div>
      <div className={`fit:min-h-0 fit:flex-1 fit:overflow-y-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}
