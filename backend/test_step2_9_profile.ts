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

async function runStep29Tests() {
    console.log("=== SWASTYA STEP 2.9: REQUESTER PROFILE VERIFICATION ===");

    const timestamp = Date.now();
    const emailA = `requester_prof_a_${timestamp}@example.com`;
    const emailB = `requester_prof_b_${timestamp}@example.com`;

    let userA: any = null;
    let userB: any = null;
    let tokenA = "";
    let tokenB = "";

    try {
        // 1. Setup: Create Requester A and Requester B in DB
        userA = await prisma.users.create({
            data: {
                name: "Dr. Ananya Rao",
                email: emailA,
                phonenumber: "9123456780",
                password: "hashedpassword123",
                role: "REQUESTER",
                isactive: true,
                emailverified: true,
            },
        });
        tokenA = generateToken(userA.userid, "REQUESTER");

        userB = await prisma.users.create({
            data: {
                name: "Dr. Vikram Seth",
                email: emailB,
                phonenumber: "9876543210",
                password: "hashedpassword123",
                role: "REQUESTER",
                isactive: true,
                emailverified: true,
            },
        });
        tokenB = generateToken(userB.userid, "REQUESTER");

        assert(Boolean(userA.userid && userB.userid), "1. Setup: Created Requester A and Requester B test users");

        // 2. Security: Unauthenticated GET /requesters/me is rejected (401)
        const unauthGetRes = await fetch(`${API_BASE}/requesters/me`);
        assert(unauthGetRes.status === 401, "2. Security: Unauthenticated GET /requesters/me returns 401");

        // 3. Security: Unauthenticated PUT /requesters/me is rejected (401)
        const unauthPutRes = await fetch(`${API_BASE}/requesters/me`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city: "Hacked City" }),
        });
        assert(unauthPutRes.status === 401, "3. Security: Unauthenticated PUT /requesters/me returns 401");

        // 4. Retrieval: Authenticated Requester A loads their own profile (auto-provisioned if needed)
        const getResA = await fetch(`${API_BASE}/requesters/me`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const getDataA = await getResA.json();
        assert(
            getResA.status === 200 &&
            getDataA.success === true &&
            getDataA.requester.users.email === emailA &&
            getDataA.requester.users.name === "Dr. Ananya Rao",
            "4. Retrieval: Authenticated Requester A loads their own profile with 200 OK"
        );

        // 5. Validation: Reject invalid phone number (400)
        const invalidPhoneRes = await fetch(`${API_BASE}/requesters/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ phonenumber: "abc" }),
        });
        assert(invalidPhoneRes.status === 400, "5. Validation: Rejects invalid phone number format with 400");

        // 6. Validation: Reject invalid PIN code (400)
        const invalidPinRes = await fetch(`${API_BASE}/requesters/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ pincode: "123" }),
        });
        assert(invalidPinRes.status === 400, "6. Validation: Rejects invalid PIN code with 400");

        // 7. Validation: Reject invalid Latitude (400)
        const invalidLatRes = await fetch(`${API_BASE}/requesters/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ latitude: 195 }),
        });
        assert(invalidLatRes.status === 400, "7. Validation: Rejects latitude out of range [-90, 90] with 400");

        // 8. Validation: Reject name with less than 2 characters (400)
        const invalidNameRes = await fetch(`${API_BASE}/requesters/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: " " }),
        });
        assert(invalidNameRes.status === 400, "8. Validation: Rejects empty or single-character name with 400");

        // 9. Persistence: Successfully update valid fields
        const validUpdateRes = await fetch(`${API_BASE}/requesters/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: "Dr. Ananya Rao MBBS",
                phonenumber: "9887766554",
                address: "Apollo Health City, Jubilee Hills",
                city: "Hyderabad",
                state: "Telangana",
                pincode: "500033",
                latitude: 17.4239,
                longitude: 78.4116,
            }),
        });
        const updateData = await validUpdateRes.json();
        assert(
            validUpdateRes.status === 200 &&
            updateData.success === true &&
            updateData.requester.city === "Hyderabad" &&
            updateData.requester.users.name === "Dr. Ananya Rao MBBS",
            "9. Persistence: PUT /requesters/me saves valid fields with 200 OK"
        );

        // 10. Reload Verification: Subsequent GET confirms persisted values in DB
        const reloadRes = await fetch(`${API_BASE}/requesters/me`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const reloadData = await reloadRes.json();
        assert(
            reloadRes.status === 200 &&
            reloadData.requester.address === "Apollo Health City, Jubilee Hills" &&
            reloadData.requester.city === "Hyderabad" &&
            reloadData.requester.state === "Telangana" &&
            reloadData.requester.pincode === "500033" &&
            reloadData.requester.users.name === "Dr. Ananya Rao MBBS" &&
            reloadData.requester.users.phonenumber === "9887766554",
            "10. Verification: Subsequent GET /requesters/me confirms changes persisted"
        );

        // 11. Security & Privilege Protection: Privileged fields cannot be changed via request payload
        const privilegedAttemptRes = await fetch(`${API_BASE}/requesters/me`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                role: "ADMIN",
                email: "hacked_email@admin.com",
                emailverified: true,
                userid: userB.userid, // Attempting to hijack user B's account
            }),
        });
        const privData = await privilegedAttemptRes.json();
        assert(
            privilegedAttemptRes.status === 200 &&
            privData.requester.users.role === "REQUESTER" &&
            privData.requester.users.email === emailA &&
            privData.requester.userid === userA.userid,
            "11. Security: Privileged fields (role, email, userid) are strictly shielded against manipulation"
        );

        // 12. Cross-Tenant Isolation: Requester B's profile is independent and cannot be modified by Requester A
        const getResB = await fetch(`${API_BASE}/requesters/me`, {
            headers: { Authorization: `Bearer ${tokenB}` },
        });
        const getDataB = await getResB.json();
        assert(
            getResB.status === 200 &&
            getDataB.requester.users.email === emailB &&
            getDataB.requester.users.name === "Dr. Vikram Seth" &&
            getDataB.requester.city !== "Hyderabad",
            "12. Tenant Isolation: Requester B's profile remains untouched and completely isolated"
        );

    } finally {
        // Teardown: Clean up test accounts
        try {
            if (userA?.userid) {
                await prisma.requesters.deleteMany({ where: { userid: userA.userid } });
                await prisma.users.delete({ where: { userid: userA.userid } });
            }
            if (userB?.userid) {
                await prisma.requesters.deleteMany({ where: { userid: userB.userid } });
                await prisma.users.delete({ where: { userid: userB.userid } });
            }
            console.log("[TEARDOWN] Test requester profiles cleaned up successfully.");
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }
    }

    console.log("\n=================================================================");
    console.log(`STEP 2.9 TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log("=================================================================\n");
}

runStep29Tests().catch((err) => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
});
