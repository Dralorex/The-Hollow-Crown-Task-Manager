"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  deriveOnboardingStep,
  dismissSetup,
  isFolderCreateStep,
  isRoleCreateStep,
  isSetupDismissed,
  readOnboardingPreference,
  readStoredOnboardingStep,
  skipToNextSection,
  writeOnboardingPreference,
  writeStoredOnboardingStep,
  type OnboardingPreference,
  type OnboardingTrack,
  type WorkspaceOnboardingStep,
} from "@/lib/workspace-onboarding";

type Ctx = {
  active: boolean;
  /** Waiting for user to pick full / short / decline. */
  needsChooser: boolean;
  track: OnboardingTrack | null;
  step: WorkspaceOnboardingStep;
  setStep: (step: WorkspaceOnboardingStep) => void;
  chooseTrack: (track: OnboardingTrack) => void;
  decline: (kind: "hard" | "soft") => void;
  skipSection: () => void;
  completeOnboarding: () => void;
  blink: (target: string) => boolean;
  canManageRoles: boolean;
  hasRole: boolean;
};

const OnboardingContext = createContext<Ctx | null>(null);

export function WorkspaceOnboardingProvider({
  workspaceId,
  forceShow,
  hasFolder,
  hasTask,
  inFolder,
  hasRole,
  canManageRoles,
  canEdit,
  children,
}: {
  workspaceId: string;
  forceShow: boolean;
  hasFolder: boolean;
  hasTask: boolean;
  inFolder: boolean;
  hasRole: boolean;
  canManageRoles: boolean;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [pref, setPref] = useState<OnboardingPreference>({ status: "unset" });
  const [step, setStepState] = useState<WorkspaceOnboardingStep>("create-folder");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedPref = readOnboardingPreference();
    // Migrate legacy per-workspace dismiss → completed/declined
    if (storedPref.status === "unset" && isSetupDismissed(workspaceId)) {
      const migrated: OnboardingPreference = {
        status: "completed",
        declineKind: "soft",
      };
      writeOnboardingPreference(migrated);
      setPref(migrated);
    } else {
      setPref(storedPref);
    }

    let storedStep: WorkspaceOnboardingStep | null = null;
    try {
      storedStep = readStoredOnboardingStep(workspaceId);
    } catch {
      /* ignore */
    }

    const track: OnboardingTrack =
      storedPref.status === "short" ? "short" : "full";
    const next = deriveOnboardingStep({
      hasFolder,
      hasTask,
      inFolder,
      hasRole,
      canManageRoles,
      stored: storedStep,
      track,
    });
    setStepState(next);
    setReady(true);
  }, [workspaceId, hasFolder, hasTask, inFolder, hasRole, canManageRoles]);

  useEffect(() => {
    if (!ready) return;
    if (pref.status !== "full" && pref.status !== "short") return;

    setStepState((prev) => {
      if (hasTask) {
        if (prev === "task-menu-info") return prev;
        if (prev === "submit" || prev !== "done") return "task-menu-info";
        return "done";
      }
      if (!hasFolder) {
        if (isRoleCreateStep(prev) || isFolderCreateStep(prev)) {
          return prev;
        }
        if (pref.status === "full" && canManageRoles && !hasRole) {
          return "roles-open";
        }
        return "create-folder";
      }
      if (!inFolder) {
        if (
          isRoleCreateStep(prev) ||
          isFolderCreateStep(prev) ||
          prev === "open-folder" ||
          prev === "done"
        ) {
          return "open-folder";
        }
        return "open-folder";
      }
      if (
        isRoleCreateStep(prev) ||
        isFolderCreateStep(prev) ||
        prev === "open-folder"
      ) {
        return "open-add-task";
      }
      return prev;
    });
  }, [
    ready,
    hasFolder,
    hasTask,
    inFolder,
    hasRole,
    canManageRoles,
    pref.status,
  ]);

  // After a role is created during the create-button step, move on.
  useEffect(() => {
    if (!ready) return;
    if (pref.status !== "full") return;
    if (step === "roles-create" && hasRole) {
      setStepState("roles-list");
      writeStoredOnboardingStep(workspaceId, "roles-list");
    }
  }, [ready, pref.status, step, hasRole, workspaceId]);

  const setStep = useCallback(
    (next: WorkspaceOnboardingStep) => {
      setStepState(next);
      writeStoredOnboardingStep(workspaceId, next);
    },
    [workspaceId],
  );

  const chooseTrack = useCallback(
    (track: OnboardingTrack) => {
      const next: OnboardingPreference = { status: track, track };
      writeOnboardingPreference(next);
      setPref(next);
      if (hasFolder) {
        setStep(inFolder ? "open-add-task" : "open-folder");
        return;
      }
      if (track === "full" && canManageRoles) {
        setStep("roles-open");
        return;
      }
      setStep("create-folder");
    },
    [hasFolder, inFolder, canManageRoles, setStep],
  );

  const decline = useCallback(
    (kind: "hard" | "soft") => {
      const next: OnboardingPreference = {
        status: "declined",
        declineKind: kind,
      };
      writeOnboardingPreference(next);
      setPref(next);
      dismissSetup(workspaceId);
      setStep("done");
    },
    [workspaceId, setStep],
  );

  const completeOnboarding = useCallback(() => {
    const next: OnboardingPreference = { status: "completed" };
    writeOnboardingPreference(next);
    setPref(next);
    dismissSetup(workspaceId);
    setStep("done");
  }, [workspaceId, setStep]);

  const skipSection = useCallback(() => {
    if (pref.status === "short") {
      if (!hasFolder) {
        setStep("open-folder");
        return;
      }
      if (!inFolder) {
        setStep("open-add-task");
        return;
      }
      if (step === "open-add-task" || step === "task-name") {
        setStep("submit");
        return;
      }
      if (step === "submit") {
        // Still need them to add a task — skip only ends the tip tour.
        completeOnboarding();
        return;
      }
      completeOnboarding();
      return;
    }
    const next = skipToNextSection(step);
    if (next === "done") completeOnboarding();
    else setStep(next);
  }, [
    pref.status,
    hasFolder,
    inFolder,
    step,
    setStep,
    completeOnboarding,
  ]);

  const track: OnboardingTrack | null =
    pref.status === "full" || pref.status === "short" ? pref.status : null;

  const needsChooser =
    ready &&
    canEdit &&
    pref.status === "unset" &&
    !hasTask &&
    (forceShow || !hasFolder || !hasTask);

  /** Tips that still show after the first task exists (blink off). */
  const postTaskStep = step === "task-menu-info";

  const active =
    ready &&
    canEdit &&
    (pref.status === "full" || pref.status === "short") &&
    step !== "done" &&
    (!hasTask || postTaskStep);

  // Persist submit → task-menu-info once the first task lands.
  useEffect(() => {
    if (!ready) return;
    if (pref.status !== "full" && pref.status !== "short") return;
    if (hasTask && step === "submit") {
      setStep("task-menu-info");
    }
  }, [ready, pref.status, hasTask, step, setStep]);

  const blink = useCallback(
    (target: string) => {
      if (!active || !track) return false;

      // After the first task exists, only the ⋮ menu blinks.
      if (hasTask) {
        return target === "task-menu" && step === "task-menu-info";
      }

      if (track === "short") {
        const shortMap: Record<string, WorkspaceOnboardingStep[]> = {
          "folders-header": ["create-folder"],
          "folder-name": ["folder-name"],
          "folder-submit": ["folder-submit"],
          "folder-bubble": ["open-folder"],
          "add-task-header": ["open-add-task"],
          "task-name": ["task-name"],
          submit: ["submit"],
        };
        return (shortMap[target] ?? []).includes(step);
      }

      const map: Record<string, WorkspaceOnboardingStep[]> = {
        "roles-header": ["roles-open"],
        "roles-name": ["roles-name"],
        "roles-create": ["roles-create"],
        "roles-hide": ["roles-hide"],
        "folders-header": ["create-folder"],
        "folder-name": ["folder-name"],
        "folder-roles": ["folder-roles"],
        "folder-hide": ["folder-hide"],
        "folder-always": ["folder-always"],
        "folder-accessible": ["folder-accessible"],
        "folder-submit": ["folder-submit"],
        "folder-bubble": ["open-folder"],
        "add-task-header": ["open-add-task"],
        "task-name": ["task-name"],
        priority: ["priority"],
        description: ["description"],
        "due-date": ["due-date"],
        "due-reset": ["due-reset"],
        "due-clear": ["due-clear"],
        // due-reset-info: no blink — explanation prompt only
        "claim-pool": ["claim-pool"],
        tags: ["tags", "tags-info"],
        "one-off": ["one-off", "one-off-info"],
        daily: ["daily", "daily-info"],
        weekly: ["weekly", "weekly-info"],
        monthly: ["monthly", "monthly-info"],
        submit: ["submit"],
        "task-menu": ["task-menu-info"],
      };
      return (map[target] ?? []).includes(step);
    },
    [active, track, step, hasTask],
  );

  const value = useMemo(
    () => ({
      active,
      needsChooser,
      track,
      step,
      setStep,
      chooseTrack,
      decline,
      skipSection,
      completeOnboarding,
      blink,
      canManageRoles,
      hasRole,
    }),
    [
      active,
      needsChooser,
      track,
      step,
      setStep,
      chooseTrack,
      decline,
      skipSection,
      completeOnboarding,
      blink,
      canManageRoles,
      hasRole,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useWorkspaceOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    return {
      active: false,
      needsChooser: false,
      track: null as OnboardingTrack | null,
      step: "done" as WorkspaceOnboardingStep,
      setStep: (_: WorkspaceOnboardingStep) => {},
      chooseTrack: (_: OnboardingTrack) => {},
      decline: (_: "hard" | "soft") => {},
      skipSection: () => {},
      completeOnboarding: () => {},
      blink: (_: string) => false,
      canManageRoles: false,
      hasRole: false,
    };
  }
  return ctx;
}
