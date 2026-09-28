"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  computeOverlayBottomPx,
  getPhoneLaunchMode,
  subscribeOverlayBottom,
  type PhoneLaunchMode,
} from "@/lib/phone-overlay";

/**
 * Coach prompt for guided onboarding.
 *
 * Always renders as a fixed bottom overlay (portaled to `document.body`) so
 * tips stay visible while scrolling and never nest inside panel bubbles.
 * Use this for ALL info prompts — including new ones.
 *
 * Bottom placement adapts to launch mode + keyboard:
 * - Homescreen / PWA: hugs the physical bottom (home-indicator gap only).
 * - In-browser: sits above the browser chrome.
 * - Both: lift with the soft keyboard via visualViewport.
 *
 * Prefer an action button (`onAction` / `actionLabel`) when the user should
 * enter a field (e.g. “Add Title”, “Add Tag”). Call `focusOnboardingStep`
 * synchronously from `onAction` so the mobile keyboard opens on tap.
 * Use `onNext` / `nextLabel` (“Next”) for informational steps.
 */
function useOverlayBottom() {
  const [bottom, setBottom] = useState(0);
  const [mode, setMode] = useState<PhoneLaunchMode>("browser");

  useEffect(() => {
    setMode(getPhoneLaunchMode());
    setBottom(computeOverlayBottomPx());
    return subscribeOverlayBottom(({ bottom: next, mode: nextMode }) => {
      setBottom(next);
      setMode(nextMode);
    });
  }, []);

  return { bottom, mode };
}

export function OnboardingPrompt({
  title,
  body,
  onNext,
  nextLabel = "Next",
  onAction,
  actionLabel,
}: {
  title: string;
  body: string;
  onNext?: () => void;
  nextLabel?: string;
  /** Primary field/action CTA (e.g. focus a text box). */
  onAction?: () => void;
  actionLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { bottom, mode } = useOverlayBottom();
  useEffect(() => setMounted(true), []);

  const showAction = Boolean(onAction && actionLabel);
  const showNext = Boolean(onNext);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-3 transition-[bottom] duration-150 ease-out"
      style={{ bottom }}
      data-onboarding-prompt="foreground"
      data-launch={mode}
    >
      <div className="pointer-events-auto w-full max-w-lg shadow-lg">
        <div
          role="status"
          className="rounded-xl border border-[#93c5fd] bg-[#E8F1FF] px-3 py-3 text-sm text-[#0A3D45] shadow-md"
        >
          <p className="font-semibold text-[#0A3D45]">{title}</p>
          <p className="mt-1 text-[#0A3D45]/75">{body}</p>
          {showAction || showNext ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {showAction ? (
                <button
                  type="button"
                  onClick={onAction}
                  className="rowgon-btn-primary !min-h-9 !px-4 !py-1.5 text-sm"
                >
                  {actionLabel}
                </button>
              ) : null}
              {showNext ? (
                <button
                  type="button"
                  onClick={onNext}
                  className={
                    showAction
                      ? "rounded-full px-3 py-1.5 text-sm font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
                      : "rowgon-btn-primary !min-h-9 !px-4 !py-1.5 text-sm"
                  }
                >
                  {nextLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function blinkRing(active: boolean) {
  return active
    ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
    : "";
}
