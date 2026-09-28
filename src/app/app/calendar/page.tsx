import { redirect } from "next/navigation";
import {
  CalendarBoard,
  type CalendarBoardEvent,
} from "@/app/components/calendar-board";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditContent } from "@/lib/permissions";
import { personLabel } from "@/lib/utils";

function birthdayDate(birthday: Date) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), birthday.getUTCMonth(), birthday.getUTCDate(), 12),
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    workspaceId?: string;
    workspaceIds?: string;
    view?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const requestedScope = sp.scope === "workspace" ? "workspace" : "personal";
  const view = sp.view === "list" ? "list" : "month";

  const [memberships, filters] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { workspace: { name: "asc" } },
    }),
    prisma.calendarWorkspaceFilter.findMany({
      where: { userId: user.id },
    }),
  ]);

  const membershipIds = new Set(memberships.map((m) => m.workspaceId));
  const fromCsv = String(sp.workspaceIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const requestedIds = [...fromCsv, ...(sp.workspaceId ? [sp.workspaceId] : [])].filter(
    (id, index, arr) => membershipIds.has(id) && arr.indexOf(id) === index,
  );
  const selectedWorkspaceIds =
    requestedIds.length > 0
      ? requestedIds
      : memberships[0]
        ? [memberships[0].workspaceId]
        : [];
  const scope =
    requestedScope === "workspace" && selectedWorkspaceIds.length > 0
      ? "workspace"
      : "personal";
  const workspaceId = scope === "workspace" ? selectedWorkspaceIds[0] ?? null : null;
  const filterByWorkspace = new Map(
    filters.map((filter) => [filter.workspaceId, filter.enabled]),
  );
  const enabledWorkspaceIds = memberships
    .filter((membership) => filterByWorkspace.get(membership.workspaceId) !== false)
    .map((membership) => membership.workspaceId);

  const birthdayWorkspaceIds =
    scope === "workspace" && selectedWorkspaceIds.length > 0
      ? selectedWorkspaceIds
      : enabledWorkspaceIds;

  const taskEventQuery =
    scope === "personal" && enabledWorkspaceIds.length > 0
      ? {
          userId: user.id,
          task: { workspaceId: { in: enabledWorkspaceIds } },
        }
      : scope === "workspace" && selectedWorkspaceIds.length > 0
        ? {
            task: { workspaceId: { in: selectedWorkspaceIds } },
          }
        : null;

  const [
    personalEvents,
    hiddenPersonalEvents,
    workspaceEvents,
    taskEvents,
    birthdayShares,
    birthdays,
  ] = await Promise.all([
    scope === "personal"
      ? prisma.personalCalendarEvent.findMany({
          where: { userId: user.id, hidden: false },
          orderBy: { date: "asc" },
        })
      : [],
    scope === "personal"
      ? prisma.personalCalendarEvent.findMany({
          where: { userId: user.id, hidden: true },
          orderBy: { date: "asc" },
        })
      : [],
    scope === "workspace" && selectedWorkspaceIds.length > 0
      ? prisma.workspaceCalendarEvent.findMany({
          where: { workspaceId: { in: selectedWorkspaceIds } },
          include: { createdBy: true, workspace: true },
          orderBy: { date: "asc" },
        })
      : [],
    taskEventQuery
      ? prisma.calendarEvent.findMany({
          where: taskEventQuery,
          include: {
            task: {
              include: {
                workspace: true,
                folder: true,
                assignee: true,
              },
            },
          },
          orderBy: { dueDate: "asc" },
        })
      : [],
    scope === "personal" && user.showBirthdaysOnCalendar
      ? prisma.birthdayShare.findMany({
          where: { viewerId: user.id, status: "ACTIVE" },
          include: { owner: true },
        })
      : [],
    (scope === "workspace" || user.showBirthdaysOnCalendar) &&
    birthdayWorkspaceIds.length > 0
      ? prisma.workspaceBirthdayRequest.findMany({
          where: {
            workspaceId: { in: birthdayWorkspaceIds },
            status: "ACTIVE",
          },
          include: { subject: true, workspace: true },
        })
      : [],
  ]);

  function mapPersonalEvent(
    event: (typeof personalEvents)[number],
  ): CalendarBoardEvent {
    return {
      id: `personal:${event.id}`,
      recordId: event.id,
      kind: "personal",
      title: event.title,
      description: event.description,
      date: event.date.toISOString(),
      allDay: event.allDay,
      startAt: event.startAt?.toISOString() ?? null,
      endAt: event.endAt?.toISOString() ?? null,
      sourceLabel: "Personal event",
      canMove: true,
    };
  }

  const events: CalendarBoardEvent[] = [
    ...personalEvents.map(mapPersonalEvent),
    ...workspaceEvents.map((event) => {
      const membership = memberships.find(
        (m) => m.workspaceId === event.workspaceId,
      );
      const canEditWs = membership ? canEditContent(membership.role) : false;
      return {
        id: `workspace:${event.id}`,
        recordId: event.id,
        kind: "workspace" as const,
        title: event.title,
        description: event.description,
        date: event.date.toISOString(),
        allDay: event.allDay,
        startAt: event.startAt?.toISOString() ?? null,
        endAt: event.endAt?.toISOString() ?? null,
        sourceLabel: `${event.workspace?.name ?? "Workspace"} · added by ${personLabel(event.createdBy)}`,
        canMove: canEditWs,
      };
    }),
    ...taskEvents.map((event) => {
      const membership = memberships.find(
        (m) => m.workspaceId === event.task.workspaceId,
      );
      const canEditWs = membership ? canEditContent(membership.role) : false;
      const isAssignee = event.task.assigneeId === user.id;
      return {
        id: `task:${event.id}`,
        recordId: event.id,
        kind: "task" as const,
        title: event.title,
        description: event.task.description,
        date: event.dueDate.toISOString(),
        allDay: true,
        startAt: null,
        endAt: null,
        sourceLabel: event.task.assignee
          ? `${event.task.workspace.name} · ${event.task.folder.name} · ${personLabel(event.task.assignee)}`
          : `${event.task.workspace.name} · ${event.task.folder.name}`,
        href: `/app/w/${event.task.workspaceId}?folder=${event.task.folderId}`,
        canMove: isAssignee || canEditWs,
      };
    }),
  ];

  const birthdayEvents = new Map<string, CalendarBoardEvent>();
  for (const share of birthdayShares) {
    if (!share.owner.birthday) continue;
    birthdayEvents.set(share.ownerId, {
      id: `birthday:${share.ownerId}`,
      recordId: share.id,
      kind: "birthday",
      title: `${personLabel(share.owner)}’s birthday`,
      description: "Shared with you",
      date: birthdayDate(share.owner.birthday).toISOString(),
      allDay: true,
      startAt: null,
      endAt: null,
      sourceLabel: "Friend birthday",
    });
  }
  for (const birthday of birthdays) {
    if (!birthday.subject.birthday) continue;
    const existing = birthdayEvents.get(birthday.subjectId);
    birthdayEvents.set(birthday.subjectId, {
      id: existing?.id ?? `birthday:${birthday.subjectId}`,
      recordId: birthday.id,
      kind: "birthday",
      title: `${personLabel(birthday.subject)}’s birthday`,
      description: "Approved workspace birthday",
      date: birthdayDate(birthday.subject.birthday).toISOString(),
      allDay: true,
      startAt: null,
      endAt: null,
      sourceLabel: existing
        ? `${existing.sourceLabel} · ${birthday.workspace.name}`
        : birthday.workspace.name,
    });
  }
  events.push(...birthdayEvents.values());
  events.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <CalendarBoard
      key={`${scope}:${selectedWorkspaceIds.join(",") || "personal"}:${view}`}
      events={events}
      hiddenEvents={hiddenPersonalEvents.map(mapPersonalEvent)}
      initialScope={scope}
      initialView={view}
      selectedWorkspaceId={workspaceId}
      selectedWorkspaceIds={selectedWorkspaceIds}
      showBirthdays={user.showBirthdaysOnCalendar}
      workspaces={memberships.map((membership) => ({
        id: membership.workspaceId,
        name: membership.workspace.name,
        role: membership.role,
        canEdit: canEditContent(membership.role),
        filterEnabled: filterByWorkspace.get(membership.workspaceId) !== false,
      }))}
    />
  );
}
