/** Black banner used at the top of every inner page. */
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
    <div className="rounded-2xl bg-ink-900 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {children ? (
            <p className="mt-1 text-sm text-sand-500">{children}</p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
