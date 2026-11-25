import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const colsRes = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const dbSchema: Record<string, string[]> = {};
  for (const row of colsRes.rows) {
    if (!dbSchema[row.table_name]) {
      dbSchema[row.table_name] = [];
    }
    dbSchema[row.table_name].push(row.column_name);
  }

  console.log("=== NEON DATABASE TABLES & COLUMNS ===");
  console.log("Total tables in Neon:", Object.keys(dbSchema).length);

  for (const [table, cols] of Object.entries(dbSchema)) {
    console.log(`\nTable [${table}] (${cols.length} cols):`);
    console.log("  " + cols.join(", "));
  }

  await client.end();
}

main().catch(console.error);
