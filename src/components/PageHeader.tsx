/** Title row used at the top of every inner page. */
export default function PageHeader({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-1">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          {title}
        </h1>
        {children ? (
          <p className="mt-1.5 text-sm text-sand-600">{children}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
