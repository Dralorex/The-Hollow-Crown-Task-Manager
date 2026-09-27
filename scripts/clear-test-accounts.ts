/**
 * Soft-delete accounts whose username is "test" or "test" + optional
 * spaces/digits (test13, test 5, etc.). See .cursor/rules/test-account-removal.mdc.
 *
 * Usage: npx tsx scripts/clear-test-accounts.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";

/** Matches: test, test13, test 5, TEST — not testing / contest / testuser */
const TEST_USERNAME = /^test(\s*\d+)?$/i;

async function softDeleteUser(user: {
  id: string;
  username: string;
  email: string | null;
}) {
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
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
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
}

async function main() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, username: true, email: true },
  });

  const matches = users.filter((u) => TEST_USERNAME.test(u.username.trim()));

  if (matches.length === 0) {
    console.log("No active test* accounts found.");
    return;
  }

  console.log(`Clearing ${matches.length} test account(s):`);
  for (const u of matches) {
    console.log(`  - ${u.username}${u.email ? ` <${u.email}>` : ""}`);
    await softDeleteUser(u);
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
