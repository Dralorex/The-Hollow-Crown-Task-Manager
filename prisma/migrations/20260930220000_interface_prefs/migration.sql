-- AlterTable User
ALTER TABLE "User" ADD COLUMN "interfacePrefsJson" TEXT;
ALTER TABLE "User" ADD COLUMN "showInterfaceTogglesInWorkspace" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Workspace
ALTER TABLE "Workspace" ADD COLUMN "interfaceApplyToMembers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN "interfaceDefaultsJson" TEXT;
