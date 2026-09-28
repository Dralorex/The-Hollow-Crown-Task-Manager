"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { pushAlertInboxForUsers } from "@/lib/ably-server";
import {
  birthdayFromMonthDay,
  birthdayParts,
  requestWorkspaceBirthday,
} from "@/lib/birthday";
import { prisma } from "@/lib/db";
import { personLabel } from "@/lib/utils";
import type { ActionResult } from "@/app/actions/auth";

export type BirthdaySaveResult =
  | ActionResult
  | {
      ok: true;
      needsFriendPicker?: true;
      friends?: { id: string; label: string }[];
      needsWorkspacePicker?: true;
      workspaces?: { id: string; label: string }[];
    };

function revalidateBirthdayPaths() {
  revalidatePath("/app/profile");
  revalidatePath("/app/calendar");
  revalidatePath("/app/social");
}

export async function updateBirthdayAction(
  _prev: BirthdaySaveResult | null,
  formData: FormData,
): Promise<BirthdaySaveResult> {
  const user = await requireUser();
  const month = Number(formData.get("month"));
  const day = Number(formData.get("day"));
  const clear = String(formData.get("clear") ?? "") === "true";

  const shareBirthdayFriends =
    String(formData.get("shareBirthdayFriends") ?? "") === "on" ||
    String(formData.get("shareBirthdayFriends") ?? "") === "true";
  const shareBirthdayWorkspaces =
    String(formData.get("shareBirthdayWorkspaces") ?? "") === "on" ||
    String(formData.get("shareBirthdayWorkspaces") ?? "") === "true";
  const askBeforeShareBirthday =
    String(formData.get("askBeforeShareBirthday") ?? "") === "on" ||
    String(formData.get("askBeforeShareBirthday") ?? "") === "true";

  if (clear) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        birthday: null,
        shareBirthdayFriends,
        shareBirthdayWorkspaces,
        askBeforeShareBirthday,
      },
    });
    await prisma.birthdayShare.deleteMany({ where: { ownerId: user.id } });
    await prisma.workspaceBirthdayRequest.deleteMany({
      where: { subjectId: user.id },
    });
    revalidateBirthdayPaths();
    return { ok: true };
  }

  const birthday = birthdayFromMonthDay(month, day);
  if (!birthday) return { ok: false, error: "Pick a valid month and day." };

  const wasEmpty = !user.birthday;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      birthday,
      shareBirthdayFriends,
      shareBirthdayWorkspaces,
      askBeforeShareBirthday,
    },
  });

  // First-time birthday: offer friends + existing workspaces (when ask is on).
  if (wasEmpty) {
    const [friendships, memberships] = await Promise.all([
      prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: user.id }, { addresseeId: user.id }],
        },
        include: { requester: true, addressee: true },
      }),
      prisma.membership.findMany({
        where: { userId: user.id },
        include: { workspace: true },
        orderBy: { workspace: { name: "asc" } },
      }),
    ]);

    const friends = friendships.map((f) => {
      const other = f.requesterId === user.id ? f.addressee : f.requester;
      return { id: other.id, label: personLabel(other) };
    });

    const workspaceOptions = memberships.map((m) => ({
      id: m.workspaceId,
      label: m.workspace.name,
    }));

    if (!askBeforeShareBirthday && shareBirthdayWorkspaces) {
      for (const ws of workspaceOptions) {
        await requestWorkspaceBirthday(user.id, ws.id);
      }
    }

    const needsFriendPicker = friends.length > 0;
    const needsWorkspacePicker =
      askBeforeShareBirthday && workspaceOptions.length > 0;

    if (needsFriendPicker || needsWorkspacePicker) {
      revalidateBirthdayPaths();
      return {
        ok: true,
        ...(needsFriendPicker
          ? { needsFriendPicker: true as const, friends }
          : {}),
        ...(needsWorkspacePicker
          ? {
              needsWorkspacePicker: true as const,
              workspaces: workspaceOptions,
            }
          : {}),
      };
    }
  }

  revalidateBirthdayPaths();
  return { ok: true };
}

export async function shareBirthdayWithFriendsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.birthday) return { ok: false, error: "Set your birthday first." };

  const mode = String(formData.get("mode") ?? "all");
  let friendIds: string[] = [];

  if (mode === "all") {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: user.id }, { addresseeId: user.id }],
      },
    });
    friendIds = friendships.map((f) =>
      f.requesterId === user.id ? f.addresseeId : f.requesterId,
    );
  } else {
    friendIds = formData
      .getAll("friendId")
      .map((v) => String(v))
      .filter(Boolean);
  }

  for (const viewerId of friendIds) {
    await prisma.birthdayShare.upsert({
      where: {
        ownerId_viewerId: { ownerId: user.id, viewerId },
      },
      create: { ownerId: user.id, viewerId, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
  }

  revalidateBirthdayPaths();
  return { ok: true };
}

export async function shareBirthdayWithWorkspacesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.birthday) return { ok: false, error: "Set your birthday first." };

  const mode = String(formData.get("mode") ?? "all");
  let workspaceIds: string[] = [];

  if (mode === "all") {
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
    });
    workspaceIds = memberships.map((m) => m.workspaceId);
  } else {
    workspaceIds = formData
      .getAll("workspaceId")
      .map((v) => String(v))
      .filter(Boolean);
  }

  for (const workspaceId of workspaceIds) {
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: user.id },
      },
    });
    if (!membership) continue;
    const result = await requestWorkspaceBirthday(user.id, workspaceId);
    if (!result.ok) return { ok: false, error: result.error };
  }

  revalidateBirthdayPaths();
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function respondBirthdaySharePromptAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const kind = String(formData.get("kind") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";

  if (kind === "friend") {
    const viewerId = String(formData.get("viewerId") ?? "");
    if (!viewerId) return { ok: false, error: "Missing friend." };
    if (!user.birthday) return { ok: false, error: "Set your birthday first." };

    if (accept) {
      await prisma.birthdayShare.upsert({
        where: { ownerId_viewerId: { ownerId: user.id, viewerId } },
        create: { ownerId: user.id, viewerId, status: "ACTIVE" },
        update: { status: "ACTIVE" },
      });
    } else {
      await prisma.birthdayShare.upsert({
        where: { ownerId_viewerId: { ownerId: user.id, viewerId } },
        create: { ownerId: user.id, viewerId, status: "DECLINED" },
        update: { status: "DECLINED" },
      });
    }
  } else if (kind === "workspace") {
    const workspaceId = String(formData.get("workspaceId") ?? "");
    if (!workspaceId) return { ok: false, error: "Missing workspace." };
    if (accept) {
      const result = await requestWorkspaceBirthday(user.id, workspaceId);
      if (!result.ok) return { ok: false, error: result.error };
    } else {
      await prisma.workspaceBirthdayRequest.upsert({
        where: {
          workspaceId_subjectId: { workspaceId, subjectId: user.id },
        },
        create: { workspaceId, subjectId: user.id, status: "DECLINED" },
        update: { status: "DECLINED" },
      });
    }
  } else {
    return { ok: false, error: "Unknown share prompt." };
  }

  const notificationId = String(formData.get("notificationId") ?? "");
  if (notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { read: true },
    });
  }

  revalidatePath("/app/notifications");
  revalidatePath("/app/calendar");
  revalidatePath("/app/social");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function respondWorkspaceBirthdayRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const requestId = String(formData.get("requestId") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";

  const request = await prisma.workspaceBirthdayRequest.findUnique({
    where: { id: requestId },
    include: { workspace: true, subject: true },
  });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.workspace.ownerId !== user.id) {
    return { ok: false, error: "Only the workspace owner can decide." };
  }

  await prisma.workspaceBirthdayRequest.update({
    where: { id: requestId },
    data: { status: accept ? "ACTIVE" : "DECLINED" },
  });

  await prisma.notification.create({
    data: {
      userId: request.subjectId,
      type: "WORKSPACE_BIRTHDAY_DECISION",
      title: accept ? "Birthday added" : "Birthday not added",
      body: accept
        ? `Your birthday was added to “${request.workspace.name}”.`
        : `Your birthday was not added to “${request.workspace.name}”.`,
      meta: JSON.stringify({
        workspaceId: request.workspaceId,
        accepted: accept,
      }),
    },
  });

  const notificationId = String(formData.get("notificationId") ?? "");
  if (notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { read: true },
    });
  }

  await pushAlertInboxForUsers([request.subjectId, user.id]);

  revalidatePath("/app/notifications");
  revalidatePath("/app/calendar");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function getBirthdayPartsForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return birthdayParts(user?.birthday);
}
