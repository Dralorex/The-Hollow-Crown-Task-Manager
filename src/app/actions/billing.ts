"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/mail";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { isOwnerOnlyAction, requireMembership } from "@/lib/permissions";
import {
  createCheckoutSubscription,
} from "@/lib/billing-sync";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import {
  formatUsdFromCents,
  parsePlanId,
  seatPortionCents,
  totalPeriodCents,
  type BillingInterval,
  type PlanId,
  PLANS,
} from "@/lib/plans";

export type BillingActionResult =
  | {
      ok: true;
      customerId?: string;
      url?: string;
      message?: string;
    }
  | { ok: false; error: string };

async function requireOwner(workspaceId: string) {
  const user = await requireUser();
  const membership = await requireMembership(workspaceId, user.id);
  if (!isOwnerOnlyAction(membership.role)) {
    throw new Error("OWNER_ONLY");
  }
  return user;
}

/**
 * Checkout/portal return URL. In local dev, prefer localhost even when
 * APP_URL points at production (otherwise Stripe sends you to rowgon.com
 * and you look “signed out”).
 */
function getBillingReturnBaseUrl() {
  const override = process.env.BILLING_RETURN_URL?.trim().replace(/\/$/, "");
  if (override) return override;
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return getAppBaseUrl();
}

/**
 * Create or return the Stripe Customer linked to this user.
 * Owner-only when workspaceId is provided.
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
    try {
      await requireOwner(workspaceId);
    } catch {
      return { ok: false, error: "Only the workspace owner can manage billing." };
    }
  }

  if (user.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(user.stripeCustomerId);
      if (!("deleted" in existing && existing.deleted)) {
        return { ok: true, customerId: user.stripeCustomerId };
      }
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      const message = err instanceof Error ? err.message : String(err);
      // Stale id (wrong Stripe account, deleted customer, test/live mix).
      if (code !== "resource_missing" && !/No such customer/i.test(message)) {
        throw err;
      }
      console.warn(
        "[billing] clearing stale stripeCustomerId",
        user.stripeCustomerId,
      );
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: null },
    });
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

export async function createBillingPortalSessionAction(
  _prev: BillingActionResult | null,
  formData: FormData,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  let user;
  try {
    user = workspaceId
      ? await requireOwner(workspaceId)
      : await requireUser();
  } catch {
    return { ok: false, error: "Only the workspace owner can manage billing." };
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

  const returnPath = workspaceId ? `/app/w/${workspaceId}` : "/app";
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getBillingReturnBaseUrl()}${returnPath}`,
  });

  return { ok: true, url: session.url, customerId };
}

/**
 * Start Stripe Checkout to upgrade a workspace to Team / Business / Enterprise.
 */
export async function startWorkspaceCheckoutAction(
  _prev: BillingActionResult | null,
  formData: FormData,
): Promise<BillingActionResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe is not configured." };
  }

  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const planRaw = String(formData.get("plan") ?? "").trim();
  const intervalRaw = String(formData.get("interval") ?? "MONTHLY").trim();
  const plan = parsePlanId(planRaw);
  if (!workspaceId || !plan || plan === "FREE") {
    return { ok: false, error: "Pick a paid plan for this workspace." };
  }
  const interval: BillingInterval =
    intervalRaw.toUpperCase() === "YEARLY" ? "YEARLY" : "MONTHLY";

  let user;
  try {
    user = await requireOwner(workspaceId);
  } catch {
    return { ok: false, error: "Only the workspace owner can upgrade billing." };
  }

  const ent = await getWorkspaceEntitlements(workspaceId);
  const seats = Math.max(ent.memberCount, 5);
  const max = PLANS[plan].maxSeats;
  if (max != null && seats > max) {
    return {
      ok: false,
      error: `${PLANS[plan].name} allows up to ${max} seats. Remove members or choose a higher plan.`,
    };
  }

  const customerResult = await ensureStripeCustomerAction(null, formData);
  if (!customerResult.ok || !customerResult.customerId) {
    return {
      ok: false,
      error: customerResult.ok
        ? "Could not create Stripe customer."
        : customerResult.error,
    };
  }

  const base = getBillingReturnBaseUrl();
  try {
    const session = await createCheckoutSubscription({
      customerId: customerResult.customerId,
      workspaceId,
      plan,
      interval,
      seats,
      // {CHECKOUT_SESSION_ID} is filled by Stripe so we can sync without waiting on webhooks.
      successUrl: `${base}/app/w/${workspaceId}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/app/w/${workspaceId}?billing=cancel`,
    });
    if (!session.url) {
      return { ok: false, error: "Stripe did not return a checkout URL." };
    }
    return {
      ok: true,
      url: session.url,
      message: `Checkout for ${PLANS[plan].name} · ${formatUsdFromCents(totalPeriodCents(plan, seats, interval))}/${interval === "YEARLY" ? "year" : "mo"} (seats beyond 5: ${formatUsdFromCents(seatPortionCents(seats))}/mo equivalent).`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed.";
    console.error("[billing:checkout]", message);
    return { ok: false, error: message };
  }
}

export async function getWorkspaceBillingSummaryAction(workspaceId: string) {
  const user = await requireUser();
  await requireMembership(workspaceId, user.id);
  const ent = await getWorkspaceEntitlements(workspaceId);
  const billing = await prisma.workspaceBilling.findUnique({
    where: { workspaceId },
  });
  return {
    plan: ent.plan,
    planName: ent.definition.name,
    status: ent.status,
    seatQuantity: ent.seatQuantity,
    memberCount: ent.memberCount,
    interval: billing?.interval ?? null,
    periodEnd: billing?.currentPeriodEnd?.toISOString() ?? null,
    inPaymentGrace: ent.inPaymentGrace,
    billingOk: ent.billingOk,
    seatPortionLabel: formatUsdFromCents(seatPortionCents(ent.seatQuantity)),
    estimates: {
      teamMonthly: formatUsdFromCents(
        totalPeriodCents("TEAM", Math.max(ent.memberCount, 5), "MONTHLY"),
      ),
      businessMonthly: formatUsdFromCents(
        totalPeriodCents("BUSINESS", Math.max(ent.memberCount, 5), "MONTHLY"),
      ),
    },
  };
}

export async function revalidateBillingPaths(workspaceId: string) {
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app");
}
