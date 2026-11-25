import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import app from "../src/app";
import { mapBackendDonorToProfile } from "../../apps/web/src/lib/mappers";

// Database safety constraint
const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl.includes("swastya_test")) {
    console.error("FATAL: Target database is NOT swastya_test. Aborting AUD-14 tests.");
    process.exit(1);
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        throw new Error(message);
    }
    console.log(`  ✔ ${message}`);
    passedTests++;
}

async function runAud14Tests() {
    console.log("============================================================");
    console.log("       AUD-14 FINAL SECURITY REMEDIATION TEST SUITE         ");
    console.log("============================================================");

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const API_BASE = `http://127.0.0.1:${port}`;

    const ts = Date.now();

    // 1. Setup test users
    const adminUser = await prisma.users.create({
        data: {
            name: `Admin AUD14 ${ts}`,
            email: `admin_${ts}@test.org`,
            password: "hashedpassword123",
            role: "ADMIN",
            isactive: true,
            emailverified: true,
        },
    });

    const hospitalUser = await prisma.users.create({
        data: {
            name: `Hospital AUD14 ${ts}`,
            email: `hosp_${ts}@test.org`,
            password: "hashedpassword123",
            role: "HOSPITAL",
            isactive: true,
            emailverified: true,
        },
    });

    const hospital = await prisma.hospitals.create({
        data: {
            userid: hospitalUser.userid,
            hospitalname: `Care Hospital ${ts}`,
            registrationnumber: `HOSP-REG-${ts}`,
            contactpersonname: "Dr. Nair",
            contactpersonphone: "9876543210",
            address: "45 Marine Lines",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400020",
            latitude: 18.940,
            longitude: 72.825,
            approvalstatus: "APPROVED",
        },
    });

    const unauthorizedHospUser = await prisma.users.create({
        data: {
            name: `Other Hosp AUD14 ${ts}`,
            email: `otherhosp_${ts}@test.org`,
            password: "hashedpassword123",
            role: "HOSPITAL",
            isactive: true,
            emailverified: true,
        },
    });

    const otherHospital = await prisma.hospitals.create({
        data: {
            userid: unauthorizedHospUser.userid,
            hospitalname: `Other Clinic ${ts}`,
            registrationnumber: `HOSP-OTHER-${ts}`,
            contactpersonname: "Dr. Roy",
            contactpersonphone: "9876543211",
            address: "10 Park Street",
            city: "Kolkata",
            state: "West Bengal",
            pincode: "700016",
            approvalstatus: "APPROVED",
        },
    });

    const requesterUserA = await prisma.users.create({
        data: {
            name: `Requester A AUD14 ${ts}`,
            email: `requester_a_${ts}@test.org`,
            password: "hashedpassword123",
            role: "REQUESTER",
            isactive: true,
            emailverified: true,
        },
    });

    const requesterUserB = await prisma.users.create({
        data: {
            name: `Requester B Attacker AUD14 ${ts}`,
            email: `requester_b_${ts}@test.org`,
            password: "hashedpassword123",
            role: "REQUESTER",
            isactive: true,
            emailverified: true,
        },
    });

    const donorUserMumbai = await prisma.users.create({
        data: {
            name: `Donor Mumbai ${ts}`,
            email: `donor_mumbai_${ts}@test.org`,
            password: "hashedpassword123",
            role: "DONOR",
            isactive: true,
            emailverified: true,
        },
    });

    const donorMumbai = await prisma.donors.create({
        data: {
            userid: donorUserMumbai.userid,
            bloodgroup: "O_POSITIVE",
            dateofbirth: new Date("1996-05-15"),
            gender: "MALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            iseligible: true,
            availabilitystatus: "AVAILABLE",
        },
    });

    const donorUserNoLoc = await prisma.users.create({
        data: {
            name: `Donor NoLoc ${ts}`,
            email: `donor_noloc_${ts}@test.org`,
            password: "hashedpassword123",
            role: "DONOR",
            isactive: true,
            emailverified: true,
        },
    });

    const donorNoLoc = await prisma.donors.create({
        data: {
            userid: donorUserNoLoc.userid,
            bloodgroup: "A_POSITIVE",
            dateofbirth: new Date("1998-03-20"),
            gender: "FEMALE",
            city: "",
            state: "",
            pincode: "",
            latitude: null,
            longitude: null,
            iseligible: true,
            availabilitystatus: "AVAILABLE",
        },
    });

    const adminToken = generateToken(adminUser.userid, "ADMIN");
    const hospitalToken = generateToken(hospitalUser.userid, "HOSPITAL");
    const unauthorizedHospToken = generateToken(unauthorizedHospUser.userid, "HOSPITAL");
    const requesterTokenA = generateToken(requesterUserA.userid, "REQUESTER");
    const requesterTokenB = generateToken(requesterUserB.userid, "REQUESTER");
    const donorTokenMumbai = generateToken(donorUserMumbai.userid, "DONOR");
    const donorTokenNoLoc = generateToken(donorUserNoLoc.userid, "DONOR");

    // Setup blood requests:
    // Request 1: Has prescription, status CREATED
    const req1 = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: requesterUserA.userid,
            hospitalid: hospital.hospitalid,
            patientname: "Patient Alpha",
            patientage: 45,
            patientgender: "MALE",
            patientcontact: "9876543210",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            urgencylevel: "HIGH",
            requiredby: new Date(Date.now() + 86400000),
            status: "CREATED",
        },
    });

    const rx1 = await prisma.prescription.create({
        data: {
            requestid: req1.requestid,
            fileurl: "mock_prescription_1.pdf",
            originalfilename: "rx_alpha.pdf",
            mimetype: "application/pdf",
            filesize: 1024,
            doctorname: "Dr. Sharma",
            hospitalname: "Care Hospital",
            status: "PENDING",
        },
    });

    // Request 2: Has NO prescription, status CANCELLED
    const req2 = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: requesterUserA.userid,
            hospitalid: hospital.hospitalid,
            patientname: "Patient Beta",
            patientage: 50,
            patientgender: "FEMALE",
            patientcontact: "9876543211",
            bloodgroup: "A_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 2,
            urgencylevel: "CRITICAL",
            requiredby: new Date(Date.now() + 86400000),
            status: "CANCELLED",
        },
    });

    try {
        // =====================================================================
        // F1: DONOR LOCATION FALLBACK
        // =====================================================================
        console.log("\n--- Testing F1: Donor Location Fallback & Handling ---");

        // 1. Missing donor location does not silently become Bengaluru in mapper
        const mappedNoLoc = mapBackendDonorToProfile({
            city: null,
            state: null,
            pincode: null,
            address: null,
            bloodgroup: "A_POSITIVE",
        });
        assert(mappedNoLoc.location !== "Bengaluru, Karnataka (560001)", "Missing donor location does not default to 'Bengaluru, Karnataka (560001)'");
        assert(!mappedNoLoc.location.includes("Bengaluru"), "Missing donor location does not contain 'Bengaluru'");
        assert(mappedNoLoc.location === "Location unavailable", "Missing donor location explicitly reports 'Location unavailable'");

        // 2. Valid donor location continues working
        const mappedMumbai = mapBackendDonorToProfile({
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            bloodgroup: "O_POSITIVE",
        });
        assert(mappedMumbai.location === "Mumbai, Maharashtra (400001)", "Valid donor location correctly formats to actual city and state");

        // 3. Backend matching for donor with missing location does not silently match arbitrary city requests
        const matchingNoLocRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${donorTokenNoLoc}` },
        });
        const matchingNoLocData = await matchingNoLocRes.json();
        assert(matchingNoLocRes.status === 200, "GET /donors/me/matching-requests returns 200 for donor without location");
        assert(matchingNoLocData.donorLocation.city === null, "donorLocation.city is null when not configured (not Bengaluru)");

        // 4. Backend matching for donor with valid location retains matching functionality
        const matchingMumbaiRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${donorTokenMumbai}` },
        });
        const matchingMumbaiData = await matchingMumbaiRes.json();
        assert(matchingMumbaiRes.status === 200, "GET /donors/me/matching-requests returns 200 for donor with valid location");
        assert(matchingMumbaiData.donorLocation.city === "Mumbai", "donorLocation.city matches actual city 'Mumbai'");

        // =====================================================================
        // F2: SERVER-SIDE PAGINATION FOR GET /users
        // =====================================================================
        console.log("\n--- Testing F2: Safe Server-Side Pagination for GET /users ---");

        // 5. Unauthorized users cannot retrieve protected user data (403)
        const unauthUsersRes = await fetch(`${API_BASE}/users`, {
            headers: { Authorization: `Bearer ${requesterTokenA}` },
        });
        assert(unauthUsersRes.status === 403, "Non-admin user receives 403 Forbidden on GET /users");

        // 6. Admin GET /users returns paginated response structure
        const adminUsersRes = await fetch(`${API_BASE}/users`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const adminUsersData = await adminUsersRes.json();
        assert(adminUsersRes.status === 200, "Admin receives 200 OK on GET /users");
        assert(adminUsersData.success === true, "GET /users response includes success: true");
        assert(typeof adminUsersData.total === "number", "GET /users returns total record count");
        assert(adminUsersData.page === 1, "GET /users defaults to page 1");
        assert(adminUsersData.limit === 20, "GET /users defaults to limit 20");
        assert(typeof adminUsersData.totalPages === "number", "GET /users returns totalPages calculation");
        assert(Array.isArray(adminUsersData.users), "GET /users returns users array");
        assert(adminUsersData.users.length <= 20, "GET /users returns at most 20 users by default");

        // 7. Custom limit and page are enforced correctly
        const customPageRes = await fetch(`${API_BASE}/users?page=1&limit=2`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const customPageData = await customPageRes.json();
        assert(customPageRes.status === 200, "GET /users?page=1&limit=2 returns 200");
        assert(customPageData.limit === 2, "Custom limit 2 is enforced");
        assert(customPageData.users.length === 2, "Exactly 2 users returned when limit=2");
        assert(customPageData.totalPages === Math.ceil(customPageData.total / 2), "totalPages matches total / 2");

        // 8. Maximum page size clamp (cannot request limit=500 to cause memory denial of service)
        const clampedRes = await fetch(`${API_BASE}/users?limit=500`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const clampedData = await clampedRes.json();
        assert(clampedRes.status === 200, "GET /users?limit=500 returns 200");
        assert(clampedData.limit === 100, "Excessive limit query clamped to maximum 100");

        // =====================================================================
        // F3: RESOURCE EXISTENCE / STATUS INFORMATION LEAKAGE
        // =====================================================================
        console.log("\n--- Testing F3: Resource Existence & Status Information Leakage ---");

        // 9. Prescription-file access: Unauthorized Requester B probing Request 1 (which HAS prescription)
        const rxFileReq1Res = await fetch(`${API_BASE}/bloodrequests/${req1.requestid}/prescription/file`, {
            headers: { Authorization: `Bearer ${requesterTokenB}` },
        });
        assert(rxFileReq1Res.status === 403, "Unauthorized user receives 403 on prescription file access for Request 1 (has rx)");

        // 10. Prescription-file access: Unauthorized Requester B probing Request 2 (which has NO prescription)
        const rxFileReq2Res = await fetch(`${API_BASE}/bloodrequests/${req2.requestid}/prescription/file`, {
            headers: { Authorization: `Bearer ${requesterTokenB}` },
        });
        // Must return 403 Forbidden, NOT 404 "No prescription found", preventing existence enumeration!
        assert(rxFileReq2Res.status === 403, "Unauthorized user receives 403 on Request 2 without prescription (does NOT leak 404 existence)");
        assert(rxFileReq1Res.status === rxFileReq2Res.status, "Error response code is identical (403) whether prescription exists or not");

        // 11. Prescription verification route: Unauthorized Hospital probing Request 2 without prescription
        const verifyRxReq2Res = await fetch(`${API_BASE}/bloodrequests/${req2.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${unauthorizedHospToken}`,
            },
            body: JSON.stringify({ status: "VERIFIED" }),
        });
        // Must return 403 Forbidden, NOT 400 "does not have a prescription to verify"!
        assert(verifyRxReq2Res.status === 403, "Unauthorized hospital receives 403 on verify route (does NOT leak 400 missing prescription)");

        // 12. Broadcast trigger route: Unauthorized Requester B probing Request 2 (which is CANCELLED)
        const triggerBcastReq2Res = await fetch(`${API_BASE}/bloodrequests/${req2.requestid}/broadcast`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterTokenB}`,
            },
            body: JSON.stringify({}),
        });
        // Must return 403 Forbidden, NOT 400 "Cannot initiate broadcast... already cancelled"!
        assert(triggerBcastReq2Res.status === 403, "Unauthorized user receives 403 on broadcast trigger (does NOT leak 400 CANCELLED lifecycle status)");

        // 13. Broadcast status view route: Unauthorized Requester B probing Request 1
        const viewBcastReq1Res = await fetch(`${API_BASE}/bloodrequests/${req1.requestid}/broadcast`, {
            headers: { Authorization: `Bearer ${requesterTokenB}` },
        });
        assert(viewBcastReq1Res.status === 403, "Unauthorized user receives 403 on broadcast status view");

        // 14. Authorized users retain legitimate access
        const authViewBcastRes = await fetch(`${API_BASE}/bloodrequests/${req1.requestid}/broadcast`, {
            headers: { Authorization: `Bearer ${requesterTokenA}` },
        });
        assert(authViewBcastRes.status === 200, "Request owner retains legitimate 200 OK access to broadcast endpoint");

        const authHospVerifyRes = await fetch(`${API_BASE}/bloodrequests/${req1.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospitalToken}`,
            },
            body: JSON.stringify({ status: "INVALID_STATUS" }),
        });
        // Assigned hospital is authorized to reach verification decision logic (passes auth, returns 400 for bad decision value)
        assert(authHospVerifyRes.status === 400, "Assigned hospital retains legitimate access to verify prescription (reaches decision validation)");

        console.log("\n============================================================");
        console.log("AUD-14 TEST SUMMARY:");
        console.log(`  Total Assertions: ${totalTests}`);
        console.log(`  Passed:           ${passedTests}`);
        console.log(`  Failed:           0`);
        console.log("============================================================");
    } finally {
        server.close();
        // Cleanup test data
        await prisma.prescription.deleteMany({
            where: { requestid: { in: [req1.requestid, req2.requestid] } },
        }).catch(() => {});

        await prisma.bloodrequests.deleteMany({
            where: { requestid: { in: [req1.requestid, req2.requestid] } },
        }).catch(() => {});

        await prisma.hospitals.deleteMany({
            where: { hospitalid: { in: [hospital.hospitalid, otherHospital.hospitalid] } },
        }).catch(() => {});

        await prisma.donors.deleteMany({
            where: { donorid: { in: [donorMumbai.donorid, donorNoLoc.donorid] } },
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: {
                userid: {
                    in: [
                        adminUser.userid,
                        hospitalUser.userid,
                        unauthorizedHospUser.userid,
                        requesterUserA.userid,
                        requesterUserB.userid,
                        donorUserMumbai.userid,
                        donorUserNoLoc.userid,
                    ],
                },
            },
        }).catch(() => {});
    }
}

runAud14Tests().catch((err) => {
    console.error("AUD-14 Test Suite Failed:", err);
    process.exit(1);
});
