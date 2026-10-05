-- Billing prefs: auto-close unused seats + auto-add when over cap.

ALTER TABLE "WorkspaceBilling" ADD COLUMN IF NOT EXISTS "autoCloseUnusedSeats" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkspaceBilling" ADD COLUMN IF NOT EXISTS "autoAddSeats" BOOLEAN NOT NULL DEFAULT false;
