/**
 * Fail fast on Vercel when DB env is missing, and print which known keys are set
 * (names only — never values).
 */
import { getMigrationDatabaseUrl } from "../src/lib/db-url";

const KNOWN = [
  "rowgon_storage_DATABASE_URL",
  "rowgon_storage_DATABASE_URL_UNPOOLED",
  "rowgon_storage_POSTGRES_URL",
  "rowgon_storage_POSTGRES_PRISMA_URL",
  "rowgon_storage_POSTGRES_URL_NON_POOLING",
  "ROWGON_DATABASE_URL",
  "ROWGON_DATABASE_URL_UNPOOLED",
  "TheHollowCrown_DATABASE_URL",
  "TheHollowCrown_DATABASE_URL_UNPOOLED",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
] as const;

const present = KNOWN.filter((k) => Boolean(process.env[k]?.trim()));
const empty = KNOWN.filter((k) => process.env[k] !== undefined && !process.env[k]?.trim());

console.log("[db-env] present:", present.length ? present.join(", ") : "(none)");
if (empty.length) {
  console.log("[db-env] set but empty:", empty.join(", "));
}

if (!getMigrationDatabaseUrl()) {
  console.error(`
[db-env] No usable Postgres URL for Prisma migrate.

Fix in Vercel → Project → Settings → Environment Variables:
  1. Confirm Neon storage "rowgon_storage" is connected
  2. Ensure rowgon_storage_DATABASE_URL (pooled) is set
  3. Ensure rowgon_storage_DATABASE_URL_UNPOOLED (direct) is set
  4. Enable both for Production AND Preview
  5. Redeploy (env changes do not apply to an already-running build)
`);
  process.exit(1);
}

console.log("[db-env] OK — migration URL resolved");
