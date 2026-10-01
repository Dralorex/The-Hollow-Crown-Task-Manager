"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updatePersonalInterfacePrefAction,
  updateShowInterfaceTogglesInWorkspaceAction,
} from "@/app/actions/settings";
import {
  INTERFACE_FEATURE_META,
  type InterfaceFeatureKey,
  type InterfacePrefMode,
  type PersonalInterfacePrefs,
} from "@/lib/interface-prefs";

const MODE_OPTIONS: { value: InterfacePrefMode; label: string }[] = [
  { value: "follow", label: "Follow workspace" },
  { value: "show", label: "Always show" },
  { value: "hide", label: "Always hide" },
];

export function InterfaceSettings({
  prefs,
  showTogglesInWorkspace,
  defaultOpen = true,
}: {
  prefs: PersonalInterfacePrefs;
  showTogglesInWorkspace: boolean;
  defaultOpen?: boolean;
}) {
  const [local, setLocal] = useState(prefs);
  const [showInWorkspace, setShowInWorkspace] = useState(showTogglesInWorkspace);
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

  function setShowToggles(enabled: boolean) {
    const prev = showInWorkspace;
    setShowInWorkspace(enabled);
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("enabled", enabled ? "1" : "0");
      const result = await updateShowInterfaceTogglesInWorkspaceAction(null, fd);
      if (result && !result.ok) {
        setError(result.error);
        setShowInWorkspace(prev);
        return;
      }
      router.refresh();
    });
  }

  return (
    <details className="tide-panel p-5" open={defaultOpen}>
      <summary className="cursor-pointer font-semibold text-[color:var(--tide-deep)]">
        Interface
      </summary>
      <p className="mt-2 text-xs text-[color:var(--tide-deep)]/60">
        Choose what you see in workspaces. Follow workspace uses Admin+ defaults
        when they apply them to members; otherwise the app default (on).
      </p>

      <ul className="mt-5 space-y-4">
        {INTERFACE_FEATURE_META.map((feature) => (
          <li key={feature.key}>
            <div className="text-sm font-semibold text-[color:var(--tide-deep)]">
              {feature.label}
            </div>
            <p className="mt-0.5 text-[11px] text-[color:var(--tide-deep)]/55">
              {feature.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MODE_OPTIONS.map((opt) => {
                const selected = local[feature.key] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={pending}
                    onClick={() => setMode(feature.key, opt.value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                      selected
                        ? "border-[color:var(--tide-deep)] bg-[color:var(--tide-deep)]/10 text-[color:var(--tide-deep)]"
                        : "border-[color:var(--tide-deep)]/12 text-[color:var(--tide-deep)]/70 hover:border-[color:var(--tide-deep)]/25"
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

      <div className="mt-6 border-t border-[color:var(--tide-deep)]/10 pt-4">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-[color:var(--tide-deep)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={showInWorkspace}
            disabled={pending}
            onChange={(e) => setShowToggles(e.target.checked)}
          />
          <span>
            <span className="font-semibold">Show toggles in workspace</span>
            <span className="mt-0.5 block text-[11px] text-[color:var(--tide-deep)]/55">
              Add a personal Interface panel in each workspace sidebar so you can
              change Follow / Always show / Always hide without opening Settings.
            </span>
          </span>
        </label>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[#9b2f22]">{error}</p>
      ) : null}
    </details>
  );
}
