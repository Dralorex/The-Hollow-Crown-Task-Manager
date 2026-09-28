import Ably from "ably";
import { userChannelName } from "@/lib/ably-channels";
import { getNavBadgeCounts } from "@/lib/nav-badges";

export function isAblyConfigured(): boolean {
  return Boolean(process.env.ABLY_API_KEY?.trim());
}

export { userChannelName };

function getRest(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return null;
  return new Ably.Rest(key);
}

/** Create a token request scoped to this user's channel (for browser auth). */
export async function createUserTokenRequest(userId: string) {
  const rest = getRest();
  if (!rest) return null;
  const channel = userChannelName(userId);
  return rest.auth.createTokenRequest({
    clientId: userId,
    capability: {
      [channel]: ["subscribe", "presence", "history"],
    },
  });
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
