"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createWorkspaceRoleAction,
  deleteWorkspaceRoleAction,
  setWorkspaceRoleHideFoldersAction,
} from "@/app/actions/roles";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import { blinkRing } from "@/app/components/onboarding-prompt";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import {
  isRoleCreateStep,
  nextRoleCreateStep,
} from "@/lib/workspace-onboarding";
import { confirmDelete } from "@/lib/confirm";
import { enterAdvancesFocus } from "@/lib/form-keyboard";

export function WorkspaceRolesPanel({
  workspaceId,
  roles,
  canManage,
}: {
  workspaceId: string;
  roles: {
    id: string;
    name: string;
    memberCount: number;
    hideFolders: boolean;
  }[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { active, track, step, setStep, blink } = useWorkspaceOnboarding();

  const guidingRoles =
    active && track === "full" && canManage && isRoleCreateStep(step);

  // Keep Roles open during the tour after the user opens it themselves
  // (do not auto-open on roles-open — they tap Continue, then open the tab).
  useEffect(() => {
    if (guidingRoles && step !== "roles-open") setOpen(true);
  }, [guidingRoles, step]);

  // If Roles is already expanded when we land on roles-open, advance.
  useEffect(() => {
    if (active && step === "roles-open" && open) {
      setStep("roles-intro");
    }
  }, [active, step, open, setStep]);

  function advanceFrom(current: typeof step) {
    if (!active || track !== "full") return;
    if (step !== current) return;
    setStep(nextRoleCreateStep(current));
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("name", name.trim());
      const result = await createWorkspaceRoleAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      if (active && track === "full" && step === "roles-create") {
        setStep("roles-list");
      }
      router.refresh();
    });
  }

  function remove(roleId: string, roleName: string) {
    if (!confirmDelete(`role “${roleName}”`)) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("roleId", roleId);
      const result = await deleteWorkspaceRoleAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleHideFolders(roleId: string, hideFolders: boolean) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("roleId", roleId);
      fd.set("hideFolders", hideFolders ? "1" : "0");
      const result = await setWorkspaceRoleHideFoldersAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      if (active && track === "full" && step === "roles-hide") {
        setStep("roles-hide-info");
      }
      router.refresh();
    });
  }

  return (
    <div className="rowgon-panel p-4">
      <ChatSidebarSection
        id="workspace-roles"
        title="Roles"
        description="Custom roles control folder access and role-based task alerts. Members can hold several at once."
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next && active && step === "roles-open") {
            setStep("roles-intro");
          }
        }}
        blinkHeader={blink("roles-header")}
      >
        <ul className="space-y-3 text-sm">
          {roles.map((role, index) => (
            <li
              key={role.id}
              className="space-y-1.5 text-[color:var(--rowgon-deep)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">
                  {role.name}
                  <span className="ml-1.5 text-[11px] font-normal text-[color:var(--rowgon-deep)]/50">
                    {role.memberCount} member
                    {role.memberCount === 1 ? "" : "s"}
                  </span>
                </span>
                {canManage ? (
                  <button
                    type="button"
                    disabled={pending}
                    className="shrink-0 text-xs text-[color:var(--rowgon-coral)] hover:underline disabled:opacity-50"
                    onClick={() => remove(role.id, role.name)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              {canManage ? (
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-md px-1 py-0.5 text-xs text-[color:var(--rowgon-deep)]/80 ${
                    index === 0 ? blinkRing(blink("roles-hide")) : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    data-onboarding={
                      index === 0 ? "roles-hide" : undefined
                    }
                    checked={role.hideFolders}
                    disabled={pending}
                    onChange={(e) =>
                      toggleHideFolders(role.id, e.target.checked)
                    }
                  />
                  <span>
                    Hide folders with this role
                    <span className="mt-0.5 block text-[11px] font-normal text-[color:var(--rowgon-deep)]/50">
                      Unauthorized members won’t see those folders at all.
                    </span>
                  </span>
                </label>
              ) : role.hideFolders ? (
                <p className="text-[11px] text-[color:var(--rowgon-deep)]/50">
                  Hides folders from unauthorized members
                </p>
              ) : null}
            </li>
          ))}
          {roles.length === 0 ? (
            <li className="text-xs text-[color:var(--rowgon-deep)]/55">
              No custom roles yet.
            </li>
          ) : null}
        </ul>

        {canManage ? (
          <form
            onSubmit={create}
            onKeyDown={enterAdvancesFocus}
            className="mt-3 flex flex-col gap-2"
          >
            <input
              type="text"
              inputMode="text"
              enterKeyHint="next"
              autoCapitalize="sentences"
              value={name}
              data-onboarding="roles-name"
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                if (
                  active &&
                  step === "roles-name" &&
                  v.trim().length > 0
                ) {
                  advanceFrom("roles-name");
                }
              }}
              placeholder="New role name"
              className={`rowgon-input text-sm ${blinkRing(blink("roles-name"))}`}
              required
            />
            <button
              type="submit"
              data-onboarding="roles-create"
              disabled={pending || !name.trim()}
              className={`rowgon-btn-secondary text-sm disabled:opacity-50 ${blinkRing(blink("roles-create"))}`}
            >
              {pending ? "Saving…" : "Create role"}
            </button>
          </form>
        ) : null}
        {error ? (
          <p className="mt-2 text-xs text-[color:var(--rowgon-coral)]">
            {error}
          </p>
        ) : null}
      </ChatSidebarSection>
    </div>
  );
}
