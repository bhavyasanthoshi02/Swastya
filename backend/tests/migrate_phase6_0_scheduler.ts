import { prisma } from "../src/config/prisma";

export async function migratePhase6Scheduler() {
    console.log("Applying non-destructive Phase 6.0 emergency scheduler schema changes...");

    // Create emergencyschedulerjobs table
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS emergencyschedulerjobs (
            jobid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            requestid UUID NOT NULL REFERENCES bloodrequests(requestid) ON DELETE CASCADE,
            jobtype VARCHAR(50) NOT NULL DEFAULT 'FOLLOW_UP_ESCALATION',
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            scheduledfor TIMESTAMP(6) NOT NULL,
            lockeduntil TIMESTAMP(6),
            lockedby VARCHAR(100),
            attemptcount INT NOT NULL DEFAULT 0,
            maxattempts INT NOT NULL DEFAULT 5,
            lasterror TEXT,
            idempotencykey VARCHAR(255) UNIQUE,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            completedat TIMESTAMP(6)
        );
    `);

    // Indexes for fast worker claiming and request lookups
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_claim ON emergencyschedulerjobs(status, scheduledfor);
        CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_request ON emergencyschedulerjobs(requestid);
        CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_status ON emergencyschedulerjobs(status);
    `);

    console.log("Created emergencyschedulerjobs table and indexes successfully.");
}

if (require.main === module || process.argv[1]?.endsWith("migrate_phase6_0_scheduler.ts")) {
    migratePhase6Scheduler()
        .then(() => {
            console.log("Phase 6.0 migration completed successfully.");
            process.exit(0);
        })
        .catch((err) => {
            console.error("Phase 6.0 migration failed:", err);
            process.exit(1);
        });
}
