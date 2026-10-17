import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import app from "../src/app";
import http from "http";

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

async function runPhase56Tests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 5.6: HOSPITAL-CREATED BLOOD REQUESTS INTEGRATION TEST SUITE     ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();
    const hospAEmail = `hosp_56_a_${timestamp}@swastya.org`;
    const hospBEmail = `hosp_56_b_${timestamp}@swastya.org`;
    const legacyHospEmail = `hosp_56_legacy_${timestamp}@swastya.org`;
    const donorEmail = `donor_56_${timestamp}@swastya.org`;
    const requesterEmail = `requester_56_${timestamp}@swastya.org`;

    let hospAUser: any = null;
    let hospBUser: any = null;
    let legacyHospUser: any = null;
    let donorUser: any = null;
    let requesterUser: any = null;

    let hospAToken = "";
    let hospBToken = "";
    let legacyHospToken = "";
    let donorToken = "";
    let requesterToken = "";

    let hospitalARecord: any = null;
    let hospitalBRecord: any = null;
    let createdRequestId = "";

    try {
        // Start ephemeral HTTP server
        await new Promise<void>((resolve) => {
            server = http.createServer(app);
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address() as any;
                API_BASE = `http://127.0.0.1:${addr.port}`;
                console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);
                resolve();
            });
        });

        // ---------------------------------------------------------------------------
        // 1. SETUP: REGISTER ENTITIES
        // ---------------------------------------------------------------------------
        console.log("--- 1. Provisioning Test Entities ---");

        // 1a. Register Hospital A
        const regHospARes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Fortis Care Hospital",
                email: hospAEmail,
                password: "HospitalPassword123!",
                role: "HOSPITAL",
                hospitalname: "Fortis Care Hospital",
                registrationnumber: `REG-HOSP-56-A-${timestamp}`,
                contactpersonname: "Dr. Anirudh Kulkarni",
                contactpersonphone: "9112233441",
                address: "44 Health Boulevard",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560044",
            }),
        });
        const hospAData: any = await regHospARes.json();
        assert(regHospARes.status === 201, "1a. Hospital A registration returned HTTP 201");
        hospAToken = hospAData.token;
        hospAUser = hospAData.user;
        hospitalARecord = hospAData.hospital;
        assert(Boolean(hospAToken && hospitalARecord), "1b. Hospital A token and profile record resolved");

        // 1b. Register Hospital B (Unrelated Facility)
        const regHospBRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Apollo Prime Hospital",
                email: hospBEmail,
                password: "HospitalPassword123!",
                role: "HOSPITAL",
                hospitalname: "Apollo Prime Hospital",
                registrationnumber: `REG-HOSP-56-B-${timestamp}`,
                contactpersonname: "Dr. Priya Nair",
                contactpersonphone: "9112233442",
                address: "88 Medical Avenue",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560088",
            }),
        });
        const hospBData: any = await regHospBRes.json();
        assert(regHospBRes.status === 201, "1c. Hospital B registration returned HTTP 201");
        hospBToken = hospBData.token;
        hospBUser = hospBData.user;
        hospitalBRecord = hospBData.hospital;

        // 1c. Register Donor (O+ blood group)
        const regDonorRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Siddharth Joshi",
                email: donorEmail,
                password: "DonorPassword123!",
                role: "DONOR",
                bloodgroup: "O+",
                dateofbirth: "1995-04-12",
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560044",
                phone: "9112233443",
                availabilitystatus: "AVAILABLE",
            }),
        });
        const donorData: any = await regDonorRes.json();
        assert(regDonorRes.status === 201, "1d. Donor registration returned HTTP 201");
        donorToken = donorData.token;
        donorUser = donorData.user;

        // 1d. Register Requester
        const regReqRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Amit Patel",
                email: requesterEmail,
                password: "RequesterPassword123!",
                role: "REQUESTER",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560044",
                phone: "9112233444",
            }),
        });
        const reqData: any = await regReqRes.json();
        assert(regReqRes.status === 201, "1e. Requester registration returned HTTP 201");
        requesterToken = reqData.token;
        requesterUser = reqData.user;

        // 1e. Provision Legacy Hospital Account without hospital profile record
        legacyHospUser = await prisma.users.create({
            data: {
                name: "Unlinked Hospital Staff",
                email: legacyHospEmail,
                password: "HashedPassword123!",
                role: "HOSPITAL",
                isactive: true,
                emailverified: true,
            },
        });
        legacyHospToken = generateToken(legacyHospUser.userid, "HOSPITAL");
        assert(Boolean(legacyHospToken), "1f. Legacy unlinked hospital account provisioned");

        // ---------------------------------------------------------------------------
        // 2. SECURITY & AUTHORIZATION TESTS
        // ---------------------------------------------------------------------------
        console.log("\n--- 2. Security & Authorization Checks on POST /hospitals/me/bloodrequests ---");

        const validPayload = {
            patientname: "Meera Krishnan",
            patientage: 34,
            patientgender: "FEMALE",
            patientcontact: "9876543210",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 2,
            urgencylevel: "HIGH",
            requiredby: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
            searchradius: 15,
            notes: "Ward 4 Bed 12 | Attending: Dr. Kulkarni | Pre-op CABG reserve",
        };

        // 2a. Unauthenticated request rejected (401)
        const unauthRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(validPayload),
        });
        assert(unauthRes.status === 401, "2a. Unauthenticated request rejected with HTTP 401");

        // 2b. Donor role rejected (403)
        const donorRoleRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify(validPayload),
        });
        assert(donorRoleRes.status === 403, "2b. Donor role rejected with HTTP 403");

        // 2c. Requester role rejected (403)
        const requesterRoleRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterToken}`,
            },
            body: JSON.stringify(validPayload),
        });
        assert(requesterRoleRes.status === 403, "2c. Requester role rejected with HTTP 403");

        // 2d. Unlinked Hospital Account rejected (403)
        const unlinkedHospRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${legacyHospToken}`,
            },
            body: JSON.stringify(validPayload),
        });
        assert(unlinkedHospRes.status === 403, "2d. Hospital user without linked profile rejected with HTTP 403");
        const unlinkedJson: any = await unlinkedHospRes.json();
        assert(unlinkedJson.message.includes("Hospital profile not found"), "2e. Helpful message returned for unlinked profile");

        // ---------------------------------------------------------------------------
        // 3. PAYLOAD VALIDATION TESTS
        // ---------------------------------------------------------------------------
        console.log("\n--- 3. Payload Validation Checks on POST /hospitals/me/bloodrequests ---");

        // 3a. Missing patient name
        const noNameRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ ...validPayload, patientname: "" }),
        });
        assert(noNameRes.status === 400, "3a. Missing patient name rejected (HTTP 400)");

        // 3b. Invalid patient age (<= 0)
        const badAgeRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ ...validPayload, patientage: 0 }),
        });
        assert(badAgeRes.status === 400, "3b. Non-positive patient age rejected (HTTP 400)");

        // 3c. Invalid patient gender
        const badGenderRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ ...validPayload, patientgender: "INVALID_GENDER" }),
        });
        assert(badGenderRes.status === 400, "3c. Invalid patient gender rejected (HTTP 400)");

        // 3d. Missing contact
        const badContactRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ ...validPayload, patientcontact: "" }),
        });
        assert(badContactRes.status === 400, "3d. Missing contact number rejected (HTTP 400)");

        // 3e. Invalid blood group
        const badBgRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ ...validPayload, bloodgroup: "XYZ_NEGATIVE" }),
        });
        assert(badBgRes.status === 400, "3e. Invalid blood group rejected (HTTP 400)");

        // 3f. Invalid units (0 or negative)
        const badUnitsRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ ...validPayload, unitsrequired: 0 }),
        });
        assert(badUnitsRes.status === 400, "3f. Non-positive units required rejected (HTTP 400)");

        // 3g. Past required-by date
        const pastDateRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ ...validPayload, requiredby: new Date(Date.now() - 3600000).toISOString() }),
        });
        assert(pastDateRes.status === 400, "3g. Past required-by date rejected (HTTP 400)");

        // ---------------------------------------------------------------------------
        // 4. HOSPITAL REQUEST CREATION & ATOMIC INTEGRITY
        // ---------------------------------------------------------------------------
        console.log("\n--- 4. Hospital Blood Request Creation & Atomic Integrity ---");

        // Attempting to inject spoofed hospitalid, createdbyuserid, or requesterid
        const spoofAttemptPayload = {
            ...validPayload,
            hospitalid: hospitalBRecord.hospitalid, // Tamper attempt!
            createdbyuserid: requesterUser.userid,  // Tamper attempt!
            requesterid: "11111111-1111-1111-1111-111111111111", // Tamper attempt!
            status: "FULFILLED",                   // Tamper attempt!
        };

        const createRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify(spoofAttemptPayload),
        });
        const createdData: any = await createRes.json();
        assert(createRes.status === 201, `4a. Hospital request creation succeeded with HTTP 201 (got ${createRes.status})`);
        assert(Boolean(createdData.requestid), "4b. Request has valid requestid");
        createdRequestId = createdData.requestid;

        // Data-model integrity validations:
        assert(createdData.createdbyuserid === hospAUser.userid, "4c. Ownership: createdbyuserid bound to authenticated Hospital A user");
        assert(createdData.hospitalid === hospitalARecord.hospitalid, "4d. Hospital association: hospitalid bound to Hospital A (spoofed ID ignored)");
        assert(createdData.requesterid === null, "4e. Domain integrity: requesterid is strictly null (no fake requester created)");
        assert(createdData.status === "CREATED", "4f. Initial status is CREATED (tampered status ignored)");
        assert(createdData.patientname === "Meera Krishnan", "4g. Patient name matches input");
        assert(createdData.unitsrequired === 2, "4h. Units required matches input");

        // Verify status history created atomically:
        const statusHistories = await prisma.requeststatushistory.findMany({
            where: { requestid: createdRequestId },
            orderBy: { changedat: "asc" },
        });
        assert(statusHistories.length === 1, "4i. Exactly 1 status history record created atomically");
        assert(statusHistories[0].oldstatus === null, "4j. Initial history oldstatus is null");
        assert(statusHistories[0].newstatus === "CREATED", "4k. Initial history newstatus is CREATED");
        assert(statusHistories[0].changedbyuserid === hospAUser.userid, "4l. History changedby matches Hospital A user");
        assert(statusHistories[0].remarks?.includes("Fortis Care Hospital") ?? false, "4m. History remarks cite creating hospital");

        // Verify in-app notification created for hospital:
        const hospitalNotif = await prisma.notification.findFirst({
            where: {
                userid: hospAUser.userid,
                requestid: createdRequestId,
            },
        });
        assert(Boolean(hospitalNotif), "4n. Notification created for creating hospital account");
        assert(hospitalNotif?.title === "Hospital Blood Requisition Created", "4o. Correct notification title");

        // ---------------------------------------------------------------------------
        // 5. QUERY VISIBILITY & DASHBOARD METRICS INTEGRATION
        // ---------------------------------------------------------------------------
        console.log("\n--- 5. Query Visibility & Dashboard Metrics Integration ---");

        // 5a. Check GET /hospitals/me/bloodrequests
        const getMyRequestsRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const myRequests: any = await getMyRequestsRes.json();
        assert(getMyRequestsRes.status === 200, "5a. GET /hospitals/me/bloodrequests returned HTTP 200");
        const foundInMyList = myRequests.some((r: any) => r.requestid === createdRequestId);
        assert(foundInMyList, "5b. Created request appears in authenticated hospital's blood request list");

        // 5b. Check GET /hospitals/me/dashboard
        const getDashboardRes = await fetch(`${API_BASE}/hospitals/me/dashboard`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const dashboardData: any = await getDashboardRes.json();
        assert(getDashboardRes.status === 200, "5c. GET /hospitals/me/dashboard returned HTTP 200");
        assert(dashboardData.totalRequests >= 1, `5d. Dashboard totalRequests includes new request (${dashboardData.totalRequests})`);
        const foundInRecent = dashboardData.recentRequests.some((r: any) => r.requestid === createdRequestId);
        assert(foundInRecent, "5e. Created request appears in dashboard recentRequests array");

        // 5c. Multi-tenant privacy: Hospital B should NOT see Hospital A's request
        const hospBRequestsRes = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        const hospBRequests: any = await hospBRequestsRes.json();
        const foundInBList = hospBRequests.some((r: any) => r.requestid === createdRequestId);
        assert(!foundInBList, "5f. Isolation: Hospital B request list does NOT include Hospital A's request");

        // ---------------------------------------------------------------------------
        // 6. DONOR MATCHING & VOLUNTARY RESPONSE WORKFLOW
        // ---------------------------------------------------------------------------
        console.log("\n--- 6. Donor Matching & Voluntary Response Workflow ---");

        // 6a. Donor discovers hospital-created request in matching feed
        const donorFeedRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        const donorFeed: any = await donorFeedRes.json();
        assert(donorFeedRes.status === 200, "6a. Donor matching feed returned HTTP 200");
        const matchingItem = donorFeed.requests.find((r: any) => r.requestid === createdRequestId);
        assert(Boolean(matchingItem), "6b. O+ donor successfully discovers O+ hospital requisition in matching feed");
        assert(matchingItem.hospitals?.hospitalname === "Fortis Care Hospital", "6c. Hospital details presented to donor");
        assert(matchingItem.patientcontact === null, "6d. Patient contact phone protected for donor privacy");

        // 6b. Donor volunteers to donate
        const volunteerRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/respond`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({
                estimatedArrival: "Within 1 hour",
                contactPhone: "9112233443",
                notes: "On my way to Fortis Care transfusion desk",
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
        const volunteerData: any = await volunteerRes.json();
        assert(volunteerRes.status === 200, "6e. Donor volunteered successfully for hospital-created request (HTTP 200)");
        assert(volunteerData.status === "DONOR_MATCHING", "6f. Request status automatically transitioned to DONOR_MATCHING");

        // 6c. Hospital A receives notification about volunteer match
        const hospMatchNotif = await prisma.notification.findFirst({
            where: {
                userid: hospAUser.userid,
                requestid: createdRequestId,
                type: "MATCH",
            },
        });
        assert(Boolean(hospMatchNotif), "6g. Hospital A received notification about volunteer match");

        // ---------------------------------------------------------------------------
        // 7. CLINICAL COORDINATION & MULTI-TENANT ISOLATION
        // ---------------------------------------------------------------------------
        console.log("\n--- 7. Clinical Coordination & Multi-Tenant Isolation ---");

        // 7a. Hospital A fetches request details with volunteer list
        const hospGetDetailRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const hospDetail: any = await hospGetDetailRes.json();
        assert(hospGetDetailRes.status === 200, "7a. Hospital A fetched blood request details (HTTP 200)");
        assert(hospDetail.volunteers?.length === 1, "7b. Exactly 1 volunteer recorded");
        assert(hospDetail.volunteers[0].donorName === "Siddharth Joshi", "7c. Volunteer donor name confirmed");

        // 7b. Hospital B attempts to view Hospital A's requisition details -> 403 Forbidden
        const hospBCrossRead = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        assert(hospBCrossRead.status === 403, "7d. Multi-tenant privacy: Hospital B rejected with HTTP 403 on GET /bloodrequests/:id");

        // 7c. Hospital B attempts to update Hospital A's requisition -> 403 Forbidden
        const hospBCrossEdit = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospBToken}` },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(hospBCrossEdit.status === 403, "7e. Multi-tenant privacy: Hospital B rejected with HTTP 403 on PUT /bloodrequests/:id");

        // 7d. Hospital A progresses request: DONOR_MATCHING -> BLOOD_ARRANGED -> FULFILLED
        const arrangeRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ status: "BLOOD_ARRANGED", remarks: "Units cross-matched and stored in blood bank" }),
        });
        assert(arrangeRes.status === 200, "7f. Hospital A updated status to BLOOD_ARRANGED (HTTP 200)");

        const fulfillRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ status: "FULFILLED", remarks: "Transfusion completed in OT-2" }),
        });
        assert(fulfillRes.status === 200, "7g. Hospital A fulfilled blood request (HTTP 200)");
        const fulfillData: any = await fulfillRes.json();
        assert(fulfillData.status === "FULFILLED", "7h. Confirmed final status is FULFILLED");

        // 7e. Terminal status lock: Cannot edit a fulfilled request
        const postFulfillEdit = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${hospAToken}` },
            body: JSON.stringify({ status: "CANCELLED" }),
        });
        assert(postFulfillEdit.status === 400, "7i. Terminal lock: Cannot modify already fulfilled request (HTTP 400)");

        // ---------------------------------------------------------------------------
        // 8. ALSO TEST POST /bloodrequests WITH HOSPITAL ROLE
        // ---------------------------------------------------------------------------
        console.log("\n--- 8. Backward Compatibility: POST /bloodrequests with HOSPITAL Role ---");

        const compRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                patientname: "Kavita Rao",
                patientage: 50,
                patientgender: "FEMALE",
                patientcontact: "9876543211",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "PLATELETS",
                unitsrequired: 1,
                urgencylevel: "MEDIUM",
                requiredby: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            }),
        });
        assert(compRes.status === 201, "8a. POST /bloodrequests with HOSPITAL role succeeded with HTTP 201");
        const compData: any = await compRes.json();
        assert(compData.hospitalid === hospitalARecord.hospitalid, "8b. Hospital ID bound correctly via /bloodrequests");
        assert(compData.requesterid === null, "8c. Requester ID is strictly null via /bloodrequests");

        console.log("\n===============================================================================");
        console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY! PHASE 5.6 VERIFIED.`);
        console.log("===============================================================================\n");
    } finally {
        // Clean up test records
        console.log("--- Safely cleaning up disposable test records ---");
        try {
            if (hospAUser?.userid) {
                const reqsA = await prisma.bloodrequests.findMany({ where: { createdbyuserid: hospAUser.userid } });
                const reqIdsA = reqsA.map(r => r.requestid);
                await prisma.notification.deleteMany({ where: { requestid: { in: reqIdsA } } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: reqIdsA } } });
                await prisma.bloodrequests.deleteMany({ where: { requestid: { in: reqIdsA } } });
            }
            if (createdRequestId) {
                await prisma.notification.deleteMany({ where: { requestid: createdRequestId } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: createdRequestId } });
                await prisma.bloodrequests.deleteMany({ where: { requestid: createdRequestId } });
            }
            if (hospAUser?.userid) {
                await prisma.notification.deleteMany({ where: { userid: hospAUser.userid } });
                await prisma.hospitals.deleteMany({ where: { userid: hospAUser.userid } });
                await prisma.users.deleteMany({ where: { userid: hospAUser.userid } });
            }
            if (hospBUser?.userid) {
                await prisma.notification.deleteMany({ where: { userid: hospBUser.userid } });
                await prisma.hospitals.deleteMany({ where: { userid: hospBUser.userid } });
                await prisma.users.deleteMany({ where: { userid: hospBUser.userid } });
            }
            if (donorUser?.userid) {
                await prisma.notification.deleteMany({ where: { userid: donorUser.userid } });
                await prisma.donors.deleteMany({ where: { userid: donorUser.userid } });
                await prisma.users.deleteMany({ where: { userid: donorUser.userid } });
            }
            if (requesterUser?.userid) {
                await prisma.notification.deleteMany({ where: { userid: requesterUser.userid } });
                await prisma.requesters.deleteMany({ where: { userid: requesterUser.userid } });
                await prisma.users.deleteMany({ where: { userid: requesterUser.userid } });
            }
            if (legacyHospUser?.userid) {
                await prisma.users.deleteMany({ where: { userid: legacyHospUser.userid } });
            }
            console.log("Cleanup completed cleanly.\n");
        } catch (cleanupErr) {
            console.error("Warning: Cleanup encountered an error:", cleanupErr);
        }

        if (server) {
            server.close();
        }
    }
}

runPhase56Tests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
