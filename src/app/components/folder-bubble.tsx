import Link from "next/link";
import { FolderActions } from "@/app/components/folder-actions";
import { FolderCompletionStats } from "@/app/components/folder-completion-stats";

type FolderActionsProps = {
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

/** Folder card where empty space opens the folder; actions stay clickable. */
export function FolderBubble({
  workspaceId,
  folderId,
  name,
  locked,
  restricted,
  done,
  total,
  unclaimed,
  showActions,
  folderActions,
  blink = false,
}: {
  workspaceId: string;
  folderId: string;
  name: string;
  locked: boolean;
  restricted: boolean;
  done: number;
  total: number;
  unclaimed: number;
  showActions: boolean;
  folderActions: FolderActionsProps;
  /** Slow blue pulse while onboarding asks the user to open a folder. */
  blink?: boolean;
}) {
  const href = `/app/w/${workspaceId}?folder=${folderId}`;

  return (
    <div
      className={`group relative flex items-start justify-between gap-2 rounded-lg border px-3 py-2.5 transition ${
        locked
          ? "cursor-not-allowed border-[#0A3D45]/8 bg-[#0A3D45]/[0.015] opacity-80"
          : "border-[#0A3D45]/10 bg-[#0A3D45]/[0.02] hover:border-[#0A3D45]/20 hover:bg-[#0A3D45]/[0.05]"
      } ${
        blink && !locked
          ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
          : ""
      }`}
    >
      {!locked ? (
        <Link
          href={href}
          data-onboarding={blink ? "folder-bubble" : undefined}
          className="absolute inset-0 z-0 rounded-lg"
          aria-label={`Open folder ${name}`}
        />
      ) : null}

      <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
        {locked ? (
          <span
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#0A3D45]/45"
            title="You don’t have a required role for this folder"
            aria-disabled="true"
          >
            <span className="truncate">{name}</span>
            <span aria-hidden>🔒</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#0A3D45]">
            <span className="truncate">{name}</span>
            {restricted ? (
              <span
                className="text-[10px] text-[#0A3D45]/40"
                title="Role-restricted"
              >
                ●
              </span>
            ) : null}
          </span>
        )}
        <FolderCompletionStats done={done} total={total} unclaimed={unclaimed} />
      </div>

      {showActions ? (
        <div className="relative z-[1] shrink-0 pointer-events-auto">
          <FolderActions {...folderActions} />
        </div>
      ) : null}
    </div>
  );
}
