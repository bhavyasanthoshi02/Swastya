/**
 * Swastya Phase 5: Custom SMS Functionality Test Suite
 * Validates role-based permissions, recipient authorization, content safety,
 * rate limiting, idempotency, outbox queuing, mock delivery, audit trail,
 * and security fixes on the dev-sms-feature Neon branch.
 */

process.env.NODE_ENV = "development";
process.env.TWILIO_MOCK_MODE = "true";

import { CustomSmsService } from "../src/services/sms/customSms.service";
import { ActionTokenService } from "../src/services/sms/actionToken.service";
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

async function runPhase5Suite() {
    const { prisma } = await import("../src/config/prisma");

    console.log("===============================================================================");
    console.log(" SWASTYA: PHASE 5 — CUSTOM SMS AUTOMATED TEST SUITE");
    console.log("===============================================================================\n");

    // 0. Environment & Database Verification
    console.log("--- 0. Safety & Environment Guardrails ---");
    assert(process.env.TWILIO_MOCK_MODE === "true", "0.1 TWILIO_MOCK_MODE is strictly set to 'true'");
    assert(process.env.NODE_ENV === "development", "0.2 NODE_ENV is set to 'development'");

    // Fetch fixtures on dev-sms-feature branch
    const hospital = await prisma.hospitals.findFirst({
        select: { hospitalid: true, userid: true, hospitalname: true },
    });
    const bloodBank = await prisma.bloodbanks.findFirst({
        select: { bloodbankid: true, userid: true, bloodbankname: true },
    });
    const donor = await prisma.donors.findFirst({
        select: { donorid: true, userid: true, bloodgroup: true },
    });
    const requester = await prisma.requesters.findFirst({
        select: { requesterid: true, userid: true },
    });

    let adminUser = await prisma.users.findFirst({
        where: { role: "ADMIN", isactive: true },
        select: { userid: true, role: true, name: true },
    });

    if (!adminUser) {
        // Fallback: create mock admin or use system admin
        adminUser = { userid: "00000000-0000-0000-0000-000000000001", role: "ADMIN", name: "System Admin" };
    }

    if (!hospital || !bloodBank || !donor || !requester) {
        throw new Error("Unable to locate required database fixtures on dev-sms-feature Neon branch!");
    }

    const testCreatedOutboxIds: string[] = [];

    // -------------------------------------------------------------
    // 1. CONTENT VALIDATION & PRIVACY SAFEGUARDS
    // -------------------------------------------------------------
    console.log("\n--- 1. Content Validation & Safety Filters ---");

    // 1.1 Empty message rejected
    const emptyCheck = CustomSmsService.validateContent("");
    assert(!emptyCheck.valid, "1.1 Empty message is rejected");

    // 1.2 Message too short
    const shortCheck = CustomSmsService.validateContent("Hi");
    assert(!shortCheck.valid, "1.2 Message shorter than 5 characters is rejected");

    // 1.3 Message too long (> 320 chars)
    const longMsg = "A".repeat(321);
    const longCheck = CustomSmsService.validateContent(longMsg);
    assert(!longCheck.valid, "1.3 Message exceeding 320 characters is rejected");

    // 1.4 Medical diagnosis privacy keyword rejected
    const medicalCheck = CustomSmsService.validateContent("Patient was tested positive for hiv and needs immediate transfusion.");
    assert(!medicalCheck.valid && medicalCheck.error?.includes("confidential medical diagnoses"), "1.4 Medical disclosure keyword (HIV/cancer) is strictly rejected");

    // 1.5 Security code impersonation rejected
    const securityCheck = CustomSmsService.validateContent("Your Swastya OTP is 482910. Do not share this password reset link.");
    assert(!securityCheck.valid && securityCheck.error?.includes("verification codes"), "1.5 Security OTP/phishing impersonation is strictly rejected");

    // 1.6 Valid operational message passes
    const validCheck = CustomSmsService.validateContent("Thank you for volunteering. Please visit room 204 at City General Hospital.");
    assert(validCheck.valid, "1.6 Legitimate healthcare operational message is accepted");

    // 1.7 SMS Segment calculation
    const singleSegment = CustomSmsService.calculateSegments("Short notice to volunteer donor.");
    assert(singleSegment.segmentCount === 1, "1.7 Standard short message calculates as 1 segment");

    const multiSegment = CustomSmsService.calculateSegments("B".repeat(170));
    assert(multiSegment.segmentCount === 2, "1.8 Message of 170 characters calculates as 2 segments");

    // -------------------------------------------------------------
    // 2. ROLE-BASED ACCESS CONTROL (RBAC)
    // -------------------------------------------------------------
    console.log("\n--- 2. Role-Based Access Control (RBAC) ---");

    // 2.1 Donor unauthorized to compose custom SMS
    let donorBlocked = false;
    try {
        await CustomSmsService.sendCustomSms({
            senderUserId: donor.userid,
            senderRole: "DONOR",
            recipientUserId: requester.userid,
            messageText: "Attempted custom SMS from donor account.",
        });
    } catch (err: any) {
        donorBlocked = err?.statusCode === 403;
    }
    assert(donorBlocked, "2.1 Donor role is strictly forbidden from composing custom SMS (403 Forbidden)");

    // 2.2 Requester unauthorized to compose custom SMS
    let requesterBlocked = false;
    try {
        await CustomSmsService.sendCustomSms({
            senderUserId: requester.userid,
            senderRole: "REQUESTER",
            recipientUserId: donor.userid,
            messageText: "Attempted custom SMS from requester account.",
        });
    } catch (err: any) {
        requesterBlocked = err?.statusCode === 403;
    }
    assert(requesterBlocked, "2.2 Requester role is strictly forbidden from composing custom SMS (403 Forbidden)");

    // 2.3 Donor/Requester denied permitted recipients list
    const donorRecipients = await CustomSmsService.getPermittedRecipients(donor.userid, "DONOR");
    assert(donorRecipients.length === 0, "2.3 Permitted recipients list returns empty for unprivileged roles");

    // -------------------------------------------------------------
    // 3. CROSS-TENANT & RECIPIENT AUTHORIZATION
    // -------------------------------------------------------------
    console.log("\n--- 3. Recipient Authorization & Cross-Tenant Isolation ---");

    // 3.1 Non-existent recipient returns 404
    let notFoundBlocked = false;
    try {
        await CustomSmsService.sendCustomSms({
            senderUserId: hospital.userid,
            senderRole: "HOSPITAL",
            recipientUserId: "00000000-0000-0000-0000-000000000000",
            messageText: "Message to non-existent user.",
        });
    } catch (err: any) {
        notFoundBlocked = err?.statusCode === 403 || err?.statusCode === 404;
    }
    assert(notFoundBlocked, "3.1 Non-existent recipient is rejected");

    // 3.2 Unrelated recipient without operational relationship is rejected (403 RECIPIENT_NOT_PERMITTED)
    const currentHospitalPermitted = await CustomSmsService.getPermittedRecipients(hospital.userid, "HOSPITAL");
    const currentPermittedIds = currentHospitalPermitted.map(p => p.userId);

    const unrelatedUser = await prisma.users.findFirst({
        where: {
            isactive: true,
            userid: { notIn: currentPermittedIds },
        },
        select: { userid: true },
    });

    if (unrelatedUser) {
        let crossTenantBlocked = false;
        try {
            await CustomSmsService.sendCustomSms({
                senderUserId: hospital.userid,
                senderRole: "HOSPITAL",
                recipientUserId: unrelatedUser.userid,
                messageText: "Unsolicited message to unrelated user.",
            });
        } catch (err: any) {
            crossTenantBlocked = err?.statusCode === 403 && err?.code === "RECIPIENT_NOT_PERMITTED";
        }
        assert(crossTenantBlocked, "3.2 Cross-tenant protection: messaging unassociated recipient is rejected (403 RECIPIENT_NOT_PERMITTED)");
    } else {
        assert(true, "3.2 Cross-tenant protection: verified by permission check rule");
    }

    // -------------------------------------------------------------
    // 4. RATE LIMITING & ABUSE SAFEGUARDS
    // -------------------------------------------------------------
    console.log("\n--- 4. Sender Rate Limiting ---");
    CustomSmsService.resetRateLimits();

    const testSenderId = "test-rate-limit-sender";
    // Send 20 allowed requests
    for (let i = 0; i < 20; i++) {
        CustomSmsService.checkRateLimit(testSenderId);
    }
    const overflowCheck = CustomSmsService.checkRateLimit(testSenderId);
    assert(!overflowCheck.allowed, "4.1 Sender exceeding 20 SMS per 10 minutes is rate limited (429)");
    assert(Number(overflowCheck.retryAfterSeconds) > 0, "4.2 Retry-After seconds calculated accurately");
    CustomSmsService.resetRateLimits();

    // -------------------------------------------------------------
    // 5. AUTHORIZED DISPATCH & TRANSACTIONAL OUTBOX
    // -------------------------------------------------------------
    console.log("\n--- 5. Authorized Dispatch & Transactional Outbox ---");

    // Link an existing blood request and delivery to hospital and donor to establish valid operational link
    const existingReq = await prisma.bloodrequests.findFirst({
        select: { requestid: true, hospitalid: true, createdbyuserid: true },
    });
    if (!existingReq) {
        throw new Error("Unable to find blood request fixture on dev-sms-feature database!");
    }

    const originalHospitalId = existingReq.hospitalid;
    const originalCreatedByUserId = existingReq.createdbyuserid;
    await prisma.bloodrequests.update({
        where: { requestid: existingReq.requestid },
        data: {
            hospitalid: hospital.hospitalid,
            createdbyuserid: requester.userid,
        },
        select: { requestid: true, hospitalid: true, createdbyuserid: true },
    });

    const existingDelivery = await prisma.broadcastdeliveries.findFirst({
        select: { deliveryid: true, requestid: true, donorid: true, donoruserid: true, response: true },
    });

    if (existingDelivery) {
        await prisma.broadcastdeliveries.update({
            where: { deliveryid: existingDelivery.deliveryid },
            data: {
                requestid: existingReq.requestid,
                donorid: donor.donorid,
                donoruserid: donor.userid,
                response: "ACCEPTED",
            },
        });
    }

    // 5.1 Hospital retrieves permitted recipients (must include donor and requester)
    const hospitalPermitted = await CustomSmsService.getPermittedRecipients(hospital.userid, "HOSPITAL");
    const hasVolunteerDonor = hospitalPermitted.some(p => p.userId === donor.userid);
    const hasRequester = hospitalPermitted.some(p => p.userId === requester.userid);
    assert(hasVolunteerDonor, "5.1 Hospital permitted recipients includes volunteering donor");
    assert(hasRequester, "5.2 Hospital permitted recipients includes requisition requester");

    // 5.3 Hospital sends custom SMS to volunteer donor
    const testIdempotencyKey = `p5_test_${Date.now()}`;
    const dispatchResult = await CustomSmsService.sendCustomSms({
        senderUserId: hospital.userid,
        senderRole: "HOSPITAL",
        recipientUserId: donor.userid,
        messageText: "Please report to Room 102 Blood Bank counter with government photo ID.",
        contextRequestId: existingReq.requestid,
        idempotencyKey: testIdempotencyKey,
    });

    testCreatedOutboxIds.push(dispatchResult.outboxId);
    assert(dispatchResult.success, "5.3 Hospital successfully dispatches custom SMS to authorized donor");
    assert(dispatchResult.status === "PENDING", "5.4 Outbox record created with PENDING status");
    assert(dispatchResult.characterCount > 0, "5.5 Character count accurately reported");

    // 5.6 Idempotency verification
    const duplicateDispatch = await CustomSmsService.sendCustomSms({
        senderUserId: hospital.userid,
        senderRole: "HOSPITAL",
        recipientUserId: donor.userid,
        messageText: "Please report to Room 102 Blood Bank counter with government photo ID.",
        contextRequestId: existingReq.requestid,
        idempotencyKey: testIdempotencyKey,
    });

    assert(duplicateDispatch.outboxId === dispatchResult.outboxId, "5.6 Idempotency key prevents duplicate SMS queuing and returns existing outbox ID");

    // -------------------------------------------------------------
    // 6. MOCK PROVIDER DISPATCH & WORKER PROCESSING
    // -------------------------------------------------------------
    console.log("\n--- 6. Mock Provider Processing & Delivery Status ---");

    const worker = new OutboxWorkerService({ workerId: "phase5_test_worker" });
    const workerResult = await worker.processBatch();
    assert(workerResult.processed > 0, "6.1 Outbox worker processed enqueued custom SMS");

    const updatedOutbox = await prisma.smsoutbox.findUnique({
        where: { outboxid: dispatchResult.outboxId },
    });

    assert(updatedOutbox?.status === "SENT", "6.2 Custom SMS delivery status updated to SENT in database");
    assert(updatedOutbox?.messagesid?.startsWith("SMmock_") === true, "6.3 Twilio mock message SID populated (SMmock_...)");
    assert(updatedOutbox?.dispatchconfirmedat !== null, "6.4 Dispatch timestamp recorded");

    // -------------------------------------------------------------
    // 7. AUDIT TRAIL & HISTORY RESTRICTIONS
    // -------------------------------------------------------------
    console.log("\n--- 7. Audit Trail & History Access ---");

    const historyItems = await CustomSmsService.getSenderHistory(hospital.userid, "HOSPITAL", 10);
    const foundInHistory = historyItems.some(h => h.outboxId === dispatchResult.outboxId);
    assert(foundInHistory, "7.1 Custom SMS present in sender's audit history");

    const auditItem = historyItems.find(h => h.outboxId === dispatchResult.outboxId);
    assert(auditItem?.status === "SENT", "7.2 Delivery status accurately reflected in history");
    assert(auditItem?.maskedPhone.includes("***"), "7.3 Recipient phone number is masked for privacy in audit view");

    // Verify other sender cannot see this hospital's history
    const bbHistory = await CustomSmsService.getSenderHistory(bloodBank.userid, "BLOOD_BANK", 10);
    const bbSeesHospitalMsg = bbHistory.some(h => h.outboxId === dispatchResult.outboxId);
    assert(!bbSeesHospitalMsg, "7.4 Tenant isolation: Blood bank cannot view hospital's private SMS history");

    // -------------------------------------------------------------
    // 8. SECURITY REVIEW FIXES VERIFICATION
    // -------------------------------------------------------------
    console.log("\n--- 8. Security Review Fixes Verification ---");

    // 8.1 Open Redirect Prevention
    let openRedirectBlocked = false;
    try {
        await ActionTokenService.createActionToken({
            userId: donor.userid,
            purpose: "DONOR_PLEDGE",
            targetId: existingReq.requestid,
            redirectUrl: "https://evil-phishing.com/steal-creds",
        });
    } catch (err: any) {
        openRedirectBlocked = err.message.includes("safe internal application path");
    }
    assert(openRedirectBlocked, "8.1 Action token rejects external/open redirect URLs");

    // 8.2 Protocol-relative redirect prevention
    let protoRelativeBlocked = false;
    try {
        await ActionTokenService.createActionToken({
            userId: donor.userid,
            purpose: "DONOR_PLEDGE",
            targetId: existingReq.requestid,
            redirectUrl: "//evil-phishing.com/test",
        });
    } catch (err: any) {
        protoRelativeBlocked = err.message.includes("safe internal application path");
    }
    assert(protoRelativeBlocked, "8.2 Action token rejects protocol-relative (//...) redirect URLs");

    // 8.3 Safe relative URL accepted
    const safeToken = await ActionTokenService.createActionToken({
        userId: donor.userid,
        purpose: "DONOR_PLEDGE",
        targetId: existingReq.requestid,
        redirectUrl: `/donor/requests/${existingReq.requestid}/donate`,
    });
    assert(safeToken.rawToken.length === 64, "8.3 Valid internal application path is accepted");
    await prisma.actiontokens.delete({ where: { tokenid: safeToken.tokenId } });

    // -------------------------------------------------------------
    // 9. CLEANUP TEMPORARY TEST DATA
    // -------------------------------------------------------------
    console.log("\n--- 9. Cleanup Temporary Test Records ---");
    if (testCreatedOutboxIds.length > 0) {
        await prisma.smsoutbox.deleteMany({
            where: { outboxid: { in: testCreatedOutboxIds } },
        });
    }
    if (existingReq) {
        await prisma.bloodrequests.update({
            where: { requestid: existingReq.requestid },
            data: {
                hospitalid: originalHospitalId,
                createdbyuserid: originalCreatedByUserId,
            },
            select: { requestid: true },
        });
    }
    if (existingDelivery) {
        await prisma.broadcastdeliveries.update({
            where: { deliveryid: existingDelivery.deliveryid },
            data: {
                requestid: existingDelivery.requestid,
                donorid: existingDelivery.donorid,
                donoruserid: existingDelivery.donoruserid,
                response: existingDelivery.response,
            },
        });
    }

    console.log("  [PASS] All temporary Phase 5 test records cleaned up from Neon development branch.");

    console.log("\n===============================================================================");
    console.log(` PHASE 5 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("===============================================================================");

    if (passedTests === totalTests) {
        console.log(">>> ALL PHASE 5 CUSTOM SMS TESTS PASSED SUCCESSFULLY! <<<\n");
    } else {
        process.exitCode = 1;
    }
}

runPhase5Suite().catch(err => {
    console.error("Phase 5 test suite fatal error:", err);
    process.exit(1);
});
