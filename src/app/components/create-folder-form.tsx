"use client";

import { InlineActionForm } from "@/app/components/forms";
import { TagSuggestInput } from "@/app/components/tag-suggest-input";
import { createFolderAction } from "@/app/actions/tasks";

export function CreateFolderForm({
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
  return (
    <InlineActionForm
      className="flex flex-col gap-2"
      action={createFolderAction}
      submitLabel="Add folder"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <input
        name="name"
        required
        placeholder="Folder Name"
        className="rowgon-input text-sm"
      />
      {parentName ? (
        <p className="text-[11px] text-[color:var(--rowgon-deep)]/55">
          Nesting under “{parentName}”
        </p>
      ) : null}

      {canSetAccess ? (
        <>
          <TagSuggestInput
            name="roles"
            tags={roleNames}
            placeholder="Roles (optional)"
            allowMultiple
            keepOpenOnPick
            emptyMessage={
              roleNames.length === 0
                ? "No roles yet — create one in Roles first"
                : "No matching roles"
            }
            hint="Leave empty for all members. Pick roles to restrict access."
          />
          <label className="flex cursor-pointer items-start gap-2 text-xs text-[color:var(--rowgon-deep)]">
            <input
              type="checkbox"
              name="hideFromUnauthorized"
              value="1"
              className="mt-0.5"
            />
            <span>
              Hide from unauthorized
              <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/50">
                Don’t show a locked folder to people without access.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-[color:var(--rowgon-deep)]">
            <input type="checkbox" name="alwaysVisible" value="1" className="mt-0.5" />
            <span>
              Always show
              <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/50">
                Overrides hide rules — always visible (still locked without access).
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-[color:var(--rowgon-deep)]">
            <input
              type="checkbox"
              name="alwaysAccessible"
              value="1"
              className="mt-0.5"
            />
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
  );
}
