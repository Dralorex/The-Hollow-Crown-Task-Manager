/** Shared constants + persona model for realistic load harness. */

export const LOAD_USER_PREFIX = "loaduser_";
export const LOAD_PASSWORD = process.env.LOAD_TEST_PASSWORD?.trim() || "loadtest-pass-50";
export const LOAD_WORKSPACE_NAME = "Load Test HQ";
export const LOAD_FOLDER_NAME = "Load Bench";
export const LOAD_CHAT_NAME = "Load Test Chat";
export const DEFAULT_USER_COUNT = 50;
export const DEFAULT_DURATION_MIN = 30;

export const CREDENTIALS_PATH =
  process.env.LOAD_TEST_CREDENTIALS?.trim() ||
  "scripts/load-test/.credentials.json";

/** How a synthetic person behaves over a work-session slice. */
export type Persona =
  | "lurker" // mostly idle, occasional browse
  | "worker" // tasks + light chat
  | "chatty" // talks more; still not spam
  | "social" // birthday / friends once + light browse
  | "admin"; // create/review tasks, rare R2/stripe

export type LoadCredentials = {
  createdAt: string;
  password: string;
  workspaceId: string;
  folderIds: string[];
  /** Everyone-in HQ chat */
  hqGroupId: string;
  /** Smaller side chats */
  sideGroupIds: string[];
  users: Array<{
    index: number;
    id: string;
    username: string;
    sessionToken: string;
    persona: Persona;
    /** Preferred chat for messages (hq or a side group) */
    chatGroupId: string;
  }>;
};

export function loadUsername(index: number) {
  return `${LOAD_USER_PREFIX}${String(index).padStart(3, "0")}`;
}

export function isLoadUsername(username: string) {
  return username.startsWith(LOAD_USER_PREFIX);
}

/**
 * Assign personas for N users (≈ typical team mix, not everyone hammering chat).
 * Rough mix @ 50: ~40% lurker, 30% worker, 16% chatty, 8% social, 6% admin.
 */
export function assignPersona(index: number, total: number): Persona {
  if (index === 1 || index === 2) return "admin"; // owner + admin
  const t = (index - 1) / Math.max(1, total - 1);
  if (t < 0.4) return "lurker";
  if (t < 0.7) return "worker";
  if (t < 0.86) return "chatty";
  if (t < 0.94) return "social";
  return "admin";
}

/** Mean idle between actions (ms) — realistic “at desk” pacing, not bots. */
export function personaSleepMs(persona: Persona): number {
  const jitter = (lo: number, hi: number) =>
    lo + Math.floor(Math.random() * (hi - lo + 1));
  switch (persona) {
    case "lurker":
      return jitter(180_000, 480_000); // 3–8 min
    case "worker":
      return jitter(90_000, 240_000); // 1.5–4 min
    case "chatty":
      return jitter(45_000, 150_000); // 45s–2.5 min
    case "social":
      return jitter(120_000, 300_000); // 2–5 min
    case "admin":
      return jitter(60_000, 180_000); // 1–3 min
  }
}

/**
 * Weighted action pools per persona for a 30-min work slice.
 * Heavier weights = more likely when they wake up.
 */
export function personaActions(
  persona: Persona,
  opts: { r2: boolean; stripe: boolean; writes: boolean },
): string[] {
  const browse = [
    "app_home",
    "workspace",
    "workspace",
    "chat_page",
    "pulse",
    "presence",
  ];

  if (persona === "lurker") {
    return [...browse, "app_home", "workspace", "pulse"];
  }

  if (persona === "worker") {
    const a = [
      ...browse,
      "workspace",
      "workspace",
      "claim_task",
      "claim_task",
      "complete_task",
      "pulse",
    ];
    if (opts.writes) a.push("message", "heartbeat");
    return a;
  }

  if (persona === "chatty") {
    const a = [
      ...browse,
      "chat_page",
      "presence",
      "presence",
      "claim_task",
    ];
    if (opts.writes) {
      a.push("message", "message", "message", "heartbeat", "heartbeat");
    }
    return a;
  }

  if (persona === "social") {
    const a = [
      ...browse,
      "app_home",
      "share_birthday",
      "workspace",
    ];
    if (opts.writes) a.push("message");
    return a;
  }

  // admin
  const a = [
    ...browse,
    "workspace",
    "create_task",
    "create_task",
    "review_task",
    "review_task",
    "claim_task",
    "ably_auth",
  ];
  if (opts.writes) a.push("message", "heartbeat");
  if (opts.r2) a.push("r2_cycle"); // rare — one slot in pool
  if (opts.stripe) a.push("stripe_ping");
  a.push("sso_start");
  return a;
}
