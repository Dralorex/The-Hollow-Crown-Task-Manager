"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setDisplayThemeAction } from "@/app/actions/settings";
import {
  DISPLAY_THEME_GROUPS,
  themesInGroup,
  type DisplayThemeId,
} from "@/lib/theme";

function SaveHint() {
  const { pending } = useFormStatus();
  return pending ? (
    <span className="text-xs text-[color:var(--tide-deep)]/55">Saving…</span>
  ) : null;
}

export function DisplayThemeSettings({
  currentTheme,
}: {
  currentTheme: DisplayThemeId;
}) {
  const [state, action] = useActionState(setDisplayThemeAction, null);

  return (
    <div className="space-y-6">
      <p className="text-xs text-[color:var(--tide-deep)]/60">
        Color modes for Rowgon on this device. Cool mode is the default.
      </p>

      {DISPLAY_THEME_GROUPS.map((group) => {
        const themes = themesInGroup(group.id);
        return (
          <section key={group.id} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--tide-deep)]">
                {group.label}
              </h3>
              <p className="mt-0.5 text-[11px] text-[color:var(--tide-deep)]/55">
                {group.description}
              </p>
            </div>
            <ul className="space-y-2">
              {themes.map((theme) => {
                const selected = currentTheme === theme.id;
                return (
                  <li key={theme.id}>
                    <form action={action}>
                      <input type="hidden" name="theme" value={theme.id} />
                      <button
                        type="submit"
                        className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-[color:var(--tide-deep)] bg-[color:var(--tide-deep)]/10"
                            : "border-[color:var(--tide-deep)]/12 hover:border-[color:var(--tide-deep)]/25 hover:bg-[color:var(--tide-deep)]/[0.04]"
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-[color:var(--tide-deep)]">
                            {theme.label}
                            {theme.id === "cool" ? (
                              <span className="ml-2 text-[11px] font-medium text-[color:var(--tide-deep)]/50">
                                Default
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs text-[color:var(--tide-deep)]/60">
                            {theme.description}
                          </span>
                        </span>
                        {selected ? (
                          <span className="shrink-0 text-xs font-semibold text-[color:var(--tide-deep)]">
                            On
                          </span>
                        ) : (
                          <SaveHint />
                        )}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {state && !state.ok ? (
        <p className="text-sm text-[#9b2f22]">{state.error}</p>
      ) : null}
    </div>
  );
}
