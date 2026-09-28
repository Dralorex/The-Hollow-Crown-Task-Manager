/**
 * Phone shell helpers for fixed bottom overlays (onboarding tips, etc.).
 *
 * - Homescreen / PWA launch: hug the physical bottom (home-indicator only).
 * - In-browser: sit a bit higher so tips clear the browser chrome.
 * - Both: lift with the soft keyboard via visualViewport.
 */

export type PhoneLaunchMode = "homescreen" | "browser";

export function isHomescreenLaunch(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // iOS Safari “Add to Home Screen”
  if (nav.standalone === true) return true;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  } catch {
    /* older browsers */
  }
  return false;
}

export function getPhoneLaunchMode(): PhoneLaunchMode {
  return isHomescreenLaunch() ? "homescreen" : "browser";
}

/** Soft-keyboard (and browser UI) lift from the layout viewport bottom. */
export function getVisualViewportBottomInset(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (!vv) return 0;
  // Distance between the visual viewport’s bottom edge and the layout bottom.
  return Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
}

let safeAreaProbe: HTMLDivElement | null = null;

/** Read `env(safe-area-inset-bottom)` in px (home indicator). */
export function readSafeAreaInsetBottom(): number {
  if (typeof document === "undefined") return 0;
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement("div");
    safeAreaProbe.setAttribute("data-rowgon-safe-area-probe", "1");
    safeAreaProbe.style.cssText =
      "position:fixed;left:0;bottom:0;width:0;height:0;padding:0;padding-bottom:env(safe-area-inset-bottom,0px);margin:0;border:0;visibility:hidden;pointer-events:none;";
    document.documentElement.appendChild(safeAreaProbe);
  }
  const pb = parseFloat(getComputedStyle(safeAreaProbe).paddingBottom);
  return Number.isFinite(pb) ? pb : 0;
}

/**
 * Gap between the overlay card and the effective bottom edge
 * (keyboard top, or screen bottom when keyboard is closed).
 */
export function baseOverlayGapPx(mode: PhoneLaunchMode, safeArea: number): number {
  if (mode === "homescreen") {
    // Extremely close to the bottom; still clear the home indicator.
    return Math.max(2, safeArea);
  }
  // Browser: clear the bottom toolbar / home indicator with a little air.
  return Math.max(16, safeArea + 12);
}

/**
 * Extra lift in browser mode when visualViewport doesn’t already account
 * for the bottom browser chrome (common on some mobile Safari builds).
 */
export function browserChromeFloorPx(
  mode: PhoneLaunchMode,
  viewportInset: number,
): number {
  if (mode === "homescreen") return 0;
  // Keyboard (or chrome) already lifting the visual viewport — don’t double up.
  if (viewportInset >= 24) return 0;
  // Modest floor so tips sit above the browser’s bottom bar.
  return 40;
}

/** Final `bottom` CSS px for a fixed overlay. */
export function computeOverlayBottomPx(args?: {
  mode?: PhoneLaunchMode;
  viewportInset?: number;
  safeArea?: number;
}): number {
  const mode = args?.mode ?? getPhoneLaunchMode();
  const viewportInset =
    args?.viewportInset ?? getVisualViewportBottomInset();
  const safeArea = args?.safeArea ?? readSafeAreaInsetBottom();
  const gap = baseOverlayGapPx(mode, safeArea);
  const chrome = browserChromeFloorPx(mode, viewportInset);
  return Math.round(viewportInset + gap + chrome);
}

export type OverlayBottomListener = (state: {
  bottom: number;
  mode: PhoneLaunchMode;
}) => void;

/** Subscribe to keyboard / resize / launch-mode changes. */
export function subscribeOverlayBottom(listener: OverlayBottomListener): () => void {
  if (typeof window === "undefined") return () => {};

  const publish = () => {
    const mode = getPhoneLaunchMode();
    listener({
      mode,
      bottom: computeOverlayBottomPx({ mode }),
    });
  };

  publish();

  const vv = window.visualViewport;
  vv?.addEventListener("resize", publish);
  vv?.addEventListener("scroll", publish);
  window.addEventListener("resize", publish);
  window.addEventListener("orientationchange", publish);

  const mqs = [
    "(display-mode: standalone)",
    "(display-mode: fullscreen)",
    "(display-mode: minimal-ui)",
  ]
    .map((q) => {
      try {
        return window.matchMedia(q);
      } catch {
        return null;
      }
    })
    .filter((m): m is MediaQueryList => Boolean(m));

  for (const mq of mqs) {
    mq.addEventListener?.("change", publish);
  }

  return () => {
    vv?.removeEventListener("resize", publish);
    vv?.removeEventListener("scroll", publish);
    window.removeEventListener("resize", publish);
    window.removeEventListener("orientationchange", publish);
    for (const mq of mqs) {
      mq.removeEventListener?.("change", publish);
    }
  };
}
