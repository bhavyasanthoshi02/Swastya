import http from "node:http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, urgency_level, gender_type } from "../src/generated/prisma/enums";

let API_BASE = "http://127.0.0.1:5000";
let server: http.Server | null = null;

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

async function runPhase52CoordinationTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 5.2: HOSPITAL BLOOD REQUEST COORDINATION & STATUS TRANSITIONS  ");
    console.log("===============================================================================\n");

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as any;
    API_BASE = `http://127.0.0.1:${addr.port}`;
    console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);

    const timestamp = Date.now();
    const emailHospA = `p52_hosp_a_${timestamp}@example.com`;
    const emailHospB = `p52_hosp_b_${timestamp}@example.com`;
    const emailUnlinkedHosp = `p52_unlinked_hosp_${timestamp}@example.com`;
    const emailReq = `p52_req_${timestamp}@example.com`;
    const emailDonor = `p52_donor_${timestamp}@example.com`;
    const emailAdmin = `p52_admin_${timestamp}@example.com`;

    let hospAUser: any = null;
    let hospBUser: any = null;
    let unlinkedHospUser: any = null;
    let reqUser: any = null;
    let donorUser: any = null;
    let adminUser: any = null;

    let hospitalAData: any = null;
    let hospitalBData: any = null;
    let requesterData: any = null;
    let donorData: any = null;

    let tokenHospA = "";
    let tokenHospB = "";
    let tokenUnlinkedHosp = "";
    let tokenReq = "";
    let tokenDonor = "";
    let tokenAdmin = "";

    const createdRequestIds: string[] = [];

    try {
        console.log("--- Setup: Provisioning Isolated Test Entities ---");

        // 1. Hospital A
        const regHospARes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Dr. Bangalore Coordinator",
                email: emailHospA,
                password: "SecurePassword123!",
                phone: "9876543201",
                role: "HOSPITAL",
                hospitalname: `Apex Medical Center ${timestamp}`,
                registrationnumber: `REG-APEX-${timestamp}`,
                contactpersonname: "Dr. Bangalore Coordinator",
                contactpersonphone: "9876543201",
                address: "100 Medical Boulevard",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560002",
            }),
        });
        const regHospAJson = await regHospARes.json();
        assert(regHospARes.status === 201, "Setup: Hospital A registered successfully");
        tokenHospA = regHospAJson.token;
        hospAUser = regHospAJson.user;
        hospitalAData = regHospAJson.hospital;

        // 2. Hospital B (Unrelated Hospital)
        const regHospBRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Dr. Mysore Coordinator",
                email: emailHospB,
                password: "SecurePassword123!",
                phone: "9876543202",
                role: "HOSPITAL",
                hospitalname: `Careline Hospital ${timestamp}`,
                registrationnumber: `REG-CARE-${timestamp}`,
                contactpersonname: "Dr. Mysore Coordinator",
                contactpersonphone: "9876543202",
                address: "200 Health Way",
                city: "Mysuru",
                state: "Karnataka",
                pincode: "570001",
            }),
        });
        const regHospBJson = await regHospBRes.json();
        assert(regHospBRes.status === 201, "Setup: Hospital B registered successfully");
        tokenHospB = regHospBJson.token;
        hospBUser = regHospBJson.user;
        hospitalBData = regHospBJson.hospital;

        // 3. User with role HOSPITAL but without linked hospital profile
        unlinkedHospUser = await prisma.users.create({
            data: {
                name: "Unlinked Hospital User",
                email: emailUnlinkedHosp,
                password: "hashedpasswordplaceholder",
                phonenumber: "9876543203",
                role: "HOSPITAL",
            },
        });
        tokenUnlinkedHosp = generateToken(unlinkedHospUser.userid, unlinkedHospUser.role);

        // 4. Requester
        reqUser = await prisma.users.create({
            data: {
                name: "Anand Verma",
                email: emailReq,
                password: "hashedpasswordplaceholder",
                phonenumber: "9876543204",
                role: "REQUESTER",
            },
        });
        requesterData = await prisma.requesters.create({
            data: {
                userid: reqUser.userid,
                address: "12 Lake View Apartments",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560003",
            },
        });
        tokenReq = generateToken(reqUser.userid, reqUser.role);

        // 5. Voluntary Donor (O_POSITIVE, available, eligible)
        donorUser = await prisma.users.create({
            data: {
                name: "Kiran Rao",
                email: emailDonor,
                password: "hashedpasswordplaceholder",
                phonenumber: "9876543205",
                role: "DONOR",
            },
        });
        donorData = await prisma.donors.create({
            data: {
                userid: donorUser.userid,
                bloodgroup: blood_group.O_POSITIVE,
                dateofbirth: new Date("1995-05-15"),
                gender: gender_type.MALE,
                weight: 68.5,
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560002",
                address: "56 Indiranagar",
                iseligible: true,
            },
        });
        tokenDonor = generateToken(donorUser.userid, donorUser.role);

        // 6. Admin
        adminUser = await prisma.users.create({
            data: {
                name: "Platform Administrator",
                email: emailAdmin,
                password: "hashedpasswordplaceholder",
                phonenumber: "9876543206",
                role: "ADMIN",
            },
        });
        tokenAdmin = generateToken(adminUser.userid, adminUser.role);

        console.log("Setup complete.\n");

        // =====================================================================
        // SUITE 1: REQUEST CREATION WITH HOSPITAL ASSIGNMENT & NOTIFICATION
        // =====================================================================
        console.log("--- Suite 1: Request Creation & Hospital Notification ---");

        const createReqRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenReq}`,
            },
            body: JSON.stringify({
                hospitalid: hospitalAData.hospitalid,
                patientname: "Sunita Verma",
                patientage: 42,
                patientgender: "FEMALE",
                patientcontact: "9876543210",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                isemergency: true,
                requiredby: new Date(Date.now() + 86400000).toISOString(),
                notes: "Emergency surgical admission at treating facility",
            }),
        });

        assert(createReqRes.status === 201, `1a. Requester created blood request (Status: ${createReqRes.status})`);
        const reqData1 = await createReqRes.json();
        const requestId1 = reqData1.requestid;
        createdRequestIds.push(requestId1);

        assert(reqData1.status === "CREATED", "1b. Initial request status is CREATED");
        assert(reqData1.hospitalid === hospitalAData.hospitalid, "1c. Assigned to Hospital A");

        // Verify Hospital A received an in-app notification for the assigned request
        const hospANotifs = await prisma.notification.findMany({
            where: {
                userid: hospAUser.userid,
                requestid: requestId1,
            },
        });
        assert(hospANotifs.length === 1, "1d. Hospital A received exactly one notification for new request");
        assert(hospANotifs[0].title === "New Blood Requisition Received", "1e. Notification title is 'New Blood Requisition Received'");
        assert(hospANotifs[0].message.includes("Sunita Verma"), "1f. Notification mentions patient name");

        // Verify Hospital B received NO notification
        const hospBNotifs = await prisma.notification.findMany({
            where: {
                userid: hospBUser.userid,
                requestid: requestId1,
            },
        });
        assert(hospBNotifs.length === 0, "1g. Hospital B received zero notifications for Hospital A's request");

        // =====================================================================
        // SUITE 2: HOSPITAL AUTHORIZATION CHECKS ON PUT /bloodrequests/:id
        // =====================================================================
        console.log("\n--- Suite 2: Hospital Authorization Checks on PUT /bloodrequests/:id ---");

        // 2a. Unauthenticated access -> 401
        const unauthRes = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW" }),
        });
        assert(unauthRes.status === 401, `2a. Unauthenticated PUT returns 401 (got ${unauthRes.status})`);

        // 2b. Donor user attempting PUT -> 403
        const donorPutRes = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenDonor}`,
            },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW" }),
        });
        assert(donorPutRes.status === 403, `2b. Donor cannot update blood request (got 403)`);

        // 2c. User with HOSPITAL role but no linked hospital profile -> 403
        const unlinkedPutRes = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenUnlinkedHosp}`,
            },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW" }),
        });
        assert(unlinkedPutRes.status === 403, `2c. Unlinked hospital profile receives 403 (got ${unlinkedPutRes.status})`);
        const unlinkedJson = await unlinkedPutRes.json();
        assert(unlinkedJson.message.includes("no hospital profile linked"), "2d. Error explains missing hospital profile link");

        // 2e. Unrelated Hospital B attempting PUT on Hospital A's request -> 403
        const unrelatedPutRes = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospB}`,
            },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW" }),
        });
        assert(unrelatedPutRes.status === 403, `2e. Unrelated Hospital B receives 403 (got ${unrelatedPutRes.status})`);
        const unrelatedJson = await unrelatedPutRes.json();
        assert(unrelatedJson.message.includes("not assigned to your hospital"), "2f. Error explains request not assigned to Hospital B");

        // 2g. Assigned Hospital A can successfully manage request -> 200
        const hospAPutRes = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                status: "HOSPITAL_REVIEW",
                remarks: "Clinical team reviewed and admitted patient",
            }),
        });
        assert(hospAPutRes.status === 200, `2g. Assigned Hospital A successfully updates request (Status: ${hospAPutRes.status})`);
        const hospAUpdated = await hospAPutRes.json();
        assert(hospAUpdated.status === "HOSPITAL_REVIEW", "2h. Status updated to HOSPITAL_REVIEW");

        // Verify status history entry was created
        const history1 = await prisma.requeststatushistory.findMany({
            where: { requestid: requestId1 },
            orderBy: { changedat: "desc" },
        });
        assert(history1.length === 2, "2i. Exactly 2 status history records created (initial CREATED + HOSPITAL_REVIEW)");
        assert(history1[0].oldstatus === "CREATED", "2j. History oldstatus: CREATED");
        assert(history1[0].newstatus === "HOSPITAL_REVIEW", "2k. History newstatus: HOSPITAL_REVIEW");
        assert(history1[0].changedbyuserid === hospAUser.userid, "2l. changedbyuserid matches Hospital A user ID");
        assert(history1[0].remarks === "Clinical team reviewed and admitted patient", "2m. Remarks correctly persisted");

        // =====================================================================
        // SUITE 3: PERMITTED STATUS TRANSITIONS (STEP-BY-STEP WORKFLOW)
        // =====================================================================
        console.log("\n--- Suite 3: Permitted Status Transitions (Step-by-Step) ---");

        // Step 1: HOSPITAL_REVIEW -> BLOOD_BANK_CHECK
        const trans1Res = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                status: "BLOOD_BANK_CHECK",
                remarks: "Checking internal inventory for 2 units O+",
            }),
        });
        assert(trans1Res.status === 200, "3a. Transition to BLOOD_BANK_CHECK succeeds");
        const trans1Json = await trans1Res.json();
        assert(trans1Json.status === "BLOOD_BANK_CHECK", "3b. Status is now BLOOD_BANK_CHECK");

        // Step 2: BLOOD_BANK_CHECK -> DONOR_MATCHING
        const trans2Res = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                status: "DONOR_MATCHING",
                remarks: "Blood bank low on O+ units; initiating community donor matching",
            }),
        });
        assert(trans2Res.status === 200, "3c. Transition to DONOR_MATCHING succeeds");
        const trans2Json = await trans2Res.json();
        assert(trans2Json.status === "DONOR_MATCHING", "3d. Status is now DONOR_MATCHING");

        // Step 3: DONOR_MATCHING -> BLOOD_ARRANGED
        const trans3Res = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                status: "BLOOD_ARRANGED",
                remarks: "Donor arrived, donated, and units cleared infectious screening",
            }),
        });
        assert(trans3Res.status === 200, "3e. Transition to BLOOD_ARRANGED succeeds");
        const trans3Json = await trans3Res.json();
        assert(trans3Json.status === "BLOOD_ARRANGED", "3f. Status is now BLOOD_ARRANGED");

        // Step 4: BLOOD_ARRANGED -> FULFILLED (Transfusion completed and verified by Hospital)
        const trans4Res = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                status: "FULFILLED",
                remarks: "Transfusion completed and clinically verified by attending hematologist",
            }),
        });
        assert(trans4Res.status === 200, "3g. Transition to FULFILLED succeeds for authorized hospital");
        const trans4Json = await trans4Res.json();
        assert(trans4Json.status === "FULFILLED", "3h. Status is now FULFILLED");

        // Verify complete history chain for requestId1
        const fullHistory = await prisma.requeststatushistory.findMany({
            where: { requestid: requestId1 },
            orderBy: { changedat: "asc" },
        });
        assert(fullHistory.length === 6, `3i. Exactly 6 history entries recorded (got ${fullHistory.length})`);
        assert(fullHistory[5].newstatus === "FULFILLED", "3j. Final history step is FULFILLED");

        // =====================================================================
        // SUITE 4: INVALID STATUS TRANSITIONS & DIRECT JUMPS
        // =====================================================================
        console.log("\n--- Suite 4: Invalid Status Transitions & Direct Jumps ---");

        // Create fresh request 2 for invalid transition testing
        const req2Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenReq}`,
            },
            body: JSON.stringify({
                hospitalid: hospitalAData.hospitalid,
                patientname: "Ramesh Gupta",
                patientage: 55,
                patientgender: "MALE",
                patientcontact: "9876543211",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "MEDIUM",
                requiredby: new Date(Date.now() + 86400000).toISOString(),
            }),
        });
        const req2Data = await req2Res.json();
        const requestId2 = req2Data.requestid;
        createdRequestIds.push(requestId2);

        // 4a. Attempt direct transition CREATED -> FULFILLED (Bypass workflow) -> 400
        const jumpFulfilledRes = await fetch(`${API_BASE}/bloodrequests/${requestId2}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(jumpFulfilledRes.status === 400, `4a. Direct jump CREATED -> FULFILLED rejected with 400 (got ${jumpFulfilledRes.status})`);
        const jumpFulfilledJson = await jumpFulfilledRes.json();
        assert(jumpFulfilledJson.message.includes("Invalid status transition"), "4b. Validation error message returned");

        // 4c. Attempt invalid transition CREATED -> BLOOD_ARRANGED directly -> 400
        const jumpArrangedRes = await fetch(`${API_BASE}/bloodrequests/${requestId2}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({ status: "BLOOD_ARRANGED" }),
        });
        assert(jumpArrangedRes.status === 400, `4c. Direct jump CREATED -> BLOOD_ARRANGED rejected with 400 (got ${jumpArrangedRes.status})`);

        // 4d. Attempt completely invalid status value -> 400
        const invalidEnumRes = await fetch(`${API_BASE}/bloodrequests/${requestId2}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({ status: "NOT_A_REAL_STATUS" }),
        });
        assert(invalidEnumRes.status === 400, `4d. Bogus status enum rejected with 400 (got ${invalidEnumRes.status})`);

        // 4e. Verify no additional history entries were created for rejected attempts (only initial creation entry persists)
        const req2History = await prisma.requeststatushistory.findMany({
            where: { requestid: requestId2 },
        });
        assert(req2History.length === 1, "4e. Exactly 1 history record remains for rejected transitions (initial creation entry)");

        // =====================================================================
        // SUITE 5: TERMINAL STATUS PROTECTIONS
        // =====================================================================
        console.log("\n--- Suite 5: Terminal Status Protections ---");

        // 5a. Attempt to modify or reverse requestId1 which is already FULFILLED -> 400
        const reverseFulfilledRes = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({ status: "CREATED" }),
        });
        assert(reverseFulfilledRes.status === 400, `5a. Attempt to reverse FULFILLED request rejected with 400 (got ${reverseFulfilledRes.status})`);

        const editFulfilledRes = await fetch(`${API_BASE}/bloodrequests/${requestId1}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({ notes: "Attempting to change notes on fulfilled request" }),
        });
        assert(editFulfilledRes.status === 400, `5b. Attempt to edit terminal request rejected with 400 (got ${editFulfilledRes.status})`);

        // 5c. Cancel requestId2 and verify it cannot be reversed
        const cancelReq2Res = await fetch(`${API_BASE}/bloodrequests/${requestId2}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenReq}`,
            },
            body: JSON.stringify({ status: "CANCELLED", remarks: "Patient discharged early" }),
        });
        assert(cancelReq2Res.status === 200, "5c. Requester cancelled request 2");

        const uncancelRes = await fetch(`${API_BASE}/bloodrequests/${requestId2}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW" }),
        });
        assert(uncancelRes.status === 400, `5d. Attempt to uncancel / reverse CANCELLED request rejected with 400 (got ${uncancelRes.status})`);

        // =====================================================================
        // SUITE 6: FULFILLMENT AUTHORIZATION GUARD
        // =====================================================================
        console.log("\n--- Suite 6: Fulfillment Authorization Guard ---");

        // Create fresh request 3
        const req3Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenReq}`,
            },
            body: JSON.stringify({
                hospitalid: hospitalAData.hospitalid,
                patientname: "Kavita Nair",
                patientage: 28,
                patientgender: "FEMALE",
                patientcontact: "9876543212",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 86400000).toISOString(),
            }),
        });
        const req3Data = await req3Res.json();
        const requestId3 = req3Data.requestid;
        createdRequestIds.push(requestId3);

        // Advance requestId3 to BLOOD_ARRANGED via Hospital A
        await fetch(`${API_BASE}/bloodrequests/${requestId3}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenHospA}` },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW" }),
        });
        await fetch(`${API_BASE}/bloodrequests/${requestId3}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenHospA}` },
            body: JSON.stringify({ status: "BLOOD_BANK_CHECK" }),
        });
        await fetch(`${API_BASE}/bloodrequests/${requestId3}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenHospA}` },
            body: JSON.stringify({ status: "BLOOD_ARRANGED" }),
        });

        // 6a. Requester tries to mark FULFILLED -> 403
        const reqFulfillRes = await fetch(`${API_BASE}/bloodrequests/${requestId3}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenReq}`,
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(reqFulfillRes.status === 403, `6a. Requester cannot mark request FULFILLED (got ${reqFulfillRes.status})`);

        // 6b. Donor tries to mark FULFILLED -> 403
        const donorFulfillRes = await fetch(`${API_BASE}/bloodrequests/${requestId3}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenDonor}`,
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(donorFulfillRes.status === 403, `6b. Donor cannot mark request FULFILLED (got ${donorFulfillRes.status})`);

        // 6c. Unrelated Hospital B tries to mark FULFILLED -> 403
        const hospBFulfillRes = await fetch(`${API_BASE}/bloodrequests/${requestId3}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospB}`,
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(hospBFulfillRes.status === 403, `6c. Unrelated Hospital B cannot mark request FULFILLED (got ${hospBFulfillRes.status})`);

        // 6d. Only Authorized Hospital A can mark FULFILLED -> 200
        const hospAFulfillRes = await fetch(`${API_BASE}/bloodrequests/${requestId3}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                status: "FULFILLED",
                remarks: "Attending doctor confirmed successful transfusion",
            }),
        });
        assert(hospAFulfillRes.status === 200, `6d. Authorized Hospital A marks FULFILLED (got ${hospAFulfillRes.status})`);

        // =====================================================================
        // SUITE 7: ATOMIC HISTORY LOGGING & NO-OP UPDATES
        // =====================================================================
        console.log("\n--- Suite 7: Atomic History Logging & No-Op Updates ---");

        // Create fresh request 4
        const req4Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenReq}`,
            },
            body: JSON.stringify({
                hospitalid: hospitalAData.hospitalid,
                patientname: "Meera Sen",
                patientage: 34,
                patientgender: "FEMALE",
                patientcontact: "9876543213",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "LOW",
                requiredby: new Date(Date.now() + 86400000).toISOString(),
            }),
        });
        const req4Data = await req4Res.json();
        const requestId4 = req4Data.requestid;
        createdRequestIds.push(requestId4);

        // Update ONLY notes without changing status
        const updateNotesRes = await fetch(`${API_BASE}/bloodrequests/${requestId4}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({ notes: "Bed 104, Ward B" }),
        });
        assert(updateNotesRes.status === 200, "7a. Update notes succeeds");

        // Verify NO new history entry was created since status was unchanged
        const req4HistoryNoChange = await prisma.requeststatushistory.findMany({
            where: { requestid: requestId4 },
        });
        assert(req4HistoryNoChange.length === 1, "7b. No new history record created when status does not change (count remains 1)");

        // Verify spoofed body fields are ignored (hospitalid, createdbyuserid, etc.)
        const spoofRes = await fetch(`${API_BASE}/bloodrequests/${requestId4}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                hospitalid: hospitalBData.hospitalid, // attempt to reassign hospital
                createdbyuserid: hospBUser.userid,     // attempt to reassign creator
                notes: "Legitimate note update",
            }),
        });
        assert(spoofRes.status === 200, "7c. Request with spoofed body fields processed");
        const freshReq4 = await prisma.bloodrequests.findUnique({ where: { requestid: requestId4 } });
        assert(freshReq4?.hospitalid === hospitalAData.hospitalid, "7d. hospitalid field was NOT changed by body");
        assert(freshReq4?.createdbyuserid === reqUser.userid, "7e. createdbyuserid was NOT changed by body");

        // =====================================================================
        // SUITE 8: DONOR RESPONSE WORKFLOW & HOSPITAL NOTIFICATIONS
        // =====================================================================
        console.log("\n--- Suite 8: Donor Response Workflow & Hospital Notifications ---");

        // Create fresh request 5 assigned to Hospital A
        const req5Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenReq}`,
            },
            body: JSON.stringify({
                hospitalid: hospitalAData.hospitalid,
                patientname: "Vikram Malhotra",
                patientage: 50,
                patientgender: "MALE",
                patientcontact: "9876543214",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 86400000).toISOString(),
            }),
        });
        const req5Data = await req5Res.json();
        const requestId5 = req5Data.requestid;
        createdRequestIds.push(requestId5);

        // Voluntary Donor responds to request 5
        const donorRespRes = await fetch(`${API_BASE}/bloodrequests/${requestId5}/respond`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenDonor}`,
            },
            body: JSON.stringify({
                contactPhone: "9876543205",
                estimatedArrival: "Within 1 hour",
                screeningAnswers: {
                    drinksAlcohol: false,
                    alcoholInPast24Hours: false,
                    feelingHealthy: true,
                    recentAntibioticsOrMedication: false,
                    recentTattooOrSurgery: false,
                    donatedInLast90Days: false,
                    chronicIllness: false,
                    isPregnantOrBreastfeeding: false,
                },
            }),
        });

        assert(donorRespRes.status === 200, `8a. Donor volunteered successfully (Status: ${donorRespRes.status})`);
        const donorRespJson = await donorRespRes.json();

        // Verify status automatically advanced to DONOR_MATCHING (NOT FULFILLED!)
        assert(donorRespJson.status === "DONOR_MATCHING", "8b. Request transitioned to DONOR_MATCHING");
        const freshReq5 = await prisma.bloodrequests.findUnique({ where: { requestid: requestId5 } });
        assert(freshReq5?.status === "DONOR_MATCHING", "8c. DB status is DONOR_MATCHING, NOT FULFILLED");

        // Verify notification for Donor
        const donorNotifs = await prisma.notification.findMany({
            where: { userid: donorUser.userid, requestid: requestId5 },
        });
        assert(donorNotifs.length === 1, "8d. Donor received confirmation notification");

        // Verify notification for Requester
        const reqNotifs = await prisma.notification.findMany({
            where: { userid: reqUser.userid, requestid: requestId5, title: "Donor Volunteered for Blood Request" },
        });
        assert(reqNotifs.length === 1, "8e. Requester received volunteer notification");

        // Verify notification for Assigned Hospital A
        const hospARespNotifs = await prisma.notification.findMany({
            where: { userid: hospAUser.userid, requestid: requestId5, title: "Volunteer Donor Matched" },
        });
        assert(hospARespNotifs.length === 1, "8f. Hospital A received 'Volunteer Donor Matched' notification");
        assert(hospARespNotifs[0].message.includes("Vikram Malhotra"), "8g. Hospital notification references patient");

        // Verify Hospital B received NO volunteer notification
        const hospBRespNotifs = await prisma.notification.findMany({
            where: { userid: hospBUser.userid, requestid: requestId5, title: "Volunteer Donor Matched" },
        });
        assert(hospBRespNotifs.length === 0, "8h. Hospital B received zero notifications");

        // Verify history logged for the donor response
        const req5History = await prisma.requeststatushistory.findMany({
            where: { requestid: requestId5 },
            orderBy: { changedat: "desc" },
        });
        assert(req5History.length === 2, "8i. History logged for DONOR_MATCHING transition (total 2 entries)");
        assert(req5History[0].oldstatus === "CREATED" && req5History[0].newstatus === "DONOR_MATCHING", "8j. Correct old/new status in history");

        // Test transit status updates
        // Donor starts journey
        const startTransitRes = await fetch(`${API_BASE}/bloodrequests/${requestId5}/transit-status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenDonor}`,
            },
            body: JSON.stringify({ status: "STARTED" }),
        });
        assert(startTransitRes.status === 200, "8k. Donor updated transit to STARTED");

        // Donor reaches location
        const reachTransitRes = await fetch(`${API_BASE}/bloodrequests/${requestId5}/transit-status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenDonor}`,
            },
            body: JSON.stringify({ status: "REACHED_LOCATION" }),
        });
        assert(reachTransitRes.status === 200, "8l. Donor updated transit to REACHED_LOCATION");

        // Complete donation via transit-status
        const completeTransitRes = await fetch(`${API_BASE}/bloodrequests/${requestId5}/transit-status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenDonor}`,
            },
            body: JSON.stringify({ status: "COMPLETED" }),
        });
        assert(completeTransitRes.status === 200, "8m. Donor updated transit to COMPLETED");

        // Verify request is now BLOOD_ARRANGED (NOT FULFILLED!)
        const req5AfterDonation = await prisma.bloodrequests.findUnique({ where: { requestid: requestId5 } });
        assert(req5AfterDonation?.status === "BLOOD_ARRANGED", "8n. Status progressed to BLOOD_ARRANGED on donation completion (not FULFILLED)");

        // Now Hospital A confirms physical transfusion -> FULFILLED
        const hosp5FulfillRes = await fetch(`${API_BASE}/bloodrequests/${requestId5}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospA}`,
            },
            body: JSON.stringify({
                status: "FULFILLED",
                remarks: "Blood transfused to patient Vikram Malhotra; stable vitals",
            }),
        });
        assert(hosp5FulfillRes.status === 200, "8o. Hospital A confirms physical transfusion -> FULFILLED");
        const req5Final = await prisma.bloodrequests.findUnique({ where: { requestid: requestId5 } });
        assert(req5Final?.status === "FULFILLED", "8p. Request is finally FULFILLED after hospital physical confirmation");

        // =====================================================================
        // SUITE 9: HOSPITAL BLOOD REQUEST QUERIES & DATA PRIVACY
        // =====================================================================
        console.log("\n--- Suite 9: Hospital Blood Request Queries & Data Privacy ---");

        // 9a. Hospital A queries its own blood requests
        const hospAReqsRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${tokenHospA}`,
            },
        });
        assert(hospAReqsRes.status === 200, `9a. GET /hospitals/me/bloodrequests returns 200 (got ${hospAReqsRes.status})`);
        const hospAReqs = await hospAReqsRes.json();
        assert(Array.isArray(hospAReqs) && hospAReqs.length >= 4, "9b. Hospital A sees its assigned requests");

        // 9c. Verify privacy: No password hashes leaked in requester user object
        const firstReq = hospAReqs[0];
        assert(firstReq.users && firstReq.users.email, "9c. Requester contact present");
        assert(firstReq.users.password === undefined, "9d. Security: Password hash is NOT exposed in blood request response");
        assert(Array.isArray(firstReq.requeststatushistory), "9e. Full status history audit trail included");

        // 9f. Hospital B queries its requests -> should be 0
        const hospBReqsRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${tokenHospB}`,
            },
        });
        assert(hospBReqsRes.status === 200, "9f. Hospital B GET /me/bloodrequests returns 200");
        const hospBReqs = await hospBReqsRes.json();
        assert(Array.isArray(hospBReqs) && hospBReqs.length === 0, "9g. Hospital B sees 0 requests (Hospital A's requests are isolated)");

        console.log("\n===============================================================================");
        console.log(`  ALL ${totalTests} INTEGRATION TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
        console.log("===============================================================================\n");

    } finally {
        console.log("--- Teardown: Safely cleaning up disposable test records ---");
        try {
            // Delete notifications for created requests
            if (createdRequestIds.length > 0) {
                await prisma.notification.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
                await prisma.requeststatushistory.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
                await prisma.bloodrequests.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
            }

            // Delete donor record
            if (donorData) {
                await prisma.donors.deleteMany({ where: { donorid: donorData.donorid } });
            }

            // Delete requester record
            if (requesterData) {
                await prisma.requesters.deleteMany({ where: { requesterid: requesterData.requesterid } });
            }

            // Delete hospitals
            if (hospitalAData) {
                await prisma.hospitals.deleteMany({ where: { hospitalid: hospitalAData.hospitalid } });
            }
            if (hospitalBData) {
                await prisma.hospitals.deleteMany({ where: { hospitalid: hospitalBData.hospitalid } });
            }

            // Delete users
            const userIdsToDelete = [
                hospAUser?.userid,
                hospBUser?.userid,
                unlinkedHospUser?.userid,
                reqUser?.userid,
                donorUser?.userid,
                adminUser?.userid,
            ].filter(Boolean);

            if (userIdsToDelete.length > 0) {
                await prisma.notification.deleteMany({
                    where: { userid: { in: userIdsToDelete } },
                });
                await prisma.users.deleteMany({
                    where: { userid: { in: userIdsToDelete } },
                });
            }

            console.log("Teardown completed cleanly.");
        } catch (cleanupErr) {
            console.error("Warning during test teardown:", cleanupErr);
        }

        if (server) {
            server.close();
        }
    }
}

runPhase52CoordinationTests()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Test execution failed:", err);
        process.exit(1);
    });
