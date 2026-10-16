import Link from "next/link";

export type AdminTab = "people" | "defaults" | "holidays" | "exports" | "audit";

const TABS: Array<{ key: AdminTab; href: string; label: string }> = [
  { key: "people", href: "/admin", label: "People" },
  { key: "defaults", href: "/admin?tab=defaults", label: "Leave defaults" },
  { key: "holidays", href: "/admin?tab=holidays", label: "Holidays" },
  { key: "exports", href: "/admin?tab=exports", label: "Exports" },
  { key: "audit", href: "/admin/audit", label: "Audit trail" },
];

/**
 * Admin's sections, one at a time so each fits on screen. On phones the tabs
 * wrap onto a second line rather than scrolling sideways out of sight.
 */
export default function AdminTabs({ active }: { active: AdminTab }) {
  return (
    <nav
      aria-label="Administration sections"
      className="flex max-w-full flex-wrap self-start rounded-3xl bg-white p-1 sm:flex-nowrap sm:rounded-full"
    >
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors ${
              on ? "bg-ink-900 text-white" : "text-ink-800 hover:bg-sand-100"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
