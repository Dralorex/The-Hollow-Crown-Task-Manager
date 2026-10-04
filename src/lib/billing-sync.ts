import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import {
  baseFeeCents,
  parsePlanId,
  seatPortionCents,
  type BillingInterval,
  type PlanId,
} from "@/lib/plans";
import { paymentFailedEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/mail";

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function intervalFromStripe(
  value: string | null | undefined,
): BillingInterval {
  return value === "year" ? "YEARLY" : "MONTHLY";
}

function stripeInterval(interval: BillingInterval): "month" | "year" {
  return interval === "YEARLY" ? "year" : "month";
}

async function ensureProduct(
  stripe: Stripe,
  name: string,
  metadata: Record<string, string>,
) {
  const existing = await stripe.products.list({ limit: 100 });
  const found = existing.data.find(
    (p) => p.metadata?.rowgonKey === metadata.rowgonKey && p.active,
  );
  if (found) return found.id;
  const created = await stripe.products.create({ name, metadata });
  return created.id;
}

export async function createCheckoutSubscription(opts: {
  customerId: string;
  workspaceId: string;
  plan: Exclude<PlanId, "FREE">;
  interval: BillingInterval;
  seats: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");

  const seats = Math.max(opts.seats, 5);
  const baseCents = baseFeeCents(opts.plan, opts.interval);
  const seatCents =
    opts.interval === "YEARLY"
      ? seatPortionCents(seats) * 10
      : seatPortionCents(seats);
  const recurring = { interval: stripeInterval(opts.interval) as "month" | "year" };

  const baseProductId = await ensureProduct(stripe, `Rowgon ${opts.plan}`, {
    rowgonKey: `base_${opts.plan}`,
  });
  const seatProductId = await ensureProduct(stripe, "Rowgon seats", {
    rowgonKey: "seats",
  });

  const envPriceKey =
    opts.interval === "MONTHLY"
      ? `STRIPE_PRICE_${opts.plan}_MONTHLY`
      : `STRIPE_PRICE_${opts.plan}_YEARLY`;
  const envPrice = process.env[envPriceKey]?.trim();

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  if (envPrice) {
    line_items.push({ price: envPrice, quantity: 1 });
  } else {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: baseCents,
        recurring,
        product: baseProductId,
      },
    });
  }
  if (seatCents > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: seatCents,
        recurring,
        product: seatProductId,
      },
    });
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: opts.customerId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.workspaceId,
    metadata: {
      workspaceId: opts.workspaceId,
      plan: opts.plan,
      seats: String(seats),
      interval: opts.interval,
    },
    subscription_data: {
      metadata: {
        workspaceId: opts.workspaceId,
        plan: opts.plan,
        seats: String(seats),
        interval: opts.interval,
      },
    },
    line_items,
  });
}

export async function syncSubscriptionToWorkspace(
  subscription: Stripe.Subscription,
) {
  const workspaceId =
    subscription.metadata?.workspaceId?.trim() ||
    (typeof subscription.metadata?.rowgonWorkspaceId === "string"
      ? subscription.metadata.rowgonWorkspaceId
      : "");
  if (!workspaceId) {
    console.warn("[billing] subscription missing workspaceId metadata", subscription.id);
    return;
  }

  const plan =
    parsePlanId(subscription.metadata?.plan) ??
    (subscription.status === "canceled" ? "FREE" : null);
  if (!plan && subscription.status !== "canceled") {
    console.warn("[billing] subscription missing plan metadata", subscription.id);
    return;
  }

  const seats = Math.max(
    5,
    Number.parseInt(subscription.metadata?.seats ?? "5", 10) || 5,
  );
  const interval = intervalFromStripe(
    subscription.items.data[0]?.price?.recurring?.interval ??
      subscription.metadata?.interval?.toLowerCase(),
  );

  let status: "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "INCOMPLETE" =
    "ACTIVE";
  if (subscription.status === "past_due") status = "PAST_DUE";
  else if (subscription.status === "canceled") status = "CANCELED";
  else if (subscription.status === "unpaid") status = "UNPAID";
  else if (
    subscription.status === "incomplete" ||
    subscription.status === "incomplete_expired"
  ) {
    status = "INCOMPLETE";
  } else if (subscription.status === "active" || subscription.status === "trialing") {
    status = "ACTIVE";
  }

  const items = subscription.items.data;
  const baseItem = items[0]?.id ?? null;
  const seatItem = items[1]?.id ?? null;

  const periodStart = subscription.items.data[0]?.current_period_start
    ? new Date(subscription.items.data[0].current_period_start * 1000)
    : subscription.start_date
      ? new Date(subscription.start_date * 1000)
      : null;
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000)
    : null;

  const effectivePlan: PlanId =
    status === "CANCELED" || status === "UNPAID" ? "FREE" : (plan as PlanId) ?? "FREE";

  await prisma.workspaceBilling.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      plan: effectivePlan,
      interval: effectivePlan === "FREE" ? null : interval,
      status: effectivePlan === "FREE" ? "ACTIVE" : status,
      seatQuantity: effectivePlan === "FREE" ? 5 : seats,
      stripeSubscriptionId: subscription.id,
      stripeBaseItemId: baseItem,
      stripeSeatItemId: seatItem,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      paymentGraceUntil: status === "PAST_DUE" ? new Date(Date.now() + GRACE_MS) : null,
    },
    update: {
      plan: effectivePlan,
      interval: effectivePlan === "FREE" ? null : interval,
      status: effectivePlan === "FREE" ? "ACTIVE" : status,
      seatQuantity: effectivePlan === "FREE" ? 5 : seats,
      stripeSubscriptionId: subscription.id,
      stripeBaseItemId: baseItem,
      stripeSeatItemId: seatItem,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      ...(status === "ACTIVE"
        ? { paymentGraceUntil: null, lastInvoiceStatus: "paid" }
        : {}),
      ...(status === "PAST_DUE"
        ? { paymentGraceUntil: new Date(Date.now() + GRACE_MS) }
        : {}),
    },
  });
}

/** Increase billed seats on an existing paid subscription (prorates). */
export async function bumpSubscriptionSeats(
  workspaceId: string,
  newSeats: number,
) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");

  const billing = await prisma.workspaceBilling.findUnique({
    where: { workspaceId },
  });
  if (!billing?.stripeSubscriptionId || billing.plan === "FREE") {
    throw new Error("Workspace has no paid subscription.");
  }
  if (!billing.interval) throw new Error("Missing billing interval.");

  const seats = Math.max(newSeats, billing.seatQuantity, 5);
  const seatCents =
    billing.interval === "YEARLY"
      ? seatPortionCents(seats) * 10
      : seatPortionCents(seats);

  const seatProductId = await ensureProduct(stripe, "Rowgon seats", {
    rowgonKey: "seats",
  });
  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: Math.max(seatCents, 0),
    recurring: {
      interval: billing.interval === "YEARLY" ? "year" : "month",
    },
    product: seatProductId,
    metadata: { workspaceId, seats: String(seats) },
  });

  if (billing.stripeSeatItemId) {
    if (seatCents <= 0) {
      await stripe.subscriptionItems.del(billing.stripeSeatItemId, {
        proration_behavior: "create_prorations",
      });
      await prisma.workspaceBilling.update({
        where: { workspaceId },
        data: {
          seatQuantity: seats,
          stripeSeatItemId: null,
        },
      });
    } else {
      await stripe.subscriptionItems.update(billing.stripeSeatItemId, {
        price: price.id,
        quantity: 1,
        proration_behavior: "create_prorations",
      });
      await prisma.workspaceBilling.update({
        where: { workspaceId },
        data: { seatQuantity: seats },
      });
    }
  } else if (seatCents > 0) {
    const item = await stripe.subscriptionItems.create({
      subscription: billing.stripeSubscriptionId,
      price: price.id,
      quantity: 1,
      proration_behavior: "create_prorations",
    });
    await prisma.workspaceBilling.update({
      where: { workspaceId },
      data: {
        seatQuantity: seats,
        stripeSeatItemId: item.id,
      },
    });
  } else {
    await prisma.workspaceBilling.update({
      where: { workspaceId },
      data: { seatQuantity: seats },
    });
  }

  await stripe.subscriptions.update(billing.stripeSubscriptionId, {
    metadata: {
      workspaceId,
      plan: billing.plan,
      seats: String(seats),
      interval: billing.interval,
    },
  });
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripe = getStripe();
  if (!stripe) return;
  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subId) return;
  const subscription = await stripe.subscriptions.retrieve(subId);
  // Ensure metadata from session if Stripe didn't copy it.
  if (!subscription.metadata?.workspaceId && session.metadata?.workspaceId) {
    await stripe.subscriptions.update(subId, {
      metadata: {
        workspaceId: session.metadata.workspaceId,
        plan: session.metadata.plan ?? "",
        seats: session.metadata.seats ?? "5",
        interval: session.metadata.interval ?? "MONTHLY",
      },
    });
    const refreshed = await stripe.subscriptions.retrieve(subId);
    await syncSubscriptionToWorkspace(refreshed);
    return;
  }
  await syncSubscriptionToWorkspace(subscription);
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  if (!stripe) return;
  const subRef = invoice.parent?.subscription_details?.subscription
    ?? (invoice as { subscription?: string | { id: string } | null }).subscription;
  const subId =
    typeof subRef === "string" ? subRef : subRef && typeof subRef === "object" ? subRef.id : null;
  if (!subId) return;

  const subscription = await stripe.subscriptions.retrieve(subId);
  await syncSubscriptionToWorkspace(subscription);

  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) return;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { owner: { select: { email: true, username: true, nickname: true } } },
  });
  if (!workspace?.owner.email) return;

  const mail = paymentFailedEmail({
    username: workspace.owner.username,
    workspaceName: workspace.name,
    graceDays: 3,
  });
  await sendEmail({
    to: workspace.owner.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  await prisma.workspaceBilling.update({
    where: { workspaceId },
    data: {
      status: "PAST_DUE",
      lastInvoiceStatus: "failed",
      paymentGraceUntil: new Date(Date.now() + GRACE_MS),
    },
  });
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  if (!stripe) return;
  const subRef = invoice.parent?.subscription_details?.subscription
    ?? (invoice as { subscription?: string | { id: string } | null }).subscription;
  const subId =
    typeof subRef === "string" ? subRef : subRef && typeof subRef === "object" ? subRef.id : null;
  if (!subId) return;
  const subscription = await stripe.subscriptions.retrieve(subId);
  await syncSubscriptionToWorkspace(subscription);
  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) return;
  await prisma.workspaceBilling.update({
    where: { workspaceId },
    data: {
      status: "ACTIVE",
      lastInvoiceStatus: "paid",
      paymentGraceUntil: null,
    },
  });
}
