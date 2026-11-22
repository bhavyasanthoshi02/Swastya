import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { prisma } from "../src/config/prisma";

async function apply() {
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe(
        "SELECT current_database()"
    );
    const currentDb = dbCheck[0]?.current_database || "";
    if (currentDb !== "swastya_test") {
        throw new Error(`SAFETY ABORT: Expected swastya_test database, got "${currentDb}"`);
    }
    console.log(`[DB Guard] Verified target database: ${currentDb}`);

    const duplicates: any[] = await prisma.$queryRawUnsafe(`
        SELECT requestid, count(*) 
        FROM emergencyschedulerjobs 
        WHERE status IN ('PENDING', 'PROCESSING') 
        GROUP BY requestid 
        HAVING count(*) > 1;
    `);
    console.log("[Duplicate Open Jobs Found]", duplicates);

    if (duplicates.length > 0) {
        // Cancel redundant older open jobs for the same request, retaining the latest one
        await prisma.$executeRawUnsafe(`
            WITH ranked_jobs AS (
                SELECT jobid,
                       ROW_NUMBER() OVER (PARTITION BY requestid ORDER BY scheduledfor DESC, createdat DESC) as rn
                FROM emergencyschedulerjobs
                WHERE status IN ('PENDING', 'PROCESSING')
            )
            UPDATE emergencyschedulerjobs
            SET status = 'CANCELLED',
                lasterror = 'Deduplicated: superseded by newer open job'
            WHERE jobid IN (SELECT jobid FROM ranked_jobs WHERE rn > 1);
        `);
        console.log("[Duplicate Resolution] Redundant open jobs cancelled.");
    }

    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_open_scheduler_job_per_request
        ON emergencyschedulerjobs (requestid)
        WHERE status IN ('PENDING', 'PROCESSING');
    `);

    const indexes: Array<{ indexname: string; indexdef: string }> = await prisma.$queryRawUnsafe(`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'emergencyschedulerjobs' AND indexname = 'uq_open_scheduler_job_per_request';
    `);
    console.log("[Index Verified]", indexes);
}

apply()
    .then(async () => {
        await prisma.$disconnect();
        console.log("Migration successful.");
    })
    .catch(async (err) => {
        console.error("Migration failed:", err);
        await prisma.$disconnect();
        process.exit(1);
    });
