import http from "http";
import bcrypt from "bcrypt";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { user_role, blood_group, blood_component, urgency_level, request_status } from "../src/generated/prisma/enums";

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

async function runPhase0SecurityTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 0: CRITICAL SECURITY REMEDIATION TEST SUITE                    ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();
    const adminEmail = `admin_sec_${timestamp}@swastya.org`;
    const hospitalEmail = `hosp_sec_${timestamp}@swastya.org`;
    const requesterAEmail = `req_a_sec_${timestamp}@swastya.org`;
    const requesterBEmail = `req_b_sec_${timestamp}@swastya.org`;
    const donorEmail = `donor_sec_${timestamp}@swastya.org`;

    let adminUser: any = null;
    let hospitalUser: any = null;
    let requesterAUser: any = null;
    let requesterBUser: any = null;
    let donorUser: any = null;

    let adminToken = "";
    let hospitalToken = "";
    let requesterAToken = "";
    let requesterBToken = "";
    let donorToken = "";

    let createdRequestId = "";
    let standaloneUserId = "";

    try {
        // Start ephemeral server
        await new Promise<void>((resolve) => {
            server = http.createServer(app);
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address() as any;
                API_BASE = `http://127.0.0.1:${addr.port}`;
                console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);
                resolve();
            });
        });

        // 1. Provision Test Accounts
        const passwordHash = await bcrypt.hash("SecurePassword123!", 10);

        adminUser = await prisma.users.create({
            data: {
                name: "Admin Officer",
                email: adminEmail,
                password: passwordHash,
                role: user_role.ADMIN,
                phonenumber: "9876543000",
                isactive: true,
            },
        });
        adminToken = generateToken(adminUser.userid, adminUser.role);

        hospitalUser = await prisma.users.create({
            data: {
                name: "Apollo Hospital Admin",
                email: hospitalEmail,
                password: passwordHash,
                role: user_role.HOSPITAL,
                phonenumber: "9876543001",
                isactive: true,
                hospitals: {
                    create: {
                        hospitalname: "Apollo Multispecialty",
                        registrationnumber: `REG-SEC-${timestamp}`,
                        contactpersonname: "Dr. Roy",
                        contactpersonphone: "9876543001",
                        address: "10 Bannerghatta Rd",
                        city: "Bengaluru",
                        state: "Karnataka",
                        pincode: "560076",
                    },
                },
            },
            include: { hospitals: true },
        });
        hospitalToken = generateToken(hospitalUser.userid, hospitalUser.role);

        requesterAUser = await prisma.users.create({
            data: {
                name: "Requester Alpha",
                email: requesterAEmail,
                password: passwordHash,
                role: user_role.REQUESTER,
                phonenumber: "9876543002",
                isactive: true,
                requesters: {
                    create: {
                        address: "Flat 101, Palm Grove",
                        city: "Bengaluru",
                        state: "Karnataka",
                        pincode: "560001",
                    },
                },
            },
            include: { requesters: true },
        });
        requesterAToken = generateToken(requesterAUser.userid, requesterAUser.role);

        requesterBUser = await prisma.users.create({
            data: {
                name: "Requester Beta",
                email: requesterBEmail,
                password: passwordHash,
                role: user_role.REQUESTER,
                phonenumber: "9876543003",
                isactive: true,
                requesters: {
                    create: {
                        address: "House 24, Lake View",
                        city: "Bengaluru",
                        state: "Karnataka",
                        pincode: "560002",
                    },
                },
            },
            include: { requesters: true },
        });
        requesterBToken = generateToken(requesterBUser.userid, requesterBUser.role);

        donorUser = await prisma.users.create({
            data: {
                name: "Voluntary Donor Dev",
                email: donorEmail,
                password: passwordHash,
                role: user_role.DONOR,
                phonenumber: "9876543004",
                isactive: true,
                donors: {
                    create: {
                        bloodgroup: blood_group.O_POSITIVE,
                        dateofbirth: new Date("1995-05-15"),
                        gender: "MALE",
                        weight: 72,
                        city: "Bengaluru",
                        state: "Karnataka",
                        pincode: "560001",
                    },
                },
            },
            include: { donors: true },
        });
        donorToken = generateToken(donorUser.userid, donorUser.role);

        console.log("-> Test fixture users initialized successfully.\n");

        // 2. Create a test Blood Request by Requester A
        const reqPayload = {
            patientname: "Confidential Patient A",
            patientage: 38,
            patientgender: "FEMALE",
            patientcontact: "9876543999",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 2,
            urgencylevel: "CRITICAL",
            isemergency: true,
            requiredby: new Date(Date.now() + 86400000).toISOString(),
            hospitalid: hospitalUser.hospitals.hospitalid,
            notes: "Strictly confidential: patient sensitive clinical history",
        };

        const validPdfBuffer = Buffer.concat([
            Buffer.from("%PDF-1.4\n%âãÏÓ\n"),
            Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")
        ]);
        const formData = new FormData();
        for (const [k, v] of Object.entries(reqPayload)) {
            formData.append(k, String(v));
        }
        formData.append("prescription", new Blob([validPdfBuffer], { type: "application/pdf" }), "test_rx.pdf");

        const createRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${requesterAToken}`,
            },
            body: formData,
        });
        const createData = await createRes.json();
        assert(createRes.status === 201, "Test Request created by Requester A (HTTP 201)");
        createdRequestId = createData.requestid;
        assert(Boolean(createdRequestId), "Request ID resolved");

        // =========================================================================
        // GROUP 1: BLOOD REQUESTS SECURE COLLECTION & PUBLIC FEED AUDIT
        // =========================================================================
        console.log("\n--- Group 1: Blood Requests Collection & Public Feed Security ---");

        // 1.1 Unauthenticated GET /bloodrequests is rejected (HTTP 401)
        const unauthReqsRes = await fetch(`${API_BASE}/bloodrequests`);
        assert(unauthReqsRes.status === 401, "Unauthenticated GET /bloodrequests is rejected with HTTP 401");

        // 1.2 Invalid Bearer token is rejected (HTTP 401)
        const badTokenRes = await fetch(`${API_BASE}/bloodrequests`, {
            headers: { Authorization: "Bearer invalid.token.value" },
        });
        assert(badTokenRes.status === 401, "Invalid token to GET /bloodrequests is rejected with HTTP 401");

        // 1.3 Public sanitized feed GET /bloodrequests/public is accessible without auth
        const publicFeedRes = await fetch(`${API_BASE}/bloodrequests/public`);
        assert(publicFeedRes.status === 200, "Public feed GET /bloodrequests/public returns HTTP 200 without auth");
        const publicFeedData = await publicFeedRes.json();
        assert(Array.isArray(publicFeedData), "Public feed returns array");
        assert(publicFeedData.length > 0, "Public feed contains active emergency requests");

        // 1.4 Public feed NEVER exposes patient contact, clinical notes, patient name, or private user IDs
        const publicItem = publicFeedData.find((r: any) => r.requestid === createdRequestId);
        assert(Boolean(publicItem), "Public feed contains the emergency request");
        assert(publicItem.patientname === undefined, "Public feed: patientname is strictly withheld");
        assert(publicItem.patientcontact === undefined, "Public feed: patientcontact is strictly withheld");
        assert(publicItem.notes === undefined, "Public feed: notes/clinical history is strictly withheld");
        assert(publicItem.createdbyuserid === undefined, "Public feed: createdbyuserid is strictly withheld");
        assert(publicItem.users === undefined, "Public feed: user details strictly withheld");
        assert(publicItem.requesters === undefined, "Public feed: requester contact strictly withheld");
        assert(publicItem.bloodgroup === "O_POSITIVE", "Public feed: medical bloodgroup is available");
        assert(publicItem.hospitals?.hospitalname === "Apollo Multispecialty", "Public feed: hospital name is available for coordination");

        // 1.5 Donor accessing collection GET /bloodrequests receives sanitized data
        const donorReqsRes = await fetch(`${API_BASE}/bloodrequests`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        assert(donorReqsRes.status === 200, "Donor GET /bloodrequests returns HTTP 200");
        const donorReqsData = await donorReqsRes.json();
        const donorItem = donorReqsData.find((r: any) => r.requestid === createdRequestId);
        assert(Boolean(donorItem), "Donor receives active requisition");
        assert(donorItem.patientcontact === undefined, "Donor collection view: patient phone number strictly withheld");
        assert(donorItem.notes === undefined, "Donor collection view: private notes strictly withheld");

        // 1.6 Requester A receives their own request with full ownership details
        const reqAReqsRes = await fetch(`${API_BASE}/bloodrequests`, {
            headers: { Authorization: `Bearer ${requesterAToken}` },
        });
        assert(reqAReqsRes.status === 200, "Requester A GET /bloodrequests returns HTTP 200");
        const reqAReqsData = await reqAReqsRes.json();
        const reqAItem = reqAReqsData.find((r: any) => r.requestid === createdRequestId);
        assert(Boolean(reqAItem), "Requester A receives their own requisition");
        assert(reqAItem.patientcontact === "9876543999", "Requester A receives their own patient contact");
        assert(reqAItem.notes === reqPayload.notes, "Requester A receives their own notes");

        // 1.7 Requester B does NOT see Requester A's private requisition
        const reqBReqsRes = await fetch(`${API_BASE}/bloodrequests`, {
            headers: { Authorization: `Bearer ${requesterBToken}` },
        });
        assert(reqBReqsRes.status === 200, "Requester B GET /bloodrequests returns HTTP 200");
        const reqBReqsData = await reqBReqsRes.json();
        const reqBItem = reqBReqsData.find((r: any) => r.requestid === createdRequestId);
        assert(!reqBItem, "Requester B CANNOT view Requester A's private requisition in collection endpoint");

        // 1.8 Admin views all requests
        const adminReqsRes = await fetch(`${API_BASE}/bloodrequests`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(adminReqsRes.status === 200, "Admin GET /bloodrequests returns HTTP 200");
        const adminReqsData = await adminReqsRes.json();
        const adminItem = adminReqsData.find((r: any) => r.requestid === createdRequestId);
        assert(Boolean(adminItem), "Admin can view all blood requests");

        // 1.9 GET /bloodrequests/:id authorization preserved
        const reqDetailOwner = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            headers: { Authorization: `Bearer ${requesterAToken}` },
        });
        assert(reqDetailOwner.status === 200, "GET /bloodrequests/:id allowed for owner (HTTP 200)");

        const reqDetailCross = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            headers: { Authorization: `Bearer ${requesterBToken}` },
        });
        assert(reqDetailCross.status === 403, "GET /bloodrequests/:id rejected for non-owner requester (HTTP 403)");

        const reqDetailUnauth = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`);
        assert(reqDetailUnauth.status === 401, "GET /bloodrequests/:id rejected for unauthenticated request (HTTP 401)");

        // =========================================================================
        // GROUP 2: USER ENDPOINTS AUTHENTICATION, AUTHORIZATION & SECRETS STRIPPING
        // =========================================================================
        console.log("\n--- Group 2: User Endpoints Authentication, Authorization & Secrets Stripping ---");

        // 2.1 Unauthenticated GET /users is rejected (HTTP 401)
        const unauthUsersRes = await fetch(`${API_BASE}/users`);
        assert(unauthUsersRes.status === 401, "Unauthenticated GET /users rejected with HTTP 401");

        // 2.2 Non-admin (Donor) calling GET /users is rejected (HTTP 403)
        const donorUsersRes = await fetch(`${API_BASE}/users`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        assert(donorUsersRes.status === 403, "Non-admin (Donor) calling GET /users rejected with HTTP 403");

        // 2.3 Non-admin (Requester) calling GET /users is rejected (HTTP 403)
        const reqUsersRes = await fetch(`${API_BASE}/users`, {
            headers: { Authorization: `Bearer ${requesterAToken}` },
        });
        assert(reqUsersRes.status === 403, "Non-admin (Requester) calling GET /users rejected with HTTP 403");

        // 2.4 Admin calling GET /users returns list without password hashes
        const adminUsersRes = await fetch(`${API_BASE}/users`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(adminUsersRes.status === 200, "Admin calling GET /users returns HTTP 200");
        const adminUsersData = await adminUsersRes.json();
        assert(Array.isArray(adminUsersData) && adminUsersData.length > 0, "Admin GET /users returns array of users");
        for (const u of adminUsersData) {
            assert(u.password === undefined, `User record (${u.email}) strictly omits password hash`);
        }

        // 2.5 GET /users/me self-service profile
        const unauthMeRes = await fetch(`${API_BASE}/users/me`);
        assert(unauthMeRes.status === 401, "Unauthenticated GET /users/me rejected with HTTP 401");

        const donorMeRes = await fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        assert(donorMeRes.status === 200, "Donor GET /users/me returns HTTP 200");
        const donorMeData = await donorMeRes.json();
        assert(donorMeData.success === true, "GET /users/me success is true");
        assert(donorMeData.user.userid === donorUser.userid, "GET /users/me returns caller's user record");
        assert(donorMeData.user.password === undefined, "GET /users/me strictly omits password hash");

        // 2.6 GET /users/:id ownership enforcement
        const unauthIdRes = await fetch(`${API_BASE}/users/${donorUser.userid}`);
        assert(unauthIdRes.status === 401, "Unauthenticated GET /users/:id rejected with HTTP 401");

        const donorSelfRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        assert(donorSelfRes.status === 200, "User reading own ID returns HTTP 200");
        const donorSelfData = await donorSelfRes.json();
        assert(donorSelfData.password === undefined, "User reading own profile strictly omits password hash");

        const crossUserRes = await fetch(`${API_BASE}/users/${requesterAUser.userid}`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        assert(crossUserRes.status === 403, "User reading another user's profile rejected with HTTP 403 Forbidden");

        const adminReadUserRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(adminReadUserRes.status === 200, "Admin reading user profile returns HTTP 200");
        const adminReadUserData = await adminReadUserRes.json();
        assert(adminReadUserData.password === undefined, "Admin read user strictly omits password hash");

        // 2.7 POST /users administrative user creation
        const unauthCreateUserRes = await fetch(`${API_BASE}/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Hacker User",
                email: `hacker_${timestamp}@evil.org`,
                password: "PlainPassword123",
                role: "ADMIN",
            }),
        });
        assert(unauthCreateUserRes.status === 401, "Unauthenticated POST /users rejected with HTTP 401");

        const donorCreateUserRes = await fetch(`${API_BASE}/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({
                name: "NonAdmin Creation",
                email: `nonadmin_${timestamp}@test.org`,
                password: "Password123",
                role: "DONOR",
            }),
        });
        assert(donorCreateUserRes.status === 403, "Non-admin POST /users rejected with HTTP 403 Forbidden");

        const standaloneEmail = `standalone_${timestamp}@swastya.org`;
        const adminCreateUserRes = await fetch(`${API_BASE}/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                name: "Standalone Test User",
                email: standaloneEmail,
                password: "ValidPassword123!",
                role: "DONOR",
                phonenumber: "9876543111",
            }),
        });
        assert(adminCreateUserRes.status === 201, "Admin POST /users succeeded with HTTP 201");
        const adminCreateUserData = await adminCreateUserRes.json();
        standaloneUserId = adminCreateUserData.userid;
        assert(Boolean(standaloneUserId), "Admin created user has valid ID");
        assert(adminCreateUserData.password === undefined, "Admin POST /users response strictly omits password hash");

        // Verify password is encrypted in database
        const dbStandalone = await prisma.users.findUnique({ where: { userid: standaloneUserId } });
        assert(Boolean(dbStandalone?.password && dbStandalone.password.startsWith("$2b$")), "Password securely stored as bcrypt hash in database");

        // 2.8 PUT /users/:id ownership & privilege escalation safeguards
        const unauthPutRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Malicious Tamper" }),
        });
        assert(unauthPutRes.status === 401, "Unauthenticated PUT /users/:id rejected with HTTP 401");

        const crossPutRes = await fetch(`${API_BASE}/users/${requesterAUser.userid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({ name: "Cross Tamper" }),
        });
        assert(crossPutRes.status === 403, "Cross-user PUT /users/:id rejected with HTTP 403 Forbidden");

        // Non-admin attempting to escalate role to ADMIN
        const escalatePutRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({ role: "ADMIN" }),
        });
        assert(escalatePutRes.status === 403, "Self-service privilege escalation attempt (changing role) rejected with HTTP 403");

        // Non-admin attempting to tamper with isactive
        const tamperActivePutRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({ isactive: false }),
        });
        assert(tamperActivePutRes.status === 403, "Self-service activation tampering rejected with HTTP 403");

        // Valid self-service update by owner
        const validPutRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({ name: "Voluntary Donor Dev Updated", phonenumber: "9876543999" }),
        });
        assert(validPutRes.status === 200, "Valid self-service PUT /users/:id returned HTTP 200");
        const validPutData = await validPutRes.json();
        assert(validPutData.name === "Voluntary Donor Dev Updated", "User name updated");
        assert(validPutData.password === undefined, "PUT /users/:id response strictly omits password hash");

        // 2.9 DELETE /users/:id administrative deletion & clinical preservation
        const unauthDelRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, { method: "DELETE" });
        assert(unauthDelRes.status === 401, "Unauthenticated DELETE /users/:id rejected with HTTP 401");

        const donorDelRes = await fetch(`${API_BASE}/users/${donorUser.userid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        assert(donorDelRes.status === 403, "Non-admin DELETE /users/:id rejected with HTTP 403 Forbidden");

        // Admin attempting to delete self
        const adminSelfDelRes = await fetch(`${API_BASE}/users/${adminUser.userid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(adminSelfDelRes.status === 400, "Admin deleting own active account rejected with HTTP 400");

        // Admin deleting user with clinical records (Requester A created a blood request)
        const clinicalUserDelRes = await fetch(`${API_BASE}/users/${requesterAUser.userid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(clinicalUserDelRes.status === 200, "Admin deleting user with clinical history returned HTTP 200");
        const clinicalUserDelData = await clinicalUserDelRes.json();
        assert(clinicalUserDelData.deactivated === true, "User with clinical history is deactivated rather than destructively deleted");
        const dbReqA = await prisma.users.findUnique({ where: { userid: requesterAUser.userid } });
        assert(dbReqA !== null && dbReqA.isactive === false, "User row preserved in DB with isactive = false");

        // Admin deleting user without clinical records (Standalone user)
        const cleanUserDelRes = await fetch(`${API_BASE}/users/${standaloneUserId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert(cleanUserDelRes.status === 200, "Admin deleting standalone user returned HTTP 200");
        const cleanUserDelData = await cleanUserDelRes.json();
        assert(cleanUserDelData.deleted === true, "Standalone user deleted cleanly");
        const dbStandaloneDeleted = await prisma.users.findUnique({ where: { userid: standaloneUserId } });
        assert(dbStandaloneDeleted === null, "Standalone user row removed from DB");

        // =========================================================================
        // GROUP 3: BLOOD BANKS PASSWORD LEAK AUDIT
        // =========================================================================
        console.log("\n--- Group 3: Blood Banks & Public Feeds Secrets Stripping ---");

        const bloodbanksRes = await fetch(`${API_BASE}/bloodbanks`);
        assert(bloodbanksRes.status === 200, "GET /bloodbanks returned HTTP 200");
        const bloodbanksData = await bloodbanksRes.json();
        assert(Array.isArray(bloodbanksData), "GET /bloodbanks returns array");
        for (const bb of bloodbanksData) {
            if (bb.users) {
                assert(bb.users.password === undefined, `Blood bank user (${bb.users.email}) strictly omits password hash`);
            }
        }

        // =========================================================================
        // SUMMARY
        // =========================================================================
        console.log("\n===============================================================================");
        console.log(`  ALL ${totalTests}/${totalTests} PHASE 0 CRITICAL SECURITY TESTS PASSED!`);
        console.log("===============================================================================\n");

    } finally {
        // Cleanup disposable test records
        console.log("--- Safely cleaning up disposable test records ---");
        try {
            if (createdRequestId) {
                await prisma.notification.deleteMany({ where: { requestid: createdRequestId } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: createdRequestId } });
                await prisma.prescription.deleteMany({ where: { requestid: createdRequestId } });
                await prisma.bloodrequests.delete({ where: { requestid: createdRequestId } });
            }
            if (donorUser) {
                await prisma.donors.deleteMany({ where: { userid: donorUser.userid } });
                await prisma.users.delete({ where: { userid: donorUser.userid } });
            }
            if (requesterBUser) {
                await prisma.requesters.deleteMany({ where: { userid: requesterBUser.userid } });
                await prisma.users.delete({ where: { userid: requesterBUser.userid } });
            }
            if (requesterAUser) {
                await prisma.requesters.deleteMany({ where: { userid: requesterAUser.userid } });
                await prisma.users.delete({ where: { userid: requesterAUser.userid } });
            }
            if (hospitalUser) {
                await prisma.hospitals.deleteMany({ where: { userid: hospitalUser.userid } });
                await prisma.users.delete({ where: { userid: hospitalUser.userid } });
            }
            if (adminUser) {
                await prisma.users.delete({ where: { userid: adminUser.userid } });
            }
            console.log("Disposable test records cleaned up cleanly.\n");
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }

        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    }
}

runPhase0SecurityTests().catch((err) => {
    console.error("FATAL: Phase 0 Test Suite failed:", err);
    process.exit(1);
});
