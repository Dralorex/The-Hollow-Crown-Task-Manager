/**
 * Run a ~30 minute load mix with 50 seeded users.
 *
 * Requires:
 *   - scripts/load-test/.credentials.json (from seed)
 *   - App reachable at LOAD_TEST_BASE_URL
 *   - LOAD_TEST_SECRET set on BOTH the runner and the app (for write ticks)
 *
 * Usage:
 *   LOAD_TEST_BASE_URL=http://localhost:3000 LOAD_TEST_SECRET=... npm run load-test:run
 *
 * Env:
 *   LOAD_TEST_DURATION_MIN=30
 *   LOAD_TEST_VUS=50          (concurrent workers; default = credential count)
 *   LOAD_TEST_ALLOW_PROD=1    (required to hit rowgon.com)
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CREDENTIALS_PATH,
  DEFAULT_DURATION_MIN,
  type LoadCredentials,
} from "./config";

type Stats = {
  ok: number;
  fail: number;
  byAction: Record<string, { ok: number; fail: number; msTotal: number }>;
};

function assertSafeBaseUrl(baseUrl: string) {
  const u = new URL(baseUrl);
  const host = u.hostname.toLowerCase();
  const prodLike =
    host === "rowgon.com" ||
    host === "www.rowgon.com" ||
    host.endsWith(".rowgon.com");
  if (prodLike && process.env.LOAD_TEST_ALLOW_PROD !== "1") {
    throw new Error(
      `Refusing to load-test ${host}. Use staging/Preview/local, or set LOAD_TEST_ALLOW_PROD=1 consciously.`,
    );
  }
}

function track(stats: Stats, action: string, ok: boolean, ms: number) {
  if (ok) stats.ok += 1;
  else stats.fail += 1;
  const slot = (stats.byAction[action] ??= { ok: 0, fail: 0, msTotal: 0 });
  if (ok) slot.ok += 1;
  else slot.fail += 1;
  slot.msTotal += ms;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function main() {
  const baseUrl = (process.env.LOAD_TEST_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  assertSafeBaseUrl(baseUrl);

  const secret = process.env.LOAD_TEST_SECRET?.trim();
  if (!secret) {
    console.warn(
      "LOAD_TEST_SECRET unset — read-only HTTP actions only (no message writes).",
    );
  }

  const durationMin = Math.max(
    1,
    Number(process.env.LOAD_TEST_DURATION_MIN || DEFAULT_DURATION_MIN) ||
      DEFAULT_DURATION_MIN,
  );
  const durationMs = durationMin * 60 * 1000;

  const credPath = path.resolve(process.cwd(), CREDENTIALS_PATH);
  const creds = JSON.parse(await readFile(credPath, "utf8")) as LoadCredentials;
  if (!creds.users?.length) throw new Error("No users in credentials file. Run seed first.");

  const vuCount = Math.max(
    1,
    Math.min(
      creds.users.length,
      Number(process.env.LOAD_TEST_VUS || creds.users.length) || creds.users.length,
    ),
  );

  console.log(`Base URL:     ${baseUrl}`);
  console.log(`Duration:     ${durationMin} min`);
  console.log(`Workers:      ${vuCount}`);
  console.log(`Users avail:  ${creds.users.length}`);
  console.log(`Writes:       ${secret ? "enabled (message ticks)" : "disabled"}`);
  console.log("Starting in 3s…");
  await sleep(3000);

  const stats: Stats = { ok: 0, fail: 0, byAction: {} };
  const endsAt = Date.now() + durationMs;
  const workers = Array.from({ length: vuCount }, (_, i) =>
    workerLoop({
      user: creds.users[i]!,
      creds,
      baseUrl,
      secret,
      endsAt,
      stats,
    }),
  );

  const progress = setInterval(() => {
    const left = Math.max(0, endsAt - Date.now());
    console.log(
      `[${new Date().toISOString()}] ok=${stats.ok} fail=${stats.fail} left≈${Math.ceil(left / 60000)}m`,
    );
  }, 60_000);

  await Promise.all(workers);
  clearInterval(progress);

  console.log("\n=== Load test finished ===");
  console.log(`Total ok=${stats.ok} fail=${stats.fail}`);
  for (const [action, s] of Object.entries(stats.byAction).sort()) {
    const n = s.ok + s.fail;
    const avg = n ? Math.round(s.msTotal / n) : 0;
    console.log(
      `  ${action.padEnd(16)} ok=${s.ok} fail=${s.fail} avgMs=${avg}`,
    );
  }
  console.log(
    "\nCheck Neon / Vercel / Ably dashboards for this window to estimate real costs.",
  );
}

async function workerLoop(opts: {
  user: LoadCredentials["users"][number];
  creds: LoadCredentials;
  baseUrl: string;
  secret?: string;
  endsAt: number;
  stats: Stats;
}) {
  const cookie = `rowgon_session=${opts.user.sessionToken}`;
  const actions = buildActionPlan(Boolean(opts.secret));

  while (Date.now() < opts.endsAt) {
    const action = pick(actions);
    const started = Date.now();
    let ok = false;
    try {
      ok = await runAction(action, {
        baseUrl: opts.baseUrl,
        cookie,
        secret: opts.secret,
        workspaceId: opts.creds.workspaceId,
        groupId: opts.creds.groupId,
        username: opts.user.username,
      });
    } catch {
      ok = false;
    }
    track(opts.stats, action, ok, Date.now() - started);
    // Pace: ~1 action every 2–6s per worker → sustainable 30 min mix
    await sleep(2000 + Math.floor(Math.random() * 4000));
  }
}

function buildActionPlan(writes: boolean): string[] {
  const plan = [
    "app_home",
    "app_home",
    "workspace",
    "workspace",
    "chat_page",
    "pulse",
    "pulse",
    "ably_auth",
    "presence",
    "presence",
  ];
  if (writes) {
    plan.push("message", "message", "heartbeat");
  }
  return plan;
}

async function runAction(
  action: string,
  ctx: {
    baseUrl: string;
    cookie: string;
    secret?: string;
    workspaceId: string;
    groupId: string;
    username: string;
  },
): Promise<boolean> {
  const headers = { Cookie: ctx.cookie };

  if (action === "app_home") {
    const res = await fetch(`${ctx.baseUrl}/app`, {
      headers,
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400;
  }
  if (action === "workspace") {
    const res = await fetch(`${ctx.baseUrl}/app/w/${ctx.workspaceId}`, {
      headers,
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400;
  }
  if (action === "chat_page") {
    const res = await fetch(`${ctx.baseUrl}/app/chat`, {
      headers,
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400;
  }
  if (action === "pulse") {
    const res = await fetch(`${ctx.baseUrl}/api/pulse`, { headers });
    return res.ok;
  }
  if (action === "ably_auth") {
    const res = await fetch(`${ctx.baseUrl}/api/ably/auth`, { headers });
    // 503/501 if Ably unset is still a valid "handled" response for local
    return res.status === 200 || res.status === 501 || res.status === 503;
  }
  if (action === "presence") {
    const res = await fetch(
      `${ctx.baseUrl}/api/chat/${ctx.groupId}/presence`,
      { headers },
    );
    return res.ok;
  }
  if (action === "message" || action === "heartbeat") {
    if (!ctx.secret) return false;
    const res = await fetch(`${ctx.baseUrl}/api/load-test/action`, {
      method: "POST",
      headers: {
        Cookie: ctx.cookie,
        "Content-Type": "application/json",
        "x-load-test-secret": ctx.secret,
      },
      body: JSON.stringify({
        type: action === "message" ? "message" : "heartbeat",
        groupId: ctx.groupId,
        body: `load tick from ${ctx.username} @ ${new Date().toISOString()}`,
      }),
    });
    return res.ok;
  }
  return false;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
