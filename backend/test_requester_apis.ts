import "dotenv/config";
import assert from "node:assert";
import http from "node:http";
import app from "./src/app";
import { prisma } from "./src/config/prisma";

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
    console.log("=== SWASTYA STEP 2.5B: REQUESTER PORTAL FOUNDATION & DASHBOARD TESTS ===\n");

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

    // State
    const timestamp = Date.now();
    const requesterEmailA = `requester.a.${timestamp}@swastya.org`;
    const requesterEmailB = `requester.b.${timestamp}@swastya.org`;
    const donorEmail = `donor.test.${timestamp}@swastya.org`;
    const testPassword = "Password123!";

    let tokenA = "";
    let userA: any = null;
    let requesterA: any = null;

    let tokenB = "";
    let userB: any = null;
    let requesterB: any = null;

    let donorToken = "";
    let createdRequestId = "";

    try {
        // 1. Register Requester A
        await test("1. Register Requester A with role 'REQUESTER' and auto-create linked requester profile", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Deekshitha Requester",
                    email: requesterEmailA,
                    password: testPassword,
                    phoneNumber: "9876543210",
                    role: "REQUESTER",
                    city: "Bengaluru",
                    state: "Karnataka",
                    pincode: "560001",
                    address: "124 Indiranagar Care Square",
                }
            );

            assert.strictEqual(res.statusCode, 201, `Status: ${res.statusCode}`);
            assert.strictEqual(res.body.success, true);
            assert.ok(res.body.token, "JWT token returned");
            assert.strictEqual(res.body.user.role, "REQUESTER");
            assert.ok(res.body.requester, "Linked requester profile automatically created");
            assert.strictEqual(res.body.requester.city, "Bengaluru");
            assert.strictEqual(res.body.requester.pincode, "560001");

            tokenA = res.body.token;
            userA = res.body.user;
            requesterA = res.body.requester;
        });

        // 2. Register Requester B using legacy 'PATIENT' role
        await test("2. Register Requester B with legacy role 'PATIENT' normalizes to 'REQUESTER' and creates profile", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Ramesh Attendant",
                    email: requesterEmailB,
                    password: testPassword,
                    phone: "9123456789",
                    role: "PATIENT",
                    patientCity: "Hyderabad",
                }
            );

            assert.strictEqual(res.statusCode, 201);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.user.role, "REQUESTER");
            assert.ok(res.body.requester, "Requester record created");
            assert.strictEqual(res.body.requester.city, "Hyderabad");

            tokenB = res.body.token;
            userB = res.body.user;
            requesterB = res.body.requester;
        });

        // 3. Register a Donor for role-boundary security checks
        await test("3. Register Donor account for role authorization verification", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Suresh Donor",
                    email: donorEmail,
                    password: testPassword,
                    phone: "9812345678",
                    role: "DONOR",
                    bloodgroup: "O+",
                    dateofbirth: "1995-04-12",
                    gender: "MALE",
                    city: "Bengaluru",
                    state: "Karnataka",
                    pincode: "560038",
                }
            );

            assert.strictEqual(res.statusCode, 201);
            donorToken = res.body.token;
        });

        // 4. Login with Requester A
        await test("4. Login with Requester A returns user, token, and linked requester", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/login",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    email: requesterEmailA,
                    password: testPassword,
                }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.user.role, "REQUESTER");
            assert.ok(res.body.requester, "Requester included in login response");
            assert.strictEqual(res.body.requester.requesterid, requesterA.requesterid);
        });

        // 5. GET /auth/me returns requester
        await test("5. GET /auth/me returns user details and linked requester", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/auth/me",
                headers: {
                    Authorization: `Bearer ${tokenA}`,
                },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.user.email, requesterEmailA);
            assert.ok(res.body.requester);
            assert.strictEqual(res.body.requester.requesterid, requesterA.requesterid);
        });

        // 6. GET /requesters/me profile
        await test("6. GET /requesters/me retrieves canonical requester profile for authenticated session", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me",
                headers: {
                    Authorization: `Bearer ${tokenA}`,
                },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.requester.requesterid, requesterA.requesterid);
            assert.strictEqual(res.body.requester.users.email, requesterEmailA);
        });

        // 7. PUT /requesters/me update profile
        await test("7. PUT /requesters/me updates requester profile and persists in DB", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "PUT",
                    path: "/requesters/me",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${tokenA}`,
                    },
                },
                {
                    address: "88 Updated Residency Road",
                    city: "Bengaluru East",
                    pincode: "560025",
                }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.requester.address, "88 Updated Residency Road");
            assert.strictEqual(res.body.requester.city, "Bengaluru East");
            assert.strictEqual(res.body.requester.pincode, "560025");

            // Verify with GET /requesters/me
            const check = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me",
                headers: { Authorization: `Bearer ${tokenA}` },
            });
            assert.strictEqual(check.body.requester.city, "Bengaluru East");
        });

        // 8. GET /requesters/me/dashboard (empty requests initially)
        await test("8. GET /requesters/me/dashboard returns zero totals when no requests exist", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/dashboard",
                headers: {
                    Authorization: `Bearer ${tokenA}`,
                },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.totalRequests, 0);
            assert.strictEqual(res.body.activeRequests, 0);
            assert.strictEqual(res.body.completedRequests, 0);
            assert.ok(Array.isArray(res.body.recentRequests));
            assert.strictEqual(res.body.recentRequests.length, 0);
        });

        // 9. POST /bloodrequests with requester authentication
        await test("9. POST /bloodrequests creates request bound to authenticated user and requester", async () => {
            const requiredDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${tokenA}`,
                    },
                },
                {
                    patientname: "Kavitha Sharma",
                    patientage: 34,
                    patientgender: "FEMALE",
                    patientcontact: "9876500000",
                    bloodgroup: "A_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "HIGH",
                    isemergency: true,
                    requiredby: requiredDate,
                    notes: "Urgent post-op whole blood requirement.",
                }
            );

            assert.strictEqual(res.statusCode, 201);
            assert.ok(res.body.requestid);
            assert.strictEqual(res.body.patientname, "Kavitha Sharma");
            assert.strictEqual(res.body.createdbyuserid, userA.userid);
            assert.strictEqual(res.body.requesterid, requesterA.requesterid);

            createdRequestId = res.body.requestid;
        });

        // 10. GET /requesters/me/dashboard with live request reflects real totals
        await test("10. GET /requesters/me/dashboard shows live counts and real recent request", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/dashboard",
                headers: {
                    Authorization: `Bearer ${tokenA}`,
                },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.totalRequests, 1);
            assert.strictEqual(res.body.activeRequests, 1);
            assert.strictEqual(res.body.completedRequests, 0);
            assert.strictEqual(res.body.recentRequests.length, 1);
            assert.strictEqual(res.body.recentRequests[0].patientname, "Kavitha Sharma");
            assert.strictEqual(res.body.recentRequests[0].bloodgroup, "A_POSITIVE");
        });

        // 11. Parametric route GET /requesters/:requesterId/dashboard with valid ownership
        await test("11. GET /requesters/:requesterId/dashboard works for matching owner", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: `/requesters/${requesterA.requesterid}/dashboard`,
                headers: {
                    Authorization: `Bearer ${tokenA}`,
                },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.totalRequests, 1);
        });

        // 12. Security: Requester B accessing Requester A's dashboard is rejected with 403
        await test("12. Security: Requester B attempting to access Requester A's dashboard is rejected (403)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: `/requesters/${requesterA.requesterid}/dashboard`,
                headers: {
                    Authorization: `Bearer ${tokenB}`,
                },
            });

            assert.strictEqual(res.statusCode, 403, "Must be rejected with 403 Forbidden");
            assert.strictEqual(res.body.message, "Access denied");
        });

        // 13. Security: Donor accessing Requester routes is rejected with 403
        await test("13. Security: Non-requester (Donor) attempting to access /requesters/me/dashboard is rejected (403)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/dashboard",
                headers: {
                    Authorization: `Bearer ${donorToken}`,
                },
            });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.message, "Access denied");
        });

        // 14. Security: Unauthenticated request is rejected with 401
        await test("14. Security: Unauthenticated request to /requesters/me/dashboard is rejected (401)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/dashboard",
            });

            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.message, "Token missing");
        });

        // 15. Security: Requester B attempting to update Requester A's blood request is rejected (403)
        await test("15. Security: Foreign user cannot modify another requester's blood request (403)", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "PUT",
                    path: `/bloodrequests/${createdRequestId}`,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${tokenB}`,
                    },
                },
                {
                    patientname: "Tampered Name",
                }
            );

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.message, "Access denied: you do not own this blood request");
        });

        // 16. Owner updates their blood request successfully
        await test("16. Owner can update their blood request details", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "PUT",
                    path: `/bloodrequests/${createdRequestId}`,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${tokenA}`,
                    },
                },
                {
                    notes: "Updated clinical requirement: cross-matching in progress.",
                }
            );

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.notes, "Updated clinical requirement: cross-matching in progress.");
        });

    } finally {
        // Clean up created records to keep database clean
        try {
            if (createdRequestId) {
                await prisma.bloodrequests.deleteMany({ where: { requestid: createdRequestId } });
            }
            if (userA?.userid) {
                await prisma.users.deleteMany({ where: { userid: userA.userid } });
            }
            if (userB?.userid) {
                await prisma.users.deleteMany({ where: { userid: userB.userid } });
            }
            await prisma.users.deleteMany({ where: { email: donorEmail } });
        } catch {
            // ignore cleanup errors
        }

        server.close();
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
