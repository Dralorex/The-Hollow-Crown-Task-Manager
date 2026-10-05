/** Shared constants for the 50-user / 30-min load harness. */

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

export type LoadCredentials = {
  createdAt: string;
  password: string;
  workspaceId: string;
  folderId: string;
  groupId: string;
  users: Array<{
    index: number;
    id: string;
    username: string;
    sessionToken: string;
  }>;
};

export function loadUsername(index: number) {
  return `${LOAD_USER_PREFIX}${String(index).padStart(3, "0")}`;
}

export function isLoadUsername(username: string) {
  return username.startsWith(LOAD_USER_PREFIX);
}
