import "server-only";
import { prisma } from "@/lib/db";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { bumpSubscriptionSeats } from "@/lib/billing-sync";
import { isPaidPlan } from "@/lib/plans";

/**
 * After membership grows on a paid workspace, raise billed seats (prorates in Stripe).
 * Removals do not lower billed quantity until period-end (Phase 2 seat renewal).
 */
export async function recountSeatsAfterMembershipChange(
  workspaceId: string,
): Promise<{ bumped: boolean; seats: number }> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  const memberCount = await prisma.membership.count({ where: { workspaceId } });

  if (!isPaidPlan(ent.plan)) {
    return { bumped: false, seats: ent.seatQuantity };
  }

  if (memberCount <= ent.seatQuantity) {
    return { bumped: false, seats: ent.seatQuantity };
  }

  const planMax = ent.caps.maxSeats;
  if (planMax != null && memberCount > planMax) {
    // Cap already enforced before invite/accept; nothing to bill above max.
    return { bumped: false, seats: ent.seatQuantity };
  }

  await bumpSubscriptionSeats(workspaceId, memberCount);
  return { bumped: true, seats: memberCount };
}
