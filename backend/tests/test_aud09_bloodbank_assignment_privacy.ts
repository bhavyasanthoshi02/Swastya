import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { UnitTraceabilityService } from "../src/services/unitTraceability.service";

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
    if (!condition) {
        totalFailed++;
        failures.push(message);
        console.error(`[FAIL] ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
    totalPassed++;
    console.log(`[PASS] ${message}`);
}

async function run() {
    // 0. Pre-flight verification: Must be on swastya_test database
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe("SELECT current_database()");
    const currentDb = dbCheck[0]?.current_database || "";
    assert(currentDb === "swastya_test", `Target database must be swastya_test (got: ${currentDb})`);

    const suffix = `${Date.now()}-aud09`;
    const userIds: string[] = [];
    const hospitalIds: string[] = [];
    const bloodBankIds: string[] = [];
    const requesterIds: string[] = [];
    const requestIds: string[] = [];
    let server: http.Server | null = null;
    let baseUrl = "";

    try {
        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", () => resolve());
        });
        const address = (server as any).address();
        baseUrl = `http://127.0.0.1:${address.port}`;

        // 1. Create Hospital User & Approved Hospital
        const hospUser = await prisma.users.create({
            data: {
                name: `AUD09 Hospital User ${suffix}`,
                email: `aud09-hosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(hospUser.userid);
        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `AUD09 Hospital ${suffix}`,
                registrationnumber: `HREG-AUD09-${suffix}`,
                contactpersonname: "Dr. Hospital Coordinator",
                contactpersonphone: "9123456780",
                address: "Hospital Emergency Wing, 4th Floor, Mumbai",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(hospital.hospitalid);
        const hospToken = generateToken(hospUser.userid, "HOSPITAL");

        // 2. Create Blood Bank A User & Approved Blood Bank A
        const bbAUser = await prisma.users.create({
            data: {
                name: `AUD09 Blood Bank A ${suffix}`,
                email: `aud09-bba-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        userIds.push(bbAUser.userid);
        const bloodBankA = await prisma.bloodbanks.create({
            data: {
                userid: bbAUser.userid,
                bloodbankname: `AUD09 Blood Bank A ${suffix}`,
                licensenumber: `LIC-BBA-${suffix}`,
                contactpersonname: "Manager A",
                contactpersonphone: "9123456781",
                address: "Blood Bank A St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400002",
                approvalstatus: "APPROVED",
            },
        });
        bloodBankIds.push(bloodBankA.bloodbankid);
        const bbAToken = generateToken(bbAUser.userid, "BLOOD_BANK");

        // 3. Create Blood Bank B User & Approved Blood Bank B (for cross-tenant tests)
        const bbBUser = await prisma.users.create({
            data: {
                name: `AUD09 Blood Bank B ${suffix}`,
                email: `aud09-bbb-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        userIds.push(bbBUser.userid);
        const bloodBankB = await prisma.bloodbanks.create({
            data: {
                userid: bbBUser.userid,
                bloodbankname: `AUD09 Blood Bank B ${suffix}`,
                licensenumber: `LIC-BBB-${suffix}`,
                contactpersonname: "Manager B",
                contactpersonphone: "9123456782",
                address: "Blood Bank B St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400003",
                approvalstatus: "APPROVED",
            },
        });
        bloodBankIds.push(bloodBankB.bloodbankid);
        const bbBToken = generateToken(bbBUser.userid, "BLOOD_BANK");

        // 4. Create Requester User & Requester Profile
        const reqUser = await prisma.users.create({
            data: {
                name: `AUD09 Requester ${suffix}`,
                email: `aud09-req-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "REQUESTER",
            },
        });
        userIds.push(reqUser.userid);
        const requester = await prisma.requesters.create({
            data: {
                userid: reqUser.userid,
                address: "Requester Home St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400020",
            },
        });
        requesterIds.push(requester.requesterid);

        // Helper to create a request with prescription and assign to a blood bank
        const createRequisitionAndAssign = async (patientName: string, patientPhone: string, rxUrl: string, targetBloodBankId: string) => {
            const req = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: reqUser.userid,
                    requesterid: requester.requesterid,
                    hospitalid: hospital.hospitalid,
                    patientname: patientName,
                    patientage: 35,
                    patientgender: "FEMALE",
                    patientcontact: patientPhone,
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "HIGH",
                    status: "CREATED",
                    notes: `Confidential clinical notes for ${patientName}`,
                    requiredby: new Date(Date.now() + 3600000),
                },
            });
            requestIds.push(req.requestid);

            await prisma.prescription.create({
                data: {
                    requestid: req.requestid,
                    doctorname: "Dr. Transfusion Specialist",
                    hospitalname: hospital.hospitalname,
                    fileurl: rxUrl,
                    originalfilename: "patient-rx-confidential.pdf",
                    mimetype: "application/pdf",
                    filesize: 2048,
                    status: "VERIFIED",
                    verifiedbyhospitalid: hospital.hospitalid,
                    verificationdate: new Date(),
                    remarks: "Special crossmatch required: CMV negative",
                },
            });

            const assignmentResult = await UnitTraceabilityService.assignRequisition(
                req.requestid,
                targetBloodBankId,
                hospUser.userid,
                hospital.hospitalid
            );

            return { request: req, assignmentId: assignmentResult.assignment.assignmentid };
        };

        // -------------------------------------------------------------------------
        // SETUP TEST CASES ACROSS LIFECYCLE STATUSES
        // -------------------------------------------------------------------------
        console.log("\n--- Creating Requisitions across Lifecycle Statuses ---");

        // 1. PENDING assignment for Blood Bank A
        const pendingCase = await createRequisitionAndAssign(
            "Alice Pending Patient",
            "9999911111",
            "secret-rx-file-pending.pdf",
            bloodBankA.bloodbankid
        );

        // 2. DECLINED assignment for Blood Bank A
        const declinedCase = await createRequisitionAndAssign(
            "Bob Declined Patient",
            "9999922222",
            "secret-rx-file-declined.pdf",
            bloodBankA.bloodbankid
        );
        // Decline it
        await UnitTraceabilityService.respondToAssignment(
            declinedCase.assignmentId,
            bloodBankA.bloodbankid,
            bbAUser.userid,
            "DECLINE",
            "Component currently out of stock"
        );

        // 3. CANCELLED assignment for Blood Bank A
        const cancelledCase = await createRequisitionAndAssign(
            "Charlie Cancelled Patient",
            "9999933333",
            "secret-rx-file-cancelled.pdf",
            bloodBankA.bloodbankid
        );
        // Cancel it by updating status to CANCELLED
        await prisma.requisitionassignments.update({
            where: { assignmentid: cancelledCase.assignmentId },
            data: { assignmentstatus: "CANCELLED" },
        });

        // 4. ACCEPTED assignment for Blood Bank A
        const acceptedCase = await createRequisitionAndAssign(
            "Diana Accepted Patient",
            "9999944444",
            "clinical-rx-file-accepted.pdf",
            bloodBankA.bloodbankid
        );
        // Accept it
        await UnitTraceabilityService.respondToAssignment(
            acceptedCase.assignmentId,
            bloodBankA.bloodbankid,
            bbAUser.userid,
            "ACCEPT"
        );

        // -------------------------------------------------------------------------
        // SECTION 1: Finding AUD-09 — PENDING Assignment Sensitive Fields Excluded
        // -------------------------------------------------------------------------
        console.log("\n--- Testing AUD-09.1: PENDING Assignment Privacy ---");

        const resPending = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments/${pendingCase.assignmentId}`, {
            headers: { Authorization: `Bearer ${bbAToken}` },
        });
        assert(resPending.status === 200, "1.1: GET single assignment returns 200 for PENDING assignment");
        const jsonPending = await resPending.json();
        const pendingAssign = jsonPending.assignment;
        const pendingReq = pendingAssign?.bloodrequests;
        const pendingRx = pendingReq?.prescription;
        const pendingHosp = pendingReq?.hospitals;

        assert(pendingAssign.assignmentstatus === "PENDING_ACCEPTANCE", "1.2: Assignment status is PENDING_ACCEPTANCE");
        assert(pendingRx?.fileurl === undefined, "1.3: Prescription fileurl is strictly excluded when PENDING");
        assert(pendingReq?.patientcontact === undefined, "1.4: Patient contact number is strictly excluded when PENDING");
        assert(pendingReq?.patientname === undefined, "1.5: Patient name is strictly excluded when PENDING");
        assert(pendingReq?.notes === undefined, "1.6: Clinical notes are strictly excluded when PENDING");
        assert(pendingRx?.doctorname === undefined, "1.7: Prescription doctorname is excluded when PENDING");
        assert(pendingRx?.remarks === undefined, "1.8: Prescription internal remarks are excluded when PENDING");
        assert(pendingHosp?.contactpersonphone === undefined, "1.9: Hospital contact phone is excluded when PENDING");
        assert(pendingHosp?.registrationnumber === undefined, "1.10: Hospital registration number is excluded when PENDING");
        assert(pendingHosp?.userid === undefined, "1.11: Hospital user ID is excluded when PENDING");
        // Verify permitted fields are present
        assert(pendingReq?.bloodgroup === "O_POSITIVE", "1.12: Essential bloodgroup is present when PENDING");
        assert(pendingReq?.unitsrequired === 2, "1.13: Essential unitsrequired is present when PENDING");
        assert(pendingHosp?.hospitalname === hospital.hospitalname, "1.14: Essential hospitalname is present when PENDING");
        assert(pendingRx?.status === "VERIFIED", "1.15: Essential prescription status is present when PENDING");

        // -------------------------------------------------------------------------
        // SECTION 2: Finding AUD-09 — DECLINED Assignment Sensitive Fields Excluded
        // -------------------------------------------------------------------------
        console.log("\n--- Testing AUD-09.2: DECLINED Assignment Privacy ---");

        const resDeclined = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments/${declinedCase.assignmentId}`, {
            headers: { Authorization: `Bearer ${bbAToken}` },
        });
        assert(resDeclined.status === 200, "2.1: GET single assignment returns 200 for DECLINED assignment");
        const jsonDeclined = await resDeclined.json();
        const declinedAssign = jsonDeclined.assignment;
        const declinedReq = declinedAssign?.bloodrequests;

        assert(declinedAssign.assignmentstatus === "DECLINED", "2.2: Assignment status is DECLINED");
        assert(declinedReq?.prescription?.fileurl === undefined, "2.3: Prescription fileurl is strictly excluded when DECLINED");
        assert(declinedReq?.patientcontact === undefined, "2.4: Patient contact is strictly excluded when DECLINED");
        assert(declinedReq?.patientname === undefined, "2.5: Patient name is strictly excluded when DECLINED");
        assert(declinedReq?.notes === undefined, "2.6: Notes are strictly excluded when DECLINED");
        assert(declinedReq?.hospitals?.contactpersonphone === undefined, "2.7: Hospital contact phone is excluded when DECLINED");
        assert(declinedAssign.declinereason === "Component currently out of stock", "2.8: Decline reason is visible");

        // -------------------------------------------------------------------------
        // SECTION 3: Finding AUD-09 — CANCELLED Assignment Sensitive Fields Excluded
        // -------------------------------------------------------------------------
        console.log("\n--- Testing AUD-09.3: CANCELLED Assignment Privacy ---");

        const resCancelled = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments/${cancelledCase.assignmentId}`, {
            headers: { Authorization: `Bearer ${bbAToken}` },
        });
        assert(resCancelled.status === 200, "3.1: GET single assignment returns 200 for CANCELLED assignment");
        const jsonCancelled = await resCancelled.json();
        const cancelledAssign = jsonCancelled.assignment;
        const cancelledReq = cancelledAssign?.bloodrequests;

        assert(cancelledAssign.assignmentstatus === "CANCELLED", "3.2: Assignment status is CANCELLED");
        assert(cancelledReq?.prescription?.fileurl === undefined, "3.3: Prescription fileurl is strictly excluded when CANCELLED");
        assert(cancelledReq?.patientcontact === undefined, "3.4: Patient contact is strictly excluded when CANCELLED");
        assert(cancelledReq?.patientname === undefined, "3.5: Patient name is strictly excluded when CANCELLED");
        assert(cancelledReq?.notes === undefined, "3.6: Notes are strictly excluded when CANCELLED");
        assert(cancelledReq?.hospitals?.contactpersonphone === undefined, "3.7: Hospital phone is excluded when CANCELLED");

        // -------------------------------------------------------------------------
        // SECTION 4: Finding AUD-09 — ACCEPTED Assignment Explicit Permitted Fields
        // -------------------------------------------------------------------------
        console.log("\n--- Testing AUD-09.4: ACCEPTED Assignment Explicit Permitted Fields ---");

        const resAccepted = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments/${acceptedCase.assignmentId}`, {
            headers: { Authorization: `Bearer ${bbAToken}` },
        });
        assert(resAccepted.status === 200, "4.1: GET single assignment returns 200 for ACCEPTED assignment");
        const jsonAccepted = await resAccepted.json();
        const acceptedAssign = jsonAccepted.assignment;
        const acceptedReq = acceptedAssign?.bloodrequests;
        const acceptedRx = acceptedReq?.prescription;
        const acceptedHosp = acceptedReq?.hospitals;

        assert(acceptedAssign.assignmentstatus === "ACCEPTED", "4.2: Assignment status is ACCEPTED");
        // Permitted fields genuinely required for clinical workflow
        assert(acceptedReq?.patientname === "Diana Accepted Patient", "4.3: Patient name is exposed for crossmatch labeling when ACCEPTED");
        assert(acceptedRx?.fileurl === "clinical-rx-file-accepted.pdf", "4.4: Prescription fileurl is exposed for clinical verification when ACCEPTED");
        assert(acceptedRx?.doctorname === "Dr. Transfusion Specialist", "4.5: Doctor name is exposed when ACCEPTED");
        assert(acceptedHosp?.address === "Hospital Emergency Wing, 4th Floor, Mumbai", "4.6: Hospital delivery address is exposed when ACCEPTED");
        assert(acceptedHosp?.contactpersonname === "Dr. Hospital Coordinator", "4.7: Hospital liaison contact name is exposed when ACCEPTED");
        assert(acceptedHosp?.contactpersonphone === "9123456780", "4.8: Hospital coordinator phone is exposed when ACCEPTED");

        // Fields that must NEVER be exposed even after ACCEPTED
        assert(acceptedReq?.patientcontact === undefined, "4.9: Patient personal contact is NEVER exposed even when ACCEPTED");
        assert(acceptedRx?.remarks === undefined, "4.10: Prescription internal remarks are NEVER exposed even when ACCEPTED");
        assert(acceptedHosp?.registrationnumber === undefined, "4.11: Hospital registration number is NEVER exposed even when ACCEPTED");
        assert(acceptedHosp?.userid === undefined, "4.12: Hospital user account ID is NEVER exposed even when ACCEPTED");

        // -------------------------------------------------------------------------
        // SECTION 5: Cross-Blood-Bank Access Isolation
        // -------------------------------------------------------------------------
        console.log("\n--- Testing AUD-09.5: Cross-Blood-Bank Access Isolation ---");

        // 5a. Blood Bank B attempts to access Blood Bank A's assignments list
        const crossListResp = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments`, {
            headers: { Authorization: `Bearer ${bbBToken}` },
        });
        assert(crossListResp.status === 403, "5.1: Blood Bank B blocked (403) from accessing Blood Bank A assignments list");

        // 5b. Blood Bank B attempts to access Blood Bank A's specific assignment
        const crossSingleResp = await fetch(`${baseUrl}/bloodbanks/${bloodBankB.bloodbankid}/assignments/${acceptedCase.assignmentId}`, {
            headers: { Authorization: `Bearer ${bbBToken}` },
        });
        assert(crossSingleResp.status === 404, "5.2: Blood Bank B cannot access Blood Bank A's assignment by ID (404)");

        // 5c. Blood Bank B queries its own assignments list -> sees zero assignments from Blood Bank A
        const bListResp = await fetch(`${baseUrl}/bloodbanks/${bloodBankB.bloodbankid}/assignments`, {
            headers: { Authorization: `Bearer ${bbBToken}` },
        });
        assert(bListResp.status === 200, "5.3: Blood Bank B can query its own assignments list");
        const bListJson = await bListResp.json();
        const foreignAssignments = (bListJson.assignments || []).filter((a: any) => a.bloodbankid === bloodBankA.bloodbankid);
        assert(foreignAssignments.length === 0, "5.4: Blood Bank B assignments list contains zero foreign tenant assignments");

        // -------------------------------------------------------------------------
        // SECTION 6: Nested Response Object String Leak Inspection
        // -------------------------------------------------------------------------
        console.log("\n--- Testing AUD-09.6: Nested Raw JSON Payload Inspection ---");

        // Query all assignments for Blood Bank A
        const allListResp = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments`, {
            headers: { Authorization: `Bearer ${bbAToken}` },
        });
        assert(allListResp.status === 200, "6.1: Blood Bank A can query its assignments list");
        const allListText = await allListResp.text();

        // Verify sensitive patient phone numbers from pending/declined/cancelled cases are NOT in raw payload
        assert(!allListText.includes("9999911111"), "6.2: Raw JSON does not contain pending patient contact phone");
        assert(!allListText.includes("9999922222"), "6.3: Raw JSON does not contain declined patient contact phone");
        assert(!allListText.includes("9999933333"), "6.4: Raw JSON does not contain cancelled patient contact phone");
        assert(!allListText.includes("9999944444"), "6.5: Raw JSON does not contain accepted patient contact phone (shielded)");

        // Verify non-accepted prescription file URLs are NOT in raw payload
        assert(!allListText.includes("secret-rx-file-pending.pdf"), "6.6: Raw JSON does not contain pending prescription fileurl");
        assert(!allListText.includes("secret-rx-file-declined.pdf"), "6.7: Raw JSON does not contain declined prescription fileurl");
        assert(!allListText.includes("secret-rx-file-cancelled.pdf"), "6.8: Raw JSON does not contain cancelled prescription fileurl");

        // Verify accepted prescription file URL IS present in raw payload
        assert(allListText.includes("clinical-rx-file-accepted.pdf"), "6.9: Raw JSON contains accepted prescription fileurl");

        // Verify hospital registration numbers are NOT in raw payload
        assert(!allListText.includes(`HREG-AUD09-${suffix}`), "6.10: Raw JSON does not leak hospital registration number");

        // -------------------------------------------------------------------------
        // SECTION 7: Existing Assignment Functionality Remains Operational
        // -------------------------------------------------------------------------
        console.log("\n--- Testing AUD-09.7: Workflow Operational Integrity ---");

        // Create an additional pending requisition and test respondToAssignment (ACCEPT)
        const opCase = await createRequisitionAndAssign(
            "Operational Flow Patient",
            "9999955555",
            "op-flow-rx.pdf",
            bloodBankA.bloodbankid
        );

        const acceptResp = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments/${opCase.assignmentId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${bbAToken}`,
            },
            body: JSON.stringify({ action: "ACCEPT" }),
        });
        assert(acceptResp.status === 200, "7.1: Blood Bank A can successfully accept a pending assignment");
        const acceptJson = await acceptResp.json();
        assert(acceptJson.assignment?.assignmentstatus === "ACCEPTED", "7.2: Assignment status successfully transitioned to ACCEPTED");

        // Verify that after acceptance, the assignments endpoint immediately reveals the permitted clinical fields
        const postAcceptGet = await fetch(`${baseUrl}/bloodbanks/${bloodBankA.bloodbankid}/assignments/${opCase.assignmentId}`, {
            headers: { Authorization: `Bearer ${bbAToken}` },
        });
        const postAcceptJson = await postAcceptGet.json();
        assert(postAcceptJson.assignment?.bloodrequests?.patientname === "Operational Flow Patient", "7.3: Patient name immediately available upon acceptance");
        assert(postAcceptJson.assignment?.bloodrequests?.prescription?.fileurl === "op-flow-rx.pdf", "7.4: Prescription fileurl immediately available upon acceptance");
        assert(postAcceptJson.assignment?.bloodrequests?.patientcontact === undefined, "7.5: Patient contact remains shielded upon acceptance");

    } finally {
        if (server) {
            await new Promise<void>((resolve) => (server as http.Server).close(() => resolve()));
        }

        // Clean up test fixtures from swastya_test
        if (requestIds.length > 0) {
            await prisma.requisitionassignments.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescriptionhistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescription.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
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
            await prisma.notification.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
        }
    }
}

run()
    .then(async () => {
        await prisma.$disconnect();
        console.log(`\n=======================================================`);
        console.log(`AUD-09 Blood Bank Assignment Privacy Suite: PASS`);
        console.log(`Total Passed: ${totalPassed}`);
        console.log(`Total Failed: ${totalFailed}`);
        console.log(`=======================================================\n`);
    })
    .catch(async (error) => {
        console.error(`\n=======================================================`);
        console.error(`AUD-09 Blood Bank Assignment Privacy Suite: FAIL`);
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
