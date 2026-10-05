# Load test harness — 50 users × 30 minutes

Simulates busy usage so you can watch **Neon / Vercel / Ably** dashboards and ground real costs.  
**Resend is avoided** (load users have digests off; write path sends no email).

## Safety

- Users are named `loaduser_001` … (not the `test` cleanup pattern).
- Runner **refuses** `rowgon.com` unless `LOAD_TEST_ALLOW_PROD=1`.
- Write API returns **404** unless `LOAD_TEST_SECRET` is set on the server.
- Prefer **local** or **Vercel Preview** — not production.

## Cost note

This **does** burn real quota on whatever you point at (Neon compute, Vercel invocations, Ably messages). A 30‑minute staging run is usually small; production is a bad idea.

## Setup

1. Ensure DB env is set (`.env` → Neon local/preview).
2. Add to `.env` (and Preview env if used):

```bash
LOAD_TEST_SECRET="long-random-string"
```

3. Seed users:

```bash
npm run load-test:seed
# optional: LOAD_TEST_USERS=50
```

4. Start the app:

```bash
npm run dev
# or use a Preview URL with LOAD_TEST_SECRET configured
```

5. Run 30 minutes with 50 workers:

```bash
LOAD_TEST_BASE_URL=http://localhost:3000 \
LOAD_TEST_SECRET=long-random-string \
npm run load-test:run
```

Optional:

```bash
LOAD_TEST_DURATION_MIN=30
LOAD_TEST_VUS=50
```

6. Cleanup when finished:

```bash
npm run load-test:cleanup
```

## What each fake user does

Rough mix every few seconds:

- Open `/app`, workspace, `/app/chat`
- Hit `/api/pulse`, `/api/ably/auth`, chat presence
- POST load-test message / heartbeat (if secret set)

## After the run

Check for the same time window:

| Dashboard | Look at |
|-----------|---------|
| Neon | CU-hours, connections, storage |
| Vercel | Invocations / Fluid compute |
| Ably | Messages / connections |
| Resend | Should stay flat |

Use that slice to sanity-check the “100 users” infra row in the pricing sheet (scale ~2× for 100 if the mix is similar).
