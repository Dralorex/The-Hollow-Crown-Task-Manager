import { prisma } from "@/lib/db";
import { personLabel } from "@/lib/utils";

export {
  birthdayFromMonthDay,
  birthdayParts,
  formatBirthday,
  isBirthdayToday,
} from "@/lib/birthday-format";
import { isBirthdayToday } from "@/lib/birthday-format";

type UserBirthdayPrefs = {
  id: string;
  birthday: Date | null;
  shareBirthdayFriends: boolean;
  shareBirthdayWorkspaces: boolean;
  askBeforeShareBirthday: boolean;
};

/**
 * After a friendship is accepted:
 * - share on + ask off → auto ACTIVE share
 * - ask on (regardless of share) → PENDING + prompt owner
 * - share off + ask off → nothing
 */
export async function handleBirthdayOnFriendship(
  userAId: string,
  userBId: string,
) {
  const [a, b] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userAId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userBId } }),
  ]);
  await maybeOfferFriendBirthdayShare(a, b);
  await maybeOfferFriendBirthdayShare(b, a);
}

async function maybeOfferFriendBirthdayShare(
  owner: UserBirthdayPrefs & { username: string; nickname: string | null },
  viewer: { id: string; username: string; nickname: string | null },
) {
  if (!owner.birthday) return;

  const existing = await prisma.birthdayShare.findUnique({
    where: {
      ownerId_viewerId: { ownerId: owner.id, viewerId: viewer.id },
    },
  });
  if (existing) return;

  if (owner.askBeforeShareBirthday) {
    await prisma.birthdayShare.create({
      data: {
        ownerId: owner.id,
        viewerId: viewer.id,
        status: "PENDING",
      },
    });
    await prisma.notification.create({
      data: {
        userId: owner.id,
        type: "BIRTHDAY_SHARE_PROMPT",
        title: "Share your birthday?",
        body: `Share your birthday with ${personLabel(viewer)}?`,
        meta: JSON.stringify({
          viewerId: viewer.id,
          kind: "friend",
        }),
      },
    });
    return;
  }

  if (owner.shareBirthdayFriends) {
    await prisma.birthdayShare.create({
      data: {
        ownerId: owner.id,
        viewerId: viewer.id,
        status: "ACTIVE",
      },
    });
  }
}

/**
 * After joining a workspace:
 * - ask on → prompt the member; yes → request to owner
 * - ask off + share workspaces on → request to owner immediately
 */
export async function handleBirthdayOnWorkspaceJoin(
  userId: string,
  workspaceId: string,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.birthday) return;

  const existing = await prisma.workspaceBirthdayRequest.findUnique({
    where: {
      workspaceId_subjectId: { workspaceId, subjectId: userId },
    },
  });
  if (existing) return;

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });

  if (user.askBeforeShareBirthday) {
    await prisma.notification.create({
      data: {
        userId,
        type: "BIRTHDAY_SHARE_PROMPT",
        title: "Share birthday with workspace?",
        body: `Add your birthday to “${workspace.name}”? The owner will confirm.`,
        meta: JSON.stringify({ workspaceId, kind: "workspace" }),
      },
    });
    return;
  }

  if (user.shareBirthdayWorkspaces) {
    await requestWorkspaceBirthday(userId, workspaceId);
  }
}

export async function requestWorkspaceBirthday(
  subjectId: string,
  workspaceId: string,
) {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const subject = await prisma.user.findUniqueOrThrow({
    where: { id: subjectId },
  });
  if (!subject.birthday) {
    return { ok: false as const, error: "No birthday set." };
  }

  // Owners adding their own birthday don’t need a self-approval loop.
  if (workspace.ownerId === subjectId) {
    await prisma.workspaceBirthdayRequest.upsert({
      where: { workspaceId_subjectId: { workspaceId, subjectId } },
      create: { workspaceId, subjectId, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    return { ok: true as const };
  }

  const row = await prisma.workspaceBirthdayRequest.upsert({
    where: { workspaceId_subjectId: { workspaceId, subjectId } },
    create: { workspaceId, subjectId, status: "PENDING" },
    update: { status: "PENDING" },
  });

  await prisma.notification.create({
    data: {
      userId: workspace.ownerId,
      type: "WORKSPACE_BIRTHDAY_REQUEST",
      title: "Birthday calendar request",
      body: `${personLabel(subject)} wants their birthday on “${workspace.name}”.`,
      meta: JSON.stringify({
        requestId: row.id,
        workspaceId,
        subjectId,
      }),
    },
  });

  return { ok: true as const };
}

/** Deduped daily birthday digest for one viewer. */
export async function syncBirthdayNotifications(userId: string) {
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  const already = await prisma.notification.findFirst({
    where: {
      userId,
      type: "BIRTHDAY_TODAY",
      meta: { contains: `"day":"${dayKey}"` },
    },
  });
  if (already) return;

  const names = new Set<string>();

  const friendShares = await prisma.birthdayShare.findMany({
    where: { viewerId: userId, status: "ACTIVE" },
    include: { owner: true },
  });
  for (const s of friendShares) {
    if (s.owner.birthday && isBirthdayToday(s.owner.birthday, now)) {
      names.add(personLabel(s.owner));
    }
  }

  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  if (memberships.length > 0) {
    const approved = await prisma.workspaceBirthdayRequest.findMany({
      where: {
        workspaceId: { in: memberships.map((m) => m.workspaceId) },
        status: "ACTIVE",
      },
      include: { subject: true },
    });
    for (const r of approved) {
      if (r.subject.birthday && isBirthdayToday(r.subject.birthday, now)) {
        names.add(personLabel(r.subject));
      }
    }
  }

  const me = await prisma.user.findUnique({ where: { id: userId } });
  if (me?.birthday && isBirthdayToday(me.birthday, now)) {
    names.add("you");
  }

  if (names.size === 0) return;

  const list = [...names];
  const body =
    list.length === 1 && list[0] === "you"
      ? "Happy birthday!"
      : list.length === 1
        ? `It’s ${list[0]}’s birthday today.`
        : `Birthdays today: ${list.join(", ")}.`;

  await prisma.notification.create({
    data: {
      userId,
      type: "BIRTHDAY_TODAY",
      title: "Birthday",
      body,
      meta: JSON.stringify({ day: dayKey, names: list }),
    },
  });
}
