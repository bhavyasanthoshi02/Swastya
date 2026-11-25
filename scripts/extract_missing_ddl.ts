import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";

async function extractMissingDDL() {
  const testEnv = dotenv.parse(require("fs").readFileSync(path.resolve(__dirname, "../.env.test")));
  const neonEnv = dotenv.parse(require("fs").readFileSync(path.resolve(__dirname, "../.env")));

  const localClient = new Client({
    connectionString: testEnv.DATABASE_URL
  });
  await localClient.connect();

  const neonClient = new Client({
    connectionString: neonEnv.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await neonClient.connect();

  const localTables = (await localClient.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
  `)).rows.map(r => r.table_name);

  const neonTables = (await neonClient.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
  `)).rows.map(r => r.table_name);

  const missingTables = localTables.filter(t => !neonTables.includes(t));
  console.log("=== MISSING TABLES IN NEON ===");
  console.log(missingTables);

  // Missing columns in existing tables
  console.log("\n=== MISSING COLUMNS IN COMMON TABLES ===");
  const missingColsByTable: Record<string, string[]> = {};
  for (const table of neonTables) {
    if (localTables.includes(table)) {
      const localCols = (await localClient.query(`
        SELECT column_name, data_type, is_nullable, column_default 
        FROM information_schema.columns 
        WHERE table_name = '${table}' AND table_schema = 'public';
      `)).rows;

      const neonCols = (await neonClient.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}' AND table_schema = 'public';
      `)).rows.map(r => r.column_name);

      for (const col of localCols) {
        if (!neonCols.includes(col.column_name)) {
          if (!missingColsByTable[table]) missingColsByTable[table] = [];
          missingColsByTable[table].push(`${col.column_name} (${col.data_type}, default: ${col.column_default})`);
        }
      }
    }
  }
  console.log(missingColsByTable);

  await localClient.end();
  await neonClient.end();
}

extractMissingDDL().catch(console.error);
