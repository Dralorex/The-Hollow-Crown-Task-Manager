import type { KeyboardEvent } from "react";

/** Focusable controls inside a form (excludes hidden inputs). */
const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isVisible(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

/** Move focus to the next focusable control in the form (Enter-as-Tab). */
export function focusNextFormControl(
  form: HTMLFormElement,
  current: Element,
): void {
  const nodes = Array.from(
    form.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisible);
  const idx = nodes.indexOf(current as HTMLElement);
  if (idx < 0 || idx >= nodes.length - 1) return;
  const next = nodes[idx + 1];
  next.focus();
  if (
    next instanceof HTMLInputElement &&
    (next.type === "text" ||
      next.type === "search" ||
      next.type === "email" ||
      next.type === "tel" ||
      next.type === "url" ||
      next.type === "password" ||
      next.type === "number")
  ) {
    next.select();
  }
}

/**
 * Block Enter from submitting the form; advance focus like Tab instead.
 * Textareas keep Enter for newlines. Handlers that call stopPropagation
 * (e.g. tag chip commit) are left alone.
 */
export function enterAdvancesFocus(
  e: KeyboardEvent<HTMLFormElement>,
): void {
  if (e.key !== "Enter") return;
  if (e.nativeEvent.isComposing) return;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.tagName === "TEXTAREA") return;
  if (target.isContentEditable) return;

  e.preventDefault();
  focusNextFormControl(e.currentTarget, target);
}
