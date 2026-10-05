import "server-only";
import { prisma } from "@/lib/db";
import {
  buildWeeklyDigest,
  digestIsEmpty,
  weeklyDigestEmail,
} from "@/lib/weekly-digest";
import { sendEmail } from "@/lib/mail";

/** Stub: retention purge will delete expired chat messages / archives later. */
export async function runRetentionPurgeStub() {
  const pendingChats = await prisma.chatGroup.count();
  return {
    processed: 0,
    detail: `noop; chatGroups=${pendingChats}`,
  };
}

/**
 * Seat renewal — drop billed quantity to active members when
 * autoCloseUnusedSeats is on (Stripe quantity sync is Phase 2 follow-up).
 */
export async function runSeatRenewalStub() {
  const due = await prisma.workspaceBilling.findMany({
    where: {
      plan: { not: "FREE" },
      autoCloseUnusedSeats: true,
      currentPeriodEnd: { lte: new Date() },
    },
    select: {
      workspaceId: true,
      seatQuantity: true,
      workspace: { select: { _count: { select: { memberships: true } } } },
    },
    take: 50,
  });

  let adjusted = 0;
  for (const row of due) {
    const members = row.workspace._count.memberships;
    const next = Math.max(5, members);
    if (next < row.seatQuantity) {
      await prisma.workspaceBilling.update({
        where: { workspaceId: row.workspaceId },
        data: { seatQuantity: next },
      });
      adjusted += 1;
    }
  }

  return {
    processed: adjusted,
    detail: `candidates=${due.length} lowered=${adjusted}`,
  };
}

/**
 * Dunning sweep — Phase 1 emails on invoice.payment_failed webhook.
 * Cron lists workspaces still in grace / past_due for ops visibility.
 */
export async function runDunningStub() {
  const pastDue = await prisma.workspaceBilling.count({
    where: { status: "PAST_DUE" },
  });
  const inGrace = await prisma.workspaceBilling.count({
    where: {
      status: "PAST_DUE",
      paymentGraceUntil: { gt: new Date() },
    },
  });
  return {
    processed: pastDue,
    detail: `pastDue=${pastDue} inGrace=${inGrace}; emails sent on webhook`,
  };
}

/**
 * Weekly digest — wraps existing builder; skips empty digests.
 * Still opt-in via User.weeklyDigestEnabled.
 */
export async function runWeeklyDigestJob() {
  const users = await prisma.user.findMany({
    where: {
      weeklyDigestEnabled: true,
      email: { not: null },
      deletedAt: null,
    },
    select: { id: true, email: true, username: true },
  });

  let sent = 0;
  let skippedEmpty = 0;
  for (const user of users) {
    if (!user.email) continue;
    const payload = await buildWeeklyDigest(user.id);
    if (!payload) continue;
    if (digestIsEmpty(payload)) {
      skippedEmpty += 1;
      continue;
    }
    const mail = weeklyDigestEmail(payload);
    const result = await sendEmail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!result.ok) {
      console.error("[cron:weekly-digest] fail", user.username, result.error);
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { weeklyDigestLastSentAt: new Date() },
    });
    sent += 1;
  }

  return {
    processed: sent,
    detail: `sent=${sent} skippedEmpty=${skippedEmpty} candidates=${users.length}`,
  };
}
