/** Shared channel naming (safe for client + server). */
export function userChannelName(userId: string) {
  return `user:${userId}`;
}
