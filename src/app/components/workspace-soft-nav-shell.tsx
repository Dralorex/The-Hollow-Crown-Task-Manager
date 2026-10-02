"use client";

import type { ReactNode } from "react";
import { SoftNavContent, SoftNavProvider } from "@/app/components/soft-nav";

/**
 * Enables instant pending UI for folder / inbox query navigations inside a
 * workspace (loading.tsx does not run for same-route search param changes).
 */
export function WorkspaceSoftNavShell({ children }: { children: ReactNode }) {
  return <SoftNavProvider>{children}</SoftNavProvider>;
}

export function WorkspaceSoftNavPanel({
  children,
  label = "Loading folder",
}: {
  children: ReactNode;
  label?: string;
}) {
  return <SoftNavContent label={label}>{children}</SoftNavContent>;
}
