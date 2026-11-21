import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (migrate, db push, introspection).
 *
 * The CLI uses a DIRECT (non-pooled) connection, which is required for Neon.
 * It falls back to DATABASE_URL so local development works without DIRECT_URL.
 *
 * The application runtime does NOT use this file; it reads DATABASE_URL
 * via the PrismaPg adapter in src/config/prisma.ts (use the pooled URL there).
 */
export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
    },
});
