import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const demo = await prisma.user.upsert({
    where: { username: "demo" },
    create: { username: "demo", passwordHash, email: "demo@rowgon.test" },
    update: { passwordHash },
  });
  const friend = await prisma.user.upsert({
    where: { username: "friend" },
    create: { username: "friend", passwordHash, email: "friend@rowgon.test" },
    update: { passwordHash },
  });

  await prisma.friendship.upsert({
    where: {
      requesterId_addresseeId: {
        requesterId: demo.id,
        addresseeId: friend.id,
      },
    },
    create: {
      requesterId: demo.id,
      addresseeId: friend.id,
      status: "ACCEPTED",
    },
    update: { status: "ACCEPTED" },
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: "seed-ws-demo" },
    create: {
      id: "seed-ws-demo",
      name: "Demo Space",
      ownerId: demo.id,
    },
    update: { name: "Demo Space" },
  });

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: demo.id },
    },
    create: {
      workspaceId: workspace.id,
      userId: demo.id,
      role: "OWNER",
    },
    update: { role: "OWNER" },
  });
  await prisma.membership.upsert({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: friend.id },
    },
    create: {
      workspaceId: workspace.id,
      userId: friend.id,
      role: "MEMBER",
    },
    update: { role: "MEMBER" },
  });

  const friendGroup = await prisma.chatGroup.upsert({
    where: { id: "seed-friend-group" },
    create: {
      id: "seed-friend-group",
      name: "Weekend plans",
      isDirect: false,
      createdById: demo.id,
    },
    update: { name: "Weekend plans" },
  });
  const wsGroup = await prisma.chatGroup.upsert({
    where: { id: "seed-ws-group" },
    create: {
      id: "seed-ws-group",
      name: "Demo standup",
      isDirect: false,
      workspaceId: workspace.id,
      createdById: demo.id,
    },
    update: { name: "Demo standup", workspaceId: workspace.id },
  });
  const dm = await prisma.chatGroup.upsert({
    where: { id: "seed-dm" },
    create: {
      id: "seed-dm",
      name: "dm",
      isDirect: true,
      createdById: demo.id,
    },
    update: {},
  });

  for (const groupId of [friendGroup.id, wsGroup.id, dm.id]) {
    for (const userId of [demo.id, friend.id]) {
      await prisma.chatMember.upsert({
        where: { groupId_userId: { groupId, userId } },
        create: { groupId, userId },
        update: {},
      });
    }
  }

  const existingMsg = await prisma.message.findFirst({
    where: { groupId: friendGroup.id },
  });
  if (!existingMsg) {
    await prisma.message.create({
      data: {
        groupId: friendGroup.id,
        senderId: friend.id,
        body: "Hey — free Saturday?",
      },
    });
    await prisma.message.create({
      data: {
        groupId: wsGroup.id,
        senderId: demo.id,
        body: "Standup notes in the doc.",
      },
    });
    await prisma.message.create({
      data: {
        groupId: dm.id,
        senderId: friend.id,
        body: "Ping from friend",
      },
    });
  }

  console.log("seeded", demo.username, friend.username);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
