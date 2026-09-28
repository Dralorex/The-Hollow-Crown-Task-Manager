"use client";

import { useEffect, useState } from "react";

/** Pause background chat keepalives after this long with no user input. */
export const IDLE_POLL_MS = 90_000;

/** Intentional input only — ignore mousemove/scroll so idle can actually fire. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * True while the document is visible and the user has interacted recently.
 * Use to gate setInterval / EventSource keepalives so idle or background
 * tabs stop burning Edge Requests.
 */
export function useActivePolling(idleMs: number = IDLE_POLL_MS): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const recompute = (idle: boolean) => {
      const visible =
        typeof document === "undefined" ? true : document.visibilityState === "visible";
      setActive(visible && !idle);
    };

    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      recompute(false);
      idleTimer = setTimeout(() => recompute(true), idleMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        armIdle();
      } else {
        if (idleTimer) clearTimeout(idleTimer);
        recompute(true);
      }
    };

    armIdle();
    document.addEventListener("visibilitychange", onVisibility);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, armIdle, { passive: true });
    }

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, armIdle);
      }
    };
  }, [idleMs]);

  return active;
}
