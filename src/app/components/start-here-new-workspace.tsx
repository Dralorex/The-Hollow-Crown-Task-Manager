"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { InlineActionForm } from "@/app/components/forms";
import { StartHereWorkspaceGlow } from "@/app/components/start-here-workspace-glow";
import { createWorkspaceAction } from "@/app/actions/workspaces";

/**
 * Home intro: New Workspace create card + optional Start here coach.
 * Clicking the blue “New Workspace” text blinks the create card; clicking
 * (or focusing) the card stops the blink.
 */
export function StartHereNewWorkspace({
  showStartHere,
  workspaceList,
}: {
  showStartHere: boolean;
  /** Workspace cards / empty archived message when Start here is not shown. */
  workspaceList: ReactNode;
}) {
  const [blinkCreate, setBlinkCreate] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);

  function pointToCreate() {
    setBlinkCreate(true);
    createRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearBlink() {
    if (blinkCreate) setBlinkCreate(false);
  }

  return (
    <>
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="animate-rowgon-rise">
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-[#0A3D45] sm:text-5xl">
            Your workspaces
          </h1>
          <p className="mt-2 max-w-lg text-[#0A3D45]/70">
            Each workspace is its own tide pool — folders, tasks, and people with
            roles.
          </p>
        </div>
        <div
          ref={createRef}
          id="new-workspace"
          className={`rowgon-panel w-full max-w-sm p-5 animate-rowgon-rise-delay ${
            blinkCreate
              ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
              : ""
          }`}
          onClick={clearBlink}
          onFocusCapture={clearBlink}
        >
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[#0A3D45]">
            New Workspace
          </h2>
          <InlineActionForm
            className="mt-3 flex flex-col gap-3"
            action={createWorkspaceAction}
            submitLabel="Create Workspace"
          >
            <input
              name="name"
              required
              placeholder="Studio sprint"
              className="rowgon-input"
            />
          </InlineActionForm>
        </div>
      </div>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showStartHere ? (
          <StartHereWorkspaceGlow
            active
            className="sm:col-span-2 lg:col-span-3 max-w-xl"
          >
            <div className="rowgon-panel w-full p-6 animate-rowgon-rise">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
                Start here
              </h2>
              <p className="mt-2 text-[#0A3D45]/75">
                Create a workspace to hold folders and claimable tasks.
              </p>
              <p className="mt-4 text-sm text-[#0A3D45]/60">
                Waiting on an invite? You’ll see it under{" "}
                <Link
                  href="/app/notifications"
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  Alerts
                </Link>
                .
              </p>
              <p className="mt-5 text-sm font-medium text-[#0A3D45]">
                Use{" "}
                <button
                  type="button"
                  onClick={pointToCreate}
                  className="font-semibold text-[#3b82f6] underline-offset-2 hover:underline"
                >
                  New Workspace
                </button>{" "}
                above to create one.
              </p>
            </div>
          </StartHereWorkspaceGlow>
        ) : (
          workspaceList
        )}
      </section>
    </>
  );
}
