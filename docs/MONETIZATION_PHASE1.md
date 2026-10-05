# Monetization Phase 1 — Money + hard caps

**Seat ladder (confirmed):** 1–5 free · 6–25 **$2.50** · 26–100 **$5** · 101+ **$10**  
**Bases:** Team $12 · Business $30 · Enterprise $80 (yearly = 10× monthly)

## Shipped in this phase

- `WorkspaceBilling` + migration backfill (Free for existing workspaces)
- Plan catalog + seat math (`src/lib/plans.ts`)
- Entitlement service + Free-slot rule (`src/lib/entitlements.ts`)
- Stripe Checkout (base + seat portion via `price_data` or env Price ids)
- Webhook sync for checkout / subscription / invoice paid|failed
- Seat bump + proration when invites exceed billed quantity on paid plans
- Hard gates: invite past Free 5, custom roles past Free 2, group chats past Free 1
- Owner Billing panel on workspace sidebar
- Payment-failed email + 3-day grace (`paymentGraceUntil`)

## Not in Phase 1 (later)

- Downgrade / upgrade wizards with Skip
- Limited view-only members
- Role deactivate/lock, chat shell retention
- Stats system, storage browser UI
- Enterprise org shared pool (typed seats self-serve Checkout is stubbed per-workspace)

## Local test

1. Migrate: `npx prisma migrate deploy`
2. `stripe listen --forward-to localhost:3000/api/stripe/webhook --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed`
3. Owner opens workspace → **Billing** → Upgrade to Team
4. Complete Checkout in test mode; webhook should set plan TEAM
5. Invite past 5 on Free → blocked with upgrade message
