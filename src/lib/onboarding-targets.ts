import type { WorkspaceOnboardingStep } from "@/lib/workspace-onboarding";

/** CSS selectors for guided blink / focus / click targets. */
export function selectorForStep(
  step: WorkspaceOnboardingStep,
): string | null {
  const map: Partial<Record<WorkspaceOnboardingStep, string>> = {
    "roles-open": "#workspace-roles > button[aria-expanded]",
    "roles-intro": "#workspace-roles",
    "roles-name": '#workspace-roles input[data-onboarding="roles-name"]',
    "roles-create":
      '#workspace-roles button[data-onboarding="roles-create"]',
    "roles-list": "#workspace-roles",
    "roles-hide":
      '#workspace-roles input[data-onboarding="roles-hide"]',
    "roles-hide-info": "#workspace-roles",
    "roles-assign-info": "#workspace-roles",
    "roles-folder-bridge": "#workspace-roles",
    "create-folder": "#workspace-folders > button[aria-expanded]",
    "folder-name":
      '#workspace-folders input[data-onboarding="folder-name"], #workspace-folders input[name="name"]:not([type="hidden"])',
    "folder-roles":
      '#workspace-folders input[data-onboarding="folder-roles"], #workspace-folders input[name="roles"]:not([type="hidden"])',
    "folder-hide":
      '#workspace-folders input[name="hideFromUnauthorized"]',
    "folder-always": '#workspace-folders input[name="alwaysVisible"]',
    "folder-accessible":
      '#workspace-folders input[name="alwaysAccessible"]',
    "folder-submit": '#workspace-folders button[type="submit"]',
    "open-folder":
      '#workspace-folders [data-onboarding="folder-bubble"]',
    "open-add-task": "#workspace-add-task > button[aria-expanded]",
    "task-name":
      '#workspace-add-task input[data-onboarding="task-name"], #workspace-add-task input[name="name"]:not([type="hidden"])',
    priority: '#workspace-add-task select[name="priority"]',
    description:
      '#workspace-add-task input[data-onboarding="description"], #workspace-add-task input[name="description"]',
    "due-date": '#workspace-add-task input[name="dueDate"]',
    "due-reset": '#workspace-add-task [data-onboarding="due-reset"]',
    "due-reset-info": "#workspace-add-task",
    "due-clear": '#workspace-add-task [data-onboarding="due-clear"]',
    "claim-pool": '#workspace-add-task select[name="assignTo"]',
    "claim-pool-info": '#workspace-add-task select[name="assignTo"]',
    tags: '#workspace-add-task input[data-onboarding="tags"]',
    "tags-info": '#workspace-add-task input[data-onboarding="tags"]',
    "one-off": '#workspace-add-task [data-onboarding="cadence-one-off"]',
    "one-off-info":
      '#workspace-add-task [data-onboarding="cadence-one-off"]',
    daily: '#workspace-add-task [data-onboarding="cadence-daily"]',
    "daily-info": '#workspace-add-task [data-onboarding="cadence-daily"]',
    weekly: '#workspace-add-task [data-onboarding="cadence-weekly"]',
    "weekly-info":
      '#workspace-add-task [data-onboarding="cadence-weekly"]',
    monthly: '#workspace-add-task [data-onboarding="cadence-monthly"]',
    "monthly-info":
      '#workspace-add-task [data-onboarding="cadence-monthly"]',
    "task-menu-info": '[data-onboarding="task-menu"]',
    submit: '#workspace-add-task button[type="submit"]',
  };
  return map[step] ?? null;
}

function scrollToEl(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}

function isTextEntry(
  el: HTMLElement,
): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  const type = (el.type || "text").toLowerCase();
  return (
    type === "text" ||
    type === "search" ||
    type === "email" ||
    type === "tel" ||
    type === "url" ||
    type === "password" ||
    type === "number" ||
    type === ""
  );
}

/**
 * Focus a guided field so the user can type immediately.
 *
 * Focus/click run synchronously in the caller’s user-gesture turn so mobile
 * soft keyboards open. Scrolling happens afterward and must not delay focus.
 */
export function focusOnboardingField(selector: string) {
  if (typeof document === "undefined") return;
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return;

  if (el instanceof HTMLSelectElement) {
    el.focus();
    requestAnimationFrame(() => scrollToEl(el));
    return;
  }

  if (el instanceof HTMLInputElement && el.type === "date") {
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      /* showPicker requires a user gesture; we’re in one */
    }
    requestAnimationFrame(() => scrollToEl(el));
    return;
  }

  // Text fields: focus (+ click) in this same tap so iOS/Android open the keyboard.
  el.focus();
  if (isTextEntry(el)) {
    try {
      el.click();
    } catch {
      /* ignore */
    }
    try {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    } catch {
      /* non-text */
    }
  }

  requestAnimationFrame(() => {
    scrollToEl(el);
    if (document.activeElement !== el) {
      el.focus({ preventScroll: true });
      if (isTextEntry(el)) {
        try {
          el.click();
        } catch {
          /* ignore */
        }
      }
    }
  });
}

/** Click a guided control (open panel, Reset, Create role, etc.). */
export function clickOnboardingTarget(selector: string) {
  if (typeof document === "undefined") return;
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) return;
  scrollToEl(el);
  window.setTimeout(() => el.click(), 180);
}

export function focusOnboardingStep(step: WorkspaceOnboardingStep) {
  const sel = selectorForStep(step);
  if (sel) focusOnboardingField(sel);
}

export function clickOnboardingStep(step: WorkspaceOnboardingStep) {
  const sel = selectorForStep(step);
  if (sel) clickOnboardingTarget(sel);
}
