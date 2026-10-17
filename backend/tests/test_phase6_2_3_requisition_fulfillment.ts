import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, user_role } from "../src/generated/prisma/enums";
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

async function runTestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 6.2.3: FULL LIFECYCLE REQUISITION & TRACEABILITY TEST SUITE    ");
    console.log("===============================================================================\n");

    // 1. Setup test server
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, () => {
            const address = server.address() as any;
            API_BASE = `http://127.0.0.1:${address.port}`;
            console.log(`Test API running at ${API_BASE}\n`);
            resolve();
        });
    });

    try {
        // 2. Fetch or create test blood bank and users
        const bb = await prisma.bloodbanks.findFirst({
            include: { users: true },
        });
        if (!bb) {
            throw new Error("No blood bank found in database. Seed data required.");
        }
        const bloodBankId = bb.bloodbankid;
        const bbUser = bb.users;
        const bbToken = generateToken(bbUser.userid, user_role.BLOOD_BANK);

        // Create two distinct clinical staff users for dual signoff
        const timestamp = Date.now();
        const tester = await prisma.users.create({
            data: {
                email: `tester_${timestamp}@swastya.org`,
                name: "Clinical Lab Tester",
                password: "hashedpassword123",
                role: user_role.BLOOD_BANK,
            },
        });
        const verifier = await prisma.users.create({
            data: {
                email: `verifier_${timestamp}@swastya.org`,
                name: "Quality Assurance Verifier",
                password: "hashedpassword123",
                role: user_role.BLOOD_BANK,
            },
        });

        const hospitalUser = await prisma.users.findFirst({
            where: { role: user_role.HOSPITAL },
        });
        const hospitalToken = generateToken(
            hospitalUser ? hospitalUser.userid : bbUser.userid,
            user_role.HOSPITAL
        );

        console.log("-------------------------------------------------------------------------------");
        console.log("TEST 1: TC-6.2.3-D01 Legacy Opening Balance Ledger Baseline & Isolation");
        console.log("-------------------------------------------------------------------------------");
        let legacyExpiry = new Date(Date.now() + (2000 + Math.floor(Math.random() * 500000)) * 24 * 60 * 60 * 1000);
        legacyExpiry.setUTCHours(0, 0, 0, 0);
        while (await prisma.inventory.findFirst({ where: { bloodbankid: bloodBankId, bloodgroup: blood_group.B_POSITIVE, bloodcomponent: blood_component.RBC, expirydate: legacyExpiry } })) {
            legacyExpiry = new Date(legacyExpiry.getTime() + 24 * 60 * 60 * 1000);
        }
        const legacyLot = await prisma.inventory.create({
            data: {
                bloodbankid: bloodBankId,
                bloodgroup: blood_group.B_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsavailable: 10,
                unitsreserved: 0,
                unitsquarantined: 0,
                islegacyreconciled: false, // unreconciled legacy stock
                expirydate: legacyExpiry,
            },
        });

        // Initialize baseline opening balance ledger entry
        await prisma.inventoryledger.create({
            data: {
                inventoryid: legacyLot.inventoryid,
                bloodbankid: bloodBankId,
                actoruserid: bbUser.userid,
                operationtype: "OPENING_BALANCE_INITIALIZATION",
                quantitydelta: 10,
                previousavailable: 0,
                newavailable: 10,
                previousreserved: 0,
                newreserved: 0,
                reason: "Legacy Baseline Initialization",
                idempotencykey: `opening-balance:legacy:${legacyLot.inventoryid}`,
                requesthash: "0000000000000000000000000000000000000000000000000000000000000000",
                responsecode: 200,
                responsebody: { lotId: legacyLot.inventoryid, units: 10 } as any,
            },
        });

        // Verify reconciliation query recognizes opening balance
        const reconRes = await getJson(`/bloodbanks/${bloodBankId}/inventory/reconciliation?inventoryId=${legacyLot.inventoryid}`, bbToken);
        if (reconRes.status !== 200) {
            console.error("ReconRes error status:", reconRes.status, "data:", reconRes.data);
        }
        assert(reconRes.status === 200, "Reconciliation endpoint returns 200");
        assert(reconRes.data.report.length === 1, "Report contains 1 legacy lot");
        assert(Number(reconRes.data.report[0].net_ledger_stock) === 10, "Net ledger balance equals opening balance 10");
        assert(reconRes.data.report[0].is_ledger_balanced === true, "Legacy lot ledger is mathematically balanced");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 2: TC-6.2.3-D02 Multi-Unit Intake, Quarantine Default & Dual Signoff");
        console.log("-------------------------------------------------------------------------------");
        const intakeKey = `intake-test-${timestamp}-${crypto.randomUUID()}`;
        const unit1Barcode = `BAR-O-01-${timestamp}`;
        const unit2Barcode = `BAR-O-02-${timestamp}`;
        const unit3Barcode = `BAR-O-03-${timestamp}`;

        const intakeRes = await postJson(
            `/bloodbanks/${bloodBankId}/units/intake`,
            bbToken,
            {
                bloodGroup: "O+",
                bloodComponent: "RBC",
                expiryDate: new Date(Date.now() + (50000 + Math.floor(Math.random() * 500000)) * 24 * 60 * 60 * 1000).toISOString(),
                units: [
                    { unitBarcode: unit1Barcode, donationIdentificationNumber: "DIN-001" },
                    { unitBarcode: unit2Barcode, donationIdentificationNumber: "DIN-002" },
                    { unitBarcode: unit3Barcode, donationIdentificationNumber: "DIN-003" },
                ],
                reason: "Routine Mobile Blood Donation Drive",
            },
            { "Idempotency-Key": intakeKey }
        );

        assert(intakeRes.status === 201, "Unit intake returns 201 Created");
        assert(intakeRes.data.units.length === 3, "3 units created in database");
        assert(intakeRes.data.units[0].status === "QUARANTINED", "Units start in QUARANTINED status");
        assert(intakeRes.data.units[0].screeningStatus === "PENDING", "Units start with screening PENDING");
        assert(intakeRes.data.lot.unitsQuarantined === 3, "Lot quarantined counter incremented to 3");

        const u1Id = intakeRes.data.units[0].unitId;
        const u2Id = intakeRes.data.units[1].unitId;
        const u3Id = intakeRes.data.units[2].unitId;

        // Verify trigger blocks direct status update to AVAILABLE without screening
        try {
            await prisma.$executeRawUnsafe(`UPDATE inventoryunits SET status = 'AVAILABLE' WHERE unitid = '${u1Id}'::uuid`);
            assert(false, "Trigger should have blocked un-screened unit clearance");
        } catch (err: any) {
            assert(err.message.includes("SAFETY VIOLATION"), "PostgreSQL trigger trg_enforce_unit_screening_clearance blocked un-screened clearance");
        }

        // Test dual-signoff enforcement: tester cannot equal verifier
        const invalidSignoffRes = await postJson(
            `/bloodbanks/${bloodBankId}/units/${u1Id}/screening`,
            bbToken,
            {
                testedByUserId: tester.userid,
                verifiedByUserId: tester.userid, // same user!
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NEGATIVE",
                overallStatus: "PASSED",
            }
        );
        assert(invalidSignoffRes.status === 400, "Same user for tester & verifier rejected with 400");
        assert(invalidSignoffRes.data.message.includes("distinct"), "Error message demands distinct personnel");

        // Clear all 3 units with valid dual-signoff
        for (const uid of [u1Id, u2Id, u3Id]) {
            const clearRes = await postJson(
                `/bloodbanks/${bloodBankId}/units/${uid}/screening`,
                bbToken,
                {
                    testedByUserId: tester.userid,
                    verifiedByUserId: verifier.userid,
                    hivResult: "NON_REACTIVE",
                    hbvResult: "NON_REACTIVE",
                    hcvResult: "NON_REACTIVE",
                    syphilisResult: "NON_REACTIVE",
                    malariaResult: "NEGATIVE",
                    overallStatus: "PASSED",
                    laboratoryRemarks: "5-panel chemiluminescence assay non-reactive",
                }
            );
            assert(clearRes.status === 200, `Unit ${uid} screening clearance succeeded`);
            assert(clearRes.data.unitStatus === "AVAILABLE", `Unit ${uid} transitioned to AVAILABLE`);
        }

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 3: TC-6.2.3-D03 Screening Amendment & Superseded Record Revocation");
        console.log("-------------------------------------------------------------------------------");
        // Amend Unit 3 with a confirmatory reactive result
        const amendRes = await postJson(
            `/bloodbanks/${bloodBankId}/units/${u3Id}/screening`,
            bbToken,
            {
                testedByUserId: tester.userid,
                verifiedByUserId: verifier.userid,
                hivResult: "NON_REACTIVE",
                hbvResult: "REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NEGATIVE",
                overallStatus: "FAILED",
                laboratoryRemarks: "Confirmatory EIA indicates HBV surface antigen reactivity",
            }
        );
        assert(amendRes.status === 200, "Screening amendment recorded successfully");
        assert(amendRes.data.revisionNumber === 2, "Screening revision incremented to 2");
        assert(amendRes.data.unitStatus === "QUARANTINED", "Unit instantly revoked back to QUARANTINED");

        // Verify screening history preserves both revisions
        const histRes = await getJson(`/bloodbanks/${bloodBankId}/units/${u3Id}/screening-history`, bbToken);
        assert(histRes.status === 200, "Screening history fetched");
        assert(histRes.data.history.length === 2, "Both screening revisions preserved in immutable log");
        assert(histRes.data.history[0].iscurrent === true, "Latest revision is marked current");
        assert(histRes.data.history[1].iscurrent === false, "Older revision marked superseded (iscurrent = false)");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 4: TC-6.2.3-D04 Requisition Assignment & Multi-Unit Reservation");
        console.log("-------------------------------------------------------------------------------");
        // Create a blood request for O+ RBC
        const bloodReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospitalUser ? hospitalUser.userid : bbUser.userid,
                patientname: "Rahul Verma",
                patientage: 45,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 2,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 48 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });

        // Assign to blood bank
        const assignRes = await postJson(`/bloodrequests/${bloodReq.requestid}/assign`, hospitalToken, {
            bloodBankId,
        });
        assert(assignRes.status === 201, "Requisition assigned to blood bank");
        const assignmentId = assignRes.data.assignment.assignmentid;

        // Accept assignment
        const acceptRes = await patchJson(`/bloodbanks/${bloodBankId}/assignments/${assignmentId}`, bbToken, {
            action: "ACCEPT",
        });
        assert(acceptRes.status === 200, "Blood bank accepted requisition assignment");
        assert(acceptRes.data.assignment.assignmentstatus === "ACCEPTED", "Assignment status is ACCEPTED");

        // Allocate reservation for 2 units
        const reserveKey = `res-test-${timestamp}-${crypto.randomUUID()}`;
        const resAllocRes = await postJson(
            `/bloodbanks/${bloodBankId}/reservations`,
            bbToken,
            {
                requestId: bloodReq.requestid,
                requestedUnits: 2,
                specificUnitIds: [u1Id, u2Id],
            },
            { "Idempotency-Key": reserveKey }
        );

        assert(resAllocRes.status === 201, "Reservation allocation succeeded");
        assert(resAllocRes.data.reservation.items.length === 2, "2 reservation items allocated");
        const reservationId = resAllocRes.data.reservation.reservationId;
        const item1 = resAllocRes.data.reservation.items.find((i: any) => i.unitId === u1Id);
        const item2 = resAllocRes.data.reservation.items.find((i: any) => i.unitId === u2Id);
        const item1Id = item1 ? item1.itemId : resAllocRes.data.reservation.items[0].itemId;
        const item2Id = item2 ? item2.itemId : resAllocRes.data.reservation.items[1].itemId;

        // Test idempotency: replaying same reservation request returns identical result
        const retryRes = await postJson(
            `/bloodbanks/${bloodBankId}/reservations`,
            bbToken,
            {
                requestId: bloodReq.requestid,
                requestedUnits: 2,
                specificUnitIds: [u1Id, u2Id],
            },
            { "Idempotency-Key": reserveKey }
        );
        assert(retryRes.status === 201, "Idempotent retry returned 201");
        assert(retryRes.data.reservation.reservationId === reservationId, "Same reservation returned without duplication");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 5: TC-6.2.3-D05 4-Way Crossmatch Lock, Retesting & 72h Expiry");
        console.log("-------------------------------------------------------------------------------");
        // Verify 4-way consistency trigger blocks crossmatch on mismatched request/unit
        try {
            await prisma.$executeRawUnsafe(`
                INSERT INTO clinicalcrossmatches (
                    reservationitemid, reservationid, requestid, unitid,
                    attemptnumber, iscurrent, methodology, testresult, validuntil,
                    testedbyuserid, verifiedbyuserid
                ) VALUES (
                    '${item1Id}'::uuid, '${reservationId}'::uuid, '${bloodReq.requestid}'::uuid, '${u3Id}'::uuid,
                    1, true, 'GEL_CARD', 'COMPATIBLE', NOW() + INTERVAL '72 hours',
                    '${tester.userid}'::uuid, '${verifier.userid}'::uuid
                )
            `);
            assert(false, "Trigger should have blocked mismatched unit in crossmatch");
        } catch (err: any) {
            assert(err.message.includes("INTEGRITY VIOLATION"), "PostgreSQL trigger trg_enforce_crossmatch_integrity blocked mismatched unit");
        }

        // Record initial compatible crossmatch for Item 1
        const xm1Res = await postJson(`/bloodbanks/${bloodBankId}/crossmatches`, bbToken, {
            reservationItemId: item1Id,
            testedByUserId: tester.userid,
            verifiedByUserId: verifier.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
            validUntilHours: 72,
        });
        assert(xm1Res.status === 200, "Item 1 crossmatch recorded COMPATIBLE");
        assert(xm1Res.data.itemStatus === "PREPARED", "Item 1 transitioned to PREPARED");

        // Retest Item 1 (e.g. antibody re-screen)
        const xm1Retest = await postJson(`/bloodbanks/${bloodBankId}/crossmatches`, bbToken, {
            reservationItemId: item1Id,
            testedByUserId: tester.userid,
            verifiedByUserId: verifier.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
            validUntilHours: 48,
        });
        assert(xm1Retest.status === 200, "Item 1 re-test recorded successfully");
        assert(xm1Retest.data.attemptNumber === 2, "Crossmatch attempt number incremented to 2");

        // Record crossmatch for Item 2
        const xm2Res = await postJson(`/bloodbanks/${bloodBankId}/crossmatches`, bbToken, {
            reservationItemId: item2Id,
            testedByUserId: tester.userid,
            verifiedByUserId: verifier.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
            validUntilHours: 72,
        });
        assert(xm2Res.status === 200, "Item 2 crossmatch recorded COMPATIBLE");
        assert(xm2Res.data.itemStatus === "PREPARED", "Item 2 transitioned to PREPARED");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 6: TC-6.2.3-D06 Controlled Dispatch & Physical Vault Ledger Decrement");
        console.log("-------------------------------------------------------------------------------");
        const dispatchKey = `dispatch-test-${timestamp}-${crypto.randomUUID()}`;
        const dispatchRes = await postJson(
            `/bloodbanks/${bloodBankId}/reservations/${reservationId}/dispatch`,
            bbToken,
            {
                courierName: "MediTrans Urgent Courier",
                trackingId: "MED-99214-DEL",
                coldBoxSealNumber: "SEAL-A8821",
                initialTemperature: 3.8, // calibrated 2°C–6°C
            },
            { "Idempotency-Key": dispatchKey }
        );

        assert(dispatchRes.status === 200, "Dispatch confirmed with 200 OK");
        assert(dispatchRes.data.status === "DISPATCHED", "Reservation status is DISPATCHED");
        assert(dispatchRes.data.dispatchedUnits === 2, "2 units dispatched");

        // Verify units in DB are now IN_TRANSIT
        const dispatchedUnits = await prisma.inventoryunits.findMany({
            where: { unitid: { in: [u1Id, u2Id] } },
        });
        assert(dispatchedUnits[0].status === "IN_TRANSIT", "Unit 1 is IN_TRANSIT");
        assert(dispatchedUnits[1].status === "IN_TRANSIT", "Unit 2 is IN_TRANSIT");

        // Verify DISPATCH_DEPARTURE ledger entry recorded with quantitydelta = -2
        const dispatchLedger = await prisma.inventoryledger.findFirst({
            where: {
                idempotencykey: { contains: "DISPATCH_DEPARTURE" },
            },
            orderBy: { createdat: "desc" },
        });
        assert(dispatchLedger !== null, "DISPATCH_DEPARTURE ledger entry created");
        assert(dispatchLedger!.quantitydelta === -2, "Ledger records physical vault decrement of -2");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 7: TC-6.2.3-D07 Hospital Receipt vs Courier Excursion Quarantine");
        console.log("-------------------------------------------------------------------------------");
        const receiptKey = `receipt-test-${timestamp}-${crypto.randomUUID()}`;
        const receiptRes = await postJson(
            `/bloodrequests/reservations/${reservationId}/receipt`,
            hospitalToken,
            {
                itemReceipts: [
                    {
                        itemId: item1Id,
                        receivedStatus: "ACCEPTED",
                        tempReading: 4.2,
                        notes: "Received in optimal cold condition",
                    },
                    {
                        itemId: item2Id,
                        receivedStatus: "REJECTED_EXCURSION",
                        tempReading: 12.8, // severe excursion!
                        notes: "Cold box breached, temperature 12.8°C",
                    },
                ],
            },
            { "Idempotency-Key": receiptKey }
        );

        assert(receiptRes.status === 200, "Receipt processed successfully");
        assert(receiptRes.data.deliveredCount === 1, "1 unit marked DELIVERED");
        assert(receiptRes.data.excursionCount === 1, "1 unit flagged for EXCURSION");

        // Verify Unit 1 is DELIVERED and Unit 2 is QUARANTINED (never auto-discarded!)
        const u1Delivered = await prisma.inventoryunits.findUnique({ where: { unitid: u1Id } });
        const u2Excursion = await prisma.inventoryunits.findUnique({ where: { unitid: u2Id } });
        assert(u1Delivered!.status === "DELIVERED", "Unit 1 status is DELIVERED");
        assert(u2Excursion!.status === "QUARANTINED", "Unit 2 status is QUARANTINED (fail-closed safety)");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 8: TC-6.2.3-D08 Full Multi-State Inventory Ledger Reconciliation");
        console.log("-------------------------------------------------------------------------------");
        // Run full reconciliation query on the active lot
        const fullReconRes = await getJson(
            `/bloodbanks/${bloodBankId}/inventory/reconciliation?inventoryId=${intakeRes.data.lot.inventoryId}`,
            bbToken
        );
        assert(fullReconRes.status === 200, "Reconciliation endpoint returned 200");
        const report = fullReconRes.data.report[0];

        console.log("  Reconciliation Report State:", {
            tableAvailable: report.table_available,
            tableReserved: report.table_reserved,
            tableQuarantined: report.table_quarantined,
            unitAvailable: report.unit_available,
            unitReserved: report.unit_reserved,
            unitQuarantined: report.unit_quarantined,
            unitInTransit: report.unit_in_transit,
            unitDelivered: report.unit_delivered,
            netLedgerStock: report.net_ledger_stock,
            isLedgerBalanced: report.is_ledger_balanced,
        });

        assert(report.is_available_reconciled === true, "Available stock reconciled");
        assert(report.is_reserved_reconciled === true, "Reserved stock reconciled");
        assert(report.is_quarantined_reconciled === true, "Quarantined stock reconciled");
        assert(report.is_ledger_balanced === true, "Vault physical stock equals sum of ledger quantitydelta");
        assert(Number(report.unit_total_universe) === 3, "Total tracked universe matches intake count (3 units)");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 9: TC-6.2.3-D09 Authorized Disposal Workflow");
        console.log("-------------------------------------------------------------------------------");
        const discardRes = await postJson(`/bloodbanks/${bloodBankId}/units/${u3Id}/discard`, bbToken, {
            reason: "HBV Confirmatory Reactive: Autoclave & Biohazard Incineration",
        });
        assert(discardRes.status === 200, "Discard endpoint returned 200");
        assert(discardRes.data.status === "DISCARDED", "Unit transitioned to DISCARDED");

        const discardedUnit = await prisma.inventoryunits.findUnique({ where: { unitid: u3Id } });
        assert(discardedUnit!.status === "DISCARDED", "Unit in DB marked DISCARDED");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("TEST 10: TC-6.2.3-D10 Concurrency & Serialization Proof");
        console.log("-------------------------------------------------------------------------------");
        // Intake 1 unit
        const cBarcode = `BAR-C01-${timestamp}`;
        const cIntake = await postJson(
            `/bloodbanks/${bloodBankId}/units/intake`,
            bbToken,
            {
                bloodGroup: "AB+",
                bloodComponent: "RBC",
                expiryDate: new Date(Date.now() + (500 + (timestamp % 1000)) * 24 * 60 * 60 * 1000).toISOString(),
                units: [{ unitBarcode: cBarcode }],
                reason: "Concurrency test unit",
            },
            { "Idempotency-Key": `concurrency-intake-${timestamp}` }
        );
        const cUnitId = cIntake.data.units[0].unitId;

        // Screen unit to AVAILABLE
        await postJson(`/bloodbanks/${bloodBankId}/units/${cUnitId}/screening`, bbToken, {
            testedByUserId: tester.userid,
            verifiedByUserId: verifier.userid,
            hivResult: "NON_REACTIVE",
            hbvResult: "NON_REACTIVE",
            hcvResult: "NON_REACTIVE",
            syphilisResult: "NON_REACTIVE",
            malariaResult: "NEGATIVE",
            overallStatus: "PASSED",
        });

        // Create two requests competing for the single unit
        const reqA = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospitalUser ? hospitalUser.userid : bbUser.userid,
                patientname: "Competing Patient A",
                patientage: 30,
                patientgender: "FEMALE",
                patientcontact: "9876543211",
                bloodgroup: blood_group.AB_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                requiredby: new Date(Date.now() + 24 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });
        const reqB = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospitalUser ? hospitalUser.userid : bbUser.userid,
                patientname: "Competing Patient B",
                patientage: 32,
                patientgender: "MALE",
                patientcontact: "9876543212",
                bloodgroup: blood_group.AB_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                requiredby: new Date(Date.now() + 24 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });

        const asgnA = await postJson(`/bloodrequests/${reqA.requestid}/assign`, hospitalToken, { bloodBankId });
        const asgnB = await postJson(`/bloodrequests/${reqB.requestid}/assign`, hospitalToken, { bloodBankId });
        await patchJson(`/bloodbanks/${bloodBankId}/assignments/${asgnA.data.assignment.assignmentid}`, bbToken, { action: "ACCEPT" });
        await patchJson(`/bloodbanks/${bloodBankId}/assignments/${asgnB.data.assignment.assignmentid}`, bbToken, { action: "ACCEPT" });

        // Fire both reservation requests concurrently
        const [resA, resB] = await Promise.all([
            postJson(
                `/bloodbanks/${bloodBankId}/reservations`,
                bbToken,
                { requestId: reqA.requestid, requestedUnits: 1, specificUnitIds: [cUnitId] },
                { "Idempotency-Key": `concurrency-a-${timestamp}` }
            ),
            postJson(
                `/bloodbanks/${bloodBankId}/reservations`,
                bbToken,
                { requestId: reqB.requestid, requestedUnits: 1, specificUnitIds: [cUnitId] },
                { "Idempotency-Key": `concurrency-b-${timestamp}` }
            ),
        ]);

        const statuses = [resA.status, resB.status];
        assert(statuses.includes(201), "One concurrent request successfully won and reserved the unit");
        assert(statuses.includes(409), "The competing concurrent request was rejected with 409 Conflict");

        console.log("\n===============================================================================");
        console.log(`  ALL ${passedTests} OF ${totalTests} SWASTYA PHASE 6.2.3 TEST ASSERTIONS PASSED!`);
        console.log("===============================================================================\n");
    } finally {
        server.close();
    }
}

runTestSuite()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error("Test suite failure:", err);
        if (server) server.close();
        await prisma.$disconnect();
        process.exit(1);
    });
