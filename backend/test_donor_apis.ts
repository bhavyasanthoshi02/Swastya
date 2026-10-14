import "dotenv/config";
import assert from "node:assert";
import http from "node:http";
import app from "./src/app";
import { prisma } from "./src/config/prisma";
import { generateToken } from "./src/utils/jwt";

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

async function runLiveTests() {
    console.log("=== SWASTYA STEP 2.2B: LIVE DATABASE & DONOR APIS TEST SUITE ===\n");

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    console.log(`Test server running on port ${port}`);

    // Retrieve the real test donor from the actual PostgreSQL database
    const realDonor = await prisma.donors.findFirst({
        where: {
            bloodgroup: "O_NEGATIVE",
        },
        include: {
            users: true,
        },
    });

    assert.ok(realDonor, "Pre-condition failed: Real O_NEGATIVE donor record must exist in DB");
    console.log(`Using real donor from DB: ID ${realDonor.donorid}, Blood Group: ${realDonor.bloodgroup}, User: ${realDonor.users.name} (${realDonor.users.email})`);

    // Another donor for cross-donor authorization check
    const otherDonor = await prisma.donors.findFirst({
        where: {
            donorid: { not: realDonor.donorid },
        },
    });
    assert.ok(otherDonor, "Pre-condition failed: At least two donor records must exist in DB");

    const donorToken = generateToken(realDonor.userid, realDonor.users.role);
    const otherDonorToken = generateToken(otherDonor.userid, "DONOR");

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

    // 1. GET /donors/me
    await test("1. GET /donors/me returns real donor profile and computed eligibility", async () => {
        const res = await makeRequest(server, {
            path: "/donors/me",
            method: "GET",
            headers: {
                Authorization: `Bearer ${donorToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.donor.donorid, realDonor.donorid);
        assert.strictEqual(res.body.donor.bloodgroup, "O_NEGATIVE");
        assert.strictEqual(res.body.eligibility.isEligible, true);
        assert.strictEqual(res.body.eligibility.status, "Eligible");
    });

    // 2. GET /donors/me/dashboard
    await test("2. GET /donors/me/dashboard returns full dashboard stats, matches, and activities", async () => {
        const res = await makeRequest(server, {
            path: "/donors/me/dashboard",
            method: "GET",
            headers: {
                Authorization: `Bearer ${donorToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.stats !== undefined);
        assert.ok(typeof res.body.stats.totalDonations === "number");
        assert.ok(typeof res.body.stats.activeMatchesCount === "number");
        assert.ok(Array.isArray(res.body.matchingRequests));
        assert.ok(Array.isArray(res.body.recentActivities));
        // O- donor should match the active O+ request in the DB
        assert.ok(res.body.stats.activeMatchesCount >= 1, "O_NEGATIVE donor must match active blood requests");
    });

    // 3. GET /donors/me/matching-requests
    await test("3. GET /donors/me/matching-requests matches blood requests by transfusion compatibility", async () => {
        const res = await makeRequest(server, {
            path: "/donors/me/matching-requests",
            method: "GET",
            headers: {
                Authorization: `Bearer ${donorToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.donorBloodGroup, "O_NEGATIVE");
        assert.ok(res.body.total >= 1);
        const match = res.body.requests[0];
        assert.ok(match.requestid);
        assert.strictEqual(match.bloodgroup, "O_POSITIVE"); // O- donor matches O+ patient!
    });

    // 4. GET /donors/me/history
    await test("4. GET /donors/me/history returns real donation history without fabrication", async () => {
        const res = await makeRequest(server, {
            path: "/donors/me/history",
            method: "GET",
            headers: {
                Authorization: `Bearer ${donorToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(Array.isArray(res.body.history));
        assert.strictEqual(res.body.stats.totalDonations, 0); // Real DB has 0 history, accurately returned!
    });

    // 5. GET /donors/me/last-donation
    await test("5. GET /donors/me/last-donation returns null when no prior donations exist", async () => {
        const res = await makeRequest(server, {
            path: "/donors/me/last-donation",
            method: "GET",
            headers: {
                Authorization: `Bearer ${donorToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.lastDonation, null);
    });

    // 6. PATCH /donors/me/availability
    await test("6. PATCH /donors/me/availability updates availability status in PostgreSQL", async () => {
        // Toggle to TEMPORARILY_UNAVAILABLE
        const res1 = await makeRequest(server, {
            path: "/donors/me/availability",
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${donorToken}`,
                "Content-Type": "application/json",
            },
            body: { availabilitystatus: "TEMPORARILY_UNAVAILABLE" },
        });
        assert.strictEqual(res1.statusCode, 200);
        assert.strictEqual(res1.body.availabilitystatus, "TEMPORARILY_UNAVAILABLE");

        // Verify in DB
        const inDb = await prisma.donors.findUnique({ where: { donorid: realDonor.donorid } });
        assert.strictEqual(inDb?.availabilitystatus, "TEMPORARILY_UNAVAILABLE");

        // Restore back to AVAILABLE
        const res2 = await makeRequest(server, {
            path: "/donors/me/availability",
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${donorToken}`,
                "Content-Type": "application/json",
            },
            body: { availabilitystatus: "AVAILABLE" },
        });
        assert.strictEqual(res2.statusCode, 200);
        assert.strictEqual(res2.body.availabilitystatus, "AVAILABLE");
    });

    // 7. GET /notifications
    await test("7. GET /notifications retrieves real user notifications with unread counter", async () => {
        // Find user with notification in DB
        const notif = await prisma.notification.findFirst();
        assert.ok(notif, "Notification must exist in DB");

        const notifUserToken = generateToken(notif.userid, "REQUESTER");
        const res = await makeRequest(server, {
            path: "/notifications",
            method: "GET",
            headers: {
                Authorization: `Bearer ${notifUserToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.notifications.length >= 1);
        assert.strictEqual(res.body.notifications[0].notificationid, notif.notificationid);
    });

    // 8. Cross-donor ownership protection
    await test("8. Cross-donor access blocked: Donor A cannot view or modify Donor B's private data", async () => {
        // Donor A tries to access Donor B's dashboard by ID
        const res = await makeRequest(server, {
            path: `/donors/${otherDonor.donorid}/dashboard`,
            method: "GET",
            headers: {
                Authorization: `Bearer ${donorToken}`, // token of Donor A
            },
        });
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.message, "Access denied");

        // Donor A tries to update Donor B's profile
        const updateRes = await makeRequest(server, {
            path: `/donors/${otherDonor.donorid}`,
            method: "PUT",
            headers: {
                Authorization: `Bearer ${donorToken}`,
                "Content-Type": "application/json",
            },
            body: { city: "Hacked City" },
        });
        assert.strictEqual(updateRes.statusCode, 403);
        assert.strictEqual(updateRes.body.message, "Access denied");
    });

    // 9. POST /bloodrequests/:id/respond
    await test("9. POST /bloodrequests/:id/respond creates coordination notification for request owner", async () => {
        const reqRecord = await prisma.bloodrequests.findFirst();
        assert.ok(reqRecord, "Blood request must exist in DB");

        // Clean up any previous test run response for idempotency
        await prisma.notification.deleteMany({
            where: {
                requestid: reqRecord.requestid,
                userid: realDonor.userid,
            },
        });

        const res = await makeRequest(server, {
            path: `/bloodrequests/${reqRecord.requestid}/respond`,
            method: "POST",
            headers: {
                Authorization: `Bearer ${donorToken}`,
            },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.requestId, reqRecord.requestid);

        // Verify notification was created in DB for request creator
        const createdNotif = await prisma.notification.findFirst({
            where: {
                requestid: reqRecord.requestid,
                type: "MATCH",
            },
            orderBy: { sentat: "desc" },
        });
        assert.ok(createdNotif);
        assert.strictEqual(createdNotif.userid, reqRecord.createdbyuserid);
    });

    server.close();
    await prisma.$disconnect();

    console.log(`\n=== LIVE TEST RESULTS: ${passed} PASSED, ${failed} FAILED ===`);

    if (failed > 0) {
        process.exit(1);
    }
}

runLiveTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
