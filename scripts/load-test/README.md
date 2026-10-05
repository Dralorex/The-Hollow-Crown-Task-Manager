# Load test harness — 50 users × 30 minutes (multi-system)

One run exercises as much of the stack as you have configured, so you don’t burn
Neon/Vercel/Ably on chat-only and then redo work for R2/Cron/Stripe later.

## What gets hit

| System | How | Needs |
|--------|-----|--------|
| Neon + app pages | `/app`, workspace, chat | DB + running app |
| Pulse / presence | `/api/pulse`, chat presence | session cookies |
| Ably | `/api/ably/auth` + chat message fan-out | `ABLY_API_KEY` |
| Chat writes | `/api/load-test/action` message/heartbeat | `LOAD_TEST_SECRET` |
| **R2** | upload → download → **delete** (tiny `.txt`) | R2 env + Admin+ user |
| **Cron** | all 4 `/api/cron/*` stubs ~every 2.5 min | `CRON_SECRET` |
| **Stripe** | ensure customer + `products.list` / retrieve (test mode) | `STRIPE_SECRET_KEY` (test) |
| **SSO** | GET `/api/sso/start` scaffold | none (works disabled) |
| **Resend** | avoided | load users have digests off |

You do **not** need full Team/Business UI for this. Bootstrap + secrets are enough.  
Virus scan stays deferred.

## Safety

- Users: `loaduser_001`… (digests off)
- Refuses `rowgon.com` unless `LOAD_TEST_ALLOW_PROD=1`
- Write API **404** if `LOAD_TEST_SECRET` unset
- R2 objects are deleted in the same cycle (minimal leftover storage)
- Stripe uses **test mode** API only (no real charges). Prefer `sk_test_…`

## Setup

```bash
# .env (local) and/or Vercel Preview
LOAD_TEST_SECRET="long-random-string"
CRON_SECRET="another-long-secret"
# Plus whatever you want exercised:
# ABLY_API_KEY=...
# R2_*=...
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=...   # optional for this harness
```

```bash
npm run load-test:seed
npm run dev   # or Preview URL with same secrets

LOAD_TEST_BASE_URL=http://localhost:3000 \
LOAD_TEST_SECRET=long-random-string \
CRON_SECRET=another-long-secret \
npm run load-test:run
```

Smoke first:

```bash
LOAD_TEST_DURATION_MIN=5 LOAD_TEST_VUS=10 ... npm run load-test:run
```

Cleanup:

```bash
npm run load-test:cleanup
```

## Reading the run

At start the runner prints a **system probe** (`ready` / `not_configured` / `fail_*`).  
At the end it prints per-action ok/fail/skip averages.

Then open dashboards for that window:

- Neon CU / connections  
- Vercel invocations  
- Ably messages  
- R2 Class A/B (should be modest; storage ≈ 0 if deletes work)  
- Stripe test-mode API log (customers/products)  
- Cron responses / `CronRun` rows if migrated  

## Cost honesty

Whatever you point at **will use real quota** for ~30 minutes. Doing core + R2 + Cron + Stripe together is the efficient way to gather cost signals once.
