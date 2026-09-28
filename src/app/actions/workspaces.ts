"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import {
  archiveUpdateData,
  parseArchiveForm,
  unarchiveUpdateData,
} from "@/lib/archive";
import { requireUser } from "@/lib/auth";
import { handleBirthdayOnWorkspaceJoin } from "@/lib/birthday";
import { prisma } from "@/lib/db";
import {
  canManagePeople,
  isOwnerOnlyAction,
  requireMembership,
} from "@/lib/permissions";
import { isValidEmail, normalizeUsername, personLabel } from "@/lib/utils";
import type { Role } from "@/generated/prisma/client";
import type { ActionResult } from "@/app/actions/auth";

export async function createWorkspaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give your workspace a name." };

  const existingCount = await prisma.membership.count({
    where: { userId: user.id },
  });
  const isFirstWorkspace = existingCount === 0;

  const workspace = await prisma.workspace.create({
    data: {
      name,
      ownerId: user.id,
      memberships: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  redirect(
    isFirstWorkspace
      ? `/app/w/${workspace.id}?setup=1`
      : `/app/w/${workspace.id}`,
  );
}

export async function inviteMemberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only owners and admins can invite people." };
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  if (workspace.archivedAt) {
    return {
      ok: false,
      error: "This workspace is archived. Restore it to invite people.",
    };
  }

  const target = String(formData.get("target") ?? "").trim();
  const role = String(formData.get("role") ?? "MEMBER") as Role;
  if (!["ADMIN", "EDITOR", "MEMBER"].includes(role)) {
    return { ok: false, error: "Pick a valid role." };
  }
  if (!target) return { ok: false, error: "Enter a username or email." };

  const isEmail = target.includes("@");
  if (isEmail && !isValidEmail(target)) {
    return { ok: false, error: "That email doesn’t look valid." };
  }

  const targetUsername = isEmail ? null : normalizeUsername(target);
  const targetEmail = isEmail ? target.toLowerCase() : null;

  const invitee = await prisma.user.findFirst({
    where: targetUsername
      ? { username: targetUsername, deletedAt: null }
      : { email: targetEmail ?? undefined, deletedAt: null },
  });

  if (invitee) {
    const alreadyMember = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: invitee.id },
      },
    });
    if (alreadyMember) {
      return {
        ok: false,
        error: `${personLabel(invitee)} is already in this workspace.`,
      };
    }
  }

  const pendingExists = await prisma.invite.findFirst({
    where: {
      workspaceId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
      OR: [
        ...(targetUsername ? [{ targetUsername }] : []),
        ...(targetEmail ? [{ targetEmail }] : []),
      ],
    },
  });
  if (pendingExists) {
    return { ok: false, error: "An invite is already pending for that person." };
  }

  const invite = await prisma.invite.create({
    data: {
      workspaceId,
      invitedById: user.id,
      targetUsername,
      targetEmail,
      role,
      token: nanoid(32),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    },
  });

  if (invitee) {
    await prisma.notification.create({
      data: {
        userId: invitee.id,
        type: "WORKSPACE_INVITE",
        title: "Workspace invite",
        body: `${personLabel(user)} invited you to “${workspace.name}” as ${role.toLowerCase()}.`,
        meta: JSON.stringify({
          inviteId: invite.id,
          token: invite.token,
          workspaceId,
        }),
      },
    });
  }

  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function acceptInviteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return { ok: false, error: "Invite is invalid or expired." };
  }

  const matchesUsername =
    invite.targetUsername && invite.targetUsername === user.username;
  const matchesEmail =
    invite.targetEmail && user.email && invite.targetEmail === user.email;
  if (!matchesUsername && !matchesEmail) {
    return { ok: false, error: "This invite isn’t for your account." };
  }

  await prisma.$transaction([
    prisma.membership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: user.id,
        },
      },
      create: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: invite.role,
      },
      update: { role: invite.role },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED" },
    }),
    prisma.notification.updateMany({
      where: {
        userId: user.id,
        type: "WORKSPACE_INVITE",
        read: false,
        meta: { contains: invite.token },
      },
      data: { read: true },
    }),
  ]);

  await handleBirthdayOnWorkspaceJoin(user.id, invite.workspaceId);

  revalidatePath("/app", "layout");
  revalidatePath("/app/notifications");
  redirect(`/app/w/${invite.workspaceId}`);
}

export async function declineInviteAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return { ok: false, error: "Invite is invalid or expired." };
  }

  const matchesUsername =
    invite.targetUsername && invite.targetUsername === user.username;
  const matchesEmail =
    invite.targetEmail && user.email && invite.targetEmail === user.email;
  if (!matchesUsername && !matchesEmail) {
    return { ok: false, error: "This invite isn’t for your account." };
  }

  await prisma.$transaction([
    prisma.invite.update({
      where: { id: invite.id },
      data: { status: "DECLINED" },
    }),
    prisma.notification.updateMany({
      where: {
        userId: user.id,
        type: "WORKSPACE_INVITE",
        meta: { contains: invite.token },
      },
      data: { read: true },
    }),
  ]);

  revalidatePath("/app", "layout");
  revalidatePath("/app/notifications");
  return { ok: true };
}

export async function renameWorkspaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Workspace needs a name." };

  const membership = await requireMembership(workspaceId, user.id);
  if (!isOwnerOnlyAction(membership.role)) {
    return { ok: false, error: "Only the owner can rename this workspace." };
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name },
  });

  revalidatePath("/app");
  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function deleteWorkspaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!isOwnerOnlyAction(membership.role)) {
    return { ok: false, error: "Only the owner can delete this workspace." };
  }

  await prisma.workspace.delete({ where: { id: workspaceId } });
  revalidatePath("/app");
  return { ok: true, resetUrl: "/app" };
}

export async function leaveWorkspaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (isOwnerOnlyAction(membership.role)) {
    return {
      ok: false,
      error: "Owners can’t leave — transfer ownership or delete the workspace.",
    };
  }

  await prisma.membership.delete({ where: { id: membership.id } });
  revalidatePath("/app");
  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true, resetUrl: "/app" };
}

export async function updateMemberRoleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const memberUserId = String(formData.get("memberUserId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  const membership = await requireMembership(workspaceId, user.id);
  if (!isOwnerOnlyAction(membership.role)) {
    return { ok: false, error: "Only the owner can change member roles." };
  }
  if (!["ADMIN", "EDITOR", "MEMBER"].includes(role)) {
    return { ok: false, error: "Pick a valid role." };
  }
  if (memberUserId === user.id) {
    return { ok: false, error: "You can’t change your own owner role here." };
  }

  const target = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
  });
  if (!target) return { ok: false, error: "Member not found." };
  if (target.role === "OWNER") {
    return { ok: false, error: "Can’t change the owner’s role." };
  }

  await prisma.membership.update({
    where: { id: target.id },
    data: { role },
  });

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });

  await prisma.notification.create({
    data: {
      userId: memberUserId,
      type: "ROLE_CHANGED",
      title: "Role updated",
      body: `You’re now ${role.toLowerCase()} in “${workspace?.name ?? "a workspace"}”.`,
      meta: JSON.stringify({ workspaceId, role }),
    },
  });

  revalidatePath("/app");
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function kickMemberAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const memberUserId = String(formData.get("memberUserId") ?? "");

  const membership = await requireMembership(workspaceId, user.id);
  if (!isOwnerOnlyAction(membership.role) && !canManagePeople(membership.role)) {
    return { ok: false, error: "Only owners and admins can remove members." };
  }
  if (memberUserId === user.id) {
    return { ok: false, error: "You can’t remove yourself — leave instead." };
  }

  const target = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: memberUserId } },
  });
  if (!target) return { ok: false, error: "Member not found." };
  if (target.role === "OWNER") {
    return { ok: false, error: "Can’t remove the workspace owner." };
  }
  if (membership.role === "ADMIN" && target.role === "ADMIN") {
    return { ok: false, error: "Admins can’t remove other admins." };
  }

  await prisma.membership.delete({ where: { id: target.id } });
  revalidatePath("/app");
  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function updateUrgencyChipPrefsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only owners and admins can change urgency chips." };
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      showUrgencyBase: String(formData.get("showUrgencyBase") ?? "0") === "1",
      showUrgencyDate: String(formData.get("showUrgencyDate") ?? "0") === "1",
      showUrgencyTotal: String(formData.get("showUrgencyTotal") ?? "0") === "1",
    },
  });

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function archiveWorkspaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only owners and admins can archive workspaces." };
  }

  const parsed = parseArchiveForm(formData);
  if (parsed.error) return { ok: false, error: parsed.error };

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  if (workspace.archivedAt) {
    return { ok: false, error: "This workspace is already archived." };
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: archiveUpdateData({
      userId: user.id,
      visibility: parsed.visibility,
      roles: parsed.roles,
      memberIds: parsed.memberIds,
    }),
  });

  revalidatePath("/app");
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app", "layout");
  revalidatePath("/app/calendar");
  return { ok: true };
}

export async function unarchiveWorkspaceAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only owners and admins can restore workspaces." };
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: unarchiveUpdateData(),
  });

  revalidatePath("/app");
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app", "layout");
  revalidatePath("/app/calendar");
  return { ok: true };
}
