/**
 * Seed ~50 fake users with a realistic workspace layout:
 * multiple folders, task backlog, HQ + smaller group chats,
 * a few friendships/birthdays, sessions, digests off.
 *
 * Usage: npm run load-test:seed
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
  LOAD_PASSWORD,
  LOAD_WORKSPACE_NAME,
  type LoadCredentials,
  assignPersona,
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
    Math.min(
      200,
      Number(process.env.LOAD_TEST_USERS || DEFAULT_USER_COUNT) ||
        DEFAULT_USER_COUNT,
    ),
  );
  console.log(`Seeding ${count} load users on ${dbHost(getDatabaseUrl())}`);
  console.log("Digests off; personas assigned for realistic pacing.");

  const passwordHash = await bcrypt.hash(LOAD_PASSWORD, 12);
  const users: LoadCredentials["users"] = [];

  for (let i = 1; i <= count; i++) {
    const username = loadUsername(i);
    const persona = assignPersona(i, count);
    const birthday =
      persona === "social"
        ? new Date(Date.UTC(2000, (i % 12), (i % 28) + 1, 12))
        : null;

    const user = await prisma.user.upsert({
      where: { username },
      update: {
        passwordHash,
        weeklyDigestEnabled: false,
        deletedAt: null,
        deletedUsername: null,
        birthday,
        shareBirthdayFriends: persona === "social",
        shareBirthdayWorkspaces: persona === "social",
      },
      create: {
        username,
        passwordHash,
        nickname: `Load ${i}`,
        weeklyDigestEnabled: false,
        birthday,
        shareBirthdayFriends: persona === "social",
        shareBirthdayWorkspaces: persona === "social",
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } });
    const token = nanoid(48);
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    users.push({
      index: i,
      id: user.id,
      username,
      sessionToken: token,
      persona,
      chatGroupId: "", // filled after chats exist
    });
    if (i % 10 === 0 || i === count) console.log(`  users ${i}/${count}`);
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

  // Admin persona must be ADMIN+ so load-test r2_cycle (canManagePeople) succeeds.
  // Owner (index 1) already has OWNER; other admin personas get ADMIN.
  for (const u of users.slice(1)) {
    const role = u.persona === "admin" ? "ADMIN" : "MEMBER";
    await prisma.membership.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: u.id },
      },
      update: { role },
      create: { workspaceId: workspace.id, userId: u.id, role },
    });
  }

  const folderNames = ["Load Bench", "Design", "Engineering", "Ops"];
  const folderIds: string[] = [];
  for (const name of folderNames) {
    let folder = await prisma.folder.findFirst({
      where: { workspaceId: workspace.id, name },
    });
    if (!folder) {
      folder = await prisma.folder.create({
        data: { workspaceId: workspace.id, name },
      });
    }
    folderIds.push(folder.id);
  }

  // Healthy backlog: enough OPEN tasks that 15 workers don't instantly empty it
  const openCount = await prisma.task.count({
    where: { workspaceId: workspace.id, status: "OPEN" },
  });
  const wantOpen = Math.max(80, count * 2);
  for (let t = openCount; t < wantOpen; t++) {
    const folderId = folderIds[t % folderIds.length]!;
    await prisma.task.create({
      data: {
        workspaceId: workspace.id,
        folderId,
        name: `Backlog item ${t + 1}`,
        description: "Synthetic backlog for realistic claim/complete flow.",
        priority: t % 5 === 0 ? "HIGH" : t % 3 === 0 ? "LOW" : "MEDIUM",
        createdById: owner.id,
        status: "OPEN",
      },
    });
  }

  // HQ chat — everyone (for presence / occasional company-wide)
  let hq = await prisma.chatGroup.findFirst({
    where: {
      workspaceId: workspace.id,
      name: LOAD_CHAT_NAME,
      isDirect: false,
    },
  });
  if (!hq) {
    hq = await prisma.chatGroup.create({
      data: {
        workspaceId: workspace.id,
        name: LOAD_CHAT_NAME,
        isDirect: false,
        createdById: owner.id,
        members: { create: users.map((u) => ({ userId: u.id })) },
      },
    });
  } else {
    for (const u of users) {
      await prisma.chatMember.upsert({
        where: { groupId_userId: { groupId: hq.id, userId: u.id } },
        update: {},
        create: { groupId: hq.id, userId: u.id },
      });
    }
  }

  // Smaller side chats (more realistic than 50 people always in one room)
  const chattyIds = users.filter((u) => u.persona === "chatty").map((u) => u.id);
  const workerIds = users.filter((u) => u.persona === "worker").map((u) => u.id);
  const adminIds = users.filter((u) => u.persona === "admin").map((u) => u.id);

  async function ensureSideChat(name: string, memberIds: string[]) {
    const unique = [...new Set([owner.id, ...memberIds])];
    let g = await prisma.chatGroup.findFirst({
      where: { workspaceId: workspace!.id, name, isDirect: false },
    });
    if (!g) {
      g = await prisma.chatGroup.create({
        data: {
          workspaceId: workspace!.id,
          name,
          isDirect: false,
          createdById: owner.id,
          members: { create: unique.map((userId) => ({ userId })) },
        },
      });
    } else {
      for (const userId of unique) {
        await prisma.chatMember.upsert({
          where: { groupId_userId: { groupId: g.id, userId } },
          update: {},
          create: { groupId: g.id, userId },
        });
      }
    }
    return g.id;
  }

  const watercoolerId = await ensureSideChat(
    "Watercooler",
    chattyIds.slice(0, Math.max(4, Math.min(12, chattyIds.length))),
  );
  const projectChatId = await ensureSideChat("Project Alpha", [
    ...adminIds,
    ...workerIds.slice(0, 12),
  ]);
  const sideGroupIds = [watercoolerId, projectChatId];

  // Friendships among social users (+ a couple workers) for birthday sharing
  const socialUsers = users.filter((u) => u.persona === "social");
  for (let i = 0; i < socialUsers.length; i++) {
    for (let j = i + 1; j < socialUsers.length; j++) {
      const a = socialUsers[i]!;
      const b = socialUsers[j]!;
      const existing = await prisma.friendship.findFirst({
        where: {
          OR: [
            { requesterId: a.id, addresseeId: b.id },
            { requesterId: b.id, addresseeId: a.id },
          ],
        },
      });
      if (!existing) {
        await prisma.friendship.create({
          data: {
            requesterId: a.id,
            addresseeId: b.id,
            status: "ACCEPTED",
          },
        });
      } else if (existing.status !== "ACCEPTED") {
        await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: "ACCEPTED" },
        });
      }
    }
  }

  for (const u of users) {
    if (u.persona === "chatty") u.chatGroupId = watercoolerId;
    else if (u.persona === "worker") u.chatGroupId = projectChatId;
    else if (u.persona === "admin") u.chatGroupId = projectChatId;
    else u.chatGroupId = hq.id;
  }

  const payload: LoadCredentials = {
    createdAt: new Date().toISOString(),
    password: LOAD_PASSWORD,
    workspaceId: workspace.id,
    folderIds,
    hqGroupId: hq.id,
    sideGroupIds,
    users,
  };

  const outPath = path.resolve(process.cwd(), CREDENTIALS_PATH);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");

  const counts = users.reduce(
    (acc, u) => {
      acc[u.persona] = (acc[u.persona] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log("\nPersona mix:", counts);
  console.log(`Folders: ${folderIds.length}, open tasks target: ${wantOpen}`);
  console.log(`Chats: HQ + Watercooler + Project Alpha`);
  console.log(`Credentials: ${outPath}`);
  console.log("\nNext: start app, then npm run load-test:run");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
