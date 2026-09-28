"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createWorkspaceRoleAction,
  deleteWorkspaceRoleAction,
  setFolderRolesAction,
  setMemberCustomRolesAction,
  setWorkspaceRoleHideFoldersAction,
} from "@/app/actions/roles";

type RoleOption = { id: string; name: string; hideFolders: boolean };
type MemberOption = {
  id: string;
  username: string;
  roleIds: string[];
};

export function WorkspaceRolesPanel({
  workspaceId,
  roles,
  members,
}: {
  workspaceId: string;
  roles: RoleOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function run(
    action: (
      prev: null,
      fd: FormData,
    ) => Promise<{ ok: true } | { ok: false; error: string }>,
    fd: FormData,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs font-semibold text-[#0A3D45]/70 underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Custom roles
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#0A3D45]/12 bg-white/70 p-3 text-sm text-[#0A3D45]">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Custom roles</p>
        <button
          type="button"
          className="text-xs text-[#0A3D45]/55 hover:text-[#0A3D45]"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      <p className="mt-1 text-xs text-[#0A3D45]/55">
        Restrict folders to named roles. Empty folder roles = open to everyone.
        Owner/Admin always bypass.
      </p>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("workspaceId", workspaceId);
          run(createWorkspaceRoleAction, fd);
          e.currentTarget.reset();
        }}
      >
        <input
          name="name"
          required
          placeholder="e.g. Design"
          className="rowgon-input min-h-9 flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rowgon-btn-secondary min-h-9 text-xs"
        >
          Add role
        </button>
      </form>

      {roles.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {roles.map((role) => (
            <li
              key={role.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0A3D45]/4 px-2 py-1.5"
            >
              <span className="font-medium">{role.name}</span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-[#0A3D45]/70">
                  <input
                    type="checkbox"
                    checked={role.hideFolders}
                    disabled={pending}
                    onChange={(e) => {
                      const fd = new FormData();
                      fd.set("workspaceId", workspaceId);
                      fd.set("roleId", role.id);
                      fd.set("hideFolders", e.target.checked ? "1" : "0");
                      run(setWorkspaceRoleHideFoldersAction, fd);
                    }}
                  />
                  Hide locked folders
                </label>
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs text-[#E85D4C] hover:underline"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("workspaceId", workspaceId);
                    fd.set("roleId", role.id);
                    run(deleteWorkspaceRoleAction, fd);
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[#0A3D45]/50">No custom roles yet.</p>
      )}

      {roles.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-[#0A3D45]/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/45">
            Assign to members
          </p>
          {members.map((member) => (
            <form
              key={member.id}
              className="space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("workspaceId", workspaceId);
                fd.set("memberUserId", member.id);
                run(setMemberCustomRolesAction, fd);
              }}
            >
              <p className="text-xs font-medium">@{member.username}</p>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className="inline-flex items-center gap-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      name="roleId"
                      value={role.id}
                      defaultChecked={member.roleIds.includes(role.id)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <button
                type="submit"
                disabled={pending}
                className="text-xs font-semibold text-[#1a7a82] hover:underline"
              >
                Save roles
              </button>
            </form>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[#E85D4C]">{error}</p> : null}
    </div>
  );
}

export function FolderAccessPanel({
  workspaceId,
  folderId,
  roles,
  requiredRoleIds,
  hideFromUnauthorized,
  alwaysVisible,
  alwaysAccessible,
}: {
  workspaceId: string;
  folderId: string;
  roles: RoleOption[];
  requiredRoleIds: string[];
  hideFromUnauthorized: boolean;
  alwaysVisible: boolean;
  alwaysAccessible: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<"all" | "roles">(
    requiredRoleIds.length === 0 ? "all" : "roles",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(requiredRoleIds),
  );
  const [hideUnauthorized, setHideUnauthorized] = useState(hideFromUnauthorized);
  const [alwaysShow, setAlwaysShow] = useState(alwaysVisible);
  const [alwaysAccess, setAlwaysAccess] = useState(alwaysAccessible);

  if (!open) {
    return (
      <button
        type="button"
        className="text-xs font-semibold text-[#0A3D45]/70 underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Folder access
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#0A3D45]/12 bg-white/70 p-3 text-sm text-[#0A3D45]">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Folder access</p>
        <button
          type="button"
          className="text-xs text-[#0A3D45]/55"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            checked={accessMode === "all"}
            onChange={() => setAccessMode("all")}
          />
          Everyone
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            checked={accessMode === "roles"}
            onChange={() => setAccessMode("roles")}
            disabled={roles.length === 0}
          />
          Selected roles
        </label>
      </div>

      {accessMode === "roles" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {roles.map((role) => (
            <label key={role.id} className="inline-flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={selected.has(role.id)}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(role.id);
                    else next.delete(role.id);
                    return next;
                  });
                }}
              />
              {role.name}
            </label>
          ))}
        </div>
      ) : null}

      <label className="mt-2 flex items-center gap-1 text-xs text-[#0A3D45]/70">
        <input
          type="checkbox"
          checked={hideUnauthorized}
          onChange={(e) => setHideUnauthorized(e.target.checked)}
        />
        Hide from unauthorized
      </label>
      <label className="mt-1 flex items-center gap-1 text-xs text-[#0A3D45]/70">
        <input
          type="checkbox"
          checked={alwaysShow}
          onChange={(e) => setAlwaysShow(e.target.checked)}
        />
        Always show in tree (still locked)
      </label>
      <label className="mt-1 flex items-center gap-1 text-xs text-[#0A3D45]/70">
        <input
          type="checkbox"
          checked={alwaysAccess}
          onChange={(e) => setAlwaysAccess(e.target.checked)}
        />
        Always accessible (ignore roles)
      </label>

      <button
        type="button"
        disabled={pending}
        className="rowgon-btn-secondary mt-3 min-h-9 text-xs"
        onClick={() => {
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
            router.refresh();
          });
        }}
      >
        Save access
      </button>
      {error ? <p className="mt-2 text-xs text-[#E85D4C]">{error}</p> : null}
    </div>
  );
}
