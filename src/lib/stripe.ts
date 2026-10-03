import "server-only";
import Stripe from "stripe";

let stripeSingleton: Stripe | null | undefined;

/** True when a Stripe secret key is configured (test or live). */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Server-only Stripe client. Never import this module from client components. */
export function getStripe(): Stripe | null {
  if (stripeSingleton !== undefined) return stripeSingleton;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    stripeSingleton = null;
    return null;
  }
  stripeSingleton = new Stripe(key, {
    apiVersion: "2026-09-30.endive",
    typescript: true,
  });
  return stripeSingleton;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}
