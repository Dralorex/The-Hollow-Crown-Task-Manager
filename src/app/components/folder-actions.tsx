"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFolderAction,
  renameFolderAction,
} from "@/app/actions/tasks";
import { setFolderRolesAction } from "@/app/actions/roles";
import { confirmDelete } from "@/lib/confirm";
import { MenuSurface, menuItemClass } from "@/app/components/menu-surface";

type RoleOption = { id: string; name: string };

export function FolderActions({
  workspaceId,
  folderId,
  folderName,
  canManageRoles = false,
  workspaceRoles = [],
  requiredRoleIds = [],
  hideFromUnauthorized = false,
  alwaysVisible = false,
  alwaysAccessible = false,
}: {
  workspaceId: string;
  folderId: string;
  folderName: string;
  canManageRoles?: boolean;
  workspaceRoles?: RoleOption[];
  requiredRoleIds?: string[];
  hideFromUnauthorized?: boolean;
  alwaysVisible?: boolean;
  alwaysAccessible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [panel, setPanel] = useState<"menu" | "access">("menu");
  const [name, setName] = useState(folderName);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(requiredRoleIds),
  );
  const [accessMode, setAccessMode] = useState<"all" | "roles">(
    requiredRoleIds.length === 0 ? "all" : "roles",
  );
  const [hideUnauthorized, setHideUnauthorized] = useState(hideFromUnauthorized);
  const [alwaysShow, setAlwaysShow] = useState(alwaysVisible);
  const [alwaysAccess, setAlwaysAccess] = useState(alwaysAccessible);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setName(folderName);
  }, [folderName]);

  useEffect(() => {
    setSelected(new Set(requiredRoleIds));
    setAccessMode(requiredRoleIds.length === 0 ? "all" : "roles");
    setHideUnauthorized(hideFromUnauthorized);
    setAlwaysShow(alwaysVisible);
    setAlwaysAccess(alwaysAccessible);
  }, [requiredRoleIds, hideFromUnauthorized, alwaysVisible, alwaysAccessible]);

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("folderId", folderId);
    fd.set("name", name.trim());
    const result = await renameFolderAction(null, fd);
    if (result?.ok) {
      setRenaming(false);
      setOpen(false);
      router.refresh();
    } else if (result && !result.ok) {
      alert(result.error);
    }
  }

  async function remove() {
    if (!confirmDelete(`folder “${folderName}” and everything inside it`)) {
      return;
    }
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("folderId", folderId);
    const result = await deleteFolderAction(null, fd);
    setOpen(false);
    if (result?.ok) {
      if (result.resetUrl) router.push(result.resetUrl);
      else router.refresh();
    } else if (result && !result.ok) alert(result.error);
  }

  function saveAccess() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("folderId", folderId);
      fd.set("access", accessMode === "all" ? "all" : "roles");
      if (accessMode === "roles") {
        for (const id of selected) fd.append("roleId", id);
      }
      fd.set("hideFromUnauthorized", hideUnauthorized ? "1" : "0");
      fd.set("alwaysVisible", alwaysShow ? "1" : "0");
      fd.set("alwaysAccessible", alwaysAccess ? "1" : "0");
      const result = await setFolderRolesAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setPanel("menu");
      router.refresh();
    });
  }

  function close() {
    setOpen(false);
    setPanel("menu");
    setError(null);
    setSelected(new Set(requiredRoleIds));
    setAccessMode(requiredRoleIds.length === 0 ? "all" : "roles");
    setHideUnauthorized(hideFromUnauthorized);
    setAlwaysShow(alwaysVisible);
    setAlwaysAccess(alwaysAccessible);
  }

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      {renaming ? (
        <form
          onSubmit={saveRename}
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rowgon-input max-w-[8rem] py-1 text-xs"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="submit"
            className="text-xs font-semibold text-[color:var(--rowgon-deep)]"
            onClick={(e) => e.stopPropagation()}
          >
            Save
          </button>
          <button
            type="button"
            className="text-xs text-[color:var(--rowgon-deep)]/55"
            onClick={(e) => {
              e.stopPropagation();
              setRenaming(false);
              setName(folderName);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <MenuSurface
          open={open}
          onClose={close}
          widthClass={panel === "access" ? "min-w-[16rem]" : "min-w-[10rem]"}
          trigger={({ ref }) => (
            <button
              ref={ref}
              type="button"
              aria-label="Folder options"
              aria-expanded={open}
              className="rounded-md px-1.5 py-0.5 text-[color:var(--rowgon-deep)]/70 transition hover:bg-[color:var(--rowgon-deep)]/8 hover:text-[color:var(--rowgon-deep)]"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
                setPanel("menu");
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
                onClick={() => {
                  setRenaming(true);
                  setOpen(false);
                }}
              >
                Rename
              </button>
              {canManageRoles ? (
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass()}
                  onClick={() => setPanel("access")}
                >
                  Access roles…
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className={menuItemClass(true)}
                onClick={() => void remove()}
              >
                Delete
              </button>
            </>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--rowgon-deep)]/45">
                Who can open “{folderName}”
              </p>
              <label className="flex items-center gap-2 text-sm text-[color:var(--rowgon-deep)]">
                <input
                  type="radio"
                  name={`access-${folderId}`}
                  checked={accessMode === "all"}
                  onChange={() => setAccessMode("all")}
                />
                All members
              </label>
              <label className="flex items-center gap-2 text-sm text-[color:var(--rowgon-deep)]">
                <input
                  type="radio"
                  name={`access-${folderId}`}
                  checked={accessMode === "roles"}
                  onChange={() => setAccessMode("roles")}
                />
                Specific roles
              </label>
              {accessMode === "roles" ? (
                <ul className="space-y-1 border-t border-[color:var(--rowgon-deep)]/8 pt-2">
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
                      Create a role first.
                    </li>
                  ) : null}
                </ul>
              ) : null}

              <div className="space-y-2 border-t border-[color:var(--rowgon-deep)]/8 pt-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm text-[color:var(--rowgon-deep)] hover:bg-[color:var(--rowgon-deep)]/8">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={hideUnauthorized}
                    onChange={(e) => setHideUnauthorized(e.target.checked)}
                  />
                  <span>
                    Hide from unauthorized
                    <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/55">
                      Don’t show a locked folder to people without access.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm text-[color:var(--rowgon-deep)] hover:bg-[color:var(--rowgon-deep)]/8">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={alwaysShow}
                    onChange={(e) => setAlwaysShow(e.target.checked)}
                  />
                  <span>
                    Always show
                    <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/55">
                      Overrides hide rules — always visible in the tree (still locked without access).
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm text-[color:var(--rowgon-deep)] hover:bg-[color:var(--rowgon-deep)]/8">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={alwaysAccess}
                    onChange={(e) => setAlwaysAccess(e.target.checked)}
                  />
                  <span>
                    Always accessible
                    <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/55">
                      Anyone can open this folder even when roles are set.
                    </span>
                  </span>
                </label>
              </div>

              {error ? (
                <p className="text-xs text-[color:var(--rowgon-coral)]">{error}</p>
              ) : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={pending}
                  className="rowgon-btn-secondary !px-2.5 !py-1 text-xs disabled:opacity-50"
                  onClick={saveAccess}
                >
                  {pending ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="text-xs text-[color:var(--rowgon-deep)]/55"
                  onClick={() => setPanel("menu")}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </MenuSurface>
      )}
    </div>
  );
}
