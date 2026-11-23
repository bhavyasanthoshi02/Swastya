import dotenv from "dotenv";
import path from "path";

/**
 * SWASTYA DATABASE ENVIRONMENT SELECTION & SAFETY GUARD
 *
 * Target Mode Resolution:
 * 1. Explicit environment variable: SWASTYA_DB_TARGET ("neon" | "test")
 * 2. NODE_ENV === "test"
 * 3. Process invoked from test path (e.g. tests/test_*.ts)
 * 4. Default for normal local development and production is "neon".
 */
const explicitTarget = (process.env.SWASTYA_DB_TARGET || "").trim().toLowerCase();
const isExplicitTest = explicitTarget === "test" || process.env.NODE_ENV === "test";
const isInvokedFromTestPath = Boolean(
    process.argv && process.argv.some((arg) => /tests?[\\/]test_|\.test\.|\.spec\./i.test(arg))
);

const isTestMode = explicitTarget === "neon"
    ? false
    : (isExplicitTest || isInvokedFromTestPath);

if (isTestMode) {
    // Automated tests must explicitly load backend/.env.test
    const testEnvPath = path.resolve(__dirname, "../../.env.test");
    dotenv.config({ path: testEnvPath, override: true });
    process.env.SWASTYA_DB_TARGET = "test";
} else {
    // Normal development & production explicitly loads backend/.env (Neon Cloud Database)
    const neonEnvPath = path.resolve(__dirname, "../../.env");
    dotenv.config({ path: neonEnvPath, override: true });
    process.env.SWASTYA_DB_TARGET = "neon";
}

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
    dbSsl = parsed.searchParams.get("sslmode") || (rawUrl.includes("sslmode=require") ? "require" : "none");
} catch (err: any) {
    throw new Error(`[DatabaseConfig] FATAL: Invalid or unparseable DATABASE_URL (${err.message}). Never falling back silently.`);
}

// ============================================================================
// MANDATORY DATABASE SAFETY GUARDS
// ============================================================================
if (isTestMode) {
    // Guard 1: Automated tests must NEVER target Neon Cloud database
    if (dbHost.includes("neon.tech") || dbHost.includes("aws.neon.tech")) {
        throw new Error(
            `[DatabaseConfig] FATAL SAFETY VIOLATION: Automated test execution attempted to target remote Neon database (${dbHost})! Hostname rejected. Tests must only run against local swastya_test.`
        );
    }
    // Guard 2: Automated tests must verify database is swastya_test
    if (dbName !== "swastya_test") {
        throw new Error(
            `[DatabaseConfig] FATAL SAFETY VIOLATION: Automated test execution must exclusively target 'swastya_test'. Detected database name: '${dbName}'. Execution aborted.`
        );
    }
    console.log(`[DatabaseConfig] Mode: TEST | Target: Localhost (${dbHost}) | Database: ${dbName} | Safety: PASSED`);
} else {
    // Guard 3: Normal development must verify the configured database is Neon
    if (!dbHost.includes("neon.tech")) {
        throw new Error(
            `[DatabaseConfig] FATAL CONFIGURATION ERROR: Normal development must target Neon Cloud database (*.neon.tech). Detected host '${dbHost}' is not Neon. Never silently falling back to localhost or another database.`
        );
    }
    // Guard 4: Normal development must verify database is neondb
    if (dbName !== "neondb") {
        throw new Error(
            `[DatabaseConfig] FATAL CONFIGURATION ERROR: Normal development must target Neon 'neondb'. Detected database name: '${dbName}'. Never silently falling back.`
        );
    }
    console.log(`[DatabaseConfig] Mode: NEON CLOUD (DEVELOPMENT) | Host: ${dbHost} | Database: ${dbName} | SSL: ${dbSsl} | Safety: PASSED`);
}

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });
