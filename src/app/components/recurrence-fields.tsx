"use client";

import { useMemo, useState } from "react";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function RecurrenceFields() {
  const [cadence, setCadence] = useState<"" | "daily" | "weekly" | "monthly">("");
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [monthDays, setMonthDays] = useState<number[]>([]);

  const monthGrid = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  function toggleWeek(day: number) {
    setWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  function toggleMonth(day: number) {
    setMonthDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  return (
    <div className="sm:col-span-2 space-y-3 rounded-xl border border-[#0A3D45]/10 bg-white/40 p-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["", "One-off"],
            ["daily", "Daily"],
            ["weekly", "Weekly"],
            ["monthly", "Monthly"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setCadence(value);
              if (value === "daily") setWeekDays([0, 1, 2, 3, 4, 5, 6]);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              cadence === value
                ? "bg-[#0A3D45] text-[#E8F7F6]"
                : "bg-white/70 text-[#0A3D45]/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="recurrenceCadence" value={cadence} />
      <input type="hidden" name="recurrenceWeekDays" value={weekDays.join(",")} />
      <input type="hidden" name="recurrenceMonthDays" value={monthDays.join(",")} />

      {cadence === "weekly" ? (
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
              onClick={() => setWeekDays([0, 1, 2, 3, 4, 5, 6])}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
              onClick={() => setWeekDays([])}
            >
              Remove all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = weekDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeek(d.value)}
                  className={`min-h-10 min-w-10 rounded-lg px-2 text-sm font-semibold ${
                    on
                      ? "bg-[#3DBEAB] text-[#0A3D45]"
                      : "bg-white/70 text-[#0A3D45]/65"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {cadence === "monthly" ? (
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
              onClick={() => setMonthDays(monthGrid)}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
              onClick={() => setMonthDays([])}
            >
              Remove all
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGrid.map((day) => {
              const on = monthDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleMonth(day)}
                  className={`flex h-9 items-center justify-center rounded-md text-sm font-semibold ${
                    on
                      ? "bg-[#3DBEAB] text-[#0A3D45]"
                      : "bg-white/70 text-[#0A3D45]/65"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {cadence ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#0A3D45]/70">
            Spawn next
            <select
              name="recurrenceSpawnMode"
              defaultValue="complete"
              className="rowgon-input mt-1 min-h-11 text-sm"
            >
              <option value="complete">On complete (approve)</option>
              <option value="due">On due rollover</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#0A3D45]/70">
            Next assignee
            <select
              name="recurrenceNextAssignee"
              defaultValue="pool"
              className="rowgon-input mt-1 min-h-11 text-sm"
            >
              <option value="pool">Manual Assign</option>
              <option value="same">Same person</option>
              <option value="clear">Cleared (no assignee)</option>
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
