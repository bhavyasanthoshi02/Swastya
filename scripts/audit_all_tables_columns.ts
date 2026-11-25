import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Client } from "pg";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function checkAllColumns() {
  const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma");
  const schemaContent = fs.readFileSync(schemaPath, "utf-8");

  // Simple parser to extract model fields from schema.prisma
  const models: Record<string, string[]> = {};
  let currentModel: string | null = null;

  for (const line of schemaContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("model ")) {
      currentModel = trimmed.split(/\s+/)[1];
      models[currentModel] = [];
    } else if (trimmed === "}" && currentModel) {
      currentModel = null;
    } else if (currentModel && trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("@@")) {
      const parts = trimmed.split(/\s+/);
      const fieldName = parts[0];
      const fieldType = parts[1];
      // Only scalar or enum fields (not relations)
      if (fieldName && fieldType && !fieldType.includes("[]") && !/^[A-Z]/.test(fieldType) || ["blood_group","gender_type","user_role","urgency_level","blood_component","request_status","approval_status","availability_status","notification_type"].includes(fieldType)) {
        models[currentModel].push(fieldName);
      }
    }
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const colsRes = await client.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public';
  `);

  const dbTableCols: Record<string, string[]> = {};
  for (const r of colsRes.rows) {
    if (!dbTableCols[r.table_name]) dbTableCols[r.table_name] = [];
    dbTableCols[r.table_name].push(r.column_name);
  }

  console.log("=== COMPARISON FOR ALL 29 NEON TABLES ===");
  const missingByTable: Record<string, string[]> = {};

  for (const [table, dbCols] of Object.entries(dbTableCols)) {
    const prismaModelCols = models[table] || [];
    const missing = prismaModelCols.filter(col => !dbCols.includes(col));
    if (missing.length > 0) {
      missingByTable[table] = missing;
      console.log(`Table [${table}] is missing columns in Neon:`, missing);
    }
  }

  if (Object.keys(missingByTable).length === 0) {
    console.log("ALL OTHER TABLES MATCH 100%! No other missing columns found.");
  }

  await client.end();
}

checkAllColumns().catch(console.error);
