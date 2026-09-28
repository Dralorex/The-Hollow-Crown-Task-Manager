"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineActionForm } from "@/app/components/forms";
import { DueDateField } from "@/app/components/due-date-field";
import { OnboardingPrompt } from "@/app/components/onboarding-prompt";
import { TagSuggestInput } from "@/app/components/tag-suggest-input";
import { useWorkspaceOnboarding } from "@/app/components/workspace-onboarding-context";
import { createTaskAction } from "@/app/actions/tasks";
import {
  clickOnboardingStep,
  focusOnboardingStep,
} from "@/lib/onboarding-targets";
import { PRIORITY_LABELS, TASK_PRIORITIES } from "@/lib/urgency";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

type Assignable = { id: string; username: string };

function blinkClass(on: boolean) {
  return on
    ? "animate-rowgon-blink-empty ring-2 ring-inset ring-[#3b82f6]/55"
    : "";
}

/**
 * Create-task form with optional guided onboarding blinks + coach prompts.
 */
export function GuidedCreateTaskForm({
  workspaceId,
  folderId,
  publicTagOptions,
  assignableMembers,
}: {
  workspaceId: string;
  folderId: string;
  publicTagOptions: string[];
  assignableMembers: Assignable[];
}) {
  const { active, step, setStep, blink, track } = useWorkspaceOnboarding();
  const [taskName, setTaskName] = useState("");
  const [nameClicked, setNameClicked] = useState(false);
  const [description, setDescription] = useState("");
  const [descClicked, setDescClicked] = useState(false);
  /** After Continue on “Add your task”, hide tip until they submit. */
  const [submitTipPaused, setSubmitTipPaused] = useState(false);
  const [priority, setPriority] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [spawnMode, setSpawnMode] = useState("complete");
  const [nextAssignee, setNextAssignee] = useState("pool");
  const [formEpoch, setFormEpoch] = useState(0);
  const [cadence, setCadence] = useState<"" | "daily" | "weekly" | "monthly">(
    "",
  );
  const [weekDays, setWeekDays] = useState<number[]>([]);
  const [monthDays, setMonthDays] = useState<number[]>([]);
  const monthGrid = useMemo(
    () => Array.from({ length: 31 }, (_, i) => i + 1),
    [],
  );

  const resetForm = useCallback(() => {
    setTaskName("");
    setNameClicked(false);
    setDescription("");
    setDescClicked(false);
    setPriority("");
    setAssignTo("");
    setSpawnMode("complete");
    setNextAssignee("pool");
    setCadence("");
    setWeekDays([]);
    setMonthDays([]);
    setFormEpoch((n) => n + 1);
  }, []);

  /** Normalize vestigial chip/gate steps onto their info prompts. */
  useEffect(() => {
    if (!active) return;

    if (step === "tags") {
      setStep("tags-info");
      return;
    }
    if (step === "one-off") {
      setCadence("");
      setStep("one-off-info");
      return;
    }
    if (step === "daily") {
      setCadence("daily");
      setWeekDays([0, 1, 2, 3, 4, 5, 6]);
      setStep("daily-info");
      return;
    }
    if (step === "weekly") {
      setCadence("weekly");
      setStep("weekly-info");
      return;
    }
    if (step === "monthly") {
      setCadence("monthly");
      setStep("monthly-info");
      return;
    }

    if (step === "one-off-info") setCadence("");
    if (step === "daily-info") {
      setCadence("daily");
      setWeekDays((prev) => (prev.length ? prev : [0, 1, 2, 3, 4, 5, 6]));
    }
    if (step === "weekly-info") setCadence("weekly");
    if (step === "monthly-info") setCadence("monthly");
  }, [active, step, setStep]);

  function toggleWeek(day: number) {
    setWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  function toggleMonth(day: number) {
    setMonthDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  function pickCadence(value: "" | "daily" | "weekly" | "monthly") {
    setCadence(value);
    if (value === "daily") setWeekDays([0, 1, 2, 3, 4, 5, 6]);
    if (!active) return;
    // Manual chip tap can still skip ahead during the tour
    if (value === "" && step === "one-off-info") setStep("daily-info");
    if (value === "daily" && step === "daily-info") setStep("weekly-info");
    if (value === "weekly" && step === "weekly-info") setStep("monthly-info");
    if (value === "monthly" && step === "monthly-info") finishCadenceTour();
  }

  function finishCadenceTour() {
    setCadence("");
    setWeekDays([]);
    setMonthDays([]);
    setStep("submit");
  }

  useEffect(() => {
    if (step !== "submit") setSubmitTipPaused(false);
  }, [step]);

  const showNameBlink = blink("task-name") && !nameClicked;
  const showDescBlink = blink("description") && !descClicked;

  return (
    <div className="space-y-3">
      <InlineActionForm
        className="grid min-w-0 gap-2 sm:grid-cols-2"
        action={createTaskAction}
        submitLabel="Add Task"
        submitClassName={blinkClass(blink("submit"))}
        onSuccess={resetForm}
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="folderId" value={folderId} />
        <input
          type="text"
          inputMode="text"
          enterKeyHint="next"
          autoCapitalize="sentences"
          name="name"
          data-onboarding="task-name"
          required
          placeholder="Task Name"
          className={`rowgon-input ${blinkClass(showNameBlink)}`}
          value={taskName}
          onFocus={() => setNameClicked(true)}
          onClick={() => setNameClicked(true)}
          onChange={(e) => {
            const v = e.target.value;
            setTaskName(v);
            if (active && step === "task-name" && v.trim().length > 0) {
              setStep(track === "short" ? "submit" : "priority");
            }
          }}
        />

        <select
          name="priority"
          required
          value={priority}
          aria-label="Priority Level"
          className={`rowgon-input ${!priority ? "rowgon-input-hint" : ""} ${blinkClass(blink("priority"))}`}
          onChange={(e) => {
            setPriority(e.target.value);
            if (active && step === "priority" && e.target.value) {
              setStep("description");
            }
          }}
        >
          <option value="" disabled>
            Priority Level
          </option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>

        <input
          type="text"
          inputMode="text"
          enterKeyHint="next"
          autoCapitalize="sentences"
          name="description"
          data-onboarding="description"
          placeholder="Description"
          className={`rowgon-input sm:col-span-2 ${blinkClass(showDescBlink)}`}
          value={description}
          onFocus={() => setDescClicked(true)}
          onClick={() => setDescClicked(true)}
          onChange={(e) => {
            const v = e.target.value;
            setDescription(v);
            if (active && step === "description" && v.trim().length > 0) {
              setStep("due-date");
            }
          }}
        />

        <DueDateField
          key={`due-${formEpoch}`}
          name="dueDate"
          className="min-w-0 max-w-full"
          blink={blink("due-date")}
          blinkReset={blink("due-reset")}
          blinkClear={blink("due-clear")}
          onValueChange={(v) => {
            // Only advance after a real date pick — not on focus from “Open Due Date”.
            if (active && step === "due-date" && v) setStep("due-reset");
          }}
          onReset={() => {
            // Clicking Reset shows what it does; Next advances to Clear.
            if (
              active &&
              (step === "due-reset" ||
                step === "due-date" ||
                step === "due-reset-info")
            ) {
              setStep("due-reset-info");
            }
          }}
          onClear={() => {
            if (
              active &&
              (step === "due-clear" ||
                step === "due-reset" ||
                step === "due-reset-info" ||
                step === "due-date")
            ) {
              setStep("claim-pool");
            }
          }}
        />

        <select
          name="assignTo"
          aria-label="Manual Assign (optional)"
          className={`rowgon-input ${!assignTo ? "rowgon-input-hint" : ""} ${blinkClass(blink("claim-pool"))}`}
          value={assignTo}
          onChange={(e) => {
            setAssignTo(e.target.value);
            if (active && step === "claim-pool") setStep("claim-pool-info");
          }}
        >
          <option value="">Manual Assign (optional)</option>
          {assignableMembers.map((m) => (
            <option key={m.id} value={m.id}>
              Assign @{m.username}
            </option>
          ))}
        </select>

        <div className="sm:col-span-2">
          <TagSuggestInput
            key={`tags-${formEpoch}`}
            name="tags"
            tags={publicTagOptions}
            placeholder="add tags: example, test, help"
            hint={
              active
                ? undefined
                : "Optional. Type a tag and pick a suggestion, or leave the field to add it as a chip."
            }
            emptyMessage="No public tags in this folder yet — type a new one"
            allowMultiple
            keepOpenOnPick
            commitTagOnEnter
            dataOnboarding="tags"
            inputClassName={`rowgon-input text-sm ${blinkClass(blink("tags"))}`}
            onCommittedTagsChange={(list) => {
              if (!active) return;
              if (
                (step === "tags" || step === "tags-info") &&
                list.length > 0
              ) {
                setStep("one-off-info");
              }
            }}
          />
        </div>

        <div className="sm:col-span-2 space-y-3 rounded-xl border border-[#0A3D45]/10 bg-white/40 p-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["", "One-off", "one-off", "cadence-one-off"],
                ["daily", "Daily", "daily", "cadence-daily"],
                ["weekly", "Weekly", "weekly", "cadence-weekly"],
                ["monthly", "Monthly", "monthly", "cadence-monthly"],
              ] as const
            ).map(([value, label, key, dataKey]) => (
              <button
                key={label}
                type="button"
                data-onboarding={dataKey}
                onClick={() => pickCadence(value)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  cadence === value
                    ? "bg-[#0A3D45] text-[#E8F7F6]"
                    : "bg-white/70 text-[#0A3D45]/70"
                } ${blinkClass(blink(key))}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="recurrenceCadence" value={cadence} />
          <input
            type="hidden"
            name="recurrenceWeekDays"
            value={weekDays.join(",")}
          />
          <input
            type="hidden"
            name="recurrenceMonthDays"
            value={monthDays.join(",")}
          />

          {cadence === "weekly" ? (
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
                  onClick={() => setWeekDays([0, 1, 2, 3, 4, 5, 6])}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
                  onClick={() => setWeekDays([])}
                >
                  Remove all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = weekDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleWeek(d.value)}
                      className={`min-h-10 min-w-10 rounded-lg px-2 text-sm font-semibold ${
                        on
                          ? "bg-[#3DBEAB] text-[#0A3D45]"
                          : "bg-white/70 text-[#0A3D45]/65"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {cadence === "monthly" ? (
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
                  onClick={() => setMonthDays(monthGrid)}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-[#1a7a82] underline-offset-2 hover:underline"
                  onClick={() => setMonthDays([])}
                >
                  Remove all
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthGrid.map((day) => {
                  const on = monthDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleMonth(day)}
                      className={`flex h-9 items-center justify-center rounded-md text-sm font-semibold ${
                        on
                          ? "bg-[#3DBEAB] text-[#0A3D45]"
                          : "bg-white/70 text-[#0A3D45]/65"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {cadence ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[#0A3D45]/70">
                Spawn next
                <select
                  name="recurrenceSpawnMode"
                  value={spawnMode}
                  onChange={(e) => setSpawnMode(e.target.value)}
                  className="rowgon-input mt-1 min-h-11 text-sm"
                >
                  <option value="complete">On complete (approve)</option>
                  <option value="due">On due rollover</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-[#0A3D45]/70">
                Next assignee
                <select
                  name="recurrenceNextAssignee"
                  value={nextAssignee}
                  onChange={(e) => setNextAssignee(e.target.value)}
                  className="rowgon-input mt-1 min-h-11 text-sm"
                >
                  <option value="pool">Manual Assign</option>
                  <option value="same">Same person</option>
                  <option value="clear">Cleared (no assignee)</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </InlineActionForm>

      {active && step === "task-name" ? (
        <OnboardingPrompt
          title="Task title"
          body="Give this task a clear name — you’ll claim and review it from the list."
          actionLabel="Add Title"
          onAction={() => focusOnboardingStep("task-name")}
        />
      ) : null}
      {active && step === "priority" ? (
        <OnboardingPrompt
          title="Priority"
          body="Pick how urgent this task is. Priority drives the urgency chips and sort order."
          actionLabel="Pick Priority"
          onAction={() => focusOnboardingStep("priority")}
        />
      ) : null}
      {active && step === "description" ? (
        <OnboardingPrompt
          title="Description"
          body="Optional. Add a short note so claimants know what “done” looks like."
          actionLabel="Add Description"
          onAction={() => focusOnboardingStep("description")}
          onNext={() => setStep("due-date")}
        />
      ) : null}
      {active && step === "claim-pool" ? (
        <OnboardingPrompt
          title="Manual Assign"
          body="Optional: assign someone now, or leave Manual Assign so anyone can claim the task."
          actionLabel="Open Manual Assign"
          onAction={() => focusOnboardingStep("claim-pool")}
          onNext={() => setStep("claim-pool-info")}
        />
      ) : null}
      {active && step === "claim-pool-info" ? (
        <OnboardingPrompt
          title="What Manual Assign does"
          body="Leave it on Manual Assign (optional) so anyone can claim the task. Pick a person only when you want it assigned up front."
          onNext={() => setStep("tags-info")}
        />
      ) : null}
      {active && step === "due-date" ? (
        <OnboardingPrompt
          title="Due date"
          body="Optional. Open the calendar picker, then we’ll cover Reset and Clear."
          actionLabel="Open Due Date"
          onAction={() => focusOnboardingStep("due-date")}
          onNext={() => setStep("due-reset")}
        />
      ) : null}
      {active && step === "due-reset" ? (
        <OnboardingPrompt
          title="Try Reset"
          body="Reset sets the due date to today. Tap it to see how it works."
          actionLabel="Try Reset"
          onAction={() => clickOnboardingStep("due-reset")}
        />
      ) : null}
      {active && step === "due-reset-info" ? (
        <OnboardingPrompt
          title="What Reset does"
          body="Reset sets the due date to today’s date — handy when you want a due date quickly without picking from the calendar."
          onNext={() => setStep("due-clear")}
        />
      ) : null}
      {active && step === "due-clear" ? (
        <OnboardingPrompt
          title="What Clear does"
          body="Clear removes the due date entirely — the task won’t have one."
          actionLabel="Try Clear"
          onAction={() => clickOnboardingStep("due-clear")}
          onNext={() => setStep("claim-pool")}
        />
      ) : null}
      {active && (step === "tags" || step === "tags-info") ? (
        <OnboardingPrompt
          title="Tags"
          body="Type a tag and pick a suggestion (or finish typing and leave the field) to add a chip. The tip moves on once a tag is added. Later, use the Tag filter in search to find matching tasks."
          actionLabel="Add Tag"
          onAction={() => {
            focusOnboardingStep("tags");
            if (step === "tags") setStep("tags-info");
          }}
          onNext={() => setStep("one-off-info")}
        />
      ) : null}
      {active && step === "one-off-info" ? (
        <OnboardingPrompt
          title="One-off"
          body="A one-off task happens once — no automatic follow-up when it’s done."
          onNext={() => setStep("daily-info")}
        />
      ) : null}
      {active && step === "daily-info" ? (
        <OnboardingPrompt
          title="Daily"
          body="Daily tasks spawn again on a schedule so recurring work doesn’t fall through the cracks."
          onNext={() => setStep("weekly-info")}
        />
      ) : null}
      {active && step === "weekly-info" ? (
        <OnboardingPrompt
          title="Weekly"
          body="Weekly lets you pick which weekdays the task should repeat on."
          onNext={() => setStep("monthly-info")}
        />
      ) : null}
      {active && step === "monthly-info" ? (
        <OnboardingPrompt
          title="Monthly"
          body="Monthly repeats on chosen days of the month — great for reports and check-ins."
          onNext={finishCadenceTour}
        />
      ) : null}
      {active && step === "submit" && !submitTipPaused ? (
        <OnboardingPrompt
          title="Add your task"
          body="After Continue, use the blinking Add Task button when you’re ready. The tip stays away until your task is created."
          onNext={() => setSubmitTipPaused(true)}
          nextLabel="Continue"
        />
      ) : null}
    </div>
  );
}
