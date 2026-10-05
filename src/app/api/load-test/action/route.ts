import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import {
  pushBadgeDeltaForUsers,
  pushChatMessageForUsers,
} from "@/lib/ably-server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import {
  canEditContent,
  canManagePeople,
  requireMembership,
} from "@/lib/permissions";
import { recordTaskActivity } from "@/lib/task-activity";
import {
  assertAllowedUpload,
  buildObjectKey,
  deleteObject,
  headObject,
  isR2Configured,
  presignDownload,
  presignUpload,
} from "@/lib/r2";
import { personLabel } from "@/lib/utils";

/**
 * Gated multi-system write path for the load harness.
 * Returns 404 unless LOAD_TEST_SECRET is set AND request header matches.
 * Types: message | heartbeat | r2_cycle | stripe_ensure_customer | stripe_ping
 * Does not send Resend email. Virus scan deferred.
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

  let body: {
    type?: string;
    groupId?: string;
    workspaceId?: string;
    folderId?: string;
    body?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const type = body.type?.trim();
  const workspaceId = body.workspaceId?.trim();

  if (type === "stripe_ensure_customer") {
    return stripeEnsureCustomer(user.id, user.email, user.username, user.nickname);
  }
  if (type === "stripe_ping") {
    return stripePing(user.id);
  }
  if (type === "r2_cycle") {
    return r2Cycle(user.id, workspaceId);
  }
  if (type === "heartbeat" || type === "message") {
    return chatAction(user, type, body.groupId?.trim(), body.body);
  }
  if (type === "create_task") {
    return createTask(user.id, workspaceId, body.folderId?.trim());
  }
  if (type === "claim_task") {
    return claimTask(user, workspaceId);
  }
  if (type === "complete_task") {
    return completeTask(user, workspaceId);
  }
  if (type === "review_task") {
    return reviewTask(user, workspaceId);
  }
  if (type === "share_birthday") {
    return shareBirthday(user.id, workspaceId);
  }

  return NextResponse.json({ ok: false, error: "unknown_type" }, { status: 400 });
}

async function chatAction(
  user: {
    id: string;
    username: string;
    nickname: string | null;
    deletedAt: Date | null;
    deletedUsername: string | null;
  },
  type: "heartbeat" | "message",
  groupId: string | undefined,
  textRaw: string | undefined,
) {
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

  if (type === "heartbeat") {
    await prisma.chatMember.update({
      where: { id: member.id },
      data: { lastActiveAt: new Date(), lastSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true, type: "heartbeat" });
  }

  const text = (textRaw?.trim() || `load message ${Date.now()}`).slice(0, 500);
  const message = await prisma.message.create({
    data: { groupId, senderId: user.id, body: text },
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

  await pushChatMessageForUsers(memberIds, {
    id: message.id,
    groupId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    senderId: message.sender.id,
    senderLabel: personLabel(message.sender),
    senderUsername: message.sender.username,
  });
  const others = memberIds.filter((id) => id !== user.id);
  if (others.length) {
    await pushBadgeDeltaForUsers(others, { chatUnreadDelta: 1 });
  }

  return NextResponse.json({ ok: true, type: "message", id: message.id });
}

async function r2Cycle(userId: string, workspaceId: string | undefined) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { ok: false, error: "r2_not_configured", skipped: true },
      { status: 503 },
    );
  }
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });
  }

  try {
    const membership = await requireMembership(workspaceId, userId);
    if (!canManagePeople(membership.role)) {
      return NextResponse.json({ ok: false, error: "admin_required" }, { status: 403 });
    }

    const filename = `load-${Date.now()}.txt`;
    const contentType = "text/plain";
    const payload = `rowgon load ${new Date().toISOString()} ${userId}\n`;
    const bytes = Buffer.byteLength(payload);
    assertAllowedUpload(contentType, bytes);

    const objectId = nanoid(16);
    const key = buildObjectKey(workspaceId, objectId, filename);
    const upload = await presignUpload({ key, contentType, maxBytes: bytes });

    const putRes = await fetch(upload.url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: payload,
    });
    if (!putRes.ok) {
      return NextResponse.json(
        { ok: false, error: `r2_put_${putRes.status}` },
        { status: 502 },
      );
    }

    const head = await headObject(key);
    const row = await prisma.storedObject.create({
      data: {
        workspaceId,
        key,
        filename,
        contentType,
        bytes: head.bytes,
        uploadedById: userId,
      },
    });

    const download = await presignDownload(key);
    const getRes = await fetch(download.url);
    if (!getRes.ok) {
      return NextResponse.json(
        { ok: false, error: `r2_get_${getRes.status}`, objectId: row.id },
        { status: 502 },
      );
    }

    // Delete immediately so a 30-min run doesn't leave GB behind
    await deleteObject(key);
    await prisma.storedObject.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      type: "r2_cycle",
      bytes: head.bytes,
      objectId: row.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "r2_cycle_failed";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ ok: false, error: "admin_required" }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function stripeEnsureCustomer(
  userId: string,
  email: string | null,
  username: string,
  nickname: string | null,
) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "stripe_not_configured", skipped: true },
      { status: 503 },
    );
  }
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: "stripe_not_configured", skipped: true },
      { status: 503 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) {
    return NextResponse.json({
      ok: true,
      type: "stripe_ensure_customer",
      customerId: existing.stripeCustomerId,
      created: false,
    });
  }

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    name: nickname || username,
    metadata: { rowgonUserId: userId, loadTest: "true" },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return NextResponse.json({
    ok: true,
    type: "stripe_ensure_customer",
    customerId: customer.id,
    created: true,
  });
}

async function stripePing(userId: string) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "stripe_not_configured", skipped: true },
      { status: 503 },
    );
  }
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { ok: false, error: "stripe_not_configured", skipped: true },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });

  // Cheap test-mode API calls — no Checkout charges
  const products = await stripe.products.list({ limit: 3 });
  let customerOk = false;
  if (user?.stripeCustomerId) {
    await stripe.customers.retrieve(user.stripeCustomerId);
    customerOk = true;
  }

  return NextResponse.json({
    ok: true,
    type: "stripe_ping",
    products: products.data.length,
    customerOk,
  });
}

async function createTask(
  userId: string,
  workspaceId: string | undefined,
  folderId: string | undefined,
) {
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });
  }
  try {
    const membership = await requireMembership(workspaceId, userId);
    if (!canEditContent(membership.role)) {
      return NextResponse.json({ ok: false, error: "editor_required" }, { status: 403 });
    }
    let folder = folderId
      ? await prisma.folder.findFirst({ where: { id: folderId, workspaceId } })
      : null;
    if (!folder) {
      folder = await prisma.folder.findFirst({ where: { workspaceId } });
    }
    if (!folder) {
      return NextResponse.json({ ok: false, error: "no_folder" }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        workspaceId,
        folderId: folder.id,
        name: `Live task ${new Date().toISOString().slice(11, 19)}`,
        description: "Created during realistic load harness.",
        priority: "MEDIUM",
        createdById: userId,
        status: "OPEN",
      },
    });
    await recordTaskActivity({
      taskId: task.id,
      actorId: userId,
      type: "created",
      message: "Load harness created task",
    });
    return NextResponse.json({ ok: true, type: "create_task", taskId: task.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create_task_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function claimTask(
  user: { id: string; username: string; nickname: string | null },
  workspaceId: string | undefined,
) {
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });
  }
  try {
    await requireMembership(workspaceId, user.id);
    const open = await prisma.task.findFirst({
      where: { workspaceId, status: "OPEN", assigneeId: null },
      orderBy: { createdAt: "asc" },
    });
    if (!open) {
      return NextResponse.json({
        ok: true,
        type: "claim_task",
        skipped: true,
        reason: "no_open_tasks",
      });
    }
    await prisma.task.update({
      where: { id: open.id },
      data: {
        assigneeId: user.id,
        status: "CLAIMED",
        claimedAt: new Date(),
      },
    });
    await recordTaskActivity({
      taskId: open.id,
      actorId: user.id,
      type: "claimed",
      message: `${personLabel(user)} claimed this task`,
    });
    return NextResponse.json({ ok: true, type: "claim_task", taskId: open.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "claim_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function completeTask(
  user: { id: string; username: string; nickname: string | null },
  workspaceId: string | undefined,
) {
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });
  }
  try {
    await requireMembership(workspaceId, user.id);
    const mine = await prisma.task.findFirst({
      where: {
        workspaceId,
        assigneeId: user.id,
        status: "CLAIMED",
      },
      orderBy: { claimedAt: "asc" },
    });
    if (!mine) {
      return NextResponse.json({
        ok: true,
        type: "complete_task",
        skipped: true,
        reason: "nothing_claimed",
      });
    }
    const comment = "Wrapped up in load harness.";
    await prisma.task.update({
      where: { id: mine.id },
      data: { status: "IN_REVIEW", completionComment: comment },
    });
    await recordTaskActivity({
      taskId: mine.id,
      actorId: user.id,
      type: "submitted_review",
      message: `${personLabel(user)} submitted for review: ${comment}`,
    });
    const reviewers = await prisma.membership.findMany({
      where: { workspaceId, role: { in: ["OWNER", "ADMIN", "EDITOR"] } },
      select: { userId: true },
    });
    if (reviewers.length) {
      await prisma.notification.createMany({
        data: reviewers.map((m) => ({
          userId: m.userId,
          type: "TASK_REVIEW",
          title: "Ready for review",
          body: `${personLabel(user)} finished “${mine.name}”`,
          meta: JSON.stringify({
            workspaceId,
            taskId: mine.id,
            folderId: mine.folderId,
          }),
        })),
      });
    }
    return NextResponse.json({ ok: true, type: "complete_task", taskId: mine.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "complete_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function reviewTask(
  user: { id: string; username: string; nickname: string | null },
  workspaceId: string | undefined,
) {
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });
  }
  try {
    const membership = await requireMembership(workspaceId, user.id);
    if (!canEditContent(membership.role)) {
      return NextResponse.json({ ok: false, error: "editor_required" }, { status: 403 });
    }
    const pending = await prisma.task.findFirst({
      where: { workspaceId, status: "IN_REVIEW" },
      orderBy: { updatedAt: "asc" },
    });
    if (!pending) {
      return NextResponse.json({
        ok: true,
        type: "review_task",
        skipped: true,
        reason: "nothing_to_review",
      });
    }
    await prisma.task.update({
      where: { id: pending.id },
      data: { status: "DONE" },
    });
    await recordTaskActivity({
      taskId: pending.id,
      actorId: user.id,
      type: "approved",
      message: `${personLabel(user)} approved this task`,
    });
    return NextResponse.json({ ok: true, type: "review_task", taskId: pending.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "review_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function shareBirthday(userId: string, workspaceId: string | undefined) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, birthday: true },
    });
    if (!user?.birthday) {
      return NextResponse.json({
        ok: true,
        type: "share_birthday",
        skipped: true,
        reason: "no_birthday",
      });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    });
    for (const f of friendships) {
      const viewerId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      await prisma.birthdayShare.upsert({
        where: { ownerId_viewerId: { ownerId: userId, viewerId } },
        create: { ownerId: userId, viewerId, status: "ACTIVE" },
        update: { status: "ACTIVE" },
      });
    }

    if (workspaceId) {
      await prisma.workspaceBirthdayRequest.upsert({
        where: {
          workspaceId_subjectId: { workspaceId, subjectId: userId },
        },
        create: {
          workspaceId,
          subjectId: userId,
          status: "ACTIVE",
        },
        update: { status: "ACTIVE" },
      });
    }

    return NextResponse.json({
      ok: true,
      type: "share_birthday",
      friends: friendships.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "birthday_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
