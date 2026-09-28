/**
 * Resolve a Postgres URL from the env names used by this project / Vercel.
 * Empty strings are treated as unset (integrations sometimes create blank placeholders).
 */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Neon/Vercel storage for this project is named `rowgon_storage`. */
const POOLED_CANDIDATES = [
  "rowgon_storage_DATABASE_URL",
  "rowgon_storage_POSTGRES_PRISMA_URL",
  "rowgon_storage_POSTGRES_URL",
  "ROWGON_DATABASE_URL",
  "TheHollowCrown_DATABASE_URL", // legacy
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "NEON_DATABASE_URL",
] as const;

const DIRECT_CANDIDATES = [
  "rowgon_storage_DATABASE_URL_UNPOOLED",
  "rowgon_storage_POSTGRES_URL_NON_POOLING",
  "ROWGON_DATABASE_URL_UNPOOLED",
  "TheHollowCrown_DATABASE_URL_UNPOOLED", // legacy
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "rowgon_storage_DATABASE_URL",
  "rowgon_storage_POSTGRES_URL",
  "ROWGON_DATABASE_URL",
  "TheHollowCrown_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "NEON_DATABASE_URL",
] as const;

function readEnv(names: readonly string[]): string | undefined {
  return firstNonEmpty(...names.map((name) => process.env[name]));
}

/** Pooled URL for app runtime (Prisma Neon adapter). */
export function getDatabaseUrl(): string {
  const url = readEnv(POOLED_CANDIDATES);
  if (!url) {
    throw new Error(
      "No database URL found. Set rowgon_storage_DATABASE_URL (Neon pooled) for Production and Preview in Vercel.",
    );
  }
  return url;
}

/**
 * Direct (unpooled) URL for Prisma CLI migrations.
 * Returns undefined when unset so `prisma generate` can still run without a DB.
 */
export function getMigrationDatabaseUrl(): string | undefined {
  return readEnv(DIRECT_CANDIDATES);
}

export function requireMigrationDatabaseUrl(): string {
  const url = getMigrationDatabaseUrl();
  if (!url) {
    throw new Error(
      "No migration database URL found. Set rowgon_storage_DATABASE_URL_UNPOOLED (Neon direct) or rowgon_storage_DATABASE_URL in Vercel.",
    );
  }
  return url;
}
