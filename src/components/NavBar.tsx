"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";

const roleLabels: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: "Administrator",
};

export default function NavBar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const isManager = profile.role === "manager" || profile.role === "admin";
  const isAdmin = profile.role === "admin";

  const links = [
    { href: "/dashboard", label: "Dashboard", show: true },
    { href: "/apply", label: "Apply", show: true },
    { href: "/requests", label: "My Requests", show: true },
    { href: "/approvals", label: "Approvals", show: isManager },
    { href: "/team", label: "Team", show: isManager },
    { href: "/admin", label: "Admin", show: isAdmin },
  ].filter((l) => l.show);

  const initials = profile.full_name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
              L
            </span>
            <span className="text-sm font-bold text-slate-900">
              Leave Dashboard
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium text-slate-800">
              {profile.full_name}
            </div>
            <div className="text-xs text-slate-400">
              {roleLabels[profile.role]}
            </div>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {initials}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
        {links.map((l) => {
          const active =
            pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
