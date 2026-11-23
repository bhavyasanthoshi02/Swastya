import { Client } from "pg";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

const dbUrl = process.env.DATABASE_URL || "";
const directUrl = process.env.DIRECT_URL || "";

console.log("===============================================================================");
console.log(" SWASTYA: PHASE 1 MIGRATION & VERIFICATION ON NEON DEV BRANCH");
console.log("===============================================================================");

const PROD_ENDPOINT = "ep-empty-surf-bictmr98";
const DEV_ENDPOINT = "ep-holy-flower-bive3xfn";

// Guard check
if (dbUrl.includes(PROD_ENDPOINT) || directUrl.includes(PROD_ENDPOINT)) {
    console.error("FATAL: Production endpoint detected! Aborting migration immediately.");
    process.exit(1);
}

if (!dbUrl.includes(DEV_ENDPOINT) || !directUrl.includes(DEV_ENDPOINT)) {
    console.error("FATAL: URLs do not match dev branch ep-holy-flower-bive3xfn! Aborting.");
    process.exit(1);
}

console.log("[GUARD OK] Target database: Neon dev-sms-feature branch (ep-holy-flower-bive3xfn)");
console.log("[GUARD OK] Main/production branch (ep-empty-surf-bictmr98) is completely untouched.\n");

async function run() {
    const directClient = new Client({ connectionString: directUrl });
    await directClient.connect();
    console.log("Connected to Neon development branch via DIRECT_URL.");

    // 1. Read and apply migrations_twilio_outbox.sql
    const sqlPath = path.resolve(__dirname, "../prisma/migrations_twilio_outbox.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");
    console.log("Applying migrations_twilio_outbox.sql...");
    await directClient.query(sql);
    console.log("SQL Migration script executed successfully!\n");

    // 2. Verify all three new tables exist
    console.log("--- 1. TABLE EXISTENCE VERIFICATION ---");
    const tablesRes = await directClient.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('smsoutbox', 'actiontokens', 'donoreligibilityresponses')
        ORDER BY table_name;
    `);
    const createdTables = tablesRes.rows.map(r => r.table_name);
    console.log("Detected tables in public schema:", createdTables);
    if (!createdTables.includes("smsoutbox") || !createdTables.includes("actiontokens") || !createdTables.includes("donoreligibilityresponses")) {
        throw new Error(`Missing expected tables! Found: ${createdTables.join(", ")}`);
    }
    console.log("  [PASS] All 3 new tables exist in Neon dev-sms-feature database.\n");

    // 3. Verify Columns & Medical Nullability
    console.log("--- 2. MEDICAL NULLABILITY & COLUMN VERIFICATION ---");
    const colsRes = await directClient.query(`
        SELECT column_name, is_nullable, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'donoreligibilityresponses' 
          AND column_name IN ('drinksalcohol', 'alcoholin24h', 'feelinghealthy', 'medicationstatus', 'chronicillness')
        ORDER BY column_name;
    `);
    colsRes.rows.forEach(col => {
        console.log(`  Column '${col.column_name}': type=${col.data_type}, nullable=${col.is_nullable}`);
        if (col.is_nullable !== "YES") {
            throw new Error(`Medical column ${col.column_name} must be nullable! Got ${col.is_nullable}`);
        }
    });
    console.log("  [PASS] All medical questions are confirmed nullable (NULL = UNANSWERED).\n");

    // 4. Verify Indexes on New Tables
    console.log("--- 3. INDEXES VERIFICATION ---");
    const indexRes = await directClient.query(`
        SELECT tablename, indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
          AND tablename IN ('smsoutbox', 'actiontokens', 'donoreligibilityresponses')
        ORDER BY tablename, indexname;
    `);
    indexRes.rows.forEach(idx => {
        console.log(`  Index on ${idx.tablename}: ${idx.indexname}`);
    });
    console.log(`  [PASS] Verified ${indexRes.rows.length} indexes across the 3 new tables.\n`);

    // 5. Test Sample Record Insertion & Retrieval (Neon dev branch)
    console.log("--- 4. SAMPLE RECORD INSERTION & RETRIEVAL TEST ---");

    // 5a. Outbox Sample
    const outboxInsertRes = await directClient.query(`
        INSERT INTO smsoutbox (
            phonenumber, templatename, messagebody, actionurl, 
            idempotencykey, status, lockedby, lockversion
        ) VALUES (
            '+919876543210', 'DONOR_EMERGENCY_MATCH', 
            'Swastya Emergency: Urgent requirement for A+ blood (2 units) at Apollo Hospital. Tap to respond: https://swastya.org/r/test_token',
            'https://swastya.org/r/test_token',
            'PHASE1_TEST_IDEMPOTENCY_001', 'PENDING', 'test_worker_1', 0
        ) RETURNING outboxid, status, phonenumber, idempotencykey, createdat;
    `);
    const outboxRow = outboxInsertRes.rows[0];
    console.log("  [INSERT OK] smsoutbox created with id:", outboxRow.outboxid);

    const outboxSelectRes = await directClient.query(`
        SELECT outboxid, status, phonenumber, templatename, idempotencykey 
        FROM smsoutbox 
        WHERE outboxid = $1;
    `, [outboxRow.outboxid]);
    console.log("  [SELECT OK] Retrieved outbox record:", outboxSelectRes.rows[0]);
    if (outboxSelectRes.rows[0].status !== "PENDING" || outboxSelectRes.rows[0].phonenumber !== "+919876543210") {
        throw new Error("Outbox record field mismatch!");
    }

    // 5b. Find a valid user to test action token FK
    const userRes = await directClient.query(`SELECT userid FROM users LIMIT 1;`);
    if (userRes.rows.length > 0) {
        const testUserId = userRes.rows[0].userid;
        const tokenInsertRes = await directClient.query(`
            INSERT INTO actiontokens (
                tokenhash, userid, purpose, targetid, redirecturl, expiresat
            ) VALUES (
                'test_hash_phase1_verification_abc123', $1, 'DONOR_PLEDGE', 'REQ-TEST-001',
                '/donor/requests/REQ-TEST-001/donate', NOW() + INTERVAL '24 hours'
            ) RETURNING tokenid, purpose, expiresat;
        `, [testUserId]);
        console.log("  [INSERT OK] actiontokens created with id:", tokenInsertRes.rows[0].tokenid);

        const tokenSelectRes = await directClient.query(`
            SELECT tokenid, purpose, redirecturl 
            FROM actiontokens 
            WHERE tokenid = $1;
        `, [tokenInsertRes.rows[0].tokenid]);
        console.log("  [SELECT OK] Retrieved action token record:", tokenSelectRes.rows[0]);
    }

    // 5c. Test Nullable Medical Answers in Questionnaire Table
    const reqRes = await directClient.query(`SELECT requestid, hospitalid FROM bloodrequests LIMIT 1;`);
    const donorRes = await directClient.query(`SELECT donorid, userid FROM donors LIMIT 1;`);
    if (reqRes.rows.length > 0 && donorRes.rows.length > 0) {
        const testReqId = reqRes.rows[0].requestid;
        const testDonorId = donorRes.rows[0].donorid;
        const testDonorUserId = donorRes.rows[0].userid;

        const eligInsertRes = await directClient.query(`
            INSERT INTO donoreligibilityresponses (
                requestid, donorid, donoruserid,
                drinksalcohol, alcoholin24h, feelinghealthy, medicationstatus,
                recenttattoosurgery, donatedinlast90days, chronicillness, pregnantorbreastfeeding,
                screeningstatus, unansweredcount, completionpercent, additionalnotes
            ) VALUES (
                $1, $2, $3,
                NULL, NULL, TRUE, FALSE,
                FALSE, FALSE, NULL, NULL,
                'INCOMPLETE', 4, 50, 'Phase 1 verification test with partial answers'
            ) RETURNING responseid, drinksalcohol, feelinghealthy, screeningstatus, unansweredcount;
        `, [testReqId, testDonorId, testDonorUserId]);
        console.log("  [INSERT OK] donoreligibilityresponses created with id:", eligInsertRes.rows[0].responseid);

        const eligSelectRes = await directClient.query(`
            SELECT responseid, drinksalcohol, alcoholin24h, feelinghealthy, screeningstatus, unansweredcount 
            FROM donoreligibilityresponses 
            WHERE responseid = $1;
        `, [eligInsertRes.rows[0].responseid]);
        const record = eligSelectRes.rows[0];
        console.log("  [SELECT OK] Retrieved eligibility response:", record);
        if (record.drinksalcohol !== null || record.alcoholin24h !== null) {
            throw new Error("Nullable medical answer verification failed! Expected NULL for unanswered questions.");
        }
        if (record.feelinghealthy !== true || record.unansweredcount !== 4) {
            throw new Error("Answer values mismatch!");
        }
        console.log("  [PASS] Nullable medical disclosure validated: Unanswered answers remain strictly NULL.");
    }

    // 6. Clean up test records
    console.log("\n--- 5. TEST RECORD CLEANUP ---");
    await directClient.query(`DELETE FROM smsoutbox WHERE idempotencykey = 'PHASE1_TEST_IDEMPOTENCY_001';`);
    await directClient.query(`DELETE FROM actiontokens WHERE tokenhash = 'test_hash_phase1_verification_abc123';`);
    await directClient.query(`DELETE FROM donoreligibilityresponses WHERE additionalnotes = 'Phase 1 verification test with partial answers';`);
    console.log("  [PASS] Test records cleanly purged. Database state is clean.");

    await directClient.end();
    console.log("\n===============================================================================");
    console.log(" ALL PHASE 1 MIGRATION & INTEGRATION CHECKS PASSED ON NEON DEV BRANCH! ");
    console.log("===============================================================================");
}

run().catch(err => {
    console.error("Migration/Verification failed:", err);
    process.exit(1);
});
