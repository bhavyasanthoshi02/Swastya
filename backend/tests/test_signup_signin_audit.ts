import http from "http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import bcrypt from "bcrypt";

async function runAudit() {
    console.log("=== SWASTYA SIGNUP & SIGNIN AUDIT SUITE ===");
    let passed = 0;
    let failed = 0;

    const assert = (condition: boolean, desc: string) => {
        if (condition) {
            console.log(`  ✓ PASS: ${desc}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${desc}`);
            failed++;
        }
    };

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}`;

    const cleanupEmails: string[] = [];

    try {
        const postJson = async (endpoint: string, body: any, headers: Record<string, string> = {}) => {
            const res = await fetch(`${baseUrl}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify(body),
            });
            const data: any = await res.json().catch(() => null);
            return { status: res.status, body: data };
        };

        const getJson = async (endpoint: string, headers: Record<string, string> = {}) => {
            const res = await fetch(`${baseUrl}${endpoint}`, {
                method: "GET",
                headers: { Accept: "application/json", ...headers },
            });
            const data: any = await res.json().catch(() => null);
            return { status: res.status, body: data };
        };

        // --- SECTION 1: SIGNUP VALIDATION TESTS ---
        console.log("\n[1] Testing Signup Validation:");

        // 1.1 Empty payload
        const resEmpty = await postJson("/auth/register", {});
        assert(resEmpty.status === 400, "Empty payload returns 400");
        assert(resEmpty.body.success === false, "Empty payload response success is false");

        // 1.2 Missing Name
        const resNoName = await postJson("/auth/register", {
            email: "test_noname@example.com",
            password: "password123",
            role: "DONOR"
        });
        assert(resNoName.status === 400, "Missing name returns 400");
        assert(resNoName.body.message.includes("name"), "Error mentions name");

        // 1.3 Invalid Email
        const resBadEmail = await postJson("/auth/register", {
            name: "Test User",
            email: "invalid-email",
            password: "password123",
            role: "DONOR"
        });
        assert(resBadEmail.status === 400, "Invalid email returns 400");
        assert(resBadEmail.body.message.includes("email"), "Error mentions email");

        // 1.4 Short Password
        const resShortPass = await postJson("/auth/register", {
            name: "Test User",
            email: "test_short@example.com",
            password: "123",
            role: "DONOR"
        });
        assert(resShortPass.status === 400, "Short password returns 400");
        assert(resShortPass.body.message.includes("6"), "Error mentions password length");

        // 1.5 ADMIN registration blocked
        const resAdmin = await postJson("/auth/register", {
            name: "Admin User",
            email: "test_admin@example.com",
            password: "password123",
            role: "ADMIN"
        });
        assert(resAdmin.status === 403, "Admin registration returns 403");

        // 1.6 Invalid Role
        const resBadRole = await postJson("/auth/register", {
            name: "Bad Role User",
            email: "test_badrole@example.com",
            password: "password123",
            role: "SUPERUSER"
        });
        assert(resBadRole.status === 400, "Invalid role returns 400");

        // 1.7 Donor Missing Fields
        const resDonorMissing = await postJson("/auth/register", {
            name: "Incomplete Donor",
            email: "test_donor_incomplete@example.com",
            password: "password123",
            role: "DONOR"
        });
        assert(resDonorMissing.status === 400, "Donor missing fields returns 400");
        assert(Array.isArray(resDonorMissing.body.missingFields), "Returns missingFields array");

        // --- SECTION 2: VALID REGISTRATIONS ---
        console.log("\n[2] Testing Valid Registrations:");

        const uniqueSuffix = Date.now().toString().slice(-6);

        // 2.1 Donor Registration
        const donorEmail = `donor_${uniqueSuffix}@swastyatest.org`;
        cleanupEmails.push(donorEmail);
        const resDonor = await postJson("/auth/register", {
            name: "Audit Donor",
            email: donorEmail,
            password: "ValidPassword123!",
            phone: `91987${uniqueSuffix}`,
            role: "DONOR",
            bloodGroup: "O+",
            dob: "1995-05-15",
            gender: "MALE",
            city: "Bengaluru",
            state: "Karnataka",
            pincode: "560001",
            latitude: 12.9716,
            longitude: 77.5946
        });
        assert(resDonor.status === 201, "Donor registration returns 201");
        assert(!!resDonor.body.token, "Donor registration returns JWT token");
        assert(resDonor.body.user?.role === "DONOR", "Donor user role is DONOR");
        assert(resDonor.body.user?.email === donorEmail.toLowerCase(), "Donor email matches");
        assert(!resDonor.body.user?.password, "Donor password is not returned in response");
        assert(!!resDonor.body.donor?.donorid, "Donor record is created and returned");
        assert(resDonor.body.donor?.bloodgroup === "O_POSITIVE", "Donor bloodgroup is normalized to O_POSITIVE");

        // 2.2 Requester / Patient Registration
        const patientEmail = `patient_${uniqueSuffix}@swastyatest.org`;
        cleanupEmails.push(patientEmail);
        const resPatient = await postJson("/auth/register", {
            name: "Audit Patient",
            email: patientEmail,
            password: "ValidPassword123!",
            phone: `91986${uniqueSuffix}`,
            role: "PATIENT",
            city: "Chennai"
        });
        assert(resPatient.status === 201, "Patient registration returns 201");
        assert(!!resPatient.body.token, "Patient registration returns JWT token");
        assert(resPatient.body.user?.role === "REQUESTER", "Patient role mapped to REQUESTER");
        assert(!!resPatient.body.requester?.requesterid, "Requester record created");

        // 2.3 Hospital Registration
        const hospEmail = `hosp_${uniqueSuffix}@swastyatest.org`;
        cleanupEmails.push(hospEmail);
        const resHosp = await postJson("/auth/register", {
            name: "Dr. Hospital Lead",
            email: hospEmail,
            password: "ValidPassword123!",
            phone: `91985${uniqueSuffix}`,
            role: "HOSPITAL",
            hospitalname: `City Care ${uniqueSuffix}`,
            registrationnumber: `HOSP-REG-${uniqueSuffix}`,
            contactpersonname: "Dr. Hospital Lead",
            contactpersonphone: `91985${uniqueSuffix}`,
            address: "123 Healthcare Ave",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001"
        });
        assert(resHosp.status === 201, "Hospital registration returns 201");
        assert(resHosp.body.user?.role === "HOSPITAL", "Hospital user role is HOSPITAL");
        assert(!!resHosp.body.hospital?.hospitalid, "Hospital record created");

        // 2.4 Blood Bank Registration
        const bbEmail = `bb_${uniqueSuffix}@swastyatest.org`;
        cleanupEmails.push(bbEmail);
        const resBb = await postJson("/auth/register", {
            name: "Officer BB",
            email: bbEmail,
            password: "ValidPassword123!",
            phone: `91984${uniqueSuffix}`,
            role: "BLOOD_BANK",
            bloodbankname: `Central Blood Center ${uniqueSuffix}`,
            licensenumber: `BB-LIC-${uniqueSuffix}`,
            contactpersonname: "Officer BB",
            contactpersonphone: `91984${uniqueSuffix}`,
            address: "456 Lifeline Rd",
            city: "Delhi",
            state: "Delhi",
            pincode: "110001"
        });
        assert(resBb.status === 201, "Blood Bank registration returns 201");
        assert(resBb.body.user?.role === "BLOOD_BANK", "Blood Bank user role is BLOOD_BANK");
        assert(!!resBb.body.bloodbank?.bloodbankid, "Blood Bank record created");

        // --- SECTION 3: DUPLICATE DETECTION ---
        console.log("\n[3] Testing Duplicate Handling:");

        // 3.1 Duplicate Email
        const resDupEmail = await postJson("/auth/register", {
            name: "Duplicate Email User",
            email: donorEmail, // already registered
            password: "ValidPassword123!",
            phone: `91983${uniqueSuffix}`,
            role: "DONOR",
            bloodGroup: "A+",
            dob: "1990-01-01",
            gender: "FEMALE",
            city: "Bengaluru",
            state: "Karnataka",
            pincode: "560001"
        });
        assert(resDupEmail.status === 400, "Duplicate email returns 400");
        assert(resDupEmail.body.message.toLowerCase().includes("email"), "Error message mentions email exists");

        // 3.2 Duplicate Phone
        const resDupPhone = await postJson("/auth/register", {
            name: "Duplicate Phone User",
            email: `another_${uniqueSuffix}@swastyatest.org`,
            password: "ValidPassword123!",
            phone: `91987${uniqueSuffix}`, // same phone as donorEmail
            role: "DONOR",
            bloodGroup: "A+",
            dob: "1990-01-01",
            gender: "FEMALE",
            city: "Bengaluru",
            state: "Karnataka",
            pincode: "560001"
        });
        assert(resDupPhone.status === 400, "Duplicate phone returns 400");
        assert(resDupPhone.body.message.toLowerCase().includes("phone"), "Error message mentions phone number registered");

        // --- SECTION 4: SIGNIN TESTS ---
        console.log("\n[4] Testing Signin:");

        // 4.1 Missing fields
        const resLoginEmpty = await postJson("/auth/login", {});
        assert(resLoginEmpty.status === 400, "Empty login returns 400");

        // 4.2 Non-existent user
        const resLoginNotFound = await postJson("/auth/login", {
            email: "does_not_exist@example.com",
            password: "WrongPassword123!"
        });
        assert(resLoginNotFound.status === 401, "Non-existent user returns 401");
        assert(resLoginNotFound.body.message === "Invalid email or password", "Consistent user enumeration protection message");

        // 4.3 Wrong password
        const resLoginBadPass = await postJson("/auth/login", {
            email: donorEmail,
            password: "IncorrectPassword!"
        });
        assert(resLoginBadPass.status === 401, "Incorrect password returns 401");
        assert(resLoginBadPass.body.message === "Invalid email or password", "Consistent error message on wrong password");

        // 4.4 Successful login (Donor)
        const resLoginDonor = await postJson("/auth/login", {
            email: donorEmail,
            password: "ValidPassword123!"
        });
        assert(resLoginDonor.status === 200, "Valid donor login returns 200");
        assert(!!resLoginDonor.body.token, "Login returns JWT token");
        assert(resLoginDonor.body.user?.email === donorEmail.toLowerCase(), "Login returns correct user email");
        assert(resLoginDonor.body.user?.role === "DONOR", "Login returns DONOR role");
        assert(!!resLoginDonor.body.donor?.donorid, "Login returns linked donor profile");
        assert(!resLoginDonor.body.user?.password, "Login does not leak password hash");

        // 4.5 Successful login (Hospital)
        const resLoginHosp = await postJson("/auth/login", {
            email: hospEmail,
            password: "ValidPassword123!"
        });
        assert(resLoginHosp.status === 200, "Valid hospital login returns 200");
        assert(resLoginHosp.body.user?.role === "HOSPITAL", "Login returns HOSPITAL role");
        assert(!!resLoginHosp.body.hospital?.hospitalid, "Login returns linked hospital profile");

        // 4.6 Successful login (Blood Bank)
        const resLoginBb = await postJson("/auth/login", {
            email: bbEmail,
            password: "ValidPassword123!"
        });
        assert(resLoginBb.status === 200, "Valid bloodbank login returns 200");
        assert(resLoginBb.body.user?.role === "BLOOD_BANK", "Login returns BLOOD_BANK role");
        assert(!!resLoginBb.body.bloodbank?.bloodbankid, "Login returns linked bloodbank profile");

        // 4.7 Successful login (Patient / Requester)
        const resLoginPatient = await postJson("/auth/login", {
            email: patientEmail,
            password: "ValidPassword123!"
        });
        assert(resLoginPatient.status === 200, "Valid patient login returns 200");
        assert(resLoginPatient.body.user?.role === "REQUESTER", "Login returns REQUESTER role");
        assert(!!resLoginPatient.body.requester?.requesterid, "Login returns linked requester profile");

        // --- SECTION 5: GET /auth/me WITH TOKEN ---
        console.log("\n[5] Testing /auth/me:");
        const resMe = await getJson("/auth/me", {
            Authorization: `Bearer ${resLoginDonor.body.token}`
        });
        assert(resMe.status === 200, "/auth/me returns 200 with valid Bearer token");
        assert(resMe.body.user?.email === donorEmail.toLowerCase(), "/auth/me returns authenticated user");
        assert(!!resMe.body.donor, "/auth/me returns donor profile");

        const resMeNoAuth = await getJson("/auth/me");
        assert(resMeNoAuth.status === 401, "/auth/me without token returns 401");

        // --- SECTION 6: DATABASE VERIFICATION ---
        console.log("\n[6] Verifying Database Records:");
        const dbUser = await prisma.users.findUnique({
            where: { email: donorEmail.toLowerCase() },
            include: { donors: true }
        });
        assert(!!dbUser, "User record found in database");
        assert(dbUser?.role === "DONOR", "User DB role is DONOR");
        assert(dbUser?.isactive === true, "User DB isactive is true");
        assert(!!dbUser?.password && dbUser.password !== "ValidPassword123!", "Password is encrypted (not plaintext)");
        const isBcrypt = await bcrypt.compare("ValidPassword123!", dbUser!.password);
        assert(isBcrypt === true, "Bcrypt verification succeeds against hashed DB password");
        assert(!!dbUser?.donors, "Linked donor record exists in DB");

    } finally {
        server.close();
        // Cleanup test accounts
        if (cleanupEmails.length > 0) {
            await prisma.users.deleteMany({
                where: { email: { in: cleanupEmails.map(e => e.toLowerCase()) } }
            });
            console.log("\n[CLEANUP] Deleted test users from swastya_test.");
        }
    }

    console.log(`\n=== RESULTS: Passed: ${passed}, Failed: ${failed} ===`);
    if (failed > 0) {
        process.exit(1);
    }
}

runAudit().catch((err) => {
    console.error("FATAL AUDIT ERROR:", err);
    process.exit(1);
}).finally(() => prisma.$disconnect());
