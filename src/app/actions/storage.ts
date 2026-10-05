"use server";

import { nanoid } from "nanoid";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManagePeople, requireMembership } from "@/lib/permissions";
import {
  assertAllowedUpload,
  buildObjectKey,
  deleteObject,
  headObject,
  isR2Configured,
  presignDownload,
  presignUpload,
  R2_MAX_UPLOAD_BYTES,
} from "@/lib/r2";

export type StorageActionResult =
  | {
      ok: true;
      uploadUrl?: string;
      downloadUrl?: string;
      expiresIn?: number;
      objectId?: string;
      key?: string;
    }
  | { ok: false; error: string };

/**
 * Virus scanning intentionally deferred.
 * Hook will wrap confirmUpload / object finalize later (e.g. async scan job
 * before making the file available). Fail closed for Business-sensitive files
 * when eventually enabled.
 */

async function requireStorageAdmin(workspaceId: string, userId: string) {
  const membership = await requireMembership(workspaceId, userId);
  if (!canManagePeople(membership.role)) {
    throw new Error("FORBIDDEN");
  }
  return membership;
}

/** Request a short-TTL signed upload URL (Admin+). */
export async function requestUploadUrlAction(
  _prev: StorageActionResult | null,
  formData: FormData,
): Promise<StorageActionResult> {
  if (!isR2Configured()) {
    return { ok: false, error: "File storage (R2) is not configured." };
  }

  try {
    const user = await requireUser();
    const workspaceId = String(formData.get("workspaceId") ?? "").trim();
    const filename = String(formData.get("filename") ?? "").trim();
    const contentType = String(formData.get("contentType") ?? "").trim();
    const bytes = Number(formData.get("bytes") ?? 0);

    if (!workspaceId || !filename || !contentType) {
      return { ok: false, error: "workspaceId, filename, and contentType are required." };
    }

    await requireStorageAdmin(workspaceId, user.id);
    assertAllowedUpload(contentType, bytes);

    const objectId = nanoid(16);
    const key = buildObjectKey(workspaceId, objectId, filename);
    const signed = await presignUpload({
      key,
      contentType,
      maxBytes: Math.min(bytes, R2_MAX_UPLOAD_BYTES),
    });

    return {
      ok: true,
      uploadUrl: signed.url,
      expiresIn: signed.expiresIn,
      objectId,
      key,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload request failed.";
    if (message === "FORBIDDEN") {
      return { ok: false, error: "Only Admin+ can upload files for now." };
    }
    return { ok: false, error: message };
  }
}

/**
 * After the client PUTs to the signed URL, confirm the object exists in R2
 * and write Neon metadata. Virus scan deferred — see file header comment.
 */
export async function confirmUploadAction(
  _prev: StorageActionResult | null,
  formData: FormData,
): Promise<StorageActionResult> {
  if (!isR2Configured()) {
    return { ok: false, error: "File storage (R2) is not configured." };
  }

  try {
    const user = await requireUser();
    const workspaceId = String(formData.get("workspaceId") ?? "").trim();
    const key = String(formData.get("key") ?? "").trim();
    const filename = String(formData.get("filename") ?? "").trim();
    const expectedContentType = String(formData.get("contentType") ?? "").trim();

    if (!workspaceId || !key || !filename) {
      return { ok: false, error: "workspaceId, key, and filename are required." };
    }
    if (!key.startsWith(`workspaces/${workspaceId}/`)) {
      return { ok: false, error: "Invalid object key for this workspace." };
    }

    await requireStorageAdmin(workspaceId, user.id);

    const head = await headObject(key);
    if (head.bytes <= 0 || head.bytes > R2_MAX_UPLOAD_BYTES) {
      return { ok: false, error: "Uploaded object size is invalid." };
    }
    if (
      expectedContentType &&
      head.contentType &&
      head.contentType !== expectedContentType
    ) {
      // Soft check — some clients omit exact Content-Type on PUT.
      console.warn(
        "[r2] content-type mismatch",
        expectedContentType,
        head.contentType,
      );
    }

    // VIRUS SCAN HOOK (later): enqueue scan; keep object unavailable until clean.
    const row = await prisma.storedObject.create({
      data: {
        workspaceId,
        key,
        filename,
        contentType: expectedContentType || head.contentType,
        bytes: head.bytes,
        uploadedById: user.id,
      },
    });

    return { ok: true, objectId: row.id, key: row.key };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Confirm upload failed.";
    if (message === "FORBIDDEN") {
      return { ok: false, error: "Only Admin+ can upload files for now." };
    }
    return { ok: false, error: message };
  }
}

/** Authorized short-TTL download URL (Admin+). */
export async function requestDownloadUrlAction(
  _prev: StorageActionResult | null,
  formData: FormData,
): Promise<StorageActionResult> {
  if (!isR2Configured()) {
    return { ok: false, error: "File storage (R2) is not configured." };
  }

  try {
    const user = await requireUser();
    const objectId = String(formData.get("objectId") ?? "").trim();
    if (!objectId) return { ok: false, error: "objectId is required." };

    const row = await prisma.storedObject.findFirst({
      where: { id: objectId, deletedAt: null },
    });
    if (!row) return { ok: false, error: "File not found." };

    await requireStorageAdmin(row.workspaceId, user.id);
    const signed = await presignDownload(row.key);
    return {
      ok: true,
      downloadUrl: signed.url,
      expiresIn: signed.expiresIn,
      objectId: row.id,
      key: row.key,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download request failed.";
    if (message === "FORBIDDEN") {
      return { ok: false, error: "Only Admin+ can download files for now." };
    }
    return { ok: false, error: message };
  }
}

/** Delete R2 object + soft-delete metadata (Admin+). */
export async function deleteStoredObjectAction(
  _prev: StorageActionResult | null,
  formData: FormData,
): Promise<StorageActionResult> {
  if (!isR2Configured()) {
    return { ok: false, error: "File storage (R2) is not configured." };
  }

  try {
    const user = await requireUser();
    const objectId = String(formData.get("objectId") ?? "").trim();
    if (!objectId) return { ok: false, error: "objectId is required." };

    const row = await prisma.storedObject.findFirst({
      where: { id: objectId, deletedAt: null },
    });
    if (!row) return { ok: false, error: "File not found." };

    await requireStorageAdmin(row.workspaceId, user.id);
    await deleteObject(row.key);
    await prisma.storedObject.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });

    return { ok: true, objectId: row.id, key: row.key };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed.";
    if (message === "FORBIDDEN") {
      return { ok: false, error: "Only Admin+ can delete files for now." };
    }
    return { ok: false, error: message };
  }
}
