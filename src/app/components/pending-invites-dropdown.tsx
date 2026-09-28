"use client";

import { useMemo, useState } from "react";

/** Collapses a long pending-invite list into a dropdown. */
export function PendingInvitesDropdown({
  invites,
}: {
  invites: { id: string; label: string; role: string; token: string }[];
}) {
  const [open, setOpen] = useState(false);
  const count = invites.length;
  const summary = useMemo(() => {
    if (count === 0) return "No pending invites";
    if (count === 1) return `1 pending invite`;
    return `${count} pending invites`;
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-[color:var(--panel-border)] bg-[color:var(--menu-bg)] px-2.5 py-2 text-left text-sm text-[color:var(--rowgon-deep)]"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">{summary}</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-[color:var(--panel-border)] bg-[color:var(--menu-bg)] p-2 text-xs text-[color:var(--rowgon-deep)]/70">
          {invites.map((inv) => (
            <li key={inv.id} className="border-b border-[color:var(--rowgon-deep)]/8 pb-2 last:border-b-0 last:pb-0">
              <p className="font-medium text-[color:var(--rowgon-deep)]">
                {inv.label}{" "}
                <span className="font-normal text-[color:var(--rowgon-deep)]/55">({inv.role})</span>
              </p>
              <p className="mt-0.5 break-all text-[11px] text-[color:var(--rowgon-deep)]/50">
                /invite/{inv.token}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
