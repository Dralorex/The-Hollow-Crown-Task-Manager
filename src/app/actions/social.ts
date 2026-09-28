"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { handleBirthdayOnFriendship } from "@/lib/birthday";
import { publishChatPresence } from "@/lib/chat-presence-bus";
import { prisma } from "@/lib/db";
import { OPEN_THREAD_MS, parseMentions } from "@/lib/mentions";
import { canCreateGroups, canManagePeople, requireMembership } from "@/lib/permissions";
import { normalizeUsername, personLabel } from "@/lib/utils";
import type { Role } from "@/generated/prisma/client";
import type { ActionResult } from "@/app/actions/auth";

export async function sendFriendRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  if (!username || username === user.username) {
    return { ok: false, error: "Enter someone else’s username." };
  }

  const other = await prisma.user.findUnique({ where: { username } });
  if (!other || other.deletedAt) return { ok: false, error: "User not found." };

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: other.id },
        { requesterId: other.id, addresseeId: user.id },
      ],
    },
  });
  if (existing?.status === "ACCEPTED") {
    return { ok: false, error: "You’re already friends." };
  }
  if (existing?.status === "PENDING") {
    return { ok: false, error: "A friend request is already pending." };
  }

  let friendship;
  if (existing) {
    friendship = await prisma.friendship.update({
      where: { id: existing.id },
      data: {
        requesterId: user.id,
        addresseeId: other.id,
        status: "PENDING",
      },
    });
  } else {
    friendship = await prisma.friendship.create({
      data: {
        requesterId: user.id,
        addresseeId: other.id,
        status: "PENDING",
      },
    });
  }

  await prisma.notification.create({
    data: {
      userId: other.id,
      type: "FRIEND_REQUEST",
      title: "Friend request",
      body: `${personLabel(user)} wants to be friends on Rowgon.`,
      meta: JSON.stringify({
        fromUserId: user.id,
        friendshipId: friendship.id,
      }),
    },
  });

  revalidatePath("/app/social");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function respondFriendRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const friendshipId = String(formData.get("friendshipId") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });
  if (!friendship || friendship.addresseeId !== user.id) {
    return { ok: false, error: "Request not found." };
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: accept ? "ACCEPTED" : "DECLINED" },
  });

  if (accept) {
    await prisma.notification.create({
      data: {
        userId: friendship.requesterId,
        type: "FRIEND_ACCEPTED",
        title: "Friend request accepted",
        body: `${personLabel(user)} accepted your friend request.`,
        meta: JSON.stringify({
          friendshipId,
          friendUserId: user.id,
        }),
      },
    });
    await handleBirthdayOnFriendship(
      friendship.requesterId,
      friendship.addresseeId,
    );
  }

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      type: "FRIEND_REQUEST",
      meta: { contains: friendshipId },
    },
    data: { read: true },
  });

  revalidatePath("/app/social");
  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

async function findDirectGroup(userA: string, userB: string) {
  const groups = await prisma.chatGroup.findMany({
    where: {
      isDirect: true,
      closedAt: null,
      AND: [
        { members: { some: { userId: userA } } },
        { members: { some: { userId: userB } } },
      ],
    },
    include: { members: true },
  });
  return groups.find((g) => g.members.length === 2) ?? null;
}

async function areAcceptedFriends(userA: string, userB: string) {
  return prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
  });
}

/** Create or reuse a DM; optionally post a first/next message and notify. */
async function openOrMessageDirect(
  user: { id: string; username: string; nickname?: string | null },
  other: { id: string; username: string },
  firstMessage?: string,
) {
  const existing = await findDirectGroup(user.id, other.id);
  let groupId: string;

  if (!existing) {
    const created = await prisma.chatGroup.create({
      data: {
        name: `${user.username} & ${other.username}`,
        isDirect: true,
        createdById: user.id,
        members: {
          create: [{ userId: user.id }, { userId: other.id }],
        },
        ...(firstMessage
          ? {
              messages: {
                create: { senderId: user.id, body: firstMessage },
              },
            }
          : {}),
      },
    });
    groupId = created.id;
  } else {
    groupId = existing.id;
    if (firstMessage) {
      await prisma.message.create({
        data: { groupId, senderId: user.id, body: firstMessage },
      });
    }
  }

  if (firstMessage) {
    await prisma.notification.create({
      data: {
        userId: other.id,
        type: "CHAT_MESSAGE",
        title: `Message from ${personLabel(user)}`,
        body: firstMessage.slice(0, 140),
        meta: JSON.stringify({ groupId, fromUserId: user.id }),
      },
    });
  }

  return groupId;
}

export async function requestWorkspaceDmAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const toUsername = normalizeUsername(String(formData.get("username") ?? ""));
  const firstMessage = String(formData.get("message") ?? "").trim();
  if (!firstMessage) return { ok: false, error: "Write a first message." };

  const other = await prisma.user.findUnique({ where: { username: toUsername } });
  if (!other) return { ok: false, error: "User not found." };
  if (other.id === user.id) return { ok: false, error: "That’s you." };

  // Friends scope: unlocked DM (no workspace gate, no accept request).
  if (workspaceId === "__friends__") {
    const friendship = await areAcceptedFriends(user.id, other.id);
    if (!friendship) {
      return { ok: false, error: "You’re not friends with that user." };
    }

    const groupId = await openOrMessageDirect(user, other, firstMessage);
    revalidatePath("/app/chat");
    revalidatePath("/app", "layout");
    redirect(`/app/chat?tab=dms&group=${groupId}`);
  }

  await requireMembership(workspaceId, user.id);

  const otherMembership = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: other.id } },
  });
  if (!otherMembership) {
    return { ok: false, error: "They’re not in this workspace." };
  }

  const friendship = await areAcceptedFriends(user.id, other.id);

  if (friendship) {
    const groupId = await openOrMessageDirect(user, other, firstMessage);
    revalidatePath("/app/chat");
    revalidatePath("/app", "layout");
    redirect(`/app/chat?tab=dms&group=${groupId}`);
  }

  const dmRequest = await prisma.dmRequest.create({
    data: {
      fromUserId: user.id,
      toUserId: other.id,
      firstMessage,
      status: "PENDING",
    },
  });

  await prisma.notification.create({
    data: {
      userId: other.id,
      type: "DM_REQUEST",
      title: "Chat request",
      body: `${personLabel(user)}: ${firstMessage}`,
      meta: JSON.stringify({
        fromUserId: user.id,
        requestId: dmRequest.id,
      }),
    },
  });

  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function openFriendChatAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const friendUserId = String(formData.get("friendUserId") ?? "");
  if (!friendUserId) return { ok: false, error: "Missing friend." };

  const other = await prisma.user.findUnique({ where: { id: friendUserId } });
  if (!other) return { ok: false, error: "User not found." };

  const friendship = await areAcceptedFriends(user.id, other.id);
  if (!friendship) {
    return { ok: false, error: "You’re not friends with that user." };
  }

  const groupId = await openOrMessageDirect(user, other);
  revalidatePath("/app/chat");
  redirect(`/app/chat?tab=dms&group=${groupId}`);
}

export async function removeFriendAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const friendshipId = String(formData.get("friendshipId") ?? "");
  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });
  if (
    !friendship ||
    (friendship.requesterId !== user.id && friendship.addresseeId !== user.id)
  ) {
    return { ok: false, error: "Friendship not found." };
  }
  if (friendship.status !== "ACCEPTED") {
    return { ok: false, error: "That friendship isn’t active." };
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });

  revalidatePath("/app/social");
  revalidatePath("/app/chat");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function respondDmRequestAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const requestId = String(formData.get("requestId") ?? "");
  const accept = String(formData.get("accept") ?? "") === "true";

  const request = await prisma.dmRequest.findUnique({
    where: { id: requestId },
    include: { fromUser: true },
  });
  if (!request || request.toUserId !== user.id) {
    return { ok: false, error: "Request not found." };
  }

  if (!accept) {
    await prisma.dmRequest.update({
      where: { id: requestId },
      data: { status: "DECLINED" },
    });
    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        type: "DM_REQUEST",
        meta: { contains: requestId },
      },
      data: { read: true },
    });
    revalidatePath("/app/chat");
    revalidatePath("/app/notifications");
    revalidatePath("/app", "layout");
    return { ok: true };
  }

  const group = await prisma.chatGroup.create({
    data: {
      name: `${request.fromUser.username} & ${user.username}`,
      isDirect: true,
      createdById: request.fromUserId,
      members: {
        create: [{ userId: request.fromUserId }, { userId: user.id }],
      },
      messages: {
        create: {
          senderId: request.fromUserId,
          body: request.firstMessage,
        },
      },
    },
  });

  await prisma.dmRequest.update({
    where: { id: requestId },
    data: { status: "ACCEPTED", chatGroupId: group.id },
  });

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      type: "DM_REQUEST",
      meta: { contains: requestId },
    },
    data: { read: true },
  });

  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function createGroupChatAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canCreateGroups(membership.role)) {
    return { ok: false, error: "Only admins and owners can create workspace group chats." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Group needs a name." };

  const memberUsernames = String(formData.get("members") ?? "")
    .split(",")
    .map((s) => normalizeUsername(s))
    .filter(Boolean);

  const users = await prisma.user.findMany({
    where: { username: { in: memberUsernames } },
  });

  const memberIds = new Set(users.map((u) => u.id));
  memberIds.add(user.id);

  for (const memberId of memberIds) {
    if (memberId === user.id) continue;
    const m = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
    if (!m) {
      return { ok: false, error: "All members must belong to the workspace." };
    }
  }

  const created = await prisma.chatGroup.create({
    data: {
      workspaceId,
      name,
      isDirect: false,
      createdById: user.id,
      members: {
        create: [...memberIds].map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/app/chat");
  revalidatePath(`/app/w/${workspaceId}`);
  redirect(`/app/chat?tab=workspace-groups&group=${created.id}`);
}


/** Friend-only group chat (no workspace). Members must be accepted friends. */
export async function createFriendGroupChatAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Group needs a name." };

  const memberUsernames = String(formData.get("members") ?? "")
    .split(",")
    .map((s) => normalizeUsername(s))
    .filter(Boolean);

  if (memberUsernames.length === 0) {
    return { ok: false, error: "Pick at least one friend." };
  }

  const users = await prisma.user.findMany({
    where: { username: { in: memberUsernames }, deletedAt: null },
  });
  if (users.length !== memberUsernames.length) {
    return { ok: false, error: "One or more usernames weren’t found." };
  }

  for (const other of users) {
    if (other.id === user.id) continue;
    const friendship = await areAcceptedFriends(user.id, other.id);
    if (!friendship) {
      return {
        ok: false,
        error: `You’re not friends with @${other.username}.`,
      };
    }
  }

  const memberIds = new Set(users.map((u) => u.id));
  memberIds.add(user.id);

  const created = await prisma.chatGroup.create({
    data: {
      workspaceId: null,
      name,
      isDirect: false,
      createdById: user.id,
      members: {
        create: [...memberIds].map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/app/chat");
  redirect(`/app/chat?tab=groups&group=${created.id}`);
}

export async function sendMessageAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Message can’t be empty." };

  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    include: {
      group: {
        include: {
          members: { include: { user: true } },
        },
      },
    },
  });
  if (!member) return { ok: false, error: "You’re not in this chat." };

  const group = member.group;
  if (group.closedAt) {
    return {
      ok: false,
      error: "This chat was closed. Start a new DM to message again.",
    };
  }

  const nowDate = new Date();
  await prisma.chatMember.update({
    where: { id: member.id },
    data: {
      typingAt: null,
      lastSeenAt: nowDate,
      lastActiveAt: nowDate,
    },
  });

  const chatMembers = group.members;
  const memberByUsername = new Map(
    chatMembers.map((m) => [m.user.username.toLowerCase(), m]),
  );

  const parsed = parseMentions(body);
  const wantsEveryone = parsed.some((p) => p.kind === "everyone");
  const roleMentions = parsed.filter(
    (p): p is { kind: "role"; roleName: Role } => p.kind === "role",
  );
  const userMentions = parsed.filter(
    (p): p is { kind: "user"; username: string } => p.kind === "user",
  );

  let senderWorkspaceRole: Role | null = null;
  if (group.workspaceId) {
    const wsMembership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: group.workspaceId, userId: user.id },
      },
    });
    senderWorkspaceRole = wsMembership?.role ?? null;
  }

  const canUseElevatedMentions = group.workspaceId
    ? Boolean(senderWorkspaceRole && canManagePeople(senderWorkspaceRole))
    : true;

  if ((wantsEveryone || roleMentions.length > 0) && !canUseElevatedMentions) {
    return {
      ok: false,
      error: "Only Admin+ can use @everyone or @role in workspace chats.",
    };
  }

  if (roleMentions.length > 0 && !group.workspaceId) {
    return { ok: false, error: "@role only works in workspace group chats." };
  }

  if (wantsEveryone && group.isDirect) {
    return { ok: false, error: "@everyone isn’t used in 1:1 DMs." };
  }

  const mentionedUserIds = new Set<string>();

  for (const mention of userMentions) {
    const target = memberByUsername.get(mention.username);
    if (target && target.userId !== user.id) {
      mentionedUserIds.add(target.userId);
    }
  }

  if (wantsEveryone) {
    for (const m of chatMembers) {
      if (m.userId !== user.id) mentionedUserIds.add(m.userId);
    }
  }

  if (roleMentions.length > 0 && group.workspaceId) {
    const roleNames = roleMentions.map((r) => r.roleName);
    const roleMembers = await prisma.membership.findMany({
      where: {
        workspaceId: group.workspaceId,
        role: { in: roleNames },
        userId: { in: chatMembers.map((m) => m.userId) },
      },
    });
    for (const rm of roleMembers) {
      if (rm.userId !== user.id) mentionedUserIds.add(rm.userId);
    }
  }

  const message = await prisma.message.create({
    data: {
      groupId,
      senderId: user.id,
      body,
      mentions: {
        create: [
          ...userMentions
            .map((m) => {
              const target = memberByUsername.get(m.username);
              if (!target) return null;
              return {
                kind: "user",
                userId: target.userId,
              };
            })
            .filter((m): m is { kind: string; userId: string } => Boolean(m)),
          ...(wantsEveryone ? [{ kind: "everyone" as const }] : []),
          ...roleMentions.map((r) => ({
            kind: "role" as const,
            roleName: r.roleName,
          })),
        ],
      },
    },
  });

  const now = Date.now();
  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  const titlePrefix = group.isDirect
    ? `Message from ${personLabel(user)}`
    : `${group.name}: ${personLabel(user)}`;

  for (const m of chatMembers) {
    if (m.userId === user.id) continue;

    const mentioned = mentionedUserIds.has(m.userId);
    const mode = m.notifyMode;
    if (mode === "MUTE") continue;
    if (mode === "MENTIONS" && !mentioned) continue;

    const lastOpen = m.lastSeenAt ?? m.lastActiveAt;
    if (lastOpen && now - lastOpen.getTime() < OPEN_THREAD_MS) {
      continue;
    }

    await prisma.notification.create({
      data: {
        userId: m.userId,
        type: mentioned ? "CHAT_MENTION" : "CHAT_MESSAGE",
        title: mentioned ? "Mentioned in chat" : titlePrefix,
        body: mentioned
          ? `${personLabel(user)} in ${group.name}: ${preview}`
          : preview,
        meta: JSON.stringify({
          groupId,
          messageId: message.id,
          fromUserId: user.id,
          mentioned,
        }),
      },
    });
  }

  revalidatePath("/app/chat");
  revalidatePath("/app", "layout");
  revalidatePath("/app/notifications");
  publishChatPresence(groupId);
  return { ok: true };
}

export async function leaveChatAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");

  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    include: { group: true },
  });
  if (!member) return { ok: false, error: "You’re not in this chat." };

  // Closing a DM keeps history for both people but blocks further messages.
  if (member.group.isDirect) {
    if (!member.group.closedAt) {
      await prisma.chatGroup.update({
        where: { id: groupId },
        data: { closedAt: new Date(), closedById: user.id },
      });
    }

    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        type: "CHAT_MESSAGE",
        meta: { contains: groupId },
      },
      data: { read: true },
    });

    revalidatePath("/app/chat");
    revalidatePath("/app/notifications");
    revalidatePath("/app", "layout");
    return { ok: true };
  }

  await prisma.chatMember.delete({ where: { id: member.id } });

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      type: "CHAT_MESSAGE",
      meta: { contains: groupId },
    },
    data: { read: true },
  });

  const remaining = await prisma.chatMember.count({ where: { groupId } });
  if (remaining === 0) {
    await prisma.chatGroup.delete({ where: { id: groupId } }).catch(() => null);
  }

  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

async function canManageGroupChat(
  group: {
    isDirect: boolean;
    createdById: string;
    workspaceId: string | null;
  },
  userId: string,
) {
  if (group.isDirect) return false;
  if (group.createdById === userId) return true;
  if (!group.workspaceId) return false;
  const membership = await prisma.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: group.workspaceId,
        userId,
      },
    },
  });
  return Boolean(membership && canCreateGroups(membership.role));
}

export async function addGroupMembersAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const memberUsernames = String(formData.get("members") ?? "")
    .split(",")
    .map((s) => normalizeUsername(s))
    .filter(Boolean);

  if (memberUsernames.length === 0) {
    return { ok: false, error: "Pick at least one person to add." };
  }

  const group = await prisma.chatGroup.findUnique({
    where: { id: groupId },
    include: { members: true },
  });
  if (!group || group.isDirect) {
    return { ok: false, error: "Group not found." };
  }

  const isMember = group.members.some((m) => m.userId === user.id);
  if (!isMember) return { ok: false, error: "You’re not in this chat." };
  if (!(await canManageGroupChat(group, user.id))) {
    return {
      ok: false,
      error: group.workspaceId
        ? "Only the creator or a workspace admin can edit members."
        : "Only the group creator can edit members.",
    };
  }

  const users = await prisma.user.findMany({
    where: { username: { in: memberUsernames }, deletedAt: null },
  });
  if (users.length !== memberUsernames.length) {
    return { ok: false, error: "One or more usernames weren’t found." };
  }

  const existingIds = new Set(group.members.map((m) => m.userId));
  const toAdd: string[] = [];

  for (const other of users) {
    if (existingIds.has(other.id)) continue;
    if (group.workspaceId) {
      const wsMember = await prisma.membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: group.workspaceId,
            userId: other.id,
          },
        },
      });
      if (!wsMember) {
        return {
          ok: false,
          error: `@${other.username} isn’t in this workspace.`,
        };
      }
    } else {
      const friendship = await areAcceptedFriends(user.id, other.id);
      if (!friendship) {
        return {
          ok: false,
          error: `You’re not friends with @${other.username}.`,
        };
      }
    }
    toAdd.push(other.id);
  }

  if (toAdd.length === 0) {
    return { ok: false, error: "Everyone selected is already in the group." };
  }

  await prisma.chatMember.createMany({
    data: toAdd.map((userId) => ({ groupId, userId })),
    skipDuplicates: true,
  });

  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function removeGroupMemberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const memberUserId = String(formData.get("memberUserId") ?? "");

  if (!memberUserId) return { ok: false, error: "Missing member." };
  if (memberUserId === user.id) {
    return { ok: false, error: "Use Leave group to remove yourself." };
  }

  const group = await prisma.chatGroup.findUnique({
    where: { id: groupId },
    include: { members: true },
  });
  if (!group || group.isDirect) {
    return { ok: false, error: "Group not found." };
  }

  const isMember = group.members.some((m) => m.userId === user.id);
  if (!isMember) return { ok: false, error: "You’re not in this chat." };
  if (!(await canManageGroupChat(group, user.id))) {
    return {
      ok: false,
      error: group.workspaceId
        ? "Only the creator or a workspace admin can edit members."
        : "Only the group creator can edit members.",
    };
  }

  const target = group.members.find((m) => m.userId === memberUserId);
  if (!target) return { ok: false, error: "They’re not in this group." };

  await prisma.chatMember.delete({ where: { id: target.id } });

  await prisma.notification.updateMany({
    where: {
      userId: memberUserId,
      type: "CHAT_MESSAGE",
      meta: { contains: groupId },
    },
    data: { read: true },
  });

  const remaining = await prisma.chatMember.count({ where: { groupId } });
  if (remaining === 0) {
    await prisma.chatGroup.delete({ where: { id: groupId } }).catch(() => null);
  }

  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function deleteChatGroupAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");

  const group = await prisma.chatGroup.findUnique({
    where: { id: groupId },
    include: { members: true },
  });
  if (!group) return { ok: false, error: "Chat not found." };
  if (group.isDirect) {
    return { ok: false, error: "Leave a DM instead of deleting it for everyone." };
  }

  const isMember = group.members.some((m) => m.userId === user.id);
  if (!isMember) return { ok: false, error: "You’re not in this chat." };

  if (!(await canManageGroupChat(group, user.id))) {
    return {
      ok: false,
      error: group.workspaceId
        ? "Only the creator or a workspace admin can delete this group."
        : "Only the group creator can delete this group.",
    };
  }

  await prisma.chatGroup.delete({ where: { id: groupId } });

  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function markChatNotificationsReadAction(
  groupId: string,
): Promise<void> {
  const user = await requireUser();
  if (!groupId) return;

  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return;

  await prisma.chatMember.update({
    where: { id: member.id },
    data: { lastActiveAt: new Date() },
  });

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      type: { in: ["CHAT_MESSAGE", "CHAT_MENTION"] },
      read: false,
      meta: { contains: groupId },
    },
    data: { read: true },
  });

  revalidatePath("/app/chat");
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
}

/** Heartbeat while a chat thread is open — used to suppress noisy notifications. */
export async function pulseChatPresenceAction(groupId: string): Promise<void> {
  const user = await requireUser();
  const now = new Date();
  await prisma.chatMember.updateMany({
    where: { groupId, userId: user.id },
    data: { lastActiveAt: now, lastSeenAt: now },
  });
  publishChatPresence(groupId);
}

export async function clearChatPresenceAction(groupId: string): Promise<void> {
  const user = await requireUser();
  await prisma.chatMember.updateMany({
    where: { groupId, userId: user.id },
    data: { lastActiveAt: null },
  });
  publishChatPresence(groupId);
}


export async function updateFriendProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const friendUserId = String(formData.get("friendUserId") ?? "");
  const personalNickname = String(formData.get("personalNickname") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const personalNotes = String(formData.get("personalNotes") ?? "")
    .trim()
    .slice(0, 2000);

  const friendship = await areAcceptedFriends(user.id, friendUserId);
  if (!friendship) return { ok: false, error: "You’re not friends with that user." };

  await prisma.friendProfile.upsert({
    where: {
      ownerId_friendId: { ownerId: user.id, friendId: friendUserId },
    },
    create: {
      ownerId: user.id,
      friendId: friendUserId,
      personalNickname: personalNickname || null,
      personalNotes: personalNotes || null,
    },
    update: {
      personalNickname: personalNickname || null,
      personalNotes: personalNotes || null,
    },
  });

  revalidatePath("/app/social");
  return { ok: true };
}

export async function setChatNotifyModeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const mode = String(formData.get("mode") ?? "") as "ALL" | "MENTIONS" | "MUTE";
  if (!["ALL", "MENTIONS", "MUTE"].includes(mode)) {
    return { ok: false, error: "Pick a valid notification mode." };
  }

  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return { ok: false, error: "You’re not in this chat." };

  await prisma.chatMember.update({
    where: { id: member.id },
    data: { notifyMode: mode },
  });

  revalidatePath("/app/chat");
  return { ok: true };
}

export async function touchChatSeenAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const groupId = String(formData.get("groupId") ?? "");
  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return { ok: false, error: "You’re not in this chat." };

  const now = new Date();
  await prisma.chatMember.update({
    where: { id: member.id },
    data: { lastSeenAt: now, lastActiveAt: now },
  });

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      read: false,
      type: { in: ["CHAT_MESSAGE", "CHAT_MENTION"] },
      meta: { contains: groupId },
    },
    data: { read: true },
  });

  publishChatPresence(groupId);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function setTypingAction(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return { ok: false, error: "You’re not in this chat." };

  const now = new Date();
  await prisma.chatMember.update({
    where: { id: member.id },
    data: { typingAt: now, lastSeenAt: now, lastActiveAt: now },
  });
  publishChatPresence(groupId);
  return { ok: true };
}

export async function clearTypingAction(groupId: string): Promise<ActionResult> {
  const user = await requireUser();
  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return { ok: false, error: "You’re not in this chat." };

  await prisma.chatMember.update({
    where: { id: member.id },
    data: { typingAt: null },
  });
  publishChatPresence(groupId);
  return { ok: true };
}

export async function fetchChatPresence(groupId: string) {
  const user = await requireUser();
  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return { ok: false as const, error: "You’re not in this chat." };

  const members = await prisma.chatMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, username: true } } },
  });

  const { derivePresence } = await import("@/lib/chat-presence");
  const presence = derivePresence(
    members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      lastSeenAt: m.lastSeenAt ?? m.lastActiveAt,
      typingAt: m.typingAt,
    })),
    user.id,
  );

  return { ok: true as const, presence, selfId: user.id };
}
