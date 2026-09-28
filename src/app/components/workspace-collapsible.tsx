"use client";

import { useState } from "react";

/**
 * Workspace main-panel collapsible: whole header is clickable
 * (title, empty space, and arrow). Optional blue blink on the
 * empty stretch teaches first-time open behavior.
 */
export function WorkspaceCollapsible({
  id,
  title,
  description,
  children,
  defaultOpen = false,
  blinkEmpty = false,
  className = "",
  open: openControlled,
  onOpenChange,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Slow blue pulse on the header’s empty space (onboarding). */
  blinkEmpty?: boolean;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openInternal, setOpenInternal] = useState(defaultOpen);
  const controlled = openControlled !== undefined;
  const open = controlled ? openControlled : openInternal;

  function setOpen(next: boolean) {
    if (!controlled) setOpenInternal(next);
    onOpenChange?.(next);
  }

  return (
    <div id={id} className={`rowgon-panel overflow-hidden ${className}`.trim()}>
      <button
        type="button"
        className="flex w-full items-stretch gap-2 px-5 py-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="shrink-0 self-center font-[family-name:var(--font-display)] text-xl text-[#0A3D45]">
          {title}
        </span>
        {/* Clickable empty stretch — onboarding can blink this */}
        <span
          className={`rowgon-blink-surface min-h-8 min-w-[2.5rem] flex-1 self-stretch rounded-lg ${
            blinkEmpty ? "animate-rowgon-blink-empty" : ""
          }`}
          aria-hidden
        />
        <span
          className="shrink-0 self-center text-sm text-[#0A3D45]/55"
          aria-hidden
        >
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-[#0A3D45]/10 px-5 pb-5 pt-4">
          {description ? (
            <p className="mb-4 text-sm text-[#0A3D45]/60">{description}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
