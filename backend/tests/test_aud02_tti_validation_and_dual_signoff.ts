import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import http from "http";
import crypto from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/Swastya(\?|$)/i, "/swastya_test$1");
}

import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, user_role } from "../src/generated/prisma/enums";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
        console.log(`  [PASS] ${testName}`);
        passed++;
    } else {
        const msg = detail ? `${testName} — ${detail}` : testName;
        console.error(`  [FAIL] ${msg}`);
        failed++;
        failures.push(msg);
    }
}

const ALL_NON_REACTIVE_PANEL = {
    hivResult: "NON_REACTIVE",
    hbvResult: "NON_REACTIVE",
    hcvResult: "NON_REACTIVE",
    syphilisResult: "NON_REACTIVE",
    malariaResult: "NON_REACTIVE",
};

const TTI_MARKER_KEYS = [
    "hivResult",
    "hbvResult",
    "hcvResult",
    "syphilisResult",
    "malariaResult",
] as const;

async function runTests() {
    console.log("===============================================================================");
    console.log("  AUD-02: STRICT 5-PANEL TTI VALIDATION, LIFECYCLE GUARD & TWO-PERSON SIGN-OFF ");
    console.log("===============================================================================\n");

    const { default: app } = await import("../src/app");
    const { prisma } = await import("../src/config/prisma");
    const { UnitTraceabilityService } = await import("../src/services/unitTraceability.service");
    const { Pool } = await import("pg");

    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe(
        `SELECT current_database()`
    );
    const currentDb = dbCheck[0]?.current_database || "";
    if (currentDb !== "swastya_test") {
        throw new Error(`SAFETY ABORT: Expected swastya_test database, got "${currentDb}"`);
    }
    console.log(`[DB Guard] Verified target database: ${currentDb}`);

    // Verify sync_swastya_test_schema.sql applies cleanly and idempotently (2x)
    const syncSqlPath = path.resolve(__dirname, "./sync_swastya_test_schema.sql");
    const syncSql = fs.readFileSync(syncSqlPath, "utf-8");
    const syncPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        await syncPool.query(syncSql);
        await syncPool.query(syncSql);
        assert(true, "0.1 sync_swastya_test_schema.sql applied and verified idempotent (2x)");
    } finally {
        await syncPool.end();
    }
    console.log("");

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const tag = `aud02_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    let barcodeSeq = 0;

    const reqJson = async (
        method: string,
        urlPath: string,
        body?: any,
        token?: string,
        extraHeaders?: Record<string, string>
    ) => {
        const headers: Record<string, string> = { ...(extraHeaders || {}) };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${baseUrl}${urlPath}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => null);
        return { status: res.status, data };
    };

    try {
        // --- Seed Test Users & Facilities ---
        const [
            bbAUser,
            bbBUser,
            orphanBbUser,
            pendingBbUser,
            rejectedBbUser,
            admin1User,
            admin2User,
            inactiveAdminUser,
            hospUser,
            donorUser,
            requesterUser,
        ] = await Promise.all([
            prisma.users.create({
                data: {
                    name: `AUD02 BB A ${tag}`,
                    email: `bba.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000001",
                    role: user_role.BLOOD_BANK,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 BB B ${tag}`,
                    email: `bbb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000002",
                    role: user_role.BLOOD_BANK,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Orphan BB ${tag}`,
                    email: `orphanbb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000003",
                    role: user_role.BLOOD_BANK,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Pending BB ${tag}`,
                    email: `pendbb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000004",
                    role: user_role.BLOOD_BANK,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Rejected BB ${tag}`,
                    email: `rejbb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000005",
                    role: user_role.BLOOD_BANK,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Admin 1 ${tag}`,
                    email: `admin1.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000006",
                    role: user_role.ADMIN,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Admin 2 ${tag}`,
                    email: `admin2.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000007",
                    role: user_role.ADMIN,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Inactive Admin ${tag}`,
                    email: `inactive.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000008",
                    role: user_role.ADMIN,
                    isactive: false,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Hospital ${tag}`,
                    email: `hosp.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000009",
                    role: user_role.HOSPITAL,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Donor ${tag}`,
                    email: `donor.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000010",
                    role: user_role.DONOR,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD02 Requester ${tag}`,
                    email: `req.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9830000011",
                    role: user_role.REQUESTER,
                    isactive: true,
                    emailverified: true,
                },
            }),
        ]);

        const [bbA, bbB, bbPending, bbRejected, hosp] = await Promise.all([
            prisma.bloodbanks.create({
                data: {
                    userid: bbAUser.userid,
                    bloodbankname: `AUD02 Blood Bank A ${tag}`,
                    licensenumber: `LIC-BBA-${tag}`,
                    contactpersonname: "Dr. A",
                    contactpersonphone: "9830000001",
                    address: "101 Clinical Way",
                    city: "Mumbai",
                    state: "Maharashtra",
                    pincode: "400001",
                    approvalstatus: "APPROVED",
                },
            }),
            prisma.bloodbanks.create({
                data: {
                    userid: bbBUser.userid,
                    bloodbankname: `AUD02 Blood Bank B ${tag}`,
                    licensenumber: `LIC-BBB-${tag}`,
                    contactpersonname: "Dr. B",
                    contactpersonphone: "9830000002",
                    address: "102 Clinical Way",
                    city: "Mumbai",
                    state: "Maharashtra",
                    pincode: "400002",
                    approvalstatus: "APPROVED",
                },
            }),
            prisma.bloodbanks.create({
                data: {
                    userid: pendingBbUser.userid,
                    bloodbankname: `AUD02 Pending BB ${tag}`,
                    licensenumber: `LIC-BBP-${tag}`,
                    contactpersonname: "Dr. P",
                    contactpersonphone: "9830000004",
                    address: "104 Clinical Way",
                    city: "Mumbai",
                    state: "Maharashtra",
                    pincode: "400004",
                    approvalstatus: "PENDING",
                },
            }),
            prisma.bloodbanks.create({
                data: {
                    userid: rejectedBbUser.userid,
                    bloodbankname: `AUD02 Rejected BB ${tag}`,
                    licensenumber: `LIC-BBR-${tag}`,
                    contactpersonname: "Dr. R",
                    contactpersonphone: "9830000005",
                    address: "105 Clinical Way",
                    city: "Mumbai",
                    state: "Maharashtra",
                    pincode: "400005",
                    approvalstatus: "REJECTED",
                },
            }),
            prisma.hospitals.create({
                data: {
                    userid: hospUser.userid,
                    hospitalname: `AUD02 Hospital ${tag}`,
                    registrationnumber: `HREG-AUD02-${tag}`,
                    contactpersonname: "Dr. H",
                    contactpersonphone: "9830000009",
                    address: "201 Hospital Rd",
                    city: "Mumbai",
                    state: "Maharashtra",
                    pincode: "400001",
                    approvalstatus: "APPROVED",
                },
            }),
        ]);

        const bbAToken = generateToken(bbAUser.userid, user_role.BLOOD_BANK);
        const bbBToken = generateToken(bbBUser.userid, user_role.BLOOD_BANK);
        const orphanBbToken = generateToken(orphanBbUser.userid, user_role.BLOOD_BANK);
        const pendingBbToken = generateToken(pendingBbUser.userid, user_role.BLOOD_BANK);
        const rejectedBbToken = generateToken(rejectedBbUser.userid, user_role.BLOOD_BANK);
        const admin1Token = generateToken(admin1User.userid, user_role.ADMIN);
        const admin2Token = generateToken(admin2User.userid, user_role.ADMIN);
        const inactiveAdminToken = generateToken(inactiveAdminUser.userid, user_role.ADMIN);
        const hospToken = generateToken(hospUser.userid, user_role.HOSPITAL);
        const donorToken = generateToken(donorUser.userid, user_role.DONOR);
        const requesterToken = generateToken(requesterUser.userid, user_role.REQUESTER);

        // Helper to intake a fresh QUARANTINED unit in its own isolated lot
        let expiryOffsetDays = 4000;
        const intakeFreshUnit = async (targetBbId = bbA.bloodbankid, token = bbAToken) => {
            barcodeSeq++;
            expiryOffsetDays++;
            const barcode = `AUD02-U${barcodeSeq}-${tag}`;
            const expDate = new Date(Date.now() + expiryOffsetDays * 86400000).toISOString();
            const res = await reqJson(
                "POST",
                `/bloodbanks/${targetBbId}/units/intake`,
                {
                    bloodGroup: "O+",
                    bloodComponent: "RBC",
                    expiryDate: expDate,
                    units: [{ unitBarcode: barcode, donationIdentificationNumber: `DIN-${barcodeSeq}` }],
                    reason: `AUD-02 Test Intake ${barcodeSeq}`,
                },
                token,
                { "Idempotency-Key": `aud02-intake-${barcodeSeq}-${tag}` }
            );
            if (res.status !== 201) {
                throw new Error(`Intake failed (${res.status}): ${JSON.stringify(res.data)}`);
            }
            return {
                unitId: res.data.units[0].unitId as string,
                unitBarcode: barcode,
                inventoryId: res.data.lot.inventoryId as string,
            };
        };

        const assertUnitUnchangedInQuarantine = async (
            unitId: string,
            inventoryId: string,
            expectedScreeningCount: number,
            expectedLedgerCount: number,
            expectedDispositionCount: number,
            label: string
        ) => {
            const [unit, lot, scrCount, ledCount, dispCount] = await Promise.all([
                prisma.inventoryunits.findUnique({ where: { unitid: unitId } }),
                prisma.inventory.findUnique({ where: { inventoryid: inventoryId } }),
                prisma.unitscreeningrecords.count({ where: { unitid: unitId } }),
                prisma.inventoryledger.count({ where: { inventoryid: inventoryId } }),
                prisma.unitdispositionhistory.count({ where: { unitid: unitId } }),
            ]);
            assert(
                unit?.status === "QUARANTINED" &&
                    unit?.ttiscreeningstatus === "PENDING" &&
                    lot?.unitsquarantined === 1 &&
                    lot?.unitsavailable === 0 &&
                    scrCount === expectedScreeningCount &&
                    ledCount === expectedLedgerCount &&
                    dispCount === expectedDispositionCount,
                label,
                `status=${unit?.status} tti=${unit?.ttiscreeningstatus} quar=${lot?.unitsquarantined} avail=${lot?.unitsavailable} scr=${scrCount}/${expectedScreeningCount} led=${ledCount}/${expectedLedgerCount} disp=${dispCount}/${expectedDispositionCount}`
            );
        };

        // =========================================================================
        // SECTION 1: ALL FIVE NON_REACTIVE RESULTS -> TWO-STEP VERIFICATION
        // =========================================================================
        console.log("--- 1. Two-Step Valid 5-Panel NON_REACTIVE Submission & Independent Verification ---");
        const u1 = await intakeFreshUnit();

        // Step 1a: Tester submits 5 NON_REACTIVE results
        const step1Res = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u1.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
                laboratoryRemarks: "All 5 chemiluminescence assays non-reactive",
            },
            bbAToken
        );
        assert(step1Res.status === 200 && step1Res.data?.success === true, "1.1 Tester submits 5 NON_REACTIVE results (HTTP 200)");
        assert(
            step1Res.data?.unitStatus === "QUARANTINED" &&
                step1Res.data?.ttiScreeningStatus === "PENDING" &&
                step1Res.data?.verificationStatus === "PENDING_VERIFICATION" &&
                step1Res.data?.testedByUserId === bbAUser.userid &&
                step1Res.data?.verifiedByUserId === null,
            "1.2 Response reports unitStatus=QUARANTINED, ttiScreeningStatus=PENDING, verifiedByUserId=null"
        );

        const [u1AfterStep1, lot1AfterStep1, scr1AfterStep1, led1AfterStep1] = await Promise.all([
            prisma.inventoryunits.findUnique({ where: { unitid: u1.unitId } }),
            prisma.inventory.findUnique({ where: { inventoryid: u1.inventoryId } }),
            prisma.unitscreeningrecords.findUnique({ where: { screeningid: step1Res.data.screeningId } }),
            prisma.inventoryledger.count({ where: { inventoryid: u1.inventoryId, operationtype: "SCREENING_CLEARANCE" } }),
        ]);
        assert(
            u1AfterStep1?.status === "QUARANTINED" &&
                u1AfterStep1?.ttiscreeningstatus === "PENDING" &&
                lot1AfterStep1?.unitsquarantined === 1 &&
                lot1AfterStep1?.unitsavailable === 0 &&
                scr1AfterStep1?.testedbyuserid === bbAUser.userid &&
                scr1AfterStep1?.verifiedbyuserid === null &&
                scr1AfterStep1?.verifiedat === null &&
                led1AfterStep1 === 0,
            "1.3 DB state after Step 1: unit stays QUARANTINED, lot counters unchanged, screening pending verification, zero clearance ledger rows"
        );

        // Step 1b: Independent Verifier (Admin 1) verifies with their own JWT
        const step2Res = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u1.unitId}/screening/verify`,
            {
                screeningId: step1Res.data.screeningId,
                laboratoryRemarks: "Second-person QA verification confirmed",
            },
            admin1Token
        );
        assert(step2Res.status === 200 && step2Res.data?.success === true, "1.4 Independent verifier completes Step 2 verification (HTTP 200)");
        assert(
            step2Res.data?.unitStatus === "AVAILABLE" &&
                step2Res.data?.ttiScreeningStatus === "PASSED" &&
                step2Res.data?.verificationStatus === "VERIFIED" &&
                step2Res.data?.testedByUserId === bbAUser.userid &&
                step2Res.data?.verifiedByUserId === admin1User.userid,
            "1.5 Verification response reports unitStatus=AVAILABLE, ttiScreeningStatus=PASSED, distinct tester & verifier"
        );

        const [u1AfterStep2, lot1AfterStep2, scr1AfterStep2, led1AfterStep2] = await Promise.all([
            prisma.inventoryunits.findUnique({ where: { unitid: u1.unitId } }),
            prisma.inventory.findUnique({ where: { inventoryid: u1.inventoryId } }),
            prisma.unitscreeningrecords.findUnique({ where: { screeningid: step1Res.data.screeningId } }),
            prisma.inventoryledger.findMany({ where: { inventoryid: u1.inventoryId, operationtype: "SCREENING_CLEARANCE" } }),
        ]);
        assert(
            u1AfterStep2?.status === "AVAILABLE" &&
                u1AfterStep2?.ttiscreeningstatus === "PASSED" &&
                lot1AfterStep2?.unitsquarantined === 0 &&
                lot1AfterStep2?.unitsavailable === 1 &&
                scr1AfterStep2?.verifiedbyuserid === admin1User.userid &&
                scr1AfterStep2?.verifiedat !== null &&
                led1AfterStep2.length === 1 &&
                led1AfterStep2[0].previousavailable === 0 &&
                led1AfterStep2[0].newavailable === 1,
            "1.6 DB state after Step 2: unit AVAILABLE, lot quarantined 1->0 & available 0->1, verifiedbyuserid & verifiedat persisted, 1 SCREENING_CLEARANCE ledger row"
        );

        // =========================================================================
        // SECTION 2: EACH MARKER INDEPENDENTLY TESTED WITH REACTIVE, INDETERMINATE & INVALID NEGATIVE
        // =========================================================================
        console.log("\n--- 2. Strict Per-Marker Validation (REACTIVE, INDETERMINATE, Invalid NEGATIVE & Inconsistent Overall Status) ---");
        const u2 = await intakeFreshUnit();

        for (const marker of TTI_MARKER_KEYS) {
            // 2a. Marker = REACTIVE with overallStatus = PASSED -> must be rejected (400)
            const reactivePassRes = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
                {
                    ...ALL_NON_REACTIVE_PANEL,
                    [marker]: "REACTIVE",
                    overallStatus: "PASSED",
                },
                bbAToken
            );
            assert(
                reactivePassRes.status === 400,
                `2.1 [${marker}] REACTIVE + overallStatus PASSED rejected with 400`,
                `got ${reactivePassRes.status}`
            );

            // 2b. Marker = INDETERMINATE with overallStatus = PASSED -> must be rejected (400)
            const indetPassRes = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
                {
                    ...ALL_NON_REACTIVE_PANEL,
                    [marker]: "INDETERMINATE",
                    overallStatus: "PASSED",
                },
                bbAToken
            );
            assert(
                indetPassRes.status === 400,
                `2.2 [${marker}] INDETERMINATE + overallStatus PASSED rejected with 400`,
                `got ${indetPassRes.status}`
            );

            // 2c. Marker = NEGATIVE (invalid enum value) with PASSED and FAILED -> must be rejected (400)
            const negPassRes = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
                {
                    ...ALL_NON_REACTIVE_PANEL,
                    [marker]: "NEGATIVE",
                    overallStatus: "PASSED",
                },
                bbAToken
            );
            const negFailRes = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
                {
                    ...ALL_NON_REACTIVE_PANEL,
                    [marker]: "NEGATIVE",
                    overallStatus: "FAILED",
                },
                bbAToken
            );
            assert(
                negPassRes.status === 400 && negFailRes.status === 400,
                `2.3 [${marker}] Invalid value 'NEGATIVE' rejected with 400 for both PASSED and FAILED`,
                `pass=${negPassRes.status} fail=${negFailRes.status}`
            );

            // 2d. Marker = REACTIVE with overallStatus = INDETERMINATE -> inconsistent, rejected (400)
            const reactiveIndetRes = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
                {
                    ...ALL_NON_REACTIVE_PANEL,
                    [marker]: "REACTIVE",
                    overallStatus: "INDETERMINATE",
                },
                bbAToken
            );
            assert(
                reactiveIndetRes.status === 400,
                `2.4 [${marker}] REACTIVE + overallStatus INDETERMINATE rejected with 400`,
                `got ${reactiveIndetRes.status}`
            );
        }

        // 2e. All 5 NON_REACTIVE with overallStatus = FAILED or INDETERMINATE -> inconsistent, rejected (400)
        const allClearFailedRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "FAILED",
            },
            bbAToken
        );
        const allClearIndetRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "INDETERMINATE",
            },
            bbAToken
        );
        assert(
            allClearFailedRes.status === 400 && allClearIndetRes.status === 400,
            "2.5 All 5 NON_REACTIVE with FAILED or INDETERMINATE overallStatus rejected with 400"
        );

        await assertUnitUnchangedInQuarantine(
            u2.unitId,
            u2.inventoryId,
            0,
            1, // only initial STOCK_INTAKE ledger row
            1, // only initial Unit Intake disposition row
            "2.6 Zero screening records, ledger entries, disposition history rows, or counter changes created after all 22 rejected TTI submissions"
        );

        // 2f. Valid REACTIVE -> FAILED and INDETERMINATE -> INDETERMINATE two-step workflows keep unit QUARANTINED
        const validFailSubmit = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                hivResult: "REACTIVE",
                overallStatus: "FAILED",
            },
            bbAToken
        );
        const validFailVerify = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening/verify`,
            {},
            admin1Token
        );
        const u2AfterFail = await prisma.inventoryunits.findUnique({ where: { unitid: u2.unitId } });
        assert(
            validFailSubmit.status === 200 &&
                validFailVerify.status === 200 &&
                u2AfterFail?.status === "QUARANTINED" &&
                u2AfterFail?.ttiscreeningstatus === "FAILED",
            "2.7 Valid REACTIVE + FAILED submission & verification keeps unit QUARANTINED with ttiscreeningstatus=FAILED"
        );

        const validIndetSubmit = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                malariaResult: "INDETERMINATE",
                overallStatus: "INDETERMINATE",
            },
            bbAToken
        );
        const validIndetVerify = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u2.unitId}/screening/verify`,
            {},
            admin1Token
        );
        const u2AfterIndet = await prisma.inventoryunits.findUnique({ where: { unitid: u2.unitId } });
        assert(
            validIndetSubmit.status === 200 &&
                validIndetVerify.status === 200 &&
                u2AfterIndet?.status === "QUARANTINED" &&
                u2AfterIndet?.ttiscreeningstatus === "INDETERMINATE",
            "2.8 Valid INDETERMINATE + INDETERMINATE submission & verification keeps unit QUARANTINED with ttiscreeningstatus=INDETERMINATE"
        );

        // =========================================================================
        // SECTION 3: DIRECT SQL CONSTRAINT AND TRIGGER ENFORCEMENT
        // =========================================================================
        console.log("\n--- 3. Direct SQL Constraint & Trigger Enforcement on swastya_test ---");
        const u3 = await intakeFreshUnit();

        // 3a. Direct SQL INSERT with invalid marker value 'NEGATIVE' (using FAILED overallstatus to isolate chk_screening_panel_values)
        let sqlErrNegative = false;
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO unitscreeningrecords (
                    unitid, revisionnumber, iscurrent,
                    hivresult, hbvresult, hcvresult, syphilisresult, malariaresult,
                    overallstatus, testedbyuserid
                ) VALUES ($1::uuid, 1, true, 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NEGATIVE', 'FAILED', $2::uuid)`,
                u3.unitId,
                bbAUser.userid
            );
        } catch (e: any) {
            sqlErrNegative = String(e.message || "").includes("chk_screening_panel_values");
        }
        assert(sqlErrNegative, "3.1 Direct SQL INSERT with 'NEGATIVE' marker blocked by chk_screening_panel_values");

        // 3b. Direct SQL INSERT with REACTIVE marker and overallstatus = 'PASSED'
        let sqlErrReactivePassed = false;
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO unitscreeningrecords (
                    unitid, revisionnumber, iscurrent,
                    hivresult, hbvresult, hcvresult, syphilisresult, malariaresult,
                    overallstatus, testedbyuserid
                ) VALUES ($1::uuid, 1, true, 'REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'PASSED', $2::uuid)`,
                u3.unitId,
                bbAUser.userid
            );
        } catch (e: any) {
            sqlErrReactivePassed = String(e.message || "").includes("chk_screening_overall_consistency");
        }
        assert(sqlErrReactivePassed, "3.2 Direct SQL INSERT with REACTIVE + PASSED blocked by chk_screening_overall_consistency");

        // 3c. Direct SQL INSERT with all NON_REACTIVE and overallstatus = 'FAILED'
        let sqlErrAllClearFailed = false;
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO unitscreeningrecords (
                    unitid, revisionnumber, iscurrent,
                    hivresult, hbvresult, hcvresult, syphilisresult, malariaresult,
                    overallstatus, testedbyuserid
                ) VALUES ($1::uuid, 1, true, 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'FAILED', $2::uuid)`,
                u3.unitId,
                bbAUser.userid
            );
        } catch (e: any) {
            sqlErrAllClearFailed = String(e.message || "").includes("chk_screening_overall_consistency");
        }
        assert(sqlErrAllClearFailed, "3.3 Direct SQL INSERT with all NON_REACTIVE + FAILED blocked by chk_screening_overall_consistency");

        // 3d. Direct SQL INSERT with testedbyuserid = verifiedbyuserid
        let sqlErrSameUser = false;
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO unitscreeningrecords (
                    unitid, revisionnumber, iscurrent,
                    hivresult, hbvresult, hcvresult, syphilisresult, malariaresult,
                    overallstatus, testedbyuserid, verifiedbyuserid, verifiedat
                ) VALUES ($1::uuid, 1, true, 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'PASSED', $2::uuid, $2::uuid, NOW())`,
                u3.unitId,
                bbAUser.userid
            );
        } catch (e: any) {
            sqlErrSameUser = String(e.message || "").includes("chk_screening_dual_signoff");
        }
        assert(sqlErrSameUser, "3.4 Direct SQL INSERT with testedbyuserid = verifiedbyuserid blocked by chk_screening_dual_signoff");

        // 3e. Direct SQL INSERT with mismatched verification pair (verifiedbyuserid set, verifiedat NULL)
        let sqlErrVerPair = false;
        try {
            await prisma.$executeRawUnsafe(
                `INSERT INTO unitscreeningrecords (
                    unitid, revisionnumber, iscurrent,
                    hivresult, hbvresult, hcvresult, syphilisresult, malariaresult,
                    overallstatus, testedbyuserid, verifiedbyuserid, verifiedat
                ) VALUES ($1::uuid, 1, true, 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'PASSED', $2::uuid, $3::uuid, NULL)`,
                u3.unitId,
                bbAUser.userid,
                admin1User.userid
            );
        } catch (e: any) {
            sqlErrVerPair = String(e.message || "").includes("chk_screening_verification_pair");
        }
        assert(sqlErrVerPair, "3.5 Direct SQL INSERT with verifiedbyuserid set but verifiedat NULL blocked by chk_screening_verification_pair");

        // 3f. Submit valid Step 1 (pending verification), then attempt direct SQL UPDATE of inventoryunits to AVAILABLE without verification
        const u3Step1 = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u3.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
            },
            bbAToken
        );
        let sqlErrUnverifiedClearance = false;
        try {
            await prisma.$executeRawUnsafe(
                `UPDATE inventoryunits SET status = 'AVAILABLE', ttiscreeningstatus = 'PASSED' WHERE unitid = $1::uuid`,
                u3.unitId
            );
        } catch (e: any) {
            sqlErrUnverifiedClearance = String(e.message || "").includes("SAFETY VIOLATION");
        }
        assert(
            sqlErrUnverifiedClearance,
            "3.6 Direct SQL UPDATE inventoryunits to AVAILABLE with unverified screening record blocked by trg_enforce_unit_screening_clearance"
        );

        // 3g. Direct SQL UPDATE mutating recorded marker result & DELETE on unitscreeningrecords blocked by trg_protect_screening_records
        let sqlErrMutateResult = false;
        try {
            await prisma.$executeRawUnsafe(
                `UPDATE unitscreeningrecords SET hivresult = 'REACTIVE', overallstatus = 'FAILED' WHERE screeningid = $1::uuid`,
                u3Step1.data.screeningId
            );
        } catch (e: any) {
            sqlErrMutateResult = String(e.message || "").includes("CLINICAL VIOLATION");
        }
        let sqlErrDeleteRecord = false;
        try {
            await prisma.$executeRawUnsafe(
                `DELETE FROM unitscreeningrecords WHERE screeningid = $1::uuid`,
                u3Step1.data.screeningId
            );
        } catch (e: any) {
            sqlErrDeleteRecord = String(e.message || "").includes("CLINICAL VIOLATION");
        }
        assert(
            sqlErrMutateResult && sqlErrDeleteRecord,
            "3.7 Direct SQL UPDATE of recorded TTI results and DELETE on unitscreeningrecords blocked by trg_protect_screening_records"
        );

        // =========================================================================
        // SECTION 4: IN_TRANSIT, DELIVERED AND DISCARDED SCREENING REJECTION
        // =========================================================================
        console.log("\n--- 4. Lifecycle Protection: Reject Screening of IN_TRANSIT, DELIVERED & DISCARDED Units ---");
        // Prepare 3 units: uInTransit (IN_TRANSIT), uDelivered (DELIVERED), uDiscarded (DISCARDED)
        const uInTransit = await intakeFreshUnit();
        const uDelivered = await intakeFreshUnit();
        const uDiscarded = await intakeFreshUnit();

        // Discard uDiscarded via API
        const discardRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${uDiscarded.unitId}/discard`,
            { reason: "Damaged bag during quarantine inspection" },
            bbAToken
        );
        assert(discardRes.status === 200 && discardRes.data?.status === "DISCARDED", "4.1 Setup: uDiscarded transitioned to DISCARDED");

        // Clear uInTransit and uDelivered to AVAILABLE, reserve, crossmatch, and dispatch
        for (const u of [uInTransit, uDelivered]) {
            await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${u.unitId}/screening`,
                { ...ALL_NON_REACTIVE_PANEL, overallStatus: "PASSED" },
                bbAToken
            );
            await reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u.unitId}/screening/verify`, {}, admin1Token);
        }

        const bloodReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hosp.hospitalid,
                patientname: `AUD02 Patient ${tag}`,
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9830000099",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 2,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 86400000),
                status: "VERIFIED",
            },
        });
        const assignRes = await reqJson("POST", `/bloodrequests/${bloodReq.requestid}/assign`, { bloodBankId: bbA.bloodbankid }, hospToken);
        const assignmentId = assignRes.data.assignment.assignmentid;
        await reqJson("PATCH", `/bloodbanks/${bbA.bloodbankid}/assignments/${assignmentId}`, { action: "ACCEPT" }, bbAToken);

        const resAlloc = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/reservations`,
            {
                requestId: bloodReq.requestid,
                requestedUnits: 2,
                specificUnitIds: [uInTransit.unitId, uDelivered.unitId],
            },
            bbAToken,
            { "Idempotency-Key": `aud02-res-${tag}` }
        );
        const reservationId = resAlloc.data.reservation.reservationId;
        const itemInTransit = resAlloc.data.reservation.items.find((i: any) => i.unitId === uInTransit.unitId);
        const itemDelivered = resAlloc.data.reservation.items.find((i: any) => i.unitId === uDelivered.unitId);

        for (const item of [itemInTransit, itemDelivered]) {
            await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/crossmatches`,
                {
                    reservationItemId: item.itemId,
                    testedByUserId: bbAUser.userid,
                    verifiedByUserId: admin1User.userid,
                    methodology: "INDIRECT_ANTIGLOBULIN",
                    testResult: "COMPATIBLE",
                    validUntilHours: 72,
                },
                bbAToken
            );
        }

        const dispatchRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/reservations/${reservationId}/dispatch`,
            {
                courierName: "AUD02 ColdChain Courier",
                coldBoxSealNumber: `SEAL-${tag}`,
                initialTemperature: 4.0,
            },
            bbAToken,
            { "Idempotency-Key": `aud02-disp-${tag}` }
        );
        assert(dispatchRes.status === 200, "4.2 Setup: Both units dispatched to IN_TRANSIT");

        // Confirm hospital receipt ONLY for itemDelivered so uDelivered becomes DELIVERED while uInTransit stays IN_TRANSIT
        const receiptRes = await reqJson(
            "POST",
            `/bloodrequests/reservations/${reservationId}/receipt`,
            {
                itemReceipts: [
                    {
                        itemId: itemDelivered.itemId,
                        receivedStatus: "ACCEPTED",
                        tempReading: 4.1,
                        notes: "Delivered for AUD-02 test",
                    },
                ],
            },
            hospToken,
            { "Idempotency-Key": `aud02-rcpt-${tag}` }
        );
        assert(receiptRes.status === 200 && receiptRes.data?.deliveredCount === 1, "4.3 Setup: uDelivered transitioned to DELIVERED while uInTransit remains IN_TRANSIT");

        const lifecycleTargets = [
            { label: "IN_TRANSIT", unitId: uInTransit.unitId, inventoryId: uInTransit.inventoryId },
            { label: "DELIVERED", unitId: uDelivered.unitId, inventoryId: uDelivered.inventoryId },
            { label: "DISCARDED", unitId: uDiscarded.unitId, inventoryId: uDiscarded.inventoryId },
        ];

        for (const target of lifecycleTargets) {
            const [beforeUnit, beforeLot, beforeScrCount, beforeLedCount, beforeDispCount] = await Promise.all([
                prisma.inventoryunits.findUnique({ where: { unitid: target.unitId } }),
                prisma.inventory.findUnique({ where: { inventoryid: target.inventoryId } }),
                prisma.unitscreeningrecords.count({ where: { unitid: target.unitId } }),
                prisma.inventoryledger.count({ where: { inventoryid: target.inventoryId } }),
                prisma.unitdispositionhistory.count({ where: { unitid: target.unitId } }),
            ]);

            assert(beforeUnit?.status === target.label, `4.4 [${target.label}] Verified initial unit status is ${target.label}`);

            // API screening submission (PASSED and FAILED)
            const apiScreenPass = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${target.unitId}/screening`,
                { ...ALL_NON_REACTIVE_PANEL, overallStatus: "PASSED" },
                bbAToken
            );
            const apiScreenFail = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${target.unitId}/screening`,
                { ...ALL_NON_REACTIVE_PANEL, hbvResult: "REACTIVE", overallStatus: "FAILED" },
                bbAToken
            );
            const apiVerify = await reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/units/${target.unitId}/screening/verify`,
                {},
                admin1Token
            );

            assert(
                apiScreenPass.status === 400 && apiScreenFail.status === 400 && apiVerify.status === 400,
                `4.5 [${target.label}] API screening & verification attempts rejected with 400`,
                `pass=${apiScreenPass.status} fail=${apiScreenFail.status} verify=${apiVerify.status}`
            );

            // Direct SQL INSERT into unitscreeningrecords
            let sqlInsertBlocked = false;
            try {
                await prisma.$executeRawUnsafe(
                    `INSERT INTO unitscreeningrecords (
                        unitid, revisionnumber, iscurrent,
                        hivresult, hbvresult, hcvresult, syphilisresult, malariaresult,
                        overallstatus, testedbyuserid
                    ) VALUES ($1::uuid, 99, false, 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'NON_REACTIVE', 'PASSED', $2::uuid)`,
                    target.unitId,
                    bbAUser.userid
                );
            } catch (e: any) {
                sqlInsertBlocked = String(e.message || "").includes("CLINICAL VIOLATION");
            }

            // Direct SQL UPDATE of ttiscreeningstatus on inventoryunits
            let sqlUpdateBlocked = false;
            try {
                await prisma.$executeRawUnsafe(
                    `UPDATE inventoryunits SET ttiscreeningstatus = 'FAILED' WHERE unitid = $1::uuid`,
                    target.unitId
                );
            } catch (e: any) {
                sqlUpdateBlocked = String(e.message || "").includes("SAFETY VIOLATION");
            }

            assert(
                sqlInsertBlocked && sqlUpdateBlocked,
                `4.6 [${target.label}] Direct SQL INSERT on unitscreeningrecords and UPDATE on inventoryunits blocked by database triggers`
            );

            const [afterUnit, afterLot, afterScrCount, afterLedCount, afterDispCount] = await Promise.all([
                prisma.inventoryunits.findUnique({ where: { unitid: target.unitId } }),
                prisma.inventory.findUnique({ where: { inventoryid: target.inventoryId } }),
                prisma.unitscreeningrecords.count({ where: { unitid: target.unitId } }),
                prisma.inventoryledger.count({ where: { inventoryid: target.inventoryId } }),
                prisma.unitdispositionhistory.count({ where: { unitid: target.unitId } }),
            ]);

            assert(
                afterUnit?.status === beforeUnit?.status &&
                    afterUnit?.ttiscreeningstatus === beforeUnit?.ttiscreeningstatus &&
                    afterUnit?.currentscreeningid === beforeUnit?.currentscreeningid &&
                    afterLot?.unitsavailable === beforeLot?.unitsavailable &&
                    afterLot?.unitsreserved === beforeLot?.unitsreserved &&
                    afterLot?.unitsquarantined === beforeLot?.unitsquarantined &&
                    afterScrCount === beforeScrCount &&
                    afterLedCount === beforeLedCount &&
                    afterDispCount === beforeDispCount,
                `4.7 [${target.label}] Rejected operations created zero screening records, ledger entries, disposition history entries, or counter changes`
            );
        }

        // =========================================================================
        // SECTION 5: CLIENT-SUPPLIED VERIFIER ID, TESTER SPOOFING & SELF-VERIFICATION REJECTED
        // =========================================================================
        console.log("\n--- 5. Client-Supplied Verifier ID, Tester Spoofing & Self-Verification Rejection ---");
        const u5 = await intakeFreshUnit();

        // 5a. Client-supplied verifiedByUserId on POST /screening
        const clientSuppliedVerifierRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
                verifiedByUserId: admin1User.userid,
            },
            bbAToken
        );
        assert(
            clientSuppliedVerifierRes.status === 403,
            "5.1 Client-supplied verifiedByUserId on POST /screening rejected with 403",
            `got ${clientSuppliedVerifierRes.status}`
        );

        // 5b. Client-supplied testedByUserId spoofing on POST /screening
        const spoofedTesterRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
                testedByUserId: admin1User.userid,
            },
            bbAToken
        );
        assert(
            spoofedTesterRes.status === 403,
            "5.2 Client-supplied spoofed testedByUserId on POST /screening rejected with 403",
            `got ${spoofedTesterRes.status}`
        );

        await assertUnitUnchangedInQuarantine(
            u5.unitId,
            u5.inventoryId,
            0,
            1,
            1,
            "5.3 Unit remains untouched in QUARANTINED after client-supplied verifier & tester spoofing attempts"
        );

        // 5c. Legitimate Step 1 submission by bbAUser, followed by self-verification attempt & verifier spoofing attempts
        const u5Submit = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
            },
            bbAToken
        );
        assert(u5Submit.status === 200, "5.4 Tester submits valid pending screening record (HTTP 200)");

        // Self-verification by same tester (bbAUser)
        const selfVerifyRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`,
            {},
            bbAToken
        );
        assert(
            selfVerifyRes.status === 403,
            "5.5 Self-verification by tester rejected with 403",
            `got ${selfVerifyRes.status}`
        );

        // Tester tries to pass verifiedByUserId: admin1User.userid while authenticated as bbAToken on /screening/verify
        const spoofedVerifierOnVerifyRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`,
            { verifiedByUserId: admin1User.userid },
            bbAToken
        );
        assert(
            spoofedVerifierOnVerifyRes.status === 403,
            "5.6 Spoofed verifiedByUserId on POST /screening/verify rejected with 403",
            `got ${spoofedVerifierOnVerifyRes.status}`
        );

        // Verifier tries to override testedByUserId on /screening/verify
        const overrideTesterOnVerifyRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`,
            { testedByUserId: admin2User.userid },
            admin1Token
        );
        assert(
            overrideTesterOnVerifyRes.status === 403,
            "5.7 Supplying testedByUserId on POST /screening/verify rejected with 403",
            `got ${overrideTesterOnVerifyRes.status}`
        );

        // Also test Admin1 submits screening, then Admin1 tries to self-verify
        const u5AdminSelf = await intakeFreshUnit();
        await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5AdminSelf.unitId}/screening`,
            { ...ALL_NON_REACTIVE_PANEL, overallStatus: "PASSED" },
            admin1Token
        );
        const adminSelfVerifyRes = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5AdminSelf.unitId}/screening/verify`,
            {},
            admin1Token
        );
        assert(
            adminSelfVerifyRes.status === 403,
            "5.8 Admin who acted as tester cannot self-verify their own screening (403)"
        );

        // =========================================================================
        // SECTION 6: INACTIVE, WRONG-ROLE, UNAFFILIATED & UNAPPROVED-FACILITY VERIFIER REJECTION
        // =========================================================================
        console.log("\n--- 6. Inactive, Wrong-Role, Unaffiliated & Unapproved-Facility Verifier Rejection ---");

        // 6a. Inactive verifier (via HTTP JWT and via direct service transaction call)
        const inactiveHttpVerify = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`,
            {},
            inactiveAdminToken
        );
        let inactiveServiceBlocked = false;
        try {
            await UnitTraceabilityService.verifyScreeningClearance({
                unitId: u5.unitId,
                bloodBankId: bbA.bloodbankid,
                verifierUserId: inactiveAdminUser.userid,
            });
        } catch (e: any) {
            inactiveServiceBlocked = e.statusCode === 403;
        }
        assert(
            inactiveHttpVerify.status === 403 && inactiveServiceBlocked,
            "6.1 Inactive verifier rejected at both HTTP middleware (403) and service transaction layer (403)"
        );

        // 6b. Wrong-role verifiers (HOSPITAL, DONOR, REQUESTER)
        const [hospVerify, donorVerify, reqVerify] = await Promise.all([
            reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`, {}, hospToken),
            reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`, {}, donorToken),
            reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`, {}, requesterToken),
        ]);
        let wrongRoleServiceBlocked = false;
        try {
            await UnitTraceabilityService.verifyScreeningClearance({
                unitId: u5.unitId,
                bloodBankId: bbA.bloodbankid,
                verifierUserId: hospUser.userid,
            });
        } catch (e: any) {
            wrongRoleServiceBlocked = e.statusCode === 403;
        }
        assert(
            hospVerify.status === 403 &&
                donorVerify.status === 403 &&
                reqVerify.status === 403 &&
                wrongRoleServiceBlocked,
            "6.2 Wrong-role verifiers (HOSPITAL, DONOR, REQUESTER) rejected with 403 at HTTP and service transaction layers"
        );

        // 6c. Unaffiliated BLOOD_BANK verifiers (bbBUser from Blood Bank B, and orphanBbUser with no facility)
        const [crossBbVerify, orphanBbVerify] = await Promise.all([
            reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`, {}, bbBToken),
            reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`, {}, orphanBbToken),
        ]);
        let unaffiliatedServiceBlocked = false;
        try {
            await UnitTraceabilityService.verifyScreeningClearance({
                unitId: u5.unitId,
                bloodBankId: bbA.bloodbankid,
                verifierUserId: bbBUser.userid,
            });
        } catch (e: any) {
            unaffiliatedServiceBlocked = e.statusCode === 403;
        }
        assert(
            crossBbVerify.status === 403 && orphanBbVerify.status === 403 && unaffiliatedServiceBlocked,
            "6.3 Unaffiliated BLOOD_BANK verifiers (other facility & orphan BLOOD_BANK account) rejected with 403"
        );

        // Verify that after all failed verification attempts in Sections 5 & 6, u5 is STILL QUARANTINED with no partial writes!
        const u5ScrAfterFailures = await prisma.unitscreeningrecords.findUnique({
            where: { screeningid: u5Submit.data.screeningId },
        });
        await assertUnitUnchangedInQuarantine(
            u5.unitId,
            u5.inventoryId,
            1, // only the 1 pending screening record from 5.4
            1, // only initial STOCK_INTAKE ledger row (0 SCREENING_CLEARANCE rows)
            2, // only initial intake + 5.4 pending submission disposition row
            "6.4 Failed verifications leave unit QUARANTINED with ttiscreeningstatus=PENDING and zero partial writes"
        );
        assert(
            u5ScrAfterFailures?.verifiedbyuserid === null && u5ScrAfterFailures?.verifiedat === null,
            "6.5 Pending screening record still has verifiedbyuserid=null and verifiedat=null after all rejected verification attempts"
        );

        // 6d. Unapproved-facility rejection (PENDING and REJECTED blood banks, including when facility status changes before verification)
        const pendIntakeAttempt = await reqJson(
            "POST",
            `/bloodbanks/${bbPending.bloodbankid}/units/intake`,
            {
                bloodGroup: "O+",
                bloodComponent: "RBC",
                expiryDate: new Date(Date.now() + 90 * 86400000).toISOString(),
                units: [{ unitBarcode: `PEND-U-${tag}` }],
            },
            admin1Token,
            { "Idempotency-Key": `aud02-pend-intake-${tag}` }
        );
        const rejIntakeAttempt = await reqJson(
            "POST",
            `/bloodbanks/${bbRejected.bloodbankid}/units/intake`,
            {
                bloodGroup: "O+",
                bloodComponent: "RBC",
                expiryDate: new Date(Date.now() + 90 * 86400000).toISOString(),
                units: [{ unitBarcode: `REJ-U-${tag}` }],
            },
            rejectedBbToken,
            { "Idempotency-Key": `aud02-rej-intake-${tag}` }
        );
        assert(
            pendIntakeAttempt.status === 403 && rejIntakeAttempt.status === 403,
            "6.6 Unapproved (PENDING/REJECTED) blood banks blocked from unit intake even when called by ADMIN (403)"
        );

        // Temporarily set bbA to PENDING to verify that verification on u5 is blocked while facility is unapproved, then restore APPROVED
        await prisma.bloodbanks.update({
            where: { bloodbankid: bbA.bloodbankid },
            data: { approvalstatus: "PENDING" },
        });
        const verifyWhileFacilityPendingByAdmin = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`,
            {},
            admin1Token
        );
        const verifyWhileFacilityPendingByOwner = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`,
            {},
            bbAToken
        );
        await prisma.bloodbanks.update({
            where: { bloodbankid: bbA.bloodbankid },
            data: { approvalstatus: "APPROVED" },
        });
        assert(
            verifyWhileFacilityPendingByAdmin.status === 403 && verifyWhileFacilityPendingByOwner.status === 403,
            "6.7 Verification rejected with 403 when blood bank facility approvalstatus is not APPROVED (for both ADMIN and BLOOD_BANK callers)"
        );

        // =========================================================================
        // SECTION 7: CONCURRENT VERIFICATION ATTEMPTS & REPEATED SUBMISSIONS
        // =========================================================================
        console.log("\n--- 7. Concurrent Verification Serialization & Repeated Submissions ---");

        // 7a. Concurrent verification of u5 by admin1Token and admin2Token simultaneously
        const [concVer1, concVer2] = await Promise.all([
            reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`, {}, admin1Token),
            reqJson("POST", `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`, {}, admin2Token),
        ]);
        const concStatuses = [concVer1.status, concVer2.status].sort();
        const [u5AfterConc, lot5AfterConc, led5AfterConc] = await Promise.all([
            prisma.inventoryunits.findUnique({ where: { unitid: u5.unitId } }),
            prisma.inventory.findUnique({ where: { inventoryid: u5.inventoryId } }),
            prisma.inventoryledger.findMany({ where: { inventoryid: u5.inventoryId, operationtype: "SCREENING_CLEARANCE" } }),
        ]);
        assert(
            concStatuses[0] === 200 &&
                concStatuses[1] === 409 &&
                u5AfterConc?.status === "AVAILABLE" &&
                lot5AfterConc?.unitsavailable === 1 &&
                lot5AfterConc?.unitsquarantined === 0 &&
                led5AfterConc.length === 1,
            "7.1 Concurrent verification allows exactly one 200 OK and rejects the competing request with 409 Conflict (single ledger & counter update)",
            `statuses=${concStatuses.join(",")} avail=${lot5AfterConc?.unitsavailable} led=${led5AfterConc.length}`
        );

        // 7b. Repeated verification attempt on already-verified record
        const repeatVerify = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u5.unitId}/screening/verify`,
            {},
            admin1Token
        );
        assert(repeatVerify.status === 409, "7.2 Repeated verification on already-verified record rejected with 409 Conflict");

        // 7c. Repeated screening submissions supersede prior pending record; stale screeningId rejected, current screeningId verified
        const u7 = await intakeFreshUnit();
        const subRev1 = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u7.unitId}/screening`,
            { ...ALL_NON_REACTIVE_PANEL, overallStatus: "PASSED", laboratoryRemarks: "Initial run" },
            bbAToken
        );
        const subRev2 = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u7.unitId}/screening`,
            { ...ALL_NON_REACTIVE_PANEL, overallStatus: "PASSED", laboratoryRemarks: "Repeat confirmation run" },
            bbAToken
        );
        assert(
            subRev1.status === 200 && subRev2.status === 200 && subRev2.data?.revisionNumber === 2,
            "7.3 Repeated screening submission supersedes Revision 1 and creates Revision 2"
        );

        const verifyStaleRev1 = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u7.unitId}/screening/${subRev1.data.screeningId}/verify`,
            {},
            admin1Token
        );
        assert(
            verifyStaleRev1.status === 409,
            "7.4 Attempting to verify superseded Revision 1 screeningId rejected with 409 Conflict"
        );

        const verifyCurrentRev2 = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${u7.unitId}/screening/${subRev2.data.screeningId}/verify`,
            {},
            admin1Token
        );
        assert(
            verifyCurrentRev2.status === 200 && verifyCurrentRev2.data?.unitStatus === "AVAILABLE",
            "7.5 Verifying active Revision 2 screeningId succeeds (200) and releases unit to AVAILABLE"
        );

        // Check screening history endpoint preserves both revisions
        const histRes = await reqJson(
            "GET",
            `/bloodbanks/${bbA.bloodbankid}/units/${u7.unitId}/screening-history`,
            undefined,
            bbAToken
        );
        assert(
            histRes.status === 200 &&
                histRes.data?.history?.length === 2 &&
                histRes.data.history[0].revisionnumber === 2 &&
                histRes.data.history[0].iscurrent === true &&
                histRes.data.history[0].verifiedby?.userid === admin1User.userid &&
                histRes.data.history[1].revisionnumber === 1 &&
                histRes.data.history[1].iscurrent === false &&
                histRes.data.history[1].verifiedby === null,
            "7.6 GET /screening-history preserves immutable revision log with nullable verifiedby on superseded unverified revision"
        );

        // Check inventory reconciliation across all lots in bbA
        const reconRes = await reqJson(
            "GET",
            `/bloodbanks/${bbA.bloodbankid}/inventory/reconciliation`,
            undefined,
            bbAToken
        );
        const allReconciled = (reconRes.data?.report || []).every(
            (r: any) =>
                r.is_available_reconciled === true &&
                r.is_reserved_reconciled === true &&
                r.is_quarantined_reconciled === true &&
                r.is_ledger_balanced === true
        );
        assert(
            reconRes.status === 200 && allReconciled,
            "7.7 Full multi-state inventory & ledger reconciliation passes across all test lots"
        );

        console.log("\n===============================================================================");
        console.log(`  AUD-02 TEST SUITE RESULT: ${passed} PASSED, ${failed} FAILED`);
        console.log("===============================================================================\n");

        if (failed > 0) {
            console.error("Failed assertions:", failures);
            process.exitCode = 1;
        }
    } finally {
        server.close();
        await prisma.$disconnect();
    }
}

runTests().catch((err) => {
    console.error("AUD-02 test suite fatal error:", err);
    process.exit(1);
});
