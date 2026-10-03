#!/usr/bin/env npx tsx
/**
 * Cron-friendly weekly digest sender.
 * Example: npx tsx scripts/send-weekly-digests.ts
 */
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/lib/db-url";
import { sendEmail } from "../src/lib/mail";
import {
  buildWeeklyDigest,
  digestIsEmpty,
  weeklyDigestEmail,
} from "../src/lib/weekly-digest";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: getDatabaseUrl() }),
  });

  const users = await prisma.user.findMany({
    where: {
      weeklyDigestEnabled: true,
      email: { not: null },
    },
  });

  let sent = 0;
  let skippedEmpty = 0;
  for (const user of users) {
    if (!user.email) continue;
    const payload = await buildWeeklyDigest(user.id);
    if (!payload) continue;
    if (digestIsEmpty(payload)) {
      skippedEmpty += 1;
      console.log("skip-empty", user.username);
      continue;
    }
    const mail = weeklyDigestEmail(payload);
    const result = await sendEmail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!result.ok) {
      console.error("fail", user.username, result.error);
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { weeklyDigestLastSentAt: new Date() },
    });
    sent += 1;
    console.log(result.mocked ? "mocked" : "sent", user.username);
  }

  console.log(`done: ${sent}/${users.length} (skipped empty: ${skippedEmpty})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
