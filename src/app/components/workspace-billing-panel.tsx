"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createBillingPortalSessionAction,
  startWorkspaceCheckoutAction,
} from "@/app/actions/billing";
import { formatUsdFromCents, totalPeriodCents } from "@/lib/plans";

type Props = {
  workspaceId: string;
  planName: string;
  plan: string;
  status: string;
  memberCount: number;
  seatQuantity: number;
  interval: string | null;
  periodEnd: string | null;
  inPaymentGrace: boolean;
  billingOk: boolean;
  isOwner: boolean;
};

export function WorkspaceBillingPanel({
  workspaceId,
  planName,
  plan,
  status,
  memberCount,
  seatQuantity,
  interval,
  periodEnd,
  inPaymentGrace,
  billingOk,
  isOwner,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const seats = Math.max(memberCount, 5);

  function runCheckout(planId: "TEAM" | "BUSINESS" | "ENTERPRISE", iv: "MONTHLY" | "YEARLY") {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("plan", planId);
      fd.set("interval", iv);
      const result = await startWorkspaceCheckoutAction(null, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      router.refresh();
    });
  }

  function openPortal() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      const result = await createBillingPortalSessionAction(null, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    });
  }

  return (
    <div className="tide-panel p-4">
      <h3 className="font-[family-name:var(--font-display)] text-lg text-[#0A3D45]">
        Billing
      </h3>
      <p className="mt-1 text-sm text-[#0A3D45]/70">
        Rowgon is free for personal use. Upgrade this workspace when your team
        needs more seats and admin tools — not to unlock the basics.
      </p>
      <dl className="mt-3 space-y-1 text-sm text-[#0A3D45]/85">
        <div className="flex justify-between gap-2">
          <dt>Plan</dt>
          <dd className="font-medium">{planName}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Members / seats</dt>
          <dd className="font-medium">
            {memberCount} / {seatQuantity}
          </dd>
        </div>
        {interval ? (
          <div className="flex justify-between gap-2">
            <dt>Cadence</dt>
            <dd className="font-medium">{interval.toLowerCase()}</dd>
          </div>
        ) : null}
        {periodEnd ? (
          <div className="flex justify-between gap-2">
            <dt>Period ends</dt>
            <dd className="font-medium">
              {new Date(periodEnd).toLocaleDateString()}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt>Status</dt>
          <dd className="font-medium">
            {status}
            {inPaymentGrace ? " (grace)" : ""}
          </dd>
        </div>
      </dl>

      {!billingOk ? (
        <p className="mt-3 rounded-md bg-[#E85D4C]/10 px-3 py-2 text-sm text-[#E85D4C]">
          Payment issue — update your card to keep paid features.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-[#E85D4C]" role="alert">
          {error}
        </p>
      ) : null}

      {isOwner ? (
        <div className="mt-4 space-y-2">
          {plan === "FREE" || plan === "TEAM" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => runCheckout("TEAM", "MONTHLY")}
              className="tide-btn-primary w-full text-sm"
            >
              Upgrade to Team ·{" "}
              {formatUsdFromCents(totalPeriodCents("TEAM", seats, "MONTHLY"))}
              /mo
            </button>
          ) : null}
          {plan !== "BUSINESS" && plan !== "ENTERPRISE" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => runCheckout("BUSINESS", "MONTHLY")}
              className="tide-btn-secondary w-full text-sm"
            >
              Upgrade to Business ·{" "}
              {formatUsdFromCents(
                totalPeriodCents("BUSINESS", seats, "MONTHLY"),
              )}
              /mo
            </button>
          ) : null}
          {plan !== "ENTERPRISE" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => runCheckout("ENTERPRISE", "MONTHLY")}
              className="tide-btn-secondary w-full text-sm"
            >
              Upgrade to Enterprise ·{" "}
              {formatUsdFromCents(
                totalPeriodCents("ENTERPRISE", seats, "MONTHLY"),
              )}
              /mo
            </button>
          ) : null}
          {plan !== "FREE" ? (
            <button
              type="button"
              disabled={pending}
              onClick={openPortal}
              className="w-full text-sm text-[#0A3D45]/70 underline"
            >
              Manage payment method
            </button>
          ) : null}
          <p className="text-xs text-[#0A3D45]/55">
            Seats 1–5 free; 6–25 $2.50; 26–100 $5; 101+ $10. Yearly = 10× monthly
            at checkout (choose yearly in a later pass / portal).
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#0A3D45]/60">
          Only the workspace owner can change billing.
        </p>
      )}
    </div>
  );
}
