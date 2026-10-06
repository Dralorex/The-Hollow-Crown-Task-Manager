/** Shared channel naming (safe for client + server). */
export function userChannelName(userId: string) {
  return `user:${userId}`;
}

/** Per-chat presence + typing fan-out (Ably Presence). */
export function chatPresenceChannelName(groupId: string) {
  return `chat:${groupId}:presence`;
}
