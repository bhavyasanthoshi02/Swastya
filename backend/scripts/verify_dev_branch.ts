import { Client } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

console.log("=== NEON BRANCH CONNECTION VERIFICATION ===");
console.log("DATABASE_URL Host:", new URL(dbUrl).host);
console.log("DIRECT_URL Host:  ", new URL(directUrl).host);

const PROD_ENDPOINT = "ep-empty-surf-bictmr98";
const DEV_ENDPOINT = "ep-holy-flower-bive3xfn";

if (dbUrl.includes(PROD_ENDPOINT) || directUrl.includes(PROD_ENDPOINT)) {
    console.error("FATAL ERROR: Connection URL contains production endpoint ep-empty-surf-bictmr98! Aborting.");
    process.exit(1);
}

if (!dbUrl.includes(DEV_ENDPOINT) || !directUrl.includes(DEV_ENDPOINT)) {
    console.error("FATAL ERROR: Connection URL does not point to dev-sms-feature branch ep-holy-flower-bive3xfn! Aborting.");
    process.exit(1);
}

console.log("PASS: Both connection strings strictly target development branch 'ep-holy-flower-bive3xfn'.");
console.log("PASS: Production database is fully shielded.");

async function testConnectivity() {
    console.log("\nTesting direct connection to Neon development branch...");
    const directClient = new Client({ connectionString: directUrl });
    await directClient.connect();
    const res1 = await directClient.query("SELECT current_database(), current_user, inet_server_addr(), version();");
    console.log("Direct connection successful!");
    console.log("  Database:", res1.rows[0].current_database);
    console.log("  User:    ", res1.rows[0].current_user);
    console.log("  Version: ", res1.rows[0].version.split(" on ")[0]);
    await directClient.end();

    console.log("\nTesting pooled connection to Neon development branch...");
    const pooledClient = new Client({ connectionString: dbUrl });
    await pooledClient.connect();
    const res2 = await pooledClient.query("SELECT count(*) as total_tables FROM information_schema.tables WHERE table_schema = 'public';");
    console.log("Pooled connection successful!");
    console.log("  Existing tables in public schema:", res2.rows[0].total_tables);
    await pooledClient.end();

    console.log("\nAll connection checks PASSED.");
}

testConnectivity().catch((err) => {
    console.error("Connectivity test failed:", err);
    process.exit(1);
});
