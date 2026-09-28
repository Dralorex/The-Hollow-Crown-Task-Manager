"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { personLabel } from "@/lib/utils";

export type FloatingChatSummary = {
  id: string;
  title: string;
  snippet: string;
  unread: number;
  closed: boolean;
  kind: "dm" | "group" | "workspace";
  updatedAt: string;
};

export type FloatingChatMessage = {
  id: string;
  senderLabel: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type FloatingChatThread = {
  id: string;
  title: string;
  closed: boolean;
  membersLabel: string;
  messages: FloatingChatMessage[];
};

function snippet(body: string | undefined) {
  if (!body) return "No messages yet";
  const trimmed = body.trim();
  return trimmed.length > 64 ? `${trimmed.slice(0, 64)}…` : trimmed;
}

function dmTitle(
  members: { user: Parameters<typeof personLabel>[0] & { id: string } }[],
  userId: string,
) {
  const other = members.find((m) => m.user.id !== userId)?.user;
  return other ? personLabel(other) : "Direct message";
}

export async function loadFloatingChatListAction(): Promise<{
  ok: true;
  chats: FloatingChatSummary[];
} | { ok: false; error: string }> {
  const user = await requireUser();

  const [memberships, unreadRows] = await Promise.all([
    prisma.chatMember.findMany({
      where: { userId: user.id },
      include: {
        group: {
          include: {
            members: { include: { user: true } },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { sender: true },
            },
          },
        },
      },
    }),
    prisma.notification.findMany({
      where: {
        userId: user.id,
        type: { in: ["CHAT_MESSAGE", "CHAT_MENTION"] },
        read: false,
      },
      select: { meta: true },
    }),
  ]);

  const unreadCounts = new Map<string, number>();
  for (const n of unreadRows) {
    if (!n.meta) continue;
    try {
      const meta = JSON.parse(n.meta) as { groupId?: string };
      if (meta.groupId) {
        unreadCounts.set(
          meta.groupId,
          (unreadCounts.get(meta.groupId) ?? 0) + 1,
        );
      }
    } catch {
      /* ignore */
    }
  }

  const chats: FloatingChatSummary[] = memberships.map((m) => {
    const g = m.group;
    const last = g.messages[0];
    const kind: FloatingChatSummary["kind"] = g.isDirect
      ? "dm"
      : g.workspaceId
        ? "workspace"
        : "group";
    return {
      id: g.id,
      title: g.isDirect ? dmTitle(g.members, user.id) : g.name,
      snippet: last
        ? `${last.senderId === user.id ? "You" : personLabel(last.sender)}: ${snippet(last.body)}`
        : snippet(undefined),
      unread: unreadCounts.get(g.id) ?? 0,
      closed: Boolean(g.closedAt),
      kind,
      updatedAt: (last?.createdAt ?? g.createdAt).toISOString(),
    };
  });

  chats.sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return { ok: true, chats };
}

export async function loadFloatingChatThreadAction(
  groupId: string,
): Promise<
  { ok: true; thread: FloatingChatThread } | { ok: false; error: string }
> {
  const user = await requireUser();
  if (!groupId) return { ok: false, error: "Missing chat." };

  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!member) return { ok: false, error: "You’re not in this chat." };

  const group = await prisma.chatGroup.findUnique({
    where: { id: groupId },
    include: {
      members: { include: { user: true } },
    },
  });
  if (!group) return { ok: false, error: "Chat not found." };

  const messages = await prisma.message.findMany({
    where: { groupId },
    orderBy: { createdAt: "asc" },
    take: 120,
    include: { sender: true },
  });

  return {
    ok: true,
    thread: {
      id: group.id,
      title: group.isDirect
        ? dmTitle(group.members, user.id)
        : group.name,
      closed: Boolean(group.closedAt),
      membersLabel: group.members.map((m) => personLabel(m.user)).join(", "),
      messages: messages.map((msg) => ({
        id: msg.id,
        senderLabel: personLabel(msg.sender),
        body: msg.body,
        createdAt: msg.createdAt.toISOString(),
        mine: msg.senderId === user.id,
      })),
    },
  };
}
