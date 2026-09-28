"use client";

import { useEffect } from "react";

const BASE =
  "width=device-width, initial-scale=1, viewport-fit=cover";
const LOCKED = `${BASE}, maximum-scale=1`;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * Phone Safari often zooms into inputs (&lt;16px) and stays zoomed after blur.
 * Temporarily lock maximum-scale on blur to snap back to 1×, then unlock
 * so pinch-zoom still works.
 */
export function MobileViewportReset() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    // Ensure we start fully zoomed out
    meta.setAttribute("content", BASE);

    let unlockTimer: ReturnType<typeof setTimeout> | null = null;

    function resetZoom() {
      if (!meta) return;
      if (unlockTimer) clearTimeout(unlockTimer);
      meta.setAttribute("content", LOCKED);
      unlockTimer = setTimeout(() => {
        meta.setAttribute("content", BASE);
        unlockTimer = null;
      }, 320);
    }

    function onFocusOut(e: FocusEvent) {
      if (!isEditableTarget(e.target)) return;
      // If focus moved to another field, leave zoom alone
      if (isEditableTarget(e.relatedTarget)) return;
      resetZoom();
    }

    // visualViewport scale can linger after keyboard dismiss
    const vv = window.visualViewport;
    function onVvResize() {
      if (!vv) return;
      if (document.activeElement && isEditableTarget(document.activeElement)) {
        return;
      }
      if (vv.scale > 1.01) resetZoom();
    }

    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onVvResize);
    vv?.addEventListener("scroll", onVvResize);

    return () => {
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onVvResize);
      vv?.removeEventListener("scroll", onVvResize);
      if (unlockTimer) clearTimeout(unlockTimer);
    };
  }, []);

  return null;
}
