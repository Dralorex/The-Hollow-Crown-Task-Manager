"use client";

import { FolderBubble } from "@/app/components/folder-bubble";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";

type BubbleFolder = {
  id: string;
  name: string;
  locked: boolean;
  restricted: boolean;
  done: number;
  total: number;
  unclaimed: number;
  showActions: boolean;
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
    moveOptions?: { id: string | null; label: string }[];
    currentParentId?: string | null;
  };
};

/** Folder cards that blink while onboarding asks the user to open one. */
export function OnboardingFolderBubbles({
  workspaceId,
  childFolders,
  showStats = true,
}: {
  workspaceId: string;
  childFolders: BubbleFolder[];
  showStats?: boolean;
}) {
  const { active, step, blink } = useWorkspaceOnboarding();
  const pointAtFolders = active && step === "open-folder" && blink("folder-bubble");

  return (
    <ul className="mt-4 space-y-2">
      {childFolders.map((f) => (
        <li key={f.id}>
          <FolderBubble
            workspaceId={workspaceId}
            folderId={f.id}
            name={f.name}
            locked={f.locked}
            restricted={f.restricted}
            done={f.done}
            total={f.total}
            unclaimed={f.unclaimed}
            showActions={f.showActions}
            folderActions={f.folderActions}
            blink={pointAtFolders && !f.locked}
            showStats={showStats}
          />
        </li>
      ))}
    </ul>
  );
}
