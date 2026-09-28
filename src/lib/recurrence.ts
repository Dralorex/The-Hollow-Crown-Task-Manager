import { addDays, addMonths, setDate, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { recordTaskActivity } from "@/lib/task-activity";
import { syncCalendarForTask } from "@/lib/calendar";
import type { Task } from "@/generated/prisma/client";

export type RecurrenceCadence = "daily" | "weekly" | "monthly";
export type SpawnMode = "complete" | "due" | "both";
export type NextAssigneeMode = "same" | "pool" | "clear";

function parseCsvInts(raw: string | null | undefined) {
  if (!raw) return [] as number[];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export function nextDueDate(
  from: Date,
  cadence: RecurrenceCadence,
  weekDays: number[],
  monthDays: number[],
): Date {
  const base = startOfDay(from);

  if (cadence === "daily") {
    return addDays(base, 1);
  }

  if (cadence === "weekly") {
    const days = weekDays.length ? [...weekDays].sort((a, b) => a - b) : [base.getDay()];
    for (let i = 1; i <= 14; i++) {
      const candidate = addDays(base, i);
      if (days.includes(candidate.getDay())) return candidate;
    }
    return addDays(base, 7);
  }

  // monthly
  const days = monthDays.length
    ? [...monthDays].sort((a, b) => a - b)
    : [base.getDate()];
  for (let monthOffset = 0; monthOffset <= 14; monthOffset++) {
    const monthStart = addMonths(new Date(base.getFullYear(), base.getMonth(), 1), monthOffset);
    for (const day of days) {
      const lastDay = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0,
      ).getDate();
      const clamped = Math.min(day, lastDay);
      const candidate = setDate(monthStart, clamped);
      if (candidate > base) return startOfDay(candidate);
    }
  }
  return addMonths(base, 1);
}

function resolveNextAssignee(
  task: Task,
  mode: NextAssigneeMode,
): string | null {
  if (mode === "same") return task.assigneeId;
  if (mode === "clear" || mode === "pool") return null;
  return null;
}

export async function spawnNextRecurringTask(
  taskId: string,
  reason: "complete" | "due",
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task?.recurrenceCadence || !task.recurrenceSpawnMode) return null;

  const mode = task.recurrenceSpawnMode as SpawnMode;
  if (mode !== "both" && mode !== reason) return null;

  const cadence = task.recurrenceCadence as RecurrenceCadence;
  const weekDays = parseCsvInts(task.recurrenceWeekDays);
  const monthDays = parseCsvInts(task.recurrenceMonthDays);
  const nextAssigneeMode = (task.recurrenceNextAssignee ??
    "pool") as NextAssigneeMode;

  const from = task.dueDate ?? new Date();
  const dueDate = nextDueDate(from, cadence, weekDays, monthDays);
  const seriesId = task.recurrenceSeriesId ?? task.id;

  const existing = await prisma.task.findFirst({
    where: {
      recurrenceSeriesId: seriesId,
      dueDate,
      status: { not: "DONE" },
    },
  });
  if (existing) return existing;

  const assigneeId = resolveNextAssignee(task, nextAssigneeMode);

  const next = await prisma.task.create({
    data: {
      workspaceId: task.workspaceId,
      folderId: task.folderId,
      name: task.name,
      description: task.description,
      priority: task.priority,
      dueDate,
      status: "OPEN",
      assigneeId,
      createdById: task.createdById,
      recurrenceCadence: task.recurrenceCadence,
      recurrenceWeekDays: task.recurrenceWeekDays,
      recurrenceMonthDays: task.recurrenceMonthDays,
      recurrenceSpawnMode: task.recurrenceSpawnMode,
      recurrenceNextAssignee: task.recurrenceNextAssignee,
      recurrenceSeriesId: seriesId,
    },
  });

  await recordTaskActivity({
    taskId: next.id,
    actorId: null,
    type: "recurrence_spawned",
    message: `Next occurrence created (${reason})`,
  });

  if (assigneeId) {
    await syncCalendarForTask(next.id);
  }

  return next;
}

/** Create due-rollover instances for a workspace (idempotent). */
export async function syncDueRecurrences(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { archivedAt: true },
  });
  if (!workspace || workspace.archivedAt) return;

  const now = new Date();
  const dueTasks = await prisma.task.findMany({
    where: {
      workspaceId,
      recurrenceCadence: { not: null },
      recurrenceSpawnMode: { in: ["due", "both"] },
      dueDate: { lt: now },
      status: { in: ["OPEN", "CLAIMED", "IN_REVIEW"] },
      folder: { archivedAt: null },
    },
  });

  for (const task of dueTasks) {
    await spawnNextRecurringTask(task.id, "due");
  }
}
