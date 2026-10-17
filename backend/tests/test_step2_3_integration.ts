import "dotenv/config";
import assert from "node:assert";

const BACKEND_URL = "http://localhost:5000";
const FRONTEND_URL = "http://localhost:3000";

async function postJson(url: string, body: any, headers: Record<string, string> = {}) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status: res.status, ok: res.ok, data };
}

async function getJson(url: string, headers: Record<string, string> = {}) {
    const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...headers },
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status: res.status, ok: res.ok, data };
}

async function patchJson(url: string, body: any, headers: Record<string, string> = {}) {
    const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status: res.status, ok: res.ok, data };
}

async function putJson(url: string, body: any, headers: Record<string, string> = {}) {
    const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }
    return { status: res.status, ok: res.ok, data };
}

async function runVerification() {
    console.log("=================================================================");
    console.log("   SWASTYA STEP 2.3 — FULL INTEGRATION VERIFICATION TEST SUITE   ");
    console.log("=================================================================\n");

    let testsPassed = 0;
    let testsFailed = 0;

    const test = async (name: string, fn: () => Promise<void>) => {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            testsPassed++;
        } catch (err: any) {
            console.error(`[FAIL] ${name}:`, err.message);
            testsFailed++;
        }
    };

    // Test A: Next.js Frontend Routes HTTP availability
    await test("A1. Frontend pages render successfully on Next.js server", async () => {
        const pages = [
            "/signin",
            "/signup",
            "/donor/dashboard",
            "/donor/requests",
            "/donor/history",
            "/donor/profile",
            "/donor/notifications",
            "/donor/settings",
        ];
        for (const p of pages) {
            const res = await fetch(`${FRONTEND_URL}${p}`);
            assert.strictEqual(res.status, 200, `Failed to fetch page ${p}`);
        }
    });

    // Test 1: Sign up a new donor or sign in
    const testEmail = `donor.test.${Date.now()}@swastya.org`;
    const testPassword = "Password123!";
    let donorToken = "";

    await test("1. Register a new donor with gender and profile attributes", async () => {
        const res = await postJson(`${BACKEND_URL}/auth/register`, {
            name: "Ananya Sen",
            email: testEmail,
            password: testPassword,
            phonenumber: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
            role: "DONOR",
            bloodgroup: "A_POSITIVE",
            dateofbirth: "1998-05-15",
            gender: "FEMALE",
            city: "Bengaluru",
            state: "Karnataka",
            pincode: "560001",
        });

        assert.strictEqual(res.status, 201, `Registration failed with status ${res.status}: ${JSON.stringify(res.data)}`);
        assert.strictEqual(res.data.success, true);
        assert.ok(res.data.token, "Token should be returned on registration");
    });

    await test("2. Sign in with valid donor credentials", async () => {
        const res = await postJson(`${BACKEND_URL}/auth/login`, {
            email: testEmail,
            password: testPassword,
        });

        assert.strictEqual(res.status, 200, `Login failed: ${JSON.stringify(res.data)}`);
        assert.strictEqual(res.data.success, true);
        assert.ok(res.data.token);
        assert.strictEqual(res.data.user.role, "DONOR");
        donorToken = res.data.token;
    });

    await test("3. Authenticate with /auth/me", async () => {
        const res = await getJson(`${BACKEND_URL}/auth/me`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.user.email, testEmail);
        assert.strictEqual(res.data.user.role, "DONOR");
    });

    await test("4. Load donor dashboard (GET /donors/me/dashboard)", async () => {
        const res = await getJson(`${BACKEND_URL}/donors/me/dashboard`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.success, true);
        assert.ok(res.data.donor, "Donor object present");
        assert.ok(res.data.eligibility, "Eligibility object present");
        assert.strictEqual(res.data.eligibility.isEligible, true);
        assert.ok(Array.isArray(res.data.matchingRequests), "matchingRequests is array");
        assert.ok(res.data.stats, "Stats object present");
        assert.strictEqual(typeof res.data.stats.totalDonations, "number");
    });

    await test("5. Load matching blood requests (GET /donors/me/matching-requests)", async () => {
        const res = await getJson(`${BACKEND_URL}/donors/me/matching-requests`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.success, true);
        assert.ok(Array.isArray(res.data.requests));
    });

    await test("6. Load donation history (GET /donors/me/history) handles empty history cleanly", async () => {
        const res = await getJson(`${BACKEND_URL}/donors/me/history`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.success, true);
        assert.ok(Array.isArray(res.data.history));
        assert.strictEqual(res.data.history.length, 0, "New donor should have 0 donation history");
        assert.strictEqual(res.data.stats.totalDonations, 0);
    });

    await test("7. Update availability and verify persistence in database (PATCH /donors/me/availability)", async () => {
        // Toggle to TEMPORARILY_UNAVAILABLE
        const update1 = await patchJson(
            `${BACKEND_URL}/donors/me/availability`,
            { availabilitystatus: "TEMPORARILY_UNAVAILABLE" },
            { Authorization: `Bearer ${donorToken}` }
        );
        assert.strictEqual(update1.status, 200);
        assert.strictEqual(update1.data.donor.availabilitystatus, "TEMPORARILY_UNAVAILABLE");

        // Verify with GET /donors/me
        const verify1 = await getJson(`${BACKEND_URL}/donors/me`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(verify1.status, 200);
        assert.strictEqual(verify1.data.donor.availabilitystatus, "TEMPORARILY_UNAVAILABLE");

        // Toggle back to AVAILABLE
        const update2 = await patchJson(
            `${BACKEND_URL}/donors/me/availability`,
            { availabilitystatus: "AVAILABLE" },
            { Authorization: `Bearer ${donorToken}` }
        );
        assert.strictEqual(update2.status, 200);
        assert.strictEqual(update2.data.donor.availabilitystatus, "AVAILABLE");

        // Verify with GET /donors/me again
        const verify2 = await getJson(`${BACKEND_URL}/donors/me`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(verify2.status, 200);
        assert.strictEqual(verify2.data.donor.availabilitystatus, "AVAILABLE");
    });

    await test("8. Update profile information (PUT /donors/me) and verify persistence", async () => {
        const res = await putJson(
            `${BACKEND_URL}/donors/me`,
            {
                city: "Mysuru",
                state: "Karnataka",
                pincode: "570001",
                address: "45 Palace Road",
                weight: 58.5,
            },
            { Authorization: `Bearer ${donorToken}` }
        );
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.donor.city, "Mysuru");
        assert.strictEqual(res.data.donor.pincode, "570001");
        assert.strictEqual(Number(res.data.donor.weight), 58.5);

        // Fetch fresh profile
        const fresh = await getJson(`${BACKEND_URL}/donors/me`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(fresh.data.donor.city, "Mysuru");
        assert.strictEqual(fresh.data.donor.address, "45 Palace Road");
    });

    await test("9. Notifications lifecycle (GET, PATCH mark read, PATCH mark all read)", async () => {
        const res = await getJson(`${BACKEND_URL}/notifications`, {
            Authorization: `Bearer ${donorToken}`,
        });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data.notifications));

        // Mark all read
        const markAll = await patchJson(
            `${BACKEND_URL}/notifications/mark-all-read`,
            {},
            { Authorization: `Bearer ${donorToken}` }
        );
        assert.strictEqual(markAll.status, 200);
        assert.strictEqual(markAll.data.success, true);
    });

    await test("10. Security: Unauthenticated access is rejected (401)", async () => {
        const noAuth = await getJson(`${BACKEND_URL}/donors/me`);
        assert.strictEqual(noAuth.status, 401);

        const invalidAuth = await getJson(`${BACKEND_URL}/donors/me`, {
            Authorization: "Bearer invalid.jwt.token",
        });
        assert.strictEqual(invalidAuth.status, 401);
    });

    await test("11. Security: Non-donor account is rejected from donor routes (403)", async () => {
        // Register or login a hospital user
        const hospitalEmail = `hospital.test.${Date.now()}@swastya.org`;
        const regHosp = await postJson(`${BACKEND_URL}/auth/register`, {
            name: "City Care Hospital",
            email: hospitalEmail,
            password: "Password123!",
            phonenumber: `97${Math.floor(10000000 + Math.random() * 90000000)}`,
            role: "HOSPITAL",
            city: "Bengaluru",
            state: "Karnataka",
        });
        assert.strictEqual(regHosp.status, 201);
        const hospitalToken = regHosp.data.token;

        // Attempt to call donor dashboard with hospital token
        const donorDash = await getJson(`${BACKEND_URL}/donors/me/dashboard`, {
            Authorization: `Bearer ${hospitalToken}`,
        });
        assert.strictEqual(donorDash.status, 403, "Non-donor should be rejected with 403 Forbidden");
        assert.strictEqual(donorDash.data.message, "Access denied");

        // Attempt to call donor profile
        const donorProf = await getJson(`${BACKEND_URL}/donors/me`, {
            Authorization: `Bearer ${hospitalToken}`,
        });
        assert.strictEqual(donorProf.status, 403);
    });

    console.log("\n=================================================================");
    console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
    console.log("=================================================================\n");

    if (testsFailed > 0) {
        process.exit(1);
    }
}

runVerification().catch((err) => {
    console.error("FATAL ERROR in test runner:", err);
    process.exit(1);
});
