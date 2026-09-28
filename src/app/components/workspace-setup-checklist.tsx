"use client";

import { useEffect, useState } from "react";
import { OnboardingPrompt } from "@/app/components/onboarding-prompt";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import { clickOnboardingStep, focusOnboardingStep } from "@/lib/onboarding-targets";

/** Steps where Continue hides the tip until the user opens the target. */
const OPEN_TAB_STEPS = new Set([
  "roles-open",
  "create-folder",
  "open-folder",
  "open-add-task",
  "task-menu-info",
]);

export function WorkspaceSetupChecklist({
  hasFolder,
  hasTask,
  hasInvite,
  canInvite,
  inFolder,
}: {
  hasFolder: boolean;
  hasTask: boolean;
  hasInvite: boolean;
  canInvite: boolean;
  inFolder: boolean;
}) {
  const {
    active,
    track,
    step,
    setStep,
    skipSection,
    completeOnboarding,
    canManageRoles,
    hasRole,
  } = useWorkspaceOnboarding();

  /** After Continue on an open-tab step, hide the tip until they open it. */
  const [tipPaused, setTipPaused] = useState(false);
  useEffect(() => {
    setTipPaused(false);
  }, [step]);

  if (!active) return null;

  const showOpenTabTip = OPEN_TAB_STEPS.has(step) && !tipPaused;

  const showRolesTour = track === "full" && canManageRoles;

  const steps = [
    ...(showRolesTour
      ? [
          {
            done: hasRole,
            label: "Create a role",
            hint: "Open Roles in the sidebar, name one, create it — then you’ll attach it to a folder next",
          },
        ]
      : []),
    {
      done: hasFolder,
      label: "Create a folder",
      hint:
        track === "short"
          ? "Open Folders, name it, and add it"
          : "Open Folders, then follow the blinking fields through Add folder",
    },
    {
      done: hasFolder && inFolder,
      label: "Open a folder",
      hint: "Click a folder card — if you made several, they’ll all blink until you pick one",
    },
    {
      done: hasTask,
      label: "Add a task",
      hint:
        track === "short"
          ? "Open Add Task, type a name, and submit"
          : "Expand Add Task and follow the guided highlights",
    },
    ...(canInvite
      ? [
          {
            done: hasInvite,
            label: "Invite someone (optional)",
            hint: "Share the invite link from the Invite panel — you can assign roles there too",
          },
        ]
      : []),
  ];

  return (
    <div className="tide-panel mt-6 border border-[#1a7a82]/25 p-5 animate-tide-rise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[#0A3D45]">
            {track === "short" ? "Quick start" : "Get your workspace going"}
          </h2>
          <p className="mt-1 text-sm text-[#0A3D45]/70">
            {track === "short"
              ? "A few blinks — folder, open it, add a task."
              : showRolesTour
                ? "Roles first (so folders can use them), then a folder, a task, and the claim → review loop."
                : "One folder, one task, and you’re in the claim → review loop."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={skipSection}
            className="text-sm font-medium text-[#1a7a82] underline-offset-2 hover:underline"
          >
            Skip this part
          </button>
          <button
            type="button"
            onClick={completeOnboarding}
            className="text-sm text-[#0A3D45]/55 hover:text-[#0A3D45] hover:underline"
          >
            I’ve already done onboarding
          </button>
        </div>
      </div>
      <ol className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.label} className="flex gap-3 text-sm">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                s.done
                  ? "bg-[#3DBEAB] text-[#0A3D45]"
                  : "bg-[#0A3D45]/10 text-[#0A3D45]/50"
              }`}
              aria-hidden
            >
              {s.done ? "✓" : ""}
            </span>
            <div>
              <p
                className={
                  s.done
                    ? "font-medium text-[#0A3D45]/55 line-through"
                    : "font-medium text-[#0A3D45]"
                }
              >
                {s.label}
              </p>
              <p className="text-[#0A3D45]/60">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>

      {step === "roles-open" && showOpenTabTip ? (
        <OnboardingPrompt
          title="Start with Roles"
          body="Custom roles decide who can open which folders. After Continue, open the blinking Roles header in the left sidebar (▸)."
          onNext={() => setTipPaused(true)}
          nextLabel="Continue"
        />
      ) : null}

      {step === "roles-intro" ? (
        <OnboardingPrompt
          title="What roles are for"
          body="A role is a label like Design or Finance. You’ll attach roles to folders to lock them, and later to people so they can open those folders. Built-in privileges (Owner / Admin / Editor / Member) stay separate."
          onNext={() => setStep("roles-name")}
        />
      ) : null}

      {step === "roles-name" ? (
        <OnboardingPrompt
          title="Name a role"
          body="Type something short like “Design”, “Ops”, or “Client”. You’ll use this name when restricting a folder."
          actionLabel="Add Role Name"
          onAction={() => focusOnboardingStep("roles-name")}
        />
      ) : null}

      {step === "roles-create" ? (
        <OnboardingPrompt
          title="Create the role"
          body="Save the role you named. Nothing is restricted yet — you’re just defining the label."
          actionLabel="Create Role"
          onAction={() => clickOnboardingStep("roles-create")}
        />
      ) : null}

      {step === "roles-list" ? (
        <OnboardingPrompt
          title="Your role is ready"
          body="It shows in the list with a member count. Next we’ll cover the optional “Hide folders with this role” switch."
          onNext={() => setStep("roles-hide")}
        />
      ) : null}

      {step === "roles-hide" ? (
        <OnboardingPrompt
          title="Hide folders with this role"
          body="Optional. When checked, people without this role won’t even see folders that require it (instead of seeing a locked folder)."
          actionLabel="Toggle Hide"
          onAction={() => clickOnboardingStep("roles-hide")}
          onNext={() => setStep("roles-hide-info")}
        />
      ) : null}

      {step === "roles-hide-info" ? (
        <OnboardingPrompt
          title="When to hide"
          body="Use hide for private areas (HR, client-only). Leave it off if you want everyone to see the folder name but only role-holders can open it. You can change this anytime."
          onNext={() => setStep("roles-assign-info")}
        />
      ) : null}

      {step === "roles-assign-info" ? (
        <OnboardingPrompt
          title="Giving people a role"
          body="Open a member’s ··· menu → Custom roles to check this role for them. When you invite someone, you can also assign roles later the same way. Without the role, restricted folders stay locked (or hidden)."
          onNext={() => setStep("roles-folder-bridge")}
        />
      ) : null}

      {step === "roles-folder-bridge" ? (
        <OnboardingPrompt
          title="Next: put the role on a folder"
          body="We’ll create a folder next. On the Roles field, pick the role you just made to restrict that folder — or leave it empty for everyone."
          onNext={() => setStep("create-folder")}
        />
      ) : null}

      {step === "create-folder" && showOpenTabTip ? (
        <OnboardingPrompt
          title="Open Folders"
          body="After Continue, open the blinking Folders header (▸ or the empty space) to create your first folder."
          onNext={() => setTipPaused(true)}
          nextLabel="Continue"
        />
      ) : null}

      {step === "folder-name" ? (
        <OnboardingPrompt
          title="Name your folder"
          body="Type something like “General”, then follow the next highlights."
          actionLabel="Add Folder Name"
          onAction={() => focusOnboardingStep("folder-name")}
        />
      ) : null}

      {/* folder-roles tip lives on GuidedCreateFolderForm (hide on focus, advance on leave). */}

      {step === "folder-hide" ? (
        <OnboardingPrompt
          title="Hide from unauthorized"
          body="Optional: hide locked folders from people without access."
          actionLabel="Toggle Hide"
          onAction={() => clickOnboardingStep("folder-hide")}
          onNext={() => setStep("folder-always")}
        />
      ) : null}

      {step === "folder-always" ? (
        <OnboardingPrompt
          title="Always show"
          body="Optional: keep the folder visible even when restricted."
          actionLabel="Toggle Always Show"
          onAction={() => clickOnboardingStep("folder-always")}
          onNext={() => setStep("folder-accessible")}
        />
      ) : null}

      {step === "folder-accessible" ? (
        <OnboardingPrompt
          title="Always accessible"
          body="Optional: let anyone open this folder even when roles are set. Then add the folder."
          actionLabel="Toggle Always Accessible"
          onAction={() => clickOnboardingStep("folder-accessible")}
          onNext={() => setStep("folder-submit")}
        />
      ) : null}

      {step === "folder-submit" ? (
        <OnboardingPrompt
          title="Add the folder"
          body="Create your first folder with the blinking Add folder button."
          actionLabel="Add Folder"
          onAction={() => clickOnboardingStep("folder-submit")}
        />
      ) : null}

      {step === "open-folder" && showOpenTabTip ? (
        <OnboardingPrompt
          title="Open a folder"
          body="After Continue, tap a blinking folder card — empty space opens it."
          onNext={() => setTipPaused(true)}
          nextLabel="Continue"
        />
      ) : null}

      {step === "open-add-task" && showOpenTabTip ? (
        <OnboardingPrompt
          title="Open Add Task"
          body="After Continue, open the blinking Add Task bar (▸ or the empty space) to name your first task."
          onNext={() => setTipPaused(true)}
          nextLabel="Continue"
        />
      ) : null}

      {step === "task-menu-info" && showOpenTabTip ? (
        <OnboardingPrompt
          title="Edit or delete a task"
          body="Your task is in. After Continue, open the blinking ⋮ menu beside Claim Task for Rename / Replace or Delete."
          onNext={() => setTipPaused(true)}
          nextLabel="Continue"
        />
      ) : null}
    </div>
  );
}
