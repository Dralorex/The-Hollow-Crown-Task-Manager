import "server-only";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Temporary hard max (not plan-based). Plan caps come later. */
export const R2_MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

/** MIME allowlist stub — adjust when product needs more types. */
export const R2_ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

let clientSingleton: S3Client | null | undefined;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET?.trim() &&
      process.env.R2_ENDPOINT?.trim(),
  );
}

function getClient(): S3Client | null {
  if (clientSingleton !== undefined) return clientSingleton;
  if (!isR2Configured()) {
    clientSingleton = null;
    return null;
  }
  clientSingleton = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!.trim(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
  });
  return clientSingleton;
}

function bucket(): string {
  return process.env.R2_BUCKET!.trim();
}

export function assertAllowedUpload(contentType: string, bytes: number) {
  if (!R2_ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Content type not allowed: ${contentType}`);
  }
  if (bytes <= 0 || bytes > R2_MAX_UPLOAD_BYTES) {
    throw new Error(
      `File must be between 1 byte and ${R2_MAX_UPLOAD_BYTES} bytes.`,
    );
  }
}

/** Object key layout: workspaces/{workspaceId}/{objectId}/{safeFilename} */
export function buildObjectKey(
  workspaceId: string,
  objectId: string,
  filename: string,
) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  return `workspaces/${workspaceId}/${objectId}/${safe || "file"}`;
}

export async function presignUpload(opts: {
  key: string;
  contentType: string;
  maxBytes: number;
}) {
  const client = getClient();
  if (!client) throw new Error("R2 is not configured.");
  // Enforce size/MIME before signing; confirmUpload re-checks bytes via HeadObject.
  assertAllowedUpload(opts.contentType, opts.maxBytes);
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: opts.key,
    ContentType: opts.contentType,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });
  return { url, expiresIn: UPLOAD_URL_TTL_SECONDS };
}

export async function presignDownload(key: string) {
  const client = getClient();
  if (!client) throw new Error("R2 is not configured.");
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
  return { url, expiresIn: DOWNLOAD_URL_TTL_SECONDS };
}

export async function headObject(key: string) {
  const client = getClient();
  if (!client) throw new Error("R2 is not configured.");
  const result = await client.send(
    new HeadObjectCommand({ Bucket: bucket(), Key: key }),
  );
  return {
    contentType: result.ContentType ?? "application/octet-stream",
    bytes: result.ContentLength ?? 0,
  };
}

export async function deleteObject(key: string) {
  const client = getClient();
  if (!client) throw new Error("R2 is not configured.");
  await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
