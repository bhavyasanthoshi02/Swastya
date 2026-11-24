import dotenv from "dotenv";
import path from "path";

/**
 * SWASTYA DATABASE ENVIRONMENT SELECTION & SAFETY GUARD
 *
 * Strict Requirement: Always target Neon Cloud Database (`neondb`).
 * Never silently fall back to localhost or any other database.
 */
const neonEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: neonEnvPath, override: true });
process.env.SWASTYA_DB_TARGET = "neon";

// Extract database metadata safely without exposing credentials
let dbHost = "";
let dbName = "";
let dbSsl = "";

try {
    const rawUrl = process.env.DATABASE_URL || "";
    if (!rawUrl) {
        throw new Error("DATABASE_URL is missing or empty.");
    }
    const parsed = new URL(rawUrl);
    dbHost = parsed.hostname;
    dbName = parsed.pathname.replace(/^\//, "");
    dbSsl = parsed.searchParams.get("sslmode") || (rawUrl.includes("sslmode=verify-full") ? "verify-full" : rawUrl.includes("sslmode=require") ? "require" : "none");
} catch (err: any) {
    throw new Error(`[DatabaseConfig] FATAL: Invalid or unparseable DATABASE_URL (${err.message}). Never falling back silently.`);
}

// ============================================================================
// MANDATORY DATABASE SAFETY GUARDS
// ============================================================================
// Guard 1: Must verify the configured database is Neon Cloud
if (!dbHost.includes("neon.tech")) {
    throw new Error(
        `[DatabaseConfig] FATAL CONFIGURATION ERROR: Application and tests must target Neon Cloud database (*.neon.tech). Detected host '${dbHost}' is not Neon. Never silently falling back to localhost or another database.`
    );
}

// Guard 2: Must verify database is neondb
if (dbName !== "neondb") {
    throw new Error(
        `[DatabaseConfig] FATAL CONFIGURATION ERROR: Configured database must be 'neondb'. Detected database name: '${dbName}'. Never silently falling back.`
    );
}

console.log(`[DatabaseConfig] Active: NEON CLOUD | Host: ${dbHost} | Database: ${dbName} | SSL: ${dbSsl} | Safety: PASSED`);

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

let connectionUrl = process.env.DATABASE_URL || "";
if (connectionUrl.includes("sslmode=require") && !connectionUrl.includes("sslmode=verify-full")) {
    connectionUrl = connectionUrl.replace("sslmode=require", "sslmode=verify-full");
}

const adapter = new PrismaPg({
    connectionString: connectionUrl,
});

export const prisma = new PrismaClient({ adapter });
