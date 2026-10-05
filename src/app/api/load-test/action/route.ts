import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  pushBadgeDeltaForUsers,
  pushChatMessageForUsers,
} from "@/lib/ably-server";
import { prisma } from "@/lib/db";
import { personLabel } from "@/lib/utils";

/**
 * Gated write path for the load harness.
 * Returns 404 unless LOAD_TEST_SECRET is set AND request header matches.
 * Does not send Resend email.
 */
export async function POST(req: Request) {
  const expected = process.env.LOAD_TEST_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 404 });
  }
  const provided = req.headers.get("x-load-test-secret")?.trim();
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  if (!user.username.startsWith("loaduser_")) {
    return NextResponse.json({ ok: false, error: "not_load_user" }, { status: 403 });
  }

  let body: { type?: string; groupId?: string; body?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const groupId = body.groupId?.trim();
  if (!groupId) {
    return NextResponse.json({ ok: false, error: "groupId required" }, { status: 400 });
  }

  const member = await prisma.chatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ ok: false, error: "not_member" }, { status: 403 });
  }

  if (body.type === "heartbeat") {
    await prisma.chatMember.update({
      where: { id: member.id },
      data: { lastActiveAt: new Date(), lastSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true, type: "heartbeat" });
  }

  if (body.type !== "message") {
    return NextResponse.json({ ok: false, error: "unknown_type" }, { status: 400 });
  }

  const text = (body.body?.trim() || `load message ${Date.now()}`).slice(0, 500);
  const message = await prisma.message.create({
    data: {
      groupId,
      senderId: user.id,
      body: text,
    },
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          nickname: true,
          deletedAt: true,
          deletedUsername: true,
        },
      },
    },
  });

  await prisma.chatMember.update({
    where: { id: member.id },
    data: { lastActiveAt: new Date(), lastSeenAt: new Date(), typingAt: null },
  });

  const memberIds = (
    await prisma.chatMember.findMany({
      where: { groupId },
      select: { userId: true },
    })
  ).map((m) => m.userId);

  const event = {
    id: message.id,
    groupId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    senderId: message.sender.id,
    senderLabel: personLabel(message.sender),
    senderUsername: message.sender.username,
  };

  // Fan-out like production chat path (no Resend). Notifications skipped to
  // keep the harness from flooding the Notification table / badge path.
  await pushChatMessageForUsers(memberIds, event);
  const others = memberIds.filter((id) => id !== user.id);
  if (others.length) {
    await pushBadgeDeltaForUsers(others, { chatUnreadDelta: 1 });
  }

  return NextResponse.json({ ok: true, type: "message", id: message.id });
}
