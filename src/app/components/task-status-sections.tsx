"use client";

import { useState } from "react";
import {
  WorkspaceTaskRow,
  type AssignableMember,
  type WorkspaceTaskData,
} from "@/app/components/workspace-task-row";
import type { UrgencyChipPrefs } from "@/app/components/task-ui";
import type { TaskStatus } from "@/generated/prisma/client";

type SectionId = "unclaimed" | "claimed" | "completed";

const SECTIONS: {
  id: SectionId;
  title: string;
}[] = [
  { id: "unclaimed", title: "Unclaimed" },
  { id: "claimed", title: "Claimed" },
  { id: "completed", title: "Completed" },
];

function sectionForTask(task: {
  status: TaskStatus;
  assigneeId: string | null;
}): SectionId {
  if (task.status === "DONE") return "completed";
  if (task.status === "IN_REVIEW") return "claimed";
  if (task.status === "CLAIMED" && task.assigneeId) return "claimed";
  return "unclaimed";
}

function TaskSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="space-y-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-full border border-[#0A3D45]/12 bg-[#0A3D45]/[0.05] px-4 py-2.5 text-left transition hover:border-[#0A3D45]/20 hover:bg-[#0A3D45]/[0.08]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
  tasks,
  publicTagOptions = [],
  privateTagOptions = [],
  urgencyChips,
  assignableMembers = [],
  emptyMessage,
}: {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
  tasks: WorkspaceTaskData[];
  publicTagOptions?: string[];
  privateTagOptions?: string[];
  urgencyChips?: UrgencyChipPrefs;
  assignableMembers?: AssignableMember[];
  emptyMessage?: string;
}) {
  const grouped: Record<SectionId, WorkspaceTaskData[]> = {
    unclaimed: [],
    claimed: [],
    completed: [],
  };

  for (const task of tasks) {
    grouped[sectionForTask(task)].push(task);
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[#0A3D45]/60">
        {emptyMessage ?? "No tasks here yet."}
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
            title={section.title}
            count={list.length}
            defaultOpen={section.id !== "completed"}
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
                  isRoot={false}
                  task={task}
                  publicTagOptions={publicTagOptions}
                  privateTagOptions={privateTagOptions}
                  urgencyChips={urgencyChips}
                  assignableMembers={assignableMembers}
                />
              ))
            )}
          </TaskSection>
        );
      })}
    </div>
  );
}
