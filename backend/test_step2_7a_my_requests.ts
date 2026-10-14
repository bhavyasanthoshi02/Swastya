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

async function runStep27aTests() {
    console.log("=== SWASTYA STEP 2.7A: MY BLOOD REQUESTS LIST ENDPOINT & SECURITY TESTS ===\n");

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

    const timestamp = Date.now();
    const requesterEmailA = `requester27a.a.${timestamp}@swastya.org`;
    const requesterEmailB = `requester27a.b.${timestamp}@swastya.org`;
    const donorEmail = `donor27a.${timestamp}@swastya.org`;
    const testPassword = "Password123!";

    let tokenA = "";
    let userIdA = "";
    let tokenB = "";
    let userIdB = "";
    let donorToken = "";
    let reqA1 = "";
    let reqA2 = "";
    let reqB1 = "";

    try {
        // 1. Setup Requester A
        await test("1. Setup: Register Requester A", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Requester Alpha",
                    email: requesterEmailA,
                    password: testPassword,
                    phoneNumber: "9876543201",
                    role: "REQUESTER",
                    city: "Bengaluru",
                    state: "Karnataka",
                    pincode: "560001",
                }
            );
            assert.strictEqual(res.statusCode, 201);
            tokenA = res.body.token;
            userIdA = res.body.user.userid;
        });

        // 2. Setup Requester B
        await test("2. Setup: Register Requester B", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Requester Beta",
                    email: requesterEmailB,
                    password: testPassword,
                    phoneNumber: "9876543202",
                    role: "REQUESTER",
                    city: "Mysuru",
                    state: "Karnataka",
                    pincode: "570001",
                }
            );
            assert.strictEqual(res.statusCode, 201);
            tokenB = res.body.token;
            userIdB = res.body.user.userid;
        });

        // 3. Setup Donor for authorization boundary checks
        await test("3. Setup: Register Donor", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Donor Charlie",
                    email: donorEmail,
                    password: testPassword,
                    phoneNumber: "9876543203",
                    role: "DONOR",
                    bloodgroup: "O+",
                    dateofbirth: "1994-06-15",
                    gender: "MALE",
                    city: "Bengaluru",
                    state: "Karnataka",
                    pincode: "560038",
                }
            );
            assert.strictEqual(res.statusCode, 201);
            donorToken = res.body.token;
        });

        // 4. Initial empty list for Requester A
        await test("4. GET /requesters/me/bloodrequests returns empty array when no requests exist", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/bloodrequests",
                headers: { Authorization: `Bearer ${tokenA}` },
            });
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.ok(Array.isArray(res.body.bloodRequests));
            assert.strictEqual(res.body.bloodRequests.length, 0);
        });

        // 5. Unauthenticated request rejected
        await test("5. Security: GET /requesters/me/bloodrequests rejects unauthenticated request (401)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/bloodrequests",
            });
            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.message, "Token missing");
        });

        // 6. Non-requester (Donor) rejected
        await test("6. Security: Donor token accessing /requesters/me/bloodrequests is rejected (403)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/bloodrequests",
                headers: { Authorization: `Bearer ${donorToken}` },
            });
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.message, "Access denied");
        });

        // 7. Create requests for Requester A
        await test("7. Creation: Create 2 blood requests for Requester A", async () => {
            const req1 = await makeRequest(
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
                    patientname: "Patient Alpha One",
                    patientage: 50,
                    patientgender: "MALE",
                    patientcontact: "9876543201",
                    bloodgroup: "A_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "HIGH",
                    requiredby: new Date(Date.now() + 86400000).toISOString(),
                    notes: "Urgent surgical reserve",
                }
            );
            assert.strictEqual(req1.statusCode, 201);
            reqA1 = req1.body.requestid;

            const req2 = await makeRequest(
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
                    patientname: "Patient Alpha Two",
                    patientage: 32,
                    patientgender: "FEMALE",
                    patientcontact: "9876543201",
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "PLATELETS",
                    unitsrequired: 4,
                    urgencylevel: "CRITICAL",
                    isemergency: true,
                    requiredby: new Date(Date.now() + 43200000).toISOString(),
                    notes: "Dengue platelet requirement",
                }
            );
            assert.strictEqual(req2.statusCode, 201);
            reqA2 = req2.body.requestid;
        });

        // 8. Create request for Requester B
        await test("8. Creation: Create 1 blood request for Requester B", async () => {
            const req = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${tokenB}`,
                    },
                },
                {
                    patientname: "Patient Beta One",
                    patientage: 65,
                    patientgender: "OTHER",
                    patientcontact: "9876543202",
                    bloodgroup: "B_NEGATIVE",
                    bloodcomponent: "RBC",
                    unitsrequired: 1,
                    urgencylevel: "MEDIUM",
                    requiredby: new Date(Date.now() + 172800000).toISOString(),
                }
            );
            assert.strictEqual(req.statusCode, 201);
            reqB1 = req.body.requestid;
        });

        // 9. Requester A only retrieves their own requests in reverse chronological order
        await test("9. Data Isolation: Requester A receives exactly their 2 requests in descending order", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/bloodrequests",
                headers: { Authorization: `Bearer ${tokenA}` },
            });
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.bloodRequests.length, 2);

            const ids = res.body.bloodRequests.map((r: any) => r.requestid);
            assert.ok(ids.includes(reqA1), "Contains Request A1");
            assert.ok(ids.includes(reqA2), "Contains Request A2");
            assert.ok(!ids.includes(reqB1), "Does NOT contain Request B1 (Strict Isolation)");

            // Verify ordered by createdat desc (reqA2 was created after reqA1)
            assert.strictEqual(res.body.bloodRequests[0].requestid, reqA2);
            assert.strictEqual(res.body.bloodRequests[1].requestid, reqA1);
        });

        // 10. Requester B only retrieves their 1 request
        await test("10. Data Isolation: Requester B receives exactly their 1 request", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/bloodrequests",
                headers: { Authorization: `Bearer ${tokenB}` },
            });
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.bloodRequests.length, 1);
            assert.strictEqual(res.body.bloodRequests[0].requestid, reqB1);
            assert.strictEqual(res.body.bloodRequests[0].patientname, "Patient Beta One");
        });

    } finally {
        // Clean up test records
        try {
            if (reqA1 || reqA2 || reqB1) {
                await prisma.bloodrequests.deleteMany({
                    where: { requestid: { in: [reqA1, reqA2, reqB1].filter(Boolean) } },
                });
            }
            if (userIdA || userIdB) {
                await prisma.users.deleteMany({
                    where: { userid: { in: [userIdA, userIdB].filter(Boolean) } },
                });
            }
            await prisma.users.deleteMany({ where: { email: donorEmail } });
        } catch (cleanupErr) {
            console.error("Cleanup notice:", cleanupErr);
        }

        server.close();
    }

    console.log("\n=================================================================");
    console.log(`STEP 2.7A TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runStep27aTests().catch((err) => {
    console.error("Fatal error in Step 2.7a tests:", err);
    process.exit(1);
});
