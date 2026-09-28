"use client";

import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ActionResult } from "@/app/actions/auth";
import {
  createPersonalEventAction,
  createWorkspaceEventAction,
  deletePersonalEventAction,
  deleteWorkspaceEventAction,
  hidePersonalEventAction,
  setCalendarWorkspaceFilterAction,
  moveCalendarItemAction,
  setShowBirthdaysAction,
  updatePersonalEventAction,
  updateWorkspaceEventAction,
} from "@/app/actions/calendar";

type Scope = "personal" | "workspace";
type View = "list" | "month";
type EventAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export type CalendarBoardEvent = {
  id: string;
  recordId: string;
  kind: "personal" | "workspace" | "task" | "birthday";
  title: string;
  description: string;
  date: string;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  sourceLabel: string;
  href?: string;
  canMove?: boolean;
};

type CalendarWorkspace = {
  id: string;
  name: string;
  role: string;
  canEdit: boolean;
  filterEnabled: boolean;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="tide-btn-secondary text-sm disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

function EventForm({
  action,
  event,
  workspaceId,
  defaultDate,
  onSaved,
}: {
  action: EventAction;
  event?: CalendarBoardEvent;
  workspaceId?: string | null;
  defaultDate?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [state, formAction] = useActionState(
    async (previous: ActionResult | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) {
        if (!event) {
          formRef.current?.reset();
          setAllDay(true);
        }
        onSaved?.();
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 sm:grid-cols-2">
      {event ? <input type="hidden" name="eventId" value={event.recordId} /> : null}
      {workspaceId ? (
        <input type="hidden" name="workspaceId" value={workspaceId} />
      ) : null}
      <label className="text-sm font-medium text-[#0A3D45] sm:col-span-2">
        Title
        <input
          name="title"
          required
          defaultValue={event?.title}
          className="tide-input mt-1"
          placeholder="Event title"
        />
      </label>
      <label className="text-sm font-medium text-[#0A3D45] sm:col-span-2">
        Description
        <textarea
          name="description"
          defaultValue={event?.description}
          className="tide-input mt-1 min-h-24"
          placeholder="Notes or details"
        />
      </label>
      <label className="text-sm font-medium text-[#0A3D45]">
        Date
        <input
          name="date"
          type="date"
          required
          defaultValue={
            event ? format(parseISO(event.date), "yyyy-MM-dd") : defaultDate
          }
          className="tide-input mt-1"
        />
      </label>
      <label className="flex items-center gap-2 self-end pb-3 text-sm text-[#0A3D45]">
        <input
          name="allDay"
          type="checkbox"
          value="true"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        All-day event
      </label>
      {!allDay ? (
        <>
          <label className="text-sm font-medium text-[#0A3D45]">
            Starts
            <input
              name="startTime"
              type="time"
              required
              defaultValue={
                event?.startAt ? format(parseISO(event.startAt), "HH:mm") : ""
              }
              className="tide-input mt-1"
            />
          </label>
          <label className="text-sm font-medium text-[#0A3D45]">
            Ends
            <input
              name="endTime"
              type="time"
              required
              defaultValue={
                event?.endAt ? format(parseISO(event.endAt), "HH:mm") : ""
              }
              className="tide-input mt-1"
            />
          </label>
        </>
      ) : null}
      {state && !state.ok ? (
        <p className="text-sm text-[#9b2f22] sm:col-span-2">{state.error}</p>
      ) : null}
      <div className="sm:col-span-2">
        <SubmitButton label={event ? "Save changes" : "Add event"} />
      </div>
    </form>
  );
}

function QuickActionForm({
  action,
  eventId,
  label,
  hidden,
  danger,
}: {
  action: EventAction;
  eventId: string;
  label: string;
  hidden?: boolean;
  danger?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (previous: ActionResult | null, formData: FormData) => {
      const result = await action(previous, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="eventId" value={eventId} />
      {hidden !== undefined ? (
        <input type="hidden" name="hidden" value={String(hidden)} />
      ) : null}
      <button
        type="submit"
        className={
          danger
            ? "text-sm font-semibold text-[#9b2f22]"
            : "text-sm font-semibold text-[#0A3D45]/70"
        }
      >
        {label}
      </button>
      {state && !state.ok ? (
        <p className="mt-1 text-xs text-[#9b2f22]">{state.error}</p>
      ) : null}
    </form>
  );
}

function HiddenEventsPanel({ events }: { events: CalendarBoardEvent[] }) {
  return (
    <details className="relative">
      <summary className="tide-btn-secondary cursor-pointer list-none text-sm">
        Hidden events{events.length > 0 ? ` (${events.length})` : ""}
      </summary>
      <div className="tide-panel absolute right-0 z-20 mt-2 w-80 space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/60">
          Unhide personal events
        </p>
        {events.length > 0 ? (
          <ul className="max-h-72 space-y-3 overflow-y-auto">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start justify-between gap-3 border-b border-[#0A3D45]/10 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0A3D45]">
                    {event.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[#0A3D45]/55">
                    {eventWhen(event)}
                  </p>
                </div>
                <QuickActionForm
                  action={hidePersonalEventAction}
                  eventId={event.recordId}
                  label="Unhide"
                  hidden={false}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#0A3D45]/55">No hidden events.</p>
        )}
      </div>
    </details>
  );
}

function PersonalFilters({
  workspaces,
  showBirthdays,
}: {
  workspaces: CalendarWorkspace[];
  showBirthdays: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [workspaceValues, setWorkspaceValues] = useState(
    Object.fromEntries(
      workspaces.map((workspace) => [workspace.id, workspace.filterEnabled]),
    ),
  );
  const [birthdayValue, setBirthdayValue] = useState(showBirthdays);
  const [error, setError] = useState<string | null>(null);

  function updateWorkspace(workspaceId: string, enabled: boolean) {
    setWorkspaceValues((current) => ({ ...current, [workspaceId]: enabled }));
    setError(null);
    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("enabled", String(enabled));
    startTransition(() => {
      void setCalendarWorkspaceFilterAction(null, formData).then((result) => {
        if (!result.ok) setError(result.error);
        router.refresh();
      });
    });
  }

  function updateBirthdays(show: boolean) {
    setBirthdayValue(show);
    setError(null);
    const formData = new FormData();
    formData.set("show", String(show));
    startTransition(() => {
      void setShowBirthdaysAction(null, formData).then((result) => {
        if (!result.ok) setError(result.error);
        router.refresh();
      });
    });
  }

  return (
    <details className="relative">
      <summary className="tide-btn-secondary cursor-pointer list-none text-sm">
        Filters
      </summary>
      <div className="tide-panel absolute right-0 z-20 mt-2 w-72 space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/60">
          Claimed tasks
        </p>
        {workspaces.length > 0 ? (
          workspaces.map((workspace) => (
            <label
              key={workspace.id}
              className="flex items-center gap-2 text-sm text-[#0A3D45]"
            >
              <input
                type="checkbox"
                checked={workspaceValues[workspace.id] ?? true}
                disabled={pending}
                onChange={(e) => updateWorkspace(workspace.id, e.target.checked)}
              />
              <span className="truncate">{workspace.name}</span>
            </label>
          ))
        ) : (
          <p className="text-xs text-[#0A3D45]/55">No workspaces yet.</p>
        )}
        <div className="border-t border-[#0A3D45]/10 pt-3">
          <label className="flex items-center gap-2 text-sm text-[#0A3D45]">
            <input
              type="checkbox"
              checked={birthdayValue}
              disabled={pending}
              onChange={(e) => updateBirthdays(e.target.checked)}
            />
            Show birthdays
          </label>
        </div>
        {error ? <p className="text-xs text-[#9b2f22]">{error}</p> : null}
      </div>
    </details>
  );
}

function eventDateKey(event: CalendarBoardEvent) {
  return format(parseISO(event.date), "yyyy-MM-dd");
}

function eventWhen(event: CalendarBoardEvent) {
  const day = format(parseISO(event.date), "EEE, MMM d yyyy");
  if (event.allDay || !event.startAt || !event.endAt) return `${day} · All day`;
  return `${day} · ${format(parseISO(event.startAt), "HH:mm")}–${format(
    parseISO(event.endAt),
    "HH:mm",
  )}`;
}

function EventRow({
  event,
  expanded,
  focused,
  canEditWorkspace,
  onToggle,
}: {
  event: CalendarBoardEvent;
  expanded: boolean;
  focused: boolean;
  canEditWorkspace: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const canEdit =
    event.kind === "personal" ||
    (event.kind === "workspace" && canEditWorkspace);

  return (
    <li
      id={`calendar-event-${event.id}`}
      className={`tide-panel calendar-event-row overflow-hidden transition ${
        focused ? "ring-2 ring-[#3DBEAB]/60" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
        aria-expanded={expanded}
      >
        <span
          className={`text-sm text-[#0A3D45]/55 transition ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-[#0A3D45]">
            {event.title}
          </span>
          <span className="block text-sm text-[#0A3D45]/60">
            {eventWhen(event)}
          </span>
        </span>
        <span className="hidden rounded-md bg-[#0A3D45]/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#0A3D45]/65 sm:inline">
          {event.kind}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-[#0A3D45]/10 px-4 py-4 pl-11">
          {editing && canEdit ? (
            <EventForm
              action={
                event.kind === "personal"
                  ? updatePersonalEventAction
                  : updateWorkspaceEventAction
              }
              event={event}
              onSaved={() => setEditing(false)}
            />
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0A3D45]/50">
                {event.sourceLabel}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#0A3D45]/75">
                {event.description || "No additional details."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {event.href ? (
                  <Link href={event.href} className="tide-btn-secondary text-sm">
                    Open task
                  </Link>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-sm font-semibold text-[#0A3D45]"
                  >
                    Edit
                  </button>
                ) : null}
                {event.kind === "personal" ? (
                  <QuickActionForm
                    action={hidePersonalEventAction}
                    eventId={event.recordId}
                    label="Hide"
                    hidden
                  />
                ) : null}
                {event.kind === "personal" ? (
                  <QuickActionForm
                    action={deletePersonalEventAction}
                    eventId={event.recordId}
                    label="Delete"
                    danger
                  />
                ) : null}
                {event.kind === "workspace" && canEditWorkspace ? (
                  <QuickActionForm
                    action={deleteWorkspaceEventAction}
                    eventId={event.recordId}
                    label="Delete"
                    danger
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

const CALENDAR_PREFS_KEY = "rowgon.calendar.prefs";

type CalendarPrefs = {
  scope?: Scope;
  view?: View;
  workspaceIds?: string[];
};

function readCalendarPrefs(): CalendarPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CALENDAR_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CalendarPrefs;
  } catch {
    return {};
  }
}

function writeCalendarPrefs(prefs: CalendarPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CALENDAR_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

export function CalendarBoard({
  events,
  hiddenEvents = [],
  initialScope,
  initialView,
  selectedWorkspaceId,
  selectedWorkspaceIds,
  showBirthdays,
  workspaces,
}: {
  events: CalendarBoardEvent[];
  hiddenEvents?: CalendarBoardEvent[];
  initialScope: Scope;
  initialView: View;
  selectedWorkspaceId: string | null;
  selectedWorkspaceIds?: string[];
  showBirthdays: boolean;
  workspaces: CalendarWorkspace[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeView: View =
    searchParams.get("view") === "list"
      ? "list"
      : searchParams.get("view") === "month"
        ? "month"
        : initialView;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [localEvents, setLocalEvents] = useState(events);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [dndPending, startDndTransition] = useTransition();

  const eventsKey = events.map((e) => `${e.id}:${e.date}`).join("|");
  useEffect(() => {
    setLocalEvents(events);
  }, [events, eventsKey]);
  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === selectedWorkspaceId,
  );
  const canAdd =
    initialScope === "personal" ||
    (initialScope === "workspace" && Boolean(selectedWorkspace?.canEdit));

  useEffect(() => {
    if (!expandedId) return;
    document
      .getElementById(`calendar-event-${expandedId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [expandedId, activeView]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarBoardEvent[]>();
    for (const event of localEvents) {
      const key = eventDateKey(event);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [localEvents]);

  function moveEvent(eventId: string, toDay: string) {
    const event = localEvents.find((e) => e.id === eventId);
    if (!event || !event.canMove) return;
    if (event.kind === "birthday") return;
    const fromDay = eventDateKey(event);
    if (fromDay === toDay) return;

    const prev = localEvents;
    const nextDate = new Date(`${toDay}T12:00:00`).toISOString();
    setDragError(null);
    setLocalEvents((list) =>
      list.map((e) => (e.id === eventId ? { ...e, date: nextDate } : e)),
    );

    startDndTransition(async () => {
      const result = await moveCalendarItemAction(
        event.kind as "personal" | "task" | "workspace",
        event.recordId,
        toDay,
      );
      if (!result.ok) {
        setLocalEvents(prev);
        setDragError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const monthDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month],
  );

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const initialIds =
    selectedWorkspaceIds && selectedWorkspaceIds.length > 0
      ? selectedWorkspaceIds
      : selectedWorkspaceId
        ? [selectedWorkspaceId]
        : workspaces[0]
          ? [workspaces[0].id]
          : [];
  const [checkedWorkspaceIds, setCheckedWorkspaceIds] = useState<string[]>(initialIds);
  const prefsRestored = useRef(false);

  useEffect(() => {
    if (prefsRestored.current) return;
    prefsRestored.current = true;
    const prefs = readCalendarPrefs();
    const hasView = searchParams.has("view");
    const hasScope = searchParams.has("scope");
    const hasIds =
      searchParams.has("workspaceIds") || searchParams.has("workspaceId");
    const next = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (!hasView) {
      next.set("view", prefs.view === "list" ? "list" : "month");
      changed = true;
    }
    if (!hasScope && prefs.scope) {
      next.set("scope", prefs.scope);
      changed = true;
    }
    if (!hasIds && prefs.workspaceIds && prefs.workspaceIds.length > 0) {
      const allowed = prefs.workspaceIds.filter((id) =>
        workspaces.some((workspace) => workspace.id === id),
      );
      if (allowed.length > 0) {
        next.set("workspaceIds", allowed.join(","));
        next.delete("workspaceId");
        changed = true;
      }
    }
    if (changed) {
      router.replace(`${pathname}?${next.toString()}`);
    }
  }, [pathname, router, searchParams, workspaces]);

  useEffect(() => {
    setCheckedWorkspaceIds(initialIds);
  }, [initialIds.join(",")]);

  function persistPrefs(partial: CalendarPrefs) {
    const current = readCalendarPrefs();
    writeCalendarPrefs({ ...current, ...partial });
  }

  function updateUrl(
    values: Partial<{
      scope: Scope;
      view: View;
      workspaceId: string;
      workspaceIds: string[];
    }>,
  ) {
    const next = new URLSearchParams(searchParams.toString());
    if (values.scope) {
      next.set("scope", values.scope);
      if (values.scope === "personal") {
        next.delete("workspaceId");
        next.delete("workspaceIds");
      }
    }
    if (values.view) next.set("view", values.view);
    if (values.workspaceIds) {
      next.set("scope", "workspace");
      next.delete("workspaceId");
      if (values.workspaceIds.length > 0) {
        next.set("workspaceIds", values.workspaceIds.join(","));
      } else {
        next.delete("workspaceIds");
      }
    } else if (values.workspaceId) {
      next.set("scope", "workspace");
      next.set("workspaceIds", values.workspaceId);
      next.delete("workspaceId");
    }
    persistPrefs({
      scope: (values.scope as Scope | undefined) ?? (next.get("scope") as Scope | null) ?? initialScope,
      view: (values.view as View | undefined) ?? (next.get("view") as View | null) ?? initialView,
      workspaceIds: values.workspaceIds
        ?? (next.get("workspaceIds")?.split(",").filter(Boolean) ?? undefined),
    });
    router.push(`${pathname}?${next.toString()}`);
  }

  function chooseView(view: View) {
    updateUrl({ view });
  }

  function applyWorkspaceSelection(ids: string[]) {
    const unique = [...new Set(ids)].filter((id) =>
      workspaces.some((workspace) => workspace.id === id),
    );
    setCheckedWorkspaceIds(unique);
    updateUrl({ workspaceIds: unique });
  }

  function focusDay(dayKey: string, dayEvents: CalendarBoardEvent[]) {
    setFocusedDate(dayKey);
    setExpandedId(dayEvents[0]?.id ?? null);
    updateUrl({ view: "list" });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-[#0A3D45]">
            Calendar
          </h1>
          <p className="mt-2 text-[#0A3D45]/70">
            Keep claimed work, plans, and shared birthdays on one tide chart.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-[#0A3D45]/15 bg-white/50 p-1">
            {(["list", "month"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => chooseView(view)}
                className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
                  activeView === view
                    ? "bg-[#0A3D45] text-white"
                    : "text-[#0A3D45]/70"
                }`}
              >
                {view}
              </button>
            ))}
          </div>
          {initialScope === "personal" ? (
            <>
              <HiddenEventsPanel events={hiddenEvents} />
              <PersonalFilters
                key={`${showBirthdays}:${workspaces
                  .map((workspace) => `${workspace.id}:${workspace.filterEnabled}`)
                  .join(",")}`}
                workspaces={workspaces}
                showBirthdays={showBirthdays}
              />
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-[#0A3D45]/15 bg-white/50 p-1">
          <button
            type="button"
            onClick={() => updateUrl({ scope: "personal" })}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              initialScope === "personal"
                ? "bg-[#0A3D45] text-white"
                : "text-[#0A3D45]/70"
            }`}
          >
            Personal
          </button>
          <button
            type="button"
            disabled={workspaces.length === 0}
            onClick={() => {
              const ids =
                checkedWorkspaceIds.length > 0
                  ? checkedWorkspaceIds
                  : workspaces[0]
                    ? [workspaces[0].id]
                    : [];
              if (ids.length > 0) updateUrl({ workspaceIds: ids });
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
              initialScope === "workspace"
                ? "bg-[#0A3D45] text-white"
                : "text-[#0A3D45]/70"
            }`}
          >
            Workspace
          </button>
        </div>
        {initialScope === "workspace" && workspaces.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              className="tide-input max-w-xs text-left text-sm"
              aria-expanded={workspaceMenuOpen}
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
            >
              {checkedWorkspaceIds.length === workspaces.length
                ? "All workspaces"
                : checkedWorkspaceIds.length === 0
                  ? "Select workspaces"
                  : `${checkedWorkspaceIds.length} workspace${checkedWorkspaceIds.length === 1 ? "" : "s"}`}
            </button>
            {workspaceMenuOpen ? (
              <div className="tide-panel absolute left-0 z-30 mt-2 w-72 space-y-2 p-3 shadow-lg">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#0A3D45] underline-offset-2 hover:underline"
                    onClick={() =>
                      applyWorkspaceSelection(workspaces.map((workspace) => workspace.id))
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#0A3D45]/70 underline-offset-2 hover:underline"
                    onClick={() => applyWorkspaceSelection([])}
                  >
                    Unselect all
                  </button>
                </div>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {workspaces.map((workspace) => {
                    const checked = checkedWorkspaceIds.includes(workspace.id);
                    return (
                      <li key={workspace.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-[#0A3D45] hover:bg-[#0A3D45]/5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...checkedWorkspaceIds, workspace.id]
                                : checkedWorkspaceIds.filter((id) => id !== workspace.id);
                              applyWorkspaceSelection(next);
                            }}
                          />
                          <span className="truncate">{workspace.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {canAdd ? (
        <details className="tide-panel mt-6 p-5">
          <summary className="cursor-pointer font-semibold text-[#0A3D45]">
            Add event
          </summary>
          <div className="mt-4 border-t border-[#0A3D45]/10 pt-4">
            <EventForm
              key={`${initialScope}:${selectedWorkspaceId ?? "personal"}`}
              action={
                initialScope === "personal"
                  ? createPersonalEventAction
                  : createWorkspaceEventAction
              }
              workspaceId={selectedWorkspaceId}
              defaultDate={focusedDate ?? format(new Date(), "yyyy-MM-dd")}
            />
          </div>
        </details>
      ) : initialScope === "workspace" ? (
        <p className="mt-6 text-sm text-[#0A3D45]/65">
          Workspace editors and owners can add and change calendar events.
        </p>
      ) : null}

      {activeView === "month" ? (
        <section className="tide-panel mt-8 overflow-hidden p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMonth((current) => subMonths(current, 1))}
              className="tide-btn-secondary text-sm"
              aria-label="Previous month"
            >
              ←
            </button>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
              {format(month, "MMMM yyyy")}
            </h2>
            <button
              type="button"
              onClick={() => setMonth((current) => addMonths(current, 1))}
              className="tide-btn-secondary text-sm"
              aria-label="Next month"
            >
              →
            </button>
          </div>
          <p className="mb-3 text-xs text-[#0A3D45]/55">
            Drag personal, task, or workspace items onto another day
            {dndPending ? " · Saving…" : ""}.
          </p>
          {dragError ? (
            <p className="mb-3 text-xs text-[#9b2f22]">{dragError}</p>
          ) : null}
          <div className="grid grid-cols-7 border-l border-t border-[#0A3D45]/10">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="border-b border-r border-[#0A3D45]/10 p-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[#0A3D45]/55"
              >
                {day}
              </div>
            ))}
            {monthDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const isOver = dragOverDay === key;
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => focusDay(key, dayEvents)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      focusDay(key, dayEvents);
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverDay(key);
                  }}
                  onDragLeave={() => {
                    setDragOverDay((cur) => (cur === key ? null : cur));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverDay(null);
                    const eventId = e.dataTransfer.getData("text/calendar-event");
                    if (eventId) moveEvent(eventId, key);
                  }}
                  className={`min-h-24 cursor-pointer border-b border-r border-[#0A3D45]/10 p-2 text-left align-top transition hover:bg-[#3DBEAB]/10 ${
                    isOver ? "bg-[#3DBEAB]/20 ring-1 ring-[#1a7a82]/40" : ""
                  } ${
                    isSameMonth(day, month)
                      ? "calendar-day-cell-current bg-white/25"
                      : "calendar-day-cell-muted bg-[#0A3D45]/[0.025]"
                  }`}
                >
                  <span
                    className={`text-xs font-semibold ${
                      isSameMonth(day, month)
                        ? "text-[#0A3D45]"
                        : "text-[#0A3D45]/35"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  <span className="mt-1 block space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        draggable={Boolean(event.canMove)}
                        onDragStart={(e) => {
                          if (!event.canMove) return;
                          e.stopPropagation();
                          e.dataTransfer.setData("text/calendar-event", event.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className={`calendar-event-chip block truncate rounded bg-[#0A3D45]/10 px-1.5 py-1 text-[10px] font-medium text-[#0A3D45] ${
                          event.canMove
                            ? "cursor-grab active:cursor-grabbing"
                            : ""
                        }`}
                        title={
                          event.canMove ? `${event.title} · drag to move` : event.title
                        }
                      >
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 ? (
                      <span className="block text-[10px] text-[#0A3D45]/55">
                        +{dayEvents.length - 3} more
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#0A3D45]">
            {focusedDate
              ? format(parseISO(focusedDate), "MMMM d, yyyy")
              : initialScope === "personal"
                ? "Your events"
                : selectedWorkspace?.name ?? "Workspace events"}
          </h2>
          <ul className="mt-4 space-y-3">
            {events.length === 0 ? (
              <li className="text-[#0A3D45]/60">Nothing on the tide chart yet.</li>
            ) : (
              events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expandedId === event.id}
                  focused={focusedDate === eventDateKey(event)}
                  canEditWorkspace={Boolean(selectedWorkspace?.canEdit)}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === event.id ? null : event.id,
                    )
                  }
                />
              ))
            )}
          </ul>
        </section>
      )}
    </main>
  );
}
