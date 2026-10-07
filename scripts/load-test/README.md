# Load test harness — realistic 50-user / 30-min session

Simulates **average task-manager usage**, not a spam bot farm.

## Persona mix (~50 users)

| Persona | Share | Behavior |
|---------|-------|----------|
| **lurker** | ~40% | Browse rarely (idle **3–8 min**); almost no chat |
| **worker** | ~30% | Workspace + claim/complete tasks; light chat |
| **chatty** | ~16% | More messages in **small** side chats (not all 50 in one room) |
| **social** | ~8% | Set/share birthday once; light browse |
| **admin** | ~6% | Create/review tasks; rare R2 + Stripe ping (workspace **ADMIN** role) |

Also seeds: multiple folders, ~80+ open backlog tasks, HQ chat + Watercooler + Project Alpha, friendships among social users. Digests **off** (no Resend blast).

## Systems exercised (when configured)

Core pages · pulse/presence (short JSON) · Ably auth · chat · **tasks** (create/claim/complete/review) · birthdays · **R2** (tiny up/down/delete, admin only) · **Cron** (few sweeps) · **Stripe test** pings · SSO scaffold.

### Presence (not SSE)

- Live online/typing: Ably Presence on `chat:{groupId}:presence` (browser clients).
- Load harness hits `GET /api/chat/:id/presence` — **JSON snapshot only**, 8s timeout. Never opens EventSource / long streams.
- Without Ably configured, the app falls back to a slow JSON poll (~20s).

## Env vars (`.env` — vars only, no npm commands)

```bash
LOAD_TEST_BASE_URL=http://localhost:3000
LOAD_TEST_SECRET=your-shared-secret
CRON_SECRET=your-cron-secret
# optional: ABLY_API_KEY, R2_*, STRIPE_SECRET_KEY=sk_test_...
# Preview (vendor-true Vercel/Neon/Ably):
# LOAD_TEST_BASE_URL=https://your-app-git-branch-team.vercel.app
```

## Run

```bash
npm run load-test:seed
npm run dev   # or deploy Preview and point LOAD_TEST_BASE_URL there

LOAD_TEST_BASE_URL=http://localhost:3000 \
LOAD_TEST_SECRET=... CRON_SECRET=... \
npm run load-test:run

# smoke (local or Preview)
LOAD_TEST_DURATION_MIN=5 LOAD_TEST_VUS=10 \
LOAD_TEST_BASE_URL=http://localhost:3000 \
LOAD_TEST_SECRET=... CRON_SECRET=... \
npm run load-test:run

npm run load-test:cleanup
```

**Localhost** does not measure Vercel usage — use a **Preview URL** for vendor-true cost/signal runs.

Refuses `rowgon.com` unless `LOAD_TEST_ALLOW_PROD=1`.

## What “realistic” means for cost

Expect **far fewer** Ably messages and writes than a constant-tick design.  
A 30-min window looks more like a busy team slice → better for extrapolating monthly Neon/Vercel/Ably spend. The harness still undercounts Ably vs real browsers (auth pings, no persistent client sockets per VU).
