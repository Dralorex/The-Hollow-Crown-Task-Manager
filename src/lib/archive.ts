import type { Role } from "@/generated/prisma/client";
import { canManagePeople } from "@/lib/permissions";

export type ArchiveVisibilityMode = "all" | "roles" | "members";

export type ArchiveFields = {
  archivedAt: Date | null;
  archiveVisibility: string | null;
  archiveVisibilityRoles: string | null;
  archiveVisibilityUserIds: string | null;
};

export function isArchived(entity: { archivedAt: Date | null }) {
  return entity.archivedAt != null;
}

export function parseVisibilityMode(
  raw: string | null | undefined,
): ArchiveVisibilityMode {
  if (raw === "roles" || raw === "members") return raw;
  return "all";
}

export function parseRoleCsv(raw: string | null | undefined): Role[] {
  if (!raw) return [];
  const allowed: Role[] = ["OWNER", "ADMIN", "EDITOR", "MEMBER"];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is Role => (allowed as string[]).includes(s));
}

export function parseUserIdCsv(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Admin+ always sees archived items (so they can restore).
 * Everyone else follows the visibility mode set at archive time.
 */
export function canViewArchived(
  userId: string,
  role: Role,
  entity: ArchiveFields,
): boolean {
  if (!isArchived(entity)) return true;
  if (canManagePeople(role)) return true;

  const mode = parseVisibilityMode(entity.archiveVisibility);
  if (mode === "all") return true;
  if (mode === "roles") {
    return parseRoleCsv(entity.archiveVisibilityRoles).includes(role);
  }
  return parseUserIdCsv(entity.archiveVisibilityUserIds).includes(userId);
}

export function archiveUpdateData(input: {
  userId: string;
  visibility: ArchiveVisibilityMode;
  roles: Role[];
  memberIds: string[];
}) {
  const now = new Date();
  return {
    archivedAt: now,
    archivedById: input.userId,
    archiveVisibility: input.visibility,
    archiveVisibilityRoles:
      input.visibility === "roles" ? input.roles.join(",") : null,
    archiveVisibilityUserIds:
      input.visibility === "members" ? input.memberIds.join(",") : null,
  };
}

export function unarchiveUpdateData() {
  return {
    archivedAt: null,
    archivedById: null,
    archiveVisibility: null,
    archiveVisibilityRoles: null,
    archiveVisibilityUserIds: null,
  };
}

export function parseArchiveForm(formData: FormData): {
  visibility: ArchiveVisibilityMode;
  roles: Role[];
  memberIds: string[];
  error?: string;
} {
  const visibility = parseVisibilityMode(
    String(formData.get("archiveVisibility") ?? "all"),
  );
  const roles = String(formData.get("archiveVisibilityRoles") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is Role =>
      ["OWNER", "ADMIN", "EDITOR", "MEMBER"].includes(s),
    );
  const memberIds = String(formData.get("archiveVisibilityUserIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (visibility === "roles" && roles.length === 0) {
    return {
      visibility,
      roles,
      memberIds,
      error: "Pick at least one role that can still see this.",
    };
  }
  if (visibility === "members" && memberIds.length === 0) {
    return {
      visibility,
      roles,
      memberIds,
      error: "Pick at least one member who can still see this.",
    };
  }

  return { visibility, roles, memberIds };
}
