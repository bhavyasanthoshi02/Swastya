import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl || !dbUrl.includes("swastya_test") || dbUrl.includes("neon.tech")) {
    console.error("ABORT: Target database must be strictly swastya_test! Got:", dbUrl);
    process.exit(1);
}

async function runUpdates() {
    console.log("Connecting to target database:", dbUrl);
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    try {
        console.log("1. Checking enum notification_type for 'CAMP' value...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum e
                    JOIN pg_type t ON e.enumtypid = t.oid
                    WHERE t.typname = 'notification_type' AND e.enumlabel = 'CAMP'
                ) THEN
                    ALTER TYPE "notification_type" ADD VALUE 'CAMP';
                END IF;
            END
            $$;
        `);
        console.log("   -> enum notification_type 'CAMP' value ensured.");

        console.log("2. Adding campid to notification table if not exists...");
        await client.query(`
            ALTER TABLE "notification" 
            ADD COLUMN IF NOT EXISTS "campid" UUID;
        `);

        console.log("3. Adding registrationid to notification table if not exists...");
        await client.query(`
            ALTER TABLE "notification" 
            ADD COLUMN IF NOT EXISTS "registrationid" UUID;
        `);

        console.log("4. Adding actionurl to notification table if not exists...");
        await client.query(`
            ALTER TABLE "notification" 
            ADD COLUMN IF NOT EXISTS "actionurl" VARCHAR(255);
        `);

        console.log("5. Adding idempotencykey to notification table if not exists...");
        await client.query(`
            ALTER TABLE "notification" 
            ADD COLUMN IF NOT EXISTS "idempotencykey" VARCHAR(255);
        `);

        console.log("6. Ensuring unique constraint on notification(idempotencykey)...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_notification_idempotencykey'
                ) THEN
                    ALTER TABLE "notification"
                    ADD CONSTRAINT "uq_notification_idempotencykey"
                    UNIQUE ("idempotencykey");
                END IF;
            END
            $$;
        `);

        console.log("7. Ensuring foreign key fk_notification_camp...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_camp'
                ) THEN
                    ALTER TABLE "notification"
                    ADD CONSTRAINT "fk_notification_camp"
                    FOREIGN KEY ("campid") REFERENCES "donationcamps"("campid")
                    ON DELETE SET NULL ON UPDATE NO ACTION;
                END IF;
            END
            $$;
        `);

        console.log("8. Ensuring foreign key fk_notification_camp_reg...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_camp_reg'
                ) THEN
                    ALTER TABLE "notification"
                    ADD CONSTRAINT "fk_notification_camp_reg"
                    FOREIGN KEY ("registrationid") REFERENCES "campregistrations"("registrationid")
                    ON DELETE SET NULL ON UPDATE NO ACTION;
                END IF;
            END
            $$;
        `);

        console.log("9. Ensuring indexes on notification(campid, registrationid)...");
        await client.query(`
            CREATE INDEX IF NOT EXISTS "idx_notification_camp" ON "notification"("campid");
            CREATE INDEX IF NOT EXISTS "idx_notification_camp_reg" ON "notification"("registrationid");
        `);

        console.log("10. Creating donornotificationpreferences table if not exists...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS "donornotificationpreferences" (
                "preferenceid" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "donorid" UUID NOT NULL UNIQUE,
                "nearbycamps" BOOLEAN NOT NULL DEFAULT true,
                "campreminders" BOOLEAN NOT NULL DEFAULT true,
                "campupdates" BOOLEAN NOT NULL DEFAULT true,
                "campcancellations" BOOLEAN NOT NULL DEFAULT true,
                "preferredcity" VARCHAR(100),
                "preferredradiuskm" INT DEFAULT 25,
                "createdat" TIMESTAMP(6) DEFAULT now(),
                "updatedat" TIMESTAMP(6) DEFAULT now(),
                CONSTRAINT "fk_donor_notif_pref" FOREIGN KEY ("donorid") REFERENCES "donors"("donorid") ON DELETE CASCADE ON UPDATE NO ACTION
            );
            CREATE INDEX IF NOT EXISTS "idx_donor_notif_pref_donor" ON "donornotificationpreferences"("donorid");
        `);
        console.log("   -> donornotificationpreferences table ensured.");

        console.log("ALL FEATURE 7 DATABASE UPDATES COMPLETED SUCCESSFULLY!");
    } catch (err) {
        console.error("Database update error:", err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runUpdates();
