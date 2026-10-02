"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { AppRouteLoading } from "@/app/components/app-route-loading";

type SoftNavContextValue = {
  /** True from click until the RSC soft-navigation finishes. */
  pending: boolean;
  /** Href currently being soft-navigated to (for per-link feedback). */
  pendingHref: string | null;
  navigate: (href: string) => void;
};

const SoftNavContext = createContext<SoftNavContextValue | null>(null);

export function useSoftNav() {
  return useContext(SoftNavContext);
}

/**
 * Tracks soft navigations (same route, new search params — e.g. folders/inbox)
 * so we can show instant pending UI. loading.tsx does not run for those.
 *
 * Pending stays true for the whole useTransition (until the new RSC payload is
 * ready). Clearing on URL/searchParams alone is too early — Next updates the
 * URL before the workspace panel has new data.
 */
export function SoftNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  const navigate = useCallback(
    (href: string) => {
      setPendingHref(href);
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  const value = useMemo(
    () => ({
      pending: isPending || Boolean(pendingHref),
      pendingHref,
      navigate,
    }),
    [isPending, pendingHref, navigate],
  );

  return (
    <SoftNavContext.Provider value={value}>{children}</SoftNavContext.Provider>
  );
}

/** Dim / skeleton the main pane while a soft nav is in flight. */
export function SoftNavContent({
  children,
  label = "Loading",
}: {
  children: ReactNode;
  label?: string;
}) {
  const soft = useSoftNav();
  if (soft?.pending) {
    return <AppRouteLoading label={label} embedded />;
  }
  return children;
}

type LinkProps = ComponentProps<typeof Link>;

/**
 * Like AppLink, but uses SoftNavContext + useTransition so same-page query
 * changes (folders, inbox) get instant pending feedback.
 */
export function SoftNavLink({
  href,
  className,
  children,
  pending = "sheen",
  compactPending,
  onClick,
  ...rest
}: Omit<LinkProps, "prefetch"> & {
  pending?: "dot" | "sheen" | "none";
  compactPending?: boolean;
}) {
  const router = useRouter();
  const soft = useSoftNav();
  const [localPending, startLocalTransition] = useTransition();
  const hrefString = typeof href === "string" ? href : href.pathname || "";

  const showPending =
    localPending ||
    (soft?.pendingHref != null && soft.pendingHref === hrefString);

  return (
    <Link
      href={href}
      prefetch
      className={className}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }
        e.preventDefault();
        if (soft) {
          soft.navigate(hrefString);
          return;
        }
        startLocalTransition(() => {
          router.push(hrefString);
        });
      }}
      {...rest}
    >
      {children}
      {pending === "dot" ? (
        <span
          aria-hidden
          className={`inline-block shrink-0 rounded-full bg-current transition-opacity ${
            compactPending ? "h-1 w-1" : "h-1.5 w-1.5"
          } ${showPending ? "animate-pulse opacity-80" : "opacity-0"}`}
        />
      ) : null}
      {pending === "sheen" ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-[color:var(--tide-deep)]/[0.08] transition-opacity ${
            showPending ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}
    </Link>
  );
}
