import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Client } from "pg";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function verifyAndCompare() {
  const rawUrl = process.env.DATABASE_URL || "";
  const parsed = new URL(rawUrl);

  console.log("=== STEP 1: RECONFIRM NEON CONNECTION ===");
  if (!parsed.hostname.includes("neon.tech") || parsed.pathname.replace(/^\//, "") !== "neondb") {
    throw new Error(`Target is not Neon neondb: ${parsed.hostname} / ${parsed.pathname}`);
  }
  console.log(`Verified Neon Host: ${parsed.hostname}`);
  console.log(`Verified Database: ${parsed.pathname.replace(/^\//, "")}`);

  console.log("\n=== STEP 2: VERIFY EXISTING BACKUP FILE ===");
  const backupDir = path.resolve(__dirname, "../backups");
  const files = fs.readdirSync(backupDir).filter(f => f.startsWith("neon_backup_") && f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error("No backup files found in backend/backups!");
  }
  const latestBackup = path.join(backupDir, files.sort().reverse()[0]);
  console.log(`Checking latest backup: ${latestBackup}`);
  const backupContent = JSON.parse(fs.readFileSync(latestBackup, "utf-8"));
  let totalBackupRecords = 0;
  for (const [tbl, rows] of Object.entries(backupContent)) {
    totalBackupRecords += (rows as any[]).length;
  }
  console.log(`Backup contains ${Object.keys(backupContent).length} tables and ${totalBackupRecords} total records.`);
  if (totalBackupRecords !== 188) {
    console.warn(`Warning: Expected 188 records, found ${totalBackupRecords}`);
  } else {
    console.log("Backup record count verified: Exactly 188 records.");
  }

  console.log("\n=== STEP 3: INSPECT SPECIFIC MISSING COLUMNS IN NEON ===");
  const client = new Client({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  // Inspect users columns
  const usersCols = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND table_schema = 'public';
  `)).rows.map(r => r.column_name);

  console.log("Neon 'users' columns:", usersCols);
  console.log("Missing 'isclinicalreviewer' in users?", !usersCols.includes("isclinicalreviewer"));
  console.log("Missing 'medicalcouncilregno' in users?", !usersCols.includes("medicalcouncilregno"));

  // Inspect notification columns
  const notifCols = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'notification' AND table_schema = 'public';
  `)).rows.map(r => r.column_name);

  console.log("\nNeon 'notification' columns:", notifCols);
  console.log("Missing 'campid' in notification?", !notifCols.includes("campid"));
  console.log("Missing 'registrationid' in notification?", !notifCols.includes("registrationid"));
  console.log("Missing 'actionurl' in notification?", !notifCols.includes("actionurl"));
  console.log("Missing 'idempotencykey' in notification?", !notifCols.includes("idempotencykey"));

  await client.end();
}

verifyAndCompare().catch(console.error);
