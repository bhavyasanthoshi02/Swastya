import { prisma } from "../src/config/prisma";

async function migrate() {
    console.log("Applying Phase 5.7 schema adjustments...");

    // 1. Make requestid nullable in donationhistory
    await prisma.$queryRawUnsafe(`
        ALTER TABLE donationhistory ALTER COLUMN requestid DROP NOT NULL;
    `);
    console.log("-> donationhistory.requestid is now nullable");

    // 2. Add isimported, sourcerecordid, bloodcomponent, verificationstatus to donationhistory if not present
    await prisma.$queryRawUnsafe(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'donationhistory' AND column_name = 'isimported') THEN
                ALTER TABLE donationhistory ADD COLUMN isimported BOOLEAN DEFAULT FALSE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'donationhistory' AND column_name = 'sourcerecordid') THEN
                ALTER TABLE donationhistory ADD COLUMN sourcerecordid VARCHAR(100);
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'donationhistory' AND column_name = 'bloodcomponent') THEN
                ALTER TABLE donationhistory ADD COLUMN bloodcomponent blood_component DEFAULT 'WHOLE_BLOOD';
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'donationhistory' AND column_name = 'verificationstatus') THEN
                ALTER TABLE donationhistory ADD COLUMN verificationstatus verification_status DEFAULT 'PENDING';
            END IF;
        END $$;
    `);
    console.log("-> donationhistory historical columns verified/added");

    // 3. Create hospitaldonors table
    await prisma.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS hospitaldonors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            hospitalid UUID NOT NULL REFERENCES hospitals(hospitalid) ON DELETE CASCADE,
            donorid UUID NOT NULL REFERENCES donors(donorid) ON DELETE CASCADE,
            sourceidentifier VARCHAR(100),
            status VARCHAR(50) DEFAULT 'ACTIVE',
            createdat TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_hospital_donor UNIQUE(hospitalid, donorid)
        );
    `);
    console.log("-> hospitaldonors table verified/created");

    // 4. Create donoractivationtokens table
    await prisma.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS donoractivationtokens (
            tokenid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            userid UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
            tokenhash VARCHAR(255) NOT NULL,
            expiresat TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            usedat TIMESTAMP WITHOUT TIME ZONE,
            createdat TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("-> donoractivationtokens table verified/created");

    console.log("Phase 5.7 schema migration finished successfully!");
}

migrate()
    .catch((err) => {
        console.error("Migration error:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
