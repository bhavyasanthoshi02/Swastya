import { prisma } from "./src/config/prisma";
import { generateToken } from "./src/utils/jwt";

const API_BASE = "http://localhost:5000";

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

async function runPhase4IntegrationTests() {
    console.log("===============================================================================");
    console.log("   SWASTYA PHASE 4.0: CONNECT REQUESTER & DONOR PORTALS INTEGRATION SUITE      ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();
    const emailReqA = `phase4_req_a_${timestamp}@example.com`;
    const emailReqB = `phase4_req_b_${timestamp}@example.com`;
    const emailDonor = `phase4_donor_${timestamp}@example.com`;

    let userReqA: any = null;
    let userReqB: any = null;
    let userDonor: any = null;
    let donorRecord: any = null;
    let tokenReqA = "";
    let tokenReqB = "";
    let tokenDonor = "";
    let createdRequest: any = null;

    try {
        // --- 0. Setup: Disposable accounts for Requester A, Requester B, and Test Donor ---
        userReqA = await prisma.users.create({
            data: {
                name: "Requester Alpha User",
                email: emailReqA,
                phonenumber: "9000000001",
                password: "hashedpassword123",
                role: "REQUESTER",
                isactive: true,
                emailverified: true,
                requesters: {
                    create: {
                        address: "123 Healthcare Ave",
                        city: "Bengaluru",
                        state: "Karnataka",
                        pincode: "560001",
                    },
                },
            },
            include: { requesters: true },
        });
        tokenReqA = generateToken(userReqA.userid, "REQUESTER");

        userReqB = await prisma.users.create({
            data: {
                name: "Requester Beta User",
                email: emailReqB,
                phonenumber: "9000000002",
                password: "hashedpassword123",
                role: "REQUESTER",
                isactive: true,
                emailverified: true,
                requesters: {
                    create: {
                        address: "456 City Road",
                        city: "Bengaluru",
                        state: "Karnataka",
                        pincode: "560002",
                    },
                },
            },
            include: { requesters: true },
        });
        tokenReqB = generateToken(userReqB.userid, "REQUESTER");

        // Eligible donor: O_POSITIVE, AVAILABLE, iseligible: true, last donation > 90 days ago
        userDonor = await prisma.users.create({
            data: {
                name: "Voluntary Hero Donor",
                email: emailDonor,
                phonenumber: "9000000003",
                password: "hashedpassword123",
                role: "DONOR",
                isactive: true,
                emailverified: true,
                donors: {
                    create: {
                        bloodgroup: "O_POSITIVE",
                        gender: "MALE",
                        dateofbirth: new Date("1995-05-15"),
                        weight: 70.0,
                        availabilitystatus: "AVAILABLE",
                        iseligible: true,
                        city: "Bengaluru",
                        state: "Karnataka",
                        pincode: "560001",
                        address: "789 Donor Lane",
                        lastdonationdate: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 120 days ago (> 90)
                    },
                },
            },
            include: { donors: true },
        });
        tokenDonor = generateToken(userDonor.userid, "DONOR");
        donorRecord = userDonor.donors;

        assert(Boolean(userReqA && userReqB && userDonor && donorRecord), "0. Setup: Disposable Requester A, Requester B, and eligible Donor accounts created");

        // --- STEP 1: Requester A creates a blood request ---
        const futureTime = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
        const createRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenReqA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                patientname: "Phase4 Test Patient",
                patientage: 38,
                patientgender: "FEMALE",
                patientcontact: "9000000001",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                isemergency: false,
                searchradius: 10,
                requiredby: futureTime,
                notes: "Voluntary whole blood needed for scheduled surgical procedure",
            }),
        });

        assert(createRes.status === 201, "1. Requester creates blood request: HTTP 201 returned");
        createdRequest = await createRes.json();
        assert(Boolean(createdRequest?.requestid), "1b. Request payload contains valid canonical requestid UUID");

        // --- STEP 2: Verifies the request exists in PostgreSQL ---
        const dbRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: createdRequest.requestid },
            include: { requeststatushistory: true },
        });
        assert(Boolean(dbRequest), "2. PostgreSQL Persistence: Blood request verified in PostgreSQL database");
        assert(dbRequest?.status === "CREATED", "2b. PostgreSQL Status: Initial request status is CREATED");
        assert(dbRequest?.bloodgroup === "O_POSITIVE", "2c. PostgreSQL Clinical: Blood group O_POSITIVE persisted correctly");
        assert(dbRequest?.createdbyuserid === userReqA.userid, "2d. PostgreSQL Ownership: Request createdbyuserid matches Requester A");

        // --- STEP 3: Signs in as an eligible test donor ---
        const donorProfileRes = await fetch(`${API_BASE}/donors/me`, {
            headers: { Authorization: `Bearer ${tokenDonor}` },
        });
        assert(donorProfileRes.status === 200, "3. Eligible Donor Auth: GET /donors/me returns HTTP 200");
        const donorProfile = await donorProfileRes.json();
        assert(donorProfile.donor?.availabilitystatus === "AVAILABLE", "3b. Donor Availability: Donor is marked AVAILABLE");
        assert(donorProfile.eligibility?.isEligible === true, "3c. Donor Eligibility: Clinical eligibility verified (cooldown elapsed)");

        // --- STEP 4: Verifies the donor can see the request when matching rules permit ---
        const matchingRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonor}` },
        });
        assert(matchingRes.status === 200, "4. Matching Feed: GET /donors/me/matching-requests returns HTTP 200");
        const matchingData = await matchingRes.json();
        const foundMatch = (matchingData.requests || []).find((r: any) => r.requestid === createdRequest.requestid);
        assert(Boolean(foundMatch), "4b. Matching Discovery: Eligible donor feed includes Requester A's request");
        assert(foundMatch?.patientcontact === null, "4c. Privacy Protection: Patient contact phone is scrubbed/null on donor matching feed");
        assert(foundMatch?.hasResponded === false, "4d. Initial State: Request correctly reports hasResponded = false");

        // --- STEP 5: Submits a donor response ---
        const respondRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonor}`,
                "Content-Type": "application/json",
            },
        });
        assert(respondRes.status === 200, "5. Donor Response: POST /bloodrequests/:id/respond returns HTTP 200");
        const respondData = await respondRes.json();
        assert(respondData.success === true, "5b. Response Confirmation: Success flag true in response body");
        assert(respondData.status === "DONOR_MATCHING", "5c. Safe Transition: Request progressed to DONOR_MATCHING (not falsely FULFILLED)");

        // --- STEP 6: Verifies the response persists exactly once & duplicate is rejected ---
        const dupRespondRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonor}`,
                "Content-Type": "application/json",
            },
        });
        assert(dupRespondRes.status === 400, "6. Deduplication: Duplicate volunteer response rejected with HTTP 400");
        const dupData = await dupRespondRes.json();
        assert(dupData.message.includes("already volunteered"), "6b. Duplicate Error Message: Explicitly indicates already volunteered");

        // Verify donor matching feed now annotates hasResponded = true
        const matchingResAfter = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonor}` },
        });
        const matchingDataAfter = await matchingResAfter.json();
        const matchedItemAfter = (matchingDataAfter.requests || []).find((r: any) => r.requestid === createdRequest.requestid);
        assert(matchedItemAfter?.hasResponded === true, "6c. Donor Persistence: Matching feed reflects hasResponded = true across reloads");

        // --- STEP 7: Requester A can see genuine response through authorized endpoint ---
        const reqADetailsRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            headers: { Authorization: `Bearer ${tokenReqA}` },
        });
        assert(reqADetailsRes.status === 200, "7. Requester Visibility: GET /bloodrequests/:id returns HTTP 200 for Requester A");
        const reqADetails = await reqADetailsRes.json();
        assert(reqADetails.status === "DONOR_MATCHING", "7b. Real Status: Requester sees real DONOR_MATCHING status");
        assert(Array.isArray(reqADetails.volunteers), "7c. Volunteers Array: Volunteers list is provided to authorized requester");
        assert(reqADetails.volunteers.length === 1, "7d. Exact Persistence: Exactly 1 volunteer record persisted");
        assert(reqADetails.volunteers[0].donorName === "Voluntary Hero Donor", "7e. Volunteer Identity: Donor name correctly associated");
        assert(reqADetails.volunteers[0].donorBloodGroup === "O_POSITIVE", "7f. Volunteer Clinical: Blood group O_POSITIVE verified");

        // --- STEP 8: Verifies a different requester cannot see private response/request data ---
        const reqBDetailsRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            headers: { Authorization: `Bearer ${tokenReqB}` },
        });
        assert(reqBDetailsRes.status === 403, "8. Authorization Boundary: Requester B gets HTTP 403 Forbidden for Requester A's request");

        // --- STEP 9: Verifies unauthorized status changes are rejected ---
        // Requester attempting to set to FULFILLED directly (only cancellations or clinical admin/hospital can advance)
        const invalidStatusRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenReqA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                status: "FULFILLED",
            }),
        });
        assert(invalidStatusRes.status === 403, "9. Clinical Governance: Requester prohibited from self-advancing status to FULFILLED (HTTP 403)");

        // Unauthorized user (Requester B) attempting to modify Requester A's request
        const unauthorizedModRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenReqB}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                notes: "Malicious modification attempt",
            }),
        });
        assert(unauthorizedModRes.status === 403, "9b. Security Enforcement: Unauthorized user cannot modify request (HTTP 403)");

        // --- STEP 10: Verifies notification persistence for both Requester and Donor ---
        const reqANotifs = await prisma.notification.findMany({
            where: {
                userid: userReqA.userid,
                requestid: createdRequest.requestid,
            },
        });
        assert(reqANotifs.length >= 1, "10. Requester Notification: In-app notification persisted for Requester A");
        assert(reqANotifs[0].type === "MATCH", "10b. Requester Notification Type: Type is MATCH");
        assert(reqANotifs[0].title === "Donor Volunteered for Blood Request", "10c. Requester Notification Title verified");

        const donorNotifs = await prisma.notification.findMany({
            where: {
                userid: userDonor.userid,
                requestid: createdRequest.requestid,
            },
        });
        assert(donorNotifs.length >= 1, "10d. Donor Confirmation: In-app confirmation notification persisted for Donor");
        assert(donorNotifs[0].type === "MATCH", "10e. Donor Notification Type: Type is MATCH");
        assert(donorNotifs[0].title === "Volunteer Response Confirmed", "10f. Donor Notification Title: Volunteer Response Confirmed");

    } finally {
        // Cleanup test-created records cleanly without resetting or destroying database
        console.log("\n--- Cleaning up test records ---");
        try {
            if (createdRequest?.requestid) {
                await prisma.notification.deleteMany({ where: { requestid: createdRequest.requestid } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: createdRequest.requestid } });
                await prisma.bloodrequests.deleteMany({ where: { requestid: createdRequest.requestid } });
            }
            if (userDonor?.userid) {
                await prisma.donors.deleteMany({ where: { userid: userDonor.userid } });
                await prisma.users.deleteMany({ where: { userid: userDonor.userid } });
            }
            if (userReqA?.userid) {
                await prisma.requesters.deleteMany({ where: { userid: userReqA.userid } });
                await prisma.users.deleteMany({ where: { userid: userReqA.userid } });
            }
            if (userReqB?.userid) {
                await prisma.requesters.deleteMany({ where: { userid: userReqB.userid } });
                await prisma.users.deleteMany({ where: { userid: userReqB.userid } });
            }
            console.log("Cleaned up disposable test data successfully.");
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }
    }

    console.log(`\n===============================================================================`);
    console.log(`   INTEGRATION TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)       `);
    console.log(`===============================================================================\n`);
}

runPhase4IntegrationTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
