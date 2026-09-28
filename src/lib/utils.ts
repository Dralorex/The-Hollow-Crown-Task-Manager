export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function isValidUsername(username: string) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type UserLabel = {
  username: string;
  nickname?: string | null;
  deletedAt?: Date | string | null;
  deletedUsername?: string | null;
};

/** Prefer nickname when set; otherwise the login username. */
export function displayName(user: UserLabel): string {
  if (user.deletedAt) {
    return user.deletedUsername?.trim() || "deleted";
  }
  const nick = user.nickname?.trim();
  return nick ? nick : user.username;
}

/**
 * UI label for a person: nickname as entered, or @username when no nickname.
 * Soft-deleted accounts keep their prior username with a deleted marker.
 */
export function personLabel(user: UserLabel): string {
  if (user.deletedAt) {
    const prior = user.deletedUsername?.trim() || "deleted";
    return `@${prior} *deleted account*`;
  }
  const nick = user.nickname?.trim();
  if (nick) return nick;
  return `@${user.username}`;
}

/** Nickname may include capitals and spaces; empty clears it. */
export function isValidNickname(nickname: string) {
  if (!nickname) return true;
  return /^[A-Za-z0-9][A-Za-z0-9 ]{0,39}$/.test(nickname) && nickname.trim().length > 0;
}

export function normalizeNickname(nickname: string) {
  return nickname.replace(/\s+/g, " ").trim();
}

export function searchRelevance(query: string, name: string): number {
  const q = query.trim().toLowerCase();
  const n = name.toLowerCase();
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 50;
  const tokens = q.split(/\s+/);
  let hits = 0;
  for (const t of tokens) {
    if (t && n.includes(t)) hits += 1;
  }
  return hits > 0 ? 20 + hits * 5 : 0;
}
