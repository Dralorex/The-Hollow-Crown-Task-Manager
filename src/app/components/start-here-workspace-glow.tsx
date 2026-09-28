"use client";

import { useEffect, useState, type ReactNode } from "react";
import { readOnboardingPreference } from "@/lib/workspace-onboarding";

/**
 * Wraps the Start here bubble with a circling blue glow while first-time
 * setup is active. Turns off once onboarding is completed or declined.
 */
export function StartHereWorkspaceGlow({
  active,
  children,
  className,
}: {
  /** True when the Start here empty state is showing (no workspaces yet). */
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setGlow(false);
      return;
    }
    function sync() {
      const pref = readOnboardingPreference();
      setGlow(pref.status !== "completed" && pref.status !== "declined");
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [active]);

  return (
    <div
      className={`w-full ${className ?? ""} ${glow ? "rowgon-glow-orbit" : ""}`.trim()}
    >
      {children}
    </div>
  );
}
