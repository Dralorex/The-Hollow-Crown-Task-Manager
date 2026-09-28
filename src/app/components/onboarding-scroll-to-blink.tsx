"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import { selectorForStep } from "@/lib/onboarding-targets";
import type { WorkspaceOnboardingStep } from "@/lib/workspace-onboarding";

/** Narrow / phone layout — not the same as PWA homescreen launch. */
function isNarrowViewport() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function navHeight() {
  const nav = document.querySelector("header");
  return nav?.getBoundingClientRect().height ?? 56;
}

/** Editable fields inside guided folder / task panels. */
function isOnboardingTextField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") {
    return Boolean(el.closest("#workspace-folders, #workspace-add-task"));
  }
  if (tag === "SELECT") {
    return Boolean(el.closest("#workspace-folders, #workspace-add-task"));
  }
  if (tag !== "INPUT") return false;
  const input = el as HTMLInputElement;
  const type = (input.type || "text").toLowerCase();
  if (
    type === "checkbox" ||
    type === "radio" ||
    type === "hidden" ||
    type === "submit" ||
    type === "button" ||
    type === "file" ||
    type === "range"
  ) {
    return false;
  }
  return Boolean(el.closest("#workspace-folders, #workspace-add-task"));
}

function resolveTarget(step: WorkspaceOnboardingStep) {
  const sel = selectorForStep(step);
  if (!sel) return null;
  const el = document.querySelector(sel);
  return el instanceof HTMLElement ? el : null;
}

function scrollFieldToTop(el: HTMLElement) {
  const topPad = navHeight() + 10;
  const y = el.getBoundingClientRect().top + window.scrollY - topPad;
  window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

function scrollFieldToCenter(el: HTMLElement) {
  const navH = navHeight();
  const rect = el.getBoundingClientRect();
  const available = Math.max(120, window.innerHeight - navH);
  const elCenter = rect.top + rect.height / 2;
  const viewCenter = navH + available / 2;
  const delta = elCenter - viewCenter;
  if (Math.abs(delta) < 8) return;
  window.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * Phone onboarding scroll:
 * - New step → center the blink target
 * - Focus a text/select field (info prompt often appears) → pin field to top
 * - Blur / dismiss keyboard → center again
 */
export function OnboardingScrollToBlink() {
  const { active, step } = useWorkspaceOnboarding();
  const stepRef = useRef(step);
  const editingRef = useRef(false);
  stepRef.current = step;

  // Center when the guided step advances (unless a field is focused)
  useEffect(() => {
    if (!active || step === "done") return;
    if (typeof window === "undefined" || !isNarrowViewport()) return;
    if (editingRef.current) return;
    if (document.activeElement && isOnboardingTextField(document.activeElement)) {
      return;
    }

    const t = window.setTimeout(() => {
      const el = resolveTarget(step);
      if (el) scrollFieldToCenter(el);
    }, 140);

    return () => window.clearTimeout(t);
  }, [active, step]);

  // Focus → top; blur / leave field → center
  useEffect(() => {
    if (!active || step === "done") return;
    if (typeof window === "undefined") return;

    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    function onFocusIn(e: FocusEvent) {
      if (!isNarrowViewport()) return;
      if (!isOnboardingTextField(e.target)) return;
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      editingRef.current = true;
      const el = e.target as HTMLElement;
      // Wait a tick so info prompts can mount, then pin under the nav
      window.requestAnimationFrame(() => {
        window.setTimeout(() => scrollFieldToTop(el), 60);
      });
    }

    function onFocusOut(e: FocusEvent) {
      if (!isNarrowViewport()) return;
      if (!isOnboardingTextField(e.target)) return;

      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        const next = document.activeElement;
        if (isOnboardingTextField(next)) {
          editingRef.current = true;
          scrollFieldToTop(next);
          return;
        }
        editingRef.current = false;
        const el = resolveTarget(stepRef.current) ?? (e.target as HTMLElement);
        if (el) scrollFieldToCenter(el);
      }, 200);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (blurTimer) clearTimeout(blurTimer);
    };
  }, [active, step]);

  return null;
}
