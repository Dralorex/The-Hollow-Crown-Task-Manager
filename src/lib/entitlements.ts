import "server-only";
import { prisma } from "@/lib/db";
import {
  PLANS,
  SEAT_FREE_INCLUDED,
  type PlanId,
  type PlanDefinition,
  isPaidPlan,
} from "@/lib/plans";
import type { BillingStatus, PlanId as DbPlanId } from "@/generated/prisma/client";

export type WorkspaceEntitlements = {
  workspaceId: string;
  plan: PlanId;
  status: BillingStatus;
  seatQuantity: number;
  memberCount: number;
  customRoleCount: number;
  groupChatCount: number;
  definition: PlanDefinition;
  /** True when past_due but still inside grace window. */
  inPaymentGrace: boolean;
  /** Paid features usable (active or grace). */
  billingOk: boolean;
  caps: {
    maxSeats: number | null;
    maxCustomRoles: number | null;
    maxGroupChats: number | null;
    storageBytes: number;
  };
};

async function ensureBillingRow(workspaceId: string) {
  return prisma.workspaceBilling.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      plan: "FREE",
      status: "ACTIVE",
      seatQuantity: SEAT_FREE_INCLUDED,
    },
    update: {},
  });
}

export async function getWorkspaceEntitlements(
  workspaceId: string,
): Promise<WorkspaceEntitlements> {
  const billing = await ensureBillingRow(workspaceId);
  const [memberCount, customRoleCount, groupChatCount] = await Promise.all([
    prisma.membership.count({ where: { workspaceId } }),
    prisma.workspaceRole.count({ where: { workspaceId } }),
    prisma.chatGroup.count({
      where: { workspaceId, isDirect: false },
    }),
  ]);

  const plan = billing.plan as PlanId;
  const definition = PLANS[plan];
  const now = Date.now();
  const inPaymentGrace = Boolean(
    billing.paymentGraceUntil && billing.paymentGraceUntil.getTime() > now,
  );
  const billingOk =
    billing.status === "ACTIVE" ||
    billing.status === "INCOMPLETE" ||
    (billing.status === "PAST_DUE" && inPaymentGrace);

  return {
    workspaceId,
    plan,
    status: billing.status,
    seatQuantity: billing.seatQuantity,
    memberCount,
    customRoleCount,
    groupChatCount,
    definition,
    inPaymentGrace,
    billingOk,
    caps: {
      maxSeats: definition.maxSeats,
      maxCustomRoles: definition.maxCustomRoles,
      maxGroupChats: definition.maxGroupChats,
      storageBytes: definition.storageBytes,
    },
  };
}

/** Effective full-access seat allowance right now. */
export function effectiveSeatCap(ent: WorkspaceEntitlements): number {
  if (ent.plan === "FREE") return SEAT_FREE_INCLUDED;
  const planMax = ent.caps.maxSeats;
  const billed = ent.seatQuantity;
  if (planMax == null) return billed;
  return Math.min(planMax, billed);
}

export async function assertCanAddMember(workspaceId: string): Promise<
  | { ok: true; ent: WorkspaceEntitlements }
  | { ok: false; error: string; upgradeHint?: PlanId }
> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  if (!ent.billingOk && isPaidPlan(ent.plan)) {
    return {
      ok: false,
      error:
        "Billing is past due. Update the payment method in Billing to invite people.",
    };
  }
  const cap = effectiveSeatCap(ent);
  if (ent.memberCount >= cap) {
    if (ent.plan === "FREE") {
      return {
        ok: false,
        error:
          "Free workspaces include 5 people. Upgrade this workspace to invite more — basics stay free for personal use.",
        upgradeHint: "TEAM",
      };
    }
    if (ent.caps.maxSeats != null && ent.memberCount >= ent.caps.maxSeats) {
      return {
        ok: false,
        error: `This plan allows up to ${ent.caps.maxSeats} seats. Upgrade the plan to add more people.`,
        upgradeHint: ent.plan === "TEAM" ? "BUSINESS" : "ENTERPRISE",
      };
    }
    // Paid under plan max but at billed quantity — caller may bump seats.
    return { ok: true, ent };
  }
  return { ok: true, ent };
}

export async function assertCanCreateCustomRole(workspaceId: string): Promise<
  | { ok: true }
  | { ok: false; error: string; upgradeHint?: PlanId }
> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  const max = ent.caps.maxCustomRoles;
  if (max == null) return { ok: true };
  if (ent.customRoleCount >= max) {
    return {
      ok: false,
      error: `This workspace allows ${max} custom roles on ${ent.definition.name}. Upgrade for more.`,
      upgradeHint: ent.plan === "FREE" ? "TEAM" : "BUSINESS",
    };
  }
  return { ok: true };
}

export async function assertCanCreateGroupChat(workspaceId: string): Promise<
  | { ok: true }
  | { ok: false; error: string; upgradeHint?: PlanId }
> {
  const ent = await getWorkspaceEntitlements(workspaceId);
  const max = ent.caps.maxGroupChats;
  if (max == null) return { ok: true };
  if (ent.groupChatCount >= max) {
    return {
      ok: false,
      error:
        "Free workspaces include 1 group chat. Upgrade this workspace for unlimited group chats.",
      upgradeHint: "TEAM",
    };
  }
  return { ok: true };
}

/** One Free owned-workspace slot per account (slot reopens after upgrading that Free WS). */
export async function assertCanCreateFreeWorkspace(userId: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const freeOwned = await prisma.workspaceBilling.count({
    where: {
      plan: "FREE",
      workspace: { ownerId: userId, archivedAt: null },
    },
  });
  if (freeOwned >= 1) {
    return {
      ok: false,
      error:
        "You already have a Free workspace. Upgrade it to open another Free slot, or upgrade when creating a paid workspace.",
    };
  }
  return { ok: true };
}

export function hasFeature(
  ent: WorkspaceEntitlements,
  feature: keyof PlanDefinition["features"],
): boolean {
  if (!ent.billingOk && isPaidPlan(ent.plan)) return false;
  return ent.definition.features[feature];
}

export function toDbPlan(plan: PlanId): DbPlanId {
  return plan;
}
