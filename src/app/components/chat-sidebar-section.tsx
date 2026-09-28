"use client";

import { useEffect, useState } from "react";

/** Collapsible sidebar block for chat create flows / Roles / Invite. */
export function ChatSidebarSection({
  title,
  description,
  children,
  defaultOpen = false,
  open: openControlled,
  onOpenChange,
  blinkHeader = false,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Slow blue pulse on the header (onboarding). */
  blinkHeader?: boolean;
  id?: string;
}) {
  const [openInternal, setOpenInternal] = useState(defaultOpen);
  const controlled = openControlled !== undefined;
  const open = controlled ? openControlled : openInternal;

  useEffect(() => {
    if (controlled) return;
    setOpenInternal(defaultOpen);
  }, [controlled, defaultOpen]);

  function setOpen(next: boolean) {
    if (!controlled) setOpenInternal(next);
    onOpenChange?.(next);
  }

  return (
    <div
      id={id}
      className="border-t border-[#0A3D45]/10 pt-4 first:border-t-0 first:pt-0"
    >
      <button
        type="button"
        className={`flex w-full items-stretch gap-2 rounded-lg text-left ${
          blinkHeader
            ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
            : ""
        }`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="shrink-0 self-center font-semibold text-[#0A3D45]">
          {title}
        </span>
        <span
          className="rowgon-blink-surface min-h-7 min-w-[2rem] flex-1 self-stretch rounded-md"
          aria-hidden
        />
        <span className="shrink-0 self-center text-[#0A3D45]/60" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="mt-3">
          {description ? (
            <p className="mb-3 text-xs text-[#0A3D45]/60">{description}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
