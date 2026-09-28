"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteWorkspaceAction,
  kickMemberAction,
  leaveWorkspaceAction,
  renameWorkspaceAction,
  updateMemberRoleAction,
} from "@/app/actions/workspaces";
import { confirmDelete } from "@/lib/confirm";
import { personLabel } from "@/lib/utils";
import { MenuSurface, menuItemClass } from "@/app/components/menu-surface";

type Member = {
  userId: string;
  role: string;
  username: string;
  nickname: string | null;
};

export function WorkspaceCardMenu({
  workspaceId,
  workspaceName,
  role,
  members,
}: {
  workspaceId: string;
  workspaceName: string;
  role: string;
  members: Member[];
}) {
  const isOwner = role === "OWNER";
  const canKick = role === "OWNER" || role === "ADMIN";
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "rename" | "members">("menu");
  const [name, setName] = useState(workspaceName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setName(workspaceName);
  }, [workspaceName]);

  function close() {
    setOpen(false);
    setPanel("menu");
    setError(null);
  }

  function run(
    action: typeof leaveWorkspaceAction,
    fields: Record<string, string>,
    opts?: { confirmLabel?: string },
  ) {
    if (opts?.confirmLabel && !confirmDelete(opts.confirmLabel)) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const result = await action(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      close();
      if (result && result.ok && result.resetUrl) {
        router.push(result.resetUrl);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div
      className="relative shrink-0"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <MenuSurface
        open={open}
        onClose={close}
        widthClass="w-64"
        trigger={({ ref }) => (
          <button
            ref={ref}
            type="button"
            aria-label="Workspace options"
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
          <>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass()}
              onClick={() => setPanel("members")}
            >
              See all members
            </button>
            {isOwner ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass()}
                  onClick={() => setPanel("rename")}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass(true)}
                  onClick={() =>
                    run(
                      deleteWorkspaceAction,
                      { workspaceId },
                      {
                        confirmLabel: `workspace “${workspaceName}” and all of its content`,
                      },
                    )
                  }
                >
                  Delete workspace
                </button>
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass(true)}
                onClick={() =>
                  run(
                    leaveWorkspaceAction,
                    { workspaceId },
                    { confirmLabel: `your membership in “${workspaceName}”` },
                  )
                }
              >
                Leave workspace
              </button>
            )}
          </>
        ) : null}

        {panel === "rename" ? (
          <form
            className="space-y-2 px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(renameWorkspaceAction, {
                workspaceId,
                name: name.trim(),
              });
            }}
          >
            <p className="text-xs font-semibold text-[#0A3D45]">Rename</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rowgon-input w-full text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-[#0A3D45]/60"
                onClick={() => setPanel("menu")}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={pending}
                className="text-xs font-semibold text-[#0A3D45]"
              >
                Save
              </button>
            </div>
          </form>
        ) : null}

        {panel === "members" ? (
          <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-2">
            <button
              type="button"
              className="text-xs text-[#0A3D45]/60"
              onClick={() => setPanel("menu")}
            >
              ← Back
            </button>
            <p className="text-xs font-semibold text-[#0A3D45]">Members</p>
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m.userId}
                  className="rounded-md border border-[#0A3D45]/10 px-2 py-1.5 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-[#0A3D45]">
                      {personLabel(m)}
                    </span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-[#0A3D45]/50">
                      {m.role.toLowerCase()}
                    </span>
                  </div>
                  {isOwner && m.role !== "OWNER" ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <select
                        className="rowgon-input py-1 text-xs"
                        defaultValue={m.role}
                        disabled={pending}
                        onChange={(e) =>
                          run(updateMemberRoleAction, {
                            workspaceId,
                            memberUserId: m.userId,
                            role: e.target.value,
                          })
                        }
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="EDITOR">Editor</option>
                        <option value="MEMBER">Member</option>
                      </select>
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#9b2f22]"
                        onClick={() =>
                          run(
                            kickMemberAction,
                            {
                              workspaceId,
                              memberUserId: m.userId,
                            },
                            {
                              confirmLabel: `${personLabel(m)} from this workspace`,
                            },
                          )
                        }
                      >
                        Kick
                      </button>
                    </div>
                  ) : null}
                  {!isOwner &&
                  canKick &&
                  m.role !== "OWNER" &&
                  m.role !== "ADMIN" ? (
                    <button
                      type="button"
                      className="mt-1.5 text-xs font-semibold text-[#9b2f22]"
                      onClick={() =>
                        run(
                          kickMemberAction,
                          {
                            workspaceId,
                            memberUserId: m.userId,
                          },
                          {
                            confirmLabel: `${personLabel(m)} from this workspace`,
                          },
                        )
                      }
                    >
                      Kick
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="border-t border-[#0A3D45]/10 px-3 py-2 text-xs text-[#9b2f22]">
            {error}
          </p>
        ) : null}
      </MenuSurface>
    </div>
  );
}
