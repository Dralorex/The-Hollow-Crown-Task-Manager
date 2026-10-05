/**
 * ~30 min multi-system load mix with 50 seeded users.
 *
 * Hits in one run (when configured):
 *   - Core: /app, workspace, chat, pulse, presence, Ably auth, chat messages
 *   - R2: upload → download → delete cycles (Admin+ load users)
 *   - Cron: retention / seat-renewal / dunning / weekly-digest stubs
 *   - Stripe: ensure customer + cheap test-mode API pings (no live charges)
 *   - SSO: GET /api/sso/start (scaffold; usually disabled)
 *
 * Usage:
 *   LOAD_TEST_BASE_URL=http://localhost:3000 \
 *   LOAD_TEST_SECRET=... \
 *   CRON_SECRET=... \
 *   npm run load-test:run
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
  skip: number;
  byAction: Record<
    string,
    { ok: number; fail: number; skip: number; msTotal: number }
  >;
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

function track(
  stats: Stats,
  action: string,
  result: "ok" | "fail" | "skip",
  ms: number,
) {
  if (result === "ok") stats.ok += 1;
  else if (result === "skip") stats.skip += 1;
  else stats.fail += 1;
  const slot = (stats.byAction[action] ??= {
    ok: 0,
    fail: 0,
    skip: 0,
    msTotal: 0,
  });
  slot[result] += 1;
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
  const cronSecret = process.env.CRON_SECRET?.trim();

  const durationMin = Math.max(
    1,
    Number(process.env.LOAD_TEST_DURATION_MIN || DEFAULT_DURATION_MIN) ||
      DEFAULT_DURATION_MIN,
  );
  const durationMs = durationMin * 60 * 1000;

  const credPath = path.resolve(process.cwd(), CREDENTIALS_PATH);
  const creds = JSON.parse(await readFile(credPath, "utf8")) as LoadCredentials;
  if (!creds.users?.length) {
    throw new Error("No users in credentials file. Run seed first.");
  }

  const vuCount = Math.max(
    1,
    Math.min(
      creds.users.length,
      Number(process.env.LOAD_TEST_VUS || creds.users.length) ||
        creds.users.length,
    ),
  );

  const caps = await probeSystems(baseUrl, secret, cronSecret, creds);
  console.log("\n=== System probe ===");
  for (const [k, v] of Object.entries(caps)) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }

  console.log(`\nBase URL:     ${baseUrl}`);
  console.log(`Duration:     ${durationMin} min`);
  console.log(`Workers:      ${vuCount}`);
  console.log(`Users avail:  ${creds.users.length}`);
  console.log("Starting in 3s…");
  await sleep(3000);

  const stats: Stats = { ok: 0, fail: 0, skip: 0, byAction: {} };
  const endsAt = Date.now() + durationMs;

  // Owner ensures Stripe customer once up front (test mode, free)
  if (secret && caps.stripe === "ready") {
    const owner = creds.users[0]!;
    const started = Date.now();
    const r = await postAction(baseUrl, owner.sessionToken, secret, {
      type: "stripe_ensure_customer",
    });
    track(
      stats,
      "stripe_ensure",
      r.status === 200 ? "ok" : r.status === 503 ? "skip" : "fail",
      Date.now() - started,
    );
  }

  const workers = Array.from({ length: vuCount }, (_, i) =>
    workerLoop({
      user: creds.users[i]!,
      isAdminCapable: i < 2, // owner + admin from seed
      creds,
      baseUrl,
      secret,
      caps,
      endsAt,
      stats,
    }),
  );

  const cronWorker = cronLoop({
    baseUrl,
    cronSecret,
    enabled: caps.cron === "ready",
    endsAt,
    stats,
  });

  const progress = setInterval(() => {
    const left = Math.max(0, endsAt - Date.now());
    console.log(
      `[${new Date().toISOString()}] ok=${stats.ok} fail=${stats.fail} skip=${stats.skip} left≈${Math.ceil(left / 60000)}m`,
    );
  }, 60_000);

  await Promise.all([...workers, cronWorker]);
  clearInterval(progress);

  console.log("\n=== Load test finished ===");
  console.log(`Total ok=${stats.ok} fail=${stats.fail} skip=${stats.skip}`);
  for (const [action, s] of Object.entries(stats.byAction).sort()) {
    const n = s.ok + s.fail + s.skip;
    const avg = n ? Math.round(s.msTotal / n) : 0;
    console.log(
      `  ${action.padEnd(16)} ok=${s.ok} fail=${s.fail} skip=${s.skip} avgMs=${avg}`,
    );
  }
  console.log(
    "\nCheck Neon / Vercel / Ably / R2 / Stripe (test) / Cron logs for this window.",
  );
}

type Caps = {
  core: string;
  ably: string;
  r2: string;
  stripe: string;
  cron: string;
  sso: string;
};

async function probeSystems(
  baseUrl: string,
  secret: string | undefined,
  cronSecret: string | undefined,
  creds: LoadCredentials,
): Promise<Caps> {
  const owner = creds.users[0]!;
  const cookie = `rowgon_session=${owner.sessionToken}`;

  const home = await fetch(`${baseUrl}/app`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const core = home.status >= 200 && home.status < 400 ? "ready" : `fail_${home.status}`;

  const ably = await fetch(`${baseUrl}/api/ably/auth`, {
    headers: { Cookie: cookie },
  });
  const ablyStatus =
    ably.status === 200
      ? "ready"
      : ably.status === 503
        ? "not_configured"
        : `fail_${ably.status}`;

  let r2 = "no_secret";
  let stripe = "no_secret";
  if (secret) {
    const r2Res = await postAction(baseUrl, owner.sessionToken, secret, {
      type: "r2_cycle",
      workspaceId: creds.workspaceId,
    });
    r2 =
      r2Res.status === 200
        ? "ready"
        : r2Res.status === 503
          ? "not_configured"
          : `fail_${r2Res.status}`;

    const sRes = await postAction(baseUrl, owner.sessionToken, secret, {
      type: "stripe_ping",
    });
    stripe =
      sRes.status === 200
        ? "ready"
        : sRes.status === 503
          ? "not_configured"
          : `fail_${sRes.status}`;
  }

  let cron = "no_secret";
  if (cronSecret) {
    const cRes = await fetch(`${baseUrl}/api/cron/retention-purge`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    cron =
      cRes.status === 200
        ? "ready"
        : cRes.status === 503
          ? "not_configured"
          : `fail_${cRes.status}`;
  }

  const ssoRes = await fetch(`${baseUrl}/api/sso/start`, { redirect: "manual" });
  const sso =
    ssoRes.status === 200 || ssoRes.status === 302 || ssoRes.status === 403
      ? ssoRes.status === 302
        ? "enabled_redirect"
        : "scaffold_ok"
      : `fail_${ssoRes.status}`;

  return { core, ably: ablyStatus, r2, stripe, cron, sso };
}

async function postAction(
  baseUrl: string,
  sessionToken: string,
  secret: string,
  body: Record<string, unknown>,
) {
  return fetch(`${baseUrl}/api/load-test/action`, {
    method: "POST",
    headers: {
      Cookie: `rowgon_session=${sessionToken}`,
      "Content-Type": "application/json",
      "x-load-test-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

async function workerLoop(opts: {
  user: LoadCredentials["users"][number];
  isAdminCapable: boolean;
  creds: LoadCredentials;
  baseUrl: string;
  secret?: string;
  caps: Caps;
  endsAt: number;
  stats: Stats;
}) {
  const cookie = `rowgon_session=${opts.user.sessionToken}`;
  const actions = buildActionPlan({
    writes: Boolean(opts.secret),
    r2: opts.isAdminCapable && opts.caps.r2 === "ready",
    stripe: opts.isAdminCapable && opts.caps.stripe === "ready",
    sso: true,
  });

  while (Date.now() < opts.endsAt) {
    const action = pick(actions);
    const started = Date.now();
    let result: "ok" | "fail" | "skip" = "fail";
    try {
      result = await runAction(action, {
        baseUrl: opts.baseUrl,
        cookie,
        sessionToken: opts.user.sessionToken,
        secret: opts.secret,
        workspaceId: opts.creds.workspaceId,
        groupId: opts.creds.groupId,
        username: opts.user.username,
      });
    } catch {
      result = "fail";
    }
    track(opts.stats, action, result, Date.now() - started);
    await sleep(2000 + Math.floor(Math.random() * 4000));
  }
}

async function cronLoop(opts: {
  baseUrl: string;
  cronSecret?: string;
  enabled: boolean;
  endsAt: number;
  stats: Stats;
}) {
  if (!opts.enabled || !opts.cronSecret) return;

  const routes = [
    "retention-purge",
    "seat-renewal",
    "dunning",
    "weekly-digest",
  ] as const;

  // First hit soon, then every ~2.5 minutes
  await sleep(5_000);
  while (Date.now() < opts.endsAt) {
    for (const name of routes) {
      const started = Date.now();
      let result: "ok" | "fail" | "skip" = "fail";
      try {
        const res = await fetch(`${opts.baseUrl}/api/cron/${name}`, {
          headers: { Authorization: `Bearer ${opts.cronSecret}` },
        });
        result = res.ok ? "ok" : res.status === 503 ? "skip" : "fail";
      } catch {
        result = "fail";
      }
      track(opts.stats, `cron_${name}`, result, Date.now() - started);
    }
    await sleep(150_000);
  }
}

function buildActionPlan(opts: {
  writes: boolean;
  r2: boolean;
  stripe: boolean;
  sso: boolean;
}): string[] {
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
  if (opts.writes) {
    plan.push("message", "message", "heartbeat");
  }
  if (opts.r2) {
    // Fewer than chat — still exercises Class A/B + Neon metadata each cycle
    plan.push("r2_cycle");
  }
  if (opts.stripe) {
    plan.push("stripe_ping");
  }
  if (opts.sso) {
    plan.push("sso_start");
  }
  return plan;
}

async function runAction(
  action: string,
  ctx: {
    baseUrl: string;
    cookie: string;
    sessionToken: string;
    secret?: string;
    workspaceId: string;
    groupId: string;
    username: string;
  },
): Promise<"ok" | "fail" | "skip"> {
  const headers = { Cookie: ctx.cookie };

  if (action === "app_home") {
    const res = await fetch(`${ctx.baseUrl}/app`, {
      headers,
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400 ? "ok" : "fail";
  }
  if (action === "workspace") {
    const res = await fetch(`${ctx.baseUrl}/app/w/${ctx.workspaceId}`, {
      headers,
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400 ? "ok" : "fail";
  }
  if (action === "chat_page") {
    const res = await fetch(`${ctx.baseUrl}/app/chat`, {
      headers,
      redirect: "manual",
    });
    return res.status >= 200 && res.status < 400 ? "ok" : "fail";
  }
  if (action === "pulse") {
    const res = await fetch(`${ctx.baseUrl}/api/pulse`, { headers });
    return res.ok ? "ok" : "fail";
  }
  if (action === "ably_auth") {
    const res = await fetch(`${ctx.baseUrl}/api/ably/auth`, { headers });
    if (res.status === 200) return "ok";
    if (res.status === 503) return "skip";
    return "fail";
  }
  if (action === "presence") {
    const res = await fetch(
      `${ctx.baseUrl}/api/chat/${ctx.groupId}/presence`,
      { headers },
    );
    return res.ok ? "ok" : "fail";
  }
  if (action === "sso_start") {
    const res = await fetch(`${ctx.baseUrl}/api/sso/start`, {
      redirect: "manual",
    });
    // Disabled scaffold returns JSON 200/403; enabled may 302
    if (res.status === 200 || res.status === 302 || res.status === 403) {
      return "ok";
    }
    return "fail";
  }
  if (
    action === "message" ||
    action === "heartbeat" ||
    action === "r2_cycle" ||
    action === "stripe_ping"
  ) {
    if (!ctx.secret) return "skip";
    const body: Record<string, unknown> =
      action === "message"
        ? {
            type: "message",
            groupId: ctx.groupId,
            body: `load tick from ${ctx.username} @ ${new Date().toISOString()}`,
          }
        : action === "heartbeat"
          ? { type: "heartbeat", groupId: ctx.groupId }
          : action === "r2_cycle"
            ? { type: "r2_cycle", workspaceId: ctx.workspaceId }
            : { type: "stripe_ping" };

    const res = await postAction(
      ctx.baseUrl,
      ctx.sessionToken,
      ctx.secret,
      body,
    );
    if (res.status === 200) return "ok";
    if (res.status === 503) return "skip";
    return "fail";
  }
  return "fail";
}
