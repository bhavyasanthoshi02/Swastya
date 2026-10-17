import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group } from "../src/generated/prisma/enums";
import app from "../src/app";
import http from "http";
import { triggerEmergencyBroadcast, getRequestBroadcastStatus } from "../src/services/broadcast.service";

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

async function postMultipart(endpoint: string, token: string, fields: Record<string, string>, file?: { name: string; buffer: Buffer; filename: string; type: string }) {
    const formData = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        formData.append(k, v);
    }
    if (file) {
        const blob = new Blob([file.buffer], { type: file.type });
        formData.append(file.name, blob, file.filename);
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    return { status: res.status, data: json, headers: res.headers };
}

async function postJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    return { status: res.status, data: json, headers: res.headers };
}

async function getJson(endpoint: string, token: string) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    return { status: res.status, data: json, headers: res.headers };
}

async function putJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    return { status: res.status, data: json, headers: res.headers };
}

async function patchJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    return { status: res.status, data: json, headers: res.headers };
}

async function runPhase3EmergencyBroadcastTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 3: EMERGENCY BLOOD BROADCAST SYSTEM TEST SUITE                 ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();
    const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Title (Emergency Prescription) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");

    // Start ephemeral server
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
            const port = (server.address() as any).port;
            API_BASE = `http://127.0.0.1:${port}`;
            console.log(`Ephemeral test server running at ${API_BASE}`);
            resolve();
        });
    });

    // 1. Setup Test Users
    // Hospital User
    const hospUser = await prisma.users.create({
        data: {
            name: `Test Hospital Phase3 ${timestamp}`,
            email: `hosp-phase3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "HOSPITAL"
        }
    });
    const hospital = await prisma.hospitals.create({
        data: {
            userid: hospUser.userid,
            hospitalname: `Trauma Medical Center Phase3 ${timestamp}`,
            registrationnumber: `REG-P3-${timestamp}`,
            contactpersonname: "Dr. Trauma Officer",
            contactpersonphone: "9876543210",
            address: "100 Medical Enclave",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9322,
            longitude: 72.8264,
            approvalstatus: "APPROVED"
        }
    });
    const hospitalToken = generateToken(hospUser.userid, "HOSPITAL");

    // Requester User
    const reqUser = await prisma.users.create({
        data: {
            name: `Requester Phase3 ${timestamp}`,
            email: `requester-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "REQUESTER"
        }
    });
    const requester = await prisma.requesters.create({
        data: {
            userid: reqUser.userid,
            address: "200 Marine Drive",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400020",
            latitude: 18.9438,
            longitude: 72.8232
        }
    });
    const requesterToken = generateToken(reqUser.userid, "REQUESTER");

    // Unrelated Requester User (for cross-user authorization tests)
    const otherReqUser = await prisma.users.create({
        data: {
            name: `Other Requester ${timestamp}`,
            email: `other-req-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "REQUESTER"
        }
    });
    const otherRequesterToken = generateToken(otherReqUser.userid, "REQUESTER");

    // Donor 1: Fully compatible (O- is universal donor for A-), Available, Cooldown passed, nearby Mumbai (~2 km from hospital)
    const donor1User = await prisma.users.create({
        data: {
            name: `Compatible Donor One ${timestamp}`,
            email: `donor1-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR"
        }
    });
    const donor1 = await prisma.donors.create({
        data: {
            userid: donor1User.userid,
            bloodgroup: blood_group.O_NEGATIVE,
            dateofbirth: new Date("1995-05-15"),
            gender: "MALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400002",
            latitude: 18.9400,
            longitude: 72.8300,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01") // > 90 days ago
        }
    });
    const donor1Token = generateToken(donor1User.userid, "DONOR");

    // Donor 2: Incompatible blood group (B+ cannot donate to A-)
    const donor2User = await prisma.users.create({
        data: {
            name: `Incompatible Donor Two ${timestamp}`,
            email: `donor2-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR"
        }
    });
    const donor2 = await prisma.donors.create({
        data: {
            userid: donor2User.userid,
            bloodgroup: blood_group.B_POSITIVE,
            dateofbirth: new Date("1996-03-20"),
            gender: "FEMALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9350,
            longitude: 72.8270,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01")
        }
    });

    // Donor 3: Compatible blood group (A-), but UNAVAILABLE
    const donor3User = await prisma.users.create({
        data: {
            name: `Unavailable Donor Three ${timestamp}`,
            email: `donor3-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR"
        }
    });
    const donor3 = await prisma.donors.create({
        data: {
            userid: donor3User.userid,
            bloodgroup: blood_group.A_NEGATIVE,
            dateofbirth: new Date("1992-08-10"),
            gender: "MALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9330,
            longitude: 72.8260,
            availabilitystatus: "TEMPORARILY_UNAVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01")
        }
    });

    // Donor 4: Compatible blood group (A-), but Active 90-day cooldown (donated 15 days ago)
    const donor4User = await prisma.users.create({
        data: {
            name: `Cooldown Donor Four ${timestamp}`,
            email: `donor4-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR"
        }
    });
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 15);
    const donor4 = await prisma.donors.create({
        data: {
            userid: donor4User.userid,
            bloodgroup: blood_group.A_NEGATIVE,
            dateofbirth: new Date("1994-11-25"),
            gender: "FEMALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9340,
            longitude: 72.8250,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: recentDate // Cooldown active!
        }
    });

    // Donor 5: Compatible (A-), Available, Cooldown passed, but located in Delhi (~1150 km away)
    const donor5User = await prisma.users.create({
        data: {
            name: `Far Donor Five ${timestamp}`,
            email: `donor5-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR"
        }
    });
    const donor5 = await prisma.donors.create({
        data: {
            userid: donor5User.userid,
            bloodgroup: blood_group.A_NEGATIVE,
            dateofbirth: new Date("1993-01-12"),
            gender: "MALE",
            city: "Delhi",
            state: "Delhi",
            pincode: "110001",
            latitude: 28.6139,
            longitude: 77.2090,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01")
        }
    });

    // Donor 6: Compatible (A-), Available, No coordinates, but city/state fallback in Mumbai
    const donor6User = await prisma.users.create({
        data: {
            name: `Fallback Donor Six ${timestamp}`,
            email: `donor6-p3-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR"
        }
    });
    const donor6 = await prisma.donors.create({
        data: {
            userid: donor6User.userid,
            bloodgroup: blood_group.A_NEGATIVE,
            dateofbirth: new Date("1997-07-04"),
            gender: "FEMALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400003",
            latitude: null,
            longitude: null,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01")
        }
    });

    console.log("--> Test fixtures initialized.\n");

    // =========================================================================
    // TEST 1: Emergency request creation triggers a broadcast
    // =========================================================================
    console.log("--- Test Group 1: Emergency Trigger on Creation ---");
    const emergencyReqRes = await postMultipart("/bloodrequests", requesterToken, {
        patientname: "Ramesh Emergency Patient",
        patientage: "45",
        patientgender: "MALE",
        patientcontact: "9876543210",
        bloodgroup: "A_NEGATIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: "2",
        urgencylevel: "CRITICAL",
        isemergency: "true",
        searchradius: "15",
        requiredby: new Date(Date.now() + 86400000).toISOString(),
        hospitalid: hospital.hospitalid,
        notes: "Severe trauma, immediate transfusion needed"
    }, {
        name: "prescription",
        buffer: pdfBuffer,
        filename: "emergency-rx.pdf",
        type: "application/pdf"
    });

    assert(emergencyReqRes.status === 201, "Emergency blood request created with 201 Created");
    const emergencyRequestId = emergencyReqRes.data.requestid;
    assert(!!emergencyRequestId, "Created emergency request has a valid UUID");

    // Wait a brief moment for async broadcast transaction
    await new Promise((r) => setTimeout(r, 200));

    // Verify broadcast record created in DB
    const broadcastRecord = await prisma.emergencybroadcasts.findFirst({
        where: { requestid: emergencyRequestId },
        include: { broadcastdeliveries: true }
    });
    assert(!!broadcastRecord, "Emergency broadcast record automatically created for emergency blood request");
    assert(broadcastRecord?.triggertype === "REQUEST_CREATION", "Broadcast triggertype is REQUEST_CREATION");
    assert(broadcastRecord?.status === "ACTIVE", "Broadcast status is ACTIVE");
    assert(broadcastRecord?.radiuskm === 15, "Broadcast radius is 15 km as configured");

    // =========================================================================
    // TEST 2: Non-emergency requests do not trigger an emergency broadcast
    // =========================================================================
    console.log("\n--- Test Group 2: Non-Emergency Requests Do Not Broadcast ---");
    const nonEmergencyReqRes = await postMultipart("/bloodrequests", requesterToken, {
        patientname: "Suresh Non-Emergency Patient",
        patientage: "30",
        patientgender: "MALE",
        patientcontact: "9876543211",
        bloodgroup: "A_NEGATIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: "1",
        urgencylevel: "LOW",
        isemergency: "false",
        searchradius: "15",
        requiredby: new Date(Date.now() + 86400000 * 5).toISOString(),
        hospitalid: hospital.hospitalid,
        notes: "Routine elective surgery scheduled next week"
    }, {
        name: "prescription",
        buffer: pdfBuffer,
        filename: "routine-rx.pdf",
        type: "application/pdf"
    });

    assert(nonEmergencyReqRes.status === 201, "Non-emergency blood request created successfully");
    const nonEmergencyRequestId = nonEmergencyReqRes.data.requestid;

    await new Promise((r) => setTimeout(r, 100));

    const nonEmergencyBroadcast = await prisma.emergencybroadcasts.findFirst({
        where: { requestid: nonEmergencyRequestId }
    });
    assert(nonEmergencyBroadcast === null, "No emergency broadcast created for non-emergency / LOW urgency request");

    // =========================================================================
    // TEST 3: Cancelled, expired, and fulfilled requests are not newly broadcast
    // =========================================================================
    console.log("\n--- Test Group 3: Inactive/Terminal Requests Cannot Be Broadcast ---");
    // Cancel the non-emergency request
    await putJson(`/bloodrequests/${nonEmergencyRequestId}`, requesterToken, {
        status: "CANCELLED",
        remarks: "Patient surgery cancelled by doctor"
    });

    const triggerOnCancelledRes = await postJson(`/bloodrequests/${nonEmergencyRequestId}/broadcast`, requesterToken, {
        radiusKm: 25,
        reason: "Late emergency escalation attempt"
    });
    assert(triggerOnCancelledRes.status === 400, "Attempting to broadcast a CANCELLED request returns HTTP 400");
    assert(triggerOnCancelledRes.data.message.includes("already cancelled") || triggerOnCancelledRes.data.message.includes("Cannot initiate"), "Returns clinical error message for terminal request broadcast attempt");

    // =========================================================================
    // TEST 4 & 5: Donor Compatibility & Eligibility Filtering
    // =========================================================================
    console.log("\n--- Test Group 4 & 5: Strict Donor Compatibility & Eligibility Filtering ---");
    // For A- recipient:
    // Compatible groups are: A- and O-
    // Donor 1: O-, Available, Eligible, Cooldown passed, nearby Mumbai -> SHOULD BE MATCHED
    // Donor 2: B+ -> INCOMPATIBLE -> MUST NOT BE MATCHED
    // Donor 3: A- -> UNAVAILABLE -> MUST NOT BE MATCHED
    // Donor 4: A- -> ACTIVE COOLDOWN (15 days) -> MUST NOT BE MATCHED
    // Donor 5: A- -> Far in Delhi (>1000 km) -> MUST NOT BE MATCHED (radius 15 km)
    // Donor 6: A- -> Fallback in Mumbai -> MATCHED AS FALLBACK

    const deliveries = await prisma.broadcastdeliveries.findMany({
        where: { broadcastid: broadcastRecord!.broadcastid }
    });
    const deliveredDonorIds = deliveries.map((d) => d.donorid);

    assert(deliveredDonorIds.includes(donor1.donorid), "Compatible, available donor (Donor 1, O-) was matched and delivered");
    assert(!deliveredDonorIds.includes(donor2.donorid), "Incompatible donor (Donor 2, B+) was excluded from broadcast");
    assert(!deliveredDonorIds.includes(donor3.donorid), "Unavailable donor (Donor 3, TEMPORARILY_UNAVAILABLE) was excluded from broadcast");
    assert(!deliveredDonorIds.includes(donor4.donorid), "Active 90-day cooldown donor (Donor 4, donated 15d ago) was excluded from broadcast");
    assert(!deliveredDonorIds.includes(donor5.donorid), "Distant donor in Delhi (Donor 5, >1000 km away) was excluded by 15 km radius");
    assert(deliveredDonorIds.includes(donor6.donorid), "Fallback donor in same city (Donor 6, Mumbai) was matched under fallback");

    // =========================================================================
    // TEST 6: Distinguish Coordinate Radius Matches vs City/State Fallback Matches
    // =========================================================================
    console.log("\n--- Test Group 6: Coordinate Radius vs City/State Fallback Distinction ---");
    const d1Delivery = deliveries.find((d) => d.donorid === donor1.donorid);
    const d6Delivery = deliveries.find((d) => d.donorid === donor6.donorid);

    assert(d1Delivery?.matchtype === "COORDINATES" || d1Delivery?.matchtype === "COORDINATE_RADIUS", "Donor with coordinates matched as COORDINATES");
    assert(d1Delivery?.distancekm !== null && Number(d1Delivery?.distancekm) > 0, "Donor 1 has calculated distancekm");

    assert(d6Delivery?.matchtype === "CITY_FALLBACK" || d6Delivery?.matchtype === "CITY_STATE_FALLBACK", "Donor without coordinates matched as CITY_FALLBACK");
    assert(d6Delivery?.distancekm === null, "Donor 6 has null distancekm (not inventing false exact distances)");

    // =========================================================================
    // TEST 7: Raw Coordinates & Patient Details Privacy Protection
    // =========================================================================
    console.log("\n--- Test Group 7: Coordinate & Patient Privacy Protection ---");
    // Check in-app notification delivered to Donor 1
    const donor1Notifs = await prisma.notification.findMany({
        where: { userid: donor1User.userid, requestid: emergencyRequestId }
    });
    assert(donor1Notifs.length > 0, "Donor 1 received an in-app emergency broadcast notification");
    const donor1Notif = donor1Notifs[0];

    // Verify notification message does not expose raw coordinates or private patient contact/clinical notes
    assert(!donor1Notif.message.includes("18.9322"), "Notification does not leak raw latitude coordinate");
    assert(!donor1Notif.message.includes("72.8264"), "Notification does not leak raw longitude coordinate");
    assert(!donor1Notif.message.includes("9876543210"), "Notification does not leak patient personal phone number");
    assert(!donor1Notif.message.includes("Severe trauma"), "Notification does not leak raw clinical diagnosis notes");
    assert(donor1Notif.message.includes("A_NEGATIVE") || donor1Notif.message.includes("A-"), "Notification states required blood group");
    assert(donor1Notif.message.includes("WHOLE_BLOOD"), "Notification states blood component");

    // =========================================================================
    // TEST 8: Deduplication & Safe Radius Expansion
    // =========================================================================
    console.log("\n--- Test Group 8: Idempotency & Radius Expansion Deduplication ---");
    // Triggering broadcast again with same radius (15 km) should not re-alert Donor 1
    const repeatTriggerRes = await triggerEmergencyBroadcast({
        requestId: emergencyRequestId,
        triggeredByUserId: hospUser.userid,
        triggerType: "HOSPITAL_EXPANSION",
        radiusKm: 15,
        triggerReason: "Duplicate trigger check"
    });

    assert(repeatTriggerRes.isExisting === true, "Repeat broadcast call with same radius recognized as existing broadcast");
    const donor1NotifsAfterRepeat = await prisma.notification.count({
        where: { userid: donor1User.userid, requestid: emergencyRequestId }
    });
    assert(donor1NotifsAfterRepeat === 1, "Donor 1 was not sent duplicate notification during repeat trigger");

    // Now expand radius to 100 km (or large enough to test expansion without duplicate)
    // Donor 1 and Donor 6 were already notified, so expansion should not re-notify them
    const expandRes = await postJson(`/bloodrequests/${emergencyRequestId}/broadcast`, hospitalToken, {
        radiusKm: 50,
        reason: "Hospital expansion to 50 km"
    });
    assert(expandRes.status === 200, "Hospital expanded broadcast radius to 50 km successfully");
    const donor1NotifsAfterExpand = await prisma.notification.count({
        where: { userid: donor1User.userid, requestid: emergencyRequestId }
    });
    assert(donor1NotifsAfterExpand === 1, "Previously notified Donor 1 was NOT re-notified upon radius expansion");

    // =========================================================================
    // TEST 9: In-App Notification Delivery
    // =========================================================================
    console.log("\n--- Test Group 9: In-App Emergency Notification Delivery ---");
    const donorNotifications = await getJson("/notifications", donor1Token);
    assert(donorNotifications.status === 200, "Donor can fetch their in-app notifications");
    const emergencyNotif = donorNotifications.data.notifications.find((n: any) => n.requestid === emergencyRequestId);
    assert(!!emergencyNotif, "Emergency notification found in donor's notification feed");
    assert(emergencyNotif.title.includes("EMERGENCY"), "Emergency notification title has EMERGENCY tag");

    // =========================================================================
    // TEST 10 & 11: Donor Responses are Authenticated, Authorized, and Idempotent
    // =========================================================================
    console.log("\n--- Test Group 10 & 11: Donor Volunteer Response & Idempotency ---");
    // Donor 1 responds to the emergency blood request
    const respondRes = await postJson(`/bloodrequests/${emergencyRequestId}/respond`, donor1Token, {
        estimatedArrival: "Within 45 minutes",
        contactPhone: "9123456789",
        screeningAnswers: {
            drinksAlcohol: false,
            alcoholInPast24Hours: false,
            feelingHealthy: true,
            recentAntibioticsOrMedication: false,
            recentTattooOrSurgery: false,
            donatedInLast90Days: false,
            chronicIllness: false,
            isPregnantOrBreastfeeding: false
        }
    });

    assert(respondRes.status === 200, "Donor 1 successfully volunteered with HTTP 200");
    assert(respondRes.data.transitStatus === "DONOR_FOUND", "Transit status initialized to DONOR_FOUND");

    // Verify broadcastdeliveries relational table updated
    const d1DeliveryUpdated = await prisma.broadcastdeliveries.findFirst({
        where: { broadcastid: broadcastRecord!.broadcastid, donorid: donor1.donorid }
    });
    assert(d1DeliveryUpdated?.deliverystatus === "RESPONDED", "Broadcast delivery record status updated to RESPONDED");
    assert(d1DeliveryUpdated?.response === "ACCEPTED", "Broadcast delivery record response set to ACCEPTED");
    assert(d1DeliveryUpdated?.transitstatus === "DONOR_FOUND", "Broadcast delivery record transitstatus set to DONOR_FOUND");
    assert(d1DeliveryUpdated?.respondedat !== null, "Broadcast delivery record respondedat timestamp recorded");

    // Verify emergencybroadcasts.totalresponded incremented
    const broadcastUpdated = await prisma.emergencybroadcasts.findUnique({
        where: { broadcastid: broadcastRecord!.broadcastid }
    });
    assert(broadcastUpdated?.totalresponded === 1, "emergencybroadcasts.totalresponded incremented to 1");
    assert(broadcastUpdated?.status === "DONOR_RESPONDED", "emergencybroadcasts.status transitioned to DONOR_RESPONDED");

    // Deduplication check: Donor 1 volunteering again should be blocked with 400
    const repeatRespondRes = await postJson(`/bloodrequests/${emergencyRequestId}/respond`, donor1Token, {
        estimatedArrival: "Duplicate attempt"
    });
    assert(repeatRespondRes.status === 400, "Duplicate volunteer response blocked with HTTP 400");
    assert(repeatRespondRes.data.message.includes("already volunteered"), "Rejection message explains donor already volunteered");

    // =========================================================================
    // TEST 12: Requesters and Hospitals See Only Authorized Broadcast Data
    // =========================================================================
    console.log("\n--- Test Group 12: Authorization & Privacy Gating ---");
    // Requester owner can view broadcast status
    const reqBroadcastRes = await getJson(`/bloodrequests/${emergencyRequestId}/broadcast`, requesterToken);
    assert(reqBroadcastRes.status === 200, "Request owner can view broadcast status");
    assert(reqBroadcastRes.data.hasBroadcast === true, "Request owner receives hasBroadcast = true");
    assert(reqBroadcastRes.data.broadcast.totalresponded === 1, "Request owner sees accurate response count");

    // Assigned hospital can view broadcast status
    const hospBroadcastRes = await getJson(`/bloodrequests/${emergencyRequestId}/broadcast`, hospitalToken);
    assert(hospBroadcastRes.status === 200, "Assigned hospital can view broadcast status");
    assert(hospBroadcastRes.data.deliveries.length > 0, "Hospital receives sanitized delivery metrics");

    // Unrelated requester is blocked with 403
    const unauthorizedBroadcastRes = await getJson(`/bloodrequests/${emergencyRequestId}/broadcast`, otherRequesterToken);
    assert(unauthorizedBroadcastRes.status === 403, "Unrelated requester is blocked with HTTP 403 from viewing broadcast status");

    // =========================================================================
    // TEST 13: Transit Milestone Synchronization
    // =========================================================================
    console.log("\n--- Test Group 13: Transit Milestones Relational Synchronization ---");
    // Donor updates transit to STARTED
    const transitStartRes = await patchJson(`/bloodrequests/${emergencyRequestId}/transit-status`, donor1Token, {
        status: "STARTED"
    });
    assert(transitStartRes.status === 200, "Transit status updated to STARTED");

    const deliveryStarted = await prisma.broadcastdeliveries.findFirst({
        where: { broadcastid: broadcastRecord!.broadcastid, donorid: donor1.donorid }
    });
    assert(deliveryStarted?.transitstatus === "STARTED", "broadcastdeliveries.transitstatus synchronized to STARTED");
    assert(deliveryStarted?.startedat !== null, "broadcastdeliveries.startedat timestamp set");

    // Donor updates transit to REACHED_LOCATION
    const transitReachedRes = await patchJson(`/bloodrequests/${emergencyRequestId}/transit-status`, donor1Token, {
        status: "REACHED_LOCATION"
    });
    assert(transitReachedRes.status === 200, "Transit status updated to REACHED_LOCATION");

    const deliveryReached = await prisma.broadcastdeliveries.findFirst({
        where: { broadcastid: broadcastRecord!.broadcastid, donorid: donor1.donorid }
    });
    assert(deliveryReached?.transitstatus === "REACHED_LOCATION", "broadcastdeliveries.transitstatus synchronized to REACHED_LOCATION");
    assert(deliveryReached?.reachedat !== null, "broadcastdeliveries.reachedat timestamp set");

    // =========================================================================
    // TEST 14: Phase 2 Prescription Verification Gate Remains Enforced
    // =========================================================================
    console.log("\n--- Test Group 14: Prescription Safety Gate Preservation ---");
    // Emergency request created by requester has prescription in PENDING status
    // Attempting to advance request status to BLOOD_ARRANGED directly without hospital prescription verification should be blocked
    const directArrangeRes = await putJson(`/bloodrequests/${emergencyRequestId}`, hospitalToken, {
        status: "BLOOD_ARRANGED",
        remarks: "Attempting to bypass prescription verification"
    });

    assert(directArrangeRes.status === 400, "Attempting to transition unverified requester requisition to BLOOD_ARRANGED is blocked with 400");
    assert(directArrangeRes.data.message.toLowerCase().includes("verified prescription"), "Clinical safety gate error specifies prescription must be verified");

    // Verify hospital prescription verification
    const verifyRxRes = await postJson(`/bloodrequests/${emergencyRequestId}/prescription/verify`, hospitalToken, {
        status: "VERIFIED",
        remarks: "Emergency prescription verified by Dr. Trauma Officer"
    });
    assert(verifyRxRes.status === 200, "Hospital verifies emergency prescription successfully");

    // Now advancing to BLOOD_ARRANGED succeeds
    const arrangeAfterVerifyRes = await putJson(`/bloodrequests/${emergencyRequestId}`, hospitalToken, {
        status: "BLOOD_ARRANGED",
        remarks: "Prescription verified, blood arranged for transfusion"
    });
    assert(arrangeAfterVerifyRes.status === 200, "Advancing to BLOOD_ARRANGED succeeds after prescription verification");

    console.log("\n===============================================================================");
    console.log(`  PHASE 3 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log("===============================================================================\n");
}

runPhase3EmergencyBroadcastTests()
    .catch((err) => {
        console.error("Test execution failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        await prisma.$disconnect();
    });
