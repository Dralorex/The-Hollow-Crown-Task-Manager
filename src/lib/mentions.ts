import type { Role } from "@/generated/prisma/client";

export type ParsedMention =
  | { kind: "user"; username: string }
  | { kind: "everyone" }
  | { kind: "role"; roleName: Role };

const BUILTIN_ROLES: Role[] = ["OWNER", "ADMIN", "EDITOR", "MEMBER"];

const MENTION_RE = /@([A-Za-z0-9_]+)/g;

export function parseMentions(body: string): ParsedMention[] {
  const found: ParsedMention[] = [];
  const seen = new Set<string>();

  for (const match of body.matchAll(MENTION_RE)) {
    const token = match[1];
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (key === "everyone") {
      found.push({ kind: "everyone" });
      continue;
    }

    const role = BUILTIN_ROLES.find((r) => r.toLowerCase() === key);
    if (role) {
      found.push({ kind: "role", roleName: role });
      continue;
    }

    found.push({ kind: "user", username: key });
  }

  return found;
}

export function highlightMentions(body: string): { text: string; isMention: boolean }[] {
  const parts: { text: string; isMention: boolean }[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({ text: body.slice(last, start), isMention: false });
    }
    parts.push({ text: match[0], isMention: true });
    last = start + match[0].length;
  }
  if (last < body.length) {
    parts.push({ text: body.slice(last), isMention: false });
  }
  return parts.length ? parts : [{ text: body, isMention: false }];
}

export const OPEN_THREAD_MS = 1000 * 60 * 2;
