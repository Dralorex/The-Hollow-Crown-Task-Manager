/**
 * Realistic ~30 min session mix for ~50 seeded users.
 *
 * Not a chat-spam bot farm: personas + long idle gaps mimic average task-manager use
 * (many lurkers, some workers, a few chatty, rare admin/R2/Stripe).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CREDENTIALS_PATH,
  DEFAULT_DURATION_MIN,
  type LoadCredentials,
  personaActions,
  personaSleepMs,
} from "./config";

type Stats = {
  ok: number;
  fail: number;
  skip: number;
  byAction: Record<
    string,
    { ok: number; fail: number; skip: number; msTotal: number }
  >;
  byPersona: Record<string, { actions: number; messages: number }>;
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
      `Refusing to load-test ${host}. Use staging/Preview/local, or set LOAD_TEST_ALLOW_PROD=1.`,
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
  console.log(`Load test runner → ${baseUrl}`);
  console.log(`Credentials: ${credPath}`);
  if (!secret) {
    console.warn(
      "LOAD_TEST_SECRET unset — browse/pulse only; write actions (chat/tasks/R2/Stripe) skipped.",
    );
  }

  const creds = JSON.parse(await readFile(credPath, "utf8")) as LoadCredentials;
  if (!creds.users?.length) {
    throw new Error("No users in credentials file. Run seed first.");
  }
  // Back-compat if someone has old credentials without personas
  for (const u of creds.users) {
    if (!u.persona) {
      (u as { persona: string }).persona =
        u.index <= 2 ? "admin" : "worker";
    }
    if (!u.chatGroupId) {
      u.chatGroupId = creds.hqGroupId || (creds as { groupId?: string }).groupId || "";
    }
  }
  if (!creds.folderIds?.length && (creds as { folderId?: string }).folderId) {
    creds.folderIds = [(creds as { folderId: string }).folderId];
  }
  if (!creds.hqGroupId && (creds as { groupId?: string }).groupId) {
    creds.hqGroupId = (creds as { groupId: string }).groupId;
  }
  if (!creds.sideGroupIds) creds.sideGroupIds = [];

  const vuCount = Math.max(
    1,
    Math.min(
      creds.users.length,
      Number(process.env.LOAD_TEST_VUS || creds.users.length) ||
        creds.users.length,
    ),
  );

  console.log("Probing systems…");
  let caps: Caps;
  try {
    caps = await probeSystems(baseUrl, secret, cronSecret, creds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot reach ${baseUrl} (${msg}). Start the app in another terminal (npm run dev), then retry.`,
    );
  }
  console.log("\n=== System probe ===");
  for (const [k, v] of Object.entries(caps)) {
    console.log(`  ${k.padEnd(12)} ${v}`);
  }

  const mix = creds.users.reduce(
    (acc, u) => {
      acc[u.persona] = (acc[u.persona] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log("\n=== Persona mix (seeded) ===");
  console.log(mix);
  console.log(
    "\nPacing: lurkers idle 3–8m; workers 1.5–4m; chatty 45s–2.5m — not constant spam.",
  );

  console.log(`\nBase URL:     ${baseUrl}`);
  console.log(`Duration:     ${durationMin} min`);
  console.log(`Workers:      ${vuCount}`);
  console.log("Starting in 3s…");
  await sleep(3000);

  const stats: Stats = {
    ok: 0,
    fail: 0,
    skip: 0,
    byAction: {},
    byPersona: {},
  };
  const endsAt = Date.now() + durationMs;

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

  // Social users share birthdays once near start (realistic one-time setup)
  if (secret) {
    await Promise.all(
      creds.users
        .filter((u) => u.persona === "social")
        .map(async (u) => {
          await sleep(Math.floor(Math.random() * 20_000));
          const started = Date.now();
          const r = await postAction(baseUrl, u.sessionToken, secret, {
            type: "share_birthday",
            workspaceId: creds.workspaceId,
          });
          const result =
            r.status === 200 ? "ok" : r.status === 503 ? "skip" : "fail";
          track(stats, "share_birthday", result, Date.now() - started);
        }),
    );
  }

  const workers = Array.from({ length: vuCount }, (_, i) =>
    workerLoop({
      user: creds.users[i]!,
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
  console.log("\nBy action:");
  for (const [action, s] of Object.entries(stats.byAction).sort()) {
    const n = s.ok + s.fail + s.skip;
    const avg = n ? Math.round(s.msTotal / n) : 0;
    console.log(
      `  ${action.padEnd(16)} ok=${s.ok} fail=${s.fail} skip=${s.skip} avgMs=${avg}`,
    );
  }
  console.log("\nBy persona (actions / messages):");
  for (const [p, s] of Object.entries(stats.byPersona).sort()) {
    console.log(`  ${p.padEnd(10)} actions=${s.actions} messages=${s.messages}`);
  }
  console.log(
    "\nCheck Neon / Vercel / Ably / R2 / Stripe test / Cron for this window.",
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
  const core =
    home.status >= 200 && home.status < 400 ? "ready" : `fail_${home.status}`;

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
  creds: LoadCredentials;
  baseUrl: string;
  secret?: string;
  caps: Caps;
  endsAt: number;
  stats: Stats;
}) {
  const cookie = `rowgon_session=${opts.user.sessionToken}`;
  const persona = opts.user.persona;
  const actions = personaActions(persona, {
    writes: Boolean(opts.secret),
    r2: persona === "admin" && opts.caps.r2 === "ready",
    stripe: persona === "admin" && opts.caps.stripe === "ready",
  });

  // Stagger start so 50 people don't synchronize
  await sleep(Math.floor(Math.random() * 60_000));

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
        folderIds: opts.creds.folderIds ?? [],
        groupId: opts.user.chatGroupId || opts.creds.hqGroupId,
        hqGroupId: opts.creds.hqGroupId,
        username: opts.user.username,
      });
    } catch {
      result = "fail";
    }
    track(opts.stats, action, result, Date.now() - started);
    const p = (opts.stats.byPersona[persona] ??= { actions: 0, messages: 0 });
    p.actions += 1;
    if (action === "message" && result === "ok") p.messages += 1;

    await sleep(personaSleepMs(persona));
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

  // Background jobs: a few times per half hour, not every minute
  await sleep(90_000);
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
    await sleep(480_000); // ~8 min between cron sweeps
  }
}

async function runAction(
  action: string,
  ctx: {
    baseUrl: string;
    cookie: string;
    sessionToken: string;
    secret?: string;
    workspaceId: string;
    folderIds: string[];
    groupId: string;
    hqGroupId: string;
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
    const gid = ctx.groupId || ctx.hqGroupId;
    // Short JSON snapshot (Ably or Neon) — never long-poll SSE.
    const res = await fetch(`${ctx.baseUrl}/api/chat/${gid}/presence`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok ? "ok" : "fail";
  }
  if (action === "sso_start") {
    const res = await fetch(`${ctx.baseUrl}/api/sso/start`, {
      redirect: "manual",
    });
    if (res.status === 200 || res.status === 302 || res.status === 403) {
      return "ok";
    }
    return "fail";
  }

  const writeTypes = new Set([
    "message",
    "heartbeat",
    "r2_cycle",
    "stripe_ping",
    "create_task",
    "claim_task",
    "complete_task",
    "review_task",
    "share_birthday",
  ]);
  if (writeTypes.has(action)) {
    if (!ctx.secret) return "skip";
    const folderId =
      ctx.folderIds[Math.floor(Math.random() * Math.max(1, ctx.folderIds.length))];
    const body: Record<string, unknown> = { type: action };
    if (
      action === "message" ||
      action === "heartbeat" ||
      action === "presence"
    ) {
      body.groupId = ctx.groupId || ctx.hqGroupId;
      if (action === "message") {
        body.body = casualMessage(ctx.username);
      }
    }
    if (
      action === "r2_cycle" ||
      action === "create_task" ||
      action === "claim_task" ||
      action === "complete_task" ||
      action === "review_task" ||
      action === "share_birthday"
    ) {
      body.workspaceId = ctx.workspaceId;
    }
    if (action === "create_task" && folderId) body.folderId = folderId;

    const res = await postAction(
      ctx.baseUrl,
      ctx.sessionToken,
      ctx.secret,
      body,
    );
    if (res.status === 200) {
      try {
        const json = (await res.json()) as { skipped?: boolean };
        if (json.skipped) return "skip";
      } catch {
        // ok
      }
      return "ok";
    }
    if (res.status === 503) return "skip";
    return "fail";
  }
  return "fail";
}

function casualMessage(username: string) {
  const lines = [
    `hey — quick update from ${username}`,
    "taking a look at the board",
    "claimed one, will ping when done",
    "anyone free to review later?",
    "standup note: still in progress",
    "thanks!",
    "moving this to review",
  ];
  return pick(lines);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
