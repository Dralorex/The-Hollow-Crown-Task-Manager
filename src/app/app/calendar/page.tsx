import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarBoard,
  type CalendarBoardEvent,
} from "@/app/components/calendar-board";
import { canViewArchived, isArchived } from "@/lib/archive";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditContent } from "@/lib/permissions";

function birthdayThisYear(birthday: Date) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), birthday.getUTCMonth(), birthday.getUTCDate(), 12),
  );
}

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [memberships, filters, me] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { workspace: { name: "asc" } },
    }),
    prisma.calendarWorkspaceFilter.findMany({
      where: { userId: user.id },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { birthday: true, showBirthdaysOnCalendar: true },
    }),
  ]);

  const filterMap = new Map(filters.map((f) => [f.workspaceId, f.enabled]));
  const visibleMemberships = memberships.filter((m) =>
    canViewArchived(user.id, m.role, m.workspace),
  );
  const activeMemberships = visibleMemberships.filter(
    (m) => !isArchived(m.workspace),
  );
  const enabledWorkspaceIds = activeMemberships
    .filter((m) => filterMap.get(m.workspaceId) !== false)
    .map((m) => m.workspaceId);
  const allWorkspaceIds = activeMemberships.map((m) => m.workspaceId);

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: user.id }, { addresseeId: user.id }],
    },
    include: {
      requester: { select: { id: true, username: true, birthday: true } },
      addressee: { select: { id: true, username: true, birthday: true } },
    },
  });

  const friends = friendships.map((f) =>
    f.requesterId === user.id ? f.addressee : f.requester,
  );

  const [personalEvents, workspaceEvents, taskEvents] = await Promise.all([
    prisma.personalCalendarEvent.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
    }),
    allWorkspaceIds.length > 0
      ? prisma.workspaceCalendarEvent.findMany({
          where: { workspaceId: { in: allWorkspaceIds } },
          include: { workspace: true },
          orderBy: { date: "asc" },
        })
      : [],
    enabledWorkspaceIds.length > 0
      ? prisma.calendarEvent.findMany({
          where: {
            userId: user.id,
            task: { workspaceId: { in: enabledWorkspaceIds } },
          },
          include: {
            task: { include: { folder: true, workspace: true } },
          },
          orderBy: { dueDate: "asc" },
        })
      : [],
  ]);

  const events: CalendarBoardEvent[] = [];

  for (const event of personalEvents) {
    events.push({
      id: `personal:${event.id}`,
      recordId: event.id,
      kind: "personal",
      title: event.title,
      description: event.description,
      date: event.date.toISOString(),
      sourceLabel: "Personal",
      canDelete: true,
      canMove: true,
    });
  }

  for (const event of workspaceEvents) {
    const membership = activeMemberships.find(
      (m) => m.workspaceId === event.workspaceId,
    );
    const canEdit = membership ? canEditContent(membership.role) : false;
    events.push({
      id: `workspace:${event.id}`,
      recordId: event.id,
      kind: "workspace",
      title: event.title,
      description: event.description,
      date: event.date.toISOString(),
      sourceLabel: `Workspace · ${event.workspace.name}`,
      href: `/app/w/${event.workspaceId}`,
      canDelete: canEdit,
      canMove: canEdit,
    });
  }

  for (const event of taskEvents) {
    if (isArchived(event.task.folder) || isArchived(event.task.workspace)) {
      continue;
    }
    const membership = activeMemberships.find(
      (m) => m.workspaceId === event.task.workspaceId,
    );
    const canEdit = membership ? canEditContent(membership.role) : false;
    const isAssignee = event.task.assigneeId === user.id;
    events.push({
      id: `task:${event.id}`,
      recordId: event.id,
      kind: "task",
      title: event.title,
      description: "",
      date: event.dueDate.toISOString(),
      sourceLabel: `Task · ${event.task.workspace.name}`,
      href: `/app/w/${event.task.workspaceId}?folder=${event.task.folderId}`,
      canMove: isAssignee || canEdit,
    });
  }

  if (me.showBirthdaysOnCalendar) {
    if (me.birthday) {
      events.push({
        id: `birthday:self`,
        recordId: "self",
        kind: "birthday",
        title: "Your birthday",
        description: "",
        date: birthdayThisYear(me.birthday).toISOString(),
        sourceLabel: "Birthday · you",
      });
    }
    for (const friend of friends) {
      if (!friend.birthday) continue;
      events.push({
        id: `birthday:${friend.id}`,
        recordId: friend.id,
        kind: "birthday",
        title: `@${friend.username}'s birthday`,
        description: "",
        date: birthdayThisYear(friend.birthday).toISOString(),
        sourceLabel: "Birthday · friend",
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const workspaces = activeMemberships.map((m) => ({
    id: m.workspaceId,
    name: m.workspace.name,
    canEdit: canEditContent(m.role),
    filterEnabled: filterMap.get(m.workspaceId) !== false,
  }));

  const birthdayValue = me.birthday
    ? format(
        new Date(Date.UTC(2000, me.birthday.getUTCMonth(), me.birthday.getUTCDate())),
        "yyyy-MM-dd",
      )
    : "";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[#0A3D45]">
        Calendar
      </h1>
      <p className="mt-2 max-w-2xl text-[#0A3D45]/70">
        Personal, tasks, workspace events, and birthdays in one view — filter by kind so a busy
        day stays readable.
      </p>

      <div className="mt-8">
        <CalendarBoard
          events={events}
          workspaces={workspaces}
          showBirthdays={me.showBirthdaysOnCalendar}
          birthdayValue={birthdayValue}
        />
      </div>
    </main>
  );
}
