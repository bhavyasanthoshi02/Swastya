import { prisma } from "../src/config/prisma";

async function migratePhase2() {
    console.log("Applying non-destructive Phase 2 prescription schema changes...");

    // 1. Add optional file metadata columns to existing prescription table
    await prisma.$executeRawUnsafe(`
        ALTER TABLE prescription 
        ADD COLUMN IF NOT EXISTS originalfilename VARCHAR(255),
        ADD COLUMN IF NOT EXISTS mimetype VARCHAR(100),
        ADD COLUMN IF NOT EXISTS filesize INT;
    `);
    console.log("Added originalfilename, mimetype, filesize columns to prescription table.");

    // 2. Create prescriptionhistory table for replacement & audit event tracking
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS prescriptionhistory (
            historyid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            prescriptionid UUID NOT NULL REFERENCES prescription(prescriptionid) ON DELETE CASCADE,
            requestid UUID NOT NULL REFERENCES bloodrequests(requestid) ON DELETE CASCADE,
            fileurl TEXT NOT NULL,
            originalfilename VARCHAR(255),
            mimetype VARCHAR(100),
            filesize INT,
            status prescription_status NOT NULL,
            reviewedbyhospitalid UUID REFERENCES hospitals(hospitalid) ON DELETE SET NULL,
            remarks TEXT,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("Created prescriptionhistory table successfully.");

    console.log("Phase 2 database migration completed cleanly.");
}

migratePhase2()
    .catch((err) => {
        console.error("Migration failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
