"use client";

import { useEffect, useState } from "react";
import {
  WorkspaceTaskRow,
  type AssignableMember,
  type WorkspaceTaskData,
} from "@/app/components/workspace-task-row";
import type { UrgencyChipPrefs } from "@/app/components/task-ui";
import type { FolderMoveOption } from "@/lib/folder-tree";
import type { TaskStatus } from "@/generated/prisma/client";

type SectionId = "unclaimed" | "claimed" | "under_review" | "completed";

const SECTIONS: {
  id: SectionId;
  title: string;
}[] = [
  { id: "unclaimed", title: "Unclaimed" },
  { id: "claimed", title: "Claimed" },
  { id: "under_review", title: "Under Review" },
  { id: "completed", title: "Completed" },
];

const STORAGE_PREFIX = "rowgon.task-sections.open.";

function sectionForTask(task: {
  status: TaskStatus;
  assigneeId: string | null;
}): SectionId {
  if (task.status === "DONE") return "completed";
  if (task.status === "IN_REVIEW") return "under_review";
  if (task.status === "CLAIMED" && task.assigneeId) return "claimed";
  return "unclaimed";
}

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

function readOpenMap(workspaceId: string): Partial<Record<SectionId, boolean>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<SectionId, boolean>>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeOpenMap(
  workspaceId: string,
  map: Partial<Record<SectionId, boolean>>,
) {
  try {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

function TaskSection({
  workspaceId,
  sectionId,
  title,
  count,
  children,
}: {
  workspaceId: string;
  sectionId: SectionId;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  // Default closed; restore saved preference after mount.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = readOpenMap(workspaceId)[sectionId];
    if (typeof saved === "boolean") setOpen(saved);
  }, [workspaceId, sectionId]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      const map = readOpenMap(workspaceId);
      map[sectionId] = next;
      writeOpenMap(workspaceId, map);
      return next;
    });
  };

  return (
    <section className="space-y-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-full border border-[#0A3D45]/12 bg-[#0A3D45]/[0.05] px-4 py-2.5 text-left transition hover:border-[#0A3D45]/20 hover:bg-[#0A3D45]/[0.08]"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-[family-name:var(--font-display)] text-lg text-[#0A3D45]">
            {title}
          </span>
          <span className="rounded-full bg-[#0A3D45]/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#0A3D45]/70">
            {count}
          </span>
        </span>
        <span className="shrink-0 text-sm text-[#0A3D45]/55" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? <ul className="space-y-3">{children}</ul> : null}
    </section>
  );
}

export function TaskStatusSections({
  workspaceId,
  userId,
  canEdit,
  isRoot = false,
  tasks,
  publicTagOptions = [],
  privateTagOptions = [],
  urgencyChips,
  assignableMembers = [],
  moveOptions = [],
  emptyMessage,
  showRecurrenceChip = true,
  showTaskHistory = true,
}: {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
  /** When true (All Tasks), rows show the task’s folder path. */
  isRoot?: boolean;
  tasks: WorkspaceTaskData[];
  publicTagOptions?: string[];
  privateTagOptions?: string[];
  urgencyChips?: UrgencyChipPrefs;
  assignableMembers?: AssignableMember[];
  moveOptions?: FolderMoveOption[];
  emptyMessage?: string;
  showRecurrenceChip?: boolean;
  showTaskHistory?: boolean;
}) {
  const grouped: Record<SectionId, WorkspaceTaskData[]> = {
    unclaimed: [],
    claimed: [],
    under_review: [],
    completed: [],
  };

  for (const task of tasks) {
    grouped[sectionForTask(task)].push(task);
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[#0A3D45]/60">
        {emptyMessage ??
          (isRoot ? "No tasks in this workspace yet." : "No tasks here yet.")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => {
        const list = grouped[section.id];
        return (
          <TaskSection
            key={section.id}
            workspaceId={workspaceId}
            sectionId={section.id}
            title={section.title}
            count={list.length}
          >
            {list.length === 0 ? (
              <li className="text-sm text-[#0A3D45]/50">None</li>
            ) : (
              list.map((task) => (
                <WorkspaceTaskRow
                  key={task.id}
                  workspaceId={workspaceId}
                  userId={userId}
                  canEdit={canEdit}
                  isRoot={isRoot}
                  task={task}
                  publicTagOptions={publicTagOptions}
                  privateTagOptions={privateTagOptions}
                  urgencyChips={urgencyChips}
                  assignableMembers={assignableMembers}
                  moveOptions={moveOptions}
                  showRecurrenceChip={showRecurrenceChip}
                  showTaskHistory={showTaskHistory}
                />
              ))
            )}
          </TaskSection>
        );
      })}
    </div>
  );
}
