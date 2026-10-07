import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getChatPresenceSnapshot,
  isAblyConfigured,
} from "@/lib/ably-server";
import { derivePresence, type ChatPresenceMember } from "@/lib/chat-presence";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Short JSON presence snapshot (not SSE).
 * Prefers live Ably Presence when configured; falls back to Neon lastSeen/typing.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await context.params;
  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chatMembers = await prisma.chatMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, username: true } } },
  });

  let presence: ChatPresenceMember[];

  if (isAblyConfigured()) {
    const live = await getChatPresenceSnapshot(groupId);
    const liveById = new Map(live.map((m) => [m.userId, m]));
    presence = chatMembers.map((m) => {
      const hit = liveById.get(m.userId);
      return {
        userId: m.userId,
        username: m.user.username,
        online: Boolean(hit),
        typing: Boolean(hit?.typing && m.userId !== user.id),
      };
    });
  } else {
    presence = derivePresence(
      chatMembers.map((m) => ({
        userId: m.userId,
        username: m.user.username,
        lastSeenAt: m.lastSeenAt ?? m.lastActiveAt,
        typingAt: m.typingAt,
      })),
      user.id,
    );
  }

  return NextResponse.json({
    presence,
    selfId: user.id,
    source: isAblyConfigured() ? "ably" : "neon",
  });
}
