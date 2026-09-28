"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { markRoleActivitySeen } from "@/lib/folder-access";
import { prisma } from "@/lib/db";
import { canManagePeople, requireMembership } from "@/lib/permissions";

export async function createWorkspaceRoleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only admins can create roles." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Role needs a name." };
  if (name.toLowerCase() === "all") {
    return {
      ok: false,
      error: "“All” is reserved — leave a folder with no roles for everyone.",
    };
  }

  const existing = await prisma.workspaceRole.findMany({
    where: { workspaceId },
    select: { name: true },
  });
  if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "That role already exists." };
  }

  await prisma.workspaceRole.create({
    data: { workspaceId, name },
  });

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function deleteWorkspaceRoleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only admins can delete roles." };
  }

  const role = await prisma.workspaceRole.findFirst({
    where: { id: roleId, workspaceId },
  });
  if (!role) return { ok: false, error: "Role not found." };

  await prisma.workspaceRole.delete({ where: { id: roleId } });
  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function setMemberCustomRolesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const memberUserId = String(formData.get("memberUserId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only admins can assign roles." };
  }

  const target = await prisma.membership.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: memberUserId },
    },
  });
  if (!target) return { ok: false, error: "Member not found." };

  const roleIds = formData
    .getAll("roleId")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const validRoles = await prisma.workspaceRole.findMany({
    where: { workspaceId, id: { in: roleIds } },
    select: { id: true },
  });
  const validIds = new Set(validRoles.map((r) => r.id));

  await prisma.$transaction([
    prisma.membershipRole.deleteMany({ where: { membershipId: target.id } }),
    ...(validIds.size > 0
      ? [
          prisma.membershipRole.createMany({
            data: [...validIds].map((roleId) => ({
              membershipId: target.id,
              roleId,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function setFolderRolesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only admins can set folder roles." };
  }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, workspaceId },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  const access = String(formData.get("access") ?? "all").trim().toLowerCase();
  const roleIds =
    access === "all"
      ? []
      : formData
          .getAll("roleId")
          .map((v) => String(v).trim())
          .filter(Boolean);

  const validRoles =
    roleIds.length > 0
      ? await prisma.workspaceRole.findMany({
          where: { workspaceId, id: { in: roleIds } },
          select: { id: true },
        })
      : [];
  const validIds = validRoles.map((r) => r.id);

  await prisma.$transaction([
    prisma.folderRole.deleteMany({ where: { folderId } }),
    ...(validIds.length > 0
      ? [
          prisma.folderRole.createMany({
            data: validIds.map((roleId) => ({ folderId, roleId })),
          }),
        ]
      : []),
    prisma.folder.update({
      where: { id: folderId },
      data: {
        hideFromUnauthorized:
          String(formData.get("hideFromUnauthorized") ?? "0") === "1",
        alwaysVisible: String(formData.get("alwaysVisible") ?? "0") === "1",
        alwaysAccessible:
          String(formData.get("alwaysAccessible") ?? "0") === "1",
      },
    }),
  ]);

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function setWorkspaceRoleHideFoldersAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only admins can update roles." };
  }

  const role = await prisma.workspaceRole.findFirst({
    where: { id: roleId, workspaceId },
  });
  if (!role) return { ok: false, error: "Role not found." };

  await prisma.workspaceRole.update({
    where: { id: roleId },
    data: {
      hideFolders: String(formData.get("hideFolders") ?? "0") === "1",
    },
  });

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function markRoleActivitySeenAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await requireMembership(workspaceId, user.id);

  const roleIds = formData
    .getAll("roleId")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (roleIds.length === 0) return { ok: true };

  const owned = await prisma.workspaceRole.findMany({
    where: { workspaceId, id: { in: roleIds } },
    select: { id: true },
  });

  await markRoleActivitySeen({
    userId: user.id,
    roleIds: owned.map((r) => r.id),
  });

  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app/notifications");
  revalidatePath("/app");
  return { ok: true };
}
