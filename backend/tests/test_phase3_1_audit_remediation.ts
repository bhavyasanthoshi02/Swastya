import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, notification_type } from "../src/generated/prisma/enums";
import app from "../src/app";
import http from "http";
import { triggerEmergencyBroadcast, getRequestBroadcastStatus } from "../src/services/broadcast.service";
import {
    getCompatibleDonorBloodGroups,
    getCompatibleRecipientBloodGroups,
    isDonorCompatibleWithRecipient,
    normalizeBloodComponent,
    PLASMA_RECIPIENT_TO_DONOR_MAP,
    PLASMA_DONOR_TO_RECIPIENT_MAP,
    RBC_RECIPIENT_TO_DONOR_MAP,
    PLATELET_RECIPIENT_TO_DONOR_MAP,
    WHOLE_BLOOD_RECIPIENT_TO_DONOR_MAP,
} from "../src/utils/bloodCompatibility";

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

async function postJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
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
            Authorization: `Bearer ${token}`,
        },
    });

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    return { status: res.status, data: json, headers: res.headers };
}

async function runPhase31AuditRemediationTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 3.1: BROADCAST AUDIT REMEDIATION VERIFICATION SUITE");
    console.log("===============================================================================\n");

    // 1. Start ephemeral HTTP server
    await new Promise<void>((resolve) => {
        server = http.createServer(app);
        server.listen(0, () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 5000;
            API_BASE = `http://localhost:${port}`;
            console.log(`--> Ephemeral test API server listening at ${API_BASE}`);
            resolve();
        });
    });

    // =========================================================================
    // PART 1: COMPONENT-AWARE COMPATIBILITY ENGINE UNIT & LOGIC TESTS
    // =========================================================================
    console.log("\n--- Part 1: Component-Aware Compatibility Engine Unit Tests ---");

    // 1.1 Component Normalization
    assert(normalizeBloodComponent("WHOLE_BLOOD") === blood_component.WHOLE_BLOOD, "Normalizes WHOLE_BLOOD");
    assert(normalizeBloodComponent("Whole Blood") === blood_component.WHOLE_BLOOD, "Normalizes 'Whole Blood' human format");
    assert(normalizeBloodComponent("RBC") === blood_component.RBC, "Normalizes RBC");
    assert(normalizeBloodComponent("Packed RBC") === blood_component.RBC, "Normalizes 'Packed RBC'");
    assert(normalizeBloodComponent("plasma") === blood_component.PLASMA, "Normalizes lowercase 'plasma'");
    assert(normalizeBloodComponent("platelets") === blood_component.PLATELETS, "Normalizes lowercase 'platelets'");
    assert(normalizeBloodComponent("INVALID_COMPONENT") === null, "Rejects invalid component safely with null");
    assert(normalizeBloodComponent(null) === blood_component.WHOLE_BLOOD, "Default fallback for null is WHOLE_BLOOD");

    // 1.2 PLASMA Compatibility Verification (Clinical Inversion)
    console.log("\n  [Testing Clinical Plasma Compatibility]");
    // Plasma Recipient O accepts all plasma donors (universal plasma recipient)
    const plasmaDonorsForO = getCompatibleDonorBloodGroups(blood_group.O_POSITIVE, blood_component.PLASMA);
    assert(plasmaDonorsForO.length === 8, "Plasma: O+ recipient accepts all 8 donor groups (universal plasma recipient)");
    assert(plasmaDonorsForO.includes(blood_group.AB_POSITIVE), "Plasma: O+ recipient accepts AB+ plasma");

    // Plasma Recipient A accepts A and AB, but strictly NOT O or B!
    const plasmaDonorsForA = getCompatibleDonorBloodGroups(blood_group.A_POSITIVE, blood_component.PLASMA);
    assert(plasmaDonorsForA.includes(blood_group.A_POSITIVE), "Plasma: A+ recipient accepts A+ plasma");
    assert(plasmaDonorsForA.includes(blood_group.AB_POSITIVE), "Plasma: A+ recipient accepts AB+ plasma");
    assert(!plasmaDonorsForA.includes(blood_group.O_POSITIVE), "Plasma: A+ recipient strictly EXCLUDES O+ plasma (clinical inversion verified)");
    assert(!plasmaDonorsForA.includes(blood_group.O_NEGATIVE), "Plasma: A+ recipient strictly EXCLUDES O- plasma (clinical inversion verified)");
    assert(!plasmaDonorsForA.includes(blood_group.B_POSITIVE), "Plasma: A+ recipient strictly EXCLUDES B+ plasma");

    // Plasma Recipient AB accepts ONLY AB plasma
    const plasmaDonorsForAB = getCompatibleDonorBloodGroups(blood_group.AB_POSITIVE, blood_component.PLASMA);
    assert(plasmaDonorsForAB.includes(blood_group.AB_POSITIVE), "Plasma: AB+ recipient accepts AB+ plasma");
    assert(plasmaDonorsForAB.includes(blood_group.AB_NEGATIVE), "Plasma: AB+ recipient accepts AB- plasma");
    assert(!plasmaDonorsForAB.includes(blood_group.A_POSITIVE), "Plasma: AB+ recipient EXCLUDES A+ plasma");
    assert(!plasmaDonorsForAB.includes(blood_group.O_POSITIVE), "Plasma: AB+ recipient EXCLUDES O+ plasma");

    // Donor perspective: AB is Universal Plasma Donor
    assert(isDonorCompatibleWithRecipient(blood_group.AB_POSITIVE, blood_group.O_POSITIVE, blood_component.PLASMA), "Plasma: AB+ donor compatible for O+ recipient");
    assert(isDonorCompatibleWithRecipient(blood_group.AB_POSITIVE, blood_group.A_POSITIVE, blood_component.PLASMA), "Plasma: AB+ donor compatible for A+ recipient");
    assert(isDonorCompatibleWithRecipient(blood_group.AB_POSITIVE, blood_group.B_POSITIVE, blood_component.PLASMA), "Plasma: AB+ donor compatible for B+ recipient");
    assert(isDonorCompatibleWithRecipient(blood_group.AB_POSITIVE, blood_group.AB_POSITIVE, blood_component.PLASMA), "Plasma: AB+ donor compatible for AB+ recipient");

    // Donor perspective: O can donate plasma ONLY to O recipients
    assert(isDonorCompatibleWithRecipient(blood_group.O_POSITIVE, blood_group.O_POSITIVE, blood_component.PLASMA), "Plasma: O+ donor compatible for O+ recipient");
    assert(!isDonorCompatibleWithRecipient(blood_group.O_POSITIVE, blood_group.A_POSITIVE, blood_component.PLASMA), "Plasma: O+ donor NOT compatible for A+ recipient");
    assert(!isDonorCompatibleWithRecipient(blood_group.O_POSITIVE, blood_group.B_POSITIVE, blood_component.PLASMA), "Plasma: O+ donor NOT compatible for B+ recipient");
    assert(!isDonorCompatibleWithRecipient(blood_group.O_POSITIVE, blood_group.AB_POSITIVE, blood_component.PLASMA), "Plasma: O+ donor NOT compatible for AB+ recipient");

    // 1.3 RBC Compatibility Verification
    console.log("\n  [Testing Standard RBC Compatibility]");
    // O- is universal RBC donor
    assert(isDonorCompatibleWithRecipient(blood_group.O_NEGATIVE, blood_group.A_POSITIVE, blood_component.RBC), "RBC: O- donor is compatible for A+ recipient");
    assert(isDonorCompatibleWithRecipient(blood_group.O_NEGATIVE, blood_group.B_POSITIVE, blood_component.RBC), "RBC: O- donor is compatible for B+ recipient");
    assert(isDonorCompatibleWithRecipient(blood_group.O_NEGATIVE, blood_group.AB_POSITIVE, blood_component.RBC), "RBC: O- donor is compatible for AB+ recipient");
    assert(isDonorCompatibleWithRecipient(blood_group.O_NEGATIVE, blood_group.O_NEGATIVE, blood_component.RBC), "RBC: O- donor is compatible for O- recipient");

    // AB+ is universal RBC recipient
    const rbcDonorsForAB = getCompatibleDonorBloodGroups(blood_group.AB_POSITIVE, blood_component.RBC);
    assert(rbcDonorsForAB.length === 8, "RBC: AB+ recipient accepts all 8 donor groups (universal RBC recipient)");

    // O- recipient accepts ONLY O- RBC
    const rbcDonorsForONeg = getCompatibleDonorBloodGroups(blood_group.O_NEGATIVE, blood_component.RBC);
    assert(rbcDonorsForONeg.length === 1 && rbcDonorsForONeg[0] === blood_group.O_NEGATIVE, "RBC: O- recipient accepts ONLY O- RBC");

    // 1.4 PLATELETS Compatibility Verification (Conservative ABO-Identical)
    console.log("\n  [Testing Conservative Platelet Compatibility]");
    const plateletDonorsForA = getCompatibleDonorBloodGroups(blood_group.A_POSITIVE, blood_component.PLATELETS);
    assert(plateletDonorsForA.includes(blood_group.A_POSITIVE), "Platelets: A+ accepts A+ platelets");
    assert(plateletDonorsForA.includes(blood_group.A_NEGATIVE), "Platelets: A+ accepts A- platelets (Rh compatible identical ABO)");
    assert(!plateletDonorsForA.includes(blood_group.O_POSITIVE), "Platelets: A+ strictly EXCLUDES O+ (conservative ABO-identical policy enforced)");
    assert(!plateletDonorsForA.includes(blood_group.B_POSITIVE), "Platelets: A+ strictly EXCLUDES B+ platelets");
    assert(!plateletDonorsForA.includes(blood_group.AB_POSITIVE), "Platelets: A+ strictly EXCLUDES AB+ platelets");

    const plateletDonorsForB = getCompatibleDonorBloodGroups(blood_group.B_POSITIVE, blood_component.PLATELETS);
    assert(plateletDonorsForB.includes(blood_group.B_POSITIVE), "Platelets: B+ accepts B+ platelets");
    assert(!plateletDonorsForB.includes(blood_group.A_POSITIVE), "Platelets: B+ strictly EXCLUDES A+ platelets");

    // 1.5 Safe Rejection of Unsupported Components
    assert(getCompatibleDonorBloodGroups(blood_group.A_POSITIVE, "UNKNOWN_COMPONENT" as any).length === 0, "Returns empty compatible donor array for unknown component");
    assert(!isDonorCompatibleWithRecipient(blood_group.O_NEGATIVE, blood_group.A_POSITIVE, "UNKNOWN_COMPONENT" as any), "isDonorCompatibleWithRecipient returns false for unknown component");

    // =========================================================================
    // PART 2: DATABASE FIXTURES FOR TRANSACTION INTEGRITY & METRICS TESTS
    // =========================================================================
    console.log("\n--- Part 2: Initializing Isolated Database Fixtures ---");
    const timestamp = Date.now();

    // Create hospital user & hospital profile
    const hospUser = await prisma.users.create({
        data: {
            name: `Audit Remediation Hospital ${timestamp}`,
            email: `hospital-rem-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "HOSPITAL",
        },
    });
    const hospital = await prisma.hospitals.create({
        data: {
            userid: hospUser.userid,
            hospitalname: "Swastya Trauma Care Center",
            registrationnumber: `REG-REM-${timestamp}`,
            contactpersonname: "Dr. Trauma Officer",
            contactpersonphone: "9876543210",
            address: "100 Medical Enclave",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9320,
            longitude: 72.8260,
            approvalstatus: "APPROVED",
        },
    });
    const hospitalToken = generateToken(hospUser.userid, "HOSPITAL");

    // Create requester user & profile
    const reqUser = await prisma.users.create({
        data: {
            name: `Audit Remediation Requester ${timestamp}`,
            email: `requester-rem-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "REQUESTER",
        },
    });
    const requester = await prisma.requesters.create({
        data: {
            userid: reqUser.userid,
            address: "200 Marine Drive",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9322,
            longitude: 72.8264,
        },
    });
    const requesterToken = generateToken(reqUser.userid, "REQUESTER");

    // Create 4 active, eligible test donors in Mumbai
    // Donor A: A+ (eligible for Plasma A+, RBC A+, Platelet A+)
    const donorAUser = await prisma.users.create({
        data: {
            name: `Donor Alpha ${timestamp}`,
            email: `donorA-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR",
        },
    });
    const donorA = await prisma.donors.create({
        data: {
            userid: donorAUser.userid,
            bloodgroup: blood_group.A_POSITIVE,
            dateofbirth: new Date("1995-01-01"),
            gender: "MALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9340,
            longitude: 72.8270,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01"),
        },
    });
    const donorAToken = generateToken(donorAUser.userid, "DONOR");

    // Donor B: AB+ (eligible for Plasma A+, RBC A+ fallback, but NOT Platelet A+)
    const donorBUser = await prisma.users.create({
        data: {
            name: `Donor Beta ${timestamp}`,
            email: `donorB-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR",
        },
    });
    const donorB = await prisma.donors.create({
        data: {
            userid: donorBUser.userid,
            bloodgroup: blood_group.AB_POSITIVE,
            dateofbirth: new Date("1994-02-02"),
            gender: "FEMALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9350,
            longitude: 72.8280,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01"),
        },
    });

    // Donor C: O+ (eligible for RBC A+, but strictly NOT for Plasma A+ or Platelets A+)
    const donorCUser = await prisma.users.create({
        data: {
            name: `Donor Charlie ${timestamp}`,
            email: `donorC-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR",
        },
    });
    const donorC = await prisma.donors.create({
        data: {
            userid: donorCUser.userid,
            bloodgroup: blood_group.O_POSITIVE,
            dateofbirth: new Date("1993-03-03"),
            gender: "MALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9360,
            longitude: 72.8290,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01"),
        },
    });

    // Donor D: A- (located slightly further at 25km for radius expansion testing)
    // 18.9320 + 0.22 deg lat is approx 24.5 km away
    const donorDUser = await prisma.users.create({
        data: {
            name: `Donor Delta ${timestamp}`,
            email: `donorD-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "DONOR",
        },
    });
    const donorD = await prisma.donors.create({
        data: {
            userid: donorDUser.userid,
            bloodgroup: blood_group.A_NEGATIVE,
            dateofbirth: new Date("1992-04-04"),
            gender: "FEMALE",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400099",
            latitude: 19.1520,
            longitude: 72.8260,
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date("2024-01-01"),
        },
    });

    console.log("--> Fixtures created successfully.");

    // =========================================================================
    // PART 3: PLASMA BROADCAST COMPONENT-AWARE INTEGRATION TEST
    // =========================================================================
    console.log("\n--- Part 3: Component-Aware Broadcast Matching (Plasma vs RBC) ---");

    // Create an emergency request for PLASMA, group A_POSITIVE
    const plasmaReq = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: reqUser.userid,
            requesterid: requester.requesterid,
            hospitalid: hospital.hospitalid,
            patientname: "Plasma Patient Audit",
            patientage: 38,
            patientgender: "FEMALE",
            patientcontact: "9123456780",
            bloodgroup: blood_group.A_POSITIVE,
            bloodcomponent: blood_component.PLASMA,
            unitsrequired: 2,
            urgencylevel: "CRITICAL",
            isemergency: true,
            searchradius: 15,
            latitude: 18.9320,
            longitude: 72.8260,
            requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000),
            status: "CREATED",
        },
    });

    // Trigger emergency broadcast for the plasma requisition
    const plasmaBroadcastRes = await triggerEmergencyBroadcast({
        requestId: plasmaReq.requestid,
        triggeredByUserId: reqUser.userid,
        triggerType: "MANUAL_TRIGGER",
        radiusKm: 15,
    });

    assert(plasmaBroadcastRes.success === true, "Plasma emergency broadcast triggered successfully");
    const plasmaDeliveries = await prisma.broadcastdeliveries.findMany({
        where: { broadcastid: plasmaBroadcastRes.broadcastId },
    });
    const plasmaNotifiedDonorIds = plasmaDeliveries.map((d) => d.donorid);

    // Verify:
    // Donor A (A+) must be matched
    // Donor B (AB+) must be matched (Universal Plasma donor)
    // Donor C (O+) MUST NOT be matched for Plasma (clinical inversion verified)
    assert(plasmaNotifiedDonorIds.includes(donorA.donorid), "Plasma: Donor A (A+) was matched and notified");
    assert(plasmaNotifiedDonorIds.includes(donorB.donorid), "Plasma: Donor B (AB+) was matched and notified (universal plasma donor)");
    assert(!plasmaNotifiedDonorIds.includes(donorC.donorid), "Plasma: Donor C (O+) was EXCLUDED from plasma broadcast (RBC rule not falsely applied)");

    // =========================================================================
    // PART 4: NOTIFICATION FAILURE INTEGRITY & TRANSACTION ISOLATION TESTS
    // =========================================================================
    console.log("\n--- Part 4: Notification Failure Integrity & Safe Persistence ---");

    // Create a new requisition for testing simulated failure
    // Create a hospital specifically for simulating delivery failure via DB constraint
    const failHospUser = await prisma.users.create({
        data: {
            name: `Fail Hosp User ${timestamp}`,
            email: `failhosp-${timestamp}@swastya.org`,
            password: "hashed_password",
            role: "HOSPITAL",
        },
    });
    const failHospital = await prisma.hospitals.create({
        data: {
            userid: failHospUser.userid,
            hospitalname: "Simulated Facility SIMFAIL",
            registrationnumber: `REG-FAIL-${timestamp}`,
            contactpersonname: "Dr. Fail Test",
            contactpersonphone: "9876543211",
            address: "300 Test Road",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9320,
            longitude: 72.8260,
            approvalstatus: "APPROVED",
        },
    });

    const failureTestReq = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: reqUser.userid,
            requesterid: requester.requesterid,
            hospitalid: failHospital.hospitalid,
            patientname: "Failure Simulation Patient",
            patientage: 50,
            patientgender: "MALE",
            patientcontact: "9123456781",
            bloodgroup: blood_group.A_POSITIVE,
            bloodcomponent: blood_component.WHOLE_BLOOD,
            unitsrequired: 1,
            urgencylevel: "CRITICAL",
            isemergency: true,
            searchradius: 15,
            latitude: 18.9320,
            longitude: 72.8260,
            requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000),
            status: "CREATED",
        },
    });

    // Clean up prior test notifications and ensure constraint is clean
    await prisma.$executeRawUnsafe("ALTER TABLE notification DROP CONSTRAINT IF EXISTS chk_simulated_fail;");
    await prisma.$executeRawUnsafe("DELETE FROM notification WHERE message LIKE '%SIMFAIL%';");

    // Add check constraint to notification table that blocks SIMFAIL messages
    await prisma.$executeRawUnsafe(
        "ALTER TABLE notification ADD CONSTRAINT chk_simulated_fail CHECK (message NOT LIKE '%SIMFAIL%') NOT VALID;"
    );

    let failureBroadcastRes: any = null;
    try {
        // Trigger broadcast: notification creation will fail at DB layer with check constraint violation
        failureBroadcastRes = await triggerEmergencyBroadcast({
            requestId: failureTestReq.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
            radiusKm: 15,
        });
    } finally {
        // Ensure constraint is dropped even if assertions fail
        await prisma.$executeRawUnsafe("ALTER TABLE notification DROP CONSTRAINT IF EXISTS chk_simulated_fail;");
    }

    assert(failureBroadcastRes?.success === true, "Broadcast did NOT crash when a notification failed");
    const failureDeliveries = await prisma.broadcastdeliveries.findMany({
        where: { broadcastid: failureBroadcastRes.broadcastId },
    });

    const failedDeliveries = failureDeliveries.filter((d) => d.deliverystatus === "FAILED");
    assert(failedDeliveries.length > 0, "Durable failure record persisted with deliverystatus = 'FAILED'");
    assert(failedDeliveries[0].failuremessage !== null, "Failure record includes failuremessage");
    assert(failedDeliveries[0].failuremessage.includes("chk_simulated_fail"), "Failure record preserves Postgres error message without 25P02 abort");
    assert(failureBroadcastRes.totalNotified === 0, "totalnotified accurately reflects 0 successful notifications");

    // Test Recovery & Retry:
    // With constraint removed, triggering broadcast again retries previously failed donors
    const retryBroadcastRes = await triggerEmergencyBroadcast({
        requestId: failureTestReq.requestid,
        triggeredByUserId: reqUser.userid,
        triggerType: "MANUAL_TRIGGER",
        radiusKm: 15,
        expandRadius: true, // create new broadcast retry record
    });

    assert(retryBroadcastRes.success === true, "Retry broadcast succeeded");
    const retryDeliveries = await prisma.broadcastdeliveries.findMany({
        where: { broadcastid: retryBroadcastRes.broadcastId },
    });
    const retrySuccessful = retryDeliveries.filter((d) => d.deliverystatus === "DELIVERED");
    assert(retrySuccessful.length > 0, "Retry broadcast successfully delivered notifications to previously failed donors");

    // =========================================================================
    // PART 5: MULTI-STAGE EXPANSION & CUMULATIVE METRICS AGGREGATION TESTS
    // =========================================================================
    console.log("\n--- Part 5: Multi-Stage Radius Expansion & Cumulative Metrics ---");

    // Create an emergency requisition for Platelets
    const expansionReq = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: reqUser.userid,
            requesterid: requester.requesterid,
            hospitalid: hospital.hospitalid,
            patientname: "Expansion Patient Audit",
            patientage: 29,
            patientgender: "MALE",
            patientcontact: "9123456782",
            bloodgroup: blood_group.A_POSITIVE,
            bloodcomponent: blood_component.PLATELETS,
            unitsrequired: 2,
            urgencylevel: "CRITICAL",
            isemergency: true,
            searchradius: 10, // Stage 1 radius: 10km (matches Donor A at ~2km, does NOT reach Donor D at ~25km)
            latitude: 18.9320,
            longitude: 72.8260,
            requiredby: new Date(Date.now() + 3 * 60 * 60 * 1000),
            status: "CREATED",
        },
    });

    // Stage 1: Initial broadcast at 10 km
    const stage1Res = await triggerEmergencyBroadcast({
        requestId: expansionReq.requestid,
        triggeredByUserId: reqUser.userid,
        triggerType: "MANUAL_TRIGGER",
        radiusKm: 10,
    });

    assert(stage1Res.success === true, "Stage 1 broadcast initiated at 10km");
    const stage1Count = stage1Res.totalNotified;
    assert(stage1Count >= 1, `Stage 1 notified ${stage1Count} local donor(s)`);

    // Verify initial broadcast status
    const statusAfterStage1 = await getRequestBroadcastStatus(expansionReq.requestid);
    assert(statusAfterStage1 !== null, "Resolved broadcast status after Stage 1");
    assert(statusAfterStage1?.totalnotified === stage1Count, `Cumulative totalnotified after Stage 1 matches stage 1 count (${stage1Count})`);

    // Stage 2: Radius Expansion to 30 km (matches local donors again + newly reaches Donor D at ~25km)
    const stage2Res = await triggerEmergencyBroadcast({
        requestId: expansionReq.requestid,
        triggeredByUserId: reqUser.userid,
        triggerType: "RADIUS_EXPANSION",
        expandRadius: true,
        radiusKm: 30,
    });

    assert(stage2Res.success === true, "Stage 2 radius expansion initiated at 30km");
    const stage2Count = stage2Res.totalNotified;
    assert(stage2Count >= 1, `Stage 2 notified newly eligible donor(s) (${stage2Count})`);

    // Check zero duplicate notification between stages
    const stage1Deliveries = await prisma.broadcastdeliveries.findMany({ where: { broadcastid: stage1Res.broadcastId } });
    const stage2Deliveries = await prisma.broadcastdeliveries.findMany({ where: { broadcastid: stage2Res.broadcastId } });
    const s1DonorIds = stage1Deliveries.map((d) => d.donorid);
    const s2DonorIds = stage2Deliveries.map((d) => d.donorid);
    assert(!s2DonorIds.some((id) => s1DonorIds.includes(id)), "Stage 2 did not re-notify any donors from Stage 1 (zero duplicate in-app alerts)");

    // Verify Cumulative Request-Level Metrics
    const expectedCumulativeNotified = stage1Count + stage2Count;
    const statusAfterStage2 = await getRequestBroadcastStatus(expansionReq.requestid);
    assert(statusAfterStage2 !== null, "Resolved broadcast status after Stage 2");
    assert(statusAfterStage2?.totalnotified === expectedCumulativeNotified, `Cumulative request-level totalnotified (${statusAfterStage2?.totalnotified}) equals stage 1 + stage 2 (${expectedCumulativeNotified})`);
    assert(statusAfterStage2?.requestMetrics.uniqueNotifiedDonors === expectedCumulativeNotified, `requestMetrics.uniqueNotifiedDonors equals ${expectedCumulativeNotified}`);
    assert(statusAfterStage2?.broadcastHistory.length === 2, "broadcastHistory preserves both broadcast stages for audit");
    assert(statusAfterStage2?.latestBroadcastMetrics.totalnotified === stage2Count, `latestBroadcastMetrics preserves stage 2 incremental count (${stage2Count})`);


    // =========================================================================
    // PART 6: VOLUNTEER RESPONSE DEDUPLICATION & METRIC INTEGRITY
    // =========================================================================
    console.log("\n--- Part 6: Volunteer Response Deduplication & Status Advancement ---");

    // Donor A responds to the blood request
    const respondRes1 = await postJson(`/bloodrequests/${expansionReq.requestid}/respond`, donorAToken, {
        estimatedArrival: "30 minutes",
        screeningAnswers: {
            drinksAlcohol: false,
            feelingHealthy: true,
            recentAntibioticsOrMedication: false,
            recentTattooOrSurgery: false,
            donatedInLast90Days: false,
            chronicIllness: false,
            isPregnantOrBreastfeeding: false,
        },
    });

    assert(respondRes1.status === 200, "Donor A successfully volunteered for requisition");
    assert(respondRes1.data.status === "DONOR_MATCHING", "Requisition status advanced to DONOR_MATCHING");

    // Repeated response attempt from the same donor (must be blocked)
    const respondRes2 = await postJson(`/bloodrequests/${expansionReq.requestid}/respond`, donorAToken, {
        estimatedArrival: "45 minutes",
        screeningAnswers: { feelingHealthy: true },
    });

    assert(respondRes2.status === 400, "Repeated response from same donor is blocked with HTTP 400");
    assert(respondRes2.data.message.toLowerCase().includes("already volunteered"), "Error message specifies donor already volunteered");

    // Verify Cumulative Responded Metrics
    const statusAfterResponse = await getRequestBroadcastStatus(expansionReq.requestid);
    assert(statusAfterResponse?.totalresponded === 1, "Cumulative totalresponded is exactly 1 (no double-counting)");
    assert(statusAfterResponse?.requestMetrics.uniqueRespondedDonors === 1, "requestMetrics.uniqueRespondedDonors is 1");

    // Verify that GET /bloodrequests/:id/broadcast returns cumulative metrics
    const apiBroadcastStatus = await getJson(`/bloodrequests/${expansionReq.requestid}/broadcast`, requesterToken);
    assert(apiBroadcastStatus.status === 200, "GET /bloodrequests/:id/broadcast succeeds for requester");
    assert(apiBroadcastStatus.data.totalnotified === expectedCumulativeNotified, `API broadcast card displays true cumulative notified count (${expectedCumulativeNotified})`);
    assert(apiBroadcastStatus.data.totalresponded === 1, "API broadcast card displays true cumulative responded count (1)");

    // =========================================================================
    // PART 7: INCOMPATIBLE DONOR RESPONSE REJECTION AT API LAYER
    // =========================================================================
    console.log("\n--- Part 7: Incompatible Donor API Response Rejection ---");
    // Donor C (O+) attempts to respond to the Platelet A+ request
    const donorCToken = generateToken(donorCUser.userid, "DONOR");

    const incompatibleRespRes = await postJson(`/bloodrequests/${expansionReq.requestid}/respond`, donorCToken, {
        estimatedArrival: "20 minutes",
        screeningAnswers: { feelingHealthy: true },
    });

    assert(incompatibleRespRes.status === 400, "Incompatible donor volunteer response rejected with HTTP 400");
    assert(incompatibleRespRes.data.message.toLowerCase().includes("not compatible"), "Rejection specifies incompatibility with requested component");

    console.log("\n===============================================================================");
    console.log(`  PHASE 3.1 AUDIT REMEDIATION TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED!`);
    console.log("===============================================================================\n");
}

runPhase31AuditRemediationTests()
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
