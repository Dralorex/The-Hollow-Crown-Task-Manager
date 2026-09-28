/**
 * Soft-delete accounts whose username is "test" or "test" + optional
 * spaces/digits (test13, test 5, etc.). See .cursor/rules/test-account-removal.mdc.
 *
 * Targets the DB from getDatabaseUrl() (prefers rowgon_storage_* / Neon Preview).
 * Local .env pointing at localhost will NOT see Vercel Preview accounts.
 *
 * Usage:
 *   npx tsx scripts/clear-test-accounts.ts
 *   rowgon_storage_DATABASE_URL='postgresql://…' npx tsx scripts/clear-test-accounts.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getDatabaseUrl } from "../src/lib/db-url";

/** Matches: test, test13, test 5, TEST — not testing / contest / testuser */
const TEST_USERNAME = /^test(\s*\d+)?$/i;

function dbHostLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable)";
  }
}

function isLocalDb(url: string): boolean {
  const host = dbHostLabel(url).toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

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
  const url = getDatabaseUrl();
  const host = dbHostLabel(url);
  console.log(`Database host: ${host}`);
  if (isLocalDb(url)) {
    console.warn(
      "Warning: connected to local Postgres. Vercel Preview test accounts live on Neon (rowgon_storage_*). Set that URL to clear Preview users.",
    );
  }

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, username: true, email: true },
  });

  const matches = users.filter((u) => TEST_USERNAME.test(u.username.trim()));

  if (matches.length === 0) {
    console.log(
      `No active test* accounts found among ${users.length} user(s) on this database.`,
    );
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
