"use server";

import { revalidatePath } from "next/cache";
import { isArchived } from "@/lib/archive";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  folderRowsToTree,
  getBuiltinTemplate,
  parseTemplateTree,
  serializeTemplateTree,
  type FolderTemplateNode,
} from "@/lib/folder-templates";
import {
  canEditContent,
  canManagePeople,
  requireMembership,
} from "@/lib/permissions";
import { assertCanAccessFolder } from "@/lib/folder-access";
import type { ActionResult } from "@/app/actions/auth";

function revalidateWorkspace(workspaceId: string) {
  revalidatePath(`/app/w/${workspaceId}`);
}

async function createTree(
  workspaceId: string,
  nodes: FolderTemplateNode[],
  parentId: string | null,
) {
  for (const node of nodes) {
    const created = await prisma.folder.create({
      data: {
        workspaceId,
        parentId,
        name: node.name,
      },
    });
    if (node.children?.length) {
      await createTree(workspaceId, node.children, created.id);
    }
  }
}

export async function applyFolderTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const templateId = String(formData.get("templateId") ?? "").trim();
  const parentRaw = String(formData.get("parentId") ?? "").trim();
  const parentId = parentRaw || null;

  const membership = await requireMembership(workspaceId, user.id);
  if (!canEditContent(membership.role)) {
    return { ok: false, error: "Members can’t apply folder templates." };
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  if (isArchived(workspace)) {
    return {
      ok: false,
      error: "This workspace is archived. Restore it to add folders.",
    };
  }

  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, workspaceId },
    });
    if (!parent) return { ok: false, error: "Parent folder not found." };
    if (isArchived(parent)) {
      return { ok: false, error: "That folder is archived. Restore it first." };
    }
    const access = await assertCanAccessFolder({
      workspaceId,
      folderId: parentId,
      membershipId: membership.id,
      membershipRole: membership.role,
    });
    if (!access.ok) return access;
  }

  let tree: FolderTemplateNode[] | null = null;
  const builtin = getBuiltinTemplate(templateId);
  if (builtin) {
    tree = builtin.tree;
  } else {
    const saved = await prisma.folderTemplate.findFirst({
      where: { id: templateId, workspaceId },
    });
    if (!saved) return { ok: false, error: "Template not found." };
    tree = parseTemplateTree(saved.treeJson);
  }

  if (!tree?.length) {
    return { ok: false, error: "That template has no folders." };
  }

  await createTree(workspaceId, tree, parentId);
  revalidateWorkspace(workspaceId);
  return { ok: true };
}

export async function saveFolderTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const fromFolderRaw = String(formData.get("fromFolderId") ?? "").trim();
  const fromFolderId = fromFolderRaw || null;

  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only owners and admins can save templates." };
  }
  if (!name) return { ok: false, error: "Give the template a name." };

  const folders = await prisma.folder.findMany({
    where: { workspaceId, archivedAt: null },
    select: { id: true, name: true, parentId: true },
  });

  if (fromFolderId) {
    const root = folders.find((f) => f.id === fromFolderId);
    if (!root) return { ok: false, error: "Folder not found." };
  }

  const tree = folderRowsToTree(folders, fromFolderId);
  if (!tree.length) {
    return {
      ok: false,
      error: fromFolderId
        ? "That folder has no subfolders to save."
        : "Add folders before saving a template.",
    };
  }

  // When saving from a specific folder, include that folder as the root node
  const payload = fromFolderId
    ? [
        {
          name: folders.find((f) => f.id === fromFolderId)!.name,
          children: tree,
        },
      ]
    : tree;

  await prisma.folderTemplate.create({
    data: {
      workspaceId,
      name,
      treeJson: serializeTemplateTree(payload),
    },
  });

  revalidateWorkspace(workspaceId);
  return { ok: true };
}

export async function deleteFolderTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");

  const membership = await requireMembership(workspaceId, user.id);
  if (!canManagePeople(membership.role)) {
    return { ok: false, error: "Only owners and admins can delete templates." };
  }

  const existing = await prisma.folderTemplate.findFirst({
    where: { id: templateId, workspaceId },
  });
  if (!existing) return { ok: false, error: "Template not found." };

  await prisma.folderTemplate.delete({ where: { id: templateId } });
  revalidateWorkspace(workspaceId);
  return { ok: true };
}
