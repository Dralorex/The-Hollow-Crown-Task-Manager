"use client";

import { useEffect, useState } from "react";

/** Pause keepalives this long after the tab is hidden / backgrounded. */
export const HIDDEN_PAUSE_MS = 60_000;

/** Pause keepalives on the focused tab after this long with no input. */
export const FOREGROUND_IDLE_MS = 120_000;

/** Intentional input only — ignore mousemove/scroll so idle can actually fire. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * True while polling should run.
 * - Hidden / background tab: stays active for 60s, then pauses.
 * - Visible main tab: pauses after 120s with no click/key/touch.
 */
export function useActivePolling(): boolean {
  const [active, setActive] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const isForeground = () =>
      document.visibilityState === "visible" && document.hasFocus();

    const armHiddenPause = () => {
      clearTimer();
      setActive(true);
      timer = setTimeout(() => setActive(false), HIDDEN_PAUSE_MS);
    };

    const armForegroundIdle = () => {
      clearTimer();
      setActive(true);
      timer = setTimeout(() => setActive(false), FOREGROUND_IDLE_MS);
    };

    const sync = () => {
      if (isForeground()) {
        armForegroundIdle();
      } else {
        // Hidden, or visible but not focused (another window on top).
        armHiddenPause();
      }
    };

    const onActivity = () => {
      if (isForeground()) {
        armForegroundIdle();
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      clearTimer();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, []);

  return active;
}
