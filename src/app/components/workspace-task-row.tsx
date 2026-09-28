"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
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
  removeTaskTagAction,
  claimTaskAction,
  completeTaskAction,
  deleteTaskAction,
  forceUnclaimTaskAction,
  reviewTaskAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import { personLabel } from "@/lib/utils";
import { confirmDelete } from "@/lib/confirm";
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
  assignee: Person | null;
  lastUnclaimedBy: Person | null;
  lastSentBackBy: Person | null;
  folder: { id: string; name: string } | null;
  tags: TagLink[];
};

function dueInputValue(due: Date | null) {
  if (!due) return "";
  return format(due, "yyyy-MM-dd");
}

function TaskEditorMenu({
  workspaceId,
  task,
  highlightMenu = false,
}: {
  workspaceId: string;
  task: WorkspaceTaskData;
  /** Blink the ⋮ during onboarding until the user opens it. */
  highlightMenu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "edit" | "forceUnclaim">("menu");
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(dueInputValue(task.dueDate));
  const [reason, setReason] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { active, step, completeOnboarding } = useWorkspaceOnboarding();

  useEffect(() => {
    setName(task.name);
    setDescription(task.description);
    setPriority(task.priority);
    setDueDate(dueInputValue(task.dueDate));
  }, [task.name, task.description, task.priority, task.dueDate]);

  function close() {
    setOpen(false);
    setPanel("menu");
    setError(null);
    setReason("");
    setWorkNote("");
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
}: {
  workspaceId: string;
  task: WorkspaceTaskData;
  userId: string;
  canEdit: boolean;
  isRoot: boolean;
  publicTagOptions?: string[];
  privateTagOptions?: string[];
  urgencyChips?: UrgencyChipPrefs;
}) {
  const isClaimed = Boolean(task.assigneeId);
  const canClaim =
    task.status === "OPEN" || (task.status === "CLAIMED" && !task.assigneeId);
  const canReadyForReview =
    task.assigneeId === userId &&
    (task.status === "CLAIMED" || task.status === "OPEN");
  const canAddPrivateTag = task.assigneeId === userId;
  const [expanded, setExpanded] = useState(false);
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
        expanded ? "" : "cursor-pointer"
      }`}
      onClick={expandFromEmptySpace}
    >
      <TaskUrgencyEdge priority={task.priority} dueDate={task.dueDate} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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
            <h3 className="text-lg font-semibold text-[#0A3D45]">{task.name}</h3>
            <UrgencyChips
              priority={task.priority}
              dueDate={task.dueDate}
              prefs={urgencyChips}
            />
            {!expanded ? (
              <span className="text-xs text-[#0A3D45]/60">
                {isClaimed
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
                />
              </span>
            ) : null}
          </div>

          {expanded ? (
            <>
              {isRoot && task.folder ? (
                <p className="mt-2 text-xs text-[#0A3D45]/55">
                  In{" "}
                  <Link
                    href={`/app/w/${workspaceId}?folder=${task.folderId}`}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {task.folder.name}
                  </Link>
                </p>
              ) : null}
              {task.description ? (
                <p className="mt-1 text-sm text-[#0A3D45]/70">{task.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-[#0A3D45]/55">
                {task.dueDate
                  ? `Due ${format(task.dueDate, "MMM d, yyyy")}`
                  : "No due date"}
                {task.assignee
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
            </>
          ) : null}
        </div>

        <div className="flex max-w-full shrink-0 flex-col items-end gap-2">
          {!expanded && canClaim ? (
            <div
              className="flex flex-wrap items-center justify-end gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <InlineActionForm
                className="flex flex-row items-center gap-2"
                action={claimTaskAction}
                submitLabel="Claim Task"
              >
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="taskId" value={task.id} />
              </InlineActionForm>
            </div>
          ) : null}

          {expanded ? (
            <div
              className="flex w-full max-w-xs flex-col items-stretch gap-2 sm:w-72"
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

              {task.status === "IN_REVIEW" && canEdit ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <InlineActionForm
                    className="flex flex-row items-center gap-2"
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
                <div className="flex justify-end">
                  <InlineActionForm
                    className="flex flex-row items-center gap-2"
                    action={claimTaskAction}
                    submitLabel="Claim Task"
                  >
                    <input
                      type="hidden"
                      name="workspaceId"
                      value={workspaceId}
                    />
                    <input type="hidden" name="taskId" value={task.id} />
                  </InlineActionForm>
                </div>
              ) : null}

              {task.assigneeId === userId &&
              (task.status === "CLAIMED" || task.status === "OPEN") ? (
                <div className="flex justify-end">
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
