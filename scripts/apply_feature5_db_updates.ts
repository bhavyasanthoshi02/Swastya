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
        console.log("1. Checking donationcamps starttime and endtime data types...");
        const timeCols = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'donationcamps' AND column_name IN ('starttime', 'endtime');
        `);
        const needsTimeAlter = timeCols.rows.some((r) => r.data_type !== "time without time zone");
        if (needsTimeAlter) {
            console.log("   -> Altering donationcamps starttime and endtime to TIME(6)...");
            await client.query(`
                ALTER TABLE "donationcamps" 
                ALTER COLUMN "starttime" TYPE TIME(6) USING "starttime"::time,
                ALTER COLUMN "endtime" TYPE TIME(6) USING "endtime"::time;
            `);
            console.log("   -> donationcamps time fields successfully converted to TIME(6).");
        } else {
            console.log("   -> donationcamps time fields already TIME(6), skipping alter.");
        }

        console.log("2. Adding attendanceupdatedbyuserid to campregistrations if not exists...");
        await client.query(`
            ALTER TABLE "campregistrations" 
            ADD COLUMN IF NOT EXISTS "attendanceupdatedbyuserid" UUID;
        `);

        console.log("3. Adding cancellationhistory to campregistrations if not exists...");
        await client.query(`
            ALTER TABLE "campregistrations" 
            ADD COLUMN IF NOT EXISTS "cancellationhistory" JSONB DEFAULT '[]'::jsonb;
        `);

        console.log("4. Ensuring foreign key fk_campreg_attendance_updater...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_campreg_attendance_updater'
                ) THEN
                    ALTER TABLE "campregistrations"
                    ADD CONSTRAINT "fk_campreg_attendance_updater"
                    FOREIGN KEY ("attendanceupdatedbyuserid") REFERENCES "users"("userid")
                    ON DELETE SET NULL ON UPDATE NO ACTION;
                END IF;
            END
            $$;
        `);

        console.log("5. Ensuring index idx_campreg_attendance_updater...");
        await client.query(`
            CREATE INDEX IF NOT EXISTS "idx_campreg_attendance_updater" 
            ON "campregistrations"("attendanceupdatedbyuserid");
        `);

        console.log("6. Ensuring unique constraint on campregistrations(registrationreference)...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'campregistrations_registrationreference_key'
                ) THEN
                    ALTER TABLE "campregistrations"
                    ADD CONSTRAINT "campregistrations_registrationreference_key"
                    UNIQUE ("registrationreference");
                END IF;
            END
            $$;
        `);

        console.log("7. Ensuring unique constraint on campregistrations(campid, donorid)...");
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_camp_donor_registration'
                ) THEN
                    ALTER TABLE "campregistrations"
                    ADD CONSTRAINT "uq_camp_donor_registration"
                    UNIQUE ("campid", "donorid");
                END IF;
            END
            $$;
        `);

        console.log("ALL FEATURE 5 DDL UPDATES SUCCESSFULLY VERIFIED AND SYNCHRONIZED ON SWASTYA_TEST!");
    } catch (err) {
        console.error("Migration error:", err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runUpdates();
