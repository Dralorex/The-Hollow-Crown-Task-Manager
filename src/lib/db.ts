import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function looksLikeNeon(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("neon.tech") || host.includes("neon.db");
  } catch {
    return false;
  }
}

function isLocalHost(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function createPrismaClient() {
  const connectionString = getDatabaseUrl();
  if (looksLikeNeon(connectionString)) {
    return new PrismaClient({
      adapter: new PrismaNeon({ connectionString }),
    });
  }

  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString,
      // Local Postgres typically has no TLS; Neon/cloud URLs keep driver defaults.
      ssl: isLocalHost(connectionString) ? false : undefined,
    });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  return new PrismaClient({
    adapter: new PrismaPg(pool),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
