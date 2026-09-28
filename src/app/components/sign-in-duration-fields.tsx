"use client";

import { useState } from "react";

const OPTIONS = [
  {
    value: "7",
    label: "7 days",
    hint: "Good on phones",
  },
  {
    value: "30",
    label: "30 days",
    hint: "Good for phones or short usage",
  },
  {
    value: "180",
    label: "6 months",
    hint: "Good for long-term usage",
  },
  {
    value: "365",
    label: "1 year",
    hint: "Good for computers at home",
  },
  {
    value: "forever",
    label: "Forever",
    hint: "Stay signed in until you sign out",
  },
] as const;

/**
 * Exclusive duration picks for sign-in. None selected → this browser session only.
 */
export function SignInDurationFields() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <fieldset className="rounded-xl border border-[#0A3D45]/12 bg-[#0A3D45]/[0.03] px-3 py-3">
      <legend className="px-1 text-sm font-semibold text-[#0A3D45]">
        Sign in time
      </legend>
      <p className="mb-3 text-xs text-[#0A3D45]/65">
        Choose how long you want to stay signed in. If none is selected, you
        stay signed in for this browser session only (ends when you close the
        browser).
      </p>
      <ul className="space-y-2">
        {OPTIONS.map((opt) => {
          const checked = selected === opt.value;
          return (
            <li key={opt.value}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-[#0A3D45]">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#0A3D45]"
                  checked={checked}
                  onChange={() =>
                    setSelected((prev) =>
                      prev === opt.value ? null : opt.value,
                    )
                  }
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="block text-xs text-[#0A3D45]/60">
                    {opt.hint}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <input type="hidden" name="signInDuration" value={selected} />
      ) : null}
    </fieldset>
  );
}
