# Rowgon Task Manager

Collaborative task management — nested folders, claimable tasks, roles, friends, and private chats.

Production: [https://rowgon.com](https://rowgon.com)

## Features (v1)

- **Auth** — username + password; optional email for password reset
- **Workspaces** — many per user; roles: Owner, Admin, Editor, Member
- **Folders & tasks** — nested folders (name required); priority + due date urgency edge
- **Claim & calendar** — pick up tasks; due dates sync to your in-app calendar
- **Review flow** — members complete with a comment; Owner/Admin review
- **Tags** — public tags (Editor+); private tags after claiming a task
- **Search** — name relevance + tag filters in the current folder area
- **Invites** — Owner/Admin invite by username or email
- **Social** — friends; DMs (friends free; workspace DMs need accept); Admin+ group chats
- **Custom roles** — workspace roles for folder access and role-based task alerts

## Stack

Next.js (App Router) · Prisma · Neon Postgres · bcrypt sessions · Tailwind CSS

## Local setup

1. Create a free [Neon](https://neon.tech) database.
2. Copy env and fill in both connection strings from the Neon console:

```bash
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo login after seeding: **`rowgon_demo` / `password123`**

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Connect a database (pick one):
   - **Neon integration** in Vercel → Storage / Marketplace, **or**
   - Paste env vars from the [Neon console](https://console.neon.tech) under **Settings → Environment Variables**
4. Ensure these are set for **Production** and **Preview** (empty values count as missing):
   - `rowgon_storage_DATABASE_URL` — Neon **pooled** connection string  
   - `rowgon_storage_DATABASE_URL_UNPOOLED` — Neon **direct** connection string  
   - `APP_URL` — `https://rowgon.com`
   - `EMAIL_FROM` — e.g. `Rowgon <noreply@rowgon.com>` (after verifying the domain in Resend)
5. Point the Vercel project’s production domain to **rowgon.com** (and `www` if you use it).
6. Redeploy. The build runs `prisma migrate deploy`, seeds the demo user, then `next build`.

If the build says the connection URL is empty, the env vars were not applied to that environment — open the failed deployment → **Environment**, confirm `rowgon_storage_DATABASE_URL` is present, then **Redeploy**. Older `ROWGON_DATABASE_URL*` / `TheHollowCrown_DATABASE_URL*` names are still accepted as fallbacks.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build (no migrate) |
| `npm run vercel-build` | Migrate, seed, and build (used on Vercel) |
| `npm run db:seed` | Seed demo user + sample workspace |
| `npx prisma migrate deploy` | Apply migrations |
| `npx prisma studio` | Browse data |

## Infra bootstrap (payments, files, cron, SSO)

Scaffolding only — **no pricing UI, seat ladders, or entitlement enforcement yet**.
Ready for monetization feature work next. **Virus scanning is planned later** (hook
comments around upload confirm); do not enable a scanner in this phase.

### Stripe + Phase 1 monetization

Seat ladder: **1–5 free · 6–25 $2.50 · 26–100 $5 · 101+ $10**. Bases: Team $12 / Business $30 / Enterprise $80 (yearly = 10× monthly). See `docs/MONETIZATION_PHASE1.md`.

1. Create a [Stripe](https://dashboard.stripe.com/test/apikeys) account and copy **test** keys into `.env`:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PUBLISHABLE_KEY` (optional)
   - `STRIPE_WEBHOOK_SECRET` (from CLI or Dashboard webhook)
2. Forward webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed
```

3. Owner opens a workspace → **Billing** sidebar → Upgrade (Checkout).  
4. Webhooks sync `WorkspaceBilling`; invites/roles/group chats enforce Free caps.

### Cloudflare R2 (private files)

Neon is **not** file storage. Bytes go in R2; metadata in `StoredObject`.

1. Create a **private** R2 bucket + API token with object read/write.
2. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`.
3. Server actions (Admin+): `requestUploadUrlAction` → client PUT → `confirmUploadAction` → `requestDownloadUrlAction` / `deleteStoredObjectAction`.
4. Temporary hard max **25 MB** + MIME allowlist (not plan-based yet).
5. Virus scan: **deferred** — see comments in `src/app/actions/storage.ts`.
6. Local connectivity check (no UI required):

```bash
npm run smoke:r2
```

### Vercel Cron

Routes (all require `CRON_SECRET`):

| Path | Schedule (UTC) | Notes |
|------|----------------|-------|
| `/api/cron/retention-purge` | daily 06:00 | stub |
| `/api/cron/seat-renewal` | hourly | stub |
| `/api/cron/dunning` | daily 06:30 | stub |
| `/api/cron/weekly-digest` | Mondays 14:00 | real digest send (opt-in users; skips empty) |

Local smoke test:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/retention-purge
```

Missing/wrong secret → `401`. Runs are logged in `CronRun`.

### WorkOS SSO (disabled by default)

Password auth remains primary. Set `ENABLE_SSO=true` only while testing.

1. Configure `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`.
2. Start: `GET /api/sso/start?organization=org_…` (or `connection=` / scaffold `provider=GoogleOAuth`).
3. Callback: `/api/sso/callback` maps an existing user by email / `workosUserId`.
4. Production should keep `ENABLE_SSO=false` until the Enterprise phase.

### Security checklist

- [x] No secrets in client bundles (`server-only` Stripe/R2/WorkOS modules)
- [x] Stripe webhook signature verified + idempotent event ids
- [x] R2 private + short-TTL signed URLs; no public listing
- [x] Cron routes secret-protected
- [x] SSO flag default false
- [x] Virus scan deferred (commented hooks only)
- [x] No plan/seat business logic in this pass

## Roles

| Role | Content | Invite | Review |
|------|---------|--------|--------|
| Owner | Full | Yes | Yes |
| Admin | Full | Yes | Yes |
| Editor | Full | No | Yes |
| Member | Claim / complete | No | No |
