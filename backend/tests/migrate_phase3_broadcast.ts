import { prisma } from "../src/config/prisma";

async function migratePhase3() {
    console.log("Applying non-destructive Phase 3 emergency broadcast schema changes...");

    // 1. Create emergencybroadcasts table
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS emergencybroadcasts (
            broadcastid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            requestid UUID NOT NULL REFERENCES bloodrequests(requestid) ON DELETE CASCADE,
            triggeredbyuserid UUID NOT NULL REFERENCES users(userid) ON DELETE NO ACTION,
            triggertype VARCHAR(50) NOT NULL,
            triggerreason TEXT,
            radiuskm INT NOT NULL DEFAULT 5,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            totalmatched INT NOT NULL DEFAULT 0,
            totalnotified INT NOT NULL DEFAULT 0,
            totalresponded INT NOT NULL DEFAULT 0,
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_emergencybroadcasts_request ON emergencybroadcasts(requestid);
        CREATE INDEX IF NOT EXISTS idx_emergencybroadcasts_status ON emergencybroadcasts(status);
    `);
    console.log("Created emergencybroadcasts table and indexes.");

    // 2. Create broadcastdeliveries table
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS broadcastdeliveries (
            deliveryid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            broadcastid UUID NOT NULL REFERENCES emergencybroadcasts(broadcastid) ON DELETE CASCADE,
            requestid UUID NOT NULL REFERENCES bloodrequests(requestid) ON DELETE CASCADE,
            donorid UUID NOT NULL REFERENCES donors(donorid) ON DELETE CASCADE,
            donoruserid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
            matchtype VARCHAR(50) NOT NULL,
            distancekm DECIMAL(6, 2),
            deliverystatus VARCHAR(50) NOT NULL DEFAULT 'DELIVERED',
            notificationid UUID REFERENCES notification(notificationid) ON DELETE SET NULL,
            attemptcount INT NOT NULL DEFAULT 1,
            firstattemptat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            lastattemptat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            failuremessage TEXT,
            response VARCHAR(50),
            respondedat TIMESTAMP(6),
            transitstatus VARCHAR(50),
            transitnotes TEXT,
            estimatedarrival VARCHAR(100),
            createdat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            updatedat TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_broadcast_donor UNIQUE (broadcastid, donorid)
        );
    `);
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_broadcastdeliveries_request ON broadcastdeliveries(requestid);
        CREATE INDEX IF NOT EXISTS idx_broadcastdeliveries_donor ON broadcastdeliveries(donorid);
        CREATE INDEX IF NOT EXISTS idx_broadcastdeliveries_donoruser ON broadcastdeliveries(donoruserid);
    `);
    await prisma.$executeRawUnsafe(`
        ALTER TABLE broadcastdeliveries ADD COLUMN IF NOT EXISTS startedat TIMESTAMP(6);
        ALTER TABLE broadcastdeliveries ADD COLUMN IF NOT EXISTS reachedat TIMESTAMP(6);
        ALTER TABLE broadcastdeliveries ADD COLUMN IF NOT EXISTS completedat TIMESTAMP(6);
    `);
    console.log("Created broadcastdeliveries table and indexes.");

    console.log("Phase 3 database migration completed successfully.");
}

migratePhase3()
    .catch((err) => {
        console.error("Migration failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
