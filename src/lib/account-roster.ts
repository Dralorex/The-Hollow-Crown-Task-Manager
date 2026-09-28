import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { personLabel } from "@/lib/utils";

export const ACCOUNT_ROSTER_COOKIE = "rowgon_accounts";
const LEGACY_ACCOUNT_ROSTER_COOKIE = "tidework_accounts";

export type RosterAccount = {
  userId: string;
  username: string;
  label: string;
  token: string;
  expiresAt: string;
};

function encodeRoster(accounts: RosterAccount[]) {
  return Buffer.from(JSON.stringify(accounts), "utf8").toString("base64url");
}

function decodeRoster(raw: string | undefined): RosterAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as RosterAccount[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a) =>
        a &&
        typeof a.userId === "string" &&
        typeof a.token === "string" &&
        typeof a.username === "string" &&
        typeof a.label === "string" &&
        typeof a.expiresAt === "string",
    );
  } catch {
    return [];
  }
}

async function writeRoster(accounts: RosterAccount[]) {
  const cookieStore = await cookies();
  const maxExpires = accounts.reduce((latest, a) => {
    const t = new Date(a.expiresAt).getTime();
    return t > latest ? t : latest;
  }, Date.now() + 1000 * 60 * 60 * 24);

  cookieStore.set(ACCOUNT_ROSTER_COOKIE, encodeRoster(accounts), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(maxExpires),
  });
  cookieStore.delete(LEGACY_ACCOUNT_ROSTER_COOKIE);
}

export async function getAccountRoster(): Promise<RosterAccount[]> {
  const cookieStore = await cookies();
  const accounts = decodeRoster(
    cookieStore.get(ACCOUNT_ROSTER_COOKIE)?.value ??
      cookieStore.get(LEGACY_ACCOUNT_ROSTER_COOKIE)?.value,
  );
  const now = Date.now();
  const valid: RosterAccount[] = [];

  for (const account of accounts) {
    if (new Date(account.expiresAt).getTime() <= now) continue;
    const session = await prisma.session.findUnique({
      where: { token: account.token },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || session.user.deletedAt) {
      continue;
    }
    valid.push({
      userId: session.user.id,
      username: session.user.username,
      label: personLabel(session.user),
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
    });
  }

  if (valid.length !== accounts.length) {
    await writeRoster(valid);
  }
  return valid;
}

/** Public roster entries for UI (no session tokens). */
export async function getAccountRosterPublic(activeUserId?: string | null) {
  const accounts = await getAccountRoster();
  return accounts.map((a) => ({
    userId: a.userId,
    username: a.username,
    label: a.label,
    active: a.userId === activeUserId,
  }));
}

export async function upsertRosterAccount(opts: {
  userId: string;
  username: string;
  label: string;
  token: string;
  expiresAt: Date;
}) {
  const accounts = await getAccountRoster();
  const next = accounts.filter((a) => a.userId !== opts.userId);
  next.unshift({
    userId: opts.userId,
    username: opts.username,
    label: opts.label,
    token: opts.token,
    expiresAt: opts.expiresAt.toISOString(),
  });
  await writeRoster(next);
}

export async function removeRosterAccount(userId: string) {
  const accounts = await getAccountRoster();
  await writeRoster(accounts.filter((a) => a.userId !== userId));
}

export async function findRosterAccount(userId: string) {
  const accounts = await getAccountRoster();
  return accounts.find((a) => a.userId === userId) ?? null;
}
