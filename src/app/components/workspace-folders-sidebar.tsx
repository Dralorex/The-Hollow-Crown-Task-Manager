"use client";

import { useEffect, useState } from "react";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import { GuidedCreateFolderForm } from "@/app/components/guided-create-folder-form";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import {
  isFolderCreateStep,
  readFoldersOpenPreference,
  writeFoldersOpenPreference,
} from "@/lib/workspace-onboarding";

/** Sidebar “Add Folders” tab, wired to the guided first-session tour. */
export function WorkspaceFoldersSidebar({
  workspaceId,
  parentId,
  parentName,
  roleNames,
  canSetAccess,
  canEdit,
}: {
  workspaceId: string;
  parentId?: string | null;
  parentName?: string | null;
  roleNames: string[];
  canSetAccess: boolean;
  canEdit: boolean;
}) {
  const { active, step, setStep, blink } = useWorkspaceOnboarding();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = readFoldersOpenPreference(workspaceId);
    if (stored != null) setOpen(stored);
  }, [workspaceId]);

  // Keep the tab open while the guided create-folder fields are in play — but
  // never auto-open on create-folder; the user opens it after Continue.
  useEffect(() => {
    if (!active || step === "create-folder") return;
    if (isFolderCreateStep(step)) setOpen(true);
  }, [active, step]);

  // Already expanded when we ask them to open Add Folders → advance.
  useEffect(() => {
    if (active && step === "create-folder" && open) {
      setStep("folder-name");
    }
  }, [active, step, open, setStep]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    writeFoldersOpenPreference(workspaceId, next);
    if (next && active && step === "create-folder") {
      setStep("folder-name");
    }
  }

  return (
    <ChatSidebarSection
      id="workspace-folders"
      title="Add Folders"
      description="Create a folder here. Browse folders from the main panel."
      open={open}
      onOpenChange={onOpenChange}
      blinkHeader={blink("folders-header")}
    >
      {canEdit ? (
        <GuidedCreateFolderForm
          workspaceId={workspaceId}
          parentId={parentId}
          parentName={parentName}
          roleNames={roleNames}
          canSetAccess={canSetAccess}
        />
      ) : (
        <p className="text-xs text-[color:var(--tide-deep)]/55">
          Editors and above can add folders.
        </p>
      )}
    </ChatSidebarSection>
  );
}
