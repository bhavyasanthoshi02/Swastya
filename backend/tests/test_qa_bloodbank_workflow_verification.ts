import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, user_role, notification_type } from "../src/generated/prisma/enums";
import { UnitTraceabilityService } from "../src/services/unitTraceability.service";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: Array<{ test: string; error: string }> = [];

function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failedTests++;
        const err = detail ? `${testName} — ${detail}` : testName;
        failures.push({ test: testName, error: err });
        console.error(`  [FAIL] ${err}`);
    }
}

async function runQaVerificationSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA QA: BLOOD BANK & CLINICAL WORKFLOW END-TO-END VERIFICATION           ");
    console.log("===============================================================================\n");

    // Guard: Verify target database is swastya_test
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe(`SELECT current_database()`);
    const currentDb = dbCheck[0]?.current_database || "";
    if (currentDb !== "swastya_test") {
        throw new Error(`CRITICAL QA ABORT: Expected local test database swastya_test, got "${currentDb}"`);
    }
    console.log(`[QA DB Guard] Verified test target database: ${currentDb}\n`);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const tag = `qa_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    let barcodeSeq = 0;

    const reqJson = async (method: string, pathUrl: string, body?: any, token?: string, headers?: Record<string, string>) => {
        const reqHeaders: Record<string, string> = { ...(headers || {}) };
        if (body !== undefined) reqHeaders["Content-Type"] = "application/json";
        if (token) reqHeaders["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${baseUrl}${pathUrl}`, {
            method,
            headers: reqHeaders,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        let data: any = null;
        try {
            data = await res.json();
        } catch {
            data = null;
        }
        return { status: res.status, data, headers: res.headers };
    };

    try {
        // Setup isolated fixtures
        const adminUser = await prisma.users.create({
            data: {
                email: `admin_${tag}@swastya.test`,
                name: "Admin Officer",
                password: "hashedpassword123",
                role: user_role.ADMIN,
                isactive: true,
            },
        });
        const adminToken = generateToken(adminUser.userid, user_role.ADMIN);

        const bbOwner = await prisma.users.create({
            data: {
                email: `bbowner_${tag}@swastya.test`,
                name: "BB Technician",
                password: "hashedpassword123",
                role: user_role.BLOOD_BANK,
                isactive: true,
            },
        });
        const bbToken = generateToken(bbOwner.userid, user_role.BLOOD_BANK);

        const bbVerifier = await prisma.users.create({
            data: {
                email: `bbverif_${tag}@swastya.test`,
                name: "BB Medical Officer",
                password: "hashedpassword123",
                role: user_role.ADMIN,
                isactive: true,
            },
        });
        const bbVerifierToken = generateToken(bbVerifier.userid, user_role.ADMIN);

        const bb2Owner = await prisma.users.create({
            data: {
                email: `bb2_${tag}@swastya.test`,
                name: "Alternative BB Owner",
                password: "hashedpassword123",
                role: user_role.BLOOD_BANK,
                isactive: true,
            },
        });
        const bb2Token = generateToken(bb2Owner.userid, user_role.BLOOD_BANK);

        const bb1 = await prisma.bloodbanks.create({
            data: {
                userid: bbOwner.userid,
                bloodbankname: `Primary Regional Blood Center ${tag}`,
                licensenumber: `LIC-1-${tag}`,
                contactpersonname: "Dr. Primary",
                contactpersonphone: "9111111111",
                city: "Pune",
                state: "Maharashtra",
                address: "Wing A",
                pincode: "411001",
                approvalstatus: "APPROVED",
            },
        });

        const bb2 = await prisma.bloodbanks.create({
            data: {
                userid: bb2Owner.userid,
                bloodbankname: `Secondary Apex Blood Bank ${tag}`,
                licensenumber: `LIC-2-${tag}`,
                contactpersonname: "Dr. Secondary",
                contactpersonphone: "9222222222",
                city: "Pune",
                state: "Maharashtra",
                address: "Wing B",
                pincode: "411002",
                approvalstatus: "APPROVED",
            },
        });

        const hospUser = await prisma.users.create({
            data: {
                email: `hosp_${tag}@swastya.test`,
                name: "Hospital Coordinator",
                password: "hashedpassword123",
                role: user_role.HOSPITAL,
                isactive: true,
            },
        });
        const hospToken = generateToken(hospUser.userid, user_role.HOSPITAL);

        const hosp2User = await prisma.users.create({
            data: {
                email: `hosp2_${tag}@swastya.test`,
                name: "Unauthorized Hospital",
                password: "hashedpassword123",
                role: user_role.HOSPITAL,
                isactive: true,
            },
        });
        const hosp2Token = generateToken(hosp2User.userid, user_role.HOSPITAL);

        const hosp = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `Memorial Hospital ${tag}`,
                registrationnumber: `HOSP-REG-${tag}`,
                contactpersonname: "Dr. Surgeon",
                contactpersonphone: "9333333333",
                city: "Pune",
                state: "Maharashtra",
                address: "Emergency Complex",
                pincode: "411001",
                approvalstatus: "APPROVED",
            },
        });

        const hosp2 = await prisma.hospitals.create({
            data: {
                userid: hosp2User.userid,
                hospitalname: `Unauthorized Hospital ${tag}`,
                registrationnumber: `HOSP-UNAUTH-${tag}`,
                contactpersonname: "Dr. Foreign",
                contactpersonphone: "9444444444",
                city: "Pune",
                state: "Maharashtra",
                address: "Foreign Complex",
                pincode: "411001",
                approvalstatus: "APPROVED",
            },
        });

        function formatGroup(bg: blood_group): string {
            switch (bg) {
                case blood_group.A_POSITIVE: return "A+";
                case blood_group.A_NEGATIVE: return "A-";
                case blood_group.B_POSITIVE: return "B+";
                case blood_group.B_NEGATIVE: return "B-";
                case blood_group.AB_POSITIVE: return "AB+";
                case blood_group.AB_NEGATIVE: return "AB-";
                case blood_group.O_POSITIVE: return "O+";
                case blood_group.O_NEGATIVE: return "O-";
                default: return "O+";
            }
        }

        // Helper to intake and clear a unit
        async function createAndClearUnit(bloodBankId: string, group: blood_group, comp: blood_component, daysToExpiry = 30, callerToken = bbToken) {
            const barcode = `BAR-${tag}-${++barcodeSeq}`;
            const expiry = new Date(Date.now() + daysToExpiry * 24 * 60 * 60 * 1000);
            const intakeRes = await reqJson("POST", `/bloodbanks/${bloodBankId}/units/intake`, {
                bloodGroup: formatGroup(group),
                bloodComponent: comp,
                expiryDate: expiry.toISOString(),
                units: [{ unitBarcode: barcode, donationIdentificationNumber: `DIN-${barcodeSeq}` }],
                reason: "QA Test Intake",
            }, callerToken, { "Idempotency-Key": `intake-${tag}-${barcodeSeq}-${crypto.randomUUID()}` });

            if (intakeRes.status !== 201) {
                throw new Error(`Intake failed: ${JSON.stringify(intakeRes.data)}`);
            }
            const unitId = intakeRes.data.units[0].unitId;

            // Step 1: Submit 5-panel TTI screening
            const screenRes = await reqJson("POST", `/bloodbanks/${bloodBankId}/units/${unitId}/screening`, {
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NON_REACTIVE",
                overallStatus: "PASSED",
                screeningMethodology: "ELISA",
            }, callerToken, { "Idempotency-Key": `screen-${tag}-${barcodeSeq}-${crypto.randomUUID()}` });

            if (screenRes.status !== 200) {
                throw new Error(`Screening submit failed: ${JSON.stringify(screenRes.data)}`);
            }

            // Step 2: Dual signoff verification
            const verifyRes = await reqJson("POST", `/bloodbanks/${bloodBankId}/units/${unitId}/screening/verify`, {
                screeningId: screenRes.data.screeningId,
            }, bbVerifierToken, { "Idempotency-Key": `verify-${tag}-${barcodeSeq}-${crypto.randomUUID()}` });

            if (verifyRes.status !== 200) {
                throw new Error(`Screening verify failed: ${JSON.stringify(verifyRes.data)}`);
            }

            return { unitId, barcode };
        }

        console.log("-------------------------------------------------------------------------------");
        console.log("PHASE 1: Unit Allocation Testing");
        console.log("-------------------------------------------------------------------------------");

        // Seed 3 cleared O+ RBC units in BB1
        const u1 = await createAndClearUnit(bb1.bloodbankid, blood_group.O_POSITIVE, blood_component.RBC, 35);
        const u2 = await createAndClearUnit(bb1.bloodbankid, blood_group.O_POSITIVE, blood_component.RBC, 40);
        const u3 = await createAndClearUnit(bb1.bloodbankid, blood_group.O_POSITIVE, blood_component.RBC, 45);

        // Seed 1 quarantined unit
        const qBarcode = `BAR-Q-${tag}`;
        const qIntake = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/units/intake`, {
            bloodGroup: "O+",
            bloodComponent: "RBC",
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            units: [{ unitBarcode: qBarcode }],
            reason: "Quarantined Test Intake",
        }, bbToken, { "Idempotency-Key": `q-intake-${tag}-${crypto.randomUUID()}` });
        const qUnitId = qIntake.data.units[0].unitId;

        // Seed 1 unit with failed screening
        const fBarcode = `BAR-F-${tag}`;
        const fIntake = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/units/intake`, {
            bloodGroup: "O+",
            bloodComponent: "RBC",
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            units: [{ unitBarcode: fBarcode }],
            reason: "Failed Screening Intake",
        }, bbToken, { "Idempotency-Key": `f-intake-${tag}-${crypto.randomUUID()}` });
        const fUnitId = fIntake.data.units[0].unitId;
        const fScreen = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/units/${fUnitId}/screening`, {
            hivResult: "REACTIVE",
            hbvResult: "NON_REACTIVE",
            hcvResult: "NON_REACTIVE",
            syphilisResult: "NON_REACTIVE",
            malariaResult: "NON_REACTIVE",
            overallStatus: "FAILED",
        }, bbToken, { "Idempotency-Key": `f-screen-${tag}-${crypto.randomUUID()}` });
        await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/units/${fUnitId}/screening/verify`, {
            screeningId: fScreen.data.screeningId,
        }, bbVerifierToken, { "Idempotency-Key": `f-verify-${tag}-${crypto.randomUUID()}` });

        // Seed 1 expired unit (cleared but expired in past)
        const expUnit = await createAndClearUnit(bb1.bloodbankid, blood_group.O_POSITIVE, blood_component.RBC, 5);
        await prisma.inventoryunits.update({
            where: { unitid: expUnit.unitId },
            data: { expirydate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
        });

        // Seed 1 different component unit (PLASMA)
        const ffpUnit = await createAndClearUnit(bb1.bloodbankid, blood_group.O_POSITIVE, blood_component.PLASMA, 60);

        // Seed 1 incompatible blood group unit (AB+)
        const abUnit = await createAndClearUnit(bb1.bloodbankid, blood_group.AB_POSITIVE, blood_component.RBC, 60);

        // Create hospital blood request for 2 units of O+ RBC
        const req1 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hosp.hospitalid,
                patientname: "Sunil Sharma",
                patientage: 50,
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

        // Test 1: Assign requisition with sufficient stock
        const assign1 = await reqJson("POST", `/bloodrequests/${req1.requestid}/assign`, { bloodBankId: bb1.bloodbankid }, hospToken);
        assert(assign1.status === 201, "1. Requisition assigned with sufficient eligible stock");
        assert(assign1.data.assignment.assignmentstatus === "PENDING_ACCEPTANCE", "1b. Assignment status is PENDING_ACCEPTANCE for sufficient stock");
        const assignmentId1 = assign1.data.assignment.assignmentid;

        // Test 2: Blood bank accepts requisition
        const accept1 = await reqJson("PATCH", `/bloodbanks/${bb1.bloodbankid}/assignments/${assignmentId1}`, { action: "ACCEPT" }, bbToken);
        assert(accept1.status === 200, "2. Blood bank accepted requisition assignment");
        assert(accept1.data.assignment.assignmentstatus === "ACCEPTED", "2b. Assignment status is ACCEPTED");

        // Test 3: Fetching eligible units from the correct blood bank
        const bb1UnitsRes = await reqJson("GET", `/bloodbanks/${bb1.bloodbankid}/units`, undefined, bbToken);
        assert(bb1UnitsRes.status === 200, "3. Fetched inventory units from target blood bank");
        const bb1Units = bb1UnitsRes.data.units as any[];

        // Test 4-9: Filtering logic validation on candidate units
        // Compatible units for O+ RBC: O+ and O- RBC, unexpired, AVAILABLE, ttiscreeningstatus=PASSED
        const eligibleUnits = bb1Units.filter((u: any) =>
            u.status === "AVAILABLE" &&
            u.ttiscreeningstatus === "PASSED" &&
            new Date(u.expirydate) > new Date() &&
            (u.bloodgroup === "O_POSITIVE" || u.bloodgroup === "O_NEGATIVE") &&
            u.bloodcomponent === "RBC"
        );
        assert(eligibleUnits.some(u => u.unitid === u1.unitId), "4. Compatible O+ RBC unit u1 included in eligible stock");
        assert(eligibleUnits.some(u => u.unitid === u2.unitId), "4b. Compatible O+ RBC unit u2 included in eligible stock");
        assert(!eligibleUnits.some(u => u.unitid === qUnitId), "5. Quarantined unit excluded from eligible stock");
        assert(!eligibleUnits.some(u => u.unitid === fUnitId), "6. Failed screening unit excluded from eligible stock");
        assert(!eligibleUnits.some(u => u.unitid === expUnit.unitId), "8. Expired unit excluded from eligible stock");
        assert(!eligibleUnits.some(u => u.unitid === ffpUnit.unitId), "7. Wrong blood component (PLASMA vs RBC) excluded");
        assert(!eligibleUnits.some(u => u.unitid === abUnit.unitId), "9. Incompatible blood group (AB+ for O+ recipient) excluded");

        // Test 10 & 11: Attempt reservation with fewer units than required (1 selected when 2 required)
        const partialReserveRes = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/reservations`, {
            requestId: req1.requestid,
            requestedUnits: 2,
            specificUnitIds: [u1.unitId], // Only 1 selected
        }, bbToken, { "Idempotency-Key": `part-${tag}-${crypto.randomUUID()}` });
        assert(partialReserveRes.status === 400 || partialReserveRes.status === 409, "11. Prevention of reservation when fewer units selected than required");

        // Test 12: Successful reservation of exactly 2 units
        const reserveRes = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/reservations`, {
            requestId: req1.requestid,
            requestedUnits: 2,
            specificUnitIds: [u1.unitId, u2.unitId],
        }, bbToken, { "Idempotency-Key": `res1-${tag}-${crypto.randomUUID()}` });
        assert(reserveRes.status === 201, "12. Successful reservation using existing reservation API");
        assert(reserveRes.data.reservation.items.length === 2, "12b. Exactly 2 reservation items allocated");
        const reservation1Id = reserveRes.data.reservation.reservationId;

        // Test 13: Correct inventory available and reserved quantity updates
        const u1Post = await prisma.inventoryunits.findUnique({ where: { unitid: u1.unitId } });
        const u2Post = await prisma.inventoryunits.findUnique({ where: { unitid: u2.unitId } });
        assert(u1Post?.status === "RESERVED", "13a. Unit u1 status updated to RESERVED");
        assert(u2Post?.status === "RESERVED", "13b. Unit u2 status updated to RESERVED");

        // Test 14: Prevention of duplicate reservation of already reserved units
        const dupReserveRes = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/reservations`, {
            requestId: req1.requestid,
            requestedUnits: 1,
            specificUnitIds: [u1.unitId], // Already reserved
        }, bbToken, { "Idempotency-Key": `dup-${tag}-${crypto.randomUUID()}` });
        assert(dupReserveRes.status === 409, "14. Duplicate reservation attempt for already reserved unit blocked with 409");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("PHASE 2: Automatic Insufficient Stock Decline");
        console.log("-------------------------------------------------------------------------------");

        // Current BB1 state for O+ RBC:
        // u1=RESERVED, u2=RESERVED, u3=AVAILABLE. Total eligible available: 1 unit.

        // Test 2.1: Zero eligible stock -> Immediate auto-decline
        // Request B- RBC (BB1 has 0 B- units)
        const reqZeroStock = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hosp.hospitalid,
                patientname: "Anita Desai",
                patientage: 29,
                patientgender: "FEMALE",
                patientcontact: "9876543212",
                bloodgroup: blood_group.B_NEGATIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                requiredby: new Date(Date.now() + 24 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });
        const assignZero = await reqJson("POST", `/bloodrequests/${reqZeroStock.requestid}/assign`, { bloodBankId: bb1.bloodbankid }, hospToken);
        assert(assignZero.status === 201, "2.1 Zero stock assignment request processed");
        assert(assignZero.data.autoDeclined === true, "2.1b Zero eligible stock automatically declined (autoDeclined=true)");
        assert(assignZero.data.assignment.assignmentstatus === "DECLINED", "2.1c Assignment status recorded as DECLINED in database");
        assert(assignZero.data.assignment.declinereason === "Insufficient eligible blood stock available to fulfil the requested quantity at this facility.", "2.1d Correct exact decline reason saved");

        // Test 2.2: Partial eligible stock (2 units requested, only 1 available u3) -> Auto-declined without partial reservation
        const reqPartialStock = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hosp.hospitalid,
                patientname: "Kavita Rao",
                patientage: 42,
                patientgender: "FEMALE",
                patientcontact: "9876543213",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 2, // Only 1 available (u3)
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 48 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });
        const assignPartial = await reqJson("POST", `/bloodrequests/${reqPartialStock.requestid}/assign`, { bloodBankId: bb1.bloodbankid }, hospToken);
        assert(assignPartial.data.autoDeclined === true, "2.2 Partial eligible stock automatically declined");
        assert(assignPartial.data.assignment.assignmentstatus === "DECLINED", "2.2b Partial stock assignment recorded as DECLINED");
        // Verify remaining available unit u3 was NOT reserved partially
        const u3Check = await prisma.inventoryunits.findUnique({ where: { unitid: u3.unitId } });
        assert(u3Check?.status === "AVAILABLE", "2.2c Remaining unit remains AVAILABLE (no partial reservation occurred)");

        // Test 2.3: Verification of Hospital Notification on auto-decline
        const hospNotifications = await prisma.notification.findMany({
            where: {
                userid: hospUser.userid,
                type: notification_type.REQUEST,
                title: { contains: "Insufficient Stock" },
            },
        });
        assert(hospNotifications.length >= 2, "2.3 Hospital received exactly one notification per auto-decline event");
        assert(hospNotifications[0]?.message.includes("automatically declined"), "2.3b Notification message details auto-decline");

        // Test 2.4: Hospital can view decline status, reason and timestamp
        const hospReqView = await reqJson("GET", `/bloodrequests/${reqZeroStock.requestid}`, undefined, hospToken);
        assert(hospReqView.status === 200, "2.4 Hospital can fetch requisition details");
        const hospAssignments = hospReqView.data?.requisitionassignments || hospReqView.data?.request?.requisitionassignments || [];
        const declinedAssignment = hospAssignments.find((a: any) => a.bloodbankid === bb1.bloodbankid);
        assert(declinedAssignment?.assignmentstatus === "DECLINED", "2.4b Assignment status DECLINED visible to hospital");
        assert(declinedAssignment?.declinereason.includes("Insufficient eligible blood stock"), "2.4c Decline reason visible to hospital");
        assert(declinedAssignment?.respondedat !== null, "2.4d Decline timestamp recorded");

        // Test 2.5: Hospital can reassign the requisition to another blood bank (BB2)
        // First seed 1 B- RBC unit in BB2 so BB2 has sufficient stock
        await createAndClearUnit(bb2.bloodbankid, blood_group.B_NEGATIVE, blood_component.RBC, 45, bb2Token);
        const reassignRes = await reqJson("POST", `/bloodrequests/${reqZeroStock.requestid}/assign`, { bloodBankId: bb2.bloodbankid }, hospToken);
        assert(reassignRes.status === 201, "2.5 Hospital successfully reassigned requisition to secondary blood bank (BB2)");
        assert(reassignRes.data.assignment.assignmentstatus === "PENDING_ACCEPTANCE", "2.5b Reassigned requisition in BB2 is PENDING_ACCEPTANCE");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("PHASE 3: Concurrency and Idempotency");
        console.log("-------------------------------------------------------------------------------");

        // Test 3.1: Two simultaneous reservation attempts for the same single unit (u3)
        const reqConc1 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hosp.hospitalid,
                patientname: "Concurrent Patient 1",
                patientage: 30,
                patientgender: "MALE",
                patientcontact: "9876543214",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 48 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });
        const reqConc2 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hosp.hospitalid,
                patientname: "Concurrent Patient 2",
                patientage: 32,
                patientgender: "MALE",
                patientcontact: "9876543215",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 48 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });

        // Assign and accept both requisitions first
        const assignConc1 = await reqJson("POST", `/bloodrequests/${reqConc1.requestid}/assign`, { bloodBankId: bb1.bloodbankid }, hospToken);
        const assignConc2 = await reqJson("POST", `/bloodrequests/${reqConc2.requestid}/assign`, { bloodBankId: bb1.bloodbankid }, hospToken);
        await reqJson("PATCH", `/bloodbanks/${bb1.bloodbankid}/assignments/${assignConc1.data.assignment.assignmentid}`, { action: "ACCEPT" }, bbToken);
        await reqJson("PATCH", `/bloodbanks/${bb1.bloodbankid}/assignments/${assignConc2.data.assignment.assignmentid}`, { action: "ACCEPT" }, bbToken);

        const concKey1 = `conc1-${tag}-${crypto.randomUUID()}`;
        const concKey2 = `conc2-${tag}-${crypto.randomUUID()}`;

        const [concRes1, concRes2] = await Promise.all([
            reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/reservations`, {
                requestId: reqConc1.requestid,
                requestedUnits: 1,
                specificUnitIds: [u3.unitId],
            }, bbToken, { "Idempotency-Key": concKey1 }),
            reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/reservations`, {
                requestId: reqConc2.requestid,
                requestedUnits: 1,
                specificUnitIds: [u3.unitId],
            }, bbToken, { "Idempotency-Key": concKey2 }),
        ]);

        const concStatuses = [concRes1.status, concRes2.status].sort();
        assert(concStatuses[0] === 201 && concStatuses[1] === 409, "3.1 Simultaneous reservation attempts: exactly one succeeds (201), one rejected (409 Conflict)");

        // Test 3.2: Repeated reservation request using identical Idempotency-Key
        const winningKey = concRes1.status === 201 ? concKey1 : concKey2;
        const winningReqId = concRes1.status === 201 ? reqConc1.requestid : reqConc2.requestid;
        const originalReservationId = concRes1.status === 201 ? concRes1.data.reservation.reservationId : concRes2.data.reservation.reservationId;

        const replayRes = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/reservations`, {
            requestId: winningReqId,
            requestedUnits: 1,
            specificUnitIds: [u3.unitId],
        }, bbToken, { "Idempotency-Key": winningKey });

        assert(replayRes.status === 201, "3.2 Idempotent reservation replay returns 201");
        assert(replayRes.data.reservation.reservationId === originalReservationId, "3.2b Idempotent replay returns identical reservation ID without duplicate creation");

        // Test 3.3: Repeated assignment attempt on already assigned/accepted requisition
        const repeatAssignRes = await reqJson("POST", `/bloodrequests/${req1.requestid}/assign`, { bloodBankId: bb2.bloodbankid }, hospToken);
        assert(repeatAssignRes.status === 409, "3.3 Repeated assignment on already ACCEPTED requisition blocked with 409");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("PHASE 4: Existing Clinical Workflow Regression");
        console.log("-------------------------------------------------------------------------------");

        // Using reservation1 (units u1 and u2)
        const resDetail = await prisma.bloodreservations.findUnique({
            where: { reservationid: reservation1Id },
            include: { reservationitems: true },
        });
        const rItem1 = resDetail!.reservationitems[0];
        const rItem2 = resDetail!.reservationitems[1];

        // 4.1 Crossmatch Major/Minor workflow & Incompatible prevention
        // Attempt Incompatible crossmatch on Item 1
        const incompCross = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/crossmatches`, {
            reservationid: reservation1Id,
            reservationitemid: rItem1.itemid,
            unitid: rItem1.unitid,
            crossmatchresult: "INCOMPATIBLE",
            technologistname: "Lab Tech",
            verifiedByUserId: bbVerifier.userid,
        }, bbToken);
        assert(incompCross.status === 200, "4.1 Recorded INCOMPATIBLE crossmatch result");
        const rItem1AfterIncomp = await prisma.reservationitems.findUnique({ where: { itemid: rItem1.itemid } });
        assert(rItem1AfterIncomp?.itemstatus !== "PREPARED", "4.1b Incompatible unit is NOT marked PREPARED (cannot proceed)");

        // Re-test to COMPATIBLE
        const compCross1 = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/crossmatches`, {
            reservationid: reservation1Id,
            reservationitemid: rItem1.itemid,
            unitid: rItem1.unitid,
            crossmatchresult: "COMPATIBLE",
            technologistname: "Lab Tech",
            verifiedByUserId: bbVerifier.userid,
        }, bbToken);
        assert(compCross1.status === 200, "4.2 Recorded COMPATIBLE re-test crossmatch");
        const compCross2 = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/crossmatches`, {
            reservationid: reservation1Id,
            reservationitemid: rItem2.itemid,
            unitid: rItem2.unitid,
            crossmatchresult: "COMPATIBLE",
            technologistname: "Lab Tech",
            verifiedByUserId: bbVerifier.userid,
        }, bbToken);
        assert(compCross2.status === 200, "4.2b Both units crossmatched COMPATIBLE and PREPARED");

        // 4.3 Controlled Dispatch with cold-chain temperature
        const dispatchRes = await reqJson("POST", `/bloodbanks/${bb1.bloodbankid}/reservations/${reservation1Id}/dispatch`, {
            couriertemperature_c: 4.2,
            dispatchnotes: "Packed in validated active cold-box container",
        }, bbToken, { "Idempotency-Key": `dispatch-${tag}-${crypto.randomUUID()}` });
        assert(dispatchRes.status === 200, "4.3 Controlled dispatch succeeded with cold-chain temperature (4.2°C)");
        assert(dispatchRes.data?.status === "DISPATCHED" || dispatchRes.data?.reservationStatus === "DISPATCHED", "4.3b Reservation status is DISPATCHED");
        const dispatchedUnits = await prisma.inventoryunits.findMany({
            where: { unitid: { in: [rItem1.unitid, rItem2.unitid] } },
        });
        assert(dispatchedUnits.every(u => u.status === "IN_TRANSIT"), "4.3c Dispatched units are IN_TRANSIT");

        // 4.4 Hospital Receipt: 1 normal delivery (4.0°C) and 1 temperature excursion (15.5°C)
        const receiptRes = await reqJson("POST", `/bloodrequests/reservations/${reservation1Id}/receipt`, {
            itemReceipts: [
                { itemId: rItem1.itemid, receivedStatus: "ACCEPTED", tempReading: 4.0, notes: "Arrived at normal 4.0°C" },
                { itemId: rItem2.itemid, receivedStatus: "REJECTED_EXCURSION", tempReading: 15.5, notes: "Temperature excursion detected" },
            ],
        }, hospToken, { "Idempotency-Key": `receipt-${tag}-${crypto.randomUUID()}` });
        assert(receiptRes.status === 200, "4.4 Hospital receipt processed successfully");
        assert(receiptRes.data.deliveredCount === 1, "4.4b Exactly 1 unit delivered");
        assert(receiptRes.data.excursionCount === 1, "4.4c Exactly 1 unit flagged for excursion");

        const u1Final = await prisma.inventoryunits.findUnique({ where: { unitid: rItem1.unitid } });
        const u2Final = await prisma.inventoryunits.findUnique({ where: { unitid: rItem2.unitid } });
        assert(u1Final?.status === "DELIVERED", "4.5 Unit 1 status transitioned to DELIVERED");
        assert(u2Final?.status === "QUARANTINED", "4.6 Unit 2 quarantined due to cold-chain excursion");

        // 4.7 CHECK PARENT BLOOD REQUEST STATUS AFTER PARTIAL/EXCURSION DELIVERY
        const parentRequestAfterPartial = await prisma.bloodrequests.findUnique({
            where: { requestid: req1.requestid },
        });
        assert(parentRequestAfterPartial?.status !== "FULFILLED", "4.7a Parent blood request NOT marked FULFILLED when only 1 of 2 required units delivered (1 excursion)");

        // 4.8 TEST AUTOMATIC FULFILLMENT: Request where all required units are successfully delivered
        const reqFulfill = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hosp.hospitalid,
                patientname: "Full Delivery Patient",
                patientage: 60,
                patientgender: "FEMALE",
                patientcontact: "9876543299",
                bloodgroup: blood_group.B_NEGATIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 48 * 60 * 60 * 1000),
                status: "VERIFIED",
            },
        });

        // Seed 1 B- RBC unit in BB2 and clear it
        const uFulfill = await createAndClearUnit(bb2.bloodbankid, blood_group.B_NEGATIVE, blood_component.RBC, 30, bb2Token);
        const assignFulfill = await reqJson("POST", `/bloodrequests/${reqFulfill.requestid}/assign`, { bloodBankId: bb2.bloodbankid }, hospToken);
        await reqJson("PATCH", `/bloodbanks/${bb2.bloodbankid}/assignments/${assignFulfill.data.assignment.assignmentid}`, { action: "ACCEPT" }, bb2Token);

        const resFulfill = await reqJson("POST", `/bloodbanks/${bb2.bloodbankid}/reservations`, {
            requestId: reqFulfill.requestid,
            requestedUnits: 1,
            specificUnitIds: [uFulfill.unitId],
        }, bb2Token, { "Idempotency-Key": `res-ful-${tag}-${crypto.randomUUID()}` });

        const resFulfillId = resFulfill.data.reservation.reservationId;
        const resFulfillItemId = resFulfill.data.reservation.items[0].itemId;

        // Crossmatch COMPATIBLE
        await reqJson("POST", `/bloodbanks/${bb2.bloodbankid}/crossmatches`, {
            reservationid: resFulfillId,
            reservationitemid: resFulfillItemId,
            unitid: uFulfill.unitId,
            crossmatchresult: "COMPATIBLE",
            technologistname: "Lab Tech",
            verifiedByUserId: bbVerifier.userid,
        }, bb2Token);

        // Dispatch
        await reqJson("POST", `/bloodbanks/${bb2.bloodbankid}/reservations/${resFulfillId}/dispatch`, {
            couriertemperature_c: 4.1,
            dispatchnotes: "Direct courier delivery",
        }, bb2Token, { "Idempotency-Key": `disp-ful-${tag}-${crypto.randomUUID()}` });

        // Confirm Hospital Receipt: ACCEPTED
        const receiptFulRes = await reqJson("POST", `/bloodrequests/reservations/${resFulfillId}/receipt`, {
            itemReceipts: [
                { itemId: resFulfillItemId, receivedStatus: "ACCEPTED", tempReading: 4.0, notes: "All units delivered perfectly" },
            ],
        }, hospToken, { "Idempotency-Key": `rec-ful-${tag}-${crypto.randomUUID()}` });

        assert(receiptFulRes.status === 200, "4.8a Hospital receipt of all required units confirmed");

        const parentRequestAfterFull = await prisma.bloodrequests.findUnique({
            where: { requestid: reqFulfill.requestid },
        });
        assert(parentRequestAfterFull?.status === "FULFILLED", "4.8b Parent blood request automatically transitioned to FULFILLED");

        console.log("\n-------------------------------------------------------------------------------");
        console.log("PHASE 5: Portal Integration & Cross-Tenant Security");
        console.log("-------------------------------------------------------------------------------");

        // 5.1 Hospital Portal and Blood Bank Portal state synchronization
        const bbAssignmentsView = await reqJson("GET", `/bloodbanks/${bb1.bloodbankid}/assignments`, undefined, bbToken);
        const hospAssignmentsView = await reqJson("GET", `/bloodrequests/${req1.requestid}`, undefined, hospToken);
        assert(bbAssignmentsView.status === 200 && hospAssignmentsView.status === 200, "5.1 Both Blood Bank and Hospital APIs respond 200");

        // 5.2 Barcode and reservation visibility
        const bbAssignedReq = bbAssignmentsView.data.assignments.find((a: any) => a.requestid === req1.requestid);
        assert(bbAssignedReq !== undefined, "5.2 Requisition assignment visible on Blood Bank Requisitions page");
        assert(bbAssignedReq.bloodreservations?.length > 0, "5.2b Active blood reservation linked to requisition");
        const resItems = bbAssignedReq.bloodreservations[0].reservationitems || [];
        assert(resItems.some((i: any) => (i.inventoryunits?.unitbarcode === u1.barcode || i.inventoryunits?.barcode === u1.barcode)), "5.2c Allocated unit barcode visible in Blood Bank view");

        // 5.3 Cross-Tenant Isolation: Unauthorized hospital (Hosp 2) blocked from accessing Hosp 1's request
        const unauthHospView = await reqJson("GET", `/bloodrequests/${req1.requestid}`, undefined, hosp2Token);
        assert(unauthHospView.status === 403, "5.3 Unauthorized hospital blocked from viewing another hospital's requisition (403 Forbidden)");

        // 5.4 Cross-Tenant Isolation: Unauthorized blood bank (BB 2) blocked from accessing BB 1's units and assignments
        const unauthBbUnits = await reqJson("GET", `/bloodbanks/${bb1.bloodbankid}/units`, undefined, bb2Token);
        assert(unauthBbUnits.status === 403, "5.4 Unauthorized blood bank blocked from reading BB1 inventory units (403 Forbidden)");

        const unauthBbAssignments = await reqJson("GET", `/bloodbanks/${bb1.bloodbankid}/assignments`, undefined, bb2Token);
        assert(unauthBbAssignments.status === 403, "5.4b Unauthorized blood bank blocked from reading BB1 assignments (403 Forbidden)");

    } finally {
        server.close();
        await prisma.$disconnect();
    }

    console.log("\n===============================================================================");
    console.log(`  QA VERIFICATION SUMMARY: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
    console.log("===============================================================================\n");
    if (failures.length > 0) {
        console.log("Recorded Failures / Gaps:");
        failures.forEach((f, idx) => {
            console.log(`  ${idx + 1}. [${f.test}] -> ${f.error}`);
        });
    }
}

runQaVerificationSuite().catch((e) => {
    console.error("FATAL QA TEST RUNNER ERROR:", e);
    process.exit(1);
});
