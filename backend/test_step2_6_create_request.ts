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

async function runStep26Tests() {
    console.log("=== SWASTYA STEP 2.6: CREATE BLOOD REQUEST VALIDATION & INTEGRATION TESTS ===\n");

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
    const testEmail = `step26.requester.${timestamp}@swastya.org`;
    const testPassword = "Password123!";

    let token = "";
    let userId = "";
    let createdRequestId = "";

    try {
        // Register disposable requester test user
        await test("1. Setup: Register disposable requester test account", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/auth/register",
                    headers: { "Content-Type": "application/json" },
                },
                {
                    name: "Dr. Ananya Rao",
                    email: testEmail,
                    password: testPassword,
                    phoneNumber: "9876543299",
                    role: "REQUESTER",
                    city: "Bengaluru",
                    state: "Karnataka",
                    pincode: "560001",
                }
            );

            assert.strictEqual(res.statusCode, 201);
            assert.strictEqual(res.body.success, true);
            token = res.body.token;
            userId = res.body.user.userid;
        });

        // 2. Missing patient name rejected
        await test("2. Validation: Rejects request with missing patient name (400)", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                },
                {
                    patientname: "",
                    patientage: 28,
                    patientgender: "FEMALE",
                    patientcontact: "9876543210",
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "HIGH",
                    requiredby: new Date(Date.now() + 86400000).toISOString(),
                }
            );

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Patient name is required");
        });

        // 3. Invalid patient age rejected
        await test("3. Validation: Rejects request with invalid patient age < 0 or > 125 (400)", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                },
                {
                    patientname: "Sunil Verma",
                    patientage: -5,
                    patientgender: "MALE",
                    patientcontact: "9876543210",
                    bloodgroup: "A_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 1,
                    urgencylevel: "HIGH",
                    requiredby: new Date(Date.now() + 86400000).toISOString(),
                }
            );

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.message.includes("Valid patient age"));
        });

        // 4. Invalid patient gender rejected
        await test("4. Validation: Rejects invalid patient gender (400)", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                },
                {
                    patientname: "Sunil Verma",
                    patientage: 35,
                    patientgender: "INVALID_GENDER",
                    patientcontact: "9876543210",
                    bloodgroup: "A_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 1,
                    urgencylevel: "HIGH",
                    requiredby: new Date(Date.now() + 86400000).toISOString(),
                }
            );

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.message.includes("Patient gender must be"));
        });

        // 5. Invalid blood group rejected
        await test("5. Validation: Rejects invalid blood group enum (400)", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                },
                {
                    patientname: "Sunil Verma",
                    patientage: 35,
                    patientgender: "MALE",
                    patientcontact: "9876543210",
                    bloodgroup: "Z_NEGATIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 1,
                    urgencylevel: "HIGH",
                    requiredby: new Date(Date.now() + 86400000).toISOString(),
                }
            );

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Valid blood group is required");
        });

        // 6. Invalid units rejected
        await test("6. Validation: Rejects unitsrequired <= 0 or > 100 (400)", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                },
                {
                    patientname: "Sunil Verma",
                    patientage: 35,
                    patientgender: "MALE",
                    patientcontact: "9876543210",
                    bloodgroup: "B_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 0,
                    urgencylevel: "HIGH",
                    requiredby: new Date(Date.now() + 86400000).toISOString(),
                }
            );

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.ok(res.body.message.includes("Units required"));
        });

        // 7. Invalid date format rejected
        await test("7. Validation: Rejects invalid required-by date (400)", async () => {
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                },
                {
                    patientname: "Sunil Verma",
                    patientage: 35,
                    patientgender: "MALE",
                    patientcontact: "9876543210",
                    bloodgroup: "B_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "HIGH",
                    requiredby: "not-a-valid-date",
                }
            );

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.message, "Invalid required-by date format");
        });

        // 8. Successful creation of Blood Request with full payload & server-side identity
        await test("8. Creation: Successfully creates blood request with all supported fields", async () => {
            const requiredDate = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
            const res = await makeRequest(
                server,
                {
                    method: "POST",
                    path: "/bloodrequests",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                },
                {
                    patientname: "Meera Krishnan",
                    patientage: 29,
                    patientgender: "FEMALE",
                    patientcontact: "9876543210",
                    bloodgroup: "AB_POSITIVE",
                    bloodcomponent: "PLATELETS",
                    unitsrequired: 3,
                    urgencylevel: "CRITICAL",
                    isemergency: true,
                    searchradius: 15,
                    requiredby: requiredDate,
                    notes: "Facility: Aster CMI Hospital | Ward: ICU Bed 12 | Platelet count low (18,000)",
                    // Spoofed client id attempt must be ignored in favor of authenticated identity
                    createdbyuserid: "00000000-0000-0000-0000-000000000000",
                }
            );

            assert.strictEqual(res.statusCode, 201);
            assert.ok(res.body.requestid);
            assert.strictEqual(res.body.patientname, "Meera Krishnan");
            assert.strictEqual(res.body.bloodgroup, "AB_POSITIVE");
            assert.strictEqual(res.body.bloodcomponent, "PLATELETS");
            assert.strictEqual(res.body.unitsrequired, 3);
            assert.strictEqual(res.body.urgencylevel, "CRITICAL");
            assert.strictEqual(res.body.isemergency, true);
            assert.strictEqual(res.body.searchradius, 15);
            // Critical check: Server-side identity enforced
            assert.strictEqual(res.body.createdbyuserid, userId);
            assert.notStrictEqual(res.body.createdbyuserid, "00000000-0000-0000-0000-000000000000");

            createdRequestId = res.body.requestid;
        });

        // 9. Dashboard integration: Requisition appears immediately in /requesters/me/dashboard
        await test("9. Integration: Dashboard immediately reflects the newly created requisition", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: "/requesters/me/dashboard",
                headers: { Authorization: `Bearer ${token}` },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.totalRequests, 1);
            assert.strictEqual(res.body.activeRequests, 1);
            assert.strictEqual(res.body.recentRequests.length, 1);
            assert.strictEqual(res.body.recentRequests[0].requestid, createdRequestId);
            assert.strictEqual(res.body.recentRequests[0].patientname, "Meera Krishnan");
        });

        // 10. GET /bloodrequests/:id returns the created requisition with full details
        await test("10. Retrieval: GET /bloodrequests/:id returns the created request", async () => {
            const res = await makeRequest(server, {
                method: "GET",
                path: `/bloodrequests/${createdRequestId}`,
                headers: { Authorization: `Bearer ${token}` },
            });

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.requestid, createdRequestId);
            assert.strictEqual(res.body.patientname, "Meera Krishnan");
            assert.strictEqual(res.body.status, "CREATED");
        });

    } finally {
        // Safe Cleanup: Clean up ONLY the disposable records created in this test
        try {
            if (createdRequestId) {
                await prisma.bloodrequests.deleteMany({ where: { requestid: createdRequestId } });
            }
            if (userId) {
                await prisma.users.deleteMany({ where: { userid: userId } });
            }
        } catch (cleanupErr) {
            console.error("Cleanup notice:", cleanupErr);
        }

        server.close();
    }

    console.log("\n=================================================================");
    console.log(`STEP 2.6 TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runStep26Tests().catch((err) => {
    console.error("Fatal error in Step 2.6 tests:", err);
    process.exit(1);
});
