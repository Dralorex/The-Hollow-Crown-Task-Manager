# Load test harness — realistic 50-user / 30-min session

Simulates **average task-manager usage**, not a spam bot farm.

## Persona mix (~50 users)

| Persona | Share | Behavior |
|---------|-------|----------|
| **lurker** | ~40% | Browse rarely (idle **3–8 min**); almost no chat |
| **worker** | ~30% | Workspace + claim/complete tasks; light chat |
| **chatty** | ~16% | More messages in **small** side chats (not all 50 in one room) |
| **social** | ~8% | Set/share birthday once; light browse |
| **admin** | ~6% | Create/review tasks; rare R2 + Stripe ping |

Also seeds: multiple folders, ~80+ open backlog tasks, HQ chat + Watercooler + Project Alpha, friendships among social users. Digests **off** (no Resend blast).

## Systems exercised (when configured)

Core pages · pulse/presence · Ably · chat · **tasks** (create/claim/complete/review) · birthdays · **R2** (tiny up/down/delete) · **Cron** (few sweeps) · **Stripe test** pings · SSO scaffold.

## Run

```bash
# .env: LOAD_TEST_SECRET, CRON_SECRET, optional ABLY / R2 / STRIPE sk_test_
npm run load-test:seed
npm run dev

LOAD_TEST_BASE_URL=http://localhost:3000 \
LOAD_TEST_SECRET=... CRON_SECRET=... \
npm run load-test:run

# smoke
LOAD_TEST_DURATION_MIN=5 LOAD_TEST_VUS=20 ... npm run load-test:run

npm run load-test:cleanup
```

Refuses `rowgon.com` unless `LOAD_TEST_ALLOW_PROD=1`.

## What “realistic” means for cost

Expect **far fewer** Ably messages and writes than the old constant-tick design.  
A 30-min window looks more like a busy team slice → better for extrapolating monthly Neon/Vercel/Ably spend.
