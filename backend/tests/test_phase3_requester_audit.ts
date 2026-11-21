import http from "http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";

let server: http.Server;
let API_BASE = "";

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

async function runAuditTests() {
    console.log("=== SWASTYA PHASE 3.0: REQUESTER PORTAL INTEGRATION AUDIT VERIFICATION ===");

    // Explicit database-name guard requiring swastya_test before any test writes
    const dbUrl = process.env.DATABASE_URL || "";
    let parsedDbName = "";
    try {
        parsedDbName = new URL(dbUrl).pathname.replace(/^\//, "");
    } catch {}
    if (parsedDbName !== "swastya_test") {
        throw new Error(`SAFETY ABORT: DATABASE_URL must target swastya_test, got '${parsedDbName || "unset"}'`);
    }
    const dbRows: Array<{ db: string }> = await prisma.$queryRawUnsafe(`SELECT current_database() AS db`);
    if (!dbRows?.[0] || dbRows[0].db !== "swastya_test") {
        throw new Error(`SAFETY ABORT: Connected database is '${dbRows?.[0]?.db}', expected 'swastya_test'`);
    }

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, () => {
            const addr = server.address() as any;
            API_BASE = `http://127.0.0.1:${addr.port}`;
            resolve();
        });
    });

    const timestamp = Date.now();
    const emailA = `audit_req_a_${timestamp}@example.com`;
    const emailB = `audit_req_b_${timestamp}@example.com`;

    let userA: any = null;
    let userB: any = null;
    let adminUser: any = null;
    let tokenA = "";
    let tokenB = "";
    let adminToken = "";
    let bloodRequestA: any = null;

    try {
        // 1. Setup: Create Requester A and Requester B accounts
        userA = await prisma.users.create({
            data: {
                name: "Audit Requester Alpha",
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
                name: "Audit Requester Beta",
                email: emailB,
                phonenumber: "9876543210",
                password: "hashedpassword123",
                role: "REQUESTER",
                isactive: true,
                emailverified: true,
            },
        });
        tokenB = generateToken(userB.userid, "REQUESTER");

        adminUser = await prisma.users.create({
            data: {
                name: "Audit Admin",
                email: `audit_admin_${timestamp}@example.com`,
                phonenumber: "9123456799",
                password: "hashedpassword123",
                role: "ADMIN",
                isactive: true,
                emailverified: true,
            },
        });
        adminToken = generateToken(adminUser.userid, "ADMIN");

        assert(Boolean(userA.userid && userB.userid), "1. Setup: Created Requester A & B disposable test accounts");

        // 2. Clinical Integrity: Reject required-by date in the past (with mandatory prescription upload)
        const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
        const pastForm = new FormData();
        pastForm.append("patientname", "Past Date Patient");
        pastForm.append("patientage", "45");
        pastForm.append("patientgender", "MALE");
        pastForm.append("patientcontact", "9123456780");
        pastForm.append("bloodgroup", "O_POSITIVE");
        pastForm.append("bloodcomponent", "WHOLE_BLOOD");
        pastForm.append("unitsrequired", "2");
        pastForm.append("urgencylevel", "HIGH");
        pastForm.append("requiredby", pastDate);
        pastForm.append(
            "prescription",
            new Blob([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")], { type: "application/pdf" }),
            "past-rx.pdf"
        );
        const pastDateRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenA}`,
            },
            body: pastForm,
        });
        assert(pastDateRes.status === 400, "2. Clinical Integrity: Rejects required-by date in the past with 400");

        // 3. Creation & Transaction: Create valid blood request (with mandatory prescription upload) and verify atomic CREATED history
        const futureDate = new Date(Date.now() + 86400000).toISOString(); // 24 hours ahead
        const createForm = new FormData();
        createForm.append("patientname", "Audit Test Patient");
        createForm.append("patientage", "50");
        createForm.append("patientgender", "FEMALE");
        createForm.append("patientcontact", "9123456780");
        createForm.append("bloodgroup", "B_POSITIVE");
        createForm.append("bloodcomponent", "WHOLE_BLOOD");
        createForm.append("unitsrequired", "3");
        createForm.append("urgencylevel", "CRITICAL");
        createForm.append("isemergency", "true");
        createForm.append("requiredby", futureDate);
        createForm.append("notes", "Phase 3 audit test");
        createForm.append(
            "prescription",
            new Blob([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")], { type: "application/pdf" }),
            "audit-rx.pdf"
        );
        const createRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenA}`,
            },
            body: createForm,
        });
        bloodRequestA = await createRes.json();
        assert(createRes.status === 201 && bloodRequestA.requestid, "3. Creation: Blood request created with 201 Created");

        // Verify initial CREATED history logged atomically
        const historyCheck = await prisma.requeststatushistory.findMany({
            where: { requestid: bloodRequestA.requestid },
        });
        assert(historyCheck.length === 1 && historyCheck[0].newstatus === "CREATED", "4. Transaction Atomicity: Initial CREATED history logged atomically");

        // 5. Security & Status Integrity: Requester cannot self-fulfill request (403)
        const fulfillAttempt = await fetch(`${API_BASE}/bloodrequests/${bloodRequestA.requestid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(fulfillAttempt.status === 403, "5. Security: Requester blocked from performing unauthorized status transition to FULFILLED (403)");

        // 6. Security & Status Integrity: Requester cannot transition to arbitrary invalid status (400)
        const invalidStatusAttempt = await fetch(`${API_BASE}/bloodrequests/${bloodRequestA.requestid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "NONEXISTENT_STATUS" }),
        });
        assert(invalidStatusAttempt.status === 400, "6. Validation: Invalid status enum rejected with 400");

        // 7. Security: Cross-Tenant Protection — Requester B cannot update Requester A's request (403)
        const crossTenantPut = await fetch(`${API_BASE}/bloodrequests/${bloodRequestA.requestid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenB}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "CANCELLED" }),
        });
        assert(crossTenantPut.status === 403, "7. Security: Cross-tenant update blocked with 403 Forbidden");

        // 8. Legitimate Cancellation: Requester A cancels request with remarks
        const cancelRes = await fetch(`${API_BASE}/bloodrequests/${bloodRequestA.requestid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                status: "CANCELLED",
                remarks: "Cancelled due to patient transfer",
            }),
        });
        const cancelData = await cancelRes.json();
        assert(cancelRes.status === 200 && cancelData.status === "CANCELLED", "8. Legitimate Operation: Owner cancels active request with 200 OK");

        // Verify status transition history logged
        const updatedHistory = await prisma.requeststatushistory.findMany({
            where: { requestid: bloodRequestA.requestid },
            orderBy: { changedat: "asc" },
        });
        assert(
            updatedHistory.length === 2 &&
            updatedHistory[1].oldstatus === "CREATED" &&
            updatedHistory[1].newstatus === "CANCELLED" &&
            updatedHistory[1].remarks === "Cancelled due to patient transfer",
            "9. History Audit: CANCELLED transition with remarks recorded in requeststatushistory"
        );

        // 10. Re-cancellation Protection: Cannot cancel an already cancelled request (400)
        const repeatCancelRes = await fetch(`${API_BASE}/bloodrequests/${bloodRequestA.requestid}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${tokenA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "CANCELLED" }),
        });
        assert(repeatCancelRes.status === 400, "10. State Machine: Cannot re-cancel already cancelled request (400)");

        // 11. Error Handling: Malformed UUID on all parameterized blood request routes returns 404
        const malformedGet = await fetch(`${API_BASE}/bloodrequests/invalid-uuid`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const malformedPut = await fetch(`${API_BASE}/bloodrequests/invalid-uuid`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
            body: JSON.stringify({ notes: "test" }),
        });
        const malformedDel = await fetch(`${API_BASE}/bloodrequests/invalid-uuid`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const malformedRespond = await fetch(`${API_BASE}/bloodrequests/invalid-uuid/respond`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert(
            malformedGet.status === 404 &&
            malformedPut.status === 404 &&
            malformedDel.status === 404 &&
            malformedRespond.status === 404,
            "11. Robustness: Malformed UUID on GET/PUT/DELETE/respond cleanly returns 404 (not 500)"
        );

        // 12. Privacy Audit: GET /bloodrequests requires authentication (401) and never leaks password hash
        const unauthListRes = await fetch(`${API_BASE}/bloodrequests`);
        const listRes = await fetch(`${API_BASE}/bloodrequests`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const listData = await listRes.json();
        assert(
            unauthListRes.status === 401 &&
            listRes.status === 200 &&
            Array.isArray(listData) &&
            listData.every((r: any) => r.users?.password === undefined),
            "12. Privacy Audit: GET /bloodrequests requires auth (401) and never exposes bcrypt password hashes"
        );

        // 13. Privacy Audit: GET /requesters enforces ADMIN auth (401 unauth, 403 requester, 200 admin) and never leaks password hash
        const unauthReqListRes = await fetch(`${API_BASE}/requesters`);
        const requesterRoleListRes = await fetch(`${API_BASE}/requesters`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const reqListRes = await fetch(`${API_BASE}/requesters`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const reqListData = await reqListRes.json();
        assert(
            unauthReqListRes.status === 401 &&
            requesterRoleListRes.status === 403 &&
            reqListRes.status === 200 &&
            Array.isArray(reqListData) &&
            reqListData.every((r: any) => r.users?.password === undefined),
            "13. Privacy Audit: GET /requesters enforces ADMIN auth (401/403) and never exposes bcrypt password hashes"
        );

        // 14. Security: GET /requesters/:id requires authentication and ownership
        const unauthReqDetail = await fetch(`${API_BASE}/requesters/some-id`);
        assert(unauthReqDetail.status === 401, "14. Security: GET /requesters/:id requires authentication (returns 401)");

    } finally {
        // Teardown: Clean up test accounts and test requests
        try {
            if (bloodRequestA?.requestid) {
                await prisma.notification.deleteMany({ where: { requestid: bloodRequestA.requestid } });
                await prisma.prescription.deleteMany({ where: { requestid: bloodRequestA.requestid } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: bloodRequestA.requestid } });
                await prisma.bloodrequests.delete({ where: { requestid: bloodRequestA.requestid } });
            }
            if (userA?.userid) {
                await prisma.notification.deleteMany({ where: { userid: userA.userid } });
                await prisma.requesters.deleteMany({ where: { userid: userA.userid } });
                await prisma.users.delete({ where: { userid: userA.userid } });
            }
            if (userB?.userid) {
                await prisma.notification.deleteMany({ where: { userid: userB.userid } });
                await prisma.requesters.deleteMany({ where: { userid: userB.userid } });
                await prisma.users.delete({ where: { userid: userB.userid } });
            }
            if (adminUser?.userid) {
                await prisma.users.delete({ where: { userid: adminUser.userid } });
            }
            console.log("[TEARDOWN] Phase 3 audit test records cleaned up successfully.");
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }
        await prisma.$disconnect();
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    }

    console.log("\n=================================================================");
    console.log(`PHASE 3.0 AUDIT TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log("=================================================================\n");
}

runAuditTests().catch((err) => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
});
