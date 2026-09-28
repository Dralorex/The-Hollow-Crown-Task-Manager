"use client";

import { useEffect, useState } from "react";
import {
  PRIORITY_LABELS,
  URGENCY_EDGE,
  dateBand,
  dateBandLabel,
  formatBaseHover,
  formatDateHover,
  formatTotalHover,
  priorityBase,
  urgencyLabel,
  urgencyLevel,
  urgencyParts,
  urgencyScore,
  urgencyTag,
  type UrgencyLevel,
} from "@/lib/urgency";
import type { TaskPriority } from "@/generated/prisma/client";

export type UrgencyChipPrefs = {
  showBase?: boolean;
  showDate?: boolean;
  showTotal?: boolean;
};

export function TaskUrgencyEdge({
  priority,
  dueDate,
}: {
  priority: TaskPriority;
  dueDate: Date | null;
}) {
  const score = urgencyScore(priority, dueDate);
  const level = urgencyLevel(score);
  return (
    <span
      className="absolute inset-y-0 left-0 w-[4px] rounded-l-md"
      style={{ backgroundColor: URGENCY_EDGE[level] }}
      title={`${urgencyLabel(level)} · ${formatTotalHover(score)}`}
      aria-hidden
    />
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className="urgency-chip urgency-chip-neutral rounded-md px-2 py-0.5 text-xs font-medium"
      title={formatBaseHover(priorityBase(priority))}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const TAG_STYLES: Record<UrgencyLevel, string> = {
  critical: "urgency-chip-critical",
  high: "urgency-chip-high",
  medium: "urgency-chip-medium",
  low: "urgency-chip-low",
  calm: "urgency-chip-calm",
};

const CHIP_BASE =
  "urgency-chip rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

/** Live urgency chip — recomputes as time passes. */
export function UrgencyTag({
  priority,
  dueDate,
}: {
  priority: TaskPriority;
  dueDate: Date | null;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const score = urgencyScore(priority, dueDate, now);
  const level = urgencyLevel(score);
  return (
    <span
      className={`${CHIP_BASE} ${TAG_STYLES[level]}`}
      title={formatTotalHover(score)}
    >
      {urgencyTag(level)}
    </span>
  );
}

/**
 * Base / Date / Total chips — level names on the face, /100 scores on hover only.
 */
export function UrgencyChips({
  priority,
  dueDate,
  prefs,
}: {
  priority: TaskPriority;
  dueDate: Date | null;
  prefs?: UrgencyChipPrefs;
}) {
  const showBase = prefs?.showBase ?? false;
  const showDate = prefs?.showDate ?? false;
  const showTotal = prefs?.showTotal ?? true;

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!showBase && !showDate && !showTotal) return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [showBase, showDate, showTotal]);

  if (!showBase && !showDate && !showTotal) return null;

  const { base, date, total } = urgencyParts(priority, dueDate, now);
  const level = urgencyLevel(total);
  const dateLabel = dateBandLabel(dateBand(date));

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showBase ? (
        <span
          className={`${CHIP_BASE} urgency-chip-neutral`}
          title={formatBaseHover(base)}
        >
          Base: {PRIORITY_LABELS[priority]}
        </span>
      ) : null}
      {showDate ? (
        <span
          className={`${CHIP_BASE} urgency-chip-neutral`}
          title={formatDateHover(date)}
        >
          Date: {dateLabel}
        </span>
      ) : null}
      {showTotal ? (
        <span
          className={`${CHIP_BASE} ${TAG_STYLES[level]}`}
          title={formatTotalHover(total)}
        >
          Total: {urgencyTag(level)}
        </span>
      ) : null}
    </span>
  );
}
