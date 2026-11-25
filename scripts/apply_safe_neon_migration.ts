import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function applyMigration() {
  const rawUrl = process.env.DATABASE_URL || "";
  const parsed = new URL(rawUrl);

  console.log("=== APPLYING NON-DESTRUCTIVE SCHEMA ALIGNMENT TO NEON ===");
  console.log(`Host: ${parsed.hostname}`);
  console.log(`Database: ${parsed.pathname.replace(/^\//, "")}`);

  if (!parsed.hostname.includes("neon.tech") || parsed.pathname.replace(/^\//, "") !== "neondb") {
    throw new Error("Safety Guard Abort: Target is not Neon neondb!");
  }

  const client = new Client({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  // 1. Check pre-migration record count on users and notification
  const preUsersCount = (await client.query('SELECT COUNT(*) as cnt FROM "users"')).rows[0].cnt;
  const preNotifCount = (await client.query('SELECT COUNT(*) as cnt FROM "notification"')).rows[0].cnt;
  console.log(`Pre-migration row counts: users=${preUsersCount}, notification=${preNotifCount}`);

  // 2. Prepare SQL statements
  const statements = [
    {
      label: "Add isclinicalreviewer to users",
      sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isclinicalreviewer" BOOLEAN DEFAULT false;'
    },
    {
      label: "Add medicalcouncilregno to users",
      sql: 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "medicalcouncilregno" VARCHAR(100);'
    },
    {
      label: "Add campid to notification",
      sql: 'ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "campid" UUID;'
    },
    {
      label: "Add registrationid to notification",
      sql: 'ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "registrationid" UUID;'
    },
    {
      label: "Add actionurl to notification",
      sql: 'ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "actionurl" VARCHAR(255);'
    },
    {
      label: "Add idempotencykey to notification",
      sql: 'ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "idempotencykey" VARCHAR(255);'
    },
    {
      label: "Add uq_notification_idempotencykey unique constraint",
      sql: `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_notification_idempotencykey'
            ) THEN
                ALTER TABLE "notification" ADD CONSTRAINT "uq_notification_idempotencykey" UNIQUE ("idempotencykey");
            END IF;
        END $$;
      `
    }
  ];

  // 3. Execute in transaction
  console.log("\nExecuting statements in transaction...");
  await client.query("BEGIN;");
  try {
    for (const stmt of statements) {
      console.log(`Executing: ${stmt.label}...`);
      await client.query(stmt.sql);
      console.log(`  -> SUCCESS: ${stmt.label}`);
    }
    await client.query("COMMIT;");
    console.log("\nAll schema alignment statements committed successfully!");
  } catch (err: any) {
    await client.query("ROLLBACK;");
    throw new Error(`Migration failed and rolled back cleanly: ${err.message}`);
  }

  // 4. Verify post-migration counts and column existence
  const postUsersCount = (await client.query('SELECT COUNT(*) as cnt FROM "users"')).rows[0].cnt;
  const postNotifCount = (await client.query('SELECT COUNT(*) as cnt FROM "notification"')).rows[0].cnt;
  console.log(`Post-migration row counts: users=${postUsersCount}, notification=${postNotifCount}`);

  if (preUsersCount !== postUsersCount || preNotifCount !== postNotifCount) {
    throw new Error("DATA LOSS DETECTED! Record counts changed during migration!");
  }
  console.log("Integrity Verified: Record counts completely unchanged. Zero data lost.");

  // 5. Inspect users columns
  const usersCols = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND table_schema = 'public'
    ORDER BY ordinal_position;
  `)).rows;
  console.log("\n--- Updated 'users' Table Columns in Neon ---");
  console.table(usersCols);

  await client.end();
}

applyMigration().catch(console.error);
