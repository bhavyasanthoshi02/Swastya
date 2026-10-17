import "dotenv/config";
import assert from "node:assert";
import http from "node:http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";

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

async function runStep27bTests() {
    console.log("=== SWASTYA STEP 2.7B: REQUEST DETAILS & TRACKING ENDPOINT & SECURITY TESTS ===\n");

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
    const requesterEmailA = `requester27b.a.${timestamp}@swastya.org`;
    const requesterEmailB = `requester27b.b.${timestamp}@swastya.org`;
    const testPassword = "Password123!";

    let tokenA = "";
    let userIdA = "";
    let tokenB = "";
    let userIdB = "";
    let reqIdA = "";
    let legacyReqId = "";

    try {
        // Setup: Register Requester A
        await test("1. Setup: Register Requester A", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Dr. Vikram Seth",
                    email: requesterEmailA,
                    password: testPassword,
                    phoneNumber: "9876543301",
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

        // Setup: Register Requester B
        await test("2. Setup: Register Requester B", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Dr. Deepa Nair",
                    email: requesterEmailB,
                    password: testPassword,
                    phoneNumber: "9876543302",
                    role: "REQUESTER",
                    city: "Kochi",
                    state: "Kerala",
                    pincode: "682001",
                }
            );
            assert.strictEqual(res.statusCode, 201);
            tokenB = res.body.token;
            userIdB = res.body.user.userid;
        });

        // Create Request for Requester A
        await test("3. Setup: Create blood request for Requester A with initial history", async () => {
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
                    patientname: "Anandita Sen",
                    patientage: 26,
                    patientgender: "FEMALE",
                    patientcontact: "9876543301",
                    bloodgroup: "O_NEGATIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "CRITICAL",
                    isemergency: true,
                    searchradius: 20,
                    requiredby: new Date(Date.now() + 43200000).toISOString(),
                    notes: "Facility: Manipal Hospital, ICU Ward 4",
                }
            );
            assert.strictEqual(res.statusCode, 201);
            reqIdA = res.body.requestid;
        });

        // Test 1: Retrieving an authorized request
        await test("4. Retrieval: Owner can retrieve their request with full details & status history (200)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: `/bloodrequests/${reqIdA}`,
                headers: { Authorization: `Bearer ${tokenA}` },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.requestid, reqIdA);
            assert.strictEqual(res.body.patientname, "Anandita Sen");
            assert.strictEqual(res.body.bloodgroup, "O_NEGATIVE");
            assert.strictEqual(res.body.bloodcomponent, "WHOLE_BLOOD");
            assert.strictEqual(res.body.unitsrequired, 2);
            assert.strictEqual(res.body.urgencylevel, "CRITICAL");
            assert.strictEqual(res.body.isemergency, true);
            assert.strictEqual(res.body.createdbyuserid, userIdA);
            assert.ok(Array.isArray(res.body.requeststatushistory), "Returns status history array");
            assert.ok(res.body.requeststatushistory.length >= 1, "Contains initial CREATED transition");
            assert.strictEqual(res.body.requeststatushistory[0].newstatus, "CREATED");
        });

        // Test 2: Blocking access by a different requester
        await test("5. Security: Requester B attempting to access Requester A's request is blocked (403)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: `/bloodrequests/${reqIdA}`,
                headers: { Authorization: `Bearer ${tokenB}` },
            });

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Access denied: you do not own this blood request");
        });

        // Test 3: Rejecting unauthenticated access
        await test("6. Security: Unauthenticated request to GET /bloodrequests/:id is rejected (401)", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: `/bloodrequests/${reqIdA}`,
            });

            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(res.body.message, "Token missing");
        });

        // Test 4: Handling an invalid or nonexistent request ID
        await test("7. Error Handling: Non-existent UUID returns 404 Blood request not found", async () => {
            const nonExistentUuid = "00000000-0000-0000-0000-000000000000";
            const res = await makeRequest(server, {
                method: "GET",
                path: `/bloodrequests/${nonExistentUuid}`,
                headers: { Authorization: `Bearer ${tokenA}` },
            });

            assert.strictEqual(res.statusCode, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Blood request not found");
        });

        await test("8. Error Handling: Malformed non-UUID id returns 404 instead of 500 error", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/bloodrequests/invalid-malformed-id-12345",
                headers: { Authorization: `Bearer ${tokenA}` },
            });

            assert.strictEqual(res.statusCode, 404);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Blood request not found");
        });

        // Test 5: Rendering a missing status-history state without fake events
        await test("9. Data Accuracy: Request without status history returns empty history array (no fake events)", async () => {
            // Directly insert a legacy request with no status history rows
            const legacyReq = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: userIdA,
                    patientname: "Legacy Patient",
                    patientage: 60,
                    patientgender: "MALE",
                    patientcontact: "9876543301",
                    bloodgroup: "A_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 1,
                    urgencylevel: "LOW",
                    requiredby: new Date(Date.now() + 86400000),
                },
            });
            legacyReqId = legacyReq.requestid;

            const res = await makeRequest(server, {
                method: "GET",
                path: `/bloodrequests/${legacyReqId}`,
                headers: { Authorization: `Bearer ${tokenA}` },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.ok(Array.isArray(res.body.requeststatushistory));
            assert.strictEqual(
                res.body.requeststatushistory.length,
                0,
                "Must return empty history array without fabricating simulated events"
            );
        });

        // Test 6: Owner cancels their request
        await test("10. Operation: Owner can cancel request and transition is recorded in status history", async () => {
            const updateRes = await makeRequest(
                server,
                {
                    method: "PUT",
                    path: `/bloodrequests/${reqIdA}`,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${tokenA}`,
                    },
                },
                {
                    status: "CANCELLED",
                    remarks: "Patient transferred to specialized cardiac ICU",
                }
            );

            assert.strictEqual(updateRes.statusCode, 200);
            assert.strictEqual(updateRes.body.status, "CANCELLED");

            // Verify with GET
            const checkRes = await makeRequest(server, {
                method: "GET",
                path: `/bloodrequests/${reqIdA}`,
                headers: { Authorization: `Bearer ${tokenA}` },
            });

            assert.strictEqual(checkRes.statusCode, 200);
            assert.strictEqual(checkRes.body.status, "CANCELLED");
            const transitions = checkRes.body.requeststatushistory;
            assert.ok(transitions.length >= 2, "History contains CREATED and CANCELLED transitions");
            const lastTransition = transitions[transitions.length - 1];
            assert.strictEqual(lastTransition.newstatus, "CANCELLED");
            assert.strictEqual(lastTransition.remarks, "Patient transferred to specialized cardiac ICU");
        });

    } finally {
        // Safe Cleanup
        try {
            if (reqIdA || legacyReqId) {
                await prisma.bloodrequests.deleteMany({
                    where: { requestid: { in: [reqIdA, legacyReqId].filter(Boolean) } },
                });
            }
            if (userIdA || userIdB) {
                await prisma.users.deleteMany({
                    where: { userid: { in: [userIdA, userIdB].filter(Boolean) } },
                });
            }
        } catch (cleanupErr) {
            console.error("Cleanup notice:", cleanupErr);
        }

        server.close();
    }

    console.log("\n=================================================================");
    console.log(`STEP 2.7B TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runStep27bTests().catch((err) => {
    console.error("Fatal error in Step 2.7b tests:", err);
    process.exit(1);
});
