"use client";

import { useState } from "react";
import { InlineActionForm } from "@/app/components/forms";
import { ArchiveVisibilityFields } from "@/app/components/archive-visibility-fields";
import {
  archiveFolderAction,
  unarchiveFolderAction,
} from "@/app/actions/tasks";
import {
  archiveWorkspaceAction,
  unarchiveWorkspaceAction,
} from "@/app/actions/workspaces";

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block text-[10px] text-[#0A3D45]/45 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      ▾
    </span>
  );
}

export function ArchiveWorkspacePanel({
  workspaceId,
  isArchived,
  members,
}: {
  workspaceId: string;
  isArchived: boolean;
  members: { id: string; username: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (isArchived) {
    return (
      <div className="rounded-xl border border-[#E85D4C]/25 bg-[#E85D4C]/8 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#0A3D45]">
            Workspace archived
          </p>
          <InlineActionForm
            className="m-0"
            action={unarchiveWorkspaceAction}
            submitLabel="Restore"
            submitVariant="primary"
            submitClassName="min-h-9 px-3 text-sm"
          >
            <input type="hidden" name="workspaceId" value={workspaceId} />
          </InlineActionForm>
        </div>
        <p className="mt-1 text-xs text-[#0A3D45]/65">
          History kept. New folders, tasks, and invites are paused.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-[#0A3D45]/70 transition hover:bg-[#0A3D45]/6 hover:text-[#0A3D45]"
      >
        Archive workspace
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-[min(100vw-2rem,20rem)] rounded-xl border border-[#0A3D45]/12 bg-[#E8F7F6] p-3 shadow-lg sm:w-80">
          <p className="mb-2 text-xs text-[#0A3D45]/55">
            Soft-delete: hide from the main list without erasing history.
          </p>
          <InlineActionForm
            className="flex flex-col gap-3"
            action={archiveWorkspaceAction}
            submitLabel="Archive workspace"
            submitClassName="min-h-10 w-full text-sm"
          >
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <ArchiveVisibilityFields members={members} />
          </InlineActionForm>
        </div>
      ) : null}
    </div>
  );
}

export function ArchiveFolderControls({
  workspaceId,
  folderId,
  folderName,
  isArchived,
  members,
}: {
  workspaceId: string;
  folderId: string;
  folderName: string;
  isArchived: boolean;
  members: { id: string; username: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (isArchived) {
    return (
      <div className="mt-3 rounded-xl border border-[#E85D4C]/20 bg-[#E85D4C]/8 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[#0A3D45]/80">
            <span className="font-semibold">{folderName}</span> archived
          </p>
          <InlineActionForm
            className="m-0"
            action={unarchiveFolderAction}
            submitLabel="Restore"
            submitVariant="primary"
            submitClassName="min-h-9 px-3 text-sm"
          >
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="folderId" value={folderId} />
          </InlineActionForm>
        </div>
        <p className="mt-1 text-xs text-[#0A3D45]/60">
          Tasks stay for history; new work is paused.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-[#0A3D45]/65 transition hover:bg-[#0A3D45]/6 hover:text-[#0A3D45]"
      >
        Archive folder
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-[min(100vw-2rem,20rem)] rounded-xl border border-[#0A3D45]/12 bg-[#E8F7F6] p-3 shadow-lg sm:w-80">
          <InlineActionForm
            className="flex flex-col gap-3"
            action={archiveFolderAction}
            submitLabel="Archive folder"
            submitClassName="min-h-10 w-full text-sm"
          >
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="folderId" value={folderId} />
            <ArchiveVisibilityFields members={members} />
          </InlineActionForm>
        </div>
      ) : null}
    </div>
  );
}
