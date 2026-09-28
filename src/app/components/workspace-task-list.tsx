"use client";

import {
  TaskSortControls,
  useChipAwareTaskSort,
} from "@/app/components/task-sort-controls";
import {
  WorkspaceTaskRow,
  type AssignableMember,
  type WorkspaceTaskData,
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

      {isRoot ? (
        <ul className="space-y-3">
          {sorted.map((task) => (
            <WorkspaceTaskRow
              key={task.id}
              workspaceId={workspaceId}
              userId={userId}
              canEdit={canEdit}
              isRoot
              task={task}
              publicTagOptions={publicTagOptions}
              privateTagOptions={privateTagOptions}
              urgencyChips={urgencyChips}
              assignableMembers={assignableMembers}
            />
          ))}
          {sorted.length === 0 ? (
            <li className="text-sm text-[#0A3D45]/60">
              {emptyMessage ?? "No tasks in this workspace yet."}
            </li>
          ) : null}
        </ul>
      ) : (
        <TaskStatusSections
          workspaceId={workspaceId}
          userId={userId}
          canEdit={canEdit}
          tasks={sorted}
          publicTagOptions={publicTagOptions}
          privateTagOptions={privateTagOptions}
          urgencyChips={urgencyChips}
          assignableMembers={assignableMembers}
          emptyMessage={emptyMessage}
        />
      )}
    </div>
  );
}
