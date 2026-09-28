/**
 * Seeds a personal calendar event for Playwright and prints JSON to stdout.
 * Requires a Postgres DATABASE_URL (Neon).
 * Usage: npx tsx e2e/fixtures/seed-calendar.ts
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { addDays, format, startOfMonth } from "date-fns";
import { nanoid } from "nanoid";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getDatabaseUrl } from "../../src/lib/db-url";

const SESSION_COOKIE = "rowgon_session";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: getDatabaseUrl() }),
  });

  const passwordHash = await bcrypt.hash("password123", 10);
  const username = `e2e_${nanoid(6)}`;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      email: `${username}@rowgon.test`,
    },
  });

  const monthStart = startOfMonth(new Date());
  const fromDay = format(addDays(monthStart, 3), "yyyy-MM-dd");
  const toDay = format(addDays(monthStart, 8), "yyyy-MM-dd");
  const fromDate = new Date(`${fromDay}T12:00:00`);

  const event = await prisma.personalCalendarEvent.create({
    data: {
      userId: user.id,
      title: "E2E drag me",
      description: "playwright",
      date: fromDate,
    },
  });

  const token = nanoid(48);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt },
  });

  await prisma.$disconnect();

  process.stdout.write(
    JSON.stringify({
      username,
      cookieName: SESSION_COOKIE,
      cookieValue: token,
      eventId: `personal:${event.id}`,
      recordId: event.id,
      fromDay,
      toDay,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
