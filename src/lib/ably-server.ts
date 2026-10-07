import Ably from "ably";
import {
  chatPresenceChannelName,
  userChannelName,
} from "@/lib/ably-channels";
import type { ChatMessageEvent } from "@/lib/chat-message-events";
import { CHAT_MESSAGE_ABLY } from "@/lib/chat-message-events";
import { prisma } from "@/lib/db";
import { getNavBadgeCounts } from "@/lib/nav-badges";

export function isAblyConfigured(): boolean {
  return Boolean(process.env.ABLY_API_KEY?.trim());
}

export { userChannelName, chatPresenceChannelName };

export type ChatPresenceData = {
  username: string;
  typing?: boolean;
};

/** Soft cap so huge membership lists don't blow token size. */
const MAX_PRESENCE_CHANNELS = 80;

let restSingleton: Ably.Rest | null | undefined;

function getRest(): Ably.Rest | null {
  if (restSingleton !== undefined) return restSingleton;
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) {
    restSingleton = null;
    return null;
  }
  restSingleton = new Ably.Rest(key);
  return restSingleton;
}

/**
 * Browser token: own user channel (badges/messages) + presence only on chats
 * the user belongs to (no global `chat:*`). Messages still fan out on user channels.
 * Presence enter/update/leave happens on the browser Realtime connection
 * (Rest cannot hold presence members on serverless).
 */
export async function createUserTokenRequest(
  userId: string,
  opts?: { ensureGroupIds?: string[] },
) {
  const rest = getRest();
  if (!rest) return null;

  const memberships = await prisma.chatMember.findMany({
    where: { userId },
    select: { groupId: true, lastActiveAt: true, lastSeenAt: true },
    orderBy: [{ lastActiveAt: "desc" }, { lastSeenAt: "desc" }],
    take: MAX_PRESENCE_CHANNELS,
  });

  const groupIds = new Set(memberships.map((m) => m.groupId));
  for (const gid of opts?.ensureGroupIds ?? []) {
    if (!gid || groupIds.has(gid)) continue;
    const member = await prisma.chatMember.findUnique({
      where: { groupId_userId: { groupId: gid, userId } },
      select: { groupId: true },
    });
    if (member) groupIds.add(member.groupId);
  }

  type CapOps = Ably.capabilityOp[];
  const presenceOps: CapOps = ["subscribe", "presence", "history"];
  const capability: { [key: string]: CapOps } = {
    [userChannelName(userId)]: presenceOps,
  };
  for (const groupId of groupIds) {
    capability[chatPresenceChannelName(groupId)] = presenceOps;
  }

  // 15m TTL — re-auth picks up new chat memberships without long-lived wildcards.
  return rest.auth.createTokenRequest({
    clientId: userId,
    capability,
    ttl: 15 * 60 * 1000,
  });
}

/** Snapshot of who is currently present (JSON GET / load-test). */
export async function getChatPresenceSnapshot(groupId: string): Promise<
  {
    userId: string;
    username: string;
    typing: boolean;
  }[]
> {
  const rest = getRest();
  if (!rest || !groupId) return [];
  try {
    const page = await rest.channels
      .get(chatPresenceChannelName(groupId))
      .presence.get();
    const members = page.items ?? [];
    return members.map((m) => {
      const data = (m.data ?? {}) as { username?: string; typing?: boolean };
      return {
        userId: m.clientId,
        username:
          typeof data.username === "string" && data.username
            ? data.username
            : m.clientId,
        typing: Boolean(data.typing),
      };
    });
  } catch (err) {
    console.error("[ably] presence get failed", groupId, err);
    return [];
  }
}

async function publishToUser(userId: string, name: string, data: unknown) {
  const rest = getRest();
  if (!rest || !userId) return;
  await rest.channels.get(userChannelName(userId)).publish(name, data);
}

export async function publishToUsers(
  userIds: string[],
  name: string,
  data: unknown,
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0 || !isAblyConfigured()) return;
  await Promise.all(
    unique.map((id) =>
      publishToUser(id, name, data).catch((err) => {
        console.error("[ably] publish failed", id, name, err);
      }),
    ),
  );
}

/** Push a chat message body so open threads can patch without full RSC reload. */
export async function pushChatMessageForUsers(
  userIds: string[],
  message: ChatMessageEvent,
) {
  await publishToUsers(userIds, CHAT_MESSAGE_ABLY, message);
}

export type BadgeDelta = {
  unreadDelta?: number;
  chatUnreadDelta?: number;
};

/** Lightweight badge nudge — clients adjust locally without getNavBadgeCounts. */
export async function pushBadgeDeltaForUsers(
  userIds: string[],
  delta: BadgeDelta,
) {
  await publishToUsers(userIds, "badge-delta", delta);
}

/** Push fresh nav badge counts to one or more users. */
export async function pushBadgesForUsers(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0 || !isAblyConfigured()) return;

  await Promise.all(
    unique.map(async (userId) => {
      try {
        const badges = await getNavBadgeCounts(userId);
        await publishToUser(userId, "badges", badges);
      } catch (err) {
        console.error("[ably] badge push failed", userId, err);
      }
    }),
  );
}

/**
 * Ask clients to refresh matching routes (RSC) when list data changed.
 * `paths` are prefixes, e.g. `/app/chat`, `/app/w/abc`.
 */
export async function pushRefreshForUsers(
  userIds: string[],
  paths: string[],
) {
  if (paths.length === 0) return;
  await publishToUsers(userIds, "refresh", { paths });
}

/**
 * Alerts inbox changed: update nav badge counts and refresh `/app/notifications`
 * if that page is open (no polling).
 */
export async function pushAlertInboxForUsers(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  await Promise.all([
    pushBadgesForUsers(unique),
    pushRefreshForUsers(unique, ["/app/notifications"]),
  ]);
}
