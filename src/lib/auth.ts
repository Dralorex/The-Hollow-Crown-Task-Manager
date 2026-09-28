import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { upsertRosterAccount, removeRosterAccount } from "@/lib/account-roster";
import { prisma } from "@/lib/db";
import { personLabel } from "@/lib/utils";

const SESSION_COOKIE = "rowgon_session";
export const SESSION_COOKIE_NAME = SESSION_COOKIE;
const LEGACY_SESSION_COOKIE = "tidework_session";
/**
 * Server-side ceiling for browser-session logins (cookie itself is cleared
 * when the browser closes). Keeps abandoned DB rows from lasting forever.
 */
const QUICK_SESSION_DAYS = 1;
/** Practical stand-in for “forever” (browsers may still cap cookie lifetime). */
const FOREVER_DAYS = 365 * 100;

export type SessionDuration = "session" | 7 | 30 | 180 | 365 | "forever";

export function parseSignInDuration(raw: string): SessionDuration {
  const value = raw.trim().toLowerCase();
  if (value === "7") return 7;
  if (value === "30") return 30;
  if (value === "180") return 180;
  if (value === "365") return 365;
  if (value === "forever") return "forever";
  return "session";
}

function durationToDays(duration: SessionDuration): number {
  if (duration === "session") return QUICK_SESSION_DAYS;
  if (duration === "forever") return FOREVER_DAYS;
  return duration;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(
  userId: string,
  opts: { duration?: SessionDuration; remember?: boolean } = {},
) {
  // Prefer explicit duration. Legacy `remember` maps to 30 days / session.
  const duration: SessionDuration =
    opts.duration ??
    (opts.remember === false ? "session" : opts.remember === true ? 30 : 30);
  const persistent = duration !== "session";
  const token = nanoid(48);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + durationToDays(duration));

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  await prisma.session.create({
    data: { token, userId, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Persistent durations set an expiry. Session-only omits it so the cookie
    // disappears when the browser closes.
    ...(persistent ? { expires: expiresAt } : {}),
  });

  await upsertRosterAccount({
    userId: user.id,
    username: user.username,
    label: personLabel(user),
    token,
    expiresAt,
  });

  return token;
}

export async function setSessionCookieFromToken(
  token: string,
  expiresAt: Date,
) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(opts: { removeFromRoster?: boolean } = {}) {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(SESSION_COOKIE)?.value ??
    cookieStore.get(LEGACY_SESSION_COOKIE)?.value;
  if (token) {
    const session = await prisma.session.findUnique({ where: { token } });
    await prisma.session.deleteMany({ where: { token } });
    cookieStore.delete(SESSION_COOKIE);
    cookieStore.delete(LEGACY_SESSION_COOKIE);
    if (opts.removeFromRoster !== false && session) {
      await removeRosterAccount(session.userId);
    }
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(SESSION_COOKIE)?.value ??
    cookieStore.get(LEGACY_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  if (session.user.deletedAt) {
    await prisma.session.deleteMany({ where: { userId: session.user.id } });
    cookieStore.delete(SESSION_COOKIE);
    cookieStore.delete(LEGACY_SESSION_COOKIE);
    await removeRosterAccount(session.user.id);
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
