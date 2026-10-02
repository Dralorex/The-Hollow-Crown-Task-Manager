"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  AccountSwitcher,
  AppHamburgerMenu,
  type NavAccount,
} from "@/app/components/account-nav-controls";
import { BrandLockup } from "@/app/components/brand-mark";
import { useLiveBadges } from "@/app/components/realtime-provider";

type NavKey =
  | "home"
  | "calendar"
  | "chat"
  | "social"
  | "notifications"
  | "profile"
  | "settings"
  | "accounts";

const TABS: {
  href: string;
  key: Exclude<NavKey, "profile" | "settings" | "accounts">;
  label: string;
  shortLabel: string;
  badge?: "chat" | "notifications";
}[] = [
  { href: "/app", key: "home", label: "Workspaces", shortLabel: "Workspace" },
  {
    href: "/app/calendar",
    key: "calendar",
    label: "Calendar",
    shortLabel: "Calendar",
  },
  {
    href: "/app/chat",
    key: "chat",
    label: "Chat",
    shortLabel: "Chat",
    badge: "chat",
  },
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
    badge: "notifications",
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
        active
          ? "bg-[color:var(--tide-foam)] text-[color:var(--tide-deep)]"
          : "bg-[color:var(--tide-coral)] text-white"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Fixed-size pending hint — no layout shift (Next useLinkStatus guidance). */
function NavPendingHint({ compact }: { compact?: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full bg-current transition-opacity ${
        compact ? "h-1 w-1" : "h-1.5 w-1.5"
      } ${pending ? "animate-pulse opacity-80" : "opacity-0"}`}
    />
  );
}

function NavTabLink({
  href,
  isActive,
  label,
  shortLabel,
  count,
  compact,
}: {
  href: string;
  isActive: boolean;
  label: string;
  shortLabel: string;
  count: number;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Link
        href={href}
        prefetch
        className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-center transition ${
          isActive
            ? "bg-[color:var(--tide-deep)] text-[color:var(--tide-foam)] shadow-sm"
            : "text-[color:var(--tide-deep)]/75"
        }`}
      >
        <span className="inline-flex max-w-full items-center justify-center gap-0.5">
          <span className="truncate text-[11px] font-semibold leading-tight">
            {shortLabel}
          </span>
          <Badge count={count} active={isActive} compact />
          <NavPendingHint compact />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      prefetch
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
        isActive
          ? "bg-[color:var(--tide-deep)] text-[color:var(--tide-foam)]"
          : "text-[color:var(--tide-deep)]/80 hover:bg-[color:var(--tide-deep)]/8"
      }`}
    >
      {label}
      <Badge count={count} active={isActive} />
      <NavPendingHint />
    </Link>
  );
}

export function AppNav({
  displayLabel,
  unreadCount = 0,
  chatUnreadCount = 0,
  accounts = [],
}: {
  displayLabel: string;
  unreadCount?: number;
  chatUnreadCount?: number;
  accounts?: NavAccount[];
}) {
  const pathname = usePathname();
  const live = useLiveBadges({ unreadCount, chatUnreadCount });

  const active: NavKey = pathname.startsWith("/app/notifications")
    ? "notifications"
    : pathname.startsWith("/app/calendar")
      ? "calendar"
      : pathname.startsWith("/app/chat")
        ? "chat"
        : pathname.startsWith("/app/social")
          ? "social"
          : pathname.startsWith("/app/settings")
            ? "settings"
            : pathname.startsWith("/app/accounts")
              ? "accounts"
              : pathname.startsWith("/app/profile")
                ? "profile"
                : "home";

  const badgeFor = (kind?: "chat" | "notifications") => {
    if (kind === "chat") return live.chatUnreadCount;
    if (kind === "notifications") return live.unreadCount;
    return 0;
  };

  const accountCluster = (compact: boolean) => (
    <div className="flex min-w-0 items-center gap-1.5">
      <AccountSwitcher
        displayLabel={displayLabel}
        accounts={accounts}
        compact={compact}
      />
      <AppHamburgerMenu accounts={accounts} />
    </div>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-[color:var(--tide-deep)]/10 bg-[color:var(--header-bg)] backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-3 pt-2.5 pb-2 md:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/app"
            prefetch
            className="text-[color:var(--tide-deep)]"
            aria-label="Rowgon home"
          >
            <BrandLockup size="sm" />
          </Link>
          {accountCluster(true)}
        </div>

        <nav
          className="mt-2.5 grid grid-cols-5 gap-0.5 rounded-xl bg-[color:var(--tide-deep)]/[0.06] p-1"
          aria-label="Main"
        >
          {TABS.map((tab) => (
            <NavTabLink
              key={tab.key}
              href={tab.href}
              isActive={active === tab.key}
              label={tab.label}
              shortLabel={tab.shortLabel}
              count={badgeFor(tab.badge)}
              compact
            />
          ))}
        </nav>
      </div>

      <div className="mx-auto hidden max-w-6xl items-center justify-between gap-4 px-4 py-3 md:flex">
        <Link
          href="/app"
          prefetch
          className="text-[color:var(--tide-deep)]"
          aria-label="Rowgon home"
        >
          <BrandLockup size="md" />
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => (
            <NavTabLink
              key={tab.key}
              href={tab.href}
              isActive={active === tab.key}
              label={tab.label}
              shortLabel={tab.shortLabel}
              count={badgeFor(tab.badge)}
            />
          ))}
        </nav>
        {accountCluster(false)}
      </div>
    </header>
  );
}
