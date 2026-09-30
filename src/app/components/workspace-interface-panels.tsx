"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updatePersonalInterfacePrefAction,
} from "@/app/actions/settings";
import {
  updateWorkspaceInterfaceApplyAction,
  updateWorkspaceInterfaceDefaultAction,
} from "@/app/actions/workspaces";
import { ChatSidebarSection } from "@/app/components/chat-sidebar-section";
import {
  INTERFACE_FEATURE_META,
  type InterfaceFeatureKey,
  type InterfacePrefMode,
  type PersonalInterfacePrefs,
  type WorkspaceInterfaceDefaults,
} from "@/lib/interface-prefs";

const MODE_OPTIONS: { value: InterfacePrefMode; label: string }[] = [
  { value: "follow", label: "Follow" },
  { value: "show", label: "Show" },
  { value: "hide", label: "Hide" },
];

/** Admin+ workspace defaults. Members never see this panel. */
export function WorkspaceInterfaceDefaultsPanel({
  workspaceId,
  applyToMembers,
  defaults,
}: {
  workspaceId: string;
  applyToMembers: boolean;
  defaults: WorkspaceInterfaceDefaults;
}) {
  const [apply, setApply] = useState(applyToMembers);
  const [localDefaults, setLocalDefaults] = useState(defaults);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function saveApply(next: boolean) {
    const prev = apply;
    setApply(next);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("apply", next ? "1" : "0");
      const result = await updateWorkspaceInterfaceApplyAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        setApply(prev);
        return;
      }
      router.refresh();
    });
  }

  function saveDefault(feature: InterfaceFeatureKey, enabled: boolean) {
    const prev = localDefaults[feature];
    setLocalDefaults((d) => ({ ...d, [feature]: enabled }));
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("feature", feature);
      fd.set("enabled", enabled ? "1" : "0");
      const result = await updateWorkspaceInterfaceDefaultAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        setLocalDefaults((d) => ({ ...d, [feature]: prev }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="tide-panel p-4">
      <ChatSidebarSection
        title="Interface defaults"
        description="Defaults for this workspace. Members can override in Settings → Interface."
        defaultOpen={false}
      >
        <label className="flex cursor-pointer items-start gap-2 text-sm text-[color:var(--tide-deep)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={apply}
            disabled={pending}
            onChange={(e) => saveApply(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Apply to members</span>
            <span className="mt-0.5 block text-[11px] text-[color:var(--tide-deep)]/55">
              When on, members on Follow workspace use the On/Off defaults below.
              This does not show these admin controls to members.
            </span>
          </span>
        </label>

        {apply ? (
          <ul className="mt-3 space-y-2 text-sm text-[color:var(--tide-deep)]">
            {INTERFACE_FEATURE_META.map((feature) => (
              <li key={feature.key}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={localDefaults[feature.key]}
                    disabled={pending}
                    onChange={(e) =>
                      saveDefault(feature.key, e.target.checked)
                    }
                  />
                  <span>
                    {feature.label}
                    <span className="mt-0.5 block text-[11px] text-[color:var(--tide-deep)]/50">
                      {feature.description}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p className="mt-2 text-xs text-[color:var(--tide-coral)]">{error}</p>
        ) : null}
      </ChatSidebarSection>
    </div>
  );
}

/** Personal Follow / Show / Hide panel in workspace sidebar. */
export function PersonalWorkspaceInterfacePanel({
  prefs,
}: {
  prefs: PersonalInterfacePrefs;
}) {
  const [local, setLocal] = useState(prefs);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setMode(feature: InterfaceFeatureKey, mode: InterfacePrefMode) {
    const prev = local[feature];
    setLocal((p) => ({ ...p, [feature]: mode }));
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("feature", feature);
      fd.set("mode", mode);
      const result = await updatePersonalInterfacePrefAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        setLocal((p) => ({ ...p, [feature]: prev }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="tide-panel p-4">
      <ChatSidebarSection
        title="My interface"
        description="Your personal overrides for this account. Also in Settings → Interface."
        defaultOpen={false}
      >
        <ul className="space-y-3">
          {INTERFACE_FEATURE_META.map((feature) => (
            <li key={feature.key}>
              <div className="text-xs font-semibold text-[color:var(--tide-deep)]">
                {feature.label}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {MODE_OPTIONS.map((opt) => {
                  const selected = local[feature.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={pending}
                      onClick={() => setMode(feature.key, opt.value)}
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
                        selected
                          ? "border-[color:var(--tide-deep)] bg-[color:var(--tide-deep)]/10 text-[color:var(--tide-deep)]"
                          : "border-[color:var(--tide-deep)]/12 text-[color:var(--tide-deep)]/65"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        {error ? (
          <p className="mt-2 text-xs text-[color:var(--tide-coral)]">{error}</p>
        ) : null}
      </ChatSidebarSection>
    </div>
  );
}
