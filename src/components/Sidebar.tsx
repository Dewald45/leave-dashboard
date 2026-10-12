"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { LogoTag, LogoWordmark } from "@/components/Logo";

const roleLabels: Record<string, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: "Administrator",
};

const STORAGE_KEY = "timeoff:sidebar-collapsed";

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const icons = {
  dashboard:
    "M4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5v-4A1.5 1.5 0 0 1 4.5 3ZM15.5 3h4A1.5 1.5 0 0 1 21 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 14 8.5v-4A1.5 1.5 0 0 1 15.5 3ZM4.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5v-4A1.5 1.5 0 0 1 4.5 14ZM15.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5Z",
  apply:
    "M6 4h12a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM8 2v4M16 2v4M3 10h18M12 13v5M9.5 15.5h5",
  requests: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  approvals: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM8.5 12.5 11 15l4.5-5",
  team: "M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.8 3.5 2.8 3.5 5.7",
  admin:
    "M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0M15 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM17 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  collapse: "m11 7-5 5 5 5M18 7l-5 5 5 5",
  signout:
    "M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9",
};

export default function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const isManager = profile.role === "manager" || profile.role === "admin";
  const isAdmin = profile.role === "admin";

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: icons.dashboard, show: true },
    { href: "/apply", label: "Apply", icon: icons.apply, show: true },
    { href: "/requests", label: "My Requests", icon: icons.requests, show: true },
    { href: "/approvals", label: "Approvals", icon: icons.approvals, show: isManager },
    { href: "/team", label: "Team", icon: icons.team, show: isManager },
    { href: "/admin", label: "Admin", icon: icons.admin, show: isAdmin },
  ].filter((l) => l.show);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const initials = profile.full_name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const pill = (active: boolean) =>
    active
      ? "bg-ink-900 text-white shadow-sm"
      : "bg-white/70 text-ink-800 hover:bg-white";

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`sticky top-3 hidden h-[calc(100vh-1.5rem)] shrink-0 flex-col p-4 transition-[width] duration-200 md:flex ${
          collapsed ? "w-[76px]" : "w-60"
        }`}
      >
        <Link
          href="/dashboard"
          className={`flex h-11 items-center ${collapsed ? "justify-center" : "px-2"}`}
        >
          {collapsed ? (
            <LogoTag className="h-6 w-auto" />
          ) : (
            <LogoWordmark className="h-6 w-auto text-ink-900" />
          )}
        </Link>

        <nav className="mt-6 flex flex-1 flex-col gap-2" aria-label="Main">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                title={collapsed ? l.label : undefined}
                aria-label={collapsed ? l.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-full text-sm font-medium transition-colors ${
                  collapsed ? "w-11 justify-center" : "px-4"
                } ${pill(active)}`}
              >
                <Icon d={l.icon} />
                {collapsed ? null : <span className="truncate">{l.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : undefined}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex h-11 items-center gap-3 rounded-full text-sm font-medium text-sand-600 transition-colors hover:bg-white hover:text-ink-900 ${
              collapsed ? "w-11 justify-center" : "px-4"
            }`}
          >
            <Icon d={icons.collapse} className={collapsed ? "rotate-180" : ""} />
            {collapsed ? null : <span>Collapse</span>}
          </button>

          <div
            className={`flex items-center gap-3 rounded-3xl bg-white ${
              collapsed ? "flex-col p-1.5" : "p-2 pr-3"
            }`}
          >
            <span
              title={collapsed ? profile.full_name : undefined}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white"
            >
              {initials}
            </span>
            {collapsed ? null : (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-900">
                  {profile.full_name}
                </div>
                <div className="truncate text-xs text-sand-600">
                  {roleLabels[profile.role]}
                </div>
              </div>
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                title="Escape (sign out)"
                aria-label="Escape (sign out)"
                className="flex h-9 w-9 items-center justify-center rounded-full text-sand-600 transition-colors hover:bg-sand-100 hover:text-ink-900"
              >
                <Icon d={icons.signout} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 bg-sand-100/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <Link href="/dashboard" className="flex items-center">
            <LogoWordmark className="h-6 w-auto text-ink-900" />
          </Link>
          <div className="flex items-center gap-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
              {initials}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                aria-label="Escape (sign out)"
                className="flex h-11 w-11 items-center justify-center rounded-full text-sand-600 hover:bg-white hover:text-ink-900"
              >
                <Icon d={icons.signout} />
              </button>
            </form>
          </div>
        </div>
        <nav
          className="flex items-center gap-2 overflow-x-auto px-4 py-3"
          aria-label="Main"
        >
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium ${pill(active)}`}
              >
                <Icon d={l.icon} />
                {l.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
