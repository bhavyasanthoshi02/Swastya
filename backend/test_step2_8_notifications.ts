import { prisma } from "./src/config/prisma";
import { generateToken } from "./src/utils/jwt";

const API_BASE = "http://localhost:5000";

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

async function runStep28Tests() {
    console.log("=== SWASTYA STEP 2.8: REQUESTER NOTIFICATIONS VERIFICATION ===");

    const timestamp = Date.now();
    const emailA = `requester_notif_a_${timestamp}@example.com`;
    const emailB = `requester_notif_b_${timestamp}@example.com`;

    let userA: any = null;
    let userB: any = null;
    let tokenA = "";
    let tokenB = "";
    let bloodRequest: any = null;
    let notifA1: any = null;
    let notifA2: any = null;

    try {
        // 1. Setup: Create Requester A and Requester B in DB
        userA = await prisma.users.create({
            data: {
                name: "Requester Alpha Notifications",
                email: emailA,
                password: "hashedpassword123",
                role: "REQUESTER",
                isactive: true,
                emailverified: true,
            },
        });
        tokenA = generateToken(userA.userid, "REQUESTER");

        userB = await prisma.users.create({
            data: {
                name: "Requester Beta Notifications",
                email: emailB,
                password: "hashedpassword123",
                role: "REQUESTER",
                isactive: true,
                emailverified: true,
            },
        });
        tokenB = generateToken(userB.userid, "REQUESTER");

        assert(Boolean(userA.userid && userB.userid), "1. Setup: Created Requester A and Requester B test users");

        // 2. Setup: Create Blood Request under Requester A
        bloodRequest = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: userA.userid,
                patientname: "Test Patient Notif",
                patientage: 38,
                patientgender: "FEMALE",
                patientcontact: "9876543210",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 86400000),
                status: "CREATED",
            },
        });

        assert(Boolean(bloodRequest.requestid), "2. Setup: Created Blood Request for Requester A");

        // 3. Setup: Create 2 genuine notifications for Requester A
        notifA1 = await prisma.notification.create({
            data: {
                userid: userA.userid,
                requestid: bloodRequest.requestid,
                type: "MATCH",
                title: "Donor Volunteered for Blood Request",
                message: "Dr. Suresh (A+) has volunteered to donate for patient Test Patient Notif.",
                isread: false,
            },
        });

        notifA2 = await prisma.notification.create({
            data: {
                userid: userA.userid,
                requestid: bloodRequest.requestid,
                type: "REQUEST",
                title: "Requisition Registered",
                message: "Your blood requisition REQ-" + bloodRequest.requestid.slice(0, 8).toUpperCase() + " has been broadcast.",
                isread: false,
            },
        });

        assert(Boolean(notifA1.notificationid && notifA2.notificationid), "3. Setup: Created genuine test notifications for Requester A");

        // 4. Security: Unauthenticated GET /notifications returns 401
        const unauthRes = await fetch(`${API_BASE}/notifications`);
        assert(unauthRes.status === 401, "4. Security: Unauthenticated GET /notifications returns 401");

        // 5. Isolation: Requester B gets 0 notifications
        const resB = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${tokenB}` },
        });
        const dataB = await resB.json();
        assert(resB.status === 200 && dataB.total === 0 && dataB.unreadCount === 0 && dataB.notifications.length === 0,
            "5. Isolation: Requester B cannot see Requester A's notifications (returns 0 records)"
        );

        // 6. Cross-Tenant Protection: Requester B cannot mark Requester A's notification as read (403)
        const crossReadRes = await fetch(`${API_BASE}/notifications/${notifA1.notificationid}/read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${tokenB}` },
        });
        assert(crossReadRes.status === 403, "6. Security: Cross-tenant PATCH /notifications/:id/read returns 403 Forbidden");

        // 7. Cross-Tenant Protection: Requester B cannot delete Requester A's notification (403)
        const crossDelRes = await fetch(`${API_BASE}/notifications/${notifA1.notificationid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenB}` },
        });
        assert(crossDelRes.status === 403, "7. Security: Cross-tenant DELETE /notifications/:id returns 403 Forbidden");

        // 8. Error Handling: Invalid UUID format returns 404 (not 500)
        const invalidUuidRes = await fetch(`${API_BASE}/notifications/invalid-uuid/read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert(invalidUuidRes.status === 404, "8. Error Handling: Invalid UUID in /notifications/:id/read returns 404 Not Found");

        // 9. Retrieval: Requester A retrieves notifications with unreadCount = 2 and linked blood request
        const resA = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const dataA = await resA.json();
        assert(
            resA.status === 200 &&
            dataA.success === true &&
            dataA.total === 2 &&
            dataA.unreadCount === 2 &&
            dataA.notifications.length === 2 &&
            dataA.notifications[0].bloodrequests !== undefined,
            "9. Retrieval: Requester A retrieves 2 notifications with correct unreadCount and bloodrequest relation"
        );

        // 10. Functionality: Mark individual notification as read
        const markRes = await fetch(`${API_BASE}/notifications/${notifA1.notificationid}/read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const markData = await markRes.json();
        assert(
            markRes.status === 200 &&
            markData.success === true &&
            markData.notification.isread === true,
            "10. Functionality: Requester A marks notification as read (returns 200 & isread=true)"
        );

        // 11. Filtering: unreadOnly=true returns only 1 notification now
        const unreadRes = await fetch(`${API_BASE}/notifications?unreadOnly=true`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const unreadData = await unreadRes.json();
        assert(
            unreadRes.status === 200 &&
            unreadData.notifications.length === 1 &&
            unreadData.unreadCount === 1,
            "11. Filtering: GET /notifications?unreadOnly=true correctly returns 1 unread notification"
        );

        // 12. Functionality: Mark all as read
        const markAllRes = await fetch(`${API_BASE}/notifications/mark-all-read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const markAllData = await markAllRes.json();
        assert(
            markAllRes.status === 200 &&
            markAllData.success === true &&
            markAllData.updatedCount === 1,
            "12. Functionality: PATCH /notifications/mark-all-read updates remaining unread notifications"
        );

        // Verify unreadCount is now 0
        const finalRes = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        const finalData = await finalRes.json();
        assert(
            finalRes.status === 200 &&
            finalData.unreadCount === 0 &&
            finalData.notifications.every((n: any) => n.isread === true),
            "13. Verification: unreadCount is 0 after mark-all-read and all items have isread=true"
        );

    } finally {
        // Teardown: Clean up test artifacts cleanly
        try {
            if (userA?.userid) {
                await prisma.notification.deleteMany({ where: { userid: userA.userid } });
            }
            if (userB?.userid) {
                await prisma.notification.deleteMany({ where: { userid: userB.userid } });
            }
            if (bloodRequest?.requestid) {
                await prisma.requeststatushistory.deleteMany({ where: { requestid: bloodRequest.requestid } });
                await prisma.bloodrequests.delete({ where: { requestid: bloodRequest.requestid } });
            }
            if (userA?.userid) {
                await prisma.users.delete({ where: { userid: userA.userid } });
            }
            if (userB?.userid) {
                await prisma.users.delete({ where: { userid: userB.userid } });
            }
            console.log("[TEARDOWN] Test records cleaned up successfully.");
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }
    }

    console.log("\n=================================================================");
    console.log(`STEP 2.8 TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
    console.log("=================================================================\n");
}

runStep28Tests().catch((err) => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
});
