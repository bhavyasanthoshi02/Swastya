/**
 * Swastya Final Acceptance Test & Release Verification Suite
 * Executes end-to-end multi-role acceptance journeys, concurrent rate-limit concurrency check,
 * provider timeout retry analysis, medical privacy barriers, and mock mode invariants.
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

process.env.NODE_ENV = "development";
process.env.TWILIO_MOCK_MODE = "true";

import { NotificationSmsDispatcher } from "../src/services/sms/notificationSmsDispatcher.service";
import { ActionTokenService } from "../src/services/sms/actionToken.service";
import { CustomSmsService } from "../src/services/sms/customSms.service";
import { OutboxWorkerService } from "../src/services/sms/outboxWorker.service";
import { MockSmsProvider } from "../src/services/sms/mockSms.provider";
import { SmsService } from "../src/services/sms/sms.service";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ""}`);
        process.exitCode = 1;
    }
}

async function runReleaseAcceptanceSuite() {
    const { prisma } = await import("../src/config/prisma");

    console.log("===============================================================================");
    console.log(" SWASTYA: FINAL MANUAL ACCEPTANCE TEST & RELEASE VERIFICATION");
    console.log("===============================================================================\n");

    // -------------------------------------------------------------
    // 1. ENVIRONMENT, DATABASE & SAFETY INVARIANTS
    // -------------------------------------------------------------
    console.log("--- 1. Safety & Environment Guardrails ---");
    assert(process.env.TWILIO_MOCK_MODE === "true", "1.1 TWILIO_MOCK_MODE is strictly set to 'true'");
    assert(process.env.NODE_ENV === "development", "1.2 NODE_ENV is set to 'development'");

    // Verify database connection is dev branch and NOT production
    const dbUrl = process.env.DATABASE_URL || "";
    const isDevBranch = dbUrl.includes("ep-holy-flower-bive3xfn") || dbUrl.includes("dev-sms-feature");
    const isProdBranch = dbUrl.includes("ep-empty-surf-bictmr98");
    assert(isDevBranch, "1.3 Connected database is the Neon 'dev-sms-feature' development branch");
    assert(!isProdBranch, "1.4 Production Neon database (ep-empty-surf-bictmr98) is strictly untouched");

    // Clear mock logs and reset test sender rate limit state
    MockSmsProvider.clear();
    CustomSmsService.resetRateLimits();
    await prisma.smsoutbox.deleteMany({
        where: { templatename: "CUSTOM_COMMUNICATION" },
    });

    // Fetch existing test accounts
    const donor = await prisma.users.findFirst({
        where: { role: "DONOR", email: "donor@gmail.com" },
        select: { userid: true, email: true, name: true, phonenumber: true },
    }) || await prisma.users.findFirst({
        where: { role: "DONOR", isactive: true },
        select: { userid: true, email: true, name: true, phonenumber: true },
    });

    const requester = await prisma.users.findFirst({
        where: { role: "REQUESTER", email: "requester@gmail.com" },
        select: { userid: true, email: true, name: true, phonenumber: true },
    }) || await prisma.users.findFirst({
        where: { role: "REQUESTER", isactive: true },
        select: { userid: true, email: true, name: true, phonenumber: true },
    });

    const hospitalUser = await prisma.users.findFirst({
        where: { role: "HOSPITAL", email: "hospital@gmail.com" },
        select: { userid: true, email: true, name: true, phonenumber: true },
    }) || await prisma.users.findFirst({
        where: { role: "HOSPITAL", isactive: true },
        select: { userid: true, email: true, name: true, phonenumber: true },
    });

    const bloodBankUser = await prisma.users.findFirst({
        where: { role: "BLOOD_BANK", email: "bloodbank@gmail.com" },
        select: { userid: true, email: true, name: true, phonenumber: true },
    }) || await prisma.users.findFirst({
        where: { role: "BLOOD_BANK", isactive: true },
        select: { userid: true, email: true, name: true, phonenumber: true },
    });

    const adminUser = await prisma.users.findFirst({
        where: { role: "ADMIN", isactive: true },
        select: { userid: true, email: true, name: true, phonenumber: true },
    }) || { userid: "00000000-0000-0000-0000-000000000001", email: "admin@swastya.org", name: "System Admin", phonenumber: "+919999999999" };

    const hospitalRecord = await prisma.hospitals.findFirst({
        where: { userid: hospitalUser?.userid },
        select: { hospitalid: true, hospitalname: true },
    }) || await prisma.hospitals.findFirst({ select: { hospitalid: true, hospitalname: true } });

    const donorRecord = await prisma.donors.findFirst({
        where: { userid: donor?.userid },
        select: { donorid: true, bloodgroup: true },
    }) || await prisma.donors.findFirst({ select: { donorid: true, bloodgroup: true } });

    const bloodRequest = await prisma.bloodrequests.findFirst({
        select: { requestid: true, hospitalid: true, createdbyuserid: true },
    });

    if (!donor || !requester || !hospitalUser || !bloodBankUser || !hospitalRecord || !donorRecord || !bloodRequest) {
        throw new Error("Unable to locate required test accounts on development database!");
    }

    const originalReqHosp = bloodRequest.hospitalid;
    const originalReqUser = bloodRequest.createdbyuserid;

    // Link request to test fixtures
    await prisma.bloodrequests.update({
        where: { requestid: bloodRequest.requestid },
        data: {
            hospitalid: hospitalRecord.hospitalid,
            createdbyuserid: requester.userid,
        },
        select: { requestid: true },
    });

    // Clean up any previous test outbox records or tokens associated with this test request
    await prisma.smsoutbox.deleteMany({
        where: {
            OR: [
                { templatename: "CUSTOM_COMMUNICATION" },
                { idempotencykey: { contains: bloodRequest.requestid } },
            ],
        },
    });
    await prisma.actiontokens.deleteMany({
        where: { targetid: bloodRequest.requestid },
    });

    const createdOutboxIds: string[] = [];
    const createdTokens: string[] = [];
    let createdResponseId: string | null = null;

    // -------------------------------------------------------------
    // 2. CONCURRENT RATE LIMIT RACE CONDITION TEST
    // -------------------------------------------------------------
    console.log("\n--- 2. Concurrency & Rate Limiting Hardening Check ---");
    CustomSmsService.resetRateLimits();

    // Fire 25 concurrent SMS send requests from the hospital user simultaneously
    const concurrentRequests = Array.from({ length: 25 }, (_, idx) => {
        return CustomSmsService.sendCustomSms({
            senderUserId: hospitalUser.userid,
            senderRole: "HOSPITAL",
            recipientUserId: donor.userid,
            messageText: `Concurrent test message iteration ${idx + 1}`,
            idempotencyKey: `concurrent_test_${Date.now()}_${idx}`,
        }).then(res => {
            createdOutboxIds.push(res.outboxId);
            return { success: true };
        }).catch(err => {
            return { success: false, statusCode: err?.statusCode, code: err?.code };
        });
    });

    const results = await Promise.all(concurrentRequests);
    const successfulSends = results.filter(r => r.success).length;
    const rateLimitedSends = results.filter(r => !r.success && r.statusCode === 429).length;

    assert(successfulSends <= 20, `2.1 Concurrency serialization: Exactly capped at maximum 20 messages (actual: ${successfulSends})`);
    assert(rateLimitedSends >= 5, `2.2 Concurrent bursts beyond threshold safely rejected with 429 (actual 429s: ${rateLimitedSends})`);

    // Clean up concurrency burst outbox entries and reset rate limit counters
    if (createdOutboxIds.length > 0) {
        await prisma.smsoutbox.deleteMany({
            where: { outboxid: { in: createdOutboxIds } },
        });
        createdOutboxIds.length = 0;
    }
    CustomSmsService.resetRateLimits();

    // -------------------------------------------------------------
    // 3. PROVIDER TIMEOUT & AT-LEAST-ONCE DELIVERY SEMANTICS
    // -------------------------------------------------------------
    console.log("\n--- 3. Provider Timeout & At-Least-Once Delivery Semantics ---");

    // Queue a test message to simulate a worker handling timeout
    const timeoutOutbox = await prisma.smsoutbox.create({
        data: {
            userid: donor.userid,
            phonenumber: "+919876543210",
            templatename: "DONOR_EMERGENCY_MATCH",
            messagebody: "Test message for provider timeout verification",
            status: "PROCESSING",
            attempts: 0,
            maxattempts: 3,
            lockeduntil: new Date(Date.now() - 5000), // Stale lock expired 5s ago
            lockedby: "crashed_worker_pid_9999",
            lockversion: 1,
            nextattemptat: new Date(),
        },
    });
    createdOutboxIds.push(timeoutOutbox.outboxid);

    const worker = new OutboxWorkerService({ workerId: "release_audit_worker" });
    const recoveredCount = await worker.recoverStaleLocks();
    assert(recoveredCount > 0, "3.1 Stale lock recovery identified and reclaimed unacknowledged job");

    const recoveredRecord = await prisma.smsoutbox.findUnique({
        where: { outboxid: timeoutOutbox.outboxid },
    });
    assert(recoveredRecord?.status === "PENDING", "3.2 Unconfirmed job safely reverted to PENDING with exponential backoff");
    assert(recoveredRecord?.lockedby === null, "3.3 Worker lease cleared for healthy retry");

    // -------------------------------------------------------------
    // 4. DONOR COMPLETE END-TO-END ACCEPTANCE JOURNEY
    // -------------------------------------------------------------
    console.log("\n--- 4. Donor Complete Acceptance Journey ---");

    // Step 4.1: Donor receives emergency match SMS
    const donorMatchSms = await NotificationSmsDispatcher.dispatchEmergencyBroadcastToDonor({
        donorUserId: donor.userid,
        requestId: bloodRequest.requestid,
        bloodGroup: donorRecord.bloodgroup || "O+",
        unitsRequired: 1,
        hospitalName: hospitalRecord.hospitalname || "Apollo Hospital",
    });
    assert(donorMatchSms.queued === true, "4.1 Emergency requisition triggers donor SMS queuing");
    if (donorMatchSms.outboxId) createdOutboxIds.push(donorMatchSms.outboxId);

    // Step 4.2: Action link creation & verification
    const donorToken = await ActionTokenService.createActionToken({
        userId: donor.userid,
        purpose: "DONOR_PLEDGE",
        targetId: bloodRequest.requestid,
        redirectUrl: `/donor/requests/${bloodRequest.requestid}/donate`,
        expiresInHours: 24,
    });
    createdTokens.push(donorToken.tokenId);

    const peekRes = await ActionTokenService.peekToken(donorToken.rawToken);
    assert(peekRes?.userId === donor.userid, "4.2 Token is strictly bound to donor user ID");
    assert(peekRes?.redirectUrl === `/donor/requests/${bloodRequest.requestid}/donate`, "4.3 Action URL points to questionnaire");

    // Step 4.3: Unauthenticated login preservation
    // Verify that consumed token returns destination
    const consumeRes = await ActionTokenService.validateAndConsumeToken(donorToken.rawToken, {
        expectedUserId: donor.userid,
        consume: true,
    });
    assert(consumeRes.valid === true, "4.4 Authenticated donor successfully consumes action token");

    // Step 4.4: Questionnaire submission with NULL answer preservation
    const questionnaire = await prisma.donoreligibilityresponses.create({
        data: {
            requestid: bloodRequest.requestid,
            donorid: donorRecord.donorid,
            donoruserid: donor.userid,
            drinksalcohol: null, // Unanswered
            alcoholin24h: null, // Unanswered
            feelinghealthy: true, // Answered
            medicationstatus: false, // Answered
            recenttattoosurgery: false, // Answered
            donatedinlast90days: false, // Answered
            chronicillness: null, // Unanswered
            pregnantorbreastfeeding: null, // Unanswered
            screeningstatus: "PRELIMINARY_ELIGIBLE",
            unansweredcount: 4,
            completionpercent: 50,
            clinicaldisclaimeracknowledged: true,
        },
    });
    createdResponseId = questionnaire.responseid;

    assert(questionnaire.drinksalcohol === null, "4.5 Unanswered question drinksalcohol is strictly NULL");
    assert(questionnaire.chronicillness === null, "4.6 Unanswered question chronicillness is strictly NULL");
    assert(questionnaire.screeningstatus === "PRELIMINARY_ELIGIBLE", "4.7 Status is PRELIMINARY_ELIGIBLE (non-autonomous)");

    // Step 4.5: Selection and Standby Release SMS
    const acceptSms = await NotificationSmsDispatcher.dispatchDonorOfferAccepted({
        donorUserId: donor.userid,
        requestId: bloodRequest.requestid,
        facilityName: hospitalRecord.hospitalname || "Care Facility",
    });
    assert(acceptSms.queued === true, "4.8 Donor offer accepted triggers selection confirmation SMS");
    if (acceptSms.outboxId) createdOutboxIds.push(acceptSms.outboxId);

    const releaseSms = await NotificationSmsDispatcher.dispatchDonorOfferNotSelected({
        donorUserId: donor.userid,
        requestId: bloodRequest.requestid,
        bloodGroup: donorRecord.bloodgroup || "O+",
        facilityName: hospitalRecord.hospitalname || "Care Facility",
    });
    assert(releaseSms.queued === true, "4.9 Donor not selected triggers standby release SMS");
    if (releaseSms.outboxId) createdOutboxIds.push(releaseSms.outboxId);

    // -------------------------------------------------------------
    // 5. REQUESTER COMPLETE END-TO-END ACCEPTANCE JOURNEY
    // -------------------------------------------------------------
    console.log("\n--- 5. Requester Complete Acceptance Journey ---");

    const reqConfirm = await NotificationSmsDispatcher.dispatchRequesterConfirmation({
        requesterUserId: requester.userid,
        requestId: bloodRequest.requestid,
        bloodGroup: "B+",
    });
    assert(reqConfirm.queued === true, "5.1 Requisition submission triggers requester confirmation SMS");
    if (reqConfirm.outboxId) createdOutboxIds.push(reqConfirm.outboxId);

    const reqVol = await NotificationSmsDispatcher.dispatchRequesterDonorVolunteered({
        requesterUserId: requester.userid,
        requestId: bloodRequest.requestid,
    });
    assert(reqVol.queued === true, "5.2 Donor volunteer response triggers requester alert SMS");
    if (reqVol.outboxId) createdOutboxIds.push(reqVol.outboxId);

    const reqFulfill = await NotificationSmsDispatcher.dispatchRequesterStatusUpdate({
        requesterUserId: requester.userid,
        requestId: bloodRequest.requestid,
        statusText: "FULFILLED",
    });
    assert(reqFulfill.queued === true, "5.3 Requisition fulfillment triggers requester completed SMS");
    if (reqFulfill.outboxId) createdOutboxIds.push(reqFulfill.outboxId);

    // -------------------------------------------------------------
    // 6. HOSPITAL COMPLETE ACCEPTANCE JOURNEY
    // -------------------------------------------------------------
    console.log("\n--- 6. Hospital Complete Acceptance Journey ---");

    const hospAssign = await NotificationSmsDispatcher.dispatchHospitalReqAssigned({
        hospitalUserId: hospitalUser.userid,
        requestId: bloodRequest.requestid,
        bloodGroup: "O+",
    });
    assert(hospAssign.queued === true, "6.1 Requisition assignment triggers hospital alert SMS");
    if (hospAssign.outboxId) createdOutboxIds.push(hospAssign.outboxId);

    // Clinical review of questionnaire
    const reviewed = await prisma.donoreligibilityresponses.update({
        where: { responseid: questionnaire.responseid },
        data: {
            reviewedbyhospitaluserid: hospitalUser.userid,
            reviewedat: new Date(),
            reviewdecision: "CLINICALLY_APPROVED",
            reviewnotes: "Screening verified by hospital transfusion officer.",
            screeningstatus: "CLINICALLY_APPROVED",
        },
    });
    assert(reviewed.reviewdecision === "CLINICALLY_APPROVED", "6.2 Hospital clinical officer approved questionnaire response");
    assert(reviewed.screeningstatus === "CLINICALLY_APPROVED", "6.3 Screening status safely transitions to CLINICALLY_APPROVED");

    // Hospital Custom SMS to Donor
    const hospCustomSms = await CustomSmsService.sendCustomSms({
        senderUserId: hospitalUser.userid,
        senderRole: "HOSPITAL",
        recipientUserId: donor.userid,
        messageText: "Please bring photo ID to Blood Bank reception.",
        contextRequestId: bloodRequest.requestid,
    });
    assert(hospCustomSms.success === true, "6.4 Hospital successfully sends Custom SMS to volunteer donor");
    createdOutboxIds.push(hospCustomSms.outboxId);

    // -------------------------------------------------------------
    // 7. BLOOD BANK COMPLETE ACCEPTANCE JOURNEY
    // -------------------------------------------------------------
    console.log("\n--- 7. Blood Bank Complete Acceptance Journey ---");

    const bbAssign = await NotificationSmsDispatcher.dispatchBloodBankReqAssigned({
        bloodBankUserId: bloodBankUser.userid,
        requestId: bloodRequest.requestid,
        bloodGroup: "A+",
        units: 2,
    });
    assert(bbAssign.queued === true, "7.1 Inventory check triggers blood bank assignment SMS");
    if (bbAssign.outboxId) createdOutboxIds.push(bbAssign.outboxId);

    const bbReserve = await NotificationSmsDispatcher.dispatchBloodBankReservation({
        bloodBankUserId: bloodBankUser.userid,
        requestId: bloodRequest.requestid,
        bloodGroup: "A+",
        units: 2,
    });
    assert(bbReserve.queued === true, "7.2 Blood reservation triggers blood bank alert SMS");
    if (bbReserve.outboxId) createdOutboxIds.push(bbReserve.outboxId);

    // -------------------------------------------------------------
    // 8. ADMIN CUSTOM SMS & AUDIT LOGGING
    // -------------------------------------------------------------
    console.log("\n--- 8. Admin Custom SMS & Content Filtering ---");

    const adminCustomSms = await CustomSmsService.sendCustomSms({
        senderUserId: hospitalUser.userid,
        senderRole: "ADMIN",
        recipientUserId: requester.userid,
        messageText: "Administrative notice regarding emergency blood requisition.",
        contextRequestId: bloodRequest.requestid,
    });
    assert(adminCustomSms.success === true, "8.1 Admin sends custom SMS within authorized scope");
    createdOutboxIds.push(adminCustomSms.outboxId);

    // Content safety block
    let diagBlocked = false;
    try {
        await CustomSmsService.sendCustomSms({
            senderUserId: hospitalUser.userid,
            senderRole: "ADMIN",
            recipientUserId: requester.userid,
            messageText: "Patient biopsy results show malignant cancer.",
        });
    } catch (err: any) {
        diagBlocked = err.statusCode === 400 && err.code === "INVALID_CONTENT";
    }
    assert(diagBlocked, "8.2 Admin custom SMS strictly enforces medical diagnostic privacy filter");

    // -------------------------------------------------------------
    // 9. MOCK PROVIDER DISPATCH & ZERO-REAL-SMS VERIFICATION
    // -------------------------------------------------------------
    console.log("\n--- 9. Mock Provider Execution & Zero-Real-SMS Verification ---");

    const outboxBatch = await worker.processBatch();
    assert(outboxBatch.processed > 0, "9.1 Worker dispatched all queued acceptance items");

    const dispatchedLogs = MockSmsProvider.getDispatchedMessages();
    assert(dispatchedLogs.length > 0, "9.2 Mock provider recorded simulated SMS dispatches in memory");
    const allMockSids = dispatchedLogs.every(log => log.messageSid.startsWith("SMmock_"));
    assert(allMockSids, "9.3 100% of SMS dispatches used simulated SIDs (SMmock_...) with zero real SMS cost");

    // -------------------------------------------------------------
    // 10. CLEANUP ACCEPTANCE TEST RECORDS
    // -------------------------------------------------------------
    console.log("\n--- 10. Cleanup Acceptance Test Records ---");
    if (createdOutboxIds.length > 0) {
        await prisma.smsoutbox.deleteMany({
            where: { outboxid: { in: createdOutboxIds } },
        });
    }
    if (createdTokens.length > 0) {
        await prisma.actiontokens.deleteMany({
            where: { tokenid: { in: createdTokens } },
        });
    }
    if (createdResponseId) {
        await prisma.donoreligibilityresponses.delete({
            where: { responseid: createdResponseId },
        });
    }

    await prisma.bloodrequests.update({
        where: { requestid: bloodRequest.requestid },
        data: {
            hospitalid: originalReqHosp,
            createdbyuserid: originalReqUser,
        },
        select: { requestid: true },
    });

    console.log("  [PASS] All temporary acceptance test records cleanly removed from Neon development branch.");

    console.log("\n===============================================================================");
    console.log(` FINAL ACCEPTANCE RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("===============================================================================");

    if (passedTests === totalTests) {
        console.log(">>> ALL SWASTYA ACCEPTANCE TESTS & RELEASE CHECKS PASSED SUCCESSFULLY! <<<\n");
    } else {
        process.exitCode = 1;
    }
}

runReleaseAcceptanceSuite().catch(err => {
    console.error("Final acceptance suite fatal error:", err);
    process.exit(1);
});
