"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

type LinkProps = ComponentProps<typeof Link>;

function PendingDot({
  compact,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full bg-current transition-opacity ${
        compact ? "h-1 w-1" : "h-1.5 w-1.5"
      } ${pending ? "animate-pulse opacity-80" : "opacity-0"} ${className}`}
    />
  );
}

function PendingSheen({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-[inherit] bg-[color:var(--tide-deep)]/[0.07] transition-opacity ${
        pending ? "opacity-100" : "opacity-0"
      } ${className}`}
    />
  );
}

/**
 * In-app navigation link: prefetch + pending feedback while the destination
 * (and its loading.tsx) streams in.
 *
 * - `dot` — small pulse next to label (menus, text links)
 * - `sheen` — overlay flash (cards / full-bleed hit targets)
 * - `none` — prefetch only
 */
export function AppLink({
  href,
  className,
  children,
  pending = "dot",
  compactPending,
  ...rest
}: Omit<LinkProps, "prefetch"> & {
  pending?: "dot" | "sheen" | "none";
  compactPending?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link href={href} prefetch className={className} {...rest}>
      {children}
      {pending === "dot" ? <PendingDot compact={compactPending} /> : null}
      {pending === "sheen" ? <PendingSheen /> : null}
    </Link>
  );
}
