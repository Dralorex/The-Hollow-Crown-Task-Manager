"use client";

import {
  TaskSortControls,
  useChipAwareTaskSort,
} from "@/app/components/task-sort-controls";
import type {
  AssignableMember,
  WorkspaceTaskData,
} from "@/app/components/workspace-task-row";
import { TaskStatusSections } from "@/app/components/task-status-sections";
import type { UrgencyChipPrefs } from "@/app/components/task-ui";

export function WorkspaceTaskList({
  workspaceId,
  userId,
  canEdit,
  isRoot,
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
  isRoot: boolean;
  tasks: WorkspaceTaskData[];
  publicTagOptions?: string[];
  privateTagOptions?: string[];
  urgencyChips?: UrgencyChipPrefs;
  assignableMembers?: AssignableMember[];
  emptyMessage?: string;
}) {
  const { sortMode, setSortMode, modes, sorted } = useChipAwareTaskSort(
    tasks,
    urgencyChips,
  );

  return (
    <div className="space-y-4">
      <TaskSortControls
        modes={modes}
        sortMode={sortMode}
        onChange={setSortMode}
      />

      <TaskStatusSections
        workspaceId={workspaceId}
        userId={userId}
        canEdit={canEdit}
        isRoot={isRoot}
        tasks={sorted}
        publicTagOptions={publicTagOptions}
        privateTagOptions={privateTagOptions}
        urgencyChips={urgencyChips}
        assignableMembers={assignableMembers}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
