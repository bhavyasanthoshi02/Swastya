import dotenv from "dotenv";
import path from "path";
import { Client } from "pg";
import bcrypt from "bcrypt";

// Explicitly target Neon
process.env.SWASTYA_DB_TARGET = "neon";
const neonEnvPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: neonEnvPath, override: true });

async function main() {
  const rawUrl = process.env.DATABASE_URL || "";
  const parsed = new URL(rawUrl);
  console.log("=== NEON DATABASE CONNECTION DIAGNOSTIC ===");
  console.log(`Host: ${parsed.hostname}`);
  console.log(`Port: ${parsed.port || 5432}`);
  console.log(`Database: ${parsed.pathname.replace(/^\//, "")}`);
  console.log(`User: ${parsed.username}`);
  console.log(`SSL: require\n`);

  const client = new Client({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("--> Direct pg connection to Neon: SUCCESS\n");

    // 1. Connection & Session metadata
    const metaRes = await client.query(`
      SELECT 
        current_database() as db,
        current_user as db_user,
        version() as pg_version,
        inet_server_addr() as server_ip,
        inet_client_addr() as client_ip
    `);
    console.log("Database Metadata:", metaRes.rows[0]);

    // 2. Count tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log(`\nTotal tables in public schema: ${tableRes.rows.length}`);
    const tableNames = tableRes.rows.map(r => r.table_name);
    console.log("Tables list:", tableNames.join(", "));

    // 3. Inspect 'users' table columns
    const usersCols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    console.log("\n--- 'users' Table Columns ---");
    console.table(usersCols.rows);

    // 4. Inspect existing users (using pg query with real column names)
    const usersData = await client.query(`
      SELECT userid, name, email, role, phonenumber, isactive, emailverified, createdat,
             LENGTH(password) as hash_len,
             SUBSTRING(password, 1, 7) as hash_prefix
      FROM users
      ORDER BY createdat DESC
      LIMIT 15;
    `);
    console.log("\n--- Existing Users in Neon (Last 15) ---");
    console.table(usersData.rows);

    // 4b. Test Prisma client query on users!
    console.log("\n--- Testing Prisma client query on Neon ---");
    const { prisma } = await import("../backend/src/config/prisma");
    try {
      const prismaUsers = await prisma.users.findMany({ take: 3 });
      console.log("Prisma users.findMany succeeded! Count:", prismaUsers.length);
    } catch (prismaErr: any) {
      console.error("Prisma users.findMany FAILED! Error code:", prismaErr.code, "Message:", prismaErr.message);
    }

    // 5. Inspect role profile tables: donors, requesters, hospitals, bloodbanks
    for (const tbl of ["donors", "requesters", "hospitals", "bloodbanks"]) {
      if (tableNames.includes(tbl)) {
        const countRes = await client.query(`SELECT COUNT(*) as cnt FROM "${tbl}"`);
        console.log(`\nTable '${tbl}': ${countRes.rows[0].cnt} records`);
        const sampleRes = await client.query(`SELECT * FROM "${tbl}" LIMIT 2`);
        if (sampleRes.rows.length > 0) {
          console.log(`Sample columns from '${tbl}':`, Object.keys(sampleRes.rows[0]).join(", "));
        }
      } else {
        console.log(`\nTable '${tbl}': MISSING in Neon!`);
      }
    }

    // 6. Test a simulated transaction for Signup (with immediate ROLLBACK)
    console.log("\n--- Testing Signup Transaction Simulation (with ROLLBACK) ---");
    await client.query("BEGIN");
    try {
      const testEmail = `test_dryrun_${Date.now()}@swastya.org`;
      const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
      const testHash = await bcrypt.hash("TestPass123!", 10);

      // Insert into users
      const insertUserRes = await client.query(`
        INSERT INTO users (email, phone, passwordhash, role, isactive, emailverified, phoneverified)
        VALUES ($1, $2, $3, 'DONOR', true, true, false)
        RETURNING userid, email, role;
      `, [testEmail, testPhone, testHash]);
      const createdUserId = insertUserRes.rows[0].userid;
      console.log(`Created dry-run user in TX: ${createdUserId} (${testEmail})`);

      // Insert into donors
      if (tableNames.includes("donors")) {
        await client.query(`
          INSERT INTO donors (userid, bloodgroup, city, state, pincode, isavailable)
          VALUES ($1, 'O_POSITIVE', 'Indiranagar', 'Karnataka', '560038', true);
        `, [createdUserId]);
        console.log("Created dry-run donor profile in TX: SUCCESS");
      }

      await client.query("ROLLBACK");
      console.log("Dry-run Signup transaction rolled back cleanly. TEST PASSED!");
    } catch (txErr: any) {
      await client.query("ROLLBACK");
      console.error("Dry-run Signup transaction FAILED:", txErr.message);
    }

    // 7. Check Neon PgBouncer Stability (Run 20 consecutive lightweight queries)
    console.log("\n--- Testing Connection Stability (20 queries) ---");
    const startTime = Date.now();
    for (let i = 1; i <= 20; i++) {
      const qStart = Date.now();
      await client.query("SELECT 1;");
      const qDuration = Date.now() - qStart;
      if (i === 1 || i === 10 || i === 20) {
        console.log(`Query ${i}/20: OK (${qDuration}ms)`);
      }
    }
    console.log(`Total duration for 20 queries: ${Date.now() - startTime}ms (avg ${((Date.now() - startTime) / 20).toFixed(1)}ms/query)`);

  } catch (err: any) {
    console.error("FATAL Database Diagnostic Error:", err);
  } finally {
    await client.end();
  }
}

main();
