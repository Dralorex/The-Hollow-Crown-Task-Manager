"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/mail";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isOwnerOnlyAction, requireMembership } from "@/lib/permissions";

export type BillingActionResult =
  | { ok: true; customerId?: string; url?: string }
  | { ok: false; error: string };

/**
 * Create or return the Stripe Customer linked to this user (test mode OK).
 * Owner-only when workspaceId is provided; otherwise the signed-in user.
 * No subscriptions / plan logic yet.
 */
export async function ensureStripeCustomerAction(
  _prev: BillingActionResult | null,
  formData: FormData,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();

  if (workspaceId) {
    const membership = await requireMembership(workspaceId, user.id);
    if (!isOwnerOnlyAction(membership.role)) {
      return { ok: false, error: "Only the workspace owner can manage billing." };
    }
  }

  if (user.stripeCustomerId) {
    return { ok: true, customerId: user.stripeCustomerId };
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.nickname || user.username,
    metadata: { rowgonUserId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  return { ok: true, customerId: customer.id };
}

/**
 * Optional stub: open Stripe Customer Billing Portal for the linked customer.
 */
export async function createBillingPortalSessionAction(
  _prev: BillingActionResult | null,
  formData: FormData,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  if (workspaceId) {
    const membership = await requireMembership(workspaceId, user.id);
    if (!isOwnerOnlyAction(membership.role)) {
      return { ok: false, error: "Only the workspace owner can manage billing." };
    }
  }

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const created = await ensureStripeCustomerAction(null, formData);
    if (!created.ok || !created.customerId) {
      return {
        ok: false,
        error: created.ok ? "Could not create Stripe customer." : created.error,
      };
    }
    customerId = created.customerId;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getAppBaseUrl()}/app`,
  });

  return { ok: true, url: session.url, customerId };
}
