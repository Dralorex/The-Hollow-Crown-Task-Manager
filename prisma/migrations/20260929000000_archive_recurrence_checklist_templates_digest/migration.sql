-- CreateEnum
CREATE TYPE "ChatNotifyMode" AS ENUM ('ALL', 'MENTIONS', 'MUTE');

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "weeklyDigestLastSentAt" TIMESTAMP(3);

-- AlterTable Workspace
ALTER TABLE "Workspace" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Workspace" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "archiveVisibility" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "archiveVisibilityRoles" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "archiveVisibilityUserIds" TEXT;
CREATE INDEX "Workspace_archivedAt_idx" ON "Workspace"("archivedAt");

-- AlterTable Folder
ALTER TABLE "Folder" ADD COLUMN "alwaysAccessible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Folder" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Folder" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "Folder" ADD COLUMN "archiveVisibility" TEXT;
ALTER TABLE "Folder" ADD COLUMN "archiveVisibilityRoles" TEXT;
ALTER TABLE "Folder" ADD COLUMN "archiveVisibilityUserIds" TEXT;
CREATE INDEX "Folder_archivedAt_idx" ON "Folder"("archivedAt");

-- CreateTable FolderTemplate
CREATE TABLE "FolderTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "treeJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FolderTemplate_workspaceId_idx" ON "FolderTemplate"("workspaceId");

ALTER TABLE "FolderTemplate" ADD CONSTRAINT "FolderTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Task
ALTER TABLE "Task" ADD COLUMN "recurrenceCadence" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurrenceWeekDays" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurrenceMonthDays" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurrenceSpawnMode" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurrenceNextAssignee" TEXT;
ALTER TABLE "Task" ADD COLUMN "recurrenceSeriesId" TEXT;
CREATE INDEX "Task_recurrenceSeriesId_idx" ON "Task"("recurrenceSeriesId");

-- CreateTable TaskActivity
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable TaskChecklistItem
CREATE TABLE "TaskChecklistItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskChecklistItem_taskId_idx" ON "TaskChecklistItem"("taskId");

ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable ChatMember
ALTER TABLE "ChatMember" ADD COLUMN "notifyMode" "ChatNotifyMode" NOT NULL DEFAULT 'ALL';
ALTER TABLE "ChatMember" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "ChatMember" ADD COLUMN "typingAt" TIMESTAMP(3);

-- CreateTable MessageMention
CREATE TABLE "MessageMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "roleName" TEXT,

    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageMention_messageId_idx" ON "MessageMention"("messageId");
CREATE INDEX "MessageMention_userId_idx" ON "MessageMention"("userId");

ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageMention" ADD CONSTRAINT "MessageMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
