import "dotenv/config";
import { prisma } from "./src/config/prisma";

interface TableInfo {
    table_name: string;
}

async function runDatabaseCheck() {
    console.log("=== SWASTYA STEP 2.2A: DATABASE CONNECTIVITY CHECK ===\n");

    // 1. Check environment variable status
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.log("STATUS: DATABASE_URL is NOT set in environment or backend/.env");
        console.log("ERROR_CATEGORY: MissingConfiguration");
        console.log("DETAILS: process.env.DATABASE_URL is undefined. backend/.env file is missing.");
        return;
    }

    // Mask connection string safely for reporting
    try {
        const parsedUrl = new URL(dbUrl);
        const maskedHost = parsedUrl.host;
        const maskedDb = parsedUrl.pathname.replace("/", "");
        console.log(`CONFIGURED TARGET: Host: ${maskedHost}, Database: ${maskedDb}, Protocol: ${parsedUrl.protocol}`);
    } catch {
        console.log("CONFIGURED TARGET: Unable to parse DATABASE_URL (malformed URL)");
    }

    // 2. Perform connection check
    try {
        console.log("\nAttempting connection using existing Prisma client & @prisma/adapter-pg...");
        await prisma.$queryRaw`SELECT 1 as connection_test`;
        console.log("[SUCCESS] Database connection established successfully.\n");

        // 3. Inspect existing public tables
        const tables: TableInfo[] = await prisma.$queryRaw`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `;

        const tableNames = tables.map((t) => t.table_name.toLowerCase());
        console.log(`Found ${tableNames.length} tables in public schema:`);
        console.log(tableNames.join(", "));

        // 4. Check core Swastya tables and record counts
        console.log("\n--- Table Verification and Record Counts (Read-Only) ---");
        const coreTables = [
            "users",
            "donors",
            "bloodrequests",
            "donationhistory",
            "notification",
            "bloodbanks",
            "hospitals",
            "requesters",
            "inventory",
            "prescription",
            "hospitalcoordination",
            "requeststatushistory",
        ];

        for (const tableName of coreTables) {
            const exists = tableNames.includes(tableName.toLowerCase());
            if (!exists) {
                console.log(`[MISSING] Table '${tableName}' does not exist in the database.`);
                continue;
            }

            try {
                // Safe read-only count query
                const countResult: any[] = await prisma.$queryRawUnsafe(
                    `SELECT COUNT(*)::int as count FROM "${tableName}"`
                );
                const count = countResult[0]?.count ?? 0;
                console.log(`[OK] Table '${tableName}': ${count} records present`);
            } catch (err: any) {
                console.log(`[QUERY_ERROR] Table '${tableName}': Could not read count (${err.message})`);
            }
        }

        console.log("\n[SUCCESS] Read-only database connectivity and schema check completed.");
    } catch (err: any) {
        console.error("\n[CONNECTION_FAILED] Database connection attempt failed.");
        const errMsg = err.message || String(err);

        // Sanitize error message to avoid printing credentials
        const sanitizedMsg = errMsg.replace(/postgresql:\/\/[^@]+@/gi, "postgresql://[REDACTED_USER_PASSWORD]@");

        if (sanitizedMsg.includes("SCRAM-SERVER-FIRST-MESSAGE") || sanitizedMsg.includes("password")) {
            console.log("ERROR_CATEGORY: AuthenticationFailed / MissingPassword");
        } else if (sanitizedMsg.includes("ECONNREFUSED")) {
            console.log("ERROR_CATEGORY: ConnectionRefused / ServerOffline");
        } else if (sanitizedMsg.includes("does not exist")) {
            console.log("ERROR_CATEGORY: DatabaseNotFound");
        } else {
            console.log("ERROR_CATEGORY: UnknownConnectionError");
        }
        console.log("DETAILS:", sanitizedMsg);
    } finally {
        await prisma.$disconnect();
    }
}

runDatabaseCheck().catch((err) => {
    console.error("Script execution failed:", err.message);
});
