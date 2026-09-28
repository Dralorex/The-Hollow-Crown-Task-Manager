"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  kickMemberAction,
  updateMemberRoleAction,
} from "@/app/actions/workspaces";
import { setMemberCustomRolesAction } from "@/app/actions/roles";
import { confirmDelete } from "@/lib/confirm";
import { MenuSurface, menuItemClass } from "@/app/components/menu-surface";

type RoleOption = { id: string; name: string };

/** Admin+ member actions: privilege role, custom roles, and/or kick. */
export function WorkspaceMemberMenu({
  workspaceId,
  memberUserId,
  memberLabel,
  memberRole,
  viewerRole,
  workspaceRoles = [],
  memberCustomRoleIds = [],
}: {
  workspaceId: string;
  memberUserId: string;
  memberLabel: string;
  memberRole: string;
  viewerRole: string;
  workspaceRoles?: RoleOption[];
  memberCustomRoleIds?: string[];
}) {
  const isOwner = viewerRole === "OWNER";
  const canKick = viewerRole === "OWNER" || viewerRole === "ADMIN";
  const targetIsOwner = memberRole === "OWNER";
  const targetIsAdmin = memberRole === "ADMIN";

  const canChangeRole = isOwner && !targetIsOwner;
  const canAssignCustom = canKick && !targetIsOwner;
  const canRemove =
    canKick &&
    !targetIsOwner &&
    !(viewerRole === "ADMIN" && targetIsAdmin);

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "role" | "custom">("menu");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(memberCustomRoleIds),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setSelected(new Set(memberCustomRoleIds));
  }, [memberCustomRoleIds]);

  if (!canChangeRole && !canRemove && !canAssignCustom) return null;

  function close() {
    setOpen(false);
    setPanel("menu");
    setError(null);
    setSelected(new Set(memberCustomRoleIds));
  }

  function run(
    action: typeof kickMemberAction | typeof updateMemberRoleAction,
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
      router.refresh();
    });
  }

  function saveCustomRoles() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("memberUserId", memberUserId);
      for (const id of selected) fd.append("roleId", id);
      const result = await setMemberCustomRolesAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
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
        widthClass={panel === "custom" ? "min-w-[14rem]" : "w-52"}
        trigger={({ ref }) => (
          <button
            ref={ref}
            type="button"
            aria-label={`Manage ${memberLabel}`}
            aria-expanded={open}
            className="rounded-md px-2 py-0.5 text-[color:var(--rowgon-deep)]/70 transition hover:bg-[color:var(--rowgon-deep)]/8 hover:text-[color:var(--rowgon-deep)]"
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
            {canChangeRole ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass()}
                disabled={pending}
                onClick={() => setPanel("role")}
              >
                Change privilege
              </button>
            ) : null}
            {canAssignCustom ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass()}
                disabled={pending}
                onClick={() => setPanel("custom")}
              >
                Custom roles…
              </button>
            ) : null}
            {canRemove ? (
              <button
                type="button"
                role="menuitem"
                className={menuItemClass(true)}
                disabled={pending}
                onClick={() =>
                  run(
                    kickMemberAction,
                    {
                      workspaceId,
                      memberUserId,
                    },
                    {
                      confirmLabel: `${memberLabel} from this workspace`,
                    },
                  )
                }
              >
                Remove from workspace
              </button>
            ) : null}
          </div>
        ) : null}

        {panel === "role" && canChangeRole ? (
          <div className="space-y-2 px-3 py-2">
            <button
              type="button"
              className="text-xs text-[color:var(--rowgon-deep)]/60"
              onClick={() => setPanel("menu")}
            >
              ← Back
            </button>
            <p className="text-xs font-semibold text-[color:var(--rowgon-deep)]">
              Privilege
            </p>
            <select
              className="rowgon-input py-1 text-xs"
              defaultValue={memberRole}
              disabled={pending}
              onChange={(e) =>
                run(updateMemberRoleAction, {
                  workspaceId,
                  memberUserId,
                  role: e.target.value,
                })
              }
            >
              <option value="ADMIN">Admin</option>
              <option value="EDITOR">Editor</option>
              <option value="MEMBER">Member</option>
            </select>
          </div>
        ) : null}

        {panel === "custom" && canAssignCustom ? (
          <div className="max-h-80 space-y-2 overflow-y-auto px-3 py-2">
            <button
              type="button"
              className="text-xs text-[color:var(--rowgon-deep)]/60"
              onClick={() => setPanel("menu")}
            >
              ← Back
            </button>
            <p className="text-xs font-semibold text-[color:var(--rowgon-deep)]">
              Custom roles
            </p>
            <ul className="space-y-1">
              {workspaceRoles.map((role) => {
                const checked = selected.has(role.id);
                return (
                  <li key={role.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-[color:var(--rowgon-deep)] hover:bg-[color:var(--rowgon-deep)]/8">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(role.id)) next.delete(role.id);
                            else next.add(role.id);
                            return next;
                          });
                        }}
                      />
                      {role.name}
                    </label>
                  </li>
                );
              })}
              {workspaceRoles.length === 0 ? (
                <li className="text-xs text-[color:var(--rowgon-deep)]/55">
                  Create a role in the Roles panel first.
                </li>
              ) : null}
            </ul>
            <button
              type="button"
              disabled={pending}
              className="rowgon-btn-secondary !px-2.5 !py-1 text-xs disabled:opacity-50"
              onClick={saveCustomRoles}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="border-t border-[color:var(--rowgon-deep)]/10 px-3 py-2 text-xs text-[color:var(--rowgon-coral)]">
            {error}
          </p>
        ) : null}
      </MenuSurface>
    </div>
  );
}
