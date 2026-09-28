"use client";

import { useEffect, useState } from "react";
import { GuidedCreateFolderForm } from "@/app/components/guided-create-folder-form";
import { FolderBubble } from "@/app/components/folder-bubble";
import { FolderTemplatesPanel } from "@/app/components/folder-templates-panel";
import { WorkspaceCollapsible } from "@/app/components/workspace-collapsible";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import {
  readFoldersOpenPreference,
  writeFoldersOpenPreference,
} from "@/lib/workspace-onboarding";

type BubbleFolder = {
  id: string;
  name: string;
  locked: boolean;
  requiredRoleIds: string[];
  canAccess: boolean;
  done: number;
  total: number;
  unclaimed: number;
  folderActions: {
    workspaceId: string;
    folderId: string;
    folderName: string;
    canManageRoles: boolean;
    workspaceRoles: { id: string; name: string }[];
    requiredRoleIds: string[];
    hideFromUnauthorized?: boolean;
    alwaysVisible?: boolean;
    alwaysAccessible?: boolean;
  };
};

type SavedTemplate = {
  id: string;
  name: string;
  treeJson: string;
};

const FOLDER_FORM_STEPS = new Set([
  "folder-name",
  "folder-roles",
  "folder-hide",
  "folder-always",
  "folder-accessible",
  "folder-submit",
]);

export function WorkspaceFoldersPanel({
  workspaceId,
  currentFolderName,
  childFolders,
  canEdit,
  workspaceArchived,
  canManageRoles,
  roleNames,
  parentId,
  parentName,
  templateParentId,
  templateParentName,
  canSaveTemplates,
  savedTemplates,
  canEditTemplates,
}: {
  workspaceId: string;
  currentFolderName: string | null;
  childFolders: BubbleFolder[];
  canEdit: boolean;
  workspaceArchived: boolean;
  canManageRoles: boolean;
  roleNames: string[];
  parentId: string | null;
  parentName: string | null;
  templateParentId: string | null;
  templateParentName: string | null;
  canSaveTemplates: boolean;
  savedTemplates: SavedTemplate[];
  canEditTemplates: boolean;
}) {
  const { active, needsChooser, step, setStep, blink } =
    useWorkspaceOnboarding();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readFoldersOpenPreference(workspaceId);
    if (stored != null) {
      setOpen(stored);
    } else {
      // During chooser / onboarding start closed; otherwise open
      setOpen(!(active || needsChooser));
    }
    setHydrated(true);
  }, [workspaceId, active, needsChooser]);

  // Keep Folders open during the create form / open-folder pick — but never
  // auto-open on create-folder; the user opens that tab after Continue.
  useEffect(() => {
    if (!hydrated) return;
    if (step === "create-folder") return;
    if (step === "open-folder" || FOLDER_FORM_STEPS.has(step)) {
      setOpen(true);
      writeFoldersOpenPreference(workspaceId, true);
    }
  }, [step, hydrated, workspaceId]);

  // Already expanded when we ask them to open Folders → advance.
  useEffect(() => {
    if (!hydrated) return;
    if (active && step === "create-folder" && open) {
      setStep("folder-name");
    }
  }, [active, step, open, hydrated, setStep]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    writeFoldersOpenPreference(workspaceId, next);
    // Opening Folders during create-folder: stop header blink → Folder Name
    if (next && active && step === "create-folder") {
      setStep("folder-name");
    }
  }

  if (!hydrated) {
    return <div className="rowgon-panel min-h-[3.5rem]" id="workspace-folders" />;
  }

  return (
    <WorkspaceCollapsible
      id="workspace-folders"
      title="Folders"
      description={
        currentFolderName
          ? `Subfolders under “${currentFolderName}”. Browse here; create nested folders below.`
          : "Browse workspace folders here. Create a folder or apply a template below."
      }
      open={open}
      onOpenChange={onOpenChange}
      blinkEmpty={blink("folders-header")}
    >
      {childFolders.length > 0 ? (
        <ul className="space-y-2">
          {childFolders.map((f) => (
            <li key={f.id}>
              <FolderBubble
                workspaceId={workspaceId}
                folderId={f.id}
                name={f.name}
                locked={f.locked}
                restricted={f.requiredRoleIds.length > 0}
                done={f.done}
                total={f.total}
                unclaimed={f.unclaimed}
                showActions={canEdit && f.canAccess}
                folderActions={f.folderActions}
                blink={blink("folder-bubble") && !f.locked}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#0A3D45]/55">
          {currentFolderName
            ? "No subfolders yet."
            : "No folders yet — create one below to start organizing tasks."}
        </p>
      )}

      {canEdit && !workspaceArchived ? (
        <div className="mt-5 space-y-4 border-t border-[#0A3D45]/10 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/45">
            New folder
          </p>
          <GuidedCreateFolderForm
            workspaceId={workspaceId}
            parentId={parentId}
            parentName={parentName}
            roleNames={roleNames}
            canSetAccess={canManageRoles}
          />
          <FolderTemplatesPanel
            workspaceId={workspaceId}
            parentId={templateParentId}
            currentFolderId={templateParentId}
            currentFolderName={templateParentName}
            canEdit={canEditTemplates}
            canSave={canSaveTemplates}
            savedTemplates={savedTemplates}
          />
        </div>
      ) : workspaceArchived ? (
        <p className="mt-4 text-xs text-[#0A3D45]/55">
          Archived workspaces can’t add folders.
        </p>
      ) : (
        <p className="mt-4 text-xs text-[#0A3D45]/55">
          Editors and above can add folders.
        </p>
      )}
    </WorkspaceCollapsible>
  );
}
