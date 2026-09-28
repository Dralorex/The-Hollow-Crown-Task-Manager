"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  pushBadgesForUsers,
  pushRefreshForUsers,
} from "@/lib/ably-server";
import { syncCalendarForTask } from "@/lib/calendar";
import { prisma } from "@/lib/db";
import {
  canCreatePublicTags,
  canEditContent,
  canManagePeople,
  requireMembership,
} from "@/lib/permissions";
import { assertCanAccessFolder } from "@/lib/folder-access";
import type { TaskPriority } from "@/generated/prisma/client";
import type { ActionResult } from "@/app/actions/auth";
import { personLabel } from "@/lib/utils";
import { parseTagNames } from "@/lib/tags";
import { isTaskPriority } from "@/lib/urgency";

async function requireTaskFolderAccess(
  workspaceId: string,
  membershipId: string,
  folderId: string,
  membershipRole?: Parameters<typeof assertCanAccessFolder>[0]["membershipRole"],
): Promise<ActionResult | null> {
  const access = await assertCanAccessFolder({
    workspaceId,
    folderId,
    membershipId,
    membershipRole,
  });
  if (!access.ok) return access;
  return null;
}

export async function createFolderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const parentRaw = String(formData.get("parentId") ?? "").trim();
  const parentId = parentRaw || null;

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Members can’t create folders." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Folder needs a name." };

  if (parentId) {
    const access = await assertCanAccessFolder({
      workspaceId,
      folderId: parentId,
      membershipId: membership.id,
      membershipRole: membership.role,
    });
    if (!access.ok) return access;
  }

  const canSetAccess = canManagePeople(membership.role);
  const hideFromUnauthorized =
    canSetAccess && String(formData.get("hideFromUnauthorized") ?? "") === "1";
  const alwaysVisible =
    canSetAccess && String(formData.get("alwaysVisible") ?? "") === "1";

  let roleIds: string[] = [];
  if (canSetAccess) {
    const roleNames = String(formData.get("roles") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (roleNames.length > 0) {
      const roles = await prisma.workspaceRole.findMany({
        where: { workspaceId },
        select: { id: true, name: true },
      });
      const byName = new Map(
        roles.map((r) => [r.name.toLowerCase(), r.id] as const),
      );
      const unresolved: string[] = [];
      for (const label of roleNames) {
        const id = byName.get(label.toLowerCase());
        if (!id) unresolved.push(label);
        else if (!roleIds.includes(id)) roleIds.push(id);
      }
      if (unresolved.length > 0) {
        return {
          ok: false,
          error: `Unknown role${unresolved.length === 1 ? "" : "s"}: ${unresolved.join(", ")}.`,
        };
      }
    }
  }

  await prisma.folder.create({
    data: {
      workspaceId,
      parentId,
      name,
      hideFromUnauthorized,
      alwaysVisible,
      ...(roleIds.length > 0
        ? {
            requiredRoles: {
              create: roleIds.map((roleId) => ({ roleId })),
            },
          }
        : {}),
    },
  });

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function renameFolderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Members can’t rename folders." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Folder needs a name." };

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, workspaceId },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  const access = await assertCanAccessFolder({
    workspaceId,
    folderId,
    membershipId: membership.id,
  });
  if (!access.ok) return access;

  await prisma.folder.update({
    where: { id: folderId },
    data: { name },
  });

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function deleteFolderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Members can’t delete folders." };
  }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, workspaceId },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  const access = await assertCanAccessFolder({
    workspaceId,
    folderId,
    membershipId: membership.id,
  });
  if (!access.ok) return access;

  const parentId = folder.parentId;
  await prisma.folder.delete({ where: { id: folderId } });

  revalidatePath(`/app/w/${workspaceId}`);
  return {
    ok: true,
    resetUrl: parentId
      ? `/app/w/${workspaceId}?folder=${parentId}`
      : `/app/w/${workspaceId}`,
  };
}

export async function createTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Members can’t create tasks." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "MEDIUM") as TaskPriority;
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const tagNames = parseTagNames(String(formData.get("tags") ?? ""));

  if (!name) return { ok: false, error: "Task needs a name." };
  if (!isTaskPriority(priority)) {
    return { ok: false, error: "Pick a valid priority." };
  }

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, workspaceId },
  });
  if (!folder) return { ok: false, error: "Folder not found." };

  const access = await assertCanAccessFolder({
    workspaceId,
    folderId,
    membershipId: membership.id,
  });
  if (!access.ok) return access;

  if (tagNames.length > 0 && !canCreatePublicTags(membership.role)) {
    return { ok: false, error: "Only editors and above can add public tags." };
  }

  const task = await prisma.task.create({
    data: {
      workspaceId,
      folderId,
      name,
      description,
      priority,
      dueDate: dueRaw ? new Date(dueRaw) : null,
      createdById: user.id,
    },
  });

  for (const tagName of tagNames) {
    let tag = await prisma.tag.findFirst({
      where: { workspaceId, name: tagName, isPublic: true },
    });
    if (!tag) {
      tag = await prisma.tag.create({
        data: {
          workspaceId,
          name: tagName,
          isPublic: true,
          creatorId: user.id,
        },
      });
    }
    await prisma.taskTag.upsert({
      where: { taskId_tagId: { taskId: task.id, tagId: tag.id } },
      create: { taskId: task.id, tagId: tag.id },
      update: {},
    });
  }

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function claimTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
  });
  if (!task) return { ok: false, error: "Task not found." };

  const membership = await requireMembership(workspaceId, user.id);
  const access = await assertCanAccessFolder({
    workspaceId,
    folderId: task.folderId,
    membershipId: membership.id,
  });
  if (!access.ok) return access;

  if (task.assigneeId && task.assigneeId !== user.id) {
    return { ok: false, error: "Someone else already claimed this task." };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      assigneeId: user.id,
      status: "CLAIMED",
      claimedAt: new Date(),
      lastUnclaimReason: null,
      lastUnclaimWorkNote: null,
      lastUnclaimedById: null,
    },
  });

  // Restore this user's remembered private tags for this task.
  const remembered = await prisma.rememberedPrivateTag.findMany({
    where: { userId: user.id, taskId },
  });
  if (remembered.length > 0) {
    await prisma.taskTag.createMany({
      data: remembered.map((r) => ({ taskId: r.taskId, tagId: r.tagId })),
      skipDuplicates: true,
    });
    await prisma.rememberedPrivateTag.deleteMany({
      where: { userId: user.id, taskId },
    });
  }

  await syncCalendarForTask(taskId);
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function unclaimTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const workNote = String(formData.get("workNote") ?? "").trim();
  const membership = await requireMembership(workspaceId, user.id);

  if (!reason) {
    return { ok: false, error: "Say why you’re unclaiming this task." };
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    include: {
      tags: { include: { tag: true } },
    },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const denied = await requireTaskFolderAccess(
    workspaceId,
    membership.id,
    task.folderId,
  );
  if (denied) return denied;
  if (task.assigneeId !== user.id) {
    return { ok: false, error: "Only the assignee can unclaim this task." };
  }
  if (task.status === "IN_REVIEW" || task.status === "DONE") {
    return {
      ok: false,
      error: "Finish or wait for review before unclaiming.",
    };
  }

  const privateLinks = task.tags.filter(
    (tt) => !tt.tag.isPublic && tt.tag.creatorId === user.id,
  );

  if (privateLinks.length > 0) {
    await prisma.rememberedPrivateTag.createMany({
      data: privateLinks.map((tt) => ({
        userId: user.id,
        taskId,
        tagId: tt.tagId,
      })),
      skipDuplicates: true,
    });
    await prisma.taskTag.deleteMany({
      where: {
        taskId,
        tagId: { in: privateLinks.map((tt) => tt.tagId) },
      },
    });
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      assigneeId: null,
      status: "OPEN",
      claimedAt: null,
      lastUnclaimReason: reason,
      lastUnclaimWorkNote: workNote || null,
      lastUnclaimedById: user.id,
    },
  });

  await syncCalendarForTask(taskId);
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function updateTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Only editors and above can modify tasks." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priority = String(formData.get("priority") ?? "MEDIUM") as TaskPriority;
  const dueRaw = String(formData.get("dueDate") ?? "").trim();

  if (!name) return { ok: false, error: "Task needs a name." };
  if (!isTaskPriority(priority)) {
    return { ok: false, error: "Pick a valid priority." };
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const denied = await requireTaskFolderAccess(
    workspaceId,
    membership.id,
    task.folderId,
  );
  if (denied) return denied;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      name,
      description,
      priority,
      dueDate: dueRaw ? new Date(dueRaw) : null,
    },
  });

  await syncCalendarForTask(taskId);
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function deleteTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Only editors and above can delete tasks." };
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
  });
  if (!task) return { ok: false, error: "Task not found." };

  const denied = await requireTaskFolderAccess(
    workspaceId,
    membership.id,
    task.folderId,
  );
  if (denied) return denied;

  await prisma.task.delete({ where: { id: taskId } });

  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app/calendar");
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Editor+ removes the current assignee and returns the task to OPEN. */
export async function forceUnclaimTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const workNote = String(formData.get("workNote") ?? "").trim();

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Only editors and above can force-unclaim." };
  }

  if (!reason) {
    return { ok: false, error: "Say why you’re force-unclaiming this task." };
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    include: {
      tags: { include: { tag: true } },
      assignee: true,
    },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const deniedForce = await requireTaskFolderAccess(
    workspaceId,
    membership.id,
    task.folderId,
  );
  if (deniedForce) return deniedForce;
  if (!task.assigneeId) {
    return { ok: false, error: "This task isn’t claimed." };
  }
  if (task.status === "DONE") {
    return { ok: false, error: "Done tasks can’t be force-unclaimed." };
  }

  const assigneeId = task.assigneeId;
  const privateLinks = task.tags.filter(
    (tt) => !tt.tag.isPublic && tt.tag.creatorId === assigneeId,
  );

  if (privateLinks.length > 0) {
    await prisma.rememberedPrivateTag.createMany({
      data: privateLinks.map((tt) => ({
        userId: assigneeId,
        taskId,
        tagId: tt.tagId,
      })),
      skipDuplicates: true,
    });
    await prisma.taskTag.deleteMany({
      where: {
        taskId,
        tagId: { in: privateLinks.map((tt) => tt.tagId) },
      },
    });
  }

  const assigneeLabel = task.assignee ? personLabel(task.assignee) : "assignee";
  const note = workNote
    ? workNote
    : `Force-unclaimed from ${assigneeLabel} by ${personLabel(user)}.`;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      assigneeId: null,
      status: "OPEN",
      claimedAt: null,
      completionComment: null,
      lastUnclaimReason: reason,
      lastUnclaimWorkNote: note,
      lastUnclaimedById: user.id,
    },
  });

  await prisma.notification.create({
    data: {
      userId: assigneeId,
      type: "TASK_REOPENED",
      title: "Task unclaimed by editor",
      body: `“${task.name}” was force-unclaimed: ${reason}`,
      meta: JSON.stringify({
        workspaceId,
        taskId,
        folderId: task.folderId,
      }),
    },
  });

  await syncCalendarForTask(taskId);
  await Promise.all([
    pushBadgesForUsers([assigneeId]),
    pushRefreshForUsers(
      [assigneeId, user.id],
      [`/app/w/${workspaceId}`, "/app/notifications"],
    ),
  ]);
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function completeTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) {
    return { ok: false, error: "Add a short note on what you completed." };
  }

  const membership = await requireMembership(workspaceId, user.id);
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const deniedComplete = await requireTaskFolderAccess(
    workspaceId,
    membership.id,
    task.folderId,
  );
  if (deniedComplete) return deniedComplete;
  if (task.assigneeId !== user.id) {
    return { ok: false, error: "Only the assignee can mark this ready for review." };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "IN_REVIEW",
      completionComment: comment,
      lastSendBackReason: null,
      lastSentBackById: null,
    },
  });

  const ownersAndAdmins = await prisma.membership.findMany({
    where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
  });

  await prisma.notification.createMany({
    data: ownersAndAdmins.map((m) => ({
      userId: m.userId,
      type: "TASK_REVIEW",
      title: "Ready for review",
      body: `${personLabel(user)} finished “${task.name}”: ${comment}`,
      meta: JSON.stringify({
        workspaceId,
        taskId,
        folderId: task.folderId,
      }),
    })),
  });

  await syncCalendarForTask(taskId);
  const reviewUserIds = ownersAndAdmins.map((m) => m.userId);
  await Promise.all([
    pushBadgesForUsers(reviewUserIds),
    pushRefreshForUsers(
      [...reviewUserIds, user.id],
      [`/app/w/${workspaceId}`, "/app/notifications"],
    ),
  ]);
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function reviewTaskAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "approve" | "reopen";
  const reason = String(formData.get("reason") ?? "").trim();

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Only editors and above can review tasks." };
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
  });
  if (!task || task.status !== "IN_REVIEW") {
    return { ok: false, error: "Nothing to review." };
  }
  const deniedReview = await requireTaskFolderAccess(
    workspaceId,
    membership.id,
    task.folderId,
  );
  if (deniedReview) return deniedReview;

  if (decision === "reopen" && !reason) {
    return { ok: false, error: "Say why you’re sending this task back." };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: decision === "approve" ? "DONE" : "CLAIMED",
      completionComment: decision === "approve" ? task.completionComment : null,
      lastSendBackReason: decision === "reopen" ? reason : null,
      lastSentBackById: decision === "reopen" ? user.id : null,
    },
  });

  if (task.assigneeId) {
    await prisma.notification.create({
      data: {
        userId: task.assigneeId,
        type: decision === "approve" ? "TASK_APPROVED" : "TASK_REOPENED",
        title: decision === "approve" ? "Task approved" : "Needs more work",
        body:
          decision === "approve"
            ? `“${task.name}” was approved.`
            : `“${task.name}” was sent back: ${reason}`,
        meta: JSON.stringify({
          workspaceId,
          taskId,
          folderId: task.folderId,
        }),
      },
    });
  }

  await syncCalendarForTask(taskId);
  const notifyIds = [user.id, task.assigneeId].filter(Boolean) as string[];
  await Promise.all([
    task.assigneeId ? pushBadgesForUsers([task.assigneeId]) : Promise.resolve(),
    pushRefreshForUsers(notifyIds, [
      `/app/w/${workspaceId}`,
      "/app/notifications",
    ]),
  ]);
  revalidatePath(`/app/w/${workspaceId}`);
  revalidatePath("/app/notifications");
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function addPrivateTagAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  await requireMembership(workspaceId, user.id);

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
  });
  if (!task || task.assigneeId !== user.id) {
    return { ok: false, error: "Claim the task first to add your private tags." };
  }

  const names = parseTagNames(String(formData.get("name") ?? ""));
  if (names.length === 0) return { ok: false, error: "Tag needs a name." };

  for (const name of names) {
    let tag = await prisma.tag.findFirst({
      where: {
        workspaceId,
        name,
        isPublic: false,
        creatorId: user.id,
      },
    });

    if (!tag) {
      tag = await prisma.tag.create({
        data: {
          workspaceId,
          name,
          isPublic: false,
          creatorId: user.id,
        },
      });
    }

    await prisma.taskTag.upsert({
      where: { taskId_tagId: { taskId, tagId: tag.id } },
      create: { taskId, tagId: tag.id },
      update: {},
    });
  }

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function addPublicTagAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);
  if (!canCreatePublicTags(membership.role)) {
    return { ok: false, error: "Only editors and above manage public tags." };
  }

  const names = parseTagNames(String(formData.get("name") ?? ""));
  if (names.length === 0) return { ok: false, error: "Tag needs a name." };

  for (const name of names) {
    let tag = await prisma.tag.findFirst({
      where: { workspaceId, name, isPublic: true },
    });
    if (!tag) {
      tag = await prisma.tag.create({
        data: { workspaceId, name, isPublic: true, creatorId: user.id },
      });
    }

    await prisma.taskTag.upsert({
      where: { taskId_tagId: { taskId, tagId: tag.id } },
      create: { taskId, tagId: tag.id },
      update: {},
    });
  }

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}

export async function removeTaskTagAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const taskId = String(formData.get("taskId") ?? "");
  const tagId = String(formData.get("tagId") ?? "");
  const membership = await requireMembership(workspaceId, user.id);

  const link = await prisma.taskTag.findUnique({
    where: { taskId_tagId: { taskId, tagId } },
    include: { tag: true, task: true },
  });
  if (!link || link.task.workspaceId !== workspaceId) {
    return { ok: false, error: "Tag not found on this task." };
  }

  if (link.tag.isPublic) {
    if (!canEditContent(membership.role)) {
      return { ok: false, error: "Only editors and above can remove public tags." };
    }
  } else if (link.task.assigneeId !== user.id && link.tag.creatorId !== user.id) {
    return { ok: false, error: "You can only remove your own private tags." };
  }

  await prisma.taskTag.delete({
    where: { taskId_tagId: { taskId, tagId } },
  });

  revalidatePath(`/app/w/${workspaceId}`);
  return { ok: true };
}
