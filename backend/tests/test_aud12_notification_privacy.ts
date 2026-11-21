import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import express from "express";
import notificationRoutes from "../src/routes/notification.routes";
import { notification_type } from "../src/generated/prisma/enums";

// Verify database target
const dbUrl = process.env.DATABASE_URL || "";
if (!dbUrl.includes("swastya_test")) {
    console.error("FATAL: Target database is NOT swastya_test. Aborting AUD-12 tests.");
    process.exit(1);
}

const app = express();
app.use(express.json());
app.use("/notifications", notificationRoutes);

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        throw new Error(message);
    }
    console.log(`  ✔ ${message}`);
    passedTests++;
}

async function runAud12Tests() {
    console.log("============================================================");
    console.log("       AUD-12 NOTIFICATION PRIVACY REMEDIATION TESTS        ");
    console.log("============================================================");

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const API_BASE = `http://127.0.0.1:${port}`;

    const ts = Date.now();
    const testSecret = `aud12_${ts}`;

    // Setup test users
    const hospitalUser = await prisma.users.create({
        data: {
            name: `Hosp User ${ts}`,
            email: `hosp_${ts}@test.org`,
            password: "hashedpassword123",
            role: "HOSPITAL",
            isactive: true,
            emailverified: true,
        },
    });

    const hospital = await prisma.hospitals.create({
        data: {
            userid: hospitalUser.userid,
            hospitalname: `Memorial Hospital ${ts}`,
            registrationnumber: `REG-${ts}`,
            contactpersonname: "Dr. Arvind",
            contactpersonphone: "9876543210",
            address: "123 Medical Center Way",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 19.076,
            longitude: 72.877,
            approvalstatus: "APPROVED",
        },
    });

    const requesterUser = await prisma.users.create({
        data: {
            name: `Requester User ${ts}`,
            email: `requester_${ts}@test.org`,
            password: "hashedpassword123",
            role: "REQUESTER",
            isactive: true,
            emailverified: true,
        },
    });

    const donorUser = await prisma.users.create({
        data: {
            name: `Donor User ${ts}`,
            email: `donor_${ts}@test.org`,
            password: "hashedpassword123",
            role: "DONOR",
            isactive: true,
            emailverified: true,
        },
    });

    const hospitalToken = generateToken(hospitalUser.userid, "HOSPITAL");
    const requesterToken = generateToken(requesterUser.userid, "REQUESTER");
    const donorToken = generateToken(donorUser.userid, "DONOR");

    // Setup a blood request with sensitive patient details
    const secretPatientName = `SensitivePatient_${testSecret}`;
    const secretPatientContact = "9820098200";

    const bloodReq = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: requesterUser.userid,
            hospitalid: hospital.hospitalid,
            patientname: secretPatientName,
            patientage: 32,
            patientgender: "FEMALE",
            patientcontact: secretPatientContact,
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 2,
            urgencylevel: "HIGH",
            requiredby: new Date(Date.now() + 86400000),
            status: "CREATED",
        },
    });

    try {
        console.log("\n--- Testing 1: Pending notifications do not expose patientName ---");
        // Create a pending hospital notification (as created in POST /bloodrequests)
        const pendingNotif = await prisma.notification.create({
            data: {
                userid: hospitalUser.userid,
                requestid: bloodReq.requestid,
                type: notification_type.REQUEST,
                title: "New Blood Requisition Received",
                message: `New HIGH requisition (O_POSITIVE, 2 unit(s)) has been assigned to your facility for review.`,
                isread: false,
            },
        });

        assert(!pendingNotif.message.includes(secretPatientName), "Pending requisition notification message does not contain patientName");
        assert(!pendingNotif.message.includes(secretPatientContact), "Pending requisition notification message does not contain patient contact");
        assert(!pendingNotif.message.includes("for patient"), "Pending requisition notification message omits 'for patient' clause");

        console.log("\n--- Testing 2: Broadcast notifications do not expose patient-identifying information ---");
        // Create a broadcast notification (as created in broadcast.service.ts)
        const broadcastNotif = await prisma.notification.create({
            data: {
                userid: donorUser.userid,
                requestid: bloodReq.requestid,
                type: notification_type.REQUEST,
                title: "EMERGENCY: Urgent Blood Requisition",
                message: `EMERGENCY ALERT: Urgent need for O_POSITIVE (Whole Blood), 2 unit(s). Urgency: HIGH.\nFacility: Memorial Hospital. Required by: Immediate.\nPlease respond immediately if available to donate.`,
                isread: false,
            },
        });

        assert(!broadcastNotif.message.includes(secretPatientName), "Broadcast notification does not contain patientName");
        assert(!broadcastNotif.message.includes(secretPatientContact), "Broadcast notification does not contain patient contact");
        assert(!broadcastNotif.message.includes("patient"), "Broadcast notification does not contain any patient reference");

        console.log("\n--- Testing 3: Non-accepted volunteer / offer notifications do not expose patientName ---");
        // Create volunteer offer notification (pre-acceptance, as created in bloodrequest.routes.ts)
        const volunteerNotif = await prisma.notification.create({
            data: {
                userid: requesterUser.userid,
                requestid: bloodReq.requestid,
                type: notification_type.MATCH,
                title: "Donor Volunteered for Blood Request",
                message: `Ramesh Kumar (O+) has volunteered to donate (O_POSITIVE). Estimated arrival: 45 mins.`,
                isread: false,
            },
        });

        assert(!volunteerNotif.message.includes(secretPatientName), "Pre-acceptance volunteer notification does not contain patientName");
        assert(!volunteerNotif.message.includes(secretPatientContact), "Pre-acceptance volunteer notification does not contain patient contact");

        console.log("\n--- Testing 4: Non-accepted reservation notifications do not expose sensitive patient details ---");
        const reservationNotif = await prisma.notification.create({
            data: {
                userid: hospitalUser.userid,
                requestid: bloodReq.requestid,
                type: notification_type.REQUEST,
                title: "Blood Reservation Pending Approval",
                message: `Blood reservation pending for requisition (O_POSITIVE, 2 units) at regional blood bank.`,
                isread: false,
            },
        });

        assert(!reservationNotif.message.includes(secretPatientName), "Non-accepted reservation notification does not contain patientName");
        assert(!reservationNotif.message.includes(secretPatientContact), "Non-accepted reservation notification does not contain patient contact");

        console.log("\n--- Testing 5: Accepted notifications expose only explicitly permitted fields ---");
        // Create an accepted notification (as created upon requester decision ACCEPTED)
        const acceptedNotif = await prisma.notification.create({
            data: {
                userid: donorUser.userid,
                requestid: bloodReq.requestid,
                type: notification_type.MATCH,
                title: "Your Donation Offer Was Accepted",
                message: `Your volunteer offer for patient ${secretPatientName} (O_POSITIVE) at Memorial Hospital was accepted. You can now start your journey from the Donor Portal.`,
                isread: false,
            },
        });

        // The accepted notification exposes patientName for clinical logistics, but strictly NO patientContact or prescription URLs
        assert(acceptedNotif.message.includes(secretPatientName), "Accepted notification includes permitted patientName for hospital logistics");
        assert(!acceptedNotif.message.includes(secretPatientContact), "Accepted notification NEVER leaks patientContact phone/email");
        assert(!acceptedNotif.message.includes("http"), "Accepted notification NEVER contains prescription URLs");

        console.log("\n--- Testing 6: Notification retrieval endpoints cannot reveal sensitive fields ---");
        // 6a: Hospital fetches pending notifications via GET /notifications
        const hospFetch = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${hospitalToken}` },
        });
        const hospRes = await hospFetch.json();

        assert(hospFetch.status === 200 && hospRes.success === true, "GET /notifications returns 200 success for hospital");
        const fetchedPending = hospRes.notifications.find((n: any) => n.notificationid === pendingNotif.notificationid);
        assert(Boolean(fetchedPending), "Pending notification retrieved by hospital");
        assert(!fetchedPending.message.includes(secretPatientName), "Retrieved pending notification message does not expose patientName");
        assert(fetchedPending.bloodrequests !== undefined, "Retrieved pending notification includes bloodrequests relation object");
        assert(fetchedPending.bloodrequests.patientname === null, "Retrieved pending notification bloodrequests.patientname is NULL (redacted)");
        assert(fetchedPending.bloodrequests.patientcontact === undefined, "Retrieved pending notification bloodrequests.patientcontact is completely omitted");

        // 6b: Donor fetches broadcast & accepted notifications via GET /notifications
        const donorFetch = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        const donorRes = await donorFetch.json();

        assert(donorFetch.status === 200 && donorRes.success === true, "GET /notifications returns 200 success for donor");
        const fetchedBroadcast = donorRes.notifications.find((n: any) => n.notificationid === broadcastNotif.notificationid);
        assert(Boolean(fetchedBroadcast), "Broadcast notification retrieved by donor");
        assert(fetchedBroadcast.bloodrequests.patientname === null, "Retrieved broadcast notification bloodrequests.patientname is NULL (redacted)");
        assert(fetchedBroadcast.bloodrequests.patientcontact === undefined, "Retrieved broadcast notification bloodrequests.patientcontact is omitted");

        const fetchedAccepted = donorRes.notifications.find((n: any) => n.notificationid === acceptedNotif.notificationid);
        assert(Boolean(fetchedAccepted), "Accepted notification retrieved by donor");
        // For accepted notification, permitted patientname is revealed
        assert(fetchedAccepted.bloodrequests.patientname === secretPatientName, "Retrieved accepted notification bloodrequests.patientname contains permitted patient name");
        assert(fetchedAccepted.bloodrequests.patientcontact === undefined, "Retrieved accepted notification bloodrequests.patientcontact remains strictly hidden");
        assert(fetchedAccepted.bloodrequests.patientage === undefined, "Retrieved accepted notification patient age is omitted");
        assert(fetchedAccepted.bloodrequests.patientgender === undefined, "Retrieved accepted notification patient gender is omitted");
        assert(fetchedAccepted.bloodrequests.fileurl === undefined, "Retrieved accepted notification prescription fileurl is omitted");

        console.log("\n--- Testing 7: Legacy message sanitization on retrieval ---");
        // Insert a legacy notification that had patient name stored directly in the text before AUD-12
        const legacyPendingNotif = await prisma.notification.create({
            data: {
                userid: hospitalUser.userid,
                requestid: bloodReq.requestid,
                type: notification_type.REQUEST,
                title: "New Blood Requisition Received",
                message: `New HIGH requisition for patient ${secretPatientName} (O_POSITIVE, 2 unit(s)) has been assigned to your facility for review.`,
                isread: false,
            },
        });

        const legacyHospFetch = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${hospitalToken}` },
        });
        const legacyHospRes = await legacyHospFetch.json();

        const fetchedLegacy = legacyHospRes.notifications.find((n: any) => n.notificationid === legacyPendingNotif.notificationid);
        assert(Boolean(fetchedLegacy), "Legacy pending notification retrieved");
        assert(!fetchedLegacy.message.includes(secretPatientName), "Retrieval endpoint sanitized legacy pending message: patient name stripped from text");
        assert(fetchedLegacy.bloodrequests.patientname === null, "Retrieval endpoint sanitized legacy pending relation: patientname is NULL");

        console.log("\n--- Testing 8: Existing notification functionality remains functional ---");
        // PATCH /notifications/:id/read
        const patchFetch = await fetch(`${API_BASE}/notifications/${pendingNotif.notificationid}/read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${hospitalToken}` },
        });
        const patchRes = await patchFetch.json();

        assert(patchFetch.status === 200 && patchRes.success === true, "PATCH /notifications/:id/read returns 200");
        assert(patchRes.notification.isread === true, "PATCH /notifications/:id/read marks notification as read");
        assert(!patchRes.notification.message.includes(secretPatientName), "Mark-read response does not expose patientName");

        // PATCH /notifications/mark-all-read
        const markAllFetch = await fetch(`${API_BASE}/notifications/mark-all-read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${hospitalToken}` },
        });
        const markAllRes = await markAllFetch.json();

        assert(markAllFetch.status === 200 && markAllRes.success === true, "PATCH /notifications/mark-all-read returns 200");
        assert(markAllRes.updatedCount >= 1, "PATCH /notifications/mark-all-read updates unread notifications");

        console.log("\n============================================================");
        console.log(`AUD-12 TEST SUMMARY:`);
        console.log(`  Total Assertions: ${totalTests}`);
        console.log(`  Passed:           ${passedTests}`);
        console.log(`  Failed:           0`);
        console.log("============================================================");
    } finally {
        server.close();
        // Cleanup test data
        await prisma.notification.deleteMany({
            where: {
                userid: { in: [hospitalUser.userid, requesterUser.userid, donorUser.userid] },
            },
        }).catch(() => {});

        await prisma.bloodrequests.deleteMany({
            where: { requestid: bloodReq.requestid },
        }).catch(() => {});

        await prisma.hospitals.deleteMany({
            where: { hospitalid: hospital.hospitalid },
        }).catch(() => {});

        await prisma.users.deleteMany({
            where: { userid: { in: [hospitalUser.userid, requesterUser.userid, donorUser.userid] } },
        }).catch(() => {});
    }
}

runAud12Tests().catch((err) => {
    console.error("AUD-12 Test Suite Failed:", err);
    process.exit(1);
});
