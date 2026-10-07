/**
 * Shared channel naming (safe for client + server).
 *
 * - `user:{userId}` — badge/message/refresh fan-out (publish server-side).
 * - `chat:{groupId}:presence` — Ably Presence for online + typing (client enter/update/leave).
 *   Tokens grant presence only on groups the user belongs to (see createUserTokenRequest).
 */
export function userChannelName(userId: string) {
  return `user:${userId}`;
}

export function chatPresenceChannelName(groupId: string) {
  return `chat:${groupId}:presence`;
}
