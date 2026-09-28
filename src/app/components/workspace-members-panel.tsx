"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendFriendRequestAction } from "@/app/actions/social";
import { WorkspaceMemberMenu } from "@/app/components/workspace-member-menu";

export type WorkspaceMemberRow = {
  userId: string;
  username: string;
  label: string;
  role: string;
  customRoleIds: string[];
  customRoleNames: string[];
  isSelf: boolean;
  isFriend: boolean;
  requestPending: boolean;
};

const ROLE_ORDER = ["OWNER", "ADMIN", "EDITOR", "MEMBER"] as const;

const ROLE_TITLES: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  MEMBER: "Member",
};

function roleRank(role: string) {
  const idx = ROLE_ORDER.indexOf(role.toUpperCase() as (typeof ROLE_ORDER)[number]);
  return idx === -1 ? ROLE_ORDER.length : idx;
}

/** Everyone in the workspace can browse members and friend non-friends. */
export function WorkspaceMembersPanel({
  workspaceId,
  members,
  viewerRole,
  workspaceRoles = [],
}: {
  workspaceId: string;
  members: WorkspaceMemberRow[];
  /** Current user's role — Admin+ get per-member edit menus. */
  viewerRole: string;
  workspaceRoles?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const grouped = useMemo(() => {
    const byRole = new Map<string, WorkspaceMemberRow[]>();
    for (const member of members) {
      const key = member.role.toUpperCase();
      const list = byRole.get(key) ?? [];
      list.push(member);
      byRole.set(key, list);
    }
    for (const list of byRole.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    const roles = [...byRole.keys()].sort((a, b) => roleRank(a) - roleRank(b));
    return roles.map((role) => ({
      role,
      title: ROLE_TITLES[role] ?? role.charAt(0) + role.slice(1).toLowerCase(),
      members: byRole.get(role)!,
    }));
  }, [members]);

  function addFriend(username: string, userId: string) {
    setError(null);
    setPendingId(userId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("username", username);
      const result = await sendFriendRequestAction(null, fd);
      setPendingId(null);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rowgon-panel p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[#0A3D45]">
          Members ({members.length})
        </h2>
        <span className="text-[#0A3D45]/60" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="mt-3 max-h-72 space-y-4 overflow-y-auto">
          {grouped.map((group) => (
            <section key={group.role}>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#0A3D45]/55">
                {group.title}
              </h3>
              <ul className="mt-1.5 space-y-1.5">
                {group.members.map((member) => (
                  <li
                    key={member.userId}
                    className="flex items-center justify-between gap-2 text-sm text-[#0A3D45]"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {member.label}
                      {member.isSelf ? (
                        <span className="ml-1 text-xs font-normal text-[#0A3D45]/55">
                          · you
                        </span>
                      ) : null}
                      {member.customRoleNames.length > 0 ? (
                        <span className="ml-1 block truncate text-[11px] font-normal text-[#0A3D45]/50">
                          {member.customRoleNames.join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {!member.isSelf && !member.isFriend ? (
                        <button
                          type="button"
                          disabled={pending || member.requestPending}
                          className="text-xs font-semibold text-[#0A3D45] underline-offset-2 hover:underline disabled:opacity-50"
                          onClick={() => addFriend(member.username, member.userId)}
                        >
                          {member.requestPending
                            ? "Pending"
                            : pendingId === member.userId
                              ? "Sending…"
                              : "Add friend"}
                        </button>
                      ) : null}
                      {!member.isSelf ? (
                        <WorkspaceMemberMenu
                          workspaceId={workspaceId}
                          memberUserId={member.userId}
                          memberLabel={member.label}
                          memberRole={member.role}
                          viewerRole={viewerRole}
                          workspaceRoles={workspaceRoles}
                          memberCustomRoleIds={member.customRoleIds}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-[#9b2f22]">{error}</p> : null}
    </div>
  );
}
