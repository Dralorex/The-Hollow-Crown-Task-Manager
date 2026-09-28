"use client";

import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";

/** First-run gate: full course, short course, hard no, or soft “I’m all set”. */
export function OnboardingChooser() {
  const { needsChooser, chooseTrack, decline } = useWorkspaceOnboarding();

  if (!needsChooser) return null;

  return (
    <div className="rowgon-panel mt-6 border border-[#1a7a82]/30 p-5 animate-rowgon-rise sm:p-6">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
        Hey — this looks like a new account
      </h2>
      <p className="mt-2 max-w-xl text-sm text-[#0A3D45]/75">
        Want help getting started? We can walk you through Rowgon — roles,
        folders, tasks, and where people live.
      </p>

      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => chooseTrack("full")}
          className="rowgon-btn-primary w-full justify-center text-left sm:text-center"
        >
          Yes — teach me the full course
        </button>
        <button
          type="button"
          onClick={() => chooseTrack("short")}
          className="rowgon-btn-secondary w-full justify-center"
        >
          I’m too busy to learn right now — give me the short version
        </button>
        <button
          type="button"
          onClick={() => decline("hard")}
          className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#0A3D45]/70 underline-offset-2 hover:bg-[#0A3D45]/6 hover:underline"
        >
          No.
        </button>
        <button
          type="button"
          onClick={() => decline("soft")}
          className="rounded-full px-4 py-2.5 text-sm text-[#0A3D45]/55 underline-offset-2 hover:underline"
        >
          No, I’m all set — I’ve used this before (or I just want to explore)
        </button>
      </div>
    </div>
  );
}
