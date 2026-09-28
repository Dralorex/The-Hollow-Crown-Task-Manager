import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canManagePeople } from "@/lib/permissions";

export type FolderAccessRow = {
  id: string;
  parentId: string | null;
  name: string;
  requiredRoleIds: string[];
  /** Hide from unauthorized members instead of showing locked. */
  hideFromUnauthorized: boolean;
  /** Always show in the tree; overrides hide rules. Does not grant access. */
  alwaysVisible: boolean;
  /** Anyone may open this folder even when roles are set. */
  alwaysAccessible: boolean;
  /** True when any required role has hideFolders enabled. */
  roleHidesFolder: boolean;
};

export type FolderVisibility = {
  id: string;
  parentId: string | null;
  name: string;
  requiredRoleIds: string[];
  hideFromUnauthorized: boolean;
  alwaysVisible: boolean;
  alwaysAccessible: boolean;
  roleHidesFolder: boolean;
  /** User may open this folder and see its contents. */
  canAccess: boolean;
  /** User may see this folder in the tree (locked or open). */
  visible: boolean;
  locked: boolean;
};

export type FolderVisibilityOpts = {
  /** Membership.role — Owner/Admin always see and access. */
  membershipRole?: Role | null;
  /** Role ids that have hideFolders=true (workspace-wide). */
  hideFolderRoleIds?: ReadonlySet<string>;
};

/** Empty required roles (or explicit All) → open to everyone. */
export function folderIsOpen(requiredRoleIds: string[]) {
  return requiredRoleIds.length === 0;
}

export function userMatchesFolderRoles(
  userRoleIds: ReadonlySet<string>,
  requiredRoleIds: string[],
) {
  if (folderIsOpen(requiredRoleIds)) return true;
  return requiredRoleIds.some((id) => userRoleIds.has(id));
}

function isPrivilegedViewer(membershipRole?: Role | null) {
  return Boolean(membershipRole && canManagePeople(membershipRole));
}

/**
 * Access requires matching roles on this folder AND every ancestor,
 * unless a folder is marked alwaysAccessible (skips that folder’s role gate).
 * Owner/Admin bypass role gates.
 */
export function canAccessFolder(
  folderId: string,
  foldersById: Map<string, FolderAccessRow>,
  userRoleIds: ReadonlySet<string>,
  opts: FolderVisibilityOpts = {},
): boolean {
  if (isPrivilegedViewer(opts.membershipRole)) {
    return Boolean(foldersById.get(folderId));
  }

  let current: FolderAccessRow | undefined = foldersById.get(folderId);
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    if (
      !current.alwaysAccessible &&
      !userMatchesFolderRoles(userRoleIds, current.requiredRoleIds)
    ) {
      return false;
    }
    current = current.parentId
      ? foldersById.get(current.parentId)
      : undefined;
  }
  return Boolean(foldersById.get(folderId));
}

function shouldHideUnauthorized(folder: FolderAccessRow): boolean {
  if (folder.alwaysAccessible) return false;
  if (folder.alwaysVisible) return false;
  return folder.hideFromUnauthorized || folder.roleHidesFolder;
}

/**
 * Visibility:
 * - Owner/Admin see everything they can reach (parents ok).
 * - alwaysAccessible grants open access despite roles (and keeps the folder visible).
 * - alwaysVisible forces show even when hide rules apply (still locked if no access).
 * - hideFromUnauthorized or required-role hideFolders → omit unauthorized folders.
 * - Otherwise locked folders remain visible; descendants of inaccessible parents do not.
 */
export function buildFolderVisibility(
  folders: FolderAccessRow[],
  userRoleIds: ReadonlySet<string>,
  opts: FolderVisibilityOpts = {},
): FolderVisibility[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const privileged = isPrivilegedViewer(opts.membershipRole);
  const result: FolderVisibility[] = [];

  for (const folder of folders) {
    const parentsOk = folder.parentId
      ? canAccessFolder(folder.parentId, byId, userRoleIds, opts)
      : true;
    if (!parentsOk) continue;

    const canAccess = canAccessFolder(folder.id, byId, userRoleIds, opts);
    if (!canAccess && !privileged && shouldHideUnauthorized(folder)) {
      continue;
    }

    result.push({
      ...folder,
      canAccess,
      visible: true,
      locked: !canAccess,
    });
  }

  return result;
}

export async function loadFolderAccessRows(
  workspaceId: string,
): Promise<FolderAccessRow[]> {
  const folders = await prisma.folder.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: {
      requiredRoles: {
        select: {
          roleId: true,
          role: { select: { hideFolders: true } },
        },
      },
    },
  });
  return folders.map((f) => ({
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    requiredRoleIds: f.requiredRoles.map((r) => r.roleId),
    hideFromUnauthorized: f.hideFromUnauthorized,
    alwaysVisible: f.alwaysVisible,
    alwaysAccessible: f.alwaysAccessible,
    roleHidesFolder: f.requiredRoles.some((r) => r.role.hideFolders),
  }));
}

export async function loadUserCustomRoleIds(
  membershipId: string,
): Promise<Set<string>> {
  const rows = await prisma.membershipRole.findMany({
    where: { membershipId },
    select: { roleId: true },
  });
  return new Set(rows.map((r) => r.roleId));
}

export async function assertCanAccessFolder(opts: {
  workspaceId: string;
  folderId: string;
  membershipId: string;
  membershipRole?: Role | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const membershipRole =
    opts.membershipRole ??
    (
      await prisma.membership.findUnique({
        where: { id: opts.membershipId },
        select: { role: true },
      })
    )?.role ??
    null;

  const [folders, userRoleIds] = await Promise.all([
    loadFolderAccessRows(opts.workspaceId),
    loadUserCustomRoleIds(opts.membershipId),
  ]);
  const byId = new Map(folders.map((f) => [f.id, f]));
  if (!byId.has(opts.folderId)) {
    return { ok: false, error: "Folder not found." };
  }
  if (
    !canAccessFolder(opts.folderId, byId, userRoleIds, { membershipRole })
  ) {
    return { ok: false, error: "You don’t have access to this folder." };
  }
  return { ok: true };
}

export type RoleActivityUnread = {
  roleId: string;
  roleName: string;
  count: number;
};

/**
 * Per-user, per-role unread task counts: tasks created after lastSeenAt
 * in folders that list this role as required.
 */
export async function getRoleActivityUnread(
  userId: string,
  workspaceId: string,
  userRoleIds: ReadonlySet<string>,
): Promise<RoleActivityUnread[]> {
  if (userRoleIds.size === 0) return [];

  const roles = await prisma.workspaceRole.findMany({
    where: {
      workspaceId,
      id: { in: [...userRoleIds] },
    },
    include: {
      folders: { select: { folderId: true } },
      seenBy: {
        where: { userId },
        select: { lastSeenAt: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const results: RoleActivityUnread[] = [];

  for (const role of roles) {
    const folderIds = role.folders.map((f) => f.folderId);
    if (folderIds.length === 0) continue;

    const lastSeenAt = role.seenBy[0]?.lastSeenAt ?? new Date(0);
    const count = await prisma.task.count({
      where: {
        workspaceId,
        folderId: { in: folderIds },
        createdAt: { gt: lastSeenAt },
        // Don't count tasks the user created themselves as "new for them".
        createdById: { not: userId },
      },
    });
    if (count > 0) {
      results.push({ roleId: role.id, roleName: role.name, count });
    }
  }

  return results;
}

export async function markRoleActivitySeen(opts: {
  userId: string;
  roleIds: string[];
}) {
  const unique = [...new Set(opts.roleIds)];
  if (unique.length === 0) return;
  const now = new Date();
  await Promise.all(
    unique.map((roleId) =>
      prisma.workspaceRoleSeen.upsert({
        where: {
          userId_roleId: { userId: opts.userId, roleId },
        },
        create: {
          userId: opts.userId,
          roleId,
          lastSeenAt: now,
        },
        update: { lastSeenAt: now },
      }),
    ),
  );
}
