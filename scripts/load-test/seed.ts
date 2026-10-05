/**
 * Seed 50 fake load-test users (+ shared workspace, folder, tasks, group chat, sessions).
 *
 * Usage:
 *   npx tsx scripts/load-test/seed.ts
 *   LOAD_TEST_USERS=50 npx tsx scripts/load-test/seed.ts
 *
 * Writes scripts/load-test/.credentials.json (gitignored).
 * Sets weeklyDigestEnabled=false so Resend is not blasted.
 *
 * Prefer a staging/local DB — confirm DATABASE URL before running.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "../../src/lib/db";
import { getDatabaseUrl } from "../../src/lib/db-url";
import {
  CREDENTIALS_PATH,
  DEFAULT_USER_COUNT,
  LOAD_CHAT_NAME,
  LOAD_FOLDER_NAME,
  LOAD_PASSWORD,
  LOAD_WORKSPACE_NAME,
  type LoadCredentials,
  loadUsername,
} from "./config";

function dbHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const count = Math.max(
    1,
    Math.min(200, Number(process.env.LOAD_TEST_USERS || DEFAULT_USER_COUNT) || DEFAULT_USER_COUNT),
  );
  const dbUrl = getDatabaseUrl();
  console.log(`Seeding ${count} load users against DB host: ${dbHost(dbUrl)}`);
  console.log("Digests disabled for these users (no Resend spam).");

  const passwordHash = await bcrypt.hash(LOAD_PASSWORD, 12);
  const users: LoadCredentials["users"] = [];

  for (let i = 1; i <= count; i++) {
    const username = loadUsername(i);
    const user = await prisma.user.upsert({
      where: { username },
      update: {
        passwordHash,
        weeklyDigestEnabled: false,
        deletedAt: null,
        deletedUsername: null,
      },
      create: {
        username,
        passwordHash,
        nickname: `Load ${i}`,
        weeklyDigestEnabled: false,
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    const token = nanoid(48);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt },
    });

    users.push({
      index: i,
      id: user.id,
      username,
      sessionToken: token,
    });
    if (i % 10 === 0 || i === count) {
      console.log(`  users ${i}/${count}`);
    }
  }

  const owner = users[0]!;
  let workspace = await prisma.workspace.findFirst({
    where: { name: LOAD_WORKSPACE_NAME, ownerId: owner.id },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: LOAD_WORKSPACE_NAME,
        ownerId: owner.id,
        memberships: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
  }

  for (const u of users.slice(1)) {
    // loaduser_002 = ADMIN so R2 cycles can run on 2 workers (Admin+ required)
    const role = u.index === 2 ? "ADMIN" : "MEMBER";
    await prisma.membership.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: u.id },
      },
      update: { role },
      create: {
        workspaceId: workspace.id,
        userId: u.id,
        role,
      },
    });
  }

  let folder = await prisma.folder.findFirst({
    where: { workspaceId: workspace.id, name: LOAD_FOLDER_NAME },
  });
  if (!folder) {
    folder = await prisma.folder.create({
      data: { workspaceId: workspace.id, name: LOAD_FOLDER_NAME },
    });
  }

  const taskCount = await prisma.task.count({
    where: { workspaceId: workspace.id, folderId: folder.id },
  });
  if (taskCount < 20) {
    const toCreate = 20 - taskCount;
    for (let t = 0; t < toCreate; t++) {
      await prisma.task.create({
        data: {
          workspaceId: workspace.id,
          folderId: folder.id,
          name: `Load task ${taskCount + t + 1}`,
          description: "Synthetic task for load harness.",
          priority: t % 3 === 0 ? "HIGH" : "MEDIUM",
          createdById: owner.id,
        },
      });
    }
  }

  let group = await prisma.chatGroup.findFirst({
    where: {
      workspaceId: workspace.id,
      name: LOAD_CHAT_NAME,
      isDirect: false,
    },
  });
  if (!group) {
    group = await prisma.chatGroup.create({
      data: {
        workspaceId: workspace.id,
        name: LOAD_CHAT_NAME,
        isDirect: false,
        createdById: owner.id,
        members: {
          create: users.map((u) => ({ userId: u.id })),
        },
      },
    });
  } else {
    for (const u of users) {
      await prisma.chatMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId: u.id } },
        update: {},
        create: { groupId: group.id, userId: u.id },
      });
    }
  }

  const payload: LoadCredentials = {
    createdAt: new Date().toISOString(),
    password: LOAD_PASSWORD,
    workspaceId: workspace.id,
    folderId: folder.id,
    groupId: group.id,
    users,
  };

  const outPath = path.resolve(process.cwd(), CREDENTIALS_PATH);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`\nSeeded ${users.length} users.`);
  console.log(`Workspace: ${workspace.id}`);
  console.log(`Group chat: ${group.id}`);
  console.log(`Credentials: ${outPath}`);
  console.log(`Password: ${LOAD_PASSWORD}`);
  console.log("\nNext:");
  console.log("  1) Set LOAD_TEST_SECRET in .env (and Vercel if hitting preview)");
  console.log("  2) Start the app (local or use Preview URL)");
  console.log("  3) LOAD_TEST_BASE_URL=http://localhost:3000 npm run load-test:run");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
