"use client";

import { useEffect, useRef, useState } from "react";

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Due date field with empty placeholder, Reset/Clear, and native picker popup. */
export function DueDateField({
  name,
  className,
  defaultValue = "",
  blink = false,
  blinkReset = false,
  blinkClear = false,
  onFieldActivate,
  onValueChange,
  onReset,
  onClear,
}: {
  name: string;
  className?: string;
  defaultValue?: string;
  blink?: boolean;
  blinkReset?: boolean;
  blinkClear?: boolean;
  onFieldActivate?: () => void;
  /** Fires when the user picks/clears a date (not merely on focus). */
  onValueChange?: (value: string) => void;
  onReset?: () => void;
  onClear?: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const showPlaceholder = !value && !focused;

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  function openPicker() {
    onFieldActivate?.();
    const el = ref.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      // showPicker can throw if not triggered by a user gesture in some browsers
    }
  }

  return (
    <div className={`min-w-0 space-y-1.5 ${className ?? ""}`}>
      <div
        className={`relative min-w-0 max-w-full overflow-hidden rounded-[0.85rem] ${
          blink
            ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
            : ""
        }`}
        onClick={(e) => {
          if (e.target === ref.current) return;
          openPicker();
        }}
      >
        {showPlaceholder ? (
          <span
            className="pointer-events-none absolute inset-0 z-[1] flex items-center px-[0.75rem] text-[color-mix(in_srgb,var(--rowgon-ink)_45%,transparent)]"
            aria-hidden
          >
            Due Date
          </span>
        ) : null}
        <input
          ref={ref}
          type="date"
          name={name}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            onValueChange?.(next);
          }}
          onFocus={() => {
            setFocused(true);
            onFieldActivate?.();
          }}
          onBlur={() => setFocused(false)}
          onClick={(e) => {
            e.stopPropagation();
            openPicker();
          }}
          aria-label="Due Date"
          className={`rowgon-input rowgon-input-date max-w-full min-w-0 ${
            showPlaceholder
              ? "text-transparent [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-datetime-edit]:text-transparent [&::-webkit-datetime-edit]:max-w-full"
              : "[&::-webkit-calendar-picker-indicator]:cursor-pointer"
          }`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-onboarding="due-reset"
          className={`rounded-full border border-[#0A3D45]/15 bg-white/70 px-2.5 py-1 text-xs font-semibold text-[#0A3D45]/75 hover:bg-white ${
            blinkReset
              ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
              : ""
          }`}
          onClick={() => {
            const next = todayIso();
            setValue(next);
            onValueChange?.(next);
            onReset?.();
          }}
        >
          Reset
        </button>
        <button
          type="button"
          data-onboarding="due-clear"
          className={`rounded-full border border-[#0A3D45]/15 bg-white/70 px-2.5 py-1 text-xs font-semibold text-[#0A3D45]/75 hover:bg-white ${
            blinkClear
              ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
              : ""
          }`}
          onClick={() => {
            setValue("");
            onValueChange?.("");
            onClear?.();
          }}
        >
          Clear
        </button>
        <span className="text-[11px] text-[#0A3D45]/50">(optional)</span>
      </div>
    </div>
  );
}
