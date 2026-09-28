"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

type NavKey = "home" | "calendar" | "chat" | "social" | "notifications";

const TABS: {
  href: string;
  key: NavKey;
  /** Desktop label */
  label: string;
  /** Phone strip label (kept short) */
  shortLabel: string;
}[] = [
  { href: "/app", key: "home", label: "Workspaces", shortLabel: "Workspace" },
  {
    href: "/app/calendar",
    key: "calendar",
    label: "Calendar",
    shortLabel: "Calendar",
  },
  { href: "/app/chat", key: "chat", label: "Chat", shortLabel: "Chat" },
  {
    href: "/app/social",
    key: "social",
    label: "Friends",
    shortLabel: "Friends",
  },
  {
    href: "/app/notifications",
    key: "notifications",
    label: "Alerts",
    shortLabel: "Alerts",
  },
];

function Badge({
  count,
  active,
  compact,
}: {
  count: number;
  active: boolean;
  compact?: boolean;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`rounded-full font-semibold ${
        compact
          ? "min-w-[1rem] px-1 text-[9px] leading-4"
          : "min-w-[1.25rem] px-1.5 text-[11px] leading-5"
      } ${
        active ? "bg-[#E8F7F6] text-[#0A3D45]" : "bg-[#E85D4C] text-white"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function activeKey(pathname: string): NavKey {
  if (pathname.startsWith("/app/notifications")) return "notifications";
  if (pathname.startsWith("/app/calendar")) return "calendar";
  if (pathname.startsWith("/app/chat")) return "chat";
  if (pathname.startsWith("/app/social")) return "social";
  return "home";
}

export function AppNav({
  username,
  unreadCount = 0,
  chatUnreadCount = 0,
}: {
  username: string;
  /** @deprecated active is derived from the path */
  active?: NavKey;
  unreadCount?: number;
  chatUnreadCount?: number;
}) {
  const pathname = usePathname() ?? "/app";
  const active = activeKey(pathname);

  function badgeCount(key: NavKey) {
    if (key === "chat") return chatUnreadCount;
    if (key === "notifications") return unreadCount;
    return 0;
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[#0A3D45]/10 bg-[#E8F7F6]/85 backdrop-blur-md">
      {/* Phone: brand row + equal 5-tab strip (Spaces · Calendar · Chat · Friends · Alerts) */}
      <div className="mx-auto max-w-6xl px-3 pt-2.5 pb-2 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/app"
            className="font-[family-name:var(--font-display)] text-lg text-[#0A3D45]"
          >
            Rowgon
          </Link>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="max-w-[9rem] truncate text-xs text-[#0A3D45]/70">
              @{username}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="shrink-0 text-xs text-[#0A3D45]/70 underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav
          className="mt-2.5 grid grid-cols-5 gap-0.5 rounded-xl bg-[#0A3D45]/[0.06] p-1"
          aria-label="Main"
        >
          {TABS.map((tab) => {
            const isActive = active === tab.key;
            const count = badgeCount(tab.key);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-center transition ${
                  isActive
                    ? "bg-[#0A3D45] text-[#E8F7F6] shadow-sm"
                    : "text-[#0A3D45]/75"
                }`}
              >
                <span className="inline-flex max-w-full items-center justify-center gap-0.5">
                  <span className="truncate text-[11px] font-semibold leading-tight">
                    {tab.shortLabel}
                  </span>
                  <Badge count={count} active={isActive} compact />
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop: single-row layout */}
      <div className="mx-auto hidden max-w-6xl items-center justify-between gap-4 px-4 py-3 md:flex">
        <Link
          href="/app"
          className="font-[family-name:var(--font-display)] text-xl text-[#0A3D45]"
        >
          Rowgon
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const isActive = active === tab.key;
            const count = badgeCount(tab.key);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "bg-[#0A3D45] text-[#E8F7F6]"
                    : "text-[#0A3D45]/80 hover:bg-[#0A3D45]/8"
                }`}
              >
                {tab.label}
                <Badge count={count} active={isActive} />
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#0A3D45]/70">@{username}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm text-[#0A3D45]/70 underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
