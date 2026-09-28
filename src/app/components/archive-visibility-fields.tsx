"use client";

import { useState } from "react";
import type { Role } from "@/generated/prisma/client";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "EDITOR", label: "Editor" },
  { value: "MEMBER", label: "Member" },
];

export function ArchiveVisibilityFields({
  members,
}: {
  members: { id: string; username: string }[];
}) {
  const [mode, setMode] = useState<"all" | "roles" | "members">("all");
  const [roles, setRoles] = useState<Role[]>(["OWNER", "ADMIN"]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  function toggleRole(role: Role) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function toggleMember(id: string) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#0A3D45]/10 bg-white/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/55">
        Who can still see this
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Everyone"],
            ["roles", "By role"],
            ["members", "Specific people"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              mode === value
                ? "bg-[#0A3D45] text-[#E8F7F6]"
                : "bg-white/70 text-[#0A3D45]/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="archiveVisibility" value={mode} />
      <input type="hidden" name="archiveVisibilityRoles" value={roles.join(",")} />
      <input
        type="hidden"
        name="archiveVisibilityUserIds"
        value={memberIds.join(",")}
      />

      {mode === "roles" ? (
        <div className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => toggleRole(r.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                roles.includes(r.value)
                  ? "bg-[#1a7a82] text-white"
                  : "bg-white/70 text-[#0A3D45]/65"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "members" ? (
        <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
          {members.map((m) => (
            <li key={m.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/50">
                <input
                  type="checkbox"
                  checked={memberIds.includes(m.id)}
                  onChange={() => toggleMember(m.id)}
                  className="accent-[#0A3D45]"
                />
                <span className="text-[#0A3D45]">@{m.username}</span>
              </label>
            </li>
          ))}
          {members.length === 0 ? (
            <li className="px-2 text-xs text-[#0A3D45]/55">No members yet.</li>
          ) : null}
        </ul>
      ) : null}

      <p className="text-xs text-[#0A3D45]/55">
        Admins and owners always keep access so they can restore. History stays —
        nothing is permanently deleted.
      </p>
    </div>
  );
}
