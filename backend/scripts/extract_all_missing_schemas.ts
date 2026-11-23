import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";
import fs from "fs";

async function generateDDL() {
  const testEnv = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../.env.test")));
  const localClient = new Client({ connectionString: testEnv.DATABASE_URL });
  await localClient.connect();

  const missingTables = [
    'donationcamps',
    'campregistrations',
    'campaudithistory',
    'campstatushistory',
    'donornotificationpreferences',
    'equipmentcategories',
    'equipment',
    'equipmentcalibrations',
    'equipmentmaintenance',
    'equipmentbreakdowns',
    'equipmentstatushistory',
    'requestdocuments',
    'documentverifications',
    'documentreviewaudit'
  ];

  let fullDDL = "-- ========================================================\n";
  fullDDL += "-- AUTOMATICALLY EXTRACTED SCHEMA FOR SWASTYA FEATURES ON NEON\n";
  fullDDL += "-- ========================================================\n\n";

  // Also missing columns on existing tables
  fullDDL += 'ALTER TABLE "bloodrequests" ADD COLUMN IF NOT EXISTS "isdraft" BOOLEAN DEFAULT false;\n';
  fullDDL += 'ALTER TABLE "procedurebloodconfigs" ADD COLUMN IF NOT EXISTS "guidelinecitation" VARCHAR(500);\n';
  fullDDL += 'ALTER TABLE "procedurebloodconfigs" ADD COLUMN IF NOT EXISTS "requireshospitalapproval" BOOLEAN DEFAULT false;\n\n';

  for (const table of missingTables) {
    const cols = (await localClient.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = '${table}' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `)).rows;

    if (cols.length === 0) continue;

    fullDDL += `CREATE TABLE IF NOT EXISTS "${table}" (\n`;
    const colDefs = cols.map(c => {
      let type = c.udt_name.toUpperCase();
      if (type === "VARCHAR" && c.character_maximum_length) {
        type = `VARCHAR(${c.character_maximum_length})`;
      } else if (type === "TIMESTAMPTZ") {
        type = "TIMESTAMP WITH TIME ZONE";
      } else if (type === "TIMESTAMP") {
        type = "TIMESTAMP(6)";
      } else if (type === "INT4") {
        type = "INTEGER";
      } else if (type === "INT8") {
        type = "BIGINT";
      } else if (type === "BOOL") {
        type = "BOOLEAN";
      } else if (type === "NUMERIC") {
        type = "NUMERIC";
      }
      let def = `  "${c.column_name}" ${type}`;
      if (c.column_default) {
        def += ` DEFAULT ${c.column_default}`;
      }
      if (c.is_nullable === "NO") {
        def += " NOT NULL";
      }
      return def;
    });

    // Check primary key
    const pkRes = await localClient.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = '${table}';
    `);
    if (pkRes.rows.length > 0) {
      const pkCols = pkRes.rows.map(r => `"${r.column_name}"`).join(", ");
      colDefs.push(`  PRIMARY KEY (${pkCols})`);
    }

    fullDDL += colDefs.join(",\n");
    fullDDL += "\n);\n\n";
  }

  const outPath = path.resolve(__dirname, "neon_alignment_all.sql");
  fs.writeFileSync(outPath, fullDDL);
  console.log(`Generated full DDL at ${outPath}`);

  await localClient.end();
}

generateDDL().catch(console.error);
