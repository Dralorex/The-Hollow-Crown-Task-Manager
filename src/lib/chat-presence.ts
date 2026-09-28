export const ONLINE_MS = 50_000;
export const TYPING_MS = 4_000;

export type ChatPresenceMember = {
  userId: string;
  username: string;
  online: boolean;
  typing: boolean;
};

export function derivePresence(
  members: {
    userId: string;
    username: string;
    lastSeenAt: Date | null;
    typingAt: Date | null;
  }[],
  selfId: string,
  now = Date.now(),
): ChatPresenceMember[] {
  return members.map((m) => ({
    userId: m.userId,
    username: m.username,
    online: Boolean(m.lastSeenAt && now - m.lastSeenAt.getTime() < ONLINE_MS),
    typing: Boolean(
      m.userId !== selfId &&
        m.typingAt &&
        now - m.typingAt.getTime() < TYPING_MS,
    ),
  }));
}

export function typingLabel(usernames: string[]) {
  if (usernames.length === 0) return null;
  if (usernames.length === 1) return `${usernames[0]} is typing…`;
  if (usernames.length === 2) {
    return `${usernames[0]} and ${usernames[1]} are typing…`;
  }
  const head = usernames.slice(0, -1).join(", ");
  const last = usernames[usernames.length - 1];
  return `${head}, and ${last} are typing…`;
}
