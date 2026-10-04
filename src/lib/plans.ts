/** Confirmed Phase 1 seat ladder (overrides older $5/$10/$15 draft). */
export const SEAT_FREE_INCLUDED = 5;

export type PlanId = "FREE" | "TEAM" | "BUSINESS" | "ENTERPRISE";
export type BillingInterval = "MONTHLY" | "YEARLY";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  /** Monthly base fee in USD cents. */
  baseMonthlyCents: number;
  /** Max full-active seats (null = unlimited / typed). */
  maxSeats: number | null;
  maxCustomRoles: number | null;
  maxGroupChats: number | null;
  /** Storage bytes; 0 = none. */
  storageBytes: number;
  features: {
    audit: boolean;
    bulkAdmin: boolean;
    calendarSync: boolean;
    fullExport: boolean;
    sso: boolean;
    unlimitedGroupChats: boolean;
  };
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  FREE: {
    id: "FREE",
    name: "Free",
    baseMonthlyCents: 0,
    maxSeats: 5,
    maxCustomRoles: 2,
    maxGroupChats: 1,
    storageBytes: 0,
    features: {
      audit: false,
      bulkAdmin: false,
      calendarSync: false,
      fullExport: false,
      sso: false,
      unlimitedGroupChats: false,
    },
  },
  TEAM: {
    id: "TEAM",
    name: "Team",
    baseMonthlyCents: 1200,
    maxSeats: 25,
    maxCustomRoles: 10,
    maxGroupChats: null,
    storageBytes: 5 * 1024 * 1024 * 1024,
    features: {
      audit: false,
      bulkAdmin: false,
      calendarSync: false,
      fullExport: false,
      sso: false,
      unlimitedGroupChats: true,
    },
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business",
    baseMonthlyCents: 3000,
    maxSeats: 100,
    maxCustomRoles: null,
    maxGroupChats: null,
    storageBytes: 50 * 1024 * 1024 * 1024,
    features: {
      audit: true,
      bulkAdmin: true,
      calendarSync: true,
      fullExport: true,
      sso: false,
      unlimitedGroupChats: true,
    },
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    baseMonthlyCents: 8000,
    maxSeats: null,
    maxCustomRoles: null,
    maxGroupChats: null,
    storageBytes: 0, // org-pooled later
    features: {
      audit: true,
      bulkAdmin: true,
      calendarSync: true,
      fullExport: true,
      sso: true,
      unlimitedGroupChats: true,
    },
  },
};

/**
 * Seat portion only (USD cents / month), ascending ladder:
 * 1–5 free, 6–25 @ $2.50, 26–100 @ $5, 101+ @ $10.
 */
export function seatPortionCents(seatCount: number): number {
  const n = Math.max(0, Math.floor(seatCount));
  if (n <= SEAT_FREE_INCLUDED) return 0;
  if (n <= 25) return (n - SEAT_FREE_INCLUDED) * 250;
  if (n <= 100) return 20 * 250 + (n - 25) * 500;
  return 20 * 250 + 75 * 500 + (n - 100) * 1000;
}

export function baseFeeCents(plan: PlanId, interval: BillingInterval): number {
  const monthly = PLANS[plan].baseMonthlyCents;
  if (plan === "FREE") return 0;
  // Yearly = 10 × monthly (~2 months free).
  return interval === "YEARLY" ? monthly * 10 : monthly;
}

/** Total plan charge for a period in cents (base + seats; seats always monthly-equivalent × 10 on yearly). */
export function totalPeriodCents(
  plan: PlanId,
  seats: number,
  interval: BillingInterval,
): number {
  const seatMonthly = seatPortionCents(seats);
  const seatsCharge = interval === "YEARLY" ? seatMonthly * 10 : seatMonthly;
  return baseFeeCents(plan, interval) + seatsCharge;
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function isPaidPlan(plan: PlanId): boolean {
  return plan !== "FREE";
}

export function parsePlanId(value: string | null | undefined): PlanId | null {
  if (!value) return null;
  const v = value.toUpperCase();
  if (v === "FREE" || v === "TEAM" || v === "BUSINESS" || v === "ENTERPRISE") {
    return v;
  }
  return null;
}
