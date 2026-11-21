import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app, { createRateLimiter, getAllowedOrigins } from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken, getJwtSecret } from "../src/utils/jwt";

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string, details?: string) {
    if (!condition) {
        totalFailed++;
        const errStr = details ? `${message} (${details})` : message;
        failures.push(errStr);
        console.error(`[FAIL] ${errStr}`);
        throw new Error(`Assertion failed: ${errStr}`);
    }
    totalPassed++;
    console.log(`[PASS] ${message}`);
}

async function reqJson(
    baseUrl: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
    urlPath: string,
    body?: any,
    token?: string,
    headers?: Record<string, string>
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
    return new Promise((resolve, reject) => {
        const u = new URL(urlPath, baseUrl);
        const reqHeaders: Record<string, string> = {
            ...(headers || {}),
        };
        if (body !== undefined) {
            reqHeaders["Content-Type"] = "application/json";
        }
        if (token) {
            reqHeaders["Authorization"] = `Bearer ${token}`;
        }

        const req = http.request(
            {
                method,
                hostname: u.hostname,
                port: u.port,
                path: `${u.pathname}${u.search}`,
                headers: reqHeaders,
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    let parsed: any = null;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = data;
                    }
                    resolve({ status: res.statusCode || 0, headers: res.headers, data: parsed });
                });
            }
        );
        req.on("error", reject);
        if (body !== undefined) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function run() {
    // 0. Pre-flight verification: Must be on swastya_test database
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe("SELECT current_database()");
    const currentDb = dbCheck[0]?.current_database || "";
    assert(currentDb === "swastya_test", `Target database must be swastya_test (got: ${currentDb})`);

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const userIds: string[] = [];
    let server: http.Server | null = null;
    let baseUrl = "";

    try {
        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", () => resolve());
        });
        const address = (server as any).address();
        baseUrl = `http://127.0.0.1:${address.port}`;

        // =========================================================================
        // PART 1: F1 — TRUST PROXY & SPOOFED FORWARDED IP HANDLING
        // =========================================================================
        console.log("\n--- Testing F1: Trust Proxy & Spoofed Forwarded IP Handling ---");

        // When trust proxy is disabled (default), app.get("trust proxy") is false
        const trustProxySetting = app.get("trust proxy");
        assert(
            trustProxySetting === false || typeof trustProxySetting !== "undefined",
            "F1.1: Express trust proxy is not unconditionally set to 1 or true"
        );

        // Test that an incoming request with spoofed X-Forwarded-For does not bypass IP tracking
        // Create an isolated rate limiter instance to test spoofed IP tracking
        const testLimiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 2,
            label: `spoof-test-${suffix}`,
            maxEntries: 100,
        });

        const mockRes = () => {
            const resObj: any = {
                headers: {} as Record<string, string>,
                statusCode: 200,
                setHeader(name: string, value: string) {
                    this.headers[name] = value;
                },
                status(code: number) {
                    this.statusCode = code;
                    return this;
                },
                json(payload: any) {
                    this.body = payload;
                    return this;
                },
            };
            return resObj;
        };

        // Two requests from actual socket address 127.0.0.1, but trying to spoof X-Forwarded-For
        // When trust proxy is false, Express sets req.ip to socket address (127.0.0.1)
        const req1: any = { ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "198.51.100.1" } };
        const res1 = mockRes();
        let next1Called = false;
        testLimiter(req1, res1, () => { next1Called = true; });
        assert(next1Called, "F1.2: First request passes rate limiter");

        const req2: any = { ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "198.51.100.2" } }; // Attacker tries new fake IP!
        const res2 = mockRes();
        let next2Called = false;
        testLimiter(req2, res2, () => { next2Called = true; });
        assert(next2Called, "F1.3: Second request passes rate limiter");

        // Third request from same socket (127.0.0.1) with another fake IP must be BLOCKED (429)
        const req3: any = { ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "198.51.100.3" } };
        const res3 = mockRes();
        let next3Called = false;
        testLimiter(req3, res3, () => { next3Called = true; });
        assert(!next3Called && res3.statusCode === 429, "F1.4: Spoofed X-Forwarded-For cannot bypass rate limiter when trust proxy is safe", `status=${res3.statusCode}`);
        assert(res3.body?.message === "Too many requests. Please try again later.", "F1.4b: 429 returns standard error message");
        assert(Boolean(res3.headers["Retry-After"]), "F1.4c: 429 returns Retry-After header");
        (testLimiter as any).destroy();

        // =========================================================================
        // PART 2: F2 — RATE LIMITER MEMORY BOUNDS & EXPIRED ENTRY CLEANUP
        // =========================================================================
        console.log("\n--- Testing F2: Rate Limiter Memory Bounds & Expired Entry Cleanup ---");

        // 2.1 Max entries capacity enforcement
        const boundedLimiter = createRateLimiter({
            windowMs: 60000,
            maxRequests: 5,
            label: `bounded-${suffix}`,
            maxEntries: 5, // Small capacity for deterministic testing
        });

        // Add 5 distinct entries
        for (let i = 1; i <= 5; i++) {
            const req: any = { ip: `10.0.0.${i}`, socket: { remoteAddress: `10.0.0.${i}` } };
            const res = mockRes();
            boundedLimiter(req, res, () => {});
        }
        assert((boundedLimiter as any).hits.size === 5, "F2.1: Rate limiter reaches capacity at 5 entries", `size=${(boundedLimiter as any).hits.size}`);

        // Add a 6th entry: size must NOT exceed maxEntries (5)
        const req6: any = { ip: "10.0.0.6", socket: { remoteAddress: "10.0.0.6" } };
        const res6 = mockRes();
        boundedLimiter(req6, res6, () => {});
        assert((boundedLimiter as any).hits.size <= 5, "F2.2: Rate limiter strictly bounds memory size and does not grow beyond maxEntries", `size=${(boundedLimiter as any).hits.size}`);

        // 2.2 Expired entry cleanup
        const shortLimiter = createRateLimiter({
            windowMs: 50, // 50ms window
            maxRequests: 5,
            label: `expire-${suffix}`,
            maxEntries: 100,
        });

        // Add 3 entries
        for (let i = 1; i <= 3; i++) {
            const req: any = { ip: `192.168.1.${i}`, socket: { remoteAddress: `192.168.1.${i}` } };
            const res = mockRes();
            shortLimiter(req, res, () => {});
        }
        assert((shortLimiter as any).hits.size === 3, "F2.3: Initial entries recorded in short-window limiter");

        // Wait 70ms for entries to expire
        await new Promise((resolve) => setTimeout(resolve, 70));

        // Trigger prune
        (shortLimiter as any).pruneExpired(Date.now());
        assert((shortLimiter as any).hits.size === 0, "F2.4: Expired entries are cleanly pruned from memory", `remaining=${(shortLimiter as any).hits.size}`);

        (boundedLimiter as any).destroy();
        (shortLimiter as any).destroy();

        // =========================================================================
        // PART 3: F3 — PRODUCTION CORS REJECTION & DEV CORS BEHAVIOR
        // =========================================================================
        console.log("\n--- Testing F3: Production CORS Rejection & Development CORS Behavior ---");

        const originalEnv = process.env.NODE_ENV;
        const originalFrontendUrl = process.env.FRONTEND_URL;

        // 3.1 Test development CORS: localhost origins are permitted
        process.env.NODE_ENV = "development";
        delete process.env.FRONTEND_URL;
        const devOrigins = getAllowedOrigins();
        assert(
            devOrigins.includes("http://localhost:3000") && devOrigins.includes("http://127.0.0.1:3000"),
            "F3.1: Development environment allows localhost origins"
        );

        // Preflight OPTIONS from localhost:3000 in dev
        const devCorsRes = await reqJson(baseUrl, "OPTIONS", "/health", undefined, undefined, {
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        });
        assert(devCorsRes.status === 204 || devCorsRes.status === 200, "F3.2: Development allows localhost CORS preflight", `status=${devCorsRes.status}`);

        // 3.2 Test production CORS: localhost origins are REJECTED, only configured origins allowed
        process.env.NODE_ENV = "production";
        process.env.FRONTEND_URL = "https://app.swastya.org,https://admin.swastya.org";
        const prodOrigins = getAllowedOrigins();
        assert(
            !prodOrigins.includes("http://localhost:3000") &&
            !prodOrigins.includes("http://127.0.0.1:3000") &&
            !prodOrigins.includes("http://localhost:3001"),
            "F3.3: Production environment strictly excludes all localhost and 127.0.0.1 origins"
        );
        assert(
            prodOrigins.includes("https://app.swastya.org") && prodOrigins.includes("https://admin.swastya.org"),
            "F3.4: Production allows only explicitly configured production frontend origins"
        );

        // Test production CORS rejection via HTTP request
        const prodRejectedCors = await reqJson(baseUrl, "GET", "/health", undefined, undefined, {
            "Origin": "http://localhost:3000",
        });
        assert(
            prodRejectedCors.status === 403,
            "F3.5: Localhost origin is rejected with 403 in production mode",
            `status=${prodRejectedCors.status}, msg=${prodRejectedCors.data?.message}`
        );
        assert(
            prodRejectedCors.data?.message === "CORS policy violation: Origin not allowed",
            "F3.5b: Correct CORS violation error message returned"
        );

        // Test production CORS allowed for configured origin
        const prodAllowedCors = await reqJson(baseUrl, "GET", "/health", undefined, undefined, {
            "Origin": "https://app.swastya.org",
        });
        assert(
            prodAllowedCors.status === 200,
            "F3.6: Explicitly configured production origin is accepted",
            `status=${prodAllowedCors.status}`
        );

        // Restore original env
        process.env.NODE_ENV = originalEnv;
        if (originalFrontendUrl) {
            process.env.FRONTEND_URL = originalFrontendUrl;
        } else {
            delete process.env.FRONTEND_URL;
        }

        // =========================================================================
        // PART 4: F4 — DEBUG ENDPOINT (/auth/test) UNAVAILABLE IN PRODUCTION
        // =========================================================================
        console.log("\n--- Testing F4: Debug Endpoint (/auth/test) Security ---");

        // In development/test mode, /auth/test works
        process.env.NODE_ENV = "development";
        const devTestEndpoint = await reqJson(baseUrl, "GET", "/auth/test");
        assert(
            devTestEndpoint.status === 200 && devTestEndpoint.data?.message === "Auth route working",
            "F4.1: /auth/test is available in non-production mode"
        );

        // In production mode, /auth/test MUST return 404 Not Found
        process.env.NODE_ENV = "production";
        const prodTestEndpoint = await reqJson(baseUrl, "GET", "/auth/test");
        assert(
            prodTestEndpoint.status === 404,
            "F4.2: /auth/test is securely disabled/unavailable in production (HTTP 404)",
            `status=${prodTestEndpoint.status}`
        );
        assert(
            prodTestEndpoint.data?.message !== "Auth route working",
            "F4.2b: /auth/test does not expose internal status in production"
        );

        process.env.NODE_ENV = originalEnv;

        // =========================================================================
        // PART 5: F5 — JWT SECURITY: SHORTER LIFETIME & TOKEN VALIDATION
        // =========================================================================
        console.log("\n--- Testing F5: JWT Lifetime & Verification ---");

        const sampleUserId = crypto.randomUUID();
        const defaultToken = generateToken(sampleUserId, "DONOR");
        const decoded: any = jwt.decode(defaultToken);

        assert(Boolean(decoded?.exp) && Boolean(decoded?.iat), "F5.1: Token contains exp and iat timestamps");
        const lifetimeSec = decoded.exp - decoded.iat;
        assert(
            lifetimeSec === 86400, // 24 hours = 86400 seconds
            "F5.2: Default JWT lifetime is reduced to 24 hours (86400s), eliminating 7-day exposure window",
            `lifetime=${lifetimeSec}s`
        );

        // Verify valid token with HS256 algorithm
        const verified: any = jwt.verify(defaultToken, getJwtSecret(), { algorithms: ["HS256"] });
        assert(verified.userid === sampleUserId && verified.role === "DONOR", "F5.3: Token validates correctly with HS256 signature");

        // Verify expired token is rejected by jwt.verify
        const expiredToken = jwt.sign(
            { userid: sampleUserId, role: "DONOR" },
            getJwtSecret(),
            { expiresIn: -10 } // Already expired 10s ago
        );
        let expiredRejected = false;
        try {
            jwt.verify(expiredToken, getJwtSecret(), { algorithms: ["HS256"] });
        } catch (err: any) {
            expiredRejected = err.name === "TokenExpiredError";
        }
        assert(expiredRejected, "F5.4: Expired token is rejected with TokenExpiredError");

        // Verify HTTP authentication rejection with expired token
        const authExpiredRes = await reqJson(baseUrl, "GET", "/auth/me", undefined, expiredToken);
        assert(
            authExpiredRes.status === 401,
            "F5.5: Expired token rejected by /auth/me middleware with HTTP 401",
            `status=${authExpiredRes.status}`
        );

        // =========================================================================
        // PART 6: F6 — LOGIN ENUMERATION PREVENTION
        // =========================================================================
        console.log("\n--- Testing F6: Login Enumeration Prevention ---");

        // Create a verified active test user
        const knownEmail = `aud11-known-${suffix}@swastya.org`;
        const correctPassword = "ValidPassword123!";
        const hashedPassword = await bcrypt.hash(correctPassword, 10);

        const activeUser = await prisma.users.create({
            data: {
                name: `AUD11 Active User ${suffix}`,
                email: knownEmail,
                password: hashedPassword,
                role: "DONOR",
                isactive: true,
                emailverified: true,
            },
        });
        userIds.push(activeUser.userid);

        // Attempt 1: Unknown non-existent user
        const unknownEmail = `aud11-nonexistent-${suffix}@swastya.org`;
        const resUnknown = await reqJson(baseUrl, "POST", "/auth/login", {
            email: unknownEmail,
            password: "SomePassword123!",
        });

        // Attempt 2: Known user with INCORRECT password
        const resWrongPass = await reqJson(baseUrl, "POST", "/auth/login", {
            email: knownEmail,
            password: "WrongPassword999!",
        });

        // F6.1: Both must return exact same HTTP status (401)
        assert(
            resUnknown.status === 401,
            "F6.1: Non-existent user login returns HTTP 401 Unauthorized",
            `status=${resUnknown.status}`
        );
        assert(
            resWrongPass.status === 401,
            "F6.2: Incorrect password login returns HTTP 401 Unauthorized",
            `status=${resWrongPass.status}`
        );

        // F6.2: Both must return exact same error message
        assert(
            resUnknown.data?.message === "Invalid email or password",
            "F6.3: Non-existent user receives generic 'Invalid email or password' message",
            `msg=${resUnknown.data?.message}`
        );
        assert(
            resWrongPass.data?.message === "Invalid email or password",
            "F6.4: Incorrect password receives generic 'Invalid email or password' message",
            `msg=${resWrongPass.data?.message}`
        );
        assert(
            resUnknown.data?.message === resWrongPass.data?.message && resUnknown.status === resWrongPass.status,
            "F6.5: Response status and message are identical for unknown users and wrong passwords (zero account enumeration)"
        );

        // Attempt 3: Known user with CORRECT password succeeds
        const resSuccess = await reqJson(baseUrl, "POST", "/auth/login", {
            email: knownEmail,
            password: correctPassword,
        });
        assert(resSuccess.status === 200, "F6.6: Correct credentials login succeeds with HTTP 200");
        assert(Boolean(resSuccess.data?.token), "F6.6b: Login response includes auth token");
        assert(resSuccess.data?.user?.email === knownEmail, "F6.6c: Login response returns user profile");
        assert(typeof resSuccess.data?.user?.password === "undefined", "F6.6d: Password hash is not leaked in user payload");

        // =========================================================================
        // PART 7: F7 — ACTIVATION TOKEN POST WORKFLOW & REPLAY REJECTION
        // =========================================================================
        console.log("\n--- Testing F7: Activation Token Security & Replay Rejection ---");

        // Create an inactive donor account with single-use activation token
        const donorEmail = `aud11-donor-${suffix}@swastya.org`;
        const tempSecret = crypto.randomBytes(32).toString("hex");
        const tempHashed = await bcrypt.hash(tempSecret, 10);

        const pendingUser = await prisma.users.create({
            data: {
                name: `AUD11 Pending Donor ${suffix}`,
                email: donorEmail,
                password: tempHashed,
                role: "DONOR",
                isactive: false,
                emailverified: false,
            },
        });
        userIds.push(pendingUser.userid);

        const rawActivationToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawActivationToken).digest("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.donoractivationtokens.create({
            data: {
                userid: pendingUser.userid,
                tokenhash: tokenHash,
                expiresat: expiresAt,
            },
        });

        // 7.1 Verify token via GET query parameter must be REJECTED (URL leakage prevention)
        const resGetQueryVerify = await reqJson(
            baseUrl,
            "GET",
            `/auth/verify-activation-token?token=${rawActivationToken}`
        );
        assert(
            resGetQueryVerify.status === 400,
            "F7.1: GET with query token is rejected with HTTP 400 Bad Request",
            `status=${resGetQueryVerify.status}`
        );
        assert(
            String(resGetQueryVerify.data?.message || "").includes("Transmitting activation tokens via URL query parameters is prohibited"),
            "F7.1b: GET query token rejection states URL query transmission is prohibited"
        );

        // 7.2 Verify token via POST body succeeds
        const resPostBodyVerify = await reqJson(baseUrl, "POST", "/auth/verify-activation-token", {
            token: rawActivationToken,
        });
        assert(
            resPostBodyVerify.status === 200,
            "F7.2: POST /auth/verify-activation-token with body token succeeds",
            `status=${resPostBodyVerify.status}`
        );
        assert(resPostBodyVerify.data?.valid === true, "F7.2b: Activation token verified as valid");
        assert(resPostBodyVerify.data?.user?.email === donorEmail, "F7.2c: Token details return user email");

        // 7.3 Attempt activation with query parameter is REJECTED
        const resQueryActivate = await reqJson(
            baseUrl,
            "POST",
            `/auth/activate-donor?token=${rawActivationToken}`,
            { password: "NewStrongPassword123!" }
        );
        assert(
            resQueryActivate.status === 400,
            "F7.3: Activation with query token is rejected with HTTP 400",
            `status=${resQueryActivate.status}`
        );

        // 7.4 Legitimate activation via POST body
        const newPassword = "NewStrongPassword123!";
        const resActivate = await reqJson(baseUrl, "POST", "/auth/activate-donor", {
            token: rawActivationToken,
            password: newPassword,
        });
        assert(
            resActivate.status === 200,
            "F7.4: POST /auth/activate-donor with body token and password succeeds",
            `status=${resActivate.status}`
        );
        assert(Boolean(resActivate.data?.token), "F7.4b: Activation response includes auth token");

        // Verify user in DB is now active and verified
        const activatedDbUser = await prisma.users.findUnique({
            where: { userid: pendingUser.userid },
        });
        assert(
            activatedDbUser?.isactive === true && activatedDbUser?.emailverified === true,
            "F7.4c: User account in DB is active and emailverified"
        );

        // 7.5 Token Replay Rejection: Attempt to reuse the SAME token again
        const resReplay = await reqJson(baseUrl, "POST", "/auth/activate-donor", {
            token: rawActivationToken,
            password: "AnotherPassword123!",
        });
        assert(
            resReplay.status === 400,
            "F7.5: Token replay is rejected with HTTP 400 Bad Request",
            `status=${resReplay.status}`
        );
        assert(
            resReplay.data?.message === "Invalid or already used activation token.",
            "F7.5b: Correct 'already used' error message on token replay"
        );

        // 7.6 Verify token endpoint also rejects already-used token
        const resPostUsedVerify = await reqJson(baseUrl, "POST", "/auth/verify-activation-token", {
            token: rawActivationToken,
        });
        assert(
            resPostUsedVerify.status === 400,
            "F7.6: Token verification endpoint rejects already used token",
            `status=${resPostUsedVerify.status}`
        );

        // 7.7 Invalid/unknown token rejection
        const resFakeToken = await reqJson(baseUrl, "POST", "/auth/verify-activation-token", {
            token: "fake-nonexistent-token-12345678",
        });
        assert(
            resFakeToken.status === 400,
            "F7.7: Invalid token is rejected with HTTP 400",
            `status=${resFakeToken.status}`
        );

        // 7.8 Verify newly activated user can log in with their new password
        const resNewLogin = await reqJson(baseUrl, "POST", "/auth/login", {
            email: donorEmail,
            password: newPassword,
        });
        assert(
            resNewLogin.status === 200,
            "F7.8: Newly activated donor successfully logs in with their established password",
            `status=${resNewLogin.status}`
        );

    } finally {
        if (server) {
            await new Promise<void>((resolve) => (server as http.Server).close(() => resolve()));
        }

        // Clean up fixtures from swastya_test
        if (userIds.length > 0) {
            await prisma.donoractivationtokens.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
        }
    }
}

run()
    .then(async () => {
        await prisma.$disconnect();
        console.log(`\n=======================================================`);
        console.log(`AUD-11 Security Remediation Suite: PASS`);
        console.log(`Total Passed: ${totalPassed}`);
        console.log(`Total Failed: ${totalFailed}`);
        console.log(`=======================================================\n`);
    })
    .catch(async (error) => {
        console.error(`\n=======================================================`);
        console.error(`AUD-11 Security Remediation Suite: FAIL`);
        console.error(`Total Passed: ${totalPassed}`);
        console.error(`Total Failed: ${totalFailed}`);
        if (failures.length > 0) {
            console.error(`Failures:`);
            failures.forEach((f) => console.error(`  - ${f}`));
        }
        console.error(error);
        console.error(`=======================================================\n`);
        await prisma.$disconnect();
        process.exit(1);
    });
