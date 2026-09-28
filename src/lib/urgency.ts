import type { TaskPriority } from "@/generated/prisma/client";

/**
 * Urgency on a 0–100 scale:
 * - Base: manual priority (10–80, eight levels × 10)
 * - Date: due pressure (0–90) via cubic ease-in toward the due date
 * - Total: clamp(Base + Date, 100) — near deadlines, Date can force Critical
 *   even from Minimal base (~2 days out).
 */

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  CRITICAL: 80,
  URGENT: 70,
  HIGH: 60,
  ELEVATED: 50,
  MEDIUM: 40,
  NORMAL: 30,
  LOW: 20,
  MINIMAL: 10,
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  CRITICAL: "Critical",
  URGENT: "Urgent",
  HIGH: "High",
  ELEVATED: "Elevated",
  MEDIUM: "Medium",
  NORMAL: "Normal",
  LOW: "Low",
  MINIMAL: "Minimal",
};

export const TASK_PRIORITIES = Object.keys(PRIORITY_WEIGHT) as TaskPriority[];

/** Max Date contribution on the /100 scale. */
export const DATE_MAX = 90;
/** Days ahead where Date pressure starts rising from ~0. */
export const DATE_HORIZON_DAYS = 28;

export function isTaskPriority(value: string): value is TaskPriority {
  return value in PRIORITY_WEIGHT;
}

export function priorityBase(priority: TaskPriority): number {
  return PRIORITY_WEIGHT[priority];
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days until due (negative = overdue). Null when no due date. */
export function daysUntilDue(
  dueDate: Date | null | undefined,
  now = new Date(),
): number | null {
  if (!dueDate) return null;
  const startOfToday = startOfLocalDay(now);
  const dueDay = startOfLocalDay(dueDate);
  return Math.floor((dueDay.getTime() - startOfToday.getTime()) / 86_400_000);
}

/**
 * Date pressure 0–90.
 * Upcoming: cubic ease-in over DATE_HORIZON_DAYS (flat far out, steep near due).
 * Overdue: sits at the top of the curve (~83–90).
 */
export function duePressure(dueDate: Date | null | undefined, now = new Date()): number {
  const d = daysUntilDue(dueDate, now);
  if (d === null) return 0;

  if (d >= 0) {
    const t = Math.min(1, Math.max(0, 1 - d / DATE_HORIZON_DAYS));
    return Math.round(DATE_MAX * t * t * t);
  }

  const over = Math.min(1, -d / 14);
  return Math.round(DATE_MAX * (0.92 + 0.08 * over));
}

export type DateBand = "none" | "distant" | "approaching" | "soon" | "due" | "overdue";

export function dateBand(dateScore: number): DateBand {
  if (dateScore <= 0) return "none";
  if (dateScore <= 15) return "distant";
  if (dateScore <= 35) return "approaching";
  if (dateScore <= 55) return "soon";
  if (dateScore <= 75) return "due";
  return "overdue";
}

export function dateBandLabel(band: DateBand): string {
  switch (band) {
    case "none":
      return "None";
    case "distant":
      return "Distant";
    case "approaching":
      return "Approaching";
    case "soon":
      return "Soon";
    case "due":
      return "Due";
    default:
      return "Overdue";
  }
}

export function urgencyParts(
  priority: TaskPriority,
  dueDate: Date | null | undefined,
  now = new Date(),
) {
  const base = priorityBase(priority);
  const date = duePressure(dueDate, now);
  const total = Math.min(100, base + date);
  return { base, date, total };
}

export function urgencyScore(
  priority: TaskPriority,
  dueDate: Date | null | undefined,
  now = new Date(),
): number {
  return urgencyParts(priority, dueDate, now).total;
}

export type UrgencyLevel = "critical" | "high" | "medium" | "low" | "calm";

/** Map Total /100 onto visual urgency bands. */
export function urgencyLevel(score: number): UrgencyLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "calm";
}

export const URGENCY_EDGE: Record<UrgencyLevel, string> = {
  critical: "#E85D4C",
  high: "#F0A202",
  medium: "#3DBEAB",
  low: "#4A90A4",
  calm: "#9BB5BC",
};

export function urgencyLabel(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "Rising hard";
    case "high":
      return "Coming in fast";
    case "medium":
      return "On the tide";
    case "low":
      return "Gentle swell";
    default:
      return "Calm waters";
  }
}

/** Short Total-chip label. */
export function urgencyTag(level: UrgencyLevel): string {
  switch (level) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "Calm";
  }
}

export function formatBaseHover(base: number): string {
  return `Priority level: ${base}/100`;
}

export function formatDateHover(date: number): string {
  return `Date pressure: ${date}/100`;
}

export function formatTotalHover(total: number): string {
  return `Total urgency: ${total}/100`;
}

/** Notify when Date pressure reaches “Soon” (~7 days on the curve). */
export const DEADLINE_NOTIFY_DATE_MIN = 38;

export function compareTasksByUrgency<
  T extends { priority: TaskPriority; dueDate: Date | null; createdAt: Date },
>(a: T, b: T, now = new Date()): number {
  const scoreDiff = urgencyScore(b.priority, b.dueDate, now) - urgencyScore(a.priority, a.dueDate, now);
  if (scoreDiff !== 0) return scoreDiff;
  if (a.dueDate && b.dueDate) {
    const dueDiff = a.dueDate.getTime() - b.dueDate.getTime();
    if (dueDiff !== 0) return dueDiff;
  } else if (a.dueDate) return -1;
  else if (b.dueDate) return 1;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export type TaskSortMode = "total" | "base" | "due";

export function compareTasksByBase<
  T extends { priority: TaskPriority; dueDate: Date | null; createdAt: Date },
>(a: T, b: T): number {
  const baseDiff = priorityBase(b.priority) - priorityBase(a.priority);
  if (baseDiff !== 0) return baseDiff;
  return compareTasksByUrgency(a, b);
}

/** Soonest due first; tasks with no due date sink. */
export function compareTasksByDueDate<
  T extends { priority: TaskPriority; dueDate: Date | null; createdAt: Date },
>(a: T, b: T): number {
  if (a.dueDate && b.dueDate) {
    const dueDiff = a.dueDate.getTime() - b.dueDate.getTime();
    if (dueDiff !== 0) return dueDiff;
  } else if (a.dueDate) return -1;
  else if (b.dueDate) return 1;
  return compareTasksByUrgency(a, b);
}

export function compareTasksBySortMode<
  T extends { priority: TaskPriority; dueDate: Date | null; createdAt: Date },
>(mode: TaskSortMode, a: T, b: T, now = new Date()): number {
  switch (mode) {
    case "base":
      return compareTasksByBase(a, b);
    case "due":
      return compareTasksByDueDate(a, b);
    default:
      return compareTasksByUrgency(a, b, now);
  }
}
