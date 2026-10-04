# Infra bootstrap — internal note

**Status:** Ready for monetization feature work.

This pass wires Stripe (test), Cloudflare R2, Vercel Cron, and WorkOS SSO
scaffolding only. It does **not** ship pricing UI, seat ladders, downgrade
wizards, Stats, or entitlement enforcement.

| System | State |
|--------|--------|
| Stripe | Webhook + idempotency + customer/portal stubs |
| R2 | Signed upload/download/delete + `StoredObject` metadata |
| Cron | Secured stubs + weekly digest job |
| WorkOS | Routes present; `ENABLE_SSO=false` by default |
| Virus scan | **Deferred** — hook comments on `confirmUpload` only |

Phase 1 monetization continues on `cursor/monetization-phase1-b27a`
(`docs/MONETIZATION_PHASE1.md`). Keep password auth as break-glass until SSO is
explicitly enabled for Enterprise.
