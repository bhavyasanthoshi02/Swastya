import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { UnitTraceabilityService } from "../src/services/unitTraceability.service";
import { DonorImportService } from "../src/services/donorImport.service";
import { buildScopedIdempotencyKey } from "../src/utils/idempotency";

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string, details?: string) {
    if (!condition) {
        totalFailed++;
        const errStr = details ? `${message} (${details})` : message;
        failures.push(errStr);
        console.error(`[FAIL] ${errStr}`);
        throw new Error(`Assertion failed: ${errStr}`);
    }
    totalPassed++;
    console.log(`[PASS] ${message}`);
}

async function reqJson(
    baseUrl: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    urlPath: string,
    body?: any,
    token?: string,
    headers?: Record<string, string>
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
    return new Promise((resolve, reject) => {
        const u = new URL(urlPath, baseUrl);
        const reqHeaders: Record<string, string> = {
            ...(headers || {}),
        };
        if (body !== undefined) {
            reqHeaders["Content-Type"] = "application/json";
        }
        if (token) {
            reqHeaders["Authorization"] = `Bearer ${token}`;
        }

        const req = http.request(
            {
                method,
                hostname: u.hostname,
                port: u.port,
                path: `${u.pathname}${u.search}`,
                headers: reqHeaders,
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    let parsed: any = null;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = data;
                    }
                    resolve({ status: res.statusCode || 0, headers: res.headers, data: parsed });
                });
            }
        );
        req.on("error", reject);
        if (body !== undefined) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function run() {
    // 0. Pre-flight verification: Must be on swastya_test database
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe("SELECT current_database()");
    const currentDb = dbCheck[0]?.current_database || "";
    assert(currentDb === "swastya_test", `Target database must be swastya_test (got: ${currentDb})`);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const userIds: string[] = [];
    const hospitalIds: string[] = [];
    const bloodBankIds: string[] = [];
    const requesterIds: string[] = [];
    const requestIds: string[] = [];
    const inventoryIds: string[] = [];
    const unitIds: string[] = [];
    const reservationIds: string[] = [];
    let server: http.Server | null = null;
    let baseUrl = "";

    try {
        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", () => resolve());
        });
        const address = (server as any).address();
        baseUrl = `http://127.0.0.1:${address.port}`;

        // =========================================================================
        // PART 1: F2 — LEGACY IMPORT PATH REMOVAL & SECURE IMPORT PRESERVATION
        // =========================================================================
        console.log("\n--- Testing F2: Legacy Donor Import Removal ---");

        // 1.1 Verify DonorImportService.commitImport does NOT exist
        assert(
            typeof (DonorImportService as any).commitImport === "undefined",
            "F2.1: DonorImportService.commitImport method has been completely removed from the class"
        );

        // 1.2 Verify DonorImportService.revalidateAndCommit exists and is callable
        assert(
            typeof DonorImportService.revalidateAndCommit === "function",
            "F2.2: DonorImportService.revalidateAndCommit is present and exported as the secure import handler"
        );

        // 1.3 Verify helper buildScopedIdempotencyKey generates correctly formatted keys
        const sampleKey = buildScopedIdempotencyKey("test-bb-id", "STOCK_ADDITION", "raw-key-123");
        assert(
            sampleKey === "bb:test-bb-id:op:STOCK_ADDITION:key:raw-key-123",
            "F1.0: buildScopedIdempotencyKey formats standard scoped key correctly"
        );

        const longKey = "a".repeat(100);
        const hashedLongKey = buildScopedIdempotencyKey("test-bb-id", "STOCK_INTAKE", longKey, "lot:123");
        const expectedHash = crypto.createHash("sha256").update(longKey).digest("hex");
        assert(
            hashedLongKey === `bb:test-bb-id:op:STOCK_INTAKE:key:${expectedHash}:lot:123` && hashedLongKey.length <= 255,
            "F1.0b: buildScopedIdempotencyKey safely hashes keys > 64 chars to prevent VARCHAR(255) overflow"
        );

        // =========================================================================
        // FIXTURE SETUP
        // =========================================================================
        console.log("\n--- Setting Up Test Fixtures in swastya_test ---");

        // Hospital & Hospital User
        const hospUser = await prisma.users.create({
            data: {
                name: `AUD10 Hospital User ${suffix}`,
                email: `aud10-hosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(hospUser.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `AUD10 Hospital ${suffix}`,
                registrationnumber: `HREG-AUD10-${suffix}`,
                contactpersonname: "Dr. Audit Lead",
                contactpersonphone: "9876543210",
                address: "Medical Enclave, Mumbai",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(hospital.hospitalid);
        const hospToken = generateToken(hospUser.userid, "HOSPITAL");

        // Blood Bank A & Blood Bank A User
        const bbAUser = await prisma.users.create({
            data: {
                name: `AUD10 Blood Bank A ${suffix}`,
                email: `aud10-bba-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        userIds.push(bbAUser.userid);

        const bloodBankA = await prisma.bloodbanks.create({
            data: {
                userid: bbAUser.userid,
                bloodbankname: `AUD10 Blood Bank A ${suffix}`,
                licensenumber: `LIC-AUD10-A-${suffix}`,
                contactpersonname: "Supervisor A",
                contactpersonphone: "9876543211",
                address: "Blood Bank A Street",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400002",
                approvalstatus: "APPROVED",
            },
        });
        bloodBankIds.push(bloodBankA.bloodbankid);
        const bbAToken = generateToken(bbAUser.userid, "BLOOD_BANK");

        // Blood Bank B & Blood Bank B User
        const bbBUser = await prisma.users.create({
            data: {
                name: `AUD10 Blood Bank B ${suffix}`,
                email: `aud10-bbb-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        userIds.push(bbBUser.userid);

        const bloodBankB = await prisma.bloodbanks.create({
            data: {
                userid: bbBUser.userid,
                bloodbankname: `AUD10 Blood Bank B ${suffix}`,
                licensenumber: `LIC-AUD10-B-${suffix}`,
                contactpersonname: "Supervisor B",
                contactpersonphone: "9876543212",
                address: "Blood Bank B Street",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400003",
                approvalstatus: "APPROVED",
            },
        });
        bloodBankIds.push(bloodBankB.bloodbankid);
        const bbBToken = generateToken(bbBUser.userid, "BLOOD_BANK");

        // Requester & Blood Request
        const reqUser = await prisma.users.create({
            data: {
                name: `AUD10 Requester ${suffix}`,
                email: `aud10-req-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "REQUESTER",
            },
        });
        userIds.push(reqUser.userid);

        const requester = await prisma.requesters.create({
            data: {
                userid: reqUser.userid,
                address: "Patient Address",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
            },
        });
        requesterIds.push(requester.requesterid);

        const bloodReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: "AUD10 Patient",
                patientage: 32,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 86400000),
                status: "CREATED",
            },
        });
        requestIds.push(bloodReq.requestid);

        await prisma.prescription.create({
            data: {
                requestid: bloodReq.requestid,
                doctorname: "Dr. Transfusion Specialist",
                hospitalname: hospital.hospitalname,
                fileurl: "patient-rx.pdf",
                originalfilename: "patient-rx.pdf",
                mimetype: "application/pdf",
                filesize: 2048,
                status: "VERIFIED",
                verifiedbyhospitalid: hospital.hospitalid,
                verificationdate: new Date(),
                remarks: "Approved for transfusion",
            },
        });

        // Requisition Assignment for Blood Bank A
        const assignmentResult = await UnitTraceabilityService.assignRequisition(
            bloodReq.requestid,
            bloodBankA.bloodbankid,
            hospUser.userid,
            hospital.hospitalid
        );
        await prisma.requisitionassignments.update({
            where: { assignmentid: assignmentResult.assignment.assignmentid },
            data: { assignmentstatus: "ACCEPTED" },
        });

        // =========================================================================
        // PART 2: F1 — CROSS-TENANT IDEMPOTENCY KEY ISOLATION
        // =========================================================================
        console.log("\n--- Testing F1: Cross-Tenant Key Isolation ---");

        const sharedClientKey = `shared-client-key-aud10-${suffix}`;

        // 2.1 Blood Bank A creates an inventory batch using sharedClientKey
        const expDate = "2027-06-15";
        const resA_Add = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/inventory`,
            {
                bloodgroup: "O+",
                bloodcomponent: "WHOLE_BLOOD",
                expirydate: expDate,
                quantity: 10,
                reason: "Initial audit stock addition BB-A",
            },
            bbAToken,
            { "Idempotency-Key": sharedClientKey }
        );

        assert(resA_Add.status === 201 || resA_Add.status === 200, "F1.1: Blood Bank A inventory addition succeeds", `status=${resA_Add.status}`);
        assert(resA_Add.data?.success === true, "F1.1b: Blood Bank A receives success response");
        const invA_Id = resA_Add.data?.inventory?.inventoryid;
        assert(Boolean(invA_Id), "F1.1c: Inventory record returned for Blood Bank A");
        inventoryIds.push(invA_Id);

        // 2.2 Blood Bank B creates an inventory batch using the EXACT SAME client idempotency key
        const resB_Add = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankB.bloodbankid}/inventory`,
            {
                bloodgroup: "O+",
                bloodcomponent: "WHOLE_BLOOD",
                expirydate: expDate,
                quantity: 5,
                reason: "Initial audit stock addition BB-B",
            },
            bbBToken,
            { "Idempotency-Key": sharedClientKey } // IDENTICAL CLIENT KEY!
        );

        assert(resB_Add.status === 201 || resB_Add.status === 200, "F1.2: Blood Bank B succeeds with identical client key (no collision!)", `status=${resB_Add.status}`);
        assert(resB_Add.data?.success === true, "F1.2b: Blood Bank B receives success response");
        const invB_Id = resB_Add.data?.inventory?.inventoryid;
        assert(Boolean(invB_Id), "F1.2c: Inventory record returned for Blood Bank B");
        assert(invB_Id !== invA_Id, "F1.2d: Blood Bank B receives its own distinct inventory batch, not BB-A's");
        inventoryIds.push(invB_Id);

        // 2.3 Verify database isolation: Two distinct ledger entries exist with tenant-scoped keys
        const ledgerEntries = await prisma.inventoryledger.findMany({
            where: {
                idempotencykey: { contains: sharedClientKey },
            },
        });
        assert(ledgerEntries.length === 2, "F1.3: Database contains 2 separate ledger entries for the shared client key", `count=${ledgerEntries.length}`);

        const ledgerA = ledgerEntries.find((l) => l.bloodbankid === bloodBankA.bloodbankid);
        const ledgerB = ledgerEntries.find((l) => l.bloodbankid === bloodBankB.bloodbankid);
        assert(Boolean(ledgerA) && Boolean(ledgerB), "F1.3b: Ledger entries are partitioned by bloodBankId");
        assert(
            ledgerA?.idempotencykey === `bb:${bloodBankA.bloodbankid}:op:STOCK_ADDITION:key:${sharedClientKey}`,
            "F1.3c: Ledger A has scoped key with bloodBankA prefix"
        );
        assert(
            ledgerB?.idempotencykey === `bb:${bloodBankB.bloodbankid}:op:STOCK_ADDITION:key:${sharedClientKey}`,
            "F1.3d: Ledger B has scoped key with bloodBankB prefix"
        );

        // =========================================================================
        // PART 3: F1 — RETRY / REPLAY & REQUEST-HASH MISMATCH REJECTION
        // =========================================================================
        console.log("\n--- Testing F1: Retry Replay & Hash Mismatch Rejection ---");

        // 3.1 Idempotent replay: Exact same request and key returns cached response
        const resA_Replay = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/inventory`,
            {
                bloodgroup: "O+",
                bloodcomponent: "WHOLE_BLOOD",
                expirydate: expDate,
                quantity: 10,
                reason: "Initial audit stock addition BB-A",
            },
            bbAToken,
            { "Idempotency-Key": sharedClientKey }
        );

        assert(resA_Replay.status === resA_Add.status, "F1.4: Exact retry returns identical status code", `status=${resA_Replay.status}`);
        assert(resA_Replay.headers["x-cache-lookup"] === "IDEMPOTENT_HIT", "F1.4b: Replay includes X-Cache-Lookup: IDEMPOTENT_HIT header");
        assert(resA_Replay.data?.inventory?.inventoryid === invA_Id, "F1.4c: Replayed payload contains identical inventory ID");

        // 3.2 Request-hash mismatch: Same key with DIFFERENT payload is rejected with 409 Conflict
        const resA_Mismatch = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/inventory`,
            {
                bloodgroup: "O+",
                bloodcomponent: "WHOLE_BLOOD",
                expirydate: expDate,
                quantity: 999, // DIFFERENT QUANTITY!
                reason: "Malicious payload alteration",
            },
            bbAToken,
            { "Idempotency-Key": sharedClientKey }
        );

        assert(resA_Mismatch.status === 409, "F1.5: Reusing idempotency key with different payload returns 409 Conflict", `status=${resA_Mismatch.status}`);
        assert(
            String(resA_Mismatch.data?.message || "").includes("Idempotency key has already been used for a different"),
            "F1.5b: Error message clearly indicates idempotency key conflict"
        );

        // =========================================================================
        // PART 4: F1 — CROSS-OPERATION KEY ISOLATION (SAME BLOOD BANK)
        // =========================================================================
        console.log("\n--- Testing F1: Cross-Operation Key Isolation for Single Blood Bank ---");

        // A single blood bank uses the exact same client idempotency key across different operations:
        // Op 1: STOCK_ADDITION (already done or do new)
        // Op 2: STOCK_ADJUSTMENT (adjust inventory)
        // Op 3: STOCK_INTAKE (intake units)
        // Op 4: RESERVATION_ALLOCATE (allocate units)
        // Op 5: DISPATCH_DEPARTURE (dispatch units)

        const multiOpKey = `multi-op-key-aud10-${suffix}`;

        // 4.1 Op 1: STOCK_ADDITION with multiOpKey
        const resOp1 = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/inventory`,
            {
                bloodgroup: "A+",
                bloodcomponent: "WHOLE_BLOOD",
                expirydate: expDate,
                quantity: 20,
                reason: "Multi-op test batch creation",
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp1.status === 201 || resOp1.status === 200, "F1.6: Op 1 (STOCK_ADDITION) succeeds with multiOpKey", `status=${resOp1.status}`);
        const invOp1_Id = resOp1.data?.inventory?.inventoryid;
        inventoryIds.push(invOp1_Id);

        // 4.2 Op 2: STOCK_ADJUSTMENT with the EXACT SAME multiOpKey
        const resOp2 = await reqJson(
            baseUrl,
            "PATCH",
            `/bloodbanks/${bloodBankA.bloodbankid}/inventory/${invOp1_Id}`,
            {
                operation: "INCREMENT",
                quantity: 5,
                reason: "Multi-op stock adjustment",
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey } // SAME KEY!
        );
        assert(resOp2.status === 200, "F1.7: Op 2 (STOCK_ADJUSTMENT) succeeds with same multiOpKey (no cross-op collision!)", `status=${resOp2.status}`);
        assert(resOp2.data?.operation === "CORRECTION_INCREMENT", "F1.7b: Adjustment operation performed correctly");

        // Verify Op 2 replay with same multiOpKey
        const resOp2_Replay = await reqJson(
            baseUrl,
            "PATCH",
            `/bloodbanks/${bloodBankA.bloodbankid}/inventory/${invOp1_Id}`,
            {
                operation: "INCREMENT",
                quantity: 5,
                reason: "Multi-op stock adjustment",
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp2_Replay.status === 200, "F1.7c: Op 2 adjustment replay returns 200");
        assert(resOp2_Replay.headers["x-cache-lookup"] === "IDEMPOTENT_HIT", "F1.7d: Op 2 replay has IDEMPOTENT_HIT");

        // Verify Op 2 hash mismatch with same multiOpKey
        const resOp2_Mismatch = await reqJson(
            baseUrl,
            "PATCH",
            `/bloodbanks/${bloodBankA.bloodbankid}/inventory/${invOp1_Id}`,
            {
                operation: "INCREMENT",
                quantity: 99, // DIFFERENT QUANTITY!
                reason: "Multi-op stock adjustment mismatch",
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp2_Mismatch.status === 409, "F1.7e: Op 2 adjust with modified payload returns 409 Conflict", `status=${resOp2_Mismatch.status}`);

        // 4.3 Op 3: STOCK_INTAKE with the EXACT SAME multiOpKey
        const unitBarcodes = [
            `BC-AUD10-1-${suffix}`,
            `BC-AUD10-2-${suffix}`,
        ];
        const resOp3 = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/units/intake`,
            {
                bloodGroup: "O+",
                bloodComponent: "WHOLE_BLOOD",
                expiryDate: "2027-10-10",
                units: [
                    { unitBarcode: unitBarcodes[0] },
                    { unitBarcode: unitBarcodes[1] },
                ],
                reason: "Multi-op test unit intake",
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey } // SAME KEY!
        );
        assert(resOp3.status === 201, "F1.8: Op 3 (STOCK_INTAKE) succeeds with same multiOpKey (no cross-op collision!)", `status=${resOp3.status}`);
        assert(resOp3.data?.units?.length === 2, "F1.8b: 2 units successfully intaked into quarantine");
        const intakeUnits = resOp3.data?.units || [];
        intakeUnits.forEach((u: any) => unitIds.push(u.unitId));

        // Replay Op 3 with same multiOpKey
        const resOp3_Replay = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/units/intake`,
            {
                bloodGroup: "O+",
                bloodComponent: "WHOLE_BLOOD",
                expiryDate: "2027-10-10",
                units: [
                    { unitBarcode: unitBarcodes[0] },
                    { unitBarcode: unitBarcodes[1] },
                ],
                reason: "Multi-op test unit intake",
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp3_Replay.status === 201, "F1.8c: Op 3 intake replay returns 201");
        assert(resOp3_Replay.data?.units?.length === 2, "F1.8d: Replayed intake units match");

        // Hash mismatch Op 3 with same multiOpKey
        const resOp3_Mismatch = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/units/intake`,
            {
                bloodGroup: "O+",
                bloodComponent: "WHOLE_BLOOD",
                expiryDate: "2027-10-10",
                units: [
                    { unitBarcode: `BC-DIFFERENT-${suffix}` }, // DIFFERENT BARCODE!
                ],
                reason: "Multi-op test unit intake mismatch",
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp3_Mismatch.status === 409, "F1.8e: Op 3 intake with modified payload returns 409 Conflict", `status=${resOp3_Mismatch.status}`);

        // Fast-track one unit through TTI screening to AVAILABLE status for allocation test
        const unitToScreen = intakeUnits[0].unitId;
        // Step 1: Submission
        await UnitTraceabilityService.recordScreeningSubmission({
            unitId: unitToScreen,
            bloodBankId: bloodBankA.bloodbankid,
            actorUserId: bbAUser.userid,
            testedByUserId: bbAUser.userid,
            hivResult: "NON_REACTIVE",
            hbvResult: "NON_REACTIVE",
            hcvResult: "NON_REACTIVE",
            syphilisResult: "NON_REACTIVE",
            malariaResult: "NON_REACTIVE",
            overallStatus: "PASSED",
        });
        // Step 2: Verification by another user (Admin / Independent verifier)
        const verifierUser = await prisma.users.create({
            data: {
                name: `AUD10 Verifier ${suffix}`,
                email: `aud10-verif-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "ADMIN",
            },
        });
        userIds.push(verifierUser.userid);
        await UnitTraceabilityService.verifyScreeningClearance({
            unitId: unitToScreen,
            verifierUserId: verifierUser.userid,
            laboratoryRemarks: "Dual-signoff verified passed",
            bloodBankId: bloodBankA.bloodbankid,
        });

        // 4.4 Op 4: RESERVATION_ALLOCATE with the EXACT SAME multiOpKey
        const resOp4 = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/reservations`,
            {
                requestId: bloodReq.requestid,
                requestedUnits: 1,
                specificUnitIds: [unitToScreen],
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey } // SAME KEY!
        );
        assert(resOp4.status === 201, "F1.9: Op 4 (RESERVATION_ALLOCATE) succeeds with same multiOpKey (no cross-op collision!)", `status=${resOp4.status}`);
        const resId = resOp4.data?.reservation?.reservationId;
        assert(Boolean(resId), "F1.9b: Reservation ID returned from allocation");
        reservationIds.push(resId);

        // Replay Op 4 with same multiOpKey
        const resOp4_Replay = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/reservations`,
            {
                requestId: bloodReq.requestid,
                requestedUnits: 1,
                specificUnitIds: [unitToScreen],
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp4_Replay.status === 201, "F1.9c: Op 4 allocation replay returns 201");
        assert(resOp4_Replay.data?.reservation?.reservationId === resId, "F1.9d: Replayed reservation matches");

        // Hash mismatch Op 4 with same multiOpKey
        const resOp4_Mismatch = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/reservations`,
            {
                requestId: bloodReq.requestid,
                requestedUnits: 2, // DIFFERENT REQUESTED UNITS!
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp4_Mismatch.status === 409, "F1.9e: Op 4 allocate with modified payload returns 409 Conflict", `status=${resOp4_Mismatch.status}`);

        // Prepare reservation item for dispatch: crossmatch COMPATIBLE
        const resItem = await prisma.reservationitems.findFirst({
            where: { reservationid: resId },
        });
        assert(Boolean(resItem), "F1.10: Found reservation item to crossmatch");
        await UnitTraceabilityService.recordCrossmatch({
            reservationItemId: resItem!.itemid,
            bloodBankId: bloodBankA.bloodbankid,
            actorUserId: bbAUser.userid,
            testedByUserId: bbAUser.userid,
            verifiedByUserId: verifierUser.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
        });

        // 4.5 Op 5: DISPATCH_DEPARTURE with the EXACT SAME multiOpKey
        const resOp5 = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/reservations/${resId}/dispatch`,
            {
                courierName: "LifeLine Medical Express",
                trackingId: "TRK-AUD10-001",
                coldBoxSealNumber: "SEAL-AUD10-1",
                initialTemperature: 4.5,
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey } // SAME KEY!
        );
        assert(resOp5.status === 200, "F1.11: Op 5 (DISPATCH_DEPARTURE) succeeds with same multiOpKey (no cross-op collision!)", `status=${resOp5.status}`);
        assert(resOp5.data?.reservation?.status === "IN_TRANSIT" || resOp5.data?.success === true, "F1.11b: Reservation dispatched successfully");

        // Replay Op 5 with same multiOpKey
        const resOp5_Replay = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/reservations/${resId}/dispatch`,
            {
                courierName: "LifeLine Medical Express",
                trackingId: "TRK-AUD10-001",
                coldBoxSealNumber: "SEAL-AUD10-1",
                initialTemperature: 4.5,
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp5_Replay.status === 200, "F1.11c: Op 5 dispatch replay returns 200");

        // Hash mismatch Op 5 with same multiOpKey
        const resOp5_Mismatch = await reqJson(
            baseUrl,
            "POST",
            `/bloodbanks/${bloodBankA.bloodbankid}/reservations/${resId}/dispatch`,
            {
                courierName: "Different Courier Company", // DIFFERENT COURIER!
                trackingId: "TRK-AUD10-999",
                coldBoxSealNumber: "SEAL-AUD10-9",
                initialTemperature: 8.0,
            },
            bbAToken,
            { "Idempotency-Key": multiOpKey }
        );
        assert(resOp5_Mismatch.status === 409, "F1.11d: Op 5 dispatch with modified payload returns 409 Conflict", `status=${resOp5_Mismatch.status}`);

        // =========================================================================
        // PART 5: F1 — CONCURRENT DUPLICATE REQUEST HANDLING
        // =========================================================================
        console.log("\n--- Testing F1: Concurrent Duplicate Requests ---");

        const concurrentKey = `concurrent-test-key-aud10-${suffix}`;
        const payloadConcurrent = {
            bloodgroup: "B+",
            bloodcomponent: "WHOLE_BLOOD",
            expirydate: expDate,
            quantity: 15,
            reason: "Concurrent idempotency test",
        };

        // Fire two concurrent requests simultaneously with identical payload & key
        const [concRes1, concRes2] = await Promise.all([
            reqJson(baseUrl, "POST", `/bloodbanks/${bloodBankA.bloodbankid}/inventory`, payloadConcurrent, bbAToken, { "Idempotency-Key": concurrentKey }),
            reqJson(baseUrl, "POST", `/bloodbanks/${bloodBankA.bloodbankid}/inventory`, payloadConcurrent, bbAToken, { "Idempotency-Key": concurrentKey }),
        ]);

        assert(concRes1.status === 201 || concRes1.status === 200, "F1.12: Concurrent request 1 succeeds", `status=${concRes1.status}`);
        assert(concRes2.status === 201 || concRes2.status === 200, "F1.12b: Concurrent request 2 succeeds", `status=${concRes2.status}`);

        const invConc1 = concRes1.data?.inventory?.inventoryid;
        const invConc2 = concRes2.data?.inventory?.inventoryid;
        assert(invConc1 === invConc2, "F1.12c: Both concurrent requests resolve to the identical inventory batch ID");
        inventoryIds.push(invConc1);

        // Verify only ONE ledger entry was committed in the database for this scoped key
        const concLedgers = await prisma.inventoryledger.findMany({
            where: {
                idempotencykey: `bb:${bloodBankA.bloodbankid}:op:STOCK_ADDITION:key:${concurrentKey}`,
            },
        });
        assert(concLedgers.length === 1, "F1.12d: Exactly one immutable ledger entry committed in database (no double mutation)", `count=${concLedgers.length}`);

        // =========================================================================
        // PART 6: AUD-03 / AUD-07 / AUD-08 REGRESSION PRESERVATION
        // =========================================================================
        console.log("\n--- Testing Regression Preservation (AUD-03, AUD-07, AUD-08) ---");

        // Cross-tenant protection: Blood Bank B cannot adjust Blood Bank A's inventory
        const crossTenantAdjust = await reqJson(
            baseUrl,
            "PATCH",
            `/bloodbanks/${bloodBankB.bloodbankid}/inventory/${invOp1_Id}`,
            {
                operation: "INCREMENT",
                quantity: 5,
                reason: "Malicious cross-tenant adjustment attempt",
            },
            bbBToken,
            { "Idempotency-Key": `malicious-adjust-${suffix}` }
        );
        assert(crossTenantAdjust.status === 404 || crossTenantAdjust.status === 403, "F1.13: Cross-tenant inventory adjustment blocked", `status=${crossTenantAdjust.status}`);

    } finally {
        if (server) {
            await new Promise<void>((resolve) => (server as http.Server).close(() => resolve()));
        }

        // Clean up test fixtures from swastya_test
        if (reservationIds.length > 0) {
            await prisma.reservationitems.deleteMany({ where: { reservationid: { in: reservationIds } } }).catch(() => {});
            await prisma.bloodreservations.deleteMany({ where: { reservationid: { in: reservationIds } } }).catch(() => {});
        }
        if (unitIds.length > 0) {
            await prisma.clinicalcrossmatches.deleteMany({ where: { unitid: { in: unitIds } } }).catch(() => {});
            await prisma.unitscreeningrecords.deleteMany({ where: { unitid: { in: unitIds } } }).catch(() => {});
            await prisma.unitdispositionhistory.deleteMany({ where: { unitid: { in: unitIds } } }).catch(() => {});
            await prisma.inventoryunits.deleteMany({ where: { unitid: { in: unitIds } } }).catch(() => {});
        }
        if (inventoryIds.length > 0) {
            await prisma.inventoryledger.deleteMany({ where: { inventoryid: { in: inventoryIds } } }).catch(() => {});
            await prisma.inventory.deleteMany({ where: { inventoryid: { in: inventoryIds } } }).catch(() => {});
        }
        if (requestIds.length > 0) {
            await prisma.requisitionassignments.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescription.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.bloodrequests.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
        }
        if (hospitalIds.length > 0) {
            await prisma.hospitals.deleteMany({ where: { hospitalid: { in: hospitalIds } } }).catch(() => {});
        }
        if (bloodBankIds.length > 0) {
            await prisma.bloodbanks.deleteMany({ where: { bloodbankid: { in: bloodBankIds } } }).catch(() => {});
        }
        if (requesterIds.length > 0) {
            await prisma.requesters.deleteMany({ where: { requesterid: { in: requesterIds } } }).catch(() => {});
        }
        if (userIds.length > 0) {
            await prisma.users.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
        }
    }
}

run()
    .then(async () => {
        await prisma.$disconnect();
        console.log(`\n=======================================================`);
        console.log(`AUD-10 Idempotency & Import Security Suite: PASS`);
        console.log(`Total Passed: ${totalPassed}`);
        console.log(`Total Failed: ${totalFailed}`);
        console.log(`=======================================================\n`);
    })
    .catch(async (error) => {
        console.error(`\n=======================================================`);
        console.error(`AUD-10 Idempotency & Import Security Suite: FAIL`);
        console.error(`Total Passed: ${totalPassed}`);
        console.error(`Total Failed: ${totalFailed}`);
        if (failures.length > 0) {
            console.error(`Failures:`);
            failures.forEach((f) => console.error(`  - ${f}`));
        }
        console.error(error);
        console.error(`=======================================================\n`);
        await prisma.$disconnect();
        process.exit(1);
    });
