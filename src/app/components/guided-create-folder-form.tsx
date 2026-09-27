"use client";

import { useEffect, useState } from "react";
import { InlineActionForm } from "@/app/components/forms";
import {
  OnboardingPrompt,
  blinkRing,
} from "@/app/components/onboarding-prompt";
import { TagSuggestInput } from "@/app/components/tag-suggest-input";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import { createFolderAction } from "@/app/actions/tasks";
import { focusOnboardingStep } from "@/lib/onboarding-targets";
import { nextFolderCreateStep } from "@/lib/workspace-onboarding";

/** Remount when blink ends so Safari can’t leave a frozen blue fill. */
function blinkKey(on: boolean, id: string) {
  return on ? `${id}-blink` : id;
}

/** Create-folder form with guided onboarding blinks (mirrors Add Task tour). */
export function GuidedCreateFolderForm({
  workspaceId,
  parentId,
  parentName,
  roleNames,
  canSetAccess,
}: {
  workspaceId: string;
  parentId?: string | null;
  parentName?: string | null;
  roleNames: string[];
  canSetAccess: boolean;
}) {
  const { active, step, setStep, blink, track, hasRole } =
    useWorkspaceOnboarding();
  const [name, setName] = useState("");
  const [nameClicked, setNameClicked] = useState(false);
  /** Hide Pick Roles tip while the field is focused; advance on leave/add. */
  const [rolesTipPaused, setRolesTipPaused] = useState(false);

  useEffect(() => {
    if (step !== "folder-roles") setRolesTipPaused(false);
  }, [step]);

  function advanceFrom(current: typeof step) {
    if (!active) return;
    if (track === "short") {
      if (current === "folder-name") setStep("folder-submit");
      return;
    }
    setStep(nextFolderCreateStep(current, canSetAccess));
  }

  function leaveRolesStep() {
    if (active && step === "folder-roles") advanceFrom("folder-roles");
  }

  const showNameBlink = blink("folder-name") && !nameClicked;
  const showRolesTip =
    active && step === "folder-roles" && !rolesTipPaused;

  return (
    <>
    <InlineActionForm
      className="flex flex-col gap-2"
      action={createFolderAction}
      submitLabel="Add folder"
      submitClassName={blinkRing(blink("folder-submit"))}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <input
        type="text"
        inputMode="text"
        enterKeyHint="next"
        autoCapitalize="sentences"
        name="name"
        data-onboarding="folder-name"
        required
        placeholder="Folder Name"
        className={`rowgon-input text-sm ${blinkRing(showNameBlink)}`}
        value={name}
        onFocus={() => setNameClicked(true)}
        onClick={() => setNameClicked(true)}
        onChange={(e) => {
          const v = e.target.value;
          setName(v);
          if (active && step === "folder-name" && v.trim().length > 0) {
            advanceFrom("folder-name");
          }
        }}
      />
      {parentName ? (
        <p className="text-[11px] text-[color:var(--rowgon-deep)]/55">
          Nesting under “{parentName}”
        </p>
      ) : null}

      {canSetAccess && track !== "short" ? (
        <>
          <TagSuggestInput
            name="roles"
            tags={roleNames}
            placeholder="Roles (optional)"
            allowMultiple
            keepOpenOnPick
            dataOnboarding="folder-roles"
            inputClassName={`rowgon-input text-sm ${blinkRing(blink("folder-roles"))}`}
            emptyMessage={
              roleNames.length === 0
                ? "No roles yet — create one in Roles first"
                : "No matching roles"
            }
            hint={
              active
                ? undefined
                : "Leave empty for all members. Pick roles to restrict access."
            }
            onInputFocus={() => {
              if (active && step === "folder-roles") setRolesTipPaused(true);
            }}
            onInputBlur={
              active && step === "folder-roles" ? leaveRolesStep : undefined
            }
            onEnterPress={
              active && step === "folder-roles" ? leaveRolesStep : undefined
            }
            onCommittedTagsChange={(list) => {
              if (active && step === "folder-roles" && list.length > 0) {
                leaveRolesStep();
              }
            }}
          />
          <label
            className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-xs text-[color:var(--rowgon-deep)]"
            onClick={() => {
              if (active && step === "folder-hide") advanceFrom("folder-hide");
            }}
          >
            <span
              key={blinkKey(blink("folder-hide"), "folder-hide")}
              className={`mt-0.5 inline-flex shrink-0 rounded-md p-0.5 ${
                blink("folder-hide") ? "animate-rowgon-blink-ring" : ""
              }`}
            >
              <input
                type="checkbox"
                name="hideFromUnauthorized"
                value="1"
                className="mt-0"
                onChange={() => {
                  if (active && step === "folder-hide")
                    advanceFrom("folder-hide");
                }}
              />
            </span>
            <span>
              Hide from unauthorized
              <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/50">
                Don’t show a locked folder to people without access.
              </span>
            </span>
          </label>
          <label
            className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-xs text-[color:var(--rowgon-deep)]"
            onClick={() => {
              if (active && step === "folder-always")
                advanceFrom("folder-always");
            }}
          >
            <span
              key={blinkKey(blink("folder-always"), "folder-always")}
              className={`mt-0.5 inline-flex shrink-0 rounded-md p-0.5 ${
                blink("folder-always") ? "animate-rowgon-blink-ring" : ""
              }`}
            >
              <input
                type="checkbox"
                name="alwaysVisible"
                value="1"
                className="mt-0"
                onChange={() => {
                  if (active && step === "folder-always")
                    advanceFrom("folder-always");
                }}
              />
            </span>
            <span>
              Always show
              <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/50">
                Overrides hide rules — always visible (still locked without
                access).
              </span>
            </span>
          </label>
          <label
            className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 text-xs text-[color:var(--rowgon-deep)]"
            onClick={() => {
              if (active && step === "folder-accessible")
                advanceFrom("folder-accessible");
            }}
          >
            <span
              key={blinkKey(blink("folder-accessible"), "folder-accessible")}
              className={`mt-0.5 inline-flex shrink-0 rounded-md p-0.5 ${
                blink("folder-accessible") ? "animate-rowgon-blink-ring" : ""
              }`}
            >
              <input
                type="checkbox"
                name="alwaysAccessible"
                value="1"
                className="mt-0"
                onChange={() => {
                  if (active && step === "folder-accessible")
                    advanceFrom("folder-accessible");
                }}
              />
            </span>
            <span>
              Always accessible
              <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/50">
                Anyone can open this folder even when roles are set.
              </span>
            </span>
          </label>
        </>
      ) : null}
    </InlineActionForm>

    {showRolesTip ? (
      <OnboardingPrompt
        title="Who can see this folder?"
        body={
          hasRole
            ? "Pick the role you created from the suggestions (or leave empty for everyone). The tip hides when you open the field, then moves on after you add a role, tap away, dismiss the keyboard, or press Enter."
            : "Roles is optional — leave empty for everyone, or pick roles from the list to restrict access."
        }
        actionLabel="Pick Roles"
        onAction={() => {
          setRolesTipPaused(true);
          focusOnboardingStep("folder-roles");
        }}
        onNext={() => setStep("folder-hide")}
      />
    ) : null}
    </>
  );
}
