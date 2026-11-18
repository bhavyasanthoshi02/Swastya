import assert from "node:assert";
import http from "node:http";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const TEST_JWT_SECRET = "test_super_secure_jwt_secret_swastya_step2_test";
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.DISABLE_RATE_LIMIT = "true";

import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { user_role } from "../src/generated/prisma/enums";

async function makeRequest(
    server: http.Server,
    options: http.RequestOptions,
    body?: any
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any }> {
    return new Promise((resolve, reject) => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 5000;

        const req = http.request(
            {
                ...options,
                port,
                host: "localhost",
            },
            (res) => {
                let rawData = "";
                res.on("data", (chunk) => {
                    rawData += chunk;
                });
                res.on("end", () => {
                    let parsed: any;
                    try {
                        parsed = JSON.parse(rawData);
                    } catch {
                        parsed = rawData;
                    }
                    resolve({
                        statusCode: res.statusCode || 500,
                        headers: res.headers,
                        body: parsed,
                    });
                });
            }
        );

        req.on("error", reject);

        if (body) {
            req.write(typeof body === "string" ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log("=== SWASTYA STEP 2.5B: REQUESTER SECURITY & ROUTE VERIFICATION ===\n");

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    let passed = 0;
    let failed = 0;

    const test = async (name: string, fn: () => Promise<void>) => {
        try {
            await fn();
            console.log(`[PASS] ${name}`);
            passed++;
        } catch (err: any) {
            console.error(`[FAIL] ${name}:`, err.message);
            failed++;
        }
    };

    // 1. Unauthenticated /requesters/me returns 401
    await test("1. GET /requesters/me rejects unauthenticated request with 401", async () => {
        const res = await makeRequest(server, {
            path: "/requesters/me",
            method: "GET",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 2. Unauthenticated /requesters/me/dashboard returns 401
    await test("2. GET /requesters/me/dashboard rejects unauthenticated request with 401", async () => {
        const res = await makeRequest(server, {
            path: "/requesters/me/dashboard",
            method: "GET",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 3. Unauthenticated /requesters/me/bloodrequests returns 401
    await test("3. GET /requesters/me/bloodrequests rejects unauthenticated request with 401", async () => {
        const res = await makeRequest(server, {
            path: "/requesters/me/bloodrequests",
            method: "GET",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 4. Unauthenticated PUT /requesters/me returns 401
    await test("4. PUT /requesters/me rejects unauthenticated request with 401", async () => {
        const res = await makeRequest(server, {
            path: "/requesters/me",
            method: "PUT",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    const ts = Date.now();
    const pwHash = await bcrypt.hash("ValidPass123!", 10);
    const donorUser = await prisma.users.create({
        data: {
            name: "Step25 Donor",
            email: `step25_donor_${ts}@swastya.test`,
            password: pwHash,
            role: user_role.DONOR,
            phonenumber: "9876500011",
            isactive: true,
        },
    });
    const hospitalUser = await prisma.users.create({
        data: {
            name: "Step25 Hospital",
            email: `step25_hosp_${ts}@swastya.test`,
            password: pwHash,
            role: user_role.HOSPITAL,
            phonenumber: "9876500012",
            isactive: true,
        },
    });
    const inactiveReqUser = await prisma.users.create({
        data: {
            name: "Step25 Inactive Req",
            email: `step25_inact_${ts}@swastya.test`,
            password: pwHash,
            role: user_role.REQUESTER,
            phonenumber: "9876500013",
            isactive: false,
        },
    });

    try {
    // 5. Non-requester (e.g. DONOR) accessing requester routes is rejected with 403
    await test("5. Security: DONOR token accessing /requesters/me/dashboard is rejected with 403", async () => {
        const donorToken = generateToken(donorUser.userid, donorUser.role);
        const res = await makeRequest(server, {
            path: "/requesters/me/dashboard",
            method: "GET",
            headers: {
                Authorization: `Bearer ${donorToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.message, "Access denied");
    });

    // 6. Non-requester (e.g. HOSPITAL) accessing requester routes is rejected with 403
    await test("6. Security: HOSPITAL token accessing /requesters/me is rejected with 403", async () => {
        const hospitalToken = generateToken(hospitalUser.userid, hospitalUser.role);
        const res = await makeRequest(server, {
            path: "/requesters/me",
            method: "GET",
            headers: {
                Authorization: `Bearer ${hospitalToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.message, "Access denied");
    });

    // 7. POST /bloodrequests requires authentication
    await test("7. Security: POST /bloodrequests rejects unauthenticated requests with 401", async () => {
        const res = await makeRequest(server, {
            path: "/bloodrequests",
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, {
            patientname: "Test Patient",
            bloodgroup: "O_POSITIVE",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 8. PUT /bloodrequests/:id requires authentication
    await test("8. Security: PUT /bloodrequests/:id rejects unauthenticated requests with 401", async () => {
        const res = await makeRequest(server, {
            path: "/bloodrequests/mock-req-123",
            method: "PUT",
            headers: { "Content-Type": "application/json" },
        }, {
            notes: "Tamper attempt",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 9. DELETE /bloodrequests/:id requires authentication
    await test("9. Security: DELETE /bloodrequests/:id rejects unauthenticated requests with 401", async () => {
        const res = await makeRequest(server, {
            path: "/bloodrequests/mock-req-123",
            method: "DELETE",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 10. Token generation for REQUESTER produces valid token
    await test("10. Token utility generates valid 7-day token for REQUESTER role", async () => {
        const sampleUuid = "22222222-2222-4222-8222-222222222222";
        const token = generateToken(sampleUuid, "REQUESTER");
        const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;
        assert.strictEqual(decoded.userid, sampleUuid);
        assert.strictEqual(decoded.role, "REQUESTER");
    });

    // 11. Registration validation rejects incomplete payloads
    await test("11. POST /auth/register rejects missing name or invalid email for requester registration", async () => {
        const res = await makeRequest(
            server,
            {
                path: "/auth/register",
                method: "POST",
                headers: { "Content-Type": "application/json" },
            },
            {
                name: "",
                email: "invalid-email",
                password: "123",
                role: "REQUESTER",
            }
        );
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
    });

    // 12. Inactive requester token rejected with 403
    await test("12. Security: Inactive REQUESTER account token is rejected with 403", async () => {
        const inactiveToken = generateToken(inactiveReqUser.userid, inactiveReqUser.role);
        const res = await makeRequest(server, {
            path: "/requesters/me",
            method: "GET",
            headers: { Authorization: `Bearer ${inactiveToken}` },
        });
        assert.strictEqual(res.statusCode, 403);
    });
    } finally {
        await prisma.users.deleteMany({
            where: { userid: { in: [donorUser.userid, hospitalUser.userid, inactiveReqUser.userid] } },
        });
        server.close();
        await prisma.$disconnect();
    }

    console.log("\n=================================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("FATAL ERROR in test runner:", err);
    process.exit(1);
});
