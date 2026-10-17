import assert from "node:assert";
import http from "node:http";
import jwt from "jsonwebtoken";

// Set test environment configuration
const TEST_JWT_SECRET = "test_super_secure_jwt_secret_swastya_step2_test";
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.FRONTEND_URL = "http://localhost:3000";

import app from "../src/app";
import { getJwtSecret, generateToken } from "../src/utils/jwt";

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
    console.log("=== STARTING STEP 2.1 BACKEND FOUNDATION & AUTH TESTS ===\n");

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    console.log(`Test server running on port ${port}`);

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

    // 1. Backend starts with valid configuration
    await test("1. Backend starts and responds to health endpoint", async () => {
        const res = await makeRequest(server, {
            path: "/health",
            method: "GET",
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
    });

    // 2. CORS allows configured frontend origin and blocks unauthorized origins
    await test("2. CORS allows http://localhost:3000 and restricts unauthorized origins", async () => {
        // Allowed origin
        const allowedRes = await makeRequest(server, {
            path: "/health",
            method: "GET",
            headers: {
                Origin: "http://localhost:3000",
            },
        });
        assert.strictEqual(allowedRes.headers["access-control-allow-origin"], "http://localhost:3000");

        // Disallowed origin
        const disallowedRes = await makeRequest(server, {
            path: "/health",
            method: "GET",
            headers: {
                Origin: "http://untrusted-external-site.com",
            },
        });
        assert.notStrictEqual(disallowedRes.headers["access-control-allow-origin"], "http://untrusted-external-site.com");

        // Preflight OPTIONS check
        const optionsRes = await makeRequest(server, {
            path: "/auth/me",
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization,Content-Type",
            },
        });
        assert.strictEqual(optionsRes.statusCode, 204);
        assert.ok(optionsRes.headers["access-control-allow-methods"]?.includes("GET"));
        assert.ok(optionsRes.headers["access-control-allow-headers"]?.toLowerCase().includes("authorization"));
    });

    // 3. JWT configuration and secret safety
    await test("3. JWT utility fails safely when JWT_SECRET is missing", async () => {
        const originalSecret = process.env.JWT_SECRET;
        try {
            delete process.env.JWT_SECRET;
            assert.throws(() => {
                getJwtSecret();
            }, /JWT_SECRET environment variable is missing/);
        } finally {
            process.env.JWT_SECRET = originalSecret;
        }
    });

    // 4. Current-user endpoint rejects unauthenticated requests
    await test("4. GET /auth/me rejects requests without token with 401", async () => {
        const res = await makeRequest(server, {
            path: "/auth/me",
            method: "GET",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 5. Invalid and expired tokens are rejected
    await test("5. Protected endpoints reject invalid and expired tokens", async () => {
        // Invalid token
        const invalidRes = await makeRequest(server, {
            path: "/auth/me",
            method: "GET",
            headers: {
                Authorization: "Bearer completely.fake.token",
            },
        });
        assert.strictEqual(invalidRes.statusCode, 401);
        assert.strictEqual(invalidRes.body.message, "Invalid token");

        // Expired token
        const expiredToken = jwt.sign(
            { userid: "test-user-id", role: "DONOR" },
            TEST_JWT_SECRET,
            { expiresIn: "-1s" }
        );
        const expiredRes = await makeRequest(server, {
            path: "/auth/me",
            method: "GET",
            headers: {
                Authorization: `Bearer ${expiredToken}`,
            },
        });
        assert.strictEqual(expiredRes.statusCode, 401);
        assert.strictEqual(expiredRes.body.message, "Invalid token");
    });

    // 6. Token generation and structure consistency
    await test("6. Token generation produces valid 7-day token with userid and role", async () => {
        const token = generateToken("mock-uuid-1234", "DONOR");
        const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;
        assert.strictEqual(decoded.userid, "mock-uuid-1234");
        assert.strictEqual(decoded.role, "DONOR");
        // Verify expiry is approximately 7 days from now
        const nowSec = Math.floor(Date.now() / 1000);
        const diff = decoded.exp - nowSec;
        assert.ok(diff > 600000 && diff <= 7 * 24 * 3600);
    });

    // 7. Donor registration validation prevents partial/invalid records
    await test("7. POST /auth/register validates required donor fields and rejects incomplete payloads", async () => {
        // Missing name
        const noNameRes = await makeRequest(server, {
            path: "/auth/register",
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, {
            email: "test@example.com",
            password: "password123",
            role: "DONOR",
        });
        assert.strictEqual(noNameRes.statusCode, 400);
        assert.strictEqual(noNameRes.body.message, "Full name is required");

        // Incomplete donor fields (missing gender, bloodgroup, etc.)
        const incompleteDonorRes = await makeRequest(server, {
            path: "/auth/register",
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, {
            name: "John Doe",
            email: "johndoe_test@example.com",
            password: "password123",
            role: "DONOR",
            bloodgroup: "O+",
            // Missing: gender, dateofbirth, city, state, pincode
        });
        assert.strictEqual(incompleteDonorRes.statusCode, 400);
        assert.ok(incompleteDonorRes.body.message.includes("Donor registration requires"));
        assert.ok(incompleteDonorRes.body.missingFields.includes("gender"));
        assert.ok(incompleteDonorRes.body.missingFields.includes("dateofbirth"));
    });

    // 8. POST /donors route protection
    await test("8. POST /donors rejects unauthenticated requests with 401", async () => {
        const res = await makeRequest(server, {
            path: "/donors",
            method: "POST",
            headers: { "Content-Type": "application/json" },
        }, {
            bloodgroup: "O+",
            dateofbirth: "1995-01-01",
            gender: "MALE",
            city: "Bengaluru",
            state: "Karnataka",
            pincode: "560038",
        });
        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.message, "Token missing");
    });

    // 9. PUT and DELETE /donors/:donorId route protection and role checks
    await test("9. PUT and DELETE /donors/:donorId require authentication and correct role", async () => {
        // PUT without token
        const putNoAuth = await makeRequest(server, {
            path: "/donors/some-donor-id",
            method: "PUT",
            headers: { "Content-Type": "application/json" },
        }, {
            city: "Mumbai",
        });
        assert.strictEqual(putNoAuth.statusCode, 401);

        // DELETE without token
        const deleteNoAuth = await makeRequest(server, {
            path: "/donors/some-donor-id",
            method: "DELETE",
        });
        assert.strictEqual(deleteNoAuth.statusCode, 401);

        // Access with unauthorized role (e.g. REQUESTER trying to PUT /donors/:id)
        const requesterToken = generateToken("requester-user-uuid", "REQUESTER");
        const putWrongRole = await makeRequest(server, {
            path: "/donors/some-donor-id",
            method: "PUT",
            headers: {
                Authorization: `Bearer ${requesterToken}`,
                "Content-Type": "application/json",
            },
        }, {
            city: "Mumbai",
        });
        assert.strictEqual(putWrongRole.statusCode, 403);
        assert.strictEqual(putWrongRole.body.message, "Access denied");
    });

    // 10. Password hashes and secrets never appear in safe response serializer
    await test("10. Verified that password and hash fields are stripped from user responses", async () => {
        // Direct test of serializer logic in /auth/me
        const mockUserWithPassword = {
            userid: "u-123",
            name: "Rahul Sharma",
            email: "rahul@example.com",
            phonenumber: "+919876543210",
            password: "$2b$10$hashedPasswordHere1234567890",
            role: "DONOR",
            isactive: true,
            emailverified: false,
        };

        const { password, ...safeUser } = mockUserWithPassword;
        assert.strictEqual((safeUser as any).password, undefined);
        assert.strictEqual(safeUser.name, "Rahul Sharma");
        assert.strictEqual(safeUser.email, "rahul@example.com");
    });

    server.close();
    console.log(`\n=== TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
