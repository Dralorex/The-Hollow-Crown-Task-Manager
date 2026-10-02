"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { AppLink } from "@/app/components/app-link";
import { InlineActionForm } from "@/app/components/forms";
import { MenuSurface, menuItemClass } from "@/app/components/menu-surface";
import { blinkRing } from "@/app/components/onboarding-prompt";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import {
  TaskUrgencyEdge,
  UrgencyChips,
  type UrgencyChipPrefs,
} from "@/app/components/task-ui";
import { AddTaskTagsForm } from "@/app/components/add-task-tags-form";
import { SendBackTaskControl } from "@/app/components/send-back-task-control";
import { UnclaimTaskControl } from "@/app/components/unclaim-task-control";
import {
  addChecklistItemAction,
  assignTaskAction,
  removeTaskTagAction,
  claimTaskAction,
  completeTaskAction,
  deleteTaskAction,
  forceUnclaimTaskAction,
  moveTaskToFolderAction,
  reviewTaskAction,
  toggleChecklistItemForm,
  updateTaskAction,
} from "@/app/actions/tasks";
import { personLabel } from "@/lib/utils";
import { confirmDelete } from "@/lib/confirm";
import type { FolderMoveOption } from "@/lib/folder-tree";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/client";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/lib/urgency";

type Person = {
  id: string;
  username: string;
  nickname: string | null;
};

type TagLink = {
  tagId: string;
  tag: { name: string; isPublic: boolean };
};

export type AssignableMember = {
  id: string;
  username: string;
};

export type WorkspaceTaskData = {
  id: string;
  name: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  createdAt: Date;
  folderId: string;
  assigneeId: string | null;
  completionComment: string | null;
  lastUnclaimReason: string | null;
  lastUnclaimWorkNote: string | null;
  lastSendBackReason: string | null;
  recurrenceCadence: string | null;
  assignee: Person | null;
  lastUnclaimedBy: Person | null;
  lastSentBackBy: Person | null;
  folder: { id: string; name: string } | null;
  tags: TagLink[];
  checklistItems: { id: string; label: string; done: boolean }[];
  activities: { id: string; message: string; createdAt: Date; type: string }[];
};

function dueInputValue(due: Date | null) {
  if (!due) return "";
  return format(due, "yyyy-MM-dd");
}

function TaskEditorMenu({
  workspaceId,
  task,
  highlightMenu = false,
  moveOptions = [],
}: {
  workspaceId: string;
  task: WorkspaceTaskData;
  /** Blink the ⋮ during onboarding until the user opens it. */
  highlightMenu?: boolean;
  moveOptions?: FolderMoveOption[];
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "edit" | "forceUnclaim" | "move">(
    "menu",
  );
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(dueInputValue(task.dueDate));
  const [reason, setReason] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [moveFolderId, setMoveFolderId] = useState(task.folderId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { active, step, completeOnboarding } = useWorkspaceOnboarding();

  useEffect(() => {
    setName(task.name);
    setDescription(task.description);
    setPriority(task.priority);
    setDueDate(dueInputValue(task.dueDate));
    setMoveFolderId(task.folderId);
  }, [task.name, task.description, task.priority, task.dueDate, task.folderId]);

  function close() {
    setOpen(false);
    setPanel("menu");
    setError(null);
    setReason("");
    setWorkNote("");
    setMoveFolderId(task.folderId);
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("taskId", task.id);
      fd.set("name", name.trim());
      fd.set("description", description.trim());
      fd.set("priority", priority);
      fd.set("dueDate", dueDate);
      const result = await updateTaskAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function forceUnclaim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("taskId", task.id);
      fd.set("reason", reason.trim());
      fd.set("workNote", workNote.trim());
      const result = await forceUnclaimTaskAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function removeTask() {
    if (!confirmDelete(`task “${task.name}”`)) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("taskId", task.id);
      const result = await deleteTaskAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function saveMove(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("taskId", task.id);
      fd.set("folderId", moveFolderId);
      const result = await moveTaskToFolderAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  const taskMoveChoices = moveOptions.filter((opt) => opt.id !== null);

  return (
    <MenuSurface
      open={open}
      onClose={close}
      widthClass="w-72"
      trigger={({ ref }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Task options"
          aria-expanded={open}
          data-onboarding={highlightMenu ? "task-menu" : undefined}
          className={`rounded-md px-1.5 py-0.5 text-[#0A3D45]/70 transition hover:bg-[#0A3D45]/8 hover:text-[#0A3D45] ${blinkRing(highlightMenu)}`}
          onClick={() => {
            setOpen((v) => !v);
            setPanel("menu");
            setError(null);
            if (active && step === "task-menu-info") {
              completeOnboarding();
            }
          }}
        >
          ···
        </button>
      )}
    >
      {panel === "menu" ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={menuItemClass()}
            onClick={() => setPanel("edit")}
          >
            Rename / modify
          </button>
          {taskMoveChoices.length > 0 ? (
            <button
              type="button"
              role="menuitem"
              className={menuItemClass()}
              onClick={() => {
                setMoveFolderId(task.folderId);
                setPanel("move");
              }}
            >
              Move…
            </button>
          ) : null}
          {task.assigneeId && task.status !== "DONE" ? (
            <button
              type="button"
              role="menuitem"
              className={menuItemClass(true)}
              onClick={() => setPanel("forceUnclaim")}
            >
              Force unclaim
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={menuItemClass(true)}
            disabled={pending}
            onClick={removeTask}
          >
            Delete
          </button>
          {error ? (
            <p className="px-3 py-2 text-xs text-[#9b2f22]">{error}</p>
          ) : null}
        </>
      ) : null}

      {panel === "move" ? (
        <form className="space-y-2 px-3 py-2" onSubmit={saveMove}>
          <p className="text-xs font-semibold text-[#0A3D45]">Move to folder</p>
          <select
            value={moveFolderId}
            onChange={(e) => setMoveFolderId(e.target.value)}
            className="tide-input w-full text-sm"
            aria-label="Destination folder"
            required
          >
            {taskMoveChoices.map((opt) => (
              <option key={opt.id!} value={opt.id!}>
                {opt.label}
              </option>
            ))}
          </select>
          {error ? <p className="text-xs text-[#9b2f22]">{error}</p> : null}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending || !moveFolderId}
              className="tide-btn-secondary !px-2.5 !py-1 text-xs disabled:opacity-50"
            >
              {pending ? "Moving…" : "Move"}
            </button>
            <button
              type="button"
              className="text-xs text-[#0A3D45]/55"
              onClick={() => {
                setError(null);
                setPanel("menu");
              }}
            >
              Back
            </button>
          </div>
        </form>
      ) : null}

      {panel === "edit" ? (
        <form className="space-y-2 px-3 py-2" onSubmit={saveEdit}>
          <p className="text-xs font-semibold text-[#0A3D45]">Edit task</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="tide-input w-full text-sm"
            placeholder="Task Name"
            required
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="tide-input min-h-[4rem] w-full text-sm"
            placeholder="Description"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="tide-input w-full text-sm"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="tide-input w-full text-sm"
          />
          {error ? <p className="text-xs text-[#9b2f22]">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-[#0A3D45]/60"
              onClick={() => setPanel("menu")}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending}
              className="text-xs font-semibold text-[#0A3D45]"
            >
              Save
            </button>
          </div>
        </form>
      ) : null}

      {panel === "forceUnclaim" ? (
        <form className="space-y-2 px-3 py-2" onSubmit={forceUnclaim}>
          <p className="text-xs font-semibold text-[#0A3D45]">Force unclaim</p>
          <p className="text-[11px] text-[#0A3D45]/60">
            Removes{" "}
            {task.assignee ? personLabel(task.assignee) : "the assignee"} and
            returns the task to open.
          </p>
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="tide-input w-full text-sm"
            placeholder="Reason"
            autoFocus
          />
          <textarea
            value={workNote}
            onChange={(e) => setWorkNote(e.target.value)}
            className="tide-input min-h-[3.5rem] w-full text-sm"
            placeholder="Optional notes for the next person"
          />
          {error ? <p className="text-xs text-[#9b2f22]">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-[#0A3D45]/60"
              onClick={() => setPanel("menu")}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending}
              className="text-xs font-semibold text-[#9b2f22]"
            >
              Confirm
            </button>
          </div>
        </form>
      ) : null}
    </MenuSurface>
  );
}


function TaskTagChip({
  workspaceId,
  taskId,
  tagId,
  name,
  isPublic,
  canRemove,
}: {
  workspaceId: string;
  taskId: string;
  tagId: string;
  name: string;
  isPublic: boolean;
  canRemove: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canRemove) {
    return (
      <span className="rounded-md bg-[#1a7a82]/10 px-2 py-0.5 text-xs text-[#0A3D45]">
        #{name}
        {!isPublic ? " (private)" : ""}
      </span>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="rounded-md bg-[#1a7a82]/10 px-2 py-0.5 text-xs text-[#0A3D45] transition hover:bg-[#1a7a82]/18"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        #{name}
        {!isPublic ? " (private)" : ""}
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-20 mt-1 w-40 rounded-md border border-[color:var(--panel-border)] bg-[color:var(--menu-bg)] p-2 shadow-md">
          <p className="text-[11px] text-[color:var(--tide-deep)]/70">Remove this tag?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="text-xs font-semibold text-[#9b2f22] disabled:opacity-50"
              onClick={() => {
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("workspaceId", workspaceId);
                  fd.set("taskId", taskId);
                  fd.set("tagId", tagId);
                  await removeTaskTagAction(null, fd);
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              Remove
            </button>
            <button
              type="button"
              className="text-xs text-[#0A3D45]/60"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </span>
      ) : null}
    </span>
  );
}

export function WorkspaceTaskRow({
  workspaceId,
  task,
  userId,
  canEdit,
  isRoot,
  publicTagOptions = [],
  privateTagOptions = [],
  urgencyChips,
  assignableMembers = [],
  moveOptions = [],
  showRecurrenceChip = true,
  showTaskHistory = true,
}: {
  workspaceId: string;
  task: WorkspaceTaskData;
  userId: string;
  canEdit: boolean;
  isRoot: boolean;
  publicTagOptions?: string[];
  privateTagOptions?: string[];
  urgencyChips?: UrgencyChipPrefs;
  assignableMembers?: AssignableMember[];
  moveOptions?: FolderMoveOption[];
  showRecurrenceChip?: boolean;
  showTaskHistory?: boolean;
}) {
  const isClaimed = Boolean(task.assigneeId);
  const isOpenAssigned = task.status === "OPEN" && Boolean(task.assigneeId);
  const assignedToOther = isOpenAssigned && task.assigneeId !== userId;
  const canClaim =
    !assignedToOther &&
    (task.status === "OPEN" || (task.status === "CLAIMED" && !task.assigneeId));
  const canReadyForReview =
    task.assigneeId === userId &&
    (task.status === "CLAIMED" || task.status === "OPEN");
  const canChecklist = task.assigneeId === userId && task.status === "CLAIMED";
  const canAddPrivateTag = task.assigneeId === userId;
  const claimLabel =
    isOpenAssigned && task.assigneeId === userId
      ? "Claim assignment"
      : "Claim Task";
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const checklist = task.checklistItems ?? [];
  const activities = task.activities ?? [];
  const { blink } = useWorkspaceOnboarding();
  const highlightTaskMenu = canEdit && blink("task-menu");

  const existingPublic = new Set(
    task.tags.filter((tt) => tt.tag.isPublic).map((tt) => tt.tag.name.toLowerCase()),
  );
  const existingPrivate = new Set(
    task.tags.filter((tt) => !tt.tag.isPublic).map((tt) => tt.tag.name.toLowerCase()),
  );
  const availablePublicTags = publicTagOptions.filter(
    (name) => !existingPublic.has(name.toLowerCase()),
  );
  const availablePrivateTags = privateTagOptions.filter(
    (name) => !existingPrivate.has(name.toLowerCase()),
  );

  useEffect(() => {
    setExpanded(false);
  }, [task.id, isClaimed]);

  function expandFromEmptySpace(e: React.MouseEvent) {
    if (expanded) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, label, form")) {
      return;
    }
    setExpanded(true);
  }

  function collapseFromHeader(e: React.MouseEvent) {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, label, form")) {
      return;
    }
    setExpanded(false);
  }

  return (
    <li
      className={`tide-panel relative overflow-hidden p-4 pl-5 transition ${
        expanded ? "pb-20 sm:pb-4" : "cursor-pointer"
      }`}
      onClick={expandFromEmptySpace}
    >
      <TaskUrgencyEdge priority={task.priority} dueDate={task.dueDate} />

      <div
        className={
          expanded
            ? "flex flex-col items-stretch gap-3"
            : "flex flex-wrap items-start justify-between gap-3"
        }
      >
        <div className={expanded ? "min-w-0 w-full" : "min-w-0 flex-1"}>
          <div
            className={
              expanded
                ? "flex cursor-pointer flex-wrap items-center gap-2 rounded-xl border border-[#0A3D45]/18 bg-[#0A3D45]/[0.03] px-2.5 py-2 transition hover:border-[#0A3D45]/28 hover:bg-[#0A3D45]/[0.05]"
                : "flex flex-wrap items-center gap-2"
            }
            onClick={expanded ? collapseFromHeader : undefined}
            role={expanded ? "button" : undefined}
            tabIndex={expanded ? 0 : undefined}
            aria-label={expanded ? "Collapse task details" : undefined}
            onKeyDown={
              expanded
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpanded(false);
                    }
                  }
                : undefined
            }
          >
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#0A3D45]/70"
              aria-hidden
            >
              <span className="text-sm leading-none">
                {expanded ? "▾" : "▸"}
              </span>
            </span>
            <h3 className="min-w-0 break-words text-lg font-semibold text-[#0A3D45]">
              {task.name}
            </h3>
            <UrgencyChips
              priority={task.priority}
              dueDate={task.dueDate}
              prefs={urgencyChips}
            />
            {showRecurrenceChip && task.recurrenceCadence ? (
              <span className="rounded-md bg-[#1a7a82]/12 px-2 py-0.5 text-[11px] font-semibold capitalize text-[#0A3D45]/75">
                ↻ {task.recurrenceCadence}
              </span>
            ) : null}
            {!expanded ? (
              <span className="text-xs text-[#0A3D45]/60">
                {isOpenAssigned
                  ? `Assigned to ${
                      task.assignee ? personLabel(task.assignee) : "someone"
                    }`
                  : isClaimed
                    ? `claimed by ${
                        task.assignee ? personLabel(task.assignee) : "someone"
                      }`
                    : "unclaimed"}
              </span>
            ) : (
              <span className="text-xs uppercase tracking-wide text-[#0A3D45]/50">
                {task.status.replace("_", " ")}
              </span>
            )}
            {canEdit ? (
              <span
                className="ml-auto inline-flex"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <TaskEditorMenu
                  workspaceId={workspaceId}
                  task={task}
                  highlightMenu={highlightTaskMenu}
                  moveOptions={moveOptions}
                />
              </span>
            ) : null}
          </div>

          {expanded ? (
            <>
              {isRoot && task.folder ? (
                <p className="mt-2 text-xs text-[#0A3D45]/55">
                  In{" "}
                  <AppLink
                    href={`/app/w/${workspaceId}?folder=${task.folderId}`}
                    className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                    compactPending
                  >
                    {task.folder.name}
                  </AppLink>
                </p>
              ) : null}
              {task.description ? (
                <p className="mt-1 text-sm text-[#0A3D45]/70">{task.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-[#0A3D45]/55">
                {task.dueDate
                  ? `Due ${format(task.dueDate, "MMM d, yyyy")}`
                  : "No due date"}
                {isOpenAssigned && task.assignee
                  ? ` · Assigned to ${personLabel(task.assignee)}`
                  : task.assignee
                    ? ` · claimed by ${personLabel(task.assignee)}`
                    : " · unclaimed"}
              </p>
              {!task.assignee && task.lastUnclaimReason ? (
                <div className="mt-2 rounded-md bg-[#0A3D45]/[0.04] px-2.5 py-2 text-xs text-[#0A3D45]/75">
                  <p>
                    <span className="font-semibold">Unclaim reason:</span>{" "}
                    {task.lastUnclaimReason}
                    {task.lastUnclaimedBy
                      ? ` — ${personLabel(task.lastUnclaimedBy)}`
                      : ""}
                  </p>
                  {task.lastUnclaimWorkNote ? (
                    <p className="mt-1">
                      <span className="font-semibold">Work notes:</span>{" "}
                      {task.lastUnclaimWorkNote}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {task.lastSendBackReason ? (
                <div className="mt-2 rounded-md bg-[#9b2f22]/[0.06] px-2.5 py-2 text-xs text-[#0A3D45]/75">
                  <p>
                    <span className="font-semibold">Send-back reason:</span>{" "}
                    {task.lastSendBackReason}
                    {task.lastSentBackBy
                      ? ` — ${personLabel(task.lastSentBackBy)}`
                      : ""}
                  </p>
                </div>
              ) : null}
              {task.completionComment ? (
                <p className="mt-1 text-xs italic text-[#0A3D45]/65">
                  Review note: {task.completionComment}
                </p>
              ) : null}

              {canChecklist || checklist.length > 0 ? (
                <div className="mt-3 rounded-xl border border-[#0A3D45]/10 bg-white/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/55">
                    Checklist
                  </p>
                  <ul className="mt-2 space-y-2">
                    {checklist.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-2 text-sm text-[#0A3D45]"
                      >
                        {canChecklist ? (
                          <form
                            action={toggleChecklistItemForm}
                            className="flex min-w-0 flex-1 items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="workspaceId"
                              value={workspaceId}
                            />
                            <input type="hidden" name="taskId" value={task.id} />
                            <input type="hidden" name="itemId" value={item.id} />
                            <button
                              type="submit"
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm ${
                                item.done
                                  ? "border-[#3DBEAB] bg-[#3DBEAB]/25 text-[#0A3D45]"
                                  : "border-[#0A3D45]/25 bg-white/70 text-transparent"
                              }`}
                              aria-label={
                                item.done ? "Mark incomplete" : "Mark complete"
                              }
                            >
                              ✓
                            </button>
                            <span
                              className={
                                item.done
                                  ? "min-w-0 text-[#0A3D45]/45 line-through"
                                  : "min-w-0 text-[#0A3D45]"
                              }
                            >
                              {item.label}
                            </span>
                          </form>
                        ) : (
                          <span
                            className={
                              item.done
                                ? "text-[#0A3D45]/45 line-through"
                                : "text-[#0A3D45]"
                            }
                          >
                            {item.done ? "✓ " : "○ "}
                            {item.label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {canChecklist ? (
                    <InlineActionForm
                      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
                      action={addChecklistItemAction}
                      submitLabel="Add item"
                    >
                      <input
                        type="hidden"
                        name="workspaceId"
                        value={workspaceId}
                      />
                      <input type="hidden" name="taskId" value={task.id} />
                      <input
                        name="label"
                        required
                        placeholder="Checklist step"
                        className="tide-input text-sm"
                      />
                    </InlineActionForm>
                  ) : null}
                  <p className="mt-2 text-[11px] text-[#0A3D45]/45">
                    Checkmarks stay local — no admin ping until you send for
                    review.
                  </p>
                </div>
              ) : null}

              {showTaskHistory ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHistoryOpen((v) => !v);
                  }}
                  className="text-xs font-semibold text-[#0A3D45]/65 underline-offset-2 hover:underline"
                >
                  {historyOpen ? "Hide history" : "History"}
                  {activities.length > 0 ? ` (${activities.length})` : ""}
                </button>
                {historyOpen ? (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-[#0A3D45]/10 bg-white/50 p-3">
                    {activities.length === 0 ? (
                      <p className="text-xs text-[#0A3D45]/55">No history yet.</p>
                    ) : (
                      <ul className="space-y-2 text-xs text-[#0A3D45]/75">
                        {activities.map((a) => (
                          <li
                            key={a.id}
                            className="border-b border-[#0A3D45]/6 pb-2 last:border-0 last:pb-0"
                          >
                            <p>{a.message}</p>
                            <p className="mt-0.5 text-[10px] text-[#0A3D45]/45">
                              {format(a.createdAt, "MMM d, yyyy · h:mm a")}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div
          className={
            expanded
              ? "flex w-full min-w-0 flex-col items-stretch gap-2"
              : "flex max-w-full shrink-0 flex-col items-end gap-2"
          }
        >
          {!expanded && canClaim ? (
            <div
              className="flex flex-wrap items-center justify-end gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <InlineActionForm
                className="flex flex-row items-center gap-2"
                action={claimTaskAction}
                submitLabel={claimLabel}
              >
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="taskId" value={task.id} />
              </InlineActionForm>
            </div>
          ) : null}

          {!expanded && assignedToOther ? (
            <p className="rounded-md bg-[#0A3D45]/6 px-2.5 py-1.5 text-[11px] font-semibold text-[#0A3D45]/70">
              Assigned — claim locked
            </p>
          ) : null}

          {expanded ? (
            <div
              className="flex w-full min-w-0 flex-col items-stretch gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {task.tags.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {task.tags.map((tt) => (
                    <TaskTagChip
                      key={tt.tagId}
                      workspaceId={workspaceId}
                      taskId={task.id}
                      tagId={tt.tagId}
                      name={tt.tag.name}
                      isPublic={tt.tag.isPublic}
                      canRemove={
                        canEdit ||
                        (!tt.tag.isPublic && task.assigneeId === userId)
                      }
                    />
                  ))}
                </div>
              ) : null}

              {canReadyForReview ? (
                <InlineActionForm
                  className="flex flex-col gap-2"
                  action={completeTaskAction}
                  submitLabel="Ready for review"
                >
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="taskId" value={task.id} />
                  <input
                    name="comment"
                    required
                    placeholder="What did you complete?"
                    className="tide-input text-sm"
                  />
                </InlineActionForm>
              ) : null}

              {canAddPrivateTag ? (
                <AddTaskTagsForm
                  workspaceId={workspaceId}
                  taskId={task.id}
                  tags={availablePrivateTags}
                  variant="private"
                />
              ) : null}

              {canEdit ? (
                <AddTaskTagsForm
                  workspaceId={workspaceId}
                  taskId={task.id}
                  tags={availablePublicTags}
                  variant="public"
                />
              ) : null}

              {canEdit &&
              task.status === "OPEN" &&
              assignableMembers.length > 0 ? (
                <InlineActionForm
                  action={assignTaskAction}
                  submitLabel={task.assigneeId ? "Update assign" : "Auto-assign"}
                  className="flex flex-col gap-2"
                >
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="taskId" value={task.id} />
                  <select
                    name="assignTo"
                    className="tide-input text-sm"
                    defaultValue={task.assigneeId ?? ""}
                  >
                    <option value="">Manual Assign (anyone)</option>
                    {assignableMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        @{m.username}
                      </option>
                    ))}
                  </select>
                </InlineActionForm>
              ) : null}

              {assignedToOther ? (
                <p className="rounded-md bg-[#0A3D45]/6 px-3 py-2 text-center text-xs font-semibold text-[#0A3D45]/70">
                  Assigned to{" "}
                  {task.assignee ? personLabel(task.assignee) : "someone"} — claim
                  locked
                </p>
              ) : null}

              {task.status === "IN_REVIEW" && canEdit ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <InlineActionForm
                    className="flex w-full flex-row items-center gap-2 sm:w-auto"
                    action={reviewTaskAction}
                    submitLabel="Approve"
                  >
                    <input
                      type="hidden"
                      name="workspaceId"
                      value={workspaceId}
                    />
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="decision" value="approve" />
                  </InlineActionForm>
                  <SendBackTaskControl
                    workspaceId={workspaceId}
                    taskId={task.id}
                  />
                </div>
              ) : null}

              {canClaim ? (
                <InlineActionForm
                  className="flex w-full flex-col gap-2"
                  action={claimTaskAction}
                  submitLabel={claimLabel}
                  submitClassName="w-full"
                >
                  <input
                    type="hidden"
                    name="workspaceId"
                    value={workspaceId}
                  />
                  <input type="hidden" name="taskId" value={task.id} />
                </InlineActionForm>
              ) : null}

              {task.assigneeId === userId &&
              (task.status === "CLAIMED" || task.status === "OPEN") ? (
                <div className="w-full">
                  <UnclaimTaskControl
                    workspaceId={workspaceId}
                    taskId={task.id}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
