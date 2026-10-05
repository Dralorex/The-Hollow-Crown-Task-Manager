import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getCurrentUser } from "@/lib/auth";
import {
  pushBadgeDeltaForUsers,
  pushChatMessageForUsers,
} from "@/lib/ably-server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { canManagePeople, requireMembership } from "@/lib/permissions";
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
    body?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const type = body.type?.trim();
  if (type === "stripe_ensure_customer") {
    return stripeEnsureCustomer(user.id, user.email, user.username, user.nickname);
  }
  if (type === "stripe_ping") {
    return stripePing(user.id);
  }
  if (type === "r2_cycle") {
    return r2Cycle(user.id, body.workspaceId?.trim());
  }
  if (type === "heartbeat" || type === "message") {
    return chatAction(user, type, body.groupId?.trim(), body.body);
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
