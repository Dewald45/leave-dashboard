import Link from "next/link";

/** Approvals and Team are one section; this switches between them. */
export default function TeamTabs({
  active,
  pending,
}: {
  active: "approvals" | "team";
  pending?: number;
}) {
  const tabs = [
    { key: "approvals", href: "/approvals", label: "Approvals" },
    { key: "team", href: "/team", label: "Team" },
  ] as const;

  return (
    <nav
      aria-label="Approvals and team"
      className="inline-flex self-start rounded-full bg-white p-1"
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
              on ? "bg-ink-900 text-white" : "text-ink-800 hover:bg-sand-100"
            }`}
          >
            {t.label}
            {t.key === "approvals" && pending ? (
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${
                  on ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                }`}
              >
                {pending}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
