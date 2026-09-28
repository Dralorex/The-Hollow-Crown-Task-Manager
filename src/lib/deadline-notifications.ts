import { pushAlertInboxForUsers } from "@/lib/ably-server";
import {
  DEADLINE_NOTIFY_DATE_MIN,
  daysUntilDue,
  duePressure,
} from "@/lib/urgency";
import { prisma } from "@/lib/db";

/**
 * Create DEADLINE_SOON notifications for the user's claimed tasks that are
 * overdue or approaching on the Date curve (Soon band+). Skips if one already
 * exists for that task today.
 */
export async function syncDeadlineNotifications(userId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      dueDate: { not: null },
      status: { in: ["CLAIMED", "IN_REVIEW", "OPEN"] },
    },
    select: {
      id: true,
      name: true,
      dueDate: true,
      workspaceId: true,
      folderId: true,
    },
  });

  const urgent = tasks.filter(
    (t) => t.dueDate && duePressure(t.dueDate, now) >= DEADLINE_NOTIFY_DATE_MIN,
  );
  if (urgent.length === 0) return;

  const existing = await prisma.notification.findMany({
    where: {
      userId,
      type: "DEADLINE_SOON",
      createdAt: { gte: startOfToday },
    },
    select: { meta: true },
  });

  const already = new Set(
    existing
      .map((n) => {
        try {
          return JSON.parse(n.meta ?? "{}").taskId as string | undefined;
        } catch {
          return undefined;
        }
      })
      .filter(Boolean),
  );

  const toCreate = urgent.filter((t) => !already.has(t.id));
  if (toCreate.length === 0) return;

  await prisma.notification.createMany({
    data: toCreate.map((task) => {
      const days = daysUntilDue(task.dueDate, now);
      const when =
        days === null
          ? "due soon"
          : days < 0
            ? "overdue"
            : days === 0
              ? "due today"
              : days <= 2
                ? "due within 2 days"
                : "due soon";
      return {
        userId,
        type: "DEADLINE_SOON",
        title: "Deadline getting close",
        body: `“${task.name}” is ${when}.`,
        meta: JSON.stringify({
          taskId: task.id,
          workspaceId: task.workspaceId,
          folderId: task.folderId,
        }),
      };
    }),
  });

  await pushAlertInboxForUsers([userId]);
}
