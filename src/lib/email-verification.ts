import { prisma } from "@/lib/db";
import { emailVerificationCodeEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/mail";
import { randomInt } from "crypto";

export const EMAIL_CODE_TTL_MS = 1000 * 60 * 15;
export const EMAIL_RESEND_COOLDOWN_MS = 1000 * 30;

export function generateEmailCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function issueEmailVerification(opts: {
  userId: string;
  email: string;
  username: string;
  forceResend?: boolean;
}): Promise<
  | { ok: true; email: string; mocked: boolean; retryAfterSec?: number }
  | { ok: false; error: string; retryAfterSec?: number }
> {
  const email = opts.email.toLowerCase();
  const existing = await prisma.emailVerification.findUnique({
    where: { userId: opts.userId },
  });

  if (existing && opts.forceResend) {
    const waitMs =
      EMAIL_RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt.getTime());
    if (waitMs > 0) {
      return {
        ok: false,
        error: `Wait ${Math.ceil(waitMs / 1000)}s before resending.`,
        retryAfterSec: Math.ceil(waitMs / 1000),
      };
    }
  }

  const code = generateEmailCode();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
  const now = new Date();

  // Persist the pending code first; only bump lastSentAt after a successful send
  // so a Resend failure doesn’t start the 30s cooldown.
  await prisma.emailVerification.upsert({
    where: { userId: opts.userId },
    create: {
      userId: opts.userId,
      email,
      code,
      expiresAt,
      lastSentAt: existing?.lastSentAt ?? new Date(0),
    },
    update: {
      email,
      code,
      expiresAt,
    },
  });

  const content = emailVerificationCodeEmail({
    username: opts.username,
    code,
    email,
  });
  const sent = await sendEmail({
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }

  await prisma.emailVerification.update({
    where: { userId: opts.userId },
    data: { lastSentAt: now },
  });

  return { ok: true, email, mocked: sent.mocked };
}

/** Hold signup details until the email code is confirmed — no User row yet. */
export async function issuePendingSignup(opts: {
  username: string;
  passwordHash: string;
  email: string;
  nickname?: string | null;
  signInDuration?: string;
  forceResend?: boolean;
  pendingId?: string;
}): Promise<
  | { ok: true; email: string; pendingId: string; mocked: boolean; retryAfterSec?: number }
  | { ok: false; error: string; retryAfterSec?: number }
> {
  const email = opts.email.toLowerCase();
  const existing = opts.pendingId
    ? await prisma.pendingSignup.findUnique({ where: { id: opts.pendingId } })
    : await prisma.pendingSignup.findUnique({ where: { username: opts.username } });

  if (existing && opts.forceResend) {
    const waitMs =
      EMAIL_RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt.getTime());
    if (waitMs > 0) {
      return {
        ok: false,
        error: `Wait ${Math.ceil(waitMs / 1000)}s before resending.`,
        retryAfterSec: Math.ceil(waitMs / 1000),
      };
    }
  }

  const code = generateEmailCode();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
  const now = new Date();
  const signInDuration =
    opts.signInDuration?.trim() || existing?.signInDuration || "session";
  const nickname =
    opts.nickname !== undefined ? opts.nickname : existing?.nickname ?? null;

  const pending = existing
    ? await prisma.pendingSignup.update({
        where: { id: existing.id },
        data: {
          passwordHash: opts.passwordHash || existing.passwordHash,
          email,
          nickname,
          code,
          expiresAt,
          ...(opts.signInDuration?.trim()
            ? { signInDuration: opts.signInDuration.trim() }
            : {}),
        },
      })
    : await prisma.pendingSignup.create({
        data: {
          username: opts.username,
          passwordHash: opts.passwordHash,
          email,
          nickname,
          code,
          expiresAt,
          signInDuration,
          lastSentAt: new Date(0),
        },
      });

  const content = emailVerificationCodeEmail({
    username: opts.username,
    code,
    email,
  });
  const sent = await sendEmail({
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }

  await prisma.pendingSignup.update({
    where: { id: pending.id },
    data: { lastSentAt: now },
  });

  return { ok: true, email, pendingId: pending.id, mocked: sent.mocked };
}
