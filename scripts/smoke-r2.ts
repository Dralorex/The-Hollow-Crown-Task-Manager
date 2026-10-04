/**
 * Local R2 connectivity check.
 * Run: npx tsx scripts/smoke-r2.ts
 */
import "dotenv/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing ${name} in .env`);
  }
  return v;
}

async function main() {
  const accountId = required("R2_ACCOUNT_ID");
  const accessKeyId = required("R2_ACCESS_KEY_ID");
  const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
  const bucket = required("R2_BUCKET");
  const endpoint = required("R2_ENDPOINT");

  if (!endpoint.includes(accountId)) {
    console.warn(
      "Warning: R2_ENDPOINT does not contain R2_ACCOUNT_ID — double-check the URL.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  const key = `smoke/${Date.now()}-rowgon-r2.txt`;
  const body = `rowgon r2 smoke ${new Date().toISOString()}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/plain",
    }),
  );
  console.log("PUT ok:", key);

  const got = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const text = await got.Body?.transformToString();
  if (text !== body) {
    throw new Error(`GET mismatch: expected "${body}", got "${text}"`);
  }
  console.log("GET ok");

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log("DELETE ok");
  console.log("R2 smoke passed.");
}

main().catch((err) => {
  console.error("R2 smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
