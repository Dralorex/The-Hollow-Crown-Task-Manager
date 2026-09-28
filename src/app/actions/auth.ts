"use server";

import { redirect } from "next/navigation";
import {
  createSession,
  destroySession,
  hashPassword,
  parseSignInDuration,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { passwordResetEmail } from "@/lib/email-templates";
import {
  generateEmailCode,
  issuePendingSignup,
} from "@/lib/email-verification";
import { sendEmail } from "@/lib/mail";
import {
  isValidEmail,
  isValidNickname,
  isValidUsername,
  normalizeNickname,
  normalizeUsername,
} from "@/lib/utils";

export type ActionResult =
  | {
      ok: true;
      resetUrl?: string;
      /** Dev-only: 6-digit password reset code when email is mocked. */
      resetCode?: string;
      emailed?: boolean;
      needsEmailVerification?: boolean;
      email?: string;
      emailVerified?: boolean;
      resent?: boolean;
      retryAfterSec?: number;
      /** Set while signup waits on email verification (no User yet). */
      pendingSignupId?: string;
    }
  | { ok: false; error: string; retryAfterSec?: number };

function safeNextPath(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function signUpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const usernameRaw = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const emailRaw = String(formData.get("email") ?? "").trim();
  const nicknameRaw = String(formData.get("nickname") ?? "");
  const noEmailAck = String(formData.get("noEmailAck") ?? "") === "true";
  const next = safeNextPath(formData.get("next"));
  const username = normalizeUsername(usernameRaw);
  const nickname = normalizeNickname(nicknameRaw);

  if (!isValidUsername(usernameRaw.trim())) {
    return {
      ok: false,
      error: "Username must be 3–30 characters: letters, numbers, underscores.",
    };
  }
  if (nicknameRaw.trim() && !isValidNickname(nickname)) {
    return {
      ok: false,
      error:
        "Nickname can use letters, numbers, and spaces (up to 40 characters).",
    };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== passwordConfirm) {
    return { ok: false, error: "Passwords don’t match." };
  }
  if (emailRaw && !isValidEmail(emailRaw)) {
    return { ok: false, error: "That email doesn’t look valid." };
  }
  if (!emailRaw && !noEmailAck) {
    return {
      ok: false,
      error:
        "Add an email, or confirm you understand the risks of skipping one.",
    };
  }

  if (
    await prisma.user.findFirst({
      where: { username, deletedAt: null },
    })
  ) {
    return { ok: false, error: "That username is already taken." };
  }
  if (await prisma.pendingSignup.findUnique({ where: { username } })) {
    return {
      ok: false,
      error:
        "That username has a signup in progress — check your email for the code.",
    };
  }
  if (emailRaw) {
    const emailLower = emailRaw.toLowerCase();
    if (
      await prisma.user.findFirst({
        where: { email: emailLower, deletedAt: null },
      })
    ) {
      return { ok: false, error: "That email is already in use." };
    }
  }

  const email = emailRaw ? emailRaw.toLowerCase() : null;
  const passwordHash = await hashPassword(password);
  const duration = parseSignInDuration(
    String(formData.get("signInDuration") ?? ""),
  );
  const nicknameValue = nickname.length > 0 ? nickname : null;

  // With email: hold the signup until the code is verified — don't create the User yet.
  if (email) {
    const issued = await issuePendingSignup({
      username,
      passwordHash,
      email,
      nickname: nicknameValue,
      signInDuration: String(duration),
    });
    if (!issued.ok) {
      return { ok: false, error: issued.error };
    }
    return {
      ok: true,
      needsEmailVerification: true,
      email: issued.email,
      emailed: !issued.mocked,
      pendingSignupId: issued.pendingId,
    };
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      email: null,
      nickname: nicknameValue,
    },
  });

  await createSession(user.id, { duration });
  redirect(next ?? "/app");
}

export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  const duration = parseSignInDuration(
    String(formData.get("signInDuration") ?? ""),
  );
  const user = await prisma.user.findUnique({ where: { username } });
  if (
    !user ||
    user.deletedAt ||
    !(await verifyPassword(password, user.passwordHash))
  ) {
    return { ok: false, error: "Incorrect username or password." };
  }
  await createSession(user.id, { duration });
  redirect(next ?? "/app");
}

export async function signOutAction() {
  await destroySession({ removeFromRoster: true });
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) return { ok: false, error: "Enter your username or email." };

  const user = identifier.includes("@")
    ? await prisma.user.findFirst({
        where: { email: identifier.toLowerCase(), deletedAt: null },
      })
    : await prisma.user.findFirst({
        where: {
          username: normalizeUsername(identifier),
          deletedAt: null,
        },
      });

  // Always look successful for unknown users (no account enumeration).
  if (!user) return { ok: true, emailed: true };

  if (!user.email) {
    return {
      ok: false,
      error:
        "No email on this account — add one in settings, or ask a workspace admin for help.",
    };
  }

  const code = generateEmailCode();
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: {
      token: code,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 15),
    },
  });

  const content = passwordResetEmail({ username: user.username, code });
  const sent = await sendEmail({
    to: user.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  if (!sent.ok) {
    return {
      ok: false,
      error:
        sent.error || "Couldn’t send the reset email. Try again in a moment.",
    };
  }

  // In local/dev without RESEND_API_KEY, surface the code so resets still work.
  if (sent.mocked && process.env.NODE_ENV !== "production") {
    return { ok: true, emailed: false, resetCode: code };
  }

  return { ok: true, emailed: true };
}

export async function resetPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const code = String(
    formData.get("code") ?? formData.get("token") ?? "",
  ).trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!identifier) {
    return {
      ok: false,
      error: "Enter the username or email you used to request a reset.",
    };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== passwordConfirm) {
    return { ok: false, error: "Passwords don’t match." };
  }

  const user = identifier.includes("@")
    ? await prisma.user.findFirst({
        where: { email: identifier.toLowerCase(), deletedAt: null },
      })
    : await prisma.user.findFirst({
        where: {
          username: normalizeUsername(identifier),
          deletedAt: null,
        },
      });

  if (!user) {
    return { ok: false, error: "This reset code is invalid or expired." };
  }

  const pending = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
  });

  if (!pending) {
    return { ok: false, error: "This reset code is invalid or expired." };
  }

  if (pending.attempts >= 5) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    return {
      ok: false,
      error: "Too many incorrect attempts. Request a new reset code.",
    };
  }

  const record = pending.token === code ? pending : null;

  if (!record) {
    await prisma.passwordResetToken.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "This reset code is invalid or expired." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);

  await createSession(record.userId, { remember: true });
  redirect("/app");
}
