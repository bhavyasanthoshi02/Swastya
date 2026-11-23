import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Client } from "pg";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function verifyFullPrismaNeonSync() {
  console.log("=== COMPREHENSIVE PRISMA SCHEMA VS NEON CLOUD SYNC AUDIT ===");

  const prismaSchemaContent = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf-8");

  // Parse models from Prisma schema
  const modelRegex = /model\s+(\w+)\s+{([^}]+)}/g;
  const prismaModels: Record<string, { tableName: string; fields: string[] }> = {};

  // First collect all model names
  const allModelNames = new Set<string>();
  let modelNameMatch;
  const nameRegex = /model\s+(\w+)\s+{/g;
  while ((modelNameMatch = nameRegex.exec(prismaSchemaContent)) !== null) {
    allModelNames.add(modelNameMatch[1].toLowerCase());
  }

  let match;
  while ((match = modelRegex.exec(prismaSchemaContent)) !== null) {
    const modelName = match[1];
    const body = match[2];

    // Check for @@map("...")
    const mapMatch = body.match(/@@map\("([^"]+)"\)/);
    const tableName = mapMatch ? mapMatch[1] : modelName.toLowerCase();

    const fields: string[] = [];
    const lines = body.split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;

      const parts = line.split(/\s+/);
      const fieldName = parts[0];
      const fieldType = (parts[1] || "").replace(/[?\[\]]/g, "").toLowerCase();

      // Skip directives
      if (fieldName.startsWith("@")) continue;

      // Skip relation fields
      if (line.includes("@relation")) continue;
      if (line.includes("[]")) continue;
      if (allModelNames.has(fieldType)) continue;

      fields.push(fieldName.toLowerCase());
    }

    prismaModels[modelName] = { tableName: tableName.toLowerCase(), fields };
  }

  console.log(`Parsed ${Object.keys(prismaModels).length} models from schema.prisma.\n`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const colsRes = await client.query(`
    SELECT LOWER(table_name) as table_name, LOWER(column_name) as column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const neonSchema: Record<string, Set<string>> = {};
  for (const row of colsRes.rows) {
    if (!neonSchema[row.table_name]) {
      neonSchema[row.table_name] = new Set();
    }
    neonSchema[row.table_name].add(row.column_name);
  }

  let allModelsSynced = true;
  let totalMissingCols = 0;
  const results: Array<{ model: string; table: string; status: string; missingFields: string }> = [];

  for (const [modelName, info] of Object.entries(prismaModels)) {
    const tableCols = neonSchema[info.tableName];

    if (!tableCols) {
      allModelsSynced = false;
      results.push({
        model: modelName,
        table: info.tableName,
        status: "MISSING TABLE",
        missingFields: "Entire table missing",
      });
      continue;
    }

    const missingInDb = info.fields.filter((f) => !tableCols.has(f));

    if (missingInDb.length > 0) {
      allModelsSynced = false;
      totalMissingCols += missingInDb.length;
      results.push({
        model: modelName,
        table: info.tableName,
        status: "COLUMN MISMATCH",
        missingFields: missingInDb.join(", "),
      });
    } else {
      results.push({
        model: modelName,
        table: info.tableName,
        status: "SYNCED",
        missingFields: "None",
      });
    }
  }

  console.table(results);

  console.log(`\nAudit Summary:`);
  console.log(`- Total Prisma Models Checked: ${Object.keys(prismaModels).length}`);
  console.log(`- Total Neon Tables in public schema: ${Object.keys(neonSchema).length}`);
  console.log(`- Synchronized Models: ${results.filter((r) => r.status === "SYNCED").length}`);
  console.log(`- Mismatched Models: ${results.filter((r) => r.status !== "SYNCED").length}`);

  if (!allModelsSynced) {
    console.error(`\nSCHEMA MISMATCH DETECTED: ${totalMissingCols} missing columns/tables found!`);
  } else {
    console.log(`\n>>> FULL SCHEMA VERIFICATION: 100% SYNCHRONIZED ACROSS ALL MODELS! <<<`);
  }

  await client.end();
}

verifyFullPrismaNeonSync().catch(console.error);
