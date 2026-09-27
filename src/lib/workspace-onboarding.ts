/** Guided first-session steps inside a workspace. */
export type WorkspaceOnboardingStep =
  | "roles-open"
  | "roles-intro"
  | "roles-name"
  | "roles-create"
  | "roles-list"
  | "roles-hide"
  | "roles-hide-info"
  | "roles-assign-info"
  | "roles-folder-bridge"
  | "create-folder"
  | "folder-name"
  | "folder-roles"
  | "folder-hide"
  | "folder-always"
  | "folder-accessible"
  | "folder-submit"
  | "open-folder"
  | "open-add-task"
  | "task-name"
  | "priority"
  | "description"
  | "due-date"
  | "due-reset"
  | "due-reset-info"
  | "due-clear"
  | "claim-pool"
  | "claim-pool-info"
  | "tags"
  | "tags-info"
  | "one-off"
  | "one-off-info"
  | "daily"
  | "daily-info"
  | "weekly"
  | "weekly-info"
  | "monthly"
  | "monthly-info"
  | "task-menu-info"
  | "submit"
  | "done";

/** High-level course choice after the welcome chooser. */
export type OnboardingTrack = "full" | "short";

export type OnboardingPrefStatus =
  | "unset"
  | "full"
  | "short"
  | "declined"
  | "completed";

export type OnboardingPreference = {
  status: OnboardingPrefStatus;
  /** Distinguish “No.” vs “I’m all set” when declined. */
  declineKind?: "hard" | "soft";
  track?: OnboardingTrack;
  updatedAt?: string;
};

export const SETUP_DISMISS_KEY = (workspaceId: string) =>
  `rowgon-setup-dismissed:${workspaceId}`;

export const FOLDERS_OPEN_KEY = (workspaceId: string) =>
  `rowgon-folders-open:${workspaceId}`;

export const ONBOARDING_STEP_KEY = (workspaceId: string) =>
  `rowgon-onboarding-step:${workspaceId}`;

/** User-scoped preference (survives workspace switches). */
export const ONBOARDING_PREF_KEY = "rowgon-onboarding-pref:v1";

const ALL_STEPS: WorkspaceOnboardingStep[] = [
  "roles-open",
  "roles-intro",
  "roles-name",
  "roles-create",
  "roles-list",
  "roles-hide",
  "roles-hide-info",
  "roles-assign-info",
  "roles-folder-bridge",
  "create-folder",
  "folder-name",
  "folder-roles",
  "folder-hide",
  "folder-always",
  "folder-accessible",
  "folder-submit",
  "open-folder",
  "open-add-task",
  "task-name",
  "priority",
  "description",
  "due-date",
  "due-reset",
  "due-reset-info",
  "due-clear",
  "claim-pool",
  "claim-pool-info",
  "tags",
  "tags-info",
  "one-off",
  "one-off-info",
  "daily",
  "daily-info",
  "weekly",
  "weekly-info",
  "monthly",
  "monthly-info",
  "task-menu-info",
  "submit",
  "done",
];

/** Full-track roles tour (before folders) so folder role pickers have options. */
export const ROLE_CREATE_STEPS: WorkspaceOnboardingStep[] = [
  "roles-open",
  "roles-intro",
  "roles-name",
  "roles-create",
  "roles-list",
  "roles-hide",
  "roles-hide-info",
  "roles-assign-info",
  "roles-folder-bridge",
];

const FOLDER_CREATE_STEPS: WorkspaceOnboardingStep[] = [
  "create-folder",
  "folder-name",
  "folder-roles",
  "folder-hide",
  "folder-always",
  "folder-accessible",
  "folder-submit",
];

export function isRoleCreateStep(step: WorkspaceOnboardingStep) {
  return ROLE_CREATE_STEPS.includes(step);
}

export function isFolderCreateStep(step: WorkspaceOnboardingStep) {
  return FOLDER_CREATE_STEPS.includes(step);
}

export function readFoldersOpenPreference(
  workspaceId: string,
): boolean | null {
  try {
    const raw = localStorage.getItem(FOLDERS_OPEN_KEY(workspaceId));
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* private mode */
  }
  return null;
}

export function writeFoldersOpenPreference(
  workspaceId: string,
  open: boolean,
) {
  try {
    localStorage.setItem(FOLDERS_OPEN_KEY(workspaceId), open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isSetupDismissed(workspaceId: string) {
  try {
    return Boolean(localStorage.getItem(SETUP_DISMISS_KEY(workspaceId)));
  } catch {
    return false;
  }
}

export function readOnboardingPreference(): OnboardingPreference {
  try {
    const raw = localStorage.getItem(ONBOARDING_PREF_KEY);
    if (!raw) return { status: "unset" };
    const parsed = JSON.parse(raw) as OnboardingPreference;
    if (!parsed?.status) return { status: "unset" };
    return parsed;
  } catch {
    return { status: "unset" };
  }
}

export function writeOnboardingPreference(pref: OnboardingPreference) {
  try {
    localStorage.setItem(
      ONBOARDING_PREF_KEY,
      JSON.stringify({ ...pref, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore */
  }
}

export function readStoredOnboardingStep(
  workspaceId: string,
): WorkspaceOnboardingStep | null {
  try {
    return parseStoredStep(
      localStorage.getItem(ONBOARDING_STEP_KEY(workspaceId)),
    );
  } catch {
    return null;
  }
}

export function writeStoredOnboardingStep(
  workspaceId: string,
  step: WorkspaceOnboardingStep,
) {
  try {
    localStorage.setItem(ONBOARDING_STEP_KEY(workspaceId), step);
  } catch {
    /* ignore */
  }
}

export function dismissSetup(workspaceId: string) {
  try {
    localStorage.setItem(SETUP_DISMISS_KEY(workspaceId), "1");
  } catch {
    /* ignore */
  }
}

export function deriveOnboardingStep(args: {
  hasFolder: boolean;
  hasTask: boolean;
  inFolder: boolean;
  hasRole: boolean;
  canManageRoles: boolean;
  stored: WorkspaceOnboardingStep | null;
  track: OnboardingTrack;
}): WorkspaceOnboardingStep {
  if (args.hasTask) {
    // Keep the post-create tip available after the first task lands.
    if (args.stored === "task-menu-info" || args.stored === "submit") {
      return "task-menu-info";
    }
    return "done";
  }
  if (!args.hasFolder) {
    const rolesFirst =
      args.track === "full" && args.canManageRoles;
    if (rolesFirst && args.stored && isRoleCreateStep(args.stored)) {
      return args.stored;
    }
    if (args.stored && isFolderCreateStep(args.stored)) {
      return args.stored;
    }
    if (rolesFirst && !args.hasRole) return "roles-open";
    if (
      rolesFirst &&
      args.hasRole &&
      args.stored &&
      isRoleCreateStep(args.stored)
    ) {
      return args.stored;
    }
    return "create-folder";
  }
  if (!args.inFolder) return "open-folder";
  if (
    args.stored &&
    args.stored !== "create-folder" &&
    !isFolderCreateStep(args.stored) &&
    !isRoleCreateStep(args.stored) &&
    args.stored !== "open-folder" &&
    args.stored !== "done"
  ) {
    return args.stored;
  }
  return "open-add-task";
}

export function parseStoredStep(raw: string | null): WorkspaceOnboardingStep | null {
  if (!raw) return null;
  return ALL_STEPS.includes(raw as WorkspaceOnboardingStep)
    ? (raw as WorkspaceOnboardingStep)
    : null;
}

export function nextRoleCreateStep(
  current: WorkspaceOnboardingStep,
): WorkspaceOnboardingStep {
  if (current === "roles-open") return "roles-intro";
  if (current === "roles-intro") return "roles-name";
  if (current === "roles-name") return "roles-create";
  if (current === "roles-create") return "roles-list";
  if (current === "roles-list") return "roles-hide";
  if (current === "roles-hide") return "roles-hide-info";
  if (current === "roles-hide-info") return "roles-assign-info";
  if (current === "roles-assign-info") return "roles-folder-bridge";
  if (current === "roles-folder-bridge") return "create-folder";
  return current;
}

export function nextFolderCreateStep(
  current: WorkspaceOnboardingStep,
  canSetAccess: boolean,
): WorkspaceOnboardingStep {
  if (current === "create-folder") return "folder-name";
  if (current === "folder-name") {
    return canSetAccess ? "folder-roles" : "folder-submit";
  }
  if (current === "folder-roles") return "folder-hide";
  if (current === "folder-hide") return "folder-always";
  if (current === "folder-always") return "folder-accessible";
  if (current === "folder-accessible") return "folder-submit";
  return current;
}

/** After skipping a section, land on the next section start. */
export function skipToNextSection(
  step: WorkspaceOnboardingStep,
): WorkspaceOnboardingStep {
  if (isRoleCreateStep(step)) return "create-folder";
  if (FOLDER_CREATE_STEPS.includes(step)) return "open-folder";
  if (step === "open-folder") return "open-add-task";
  if (step === "open-add-task" || step === "task-name") return "priority";
  if (
    step === "priority" ||
    step === "description" ||
    step === "due-date" ||
    step === "due-reset" ||
    step === "due-reset-info" ||
    step === "due-clear"
  ) {
    return "claim-pool";
  }
  if (
    step === "claim-pool" ||
    step === "claim-pool-info" ||
    step === "tags" ||
    step === "tags-info"
  ) {
    return "one-off";
  }
  if (
    step === "one-off" ||
    step === "one-off-info" ||
    step === "daily" ||
    step === "daily-info" ||
    step === "weekly" ||
    step === "weekly-info" ||
    step === "monthly" ||
    step === "monthly-info"
  ) {
    return "submit";
  }
  if (step === "submit" || step === "task-menu-info") {
    return "done";
  }
  return "done";
}
