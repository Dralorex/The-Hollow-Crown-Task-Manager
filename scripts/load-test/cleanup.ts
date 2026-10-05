/**
 * Remove load-test users (loaduser_*) and their Load Test HQ workspace data.
 *
 * Usage:
 *   npx tsx scripts/load-test/cleanup.ts
 */
import "dotenv/config";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../src/lib/db";
import { getDatabaseUrl } from "../../src/lib/db-url";
import {
  CREDENTIALS_PATH,
  LOAD_USER_PREFIX,
  LOAD_WORKSPACE_NAME,
} from "./config";

function dbHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  console.log(`Cleanup load users on DB host: ${dbHost(getDatabaseUrl())}`);

  const users = await prisma.user.findMany({
    where: { username: { startsWith: LOAD_USER_PREFIX } },
    select: { id: true, username: true },
  });
  console.log(`Found ${users.length} load users.`);

  const workspaces = await prisma.workspace.findMany({
    where: {
      name: LOAD_WORKSPACE_NAME,
      owner: { username: { startsWith: LOAD_USER_PREFIX } },
    },
    select: { id: true },
  });

  for (const ws of workspaces) {
    await prisma.workspace.delete({ where: { id: ws.id } });
    console.log(`Deleted workspace ${ws.id}`);
  }

  for (const user of users) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.membership.deleteMany({ where: { userId: user.id } });
    await prisma.chatMember.deleteMany({ where: { userId: user.id } });
    await prisma.message.deleteMany({ where: { senderId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  console.log(`Deleted ${users.length} users.`);

  try {
    await unlink(path.resolve(process.cwd(), CREDENTIALS_PATH));
    console.log(`Removed ${CREDENTIALS_PATH}`);
  } catch {
    // ok if missing
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
