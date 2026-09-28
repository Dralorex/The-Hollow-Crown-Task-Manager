import "dotenv/config";
import { defineConfig } from "prisma/config";
import { getMigrationDatabaseUrl } from "./src/lib/db-url";

// Prefer unpooled / direct URL for migrate deploy on Neon.
// Leave undefined during `prisma generate` (postinstall) when env isn't set yet.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getMigrationDatabaseUrl(),
  },
});
