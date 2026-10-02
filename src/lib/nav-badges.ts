import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getRoleActivityUnread } from "@/lib/folder-access";

export type NavBadgeCounts = {
  unreadCount: number;
  chatUnreadCount: number;
};

export function navBadgeTag(userId: string) {
  return `nav-badges:${userId}`;
}

/** Same badge math as `/app` layout (alerts + role activity, chat separate). */
export async function getNavBadgeCounts(userId: string): Promise<NavBadgeCounts> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { customRoles: { select: { roleId: true } } },
  });

  const roleUnreadLists = await Promise.all(
    memberships.map((m) =>
      getRoleActivityUnread(
        userId,
        m.workspaceId,
        new Set(m.customRoles.map((cr) => cr.roleId)),
      ),
    ),
  );
  const roleUnreadTotal = roleUnreadLists
    .flat()
    .reduce((sum, row) => sum + row.count, 0);

  const [notifUnread, chatUnreadCount] = await Promise.all([
    prisma.notification.count({
      where: {
        userId,
        read: false,
        type: { notIn: ["CHAT_MESSAGE", "DM_REQUEST"] },
      },
    }),
    prisma.notification.count({
      where: {
        userId,
        read: false,
        type: { in: ["CHAT_MESSAGE", "DM_REQUEST"] },
      },
    }),
  ]);

  return {
    unreadCount: notifUnread + roleUnreadTotal,
    chatUnreadCount,
  };
}

/**
 * Short-lived cache so tab navigations don’t re-run heavy badge math every time.
 * Live Ably badge pushes still update the client immediately.
 */
export function getNavBadgeCountsCached(userId: string) {
  return unstable_cache(
    async () => getNavBadgeCounts(userId),
    ["nav-badges", userId],
    { revalidate: 20, tags: [navBadgeTag(userId)] },
  )();
}
