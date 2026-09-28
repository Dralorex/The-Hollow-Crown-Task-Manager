"use client";

import { useEffect, useMemo, useState } from "react";
import type { UrgencyChipPrefs } from "@/app/components/task-ui";
import type { TaskPriority } from "@/generated/prisma/client";
import {
  compareTasksBySortMode,
  type TaskSortMode,
} from "@/lib/urgency";

type SortableTask = {
  priority: TaskPriority;
  dueDate: Date | null;
  createdAt: Date;
};

const SORT_OPTIONS: {
  id: TaskSortMode;
  label: string;
  chip: keyof UrgencyChipPrefs;
}[] = [
  { id: "total", label: "Total", chip: "showTotal" },
  { id: "base", label: "Base", chip: "showBase" },
  { id: "due", label: "Due date", chip: "showDate" },
];

function availableSortModes(prefs?: UrgencyChipPrefs): TaskSortMode[] {
  const modes = SORT_OPTIONS.filter((opt) => Boolean(prefs?.[opt.chip])).map(
    (opt) => opt.id,
  );
  // Always keep at least Total so the list stays ordered when all chips are off.
  return modes.length > 0 ? modes : ["total"];
}

export function useChipAwareTaskSort<T extends SortableTask>(
  tasks: T[],
  prefs?: UrgencyChipPrefs,
) {
  const modes = useMemo(
    () => availableSortModes(prefs),
    [prefs?.showBase, prefs?.showDate, prefs?.showTotal],
  );
  const [sortMode, setSortMode] = useState<TaskSortMode>(modes[0] ?? "total");

  useEffect(() => {
    if (!modes.includes(sortMode)) {
      setSortMode(modes[0] ?? "total");
    }
  }, [modes, sortMode]);

  const sorted = useMemo(() => {
    const now = new Date();
    return [...tasks].sort((a, b) =>
      compareTasksBySortMode(sortMode, a, b, now),
    );
  }, [tasks, sortMode]);

  return { sortMode, setSortMode, modes, sorted };
}

export function TaskSortControls({
  modes,
  sortMode,
  onChange,
}: {
  modes: TaskSortMode[];
  sortMode: TaskSortMode;
  onChange: (mode: TaskSortMode) => void;
}) {
  if (modes.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/50">
        Sort by
      </span>
      <div className="flex flex-wrap gap-1.5">
        {SORT_OPTIONS.filter((opt) => modes.includes(opt.id)).map((opt) => {
          const active = sortMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                active
                  ? "bg-[#0A3D45] text-[#e8f7f6]"
                  : "bg-[#0A3D45]/8 text-[#0A3D45]/75 hover:bg-[#0A3D45]/12"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
