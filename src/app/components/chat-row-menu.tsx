"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addGroupMembersAction,
  deleteChatGroupAction,
  leaveChatAction,
  removeGroupMemberAction,
} from "@/app/actions/social";
import { confirmDelete } from "@/lib/confirm";
import {
  FriendInvitePicker,
  type InviteFriendOption,
} from "@/app/components/friend-invite-picker";
import { MenuSurface, menuItemClass } from "@/app/components/menu-surface";

type GroupMemberRow = {
  userId: string;
  label: string;
};

/** Chat thread/list ⋮ menu — leave, delete, and edit group members. */
export function ChatRowMenu({
  groupId,
  isDirect,
  canDelete,
  canEditMembers = false,
  isClosed = false,
  listTab = "groups",
  currentMembers = [],
  addCandidates = [],
  addSearchPlaceholder = "Search friends",
  addItemNoun = "friend",
}: {
  groupId: string;
  isDirect: boolean;
  canDelete: boolean;
  canEditMembers?: boolean;
  /** Closed DMs stay readable but aren't closable again. */
  isClosed?: boolean;
  listTab?: "dms" | "groups" | "workspace-groups";
  currentMembers?: GroupMemberRow[];
  addCandidates?: InviteFriendOption[];
  addSearchPlaceholder?: string;
  addItemNoun?: string;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "members">("menu");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function close() {
    setOpen(false);
    setPanel("menu");
    setError(null);
  }

  async function run(
    action: typeof leaveChatAction | typeof deleteChatGroupAction,
    extra?: Record<string, string>,
  ) {
    const fd = new FormData();
    fd.set("groupId", groupId);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    }
    const result = await action(null, fd);
    close();
    if (result?.ok) {
      router.push(isDirect ? "/app/chat?tab=dms" : `/app/chat?tab=${listTab}`);
      router.refresh();
    } else if (result && !result.ok) alert(result.error);
  }

  function runMemberAction(
    action: typeof addGroupMembersAction | typeof removeGroupMemberAction,
    fields: Record<string, string>,
  ) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("groupId", groupId);
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const result = await action(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (action === addGroupMembersAction) {
        setPanel("members");
      }
    });
  }

  const widthClass =
    panel === "members" ? "w-72 max-w-[min(18rem,calc(100vw-2rem))]" : undefined;

  return (
    <div
      className="relative shrink-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <MenuSurface
        open={open}
        onClose={close}
        widthClass={widthClass}
        trigger={({ ref }) => (
          <button
            ref={ref}
            type="button"
            aria-label="Chat options"
            aria-expanded={open}
            className="rounded-md px-2 py-1 text-[#0A3D45]/70 transition hover:bg-[#0A3D45]/8 hover:text-[#0A3D45]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
              setPanel("menu");
              setError(null);
            }}
          >
            ···
          </button>
        )}
      >
        {panel === "menu" ? (
          <div className="py-1">
            {canEditMembers ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass()}
                onClick={() => setPanel("members")}
              >
                Edit members
              </button>
            ) : null}
            {!(isDirect && isClosed) ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass(true)}
                onClick={() => {
                  if (
                    !confirmDelete(
                      isDirect
                        ? "this chat (messaging will stop for both of you)"
                        : "your membership in this group",
                    )
                  ) {
                    return;
                  }
                  void run(leaveChatAction);
                }}
              >
                {isDirect ? "Close chat" : "Leave group"}
              </button>
            ) : null}
            {canDelete && !isDirect ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass(true)}
                onClick={() => {
                  if (!confirmDelete("this group for everyone")) return;
                  void run(deleteChatGroupAction);
                }}
              >
                Delete for all
              </button>
            ) : null}
          </div>
        ) : null}

        {panel === "members" && canEditMembers ? (
          <div className="max-h-80 space-y-3 overflow-y-auto px-3 py-2">
            <button
              type="button"
              className="text-xs text-[#0A3D45]/60 hover:underline"
              onClick={() => {
                setPanel("menu");
                setError(null);
              }}
            >
              ← Back
            </button>
            <p className="text-xs font-semibold text-[#0A3D45]">Current members</p>
            <ul className="space-y-1.5">
              {currentMembers.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate text-[#0A3D45]">
                    {member.label}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className="shrink-0 text-xs font-semibold text-[#9b2f22] disabled:opacity-50"
                    onClick={() => {
                      if (
                        !confirmDelete(`${member.label} from this group`)
                      ) {
                        return;
                      }
                      runMemberAction(removeGroupMemberAction, {
                        memberUserId: member.userId,
                      });
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-[#0A3D45]/10 pt-3">
              <p className="text-xs font-semibold text-[#0A3D45]">Add members</p>
              <form
                className="mt-2 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const members = String(fd.get("members") ?? "");
                  if (!members.trim()) {
                    setError("Pick at least one person to add.");
                    return;
                  }
                  runMemberAction(addGroupMembersAction, { members });
                }}
              >
                <FriendInvitePicker
                  key={`add-${currentMembers.map((m) => m.userId).join("-")}`}
                  friends={addCandidates}
                  mode="multi"
                  membersName="members"
                  required
                  searchPlaceholder={addSearchPlaceholder}
                  selectedItemNoun={addItemNoun}
                  emptyMessage="No one else available to add."
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rowgon-btn-secondary w-full text-xs disabled:opacity-60"
                >
                  {pending ? "Adding…" : "Add selected"}
                </button>
              </form>
            </div>
            {error ? <p className="text-xs text-[#9b2f22]">{error}</p> : null}
          </div>
        ) : null}
      </MenuSurface>
    </div>
  );
}
