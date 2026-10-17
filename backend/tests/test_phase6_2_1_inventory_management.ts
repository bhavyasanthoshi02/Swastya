import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component } from "../src/generated/prisma/enums";
import app from "../src/app";
import http from "http";
import crypto from "crypto";

let server: http.Server;
let API_BASE = "";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        throw new Error(message);
    }
    console.log(`[PASS] ${message}`);
    passedTests++;
}

async function getJson(endpoint: string, token: string) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
    });
    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, data: json, headers: res.headers };
}

async function postJson(endpoint: string, token: string, body: any, headers: Record<string, string> = {}) {
    const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...headers,
    };
    if (token) {
        reqHeaders["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(body),
    });
    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, data: json, headers: res.headers };
}

async function patchJson(endpoint: string, token: string, body: any, headers: Record<string, string> = {}) {
    const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...headers,
    };
    if (token) {
        reqHeaders["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "PATCH",
        headers: reqHeaders,
        body: JSON.stringify(body),
    });
    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, data: json, headers: res.headers };
}

async function runPhase621InventoryTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 6.2.1: INVENTORY MANAGEMENT API & AUDIT LEDGER TEST SUITE       ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();
    const testUserIds: string[] = [];
    const testBloodBankIds: string[] = [];

    // Start ephemeral server
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
            const port = (server.address() as any).port;
            API_BASE = `http://127.0.0.1:${port}`;
            console.log(`Ephemeral test server running at ${API_BASE}`);
            resolve();
        });
    });

    try {
        // Upfront isolation cleanup of prior stale test runs
        const staleUsers = await prisma.users.findMany({
            where: { email: { contains: "-p621-" } },
            select: { userid: true },
        });
        if (staleUsers.length > 0) {
            const staleUserIds = staleUsers.map((u) => u.userid);
            const staleBBs = await prisma.bloodbanks.findMany({
                where: { userid: { in: staleUserIds } },
                select: { bloodbankid: true },
            });
            const staleBBIds = staleBBs.map((b) => b.bloodbankid);
            if (staleBBIds.length > 0) {
                // Disable trigger for cleanup
                await prisma.$executeRawUnsafe(`ALTER TABLE inventoryledger DISABLE TRIGGER trg_prevent_ledger_update_delete;`).catch(() => {});
                await prisma.inventoryledger.deleteMany({ where: { bloodbankid: { in: staleBBIds } } }).catch(() => {});
                await prisma.inventory.deleteMany({ where: { bloodbankid: { in: staleBBIds } } }).catch(() => {});
                await prisma.bloodbanks.deleteMany({ where: { bloodbankid: { in: staleBBIds } } }).catch(() => {});
                await prisma.$executeRawUnsafe(`ALTER TABLE inventoryledger ENABLE TRIGGER trg_prevent_ledger_update_delete;`).catch(() => {});
            }
            await prisma.users.deleteMany({ where: { userid: { in: staleUserIds } } }).catch(() => {});
        }

        // --- Setup Test Entities ---
        // Blood Bank A
        const bbAUser = await prisma.users.create({
            data: {
                name: `Blood Bank User A ${timestamp}`,
                email: `bbA-p621-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        testUserIds.push(bbAUser.userid);
        const bbA = await prisma.bloodbanks.create({
            data: {
                userid: bbAUser.userid,
                bloodbankname: `Metro Blood Center A ${timestamp}`,
                licensenumber: `LIC-621-A-${timestamp}`,
                contactpersonname: "Dr. A. Sharma",
                contactpersonphone: "9876543211",
                address: "100 Health Way",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                approvalstatus: "APPROVED",
            },
        });
        testBloodBankIds.push(bbA.bloodbankid);
        const tokenBBA = generateToken(bbAUser.userid, "BLOOD_BANK");

        // Blood Bank B (for cross-facility IDOR checks)
        const bbBUser = await prisma.users.create({
            data: {
                name: `Blood Bank User B ${timestamp}`,
                email: `bbB-p621-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        testUserIds.push(bbBUser.userid);
        const bbB = await prisma.bloodbanks.create({
            data: {
                userid: bbBUser.userid,
                bloodbankname: `City Blood Center B ${timestamp}`,
                licensenumber: `LIC-621-B-${timestamp}`,
                contactpersonname: "Dr. B. Patel",
                contactpersonphone: "9876543222",
                address: "200 Care Blvd",
                city: "Pune",
                state: "Maharashtra",
                pincode: "411001",
                approvalstatus: "APPROVED",
            },
        });
        testBloodBankIds.push(bbB.bloodbankid);
        const tokenBBB = generateToken(bbBUser.userid, "BLOOD_BANK");

        // Hospital User
        const hospUser = await prisma.users.create({
            data: {
                name: `Hospital User ${timestamp}`,
                email: `hosp-p621-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        testUserIds.push(hospUser.userid);
        const tokenHosp = generateToken(hospUser.userid, "HOSPITAL");

        // Donor User
        const donorUser = await prisma.users.create({
            data: {
                name: `Donor User ${timestamp}`,
                email: `donor-p621-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "DONOR",
            },
        });
        testUserIds.push(donorUser.userid);
        const tokenDonor = generateToken(donorUser.userid, "DONOR");

        // Admin User
        const adminUser = await prisma.users.create({
            data: {
                name: `Admin User ${timestamp}`,
                email: `admin-p621-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "ADMIN",
            },
        });
        testUserIds.push(adminUser.userid);
        const tokenAdmin = generateToken(adminUser.userid, "ADMIN");

        console.log("--- 1. Testing Authorization & Access Control ---");
        const keyAuth = `key_auth_test_${timestamp}_0001`;
        const validPayloadAdd = {
            bloodgroup: "O+",
            bloodcomponent: "WHOLE_BLOOD",
            quantity: 5,
            expirydate: "2027-12-31",
            reason: "Standard donor camp intake",
        };

        // 1a. Unauthenticated request rejected
        const unauthRes = await postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, "", validPayloadAdd, {
            "Idempotency-Key": keyAuth,
        });
        assert(unauthRes.status === 401, "Unauthenticated request rejected with 401 Unauthorized");

        // 1b. Unauthorized role (HOSPITAL) rejected
        const hospRes = await postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenHosp, validPayloadAdd, {
            "Idempotency-Key": keyAuth,
        });
        assert(hospRes.status === 403, "HOSPITAL role rejected with 403 Forbidden");

        // 1c. Unauthorized role (DONOR) rejected
        const donorRes = await postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenDonor, validPayloadAdd, {
            "Idempotency-Key": keyAuth,
        });
        assert(donorRes.status === 403, "DONOR role rejected with 403 Forbidden");

        // 1d. Cross-facility IDOR rejected (Blood Bank B cannot add stock to Blood Bank A)
        const idorRes = await postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenBBB, validPayloadAdd, {
            "Idempotency-Key": keyAuth,
        });
        assert(idorRes.status === 403, "Cross-facility inventory addition rejected with 403 Forbidden (IDOR Guard)");

        console.log("--- 2. Testing Payload Validation Rules ---");
        // 2a. Missing Idempotency-Key header
        const noKeyRes = await postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenBBA, validPayloadAdd);
        assert(noKeyRes.status === 400, "Missing Idempotency-Key header returns 400 Bad Request");
        assert(noKeyRes.data?.message?.includes("Idempotency-Key"), "Error message specifies Idempotency-Key requirement");

        // 2b. Short Idempotency-Key (<16 chars)
        const shortKeyRes = await postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenBBA, validPayloadAdd, {
            "Idempotency-Key": "short-key",
        });
        assert(shortKeyRes.status === 400, "Short Idempotency-Key (<16 chars) returns 400 Bad Request");

        // 2c. Invalid blood group
        const badGroupRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, bloodgroup: "INVALID_GROUP" },
            { "Idempotency-Key": `key_bad_group_${timestamp}_01` }
        );
        assert(badGroupRes.status === 400, "Invalid blood group rejected with 400 Bad Request");

        // 2d. Invalid blood component
        const badCompRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, bloodcomponent: "INVALID_COMPONENT" },
            { "Idempotency-Key": `key_bad_comp_${timestamp}_01` }
        );
        assert(badCompRes.status === 400, "Invalid blood component rejected with 400 Bad Request");

        // 2e. Non-positive quantity (zero)
        const zeroQtyRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, quantity: 0 },
            { "Idempotency-Key": `key_zero_qty_${timestamp}_01` }
        );
        assert(zeroQtyRes.status === 400, "Zero quantity rejected with 400 Bad Request");

        // 2f. Negative quantity
        const negQtyRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, quantity: -4 },
            { "Idempotency-Key": `key_neg_qty_${timestamp}_01` }
        );
        assert(negQtyRes.status === 400, "Negative quantity rejected with 400 Bad Request");

        // 2g. Non-integer fractional quantity
        const fracQtyRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, quantity: 3.5 },
            { "Idempotency-Key": `key_frac_qty_${timestamp}_01` }
        );
        assert(fracQtyRes.status === 400, "Fractional quantity rejected with 400 Bad Request");

        // 2h. Past expiry date
        const pastDateRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, expirydate: "2020-01-01" },
            { "Idempotency-Key": `key_past_exp_${timestamp}_01` }
        );
        assert(pastDateRes.status === 400, "Past expiry date rejected with 400 Bad Request");

        // 2i. Current-date expiry date (not strictly in future)
        const todayStr = new Date().toISOString().split("T")[0];
        const todayDateRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, expirydate: todayStr },
            { "Idempotency-Key": `key_today_exp_${timestamp}_01` }
        );
        assert(todayDateRes.status === 400, "Current-date expiry date rejected with 400 Bad Request");

        // 2j. Client attempting to inject unitsreserved directly
        const injectReservedRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            { ...validPayloadAdd, unitsreserved: 10 },
            { "Idempotency-Key": `key_inject_res_${timestamp}_01` }
        );
        assert(injectReservedRes.status === 400, "Direct injection of unitsreserved rejected with 400 Bad Request");

        console.log("--- 3. Testing Adding New Inventory Batch & Audit Ledger Recording ---");
        const keyAdd1 = `key_add_lot_1_${timestamp}_0001`;
        const addRes1 = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            {
                bloodgroup: "A+",
                bloodcomponent: "RBC",
                quantity: 10,
                expirydate: "2027-06-15",
                reason: "Voluntary donor camp donation batch #101",
            },
            { "Idempotency-Key": keyAdd1 }
        );
        assert(addRes1.status === 201, "New inventory batch created with 201 Created");
        assert(addRes1.data?.inventory?.unitsavailable === 10, "Available units initialized to 10");
        assert(addRes1.data?.inventory?.unitsreserved === 0, "Reserved units initialized to 0");
        assert(addRes1.data?.merged === false, "Lot marked as new creation (merged: false)");
        const lot1Id = addRes1.data?.inventory?.inventoryid;
        assert(Boolean(lot1Id), "Lot assigned a valid UUID primary key");

        // Verify ledger entry created atomically
        const ledger1 = await prisma.inventoryledger.findUnique({
            where: { idempotencykey: keyAdd1 },
        });
        assert(ledger1 !== null, "Audit ledger row created with matching idempotency key");
        assert(ledger1?.inventoryid === lot1Id, "Ledger references the newly created inventory lot");
        assert(ledger1?.operationtype === "STOCK_ADDITION", "Ledger operation type is STOCK_ADDITION");
        assert(ledger1?.quantitydelta === 10, "Quantity delta recorded as +10");
        assert(ledger1?.previousavailable === 0, "Previous available recorded as 0");
        assert(ledger1?.newavailable === 10, "New available recorded as 10");
        assert(ledger1?.previousreserved === 0 && ledger1?.newreserved === 0, "Reserved units remain 0");
        assert(ledger1?.actoruserid === bbAUser.userid, "Ledger records correct actor user ID");

        console.log("--- 4. Testing Merging Matching Lots under Unique Constraint ---");
        // Add another 5 units of the EXACT same group, component, and expiry date
        const keyAddMerge = `key_add_merge_${timestamp}_0001`;
        const mergeRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            {
                bloodgroup: "A+",
                bloodcomponent: "RBC",
                quantity: 5,
                expirydate: "2027-06-15",
                reason: "Additional donation for same batch",
            },
            { "Idempotency-Key": keyAddMerge }
        );
        assert(mergeRes.status === 200, "Matching lot merged with 200 OK");
        assert(mergeRes.data?.inventory?.inventoryid === lot1Id, "Merged into existing lot ID without creating duplicate row");
        assert(mergeRes.data?.inventory?.unitsavailable === 15, "Available units incremented to 15 (10 + 5)");
        assert(mergeRes.data?.merged === true, "Response signals merged: true");

        const ledgerMerge = await prisma.inventoryledger.findUnique({
            where: { idempotencykey: keyAddMerge },
        });
        assert(ledgerMerge !== null, "Second ledger entry created for merged addition");
        assert(ledgerMerge?.previousavailable === 10, "Ledger records previous available as 10");
        assert(ledgerMerge?.newavailable === 15, "Ledger records new available as 15");
        assert(ledgerMerge?.quantitydelta === 5, "Quantity delta recorded as +5");

        console.log("--- 5. Testing Sequential Idempotency & Replay ---");
        // Re-send the exact same request with keyAddMerge
        const replayRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            {
                bloodgroup: "A+",
                bloodcomponent: "RBC",
                quantity: 5,
                expirydate: "2027-06-15",
                reason: "Additional donation for same batch",
            },
            { "Idempotency-Key": keyAddMerge }
        );
        assert(replayRes.status === 200, "Idempotent replay returns 200 OK");
        assert(replayRes.headers.get("x-cache-lookup") === "IDEMPOTENT_HIT", "Header signals IDEMPOTENT_HIT");
        assert(replayRes.data?.inventory?.unitsavailable === 15, "Stock was NOT incremented again (remained 15)");

        // Key collision check: Reusing keyAddMerge with a DIFFERENT quantity
        const collisionRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            {
                bloodgroup: "A+",
                bloodcomponent: "RBC",
                quantity: 99, // Mismatched payload!
                expirydate: "2027-06-15",
                reason: "Tampered payload with same key",
            },
            { "Idempotency-Key": keyAddMerge }
        );
        assert(collisionRes.status === 409, "Key reuse with mismatched payload rejected with 409 Conflict");
        assert(collisionRes.data?.message?.includes("different"), "Rejection explains key already used for different request");

        console.log("--- 6. Testing Genuinely Concurrent Idempotency Retries ---");
        // Two concurrent requests fired simultaneously with the EXACT same Idempotency-Key
        const concKey = `key_conc_idemp_${timestamp}_0001`;
        const concPayload = {
            bloodgroup: "B-",
            bloodcomponent: "PLATELETS",
            quantity: 4,
            expirydate: "2027-08-20",
            reason: "Simultaneous retry test batch",
        };

        const [concRes1, concRes2] = await Promise.all([
            postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenBBA, concPayload, { "Idempotency-Key": concKey }),
            postJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenBBA, concPayload, { "Idempotency-Key": concKey }),
        ]);

        assert(concRes1.status === 201 || concRes1.status === 200, "Worker 1 resolved successfully");
        assert(concRes2.status === 201 || concRes2.status === 200, "Worker 2 resolved successfully");
        assert(concRes1.data?.inventory?.inventoryid === concRes2.data?.inventory?.inventoryid, "Both workers returned identical lot ID");
        assert(concRes1.data?.inventory?.unitsavailable === 4, "Worker 1 returned units = 4");
        assert(concRes2.data?.inventory?.unitsavailable === 4, "Worker 2 returned units = 4 (did NOT double-increment)");

        // Verify exactly 1 ledger record exists for this idempotency key
        const concLedgerCount = await prisma.inventoryledger.count({
            where: { idempotencykey: concKey },
        });
        assert(concLedgerCount === 1, "Exactly 1 ledger entry created for concurrent duplicate requests");

        console.log("--- 7. Testing Concurrency Safety: Simultaneous Additions to Same Lot ---");
        // 5 concurrent requests adding 3 units each with DIFFERENT idempotency keys
        const concLotExpiry = "2027-10-10";
        const addPromises = [1, 2, 3, 4, 5].map((i) =>
            postJson(
                `/bloodbanks/${bbA.bloodbankid}/inventory`,
                tokenBBA,
                {
                    bloodgroup: "O-",
                    bloodcomponent: "WHOLE_BLOOD",
                    quantity: 3,
                    expirydate: concLotExpiry,
                    reason: `Concurrent donor worker ${i}`,
                },
                { "Idempotency-Key": `key_conc_add_${timestamp}_worker_${i}` }
            )
        );
        const addResults = await Promise.all(addPromises);
        assert(addResults.every((r) => r.status === 200 || r.status === 201), "All 5 concurrent addition requests succeeded");

        const concLotId = addResults[0].data?.inventory?.inventoryid;
        assert(Boolean(concLotId), "Concurrent addition returned a valid inventory ID");
        const concLot = await prisma.inventory.findUnique({
            where: { inventoryid: concLotId },
        });
        assert(concLot?.unitsavailable === 15, `All concurrent increments captured: stock is exactly 15 (actual: ${concLot?.unitsavailable})`);

        console.log("--- 8. Testing Stock Adjustments: INCREMENT & DECREMENT ---");
        // Adjust concLot: INCREMENT by 5
        const keyInc = `key_adjust_inc_${timestamp}_0001`;
        const incRes = await patchJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory/${concLot!.inventoryid}`,
            tokenBBA,
            {
                operation: "INCREMENT",
                quantity: 5,
                reason: "Reconciled stock count after physical audit",
            },
            { "Idempotency-Key": keyInc }
        );
        assert(incRes.status === 200, "Adjustment INCREMENT succeeded with 200 OK");
        assert(incRes.data?.inventory?.unitsavailable === 20, "Stock incremented from 15 to 20");
        assert(incRes.data?.delta === 5, "Delta reported as +5");

        const incLedger = await prisma.inventoryledger.findUnique({ where: { idempotencykey: keyInc } });
        assert(incLedger?.operationtype === "CORRECTION_INCREMENT", "Ledger recorded CORRECTION_INCREMENT");
        assert(incLedger?.previousavailable === 15 && incLedger?.newavailable === 20, "Ledger recorded 15 -> 20");

        // Adjust concLot: DECREMENT by 8
        const keyDec = `key_adjust_dec_${timestamp}_0001`;
        const decRes = await patchJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory/${concLot!.inventoryid}`,
            tokenBBA,
            {
                operation: "DECREMENT",
                quantity: 8,
                reason: "Damaged packaging quarantine adjustment",
            },
            { "Idempotency-Key": keyDec }
        );
        assert(decRes.status === 200, "Adjustment DECREMENT succeeded with 200 OK");
        assert(decRes.data?.inventory?.unitsavailable === 12, "Stock decremented from 20 to 12");
        assert(decRes.data?.delta === -8, "Delta reported as -8");

        const decLedger = await prisma.inventoryledger.findUnique({ where: { idempotencykey: keyDec } });
        assert(decLedger?.operationtype === "CORRECTION_DECREMENT", "Ledger recorded CORRECTION_DECREMENT");
        assert(decLedger?.quantitydelta === -8, "Quantity delta recorded as -8");
        assert(decLedger?.previousavailable === 20 && decLedger?.newavailable === 12, "Ledger recorded 20 -> 12");

        // Adjustment validation: Missing reason rejected
        const noReasonRes = await patchJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory/${concLot!.inventoryid}`,
            tokenBBA,
            { operation: "DECREMENT", quantity: 1, reason: "   " },
            { "Idempotency-Key": `key_no_reason_${timestamp}_01` }
        );
        assert(noReasonRes.status === 400, "Adjustment with empty reason rejected with 400 Bad Request");

        // Cross-facility adjustment IDOR rejected
        const idorPatchRes = await patchJson(
            `/bloodbanks/${bbB.bloodbankid}/inventory/${concLot!.inventoryid}`,
            tokenBBB,
            { operation: "DECREMENT", quantity: 1, reason: "Malicious cross-facility adjustment" },
            { "Idempotency-Key": `key_idor_patch_${timestamp}_01` }
        );
        assert(idorPatchRes.status === 404, "Cross-facility adjustment rejected with 404 Not Found");

        console.log("--- 9. Testing Concurrency Safety: Over-Decrement Prevention ---");
        // Create lot with exactly 5 units
        const keyOverLot = `key_over_lot_${timestamp}_0001`;
        const overLotRes = await postJson(
            `/bloodbanks/${bbA.bloodbankid}/inventory`,
            tokenBBA,
            {
                bloodgroup: "AB-",
                bloodcomponent: "PLASMA",
                quantity: 5,
                expirydate: "2027-11-11",
                reason: "Initial lot for over-decrement test",
            },
            { "Idempotency-Key": keyOverLot }
        );
        const overLotId = overLotRes.data?.inventory?.inventoryid;

        // Two concurrent decrement requests of 4 units each (4 + 4 = 8 > 5)
        // Exactly one MUST succeed, and exactly one MUST fail with 409 Conflict
        const [dec1, dec2] = await Promise.all([
            patchJson(
                `/bloodbanks/${bbA.bloodbankid}/inventory/${overLotId}`,
                tokenBBA,
                { operation: "DECREMENT", quantity: 4, reason: "Concurrent decrement worker 1" },
                { "Idempotency-Key": `key_conc_dec1_${timestamp}` }
            ),
            patchJson(
                `/bloodbanks/${bbA.bloodbankid}/inventory/${overLotId}`,
                tokenBBA,
                { operation: "DECREMENT", quantity: 4, reason: "Concurrent decrement worker 2" },
                { "Idempotency-Key": `key_conc_dec2_${timestamp}` }
            ),
        ]);

        const statuses = [dec1.status, dec2.status].sort();
        assert(statuses[0] === 200 && statuses[1] === 409, `Exactly one decrement succeeded (200) and one failed (409 Conflict). Got: ${statuses.join(", ")}`);

        // Check database stock: must be exactly 1 (5 - 4 = 1), never negative
        const verifiedOverLot = await prisma.inventory.findUnique({ where: { inventoryid: overLotId } });
        assert(verifiedOverLot?.unitsavailable === 1, "Stock never fell below zero; remaining units is exactly 1");

        console.log("--- 10. Testing Database-Level Ledger Immutability Trigger ---");
        // Attempt raw SQL UPDATE on an existing ledger record
        let updateThrew = false;
        try {
            await prisma.$executeRawUnsafe(
                `UPDATE inventoryledger SET reason = 'Malicious ledger tampering' WHERE ledgerid = '${incLedger!.ledgerid}'`
            );
        } catch (err: any) {
            updateThrew = true;
            assert(
                String(err.message).includes("Clinical Governance Violation") || String(err.message).includes("immutable"),
                "Direct SQL UPDATE aborted by PostgreSQL immutability trigger"
            );
        }
        assert(updateThrew, "Direct UPDATE on inventoryledger was successfully prevented by trigger");

        // Attempt raw SQL DELETE on an existing ledger record
        let deleteThrew = false;
        try {
            await prisma.$executeRawUnsafe(
                `DELETE FROM inventoryledger WHERE ledgerid = '${incLedger!.ledgerid}'`
            );
        } catch (err: any) {
            deleteThrew = true;
            assert(
                String(err.message).includes("Clinical Governance Violation") || String(err.message).includes("immutable"),
                "Direct SQL DELETE aborted by PostgreSQL immutability trigger"
            );
        }
        assert(deleteThrew, "Direct DELETE on inventoryledger was successfully prevented by trigger");

        console.log("--- 11. Testing Dashboard & Inventory Read Endpoint Reflection ---");
        // Fetch inventory list
        const listRes = await getJson(`/bloodbanks/${bbA.bloodbankid}/inventory`, tokenBBA);
        assert(listRes.status === 200, "GET /bloodbanks/:id/inventory returns 200 OK");
        assert(Array.isArray(listRes.data?.inventory), "Inventory response contains inventory array");
        assert(listRes.data?.total >= 3, `Inventory contains recorded batches (total: ${listRes.data?.total})`);

        // Fetch dashboard metrics
        const dashRes = await getJson(`/bloodbanks/${bbA.bloodbankid}/dashboard`, tokenBBA);
        assert(dashRes.status === 200, "GET /bloodbanks/:id/dashboard returns 200 OK");
        assert(dashRes.data?.totalUnitsAvailable > 0, `Dashboard aggregates live available units (${dashRes.data?.totalUnitsAvailable})`);
        assert(dashRes.data?.totalUnitsReserved === 0, "Dashboard confirms totalUnitsReserved remained 0 throughout Phase 6.2.1");

        console.log("\n===============================================================================");
        console.log(`  PHASE 6.2.1 TEST SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
        console.log("===============================================================================\n");
    } finally {
        console.log("Cleaning up test records...");
        // Disable immutability trigger temporarily to clean up test-scoped records
        await prisma.$executeRawUnsafe(`ALTER TABLE inventoryledger DISABLE TRIGGER trg_prevent_ledger_update_delete;`).catch(() => {});
        if (testBloodBankIds.length > 0) {
            await prisma.inventoryledger.deleteMany({ where: { bloodbankid: { in: testBloodBankIds } } }).catch(() => {});
            await prisma.inventory.deleteMany({ where: { bloodbankid: { in: testBloodBankIds } } }).catch(() => {});
            await prisma.bloodbanks.deleteMany({ where: { bloodbankid: { in: testBloodBankIds } } }).catch(() => {});
        }
        await prisma.$executeRawUnsafe(`ALTER TABLE inventoryledger ENABLE TRIGGER trg_prevent_ledger_update_delete;`).catch(() => {});

        if (testUserIds.length > 0) {
            await prisma.users.deleteMany({ where: { userid: { in: testUserIds } } }).catch(() => {});
        }

        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        await prisma.$disconnect();
    }
}

if (require.main === module || process.argv[1]?.endsWith("test_phase6_2_1_inventory_management.ts")) {
    runPhase621InventoryTests()
        .then(() => {
            console.log("All Phase 6.2.1 automated tests passed successfully.");
            process.exit(0);
        })
        .catch((err) => {
            console.error("Phase 6.2.1 automated tests failed:", err);
            process.exit(1);
        });
}
