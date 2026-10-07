"use client";

import { useChatPresence } from "@/app/components/chat-presence";

export type PresenceMemberInfo = {
  userId: string;
  username: string;
  label: string;
  /** Workspace role key or display label (OWNER / Admin / …). Friend GCs omit. */
  roleKey?: string | null;
  roleLabel?: string | null;
};

const ROLE_ORDER = ["OWNER", "ADMIN", "EDITOR", "MEMBER"] as const;

function roleSectionTitle(role: (typeof ROLE_ORDER)[number]) {
  switch (role) {
    case "OWNER":
      return "Owners";
    case "ADMIN":
      return "Admins";
    case "EDITOR":
      return "Editors";
    case "MEMBER":
      return "Members";
  }
}

function roleSingularLabel(roleKey: string | undefined) {
  switch (roleKey) {
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
    case "EDITOR":
      return "Editor";
    case "MEMBER":
      return "Member";
    default:
      return roleKey || null;
  }
}

function normalizeRoleKey(role: string | null | undefined): string {
  if (!role) return "MEMBER";
  const raw = role.trim().toUpperCase();
  if ((ROLE_ORDER as readonly string[]).includes(raw)) return raw;
  if (raw.startsWith("OWNER")) return "OWNER";
  if (raw.startsWith("ADMIN")) return "ADMIN";
  if (raw.startsWith("EDITOR")) return "EDITOR";
  if (raw.startsWith("MEMBER")) return "MEMBER";
  return raw;
}

/**
 * Right-side members / online bubble for group chats.
 * Workspace GC: online grouped by role; offline flat with role under name.
 * Friend GC: online only (flat).
 */
export function ChatPresencePanel({
  groupId,
  members,
  mode,
}: {
  groupId: string;
  members: PresenceMemberInfo[];
  mode: "workspace" | "friends";
}) {
  const presence = useChatPresence(
    groupId,
    members.map((m) => ({ userId: m.userId, username: m.username })),
  );
  const byId = new Map(presence.map((p) => [p.userId, p]));

  const enriched = members.map((m) => {
    const live = byId.get(m.userId);
    const roleKey = normalizeRoleKey(m.roleKey ?? m.roleLabel);
    return {
      ...m,
      roleKey,
      online: Boolean(live?.online),
      typing: Boolean(live?.typing),
    };
  });

  const online = enriched
    .filter((m) => m.online)
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  const offline = enriched
    .filter((m) => !m.online)
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );

  return (
    <aside
      className="tide-panel flex max-h-64 w-full flex-col self-start overflow-hidden lg:h-[min(36rem,calc(100dvh-6rem))] lg:max-h-none lg:min-h-[28rem]"
      aria-label="Chat members"
    >
      <div className="shrink-0 border-b border-[#0A3D45]/10 px-3.5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0A3D45]/45">
          Members
        </p>
        <p className="mt-0.5 text-xs text-[#0A3D45]/55">
          {online.length} online
          {mode === "workspace" && offline.length > 0
            ? ` · ${offline.length} offline`
            : null}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2.5 py-2.5">
        {mode === "workspace" ? (
          <>
            {ROLE_ORDER.map((role) => {
              const list = online.filter((m) => m.roleKey === role);
              if (list.length === 0) return null;
              return (
                <PresenceSection
                  key={role}
                  title={roleSectionTitle(role)}
                  members={list}
                  showRoleUnderName={false}
                />
              );
            })}
            {(() => {
              const known = new Set<string>(ROLE_ORDER);
              const custom = online.filter((m) => !known.has(m.roleKey));
              if (custom.length === 0) return null;
              return (
                <PresenceSection
                  title="Other"
                  members={custom}
                  showRoleUnderName
                />
              );
            })()}
            {offline.length > 0 ? (
              <PresenceSection
                title="Offline"
                members={offline}
                showRoleUnderName
                muted
              />
            ) : null}
          </>
        ) : (
          <PresenceSection
            title="Online"
            members={online}
            showRoleUnderName={false}
            emptyLabel="No one online"
          />
        )}
      </div>
    </aside>
  );
}

function PresenceSection({
  title,
  members,
  showRoleUnderName,
  muted = false,
  emptyLabel,
}: {
  title: string;
  members: {
    userId: string;
    label: string;
    roleLabel?: string | null;
    roleKey?: string;
    online: boolean;
    typing: boolean;
  }[];
  showRoleUnderName: boolean;
  muted?: boolean;
  emptyLabel?: string;
}) {
  if (members.length === 0 && emptyLabel) {
    return (
      <div className="px-1">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#0A3D45]/40">
          {title}
        </p>
        <p className="px-1 text-xs text-[#0A3D45]/40">{emptyLabel}</p>
      </div>
    );
  }
  if (members.length === 0) return null;

  return (
    <div className="px-1">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#0A3D45]/40">
        {title}
      </p>
      <ul className="space-y-0.5">
        {members.map((m) => (
          <li
            key={m.userId}
            className={`flex items-start gap-2 rounded-lg px-1.5 py-1 ${
              muted ? "opacity-70" : ""
            }`}
          >
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                m.online ? "bg-[#3DBEAB]" : "bg-[#0A3D45]/25"
              }`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[#0A3D45]">
                {m.label}
              </span>
              {showRoleUnderName
                ? (() => {
                    const under = m.roleLabel || roleSingularLabel(m.roleKey);
                    return under ? (
                      <span className="block truncate text-[11px] text-[#0A3D45]/45">
                        {under}
                      </span>
                    ) : null;
                  })()
                : null}
              {m.typing ? (
                <span className="block text-[11px] italic text-[#1a7a82]">
                  typing…
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
