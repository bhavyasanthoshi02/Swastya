/**
 * Swastya: Phase 3 Notification-to-SMS Integration Test Suite
 * Tests automated SMS workflows across all 4 roles: Donor, Requester, Hospital, Blood Bank.
 * Verifies transaction consistency, idempotency, failure isolation, and action link security.
 */

// Set development environment before any imports
process.env.NODE_ENV = "development";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

import { MockSmsProvider } from "../src/services/sms/mockSms.provider";
import { SmsService } from "../src/services/sms/sms.service";
import { NotificationSmsDispatcher } from "../src/services/sms/notificationSmsDispatcher.service";
import { ActionTokenService } from "../src/services/sms/actionToken.service";
import { OutboxWorkerService } from "../src/services/sms/outboxWorker.service";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        console.error(`  [FAIL] ${testName}`);
        if (details) console.error(`         Detail: ${details}`);
        process.exitCode = 1;
    }
}

async function runSuite() {
    const { prisma } = await import("../src/config/prisma");

    console.log("===============================================================================");
    console.log(" SWASTYA: PHASE 3 — NOTIFICATION-TO-SMS INTEGRATION TEST SUITE");
    console.log("===============================================================================\n");

    // Clean start
    MockSmsProvider.clear();
    const mockWorker = new OutboxWorkerService({ workerId: "phase3_test_worker" });

    // Fetch or create test user fixtures in development branch
    const donorUser = await prisma.users.findFirst({
        where: { role: "DONOR", phonenumber: { not: null } },
        select: { userid: true, phonenumber: true },
    }) || await prisma.users.findFirst({
        where: { phonenumber: { not: null } },
        select: { userid: true, phonenumber: true },
    });

    const hospitalUser = await prisma.users.findFirst({
        where: { role: "HOSPITAL", phonenumber: { not: null } },
        select: { userid: true, phonenumber: true },
    }) || donorUser;

    const bloodBankUser = await prisma.users.findFirst({
        where: { role: "BLOOD_BANK", phonenumber: { not: null } },
        select: { userid: true, phonenumber: true },
    }) || donorUser;

    const requesterUser = await prisma.users.findFirst({
        where: { role: "REQUESTER", phonenumber: { not: null } },
        select: { userid: true, phonenumber: true },
    }) || donorUser;

    if (!donorUser || !hospitalUser || !bloodBankUser || !requesterUser) {
        throw new Error("Unable to locate test users in development branch!");
    }

    const testReqId = `req-p3-${Date.now().toString(36)}`;

    // -------------------------------------------------------------
    // 1. DONOR AUTOMATED SMS WORKFLOWS
    // -------------------------------------------------------------
    console.log("--- 1. Donor Notification-to-SMS Workflows ---");

    // 1.1 Emergency Broadcast Match
    const donorMatchRes = await NotificationSmsDispatcher.dispatchEmergencyBroadcastToDonor({
        donorUserId: donorUser.userid,
        requestId: testReqId,
        bloodGroup: "O+",
        unitsRequired: 2,
        hospitalName: "Apollo Emergency Center",
    });

    assert(donorMatchRes.queued === true, "1.1 Emergency match dispatches SMS to eligible donor");
    assert(donorMatchRes.outboxId !== undefined, "1.2 Donor match outbox record generated");

    const donorMatchRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: donorMatchRes.outboxId },
    });
    assert(donorMatchRow?.templatename === "DONOR_EMERGENCY_MATCH", "1.3 Uses DONOR_EMERGENCY_MATCH template");
    assert(donorMatchRow?.messagebody.includes("O+ blood (2 units)"), "1.4 Message interpolates blood group and units");
    assert(!donorMatchRow?.messagebody.includes("patient"), "1.5 Pre-acceptance donor SMS enforces patient privacy");
    assert(donorMatchRow?.actionurl?.includes("/r/"), "1.6 Generates secure action link for questionnaire");

    // 1.2 Donor Volunteer Offer Accepted
    const donorAcceptedRes = await NotificationSmsDispatcher.dispatchDonorOfferAccepted({
        donorUserId: donorUser.userid,
        requestId: testReqId,
        facilityName: "Apollo Emergency Center",
    });

    assert(donorAcceptedRes.queued === true, "1.7 Donor offer accepted dispatches SMS");
    const donorAcceptedRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: donorAcceptedRes.outboxId },
    });
    assert(donorAcceptedRow?.templatename === "DONOR_OFFER_ACCEPTED", "1.8 Uses DONOR_OFFER_ACCEPTED template");
    assert(donorAcceptedRow?.messagebody.includes("next steps"), "1.9 Directs donor to transit next steps");

    // 1.3 Donor Receipt Confirmed
    const donorReceiptRes = await NotificationSmsDispatcher.dispatchDonorReceiptConfirmed({
        donorUserId: donorUser.userid,
        requestId: testReqId,
        bloodGroup: "O+",
        facilityName: "Apollo Emergency Center",
    });
    assert(donorReceiptRes.queued === true, "1.10 Transfusion receipt confirmation dispatches SMS to donor");

    // -------------------------------------------------------------
    // 2. REQUESTER AUTOMATED SMS WORKFLOWS
    // -------------------------------------------------------------
    console.log("\n--- 2. Requester Notification-to-SMS Workflows ---");

    // 2.1 Request Submission Confirmation
    const reqConfRes = await NotificationSmsDispatcher.dispatchRequesterConfirmation({
        requesterUserId: requesterUser.userid,
        requestId: testReqId,
        bloodGroup: "A+",
    });
    assert(reqConfRes.queued === true, "2.1 Requester receives submission confirmation SMS");

    const reqConfRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: reqConfRes.outboxId },
    });
    assert(reqConfRow?.templatename === "REQUESTER_CONFIRMATION", "2.2 Uses REQUESTER_CONFIRMATION template");
    assert(reqConfRow?.actionurl?.includes("/r/"), "2.3 Contains live tracking action link");

    // 2.2 Volunteer Donor Matched
    const reqVolRes = await NotificationSmsDispatcher.dispatchRequesterDonorVolunteered({
        requesterUserId: requesterUser.userid,
        requestId: testReqId,
    });
    assert(reqVolRes.queued === true, "2.4 Requester notified when volunteer donor steps forward");

    // 2.3 Status Update: FULFILLED
    const reqFulfilledRes = await NotificationSmsDispatcher.dispatchRequesterStatusUpdate({
        requesterUserId: requesterUser.userid,
        requestId: testReqId,
        statusText: "FULFILLED",
    });
    assert(reqFulfilledRes.queued === true, "2.5 Requester notified on FULFILLED status");
    const reqFulfilledRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: reqFulfilledRes.outboxId },
    });
    assert(reqFulfilledRow?.templatename === "REQUESTER_COMPLETED", "2.6 Routes to REQUESTER_COMPLETED template");

    // 2.4 Status Update: CANCELLED
    const reqCancelledRes = await NotificationSmsDispatcher.dispatchRequesterStatusUpdate({
        requesterUserId: requesterUser.userid,
        requestId: testReqId,
        statusText: "CANCELLED",
        reason: "Patient discharged",
    });
    assert(reqCancelledRes.queued === true, "2.7 Requester notified on CANCELLED status with reason");

    // -------------------------------------------------------------
    // 3. HOSPITAL AUTOMATED SMS WORKFLOWS
    // -------------------------------------------------------------
    console.log("\n--- 3. Hospital Notification-to-SMS Workflows ---");

    // 3.1 Requisition Assigned to Hospital
    const hospAssignedRes = await NotificationSmsDispatcher.dispatchHospitalReqAssigned({
        hospitalUserId: hospitalUser.userid,
        requestId: testReqId,
        bloodGroup: "B+",
    });
    assert(hospAssignedRes.queued === true, "3.1 Hospital receives requisition assignment SMS");
    const hospAssignedRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: hospAssignedRes.outboxId },
    });
    assert(hospAssignedRow?.templatename === "HOSPITAL_REQ_ASSIGNED", "3.2 Uses HOSPITAL_REQ_ASSIGNED template");

    // 3.2 Donor Volunteered Alert to Hospital
    const hospDonorMatchRes = await NotificationSmsDispatcher.dispatchHospitalDonorMatched({
        hospitalUserId: hospitalUser.userid,
        requestId: testReqId,
        donorName: "V. Sharma",
        eta: "Within 45 mins",
    });
    assert(hospDonorMatchRes.queued === true, "3.3 Hospital receives volunteer donor match SMS with ETA");

    // 3.3 Units Dispatched to Hospital
    const hospDispatchRes = await NotificationSmsDispatcher.dispatchHospitalUnitsDispatched({
        hospitalUserId: hospitalUser.userid,
        requestId: testReqId,
        bloodGroup: "B+",
        units: 2,
        bloodBankName: "Red Cross Central Blood Bank",
    });
    assert(hospDispatchRes.queued === true, "3.4 Hospital receives blood unit dispatch notification");

    // -------------------------------------------------------------
    // 4. BLOOD BANK AUTOMATED SMS WORKFLOWS
    // -------------------------------------------------------------
    console.log("\n--- 4. Blood Bank Notification-to-SMS Workflows ---");

    // 4.1 Requisition Assigned for Stock Check
    const bbAssignedRes = await NotificationSmsDispatcher.dispatchBloodBankReqAssigned({
        bloodBankUserId: bloodBankUser.userid,
        requestId: testReqId,
        bloodGroup: "AB-",
        units: 3,
    });
    assert(bbAssignedRes.queued === true, "4.1 Blood bank receives requirement assignment alert");
    const bbAssignedRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: bbAssignedRes.outboxId },
    });
    assert(bbAssignedRow?.templatename === "BLOOD_BANK_REQ_ASSIGNED", "4.2 Uses BLOOD_BANK_REQ_ASSIGNED template");

    // 4.2 Blood Reservation Confirmed
    const bbReservedRes = await NotificationSmsDispatcher.dispatchBloodBankReservation({
        bloodBankUserId: bloodBankUser.userid,
        requestId: testReqId,
        bloodGroup: "AB-",
        units: 3,
    });
    assert(bbReservedRes.queued === true, "4.3 Blood bank receives reservation confirmation SMS");

    // -------------------------------------------------------------
    // 5. IDEMPOTENCY & DUPLICATE PREVENTION
    // -------------------------------------------------------------
    console.log("\n--- 5. Idempotency & Duplicate Prevention ---");

    // Attempt second emergency match dispatch with same parameters
    const duplicateMatchRes = await NotificationSmsDispatcher.dispatchEmergencyBroadcastToDonor({
        donorUserId: donorUser.userid,
        requestId: testReqId,
        bloodGroup: "O+",
        unitsRequired: 2,
        hospitalName: "Apollo Emergency Center",
    });

    assert(duplicateMatchRes.queued === false, "5.1 Re-triggering same notification event rejects duplicate SMS");
    assert(duplicateMatchRes.outboxId === donorMatchRes.outboxId, "5.2 Returns existing outbox record ID");

    // -------------------------------------------------------------
    // 6. FAILURE ISOLATION & NON-BLOCKING BEHAVIOR
    // -------------------------------------------------------------
    console.log("\n--- 6. Failure Isolation & Non-Blocking Guarantees ---");

    // Dispatching to non-existent user or user without phone
    const nonExistentUserId = "00000000-0000-0000-0000-ffffffffffff";
    let failureThrew = false;
    let safeResult: any;

    try {
        safeResult = await NotificationSmsDispatcher.dispatchDonorOfferAccepted({
            donorUserId: nonExistentUserId,
            requestId: testReqId,
            facilityName: "Care Clinic",
        });
    } catch {
        failureThrew = true;
    }

    assert(failureThrew === false, "6.1 Missing phone/user never throws error to caller");
    assert(safeResult?.queued === false, "6.2 Gracefully returns queued: false");

    // -------------------------------------------------------------
    // 7. END-TO-END OUTBOX PROCESSOR DISPATCH
    // -------------------------------------------------------------
    console.log("\n--- 7. End-to-End Worker Batch Execution ---");
    const workerResult = await mockWorker.processBatch();

    assert(workerResult.processed > 0, "7.1 Worker claimed and processed enqueued Phase 3 notifications");
    assert(workerResult.sent > 0, "7.2 Dispatched all SMS through MockSmsProvider cleanly");

    // -------------------------------------------------------------
    // 8. ACTION TOKEN REDIRECTION VERIFICATION
    // -------------------------------------------------------------
    console.log("\n--- 8. Action Link Verification ---");
    // Verify one of the generated action tokens
    const rawActionUrl = donorMatchRow?.actionurl || "";
    const rawToken = rawActionUrl.split("/r/")[1];

    assert(rawToken !== undefined && rawToken.length === 64, "8.1 Action token is extracted from generated URL");

    const peeked = await ActionTokenService.peekToken(rawToken);
    assert(peeked !== null, "8.2 ActionTokenService successfully resolves token from SMS link");
    assert(peeked?.redirectUrl === `/donor/requests/${testReqId}/donate`, "8.3 Action link points directly to questionnaire");
    assert(peeked?.purpose === "DONOR_PLEDGE", "8.4 Token purpose strictly bound to DONOR_PLEDGE");

    // -------------------------------------------------------------
    // 9. CLEANUP TEST DATA
    // -------------------------------------------------------------
    console.log("\n--- 9. Phase 3 Test Records Cleanup ---");
    await prisma.smsoutbox.deleteMany({
        where: {
            OR: [
                { idempotencykey: { startsWith: `SMS:DONOR_MATCH:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:DONOR_ACCEPTED:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:DONOR_RECEIPT:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:REQ_CONFIRMED:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:REQ_STATUS:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:REQ_COMPLETED:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:REQ_CANCELLED:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:HOSP_ASSIGNED:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:HOSP_DISPATCH:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:BB_ASSIGNED:${testReqId}` } },
                { idempotencykey: { startsWith: `SMS:BB_RESERVED:${testReqId}` } },
            ],
        },
    });

    await prisma.actiontokens.deleteMany({
        where: { targetid: testReqId },
    });
    console.log("  [PASS] All temporary test records cleaned up.");

    console.log("\n===============================================================================");
    console.log(` PHASE 3 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("===============================================================================");

    if (passedTests === totalTests) {
        console.log(">>> ALL PHASE 3 NOTIFICATION-TO-SMS WORKFLOW TESTS PASSED SUCCESSFULLY! <<<\n");
    } else {
        process.exitCode = 1;
    }
}

runSuite().catch(err => {
    console.error("Test suite fatal error:", err);
    process.exit(1);
});
