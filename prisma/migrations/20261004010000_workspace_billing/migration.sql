-- Phase 1 monetization: per-workspace billing / entitlements state.

CREATE TYPE "PlanId" AS ENUM ('FREE', 'TEAM', 'BUSINESS', 'ENTERPRISE');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "BillingStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE');

CREATE TABLE "WorkspaceBilling" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" "PlanId" NOT NULL DEFAULT 'FREE',
    "interval" "BillingInterval",
    "status" "BillingStatus" NOT NULL DEFAULT 'ACTIVE',
    "seatQuantity" INTEGER NOT NULL DEFAULT 5,
    "stripeSubscriptionId" TEXT,
    "stripeBaseItemId" TEXT,
    "stripeSeatItemId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pendingPlan" "PlanId",
    "pendingSeatQuantity" INTEGER,
    "pendingEffectiveAt" TIMESTAMP(3),
    "paymentGraceUntil" TIMESTAMP(3),
    "lastInvoiceStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceBilling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceBilling_workspaceId_key" ON "WorkspaceBilling"("workspaceId");
CREATE UNIQUE INDEX "WorkspaceBilling_stripeSubscriptionId_key" ON "WorkspaceBilling"("stripeSubscriptionId");
CREATE INDEX "WorkspaceBilling_plan_idx" ON "WorkspaceBilling"("plan");
CREATE INDEX "WorkspaceBilling_status_idx" ON "WorkspaceBilling"("status");
CREATE INDEX "WorkspaceBilling_stripeSubscriptionId_idx" ON "WorkspaceBilling"("stripeSubscriptionId");

ALTER TABLE "WorkspaceBilling" ADD CONSTRAINT "WorkspaceBilling_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Free billing rows for existing workspaces.
INSERT INTO "WorkspaceBilling" ("id", "workspaceId", "plan", "status", "seatQuantity", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), w."id", 'FREE', 'ACTIVE', 5, CURRENT_TIMESTAMP
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceBilling" b WHERE b."workspaceId" = w."id"
);
