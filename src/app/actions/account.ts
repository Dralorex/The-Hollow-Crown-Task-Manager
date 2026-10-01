"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { issueEmailVerification } from "@/lib/email-verification";
import type { ActionResult } from "@/app/actions/auth";

/** Step 1: email a 6-digit code confirming account deletion. */
export async function requestAccountDeletionAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.email) {
    return {
      ok: false,
      error: "Add and verify an email on your account before deleting it.",
    };
  }
  if (user.deletedAt) {
    return { ok: false, error: "This account is already deleted." };
  }

  const issued = await issueEmailVerification({
    userId: user.id,
    email: user.email,
    username: user.username,
    forceResend: true,
  });
  if (!issued.ok) {
    return {
      ok: false,
      error: issued.error,
      retryAfterSec: issued.retryAfterSec,
    };
  }

  return {
    ok: true,
    needsEmailVerification: true,
    email: issued.email,
    emailed: !issued.mocked,
  };
}

/**
 * Step 2: verify code, soft-delete the user, unclaim tasks, strip social ties.
 * Chat history stays labeled via deletedUsername.
 */
export async function confirmAccountDeletionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const pending = await prisma.emailVerification.findUnique({
    where: { userId: user.id },
  });
  if (!pending) {
    return { ok: false, error: "No deletion code is pending. Request a new one." };
  }
  if (pending.expiresAt < new Date()) {
    return { ok: false, error: "That code expired. Resend a new one." };
  }
  if (pending.code !== code) {
    return { ok: false, error: "That code doesn’t match. Try again." };
  }

  const claimedTasks = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
      status: { in: ["CLAIMED", "OPEN", "IN_REVIEW"] },
    },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const task of claimedTasks) {
      await tx.task.update({
        where: { id: task.id },
        data: {
          assigneeId: null,
          status: "OPEN",
          claimedAt: null,
          lastUnclaimReason: "account deleted",
          lastUnclaimWorkNote: null,
          lastUnclaimedById: user.id,
        },
      });
      await tx.calendarEvent.deleteMany({ where: { taskId: task.id } });
    }

    await tx.friendship.deleteMany({
      where: {
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
    });
    await tx.friendProfile.deleteMany({
      where: {
        OR: [{ ownerId: user.id }, { friendId: user.id }],
      },
    });
    await tx.birthdayShare.deleteMany({
      where: {
        OR: [{ ownerId: user.id }, { viewerId: user.id }],
      },
    });
    await tx.workspaceBirthdayRequest.deleteMany({
      where: { subjectId: user.id },
    });
    await tx.membership.deleteMany({ where: { userId: user.id } });
    await tx.invite.deleteMany({
      where: {
        OR: [
          { invitedById: user.id },
          { targetUsername: user.username },
          ...(user.email ? [{ targetEmail: user.email }] : []),
        ],
      },
    });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.emailVerification.deleteMany({ where: { userId: user.id } });
    await tx.personalCalendarEvent.deleteMany({ where: { userId: user.id } });
    await tx.calendarWorkspaceFilter.deleteMany({ where: { userId: user.id } });

    await tx.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        deletedUsername: user.username,
        username: `deleted_${user.id}`,
        email: null,
        nickname: null,
        birthday: null,
        passwordHash: `deleted:${user.id}`,
      },
    });
  });

  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}
