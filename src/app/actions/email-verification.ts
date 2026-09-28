"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSession, getCurrentUser, parseSignInDuration, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { welcomeAccountEmail } from "@/lib/email-templates";
import {
  issueEmailVerification,
  issuePendingSignup,
} from "@/lib/email-verification";
import { sendEmail } from "@/lib/mail";
import { isValidEmail } from "@/lib/utils";
import type { ActionResult } from "@/app/actions/auth";

export async function requestEmailChangeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const emailRaw = String(formData.get("email") ?? "").trim();
  if (!emailRaw || !isValidEmail(emailRaw)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const email = emailRaw.toLowerCase();

  if (user.email && user.email.toLowerCase() === email) {
    return { ok: false, error: "That’s already your verified email." };
  }

  const taken = await prisma.user.findFirst({
    where: { email, NOT: { id: user.id } },
  });
  if (taken) return { ok: false, error: "That email is already in use." };

  const issued = await issueEmailVerification({
    userId: user.id,
    email,
    username: user.username,
  });
  if (!issued.ok) {
    return {
      ok: false,
      error: issued.error,
      retryAfterSec: issued.retryAfterSec,
    };
  }

  return {
    ok: true,
    needsEmailVerification: true,
    email: issued.email,
    emailed: !issued.mocked,
  };
}

export async function verifyEmailCodeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "").trim();
  const pendingSignupId = String(formData.get("pendingSignupId") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/app";

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  // New signup with email: create the User only after the code matches.
  if (pendingSignupId) {
    const pending = await prisma.pendingSignup.findUnique({
      where: { id: pendingSignupId },
    });
    if (!pending) {
      return {
        ok: false,
        error: "That signup expired. Start again from the sign-up page.",
      };
    }
    if (pending.expiresAt < new Date()) {
      await prisma.pendingSignup.delete({ where: { id: pending.id } }).catch(() => null);
      return { ok: false, error: "That code expired. Resend a new one." };
    }
    if (pending.attempts >= 5) {
      await prisma.pendingSignup.delete({ where: { id: pending.id } }).catch(() => null);
      return { ok: false, error: "Too many incorrect attempts. Start signup again." };
    }
    if (pending.code !== code) {
      await prisma.pendingSignup.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      return { ok: false, error: "That code doesn’t match. Try again." };
    }

    const usernameTaken = await prisma.user.findUnique({
      where: { username: pending.username },
    });
    if (usernameTaken) {
      await prisma.pendingSignup.delete({ where: { id: pending.id } }).catch(() => null);
      return { ok: false, error: "That username was just taken. Pick another." };
    }
    const emailTaken = await prisma.user.findUnique({
      where: { email: pending.email },
    });
    if (emailTaken) {
      await prisma.pendingSignup.delete({ where: { id: pending.id } }).catch(() => null);
      return { ok: false, error: "That email was just claimed by another account." };
    }

    const user = await prisma.user.create({
      data: {
        username: pending.username,
        passwordHash: pending.passwordHash,
        email: pending.email,
        nickname: pending.nickname,
      },
    });
    await prisma.pendingSignup.delete({ where: { id: pending.id } });
    await createSession(user.id, {
      duration: parseSignInDuration(pending.signInDuration),
    });

    const content = welcomeAccountEmail({
      username: user.username,
      nickname: user.nickname,
    });
    await sendEmail({
      to: pending.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    revalidatePath("/app", "layout");
    const redirectAfter = String(formData.get("redirectAfter") ?? "") === "true";
    if (redirectAfter) redirect(next);
    return { ok: true, emailVerified: true };
  }

  const user = await requireUser();
  const pending = await prisma.emailVerification.findUnique({
    where: { userId: user.id },
  });
  if (!pending) {
    return { ok: false, error: "No verification is pending. Request a new code." };
  }
  if (pending.expiresAt < new Date()) {
    return { ok: false, error: "That code expired. Resend a new one." };
  }
  if (pending.attempts >= 5) {
    await prisma.emailVerification.delete({ where: { id: pending.id } });
    return { ok: false, error: "Too many incorrect attempts. Request a new code." };
  }
  if (pending.code !== code) {
    await prisma.emailVerification.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "That code doesn’t match. Try again." };
  }

  const taken = await prisma.user.findFirst({
    where: { email: pending.email, NOT: { id: user.id } },
  });
  if (taken) {
    return { ok: false, error: "That email was just claimed by another account." };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { email: pending.email },
  });
  await prisma.emailVerification.delete({ where: { id: pending.id } });

  const content = welcomeAccountEmail({
    username: updated.username,
    nickname: updated.nickname,
  });
  await sendEmail({
    to: pending.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  revalidatePath("/app", "layout");
  revalidatePath("/app/profile");

  const redirectAfter = String(formData.get("redirectAfter") ?? "") === "true";
  if (redirectAfter) {
    redirect(next);
  }

  return { ok: true, emailVerified: true };
}

export async function resendEmailCodeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const pendingSignupId = String(formData.get("pendingSignupId") ?? "").trim();

  if (pendingSignupId) {
    const pending = await prisma.pendingSignup.findUnique({
      where: { id: pendingSignupId },
    });
    if (!pending) {
      return { ok: false, error: "No verification is pending." };
    }
    const issued = await issuePendingSignup({
      username: pending.username,
      passwordHash: pending.passwordHash,
      email: pending.email,
      forceResend: true,
      pendingId: pending.id,
    });
    if (!issued.ok) {
      return {
        ok: false,
        error: issued.error,
        retryAfterSec: issued.retryAfterSec,
      };
    }
    return {
      ok: true,
      needsEmailVerification: true,
      email: issued.email,
      emailed: !issued.mocked,
      resent: true,
      pendingSignupId: issued.pendingId,
    };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to resend a code." };

  const pending = await prisma.emailVerification.findUnique({
    where: { userId: user.id },
  });
  if (!pending) {
    return { ok: false, error: "No verification is pending." };
  }

  const issued = await issueEmailVerification({
    userId: user.id,
    email: pending.email,
    username: user.username,
    forceResend: true,
  });
  if (!issued.ok) {
    return {
      ok: false,
      error: issued.error,
      retryAfterSec: issued.retryAfterSec,
    };
  }

  return {
    ok: true,
    needsEmailVerification: true,
    email: issued.email,
    emailed: !issued.mocked,
    resent: true,
  };
}