import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";
import fs from "fs";

async function main() {
  const testEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../.env.test")));
  const neonEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../.env")));

  const localClient = new Client({ connectionString: testEnv.DATABASE_URL });
  await localClient.connect();

  const neonClient = new Client({
    connectionString: neonEnv.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await neonClient.connect();

  console.log("=== 1. SYNCING MISSING ENUMS ===");
  const localEnumRows = (await localClient.query(`
    SELECT t.typname as enum_name, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder;
  `)).rows;

  const localEnumMap: Record<string, string[]> = {};
  for (const r of localEnumRows) {
    if (!localEnumMap[r.enum_name]) localEnumMap[r.enum_name] = [];
    localEnumMap[r.enum_name].push(r.enumlabel);
  }

  const neonEnumRows = (await neonClient.query(`
    SELECT t.typname as enum_name, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder;
  `)).rows;

  const neonEnumMap: Record<string, string[]> = {};
  for (const r of neonEnumRows) {
    if (!neonEnumMap[r.enum_name]) neonEnumMap[r.enum_name] = [];
    neonEnumMap[r.enum_name].push(r.enumlabel);
  }

  for (const [enumName, values] of Object.entries(localEnumMap)) {
    if (!neonEnumMap[enumName]) {
      console.log(`Creating ENUM ${enumName} with values: ${values.join(", ")}`);
      const valList = values.map(v => `'${v}'`).join(", ");
      await neonClient.query(`CREATE TYPE "${enumName}" AS ENUM (${valList});`);
    } else {
      const existingVals = neonEnumMap[enumName];
      for (const val of values) {
        if (!existingVals.includes(val)) {
          console.log(`Adding value '${val}' to ENUM ${enumName}`);
          await neonClient.query(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${val}';`);
        }
      }
    }
  }

  console.log("\n=== 2. APPLYING MISSING COLUMNS & TABLES ===");
  const ddlSql = fs.readFileSync(path.resolve(__dirname, "neon_alignment_all.sql"), "utf-8");
  await neonClient.query(ddlSql);
  console.log("Successfully applied all missing columns and tables to Neon!");

  // Ensure notification fk to donationcamps and campregistrations
  console.log("\n=== 3. ENSURING NOTIFICATION FOREIGN KEYS ===");
  await neonClient.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_camp') THEN
            ALTER TABLE "notification" ADD CONSTRAINT "fk_notification_camp" FOREIGN KEY ("campid") REFERENCES "donationcamps"("campid") ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notification_camp_reg') THEN
            ALTER TABLE "notification" ADD CONSTRAINT "fk_notification_camp_reg" FOREIGN KEY ("registrationid") REFERENCES "campregistrations"("registrationid") ON DELETE SET NULL;
        END IF;
    END $$;
  `);
  console.log("Notification foreign keys ensured!");

  // Verify total table count on Neon now
  const countRes = await neonClient.query(`
    SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'public';
  `);
  console.log(`\nTOTAL TABLES IN NEON NOW: ${countRes.rows[0].cnt}`);

  await localClient.end();
  await neonClient.end();
}

main().catch(console.error);
