import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Client } from "pg";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const backupDir = path.resolve(__dirname, "../backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const tableRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  const backup: Record<string, any[]> = {};
  const stats: Record<string, number> = {};

  for (const row of tableRes.rows) {
    const tbl = row.table_name;
    const dataRes = await client.query(`SELECT * FROM "${tbl}"`);
    backup[tbl] = dataRes.rows;
    stats[tbl] = dataRes.rows.length;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `neon_backup_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf-8");

  console.log("=== NEON DATABASE BACKUP COMPLETED ===");
  console.log(`Saved to: ${backupFile}`);
  console.log("Record counts per table:");
  console.table(stats);

  await client.end();
}

main().catch(console.error);
