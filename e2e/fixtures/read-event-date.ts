/**
 * Reads a personal event date for Playwright assertions.
 * Usage: npx tsx e2e/fixtures/read-event-date.ts <recordId>
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { format } from "date-fns";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getDatabaseUrl } from "../../src/lib/db-url";

async function main() {
  const recordId = process.argv[2];
  if (!recordId) throw new Error("recordId required");

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: getDatabaseUrl() }),
  });

  const row = await prisma.personalCalendarEvent.findUnique({
    where: { id: recordId },
  });
  await prisma.$disconnect();

  process.stdout.write(
    JSON.stringify({
      day: row ? format(row.date, "yyyy-MM-dd") : null,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
