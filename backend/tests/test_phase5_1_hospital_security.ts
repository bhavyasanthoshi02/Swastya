import http from "node:http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";

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

async function runPhase51SecurityTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 5.1: HOSPITAL BACKEND SECURITY & AUTHENTICATION SUITE          ");
    console.log("===============================================================================\n");

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as any;
    API_BASE = `http://127.0.0.1:${addr.port}`;
    console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);

    const timestamp = Date.now();
    const emailHospA = `phase51_hosp_a_${timestamp}@example.com`;
    const emailHospB = `phase51_hosp_b_${timestamp}@example.com`;
    const emailDonor = `phase51_donor_${timestamp}@example.com`;
    const emailReq = `phase51_req_${timestamp}@example.com`;
    const emailLegacyHosp = `phase51_legacy_hosp_${timestamp}@example.com`;

    const regNumA = `REG-HA-${timestamp}`;
    const regNumB = `REG-HB-${timestamp}`;

    let hospAUser: any = null;
    let hospBUser: any = null;
    let donorUser: any = null;
    let reqUser: any = null;
    let legacyHospUser: any = null;

    let tokenHospA = "";
    let tokenHospB = "";
    let hospitalAData: any = null;
    let hospitalBData: any = null;

    try {
        // --- TEST 1: Hospital registration creates linked user and hospital records ---
        console.log("--- 1. Testing Hospital Registration & Linkage ---");
        const regHospARes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Dr. Arvind Sharma",
                email: emailHospA,
                password: "SecurePassword123!",
                phone: "9876543210",
                role: "HOSPITAL",
                hospitalname: "St. Martha Memorial Hospital",
                registrationnumber: regNumA,
                contactpersonname: "Dr. Arvind Sharma",
                contactpersonphone: "9876543210",
                address: "45 Health City Road",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
            }),
        });

        assert(regHospARes.status === 201, `1a. Registration Status: Expected 201, got ${regHospARes.status}`);
        const regHospAJson = await regHospARes.json();
        assert(regHospAJson.success === true, "1b. Registration Success: Response indicates success");
        assert(typeof regHospAJson.token === "string" && regHospAJson.token.length > 0, "1c. Token Provided: JWT issued on registration");
        assert(regHospAJson.hospital && regHospAJson.hospital.hospitalid, "1d. Hospital Profile Linked: Linked hospital record returned");
        assert(regHospAJson.hospital.registrationnumber === regNumA, "1e. Registration Number Persisted: Matches submitted regNum");
        assert(regHospAJson.hospital.approvalstatus === "PENDING", "1f. Approval Status: New hospital is correctly in PENDING status");
        assert(regHospAJson.user && !regHospAJson.user.password, "1g. Security: Password hash is omitted from registration response");

        tokenHospA = regHospAJson.token;
        hospitalAData = regHospAJson.hospital;
        hospAUser = regHospAJson.user;

        // Verify database link directly
        const dbHospA = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalAData.hospitalid },
            include: { users: true },
        });
        assert(dbHospA !== null, "1h. DB Persistence: Hospital record exists in PostgreSQL");
        assert(dbHospA?.userid === hospAUser.userid, "1i. Relational Integrity: Hospital record links directly to user.userid");

        // --- TEST 2: Registration transaction does not leave partial records after failure ---
        console.log("\n--- 2. Testing Transactional Rollback on Registration Failure ---");
        const duplicateRegEmail = `dup_reg_${timestamp}@example.com`;
        const dupRegRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Dr. Duplicate",
                email: duplicateRegEmail,
                password: "SecurePassword123!",
                phone: "9876543219",
                role: "HOSPITAL",
                hospitalname: "Duplicate Clinic",
                registrationnumber: regNumA, // Duplicate of Hospital A!
                contactpersonname: "Dr. Duplicate",
                contactpersonphone: "9876543219",
                address: "99 Error Lane",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
            }),
        });

        assert(dupRegRes.status === 400, `2a. Duplicate Reg Error: Expected 400, got ${dupRegRes.status}`);
        const dupRegJson = await dupRegRes.json();
        assert(dupRegJson.success === false, "2b. Duplicate Handled: Rejection acknowledged");

        // Verify transactional atomicity: User must NOT have been created
        const ghostUser = await prisma.users.findUnique({
            where: { email: duplicateRegEmail.toLowerCase() },
        });
        assert(ghostUser === null, "2c. Atomic Rollback: No orphaned user account created after registration failure");

        // --- TEST 3: Login and /auth/me return the linked hospital profile ---
        console.log("\n--- 3. Testing Login and /auth/me with Hospital Profile ---");
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: emailHospA,
                password: "SecurePassword123!",
            }),
        });

        assert(loginRes.status === 200, `3a. Login Status: Expected 200, got ${loginRes.status}`);
        const loginJson = await loginRes.json();
        assert(loginJson.success === true, "3b. Login Success: User successfully logged in");
        assert(loginJson.hospital && loginJson.hospital.hospitalid === hospitalAData.hospitalid, "3c. Login Hospital: Linked hospital profile returned");
        assert(!loginJson.user.password, "3d. Security: User password omitted in login response");

        const meRes = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${tokenHospA}` },
        });
        assert(meRes.status === 200, `3e. Auth Me Status: Expected 200, got ${meRes.status}`);
        const meJson = await meRes.json();
        assert(meJson.hospital && meJson.hospital.hospitalname === "St. Martha Memorial Hospital", "3f. Auth Me Hospital: Resolves linked hospital profile");
        assert(!meJson.user.password, "3g. Security: User password omitted in /auth/me response");

        // --- TEST 4: Hospital self-profile retrieval works (GET /hospitals/me) ---
        console.log("\n--- 4. Testing Hospital Self-Profile (GET /hospitals/me) ---");
        const selfProfileRes = await fetch(`${API_BASE}/hospitals/me`, {
            headers: { Authorization: `Bearer ${tokenHospA}` },
        });
        assert(selfProfileRes.status === 200, `4a. Self-Profile Status: Expected 200, got ${selfProfileRes.status}`);
        const selfProfileJson = await selfProfileRes.json();
        assert(selfProfileJson.success === true, "4b. Self-Profile Success: Expected true");
        assert(selfProfileJson.hospital.hospitalid === hospitalAData.hospitalid, "4c. Identity Verification: Correct hospital ID resolved from token");
        assert(selfProfileJson.hospital.registrationnumber === regNumA, "4d. Registration Number: Matches record");
        assert(selfProfileJson.hospital.users && !selfProfileJson.hospital.users.password, "4e. Security: User password omitted from self profile");

        // --- TEST 5: Valid editable fields persist (PUT /hospitals/me) ---
        console.log("\n--- 5. Testing Valid Profile Edits (PUT /hospitals/me) ---");
        const updateRes = await fetch(`${API_BASE}/hospitals/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenHospA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                hospitalname: "St. Martha Super Specialty Hospital",
                contactpersonphone: "9123456789",
                address: "100 New Healthcare Avenue",
                city: "Bengaluru North",
            }),
        });

        assert(updateRes.status === 200, `5a. Update Status: Expected 200, got ${updateRes.status}`);
        const updateJson = await updateRes.json();
        assert(updateJson.success === true, "5b. Update Success: Profile updated");
        assert(updateJson.hospital.hospitalname === "St. Martha Super Specialty Hospital", "5c. Name Updated: New name reflected in response");
        assert(updateJson.hospital.contactpersonphone === "9123456789", "5d. Phone Updated: New phone reflected");
        assert(updateJson.hospital.address === "100 New Healthcare Avenue", "5e. Address Updated: New address reflected");

        // Verify persisted in database
        const dbUpdatedHosp = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalAData.hospitalid },
        });
        assert(dbUpdatedHosp?.hospitalname === "St. Martha Super Specialty Hospital", "5f. DB Persistence: Updated hospital name verified in DB");

        // --- TEST 6: Invalid input is rejected ---
        console.log("\n--- 6. Testing Input Validation ---");
        // 6a. Empty hospital name
        const badNameRes = await fetch(`${API_BASE}/hospitals/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenHospA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                hospitalname: "   ",
            }),
        });
        assert(badNameRes.status === 400, `6a. Empty Name Rejected: Expected 400, got ${badNameRes.status}`);

        // 6b. Missing fields on hospital registration
        const missingFieldsRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Incomplete Hospital",
                email: `incomplete_${timestamp}@example.com`,
                password: "Password123!",
                role: "HOSPITAL",
                // Missing registrationnumber, contactpersonphone, address, etc.
            }),
        });
        assert(missingFieldsRes.status === 400, `6b. Missing Registration Fields: Expected 400, got ${missingFieldsRes.status}`);
        const missingJson = await missingFieldsRes.json();
        assert(Array.isArray(missingJson.missingFields) && missingJson.missingFields.length > 0, "6c. Missing Fields List: Detailed missing fields returned");

        // --- TEST 7: Hospital A cannot access or edit Hospital B's profile ---
        console.log("\n--- 7. Testing Cross-Hospital Tenant Isolation ---");
        // Register Hospital B
        const regHospBRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Dr. Vikram Patel",
                email: emailHospB,
                password: "SecurePassword123!",
                phone: "9876500002",
                role: "HOSPITAL",
                hospitalname: "City General Hospital",
                registrationnumber: regNumB,
                contactpersonname: "Dr. Vikram Patel",
                contactpersonphone: "9876500002",
                address: "12 Outer Ring Road",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560100",
            }),
        });
        assert(regHospBRes.status === 201, "7a. Register Hospital B: Created successfully");
        const regHospBJson = await regHospBRes.json();
        tokenHospB = regHospBJson.token;
        hospitalBData = regHospBJson.hospital;
        hospBUser = regHospBJson.user;

        // Hospital A attempts to read Hospital B's profile via GET /hospitals/:id
        const crossReadRes = await fetch(`${API_BASE}/hospitals/${hospitalBData.hospitalid}`, {
            headers: { Authorization: `Bearer ${tokenHospA}` },
        });
        assert(crossReadRes.status === 403, `7b. Cross-Hospital Read Blocked: Expected 403, got ${crossReadRes.status}`);

        // Hospital A attempts to edit Hospital B via PUT /hospitals/:id
        const crossEditRes = await fetch(`${API_BASE}/hospitals/${hospitalBData.hospitalid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenHospA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                hospitalname: "Malicious Takeover Name",
            }),
        });
        assert(crossEditRes.status === 403, `7c. Cross-Hospital Edit Blocked: Expected 403, got ${crossEditRes.status}`);

        // Hospital A attempts to read Hospital B's dashboard
        const crossDashRes = await fetch(`${API_BASE}/hospitals/${hospitalBData.hospitalid}/dashboard`, {
            headers: { Authorization: `Bearer ${tokenHospA}` },
        });
        assert(crossDashRes.status === 403, `7d. Cross-Hospital Dashboard Blocked: Expected 403, got ${crossDashRes.status}`);

        // Hospital A attempts to read Hospital B's blood requests
        const crossReqRes = await fetch(`${API_BASE}/hospitals/${hospitalBData.hospitalid}/bloodrequests`, {
            headers: { Authorization: `Bearer ${tokenHospA}` },
        });
        assert(crossReqRes.status === 403, `7e. Cross-Hospital Requisitions Blocked: Expected 403, got ${crossReqRes.status}`);

        // --- TEST 8: Hospital users cannot modify approval status or privileged fields ---
        console.log("\n--- 8. Testing Approval Status & Privileged Field Protection ---");
        // 8a. Hospital A attempts to approve itself via PUT /hospitals/me
        const selfApproveMeRes = await fetch(`${API_BASE}/hospitals/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenHospA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                approvalstatus: "APPROVED",
            }),
        });
        assert(selfApproveMeRes.status === 403, `8a. Self-Approval via /me Blocked: Expected 403, got ${selfApproveMeRes.status}`);

        // 8b. Hospital A attempts to approve itself via PUT /hospitals/:id
        const selfApproveIdRes = await fetch(`${API_BASE}/hospitals/${hospitalAData.hospitalid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenHospA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                approvalstatus: "APPROVED",
            }),
        });
        assert(selfApproveIdRes.status === 403, `8b. Self-Approval via /:id Blocked: Expected 403, got ${selfApproveIdRes.status}`);

        // 8c. Verify DB record is STILL PENDING
        const dbCheckApproval = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalAData.hospitalid },
        });
        assert(dbCheckApproval?.approvalstatus === "PENDING", "8c. Approval Integrity: Hospital status remains PENDING in database");

        // 8d. Hospital attempts to tamper with its registration number
        await fetch(`${API_BASE}/hospitals/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenHospA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                registrationnumber: "FORGED_REG_NUM_999",
            }),
        });
        const dbCheckReg = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalAData.hospitalid },
        });
        assert(dbCheckReg?.registrationnumber === regNumA, "8d. Immutable Identifier: registrationnumber cannot be changed via self-service");

        // --- TEST 9: Public responses never contain password hashes ---
        console.log("\n--- 9. Testing Public Endpoints and Password Leak Protection ---");
        // 9a. Public GET /hospitals
        const publicListRes = await fetch(`${API_BASE}/hospitals`);
        assert(publicListRes.status === 200, `9a. Public List Status: Expected 200, got ${publicListRes.status}`);
        const publicList = await publicListRes.json();
        assert(Array.isArray(publicList), "9b. Public List is Array");
        const hospAInPublic = publicList.find((h: any) => h.hospitalid === hospitalAData.hospitalid);
        assert(hospAInPublic !== undefined, "9c. Created Hospital in Public Directory");
        assert(!("password" in hospAInPublic), "9d. Security: No password field in public hospital listing");
        assert(!("users" in hospAInPublic), "9e. Security: No embedded user credential object in public hospital listing");

        // 9b. Public GET /hospitals/:id without auth
        const publicDetailRes = await fetch(`${API_BASE}/hospitals/${hospitalAData.hospitalid}`);
        assert(publicDetailRes.status === 200, `9f. Public Detail Status: Expected 200, got ${publicDetailRes.status}`);
        const publicDetail = await publicDetailRes.json();
        assert(!("password" in publicDetail), "9g. Security: No password in unauthenticated detail response");
        assert(!("users" in publicDetail), "9h. Security: No users credential block in unauthenticated detail response");

        // --- TEST 10: Unauthenticated profile mutations are rejected ---
        console.log("\n--- 10. Testing Authentication on Mutations ---");
        // 10a. Unauthenticated PUT
        const noAuthPutRes = await fetch(`${API_BASE}/hospitals/${hospitalAData.hospitalid}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hospitalname: "Hacked Hospital" }),
        });
        assert(noAuthPutRes.status === 401, `10a. Unauthenticated PUT Blocked: Expected 401, got ${noAuthPutRes.status}`);

        // 10b. Unauthenticated DELETE
        const noAuthDeleteRes = await fetch(`${API_BASE}/hospitals/${hospitalAData.hospitalid}`, {
            method: "DELETE",
        });
        assert(noAuthDeleteRes.status === 401, `10b. Unauthenticated DELETE Blocked: Expected 401, got ${noAuthDeleteRes.status}`);

        // 10c. Non-admin DELETE (Hospital A attempting to delete itself)
        const hospitalDeleteRes = await fetch(`${API_BASE}/hospitals/${hospitalAData.hospitalid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenHospA}` },
        });
        assert(hospitalDeleteRes.status === 403, `10c. Hospital DELETE Blocked: Expected 403, got ${hospitalDeleteRes.status}`);

        // Verify Hospital A still exists
        const hospAStillExists = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalAData.hospitalid },
        });
        assert(hospAStillExists !== null, "10d. Persistence: Hospital record still safely exists");

        // --- TEST 11: Donor and requester registration/login regressions still pass ---
        console.log("\n--- 11. Testing Donor & Requester Regressions and Legacy Safety ---");
        // 11a. Donor registration regression
        const donorRegRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Test Voluntary Donor",
                email: emailDonor,
                password: "SecurePassword123!",
                phone: "9876511111",
                role: "DONOR",
                bloodgroup: "O+",
                dateofbirth: "1995-05-15",
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
            }),
        });
        assert(donorRegRes.status === 201, `11a. Donor Reg Status: Expected 201, got ${donorRegRes.status}`);
        const donorRegJson = await donorRegRes.json();
        assert(donorRegJson.donor && donorRegJson.donor.bloodgroup === "O_POSITIVE", "11b. Donor Profile: Generated properly");
        assert(donorRegJson.hospital === null, "11c. Non-Hospital: Hospital profile is null for donor");
        donorUser = donorRegJson.user;

        // 11b. Requester registration regression
        const reqRegRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Test Blood Requester",
                email: emailReq,
                password: "SecurePassword123!",
                phone: "9876522222",
                role: "REQUESTER",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
            }),
        });
        assert(reqRegRes.status === 201, `11d. Requester Reg Status: Expected 201, got ${reqRegRes.status}`);
        const reqRegJson = await reqRegRes.json();
        assert(reqRegJson.requester && reqRegJson.requester.city === "Bengaluru", "11e. Requester Profile: Generated properly");
        assert(reqRegJson.hospital === null, "11f. Non-Hospital: Hospital profile is null for requester");
        reqUser = reqRegJson.user;

        // 11c. Legacy account safety: A user with role HOSPITAL but no linked hospital record
        legacyHospUser = await prisma.users.create({
            data: {
                name: "Legacy Hospital Account",
                email: emailLegacyHosp,
                password: "hashedpassword123",
                role: "HOSPITAL",
            },
        });
        const legacyToken = generateToken(legacyHospUser.userid, "HOSPITAL");
        const legacyMeRes = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${legacyToken}` },
        });
        assert(legacyMeRes.status === 200, "11g. Legacy Account /auth/me: Returns HTTP 200 cleanly");
        const legacyMeJson = await legacyMeRes.json();
        assert(legacyMeJson.hospital === null, "11h. Legacy Safety: hospital profile is safely null without crashes or false records");

        const legacySelfProfRes = await fetch(`${API_BASE}/hospitals/me`, {
            headers: { Authorization: `Bearer ${legacyToken}` },
        });
        assert(legacySelfProfRes.status === 404, "11i. Legacy Self-Profile: Returns 404 Not Found cleanly when no hospital profile exists");

    } finally {
        // --- CLEANUP DISPOSABLE TEST RECORDS ---
        console.log("\n--- Cleaning up disposable test records ---");
        try {
            if (hospitalAData?.hospitalid) {
                await prisma.hospitals.deleteMany({ where: { hospitalid: hospitalAData.hospitalid } });
            }
            if (hospitalBData?.hospitalid) {
                await prisma.hospitals.deleteMany({ where: { hospitalid: hospitalBData.hospitalid } });
            }
            if (hospAUser?.userid) {
                await prisma.users.deleteMany({ where: { userid: hospAUser.userid } });
            }
            if (hospBUser?.userid) {
                await prisma.users.deleteMany({ where: { userid: hospBUser.userid } });
            }
            if (donorUser?.userid) {
                await prisma.donors.deleteMany({ where: { userid: donorUser.userid } });
                await prisma.users.deleteMany({ where: { userid: donorUser.userid } });
            }
            if (reqUser?.userid) {
                await prisma.requesters.deleteMany({ where: { userid: reqUser.userid } });
                await prisma.users.deleteMany({ where: { userid: reqUser.userid } });
            }
            if (legacyHospUser?.userid) {
                await prisma.users.deleteMany({ where: { userid: legacyHospUser.userid } });
            }
            if (server) {
                server.close();
            }
            console.log("Cleanup completed successfully.");
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
            if (server) {
                server.close();
            }
        }
    }

    console.log("\n===============================================================================");
    console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log("===============================================================================\n");

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

runPhase51SecurityTests().catch((err) => {
    console.error("FATAL ERROR in Phase 5.1 test suite:", err);
    process.exit(1);
});
