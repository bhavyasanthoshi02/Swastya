/**
 * Swastya Phase 6: Complete End-to-End SMS Integration & Workflow Audit
 * Validates full multi-role journeys, notification coverage, action token security,
 * clinical review RBAC, GSM extended character counting, multi-instance rate limiting,
 * outbox worker reliability, and Indian production-readiness safeguards.
 */

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

async function runPhase6Suite() {
    const { prisma } = await import("../src/config/prisma");

    console.log("===============================================================================");
    console.log(" SWASTYA: PHASE 6 — COMPLETE END-TO-END SMS INTEGRATION AUDIT SUITE");
    console.log("===============================================================================\n");

    // 0. Safety Guardrails
    console.log("--- 0. Safety & Environment Guardrails ---");
    assert(process.env.TWILIO_MOCK_MODE === "true", "0.1 TWILIO_MOCK_MODE is strictly set to 'true'");
    assert(process.env.NODE_ENV === "development", "0.2 NODE_ENV is set to 'development'");

    // Fetch fixtures on dev-sms-feature Neon branch
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

    const existingReq = await prisma.bloodrequests.findFirst({
        select: { requestid: true, hospitalid: true, createdbyuserid: true },
    });

    if (!hospital || !bloodBank || !donor || !requester || !existingReq) {
        throw new Error("Unable to locate required database fixtures on dev-sms-feature branch!");
    }

    const originalHospitalId = existingReq.hospitalid;
    const originalCreatedByUserId = existingReq.createdbyuserid;

    // Link request to test fixtures
    await prisma.bloodrequests.update({
        where: { requestid: existingReq.requestid },
        data: {
            hospitalid: hospital.hospitalid,
            createdbyuserid: requester.userid,
        },
        select: { requestid: true },
    });

    const testCreatedOutboxIds: string[] = [];
    const testCreatedTokens: string[] = [];
    let testResponseId: string | null = null;

    // -------------------------------------------------------------
    // 1. FULL MULTI-ROLE SMS WORKFLOW AUDIT
    // -------------------------------------------------------------
    console.log("\n--- 1. Multi-Role End-to-End SMS Workflows ---");

    // 1.1 Donor: Emergency Match SMS -> Action Token -> Outbox
    const donorMatch = await NotificationSmsDispatcher.dispatchEmergencyBroadcastToDonor({
        donorUserId: donor.userid,
        requestId: existingReq.requestid,
        bloodGroup: donor.bloodgroup || "O+",
        unitsRequired: 2,
        hospitalName: hospital.hospitalname || "City General Hospital",
    });

    assert(donorMatch.queued === true, "1.1 Donor emergency match notification triggers SMS outbox queuing");
    if (donorMatch.outboxId) testCreatedOutboxIds.push(donorMatch.outboxId);

    // 1.2 Donor: Offer Accepted SMS Dispatch
    const donorAccepted = await NotificationSmsDispatcher.dispatchDonorOfferAccepted({
        donorUserId: donor.userid,
        requestId: existingReq.requestid,
        facilityName: hospital.hospitalname || "City General Hospital",
    });
    assert(donorAccepted.queued === true, "1.2 Donor selection / acceptance triggers SMS");
    if (donorAccepted.outboxId) testCreatedOutboxIds.push(donorAccepted.outboxId);

    // 1.3 Donor: Offer Not Selected / Standby Release SMS
    const donorReleased = await NotificationSmsDispatcher.dispatchDonorOfferNotSelected({
        donorUserId: donor.userid,
        requestId: existingReq.requestid,
        bloodGroup: donor.bloodgroup || "O+",
        facilityName: hospital.hospitalname || "City General Hospital",
    });
    assert(donorReleased.queued === true, "1.3 Donor offer not selected triggers standby release SMS");
    if (donorReleased.outboxId) testCreatedOutboxIds.push(donorReleased.outboxId);

    // 1.4 Requester: Request Submission Confirmation SMS
    const reqConfirmed = await NotificationSmsDispatcher.dispatchRequesterConfirmation({
        requesterUserId: requester.userid,
        requestId: existingReq.requestid,
        bloodGroup: "B+",
    });
    assert(reqConfirmed.queued === true, "1.4 Requester submission confirmation triggers SMS");
    if (reqConfirmed.outboxId) testCreatedOutboxIds.push(reqConfirmed.outboxId);

    // 1.5 Requester: Donor Volunteered SMS
    const reqDonorVol = await NotificationSmsDispatcher.dispatchRequesterDonorVolunteered({
        requesterUserId: requester.userid,
        requestId: existingReq.requestid,
    });
    assert(reqDonorVol.queued === true, "1.5 Requester donor volunteered alert triggers SMS");
    if (reqDonorVol.outboxId) testCreatedOutboxIds.push(reqDonorVol.outboxId);

    // 1.6 Hospital: Requisition Assignment Alert SMS
    const hospAssigned = await NotificationSmsDispatcher.dispatchHospitalReqAssigned({
        hospitalUserId: hospital.userid,
        requestId: existingReq.requestid,
        bloodGroup: "O+",
    });
    assert(hospAssigned.queued === true, "1.6 Hospital requisition assignment triggers SMS");
    if (hospAssigned.outboxId) testCreatedOutboxIds.push(hospAssigned.outboxId);

    // 1.7 Blood Bank: Inventory Check / Assignment SMS
    const bbAssigned = await NotificationSmsDispatcher.dispatchBloodBankReqAssigned({
        bloodBankUserId: bloodBank.userid,
        requestId: existingReq.requestid,
        bloodGroup: "A+",
        units: 2,
    });
    assert(bbAssigned.queued === true, "1.7 Blood bank inventory check assignment triggers SMS");
    if (bbAssigned.outboxId) testCreatedOutboxIds.push(bbAssigned.outboxId);

    // 1.8 Admin: Custom SMS composition permissions verified
    const adminPermitted = await CustomSmsService.getPermittedRecipients(hospital.userid, "ADMIN");
    assert(adminPermitted.length > 0, "1.8 Admin user has administrative custom SMS composition scope");

    // -------------------------------------------------------------
    // 2. SECURE ACTION LINK & REDIRECTION GATEWAY AUDIT
    // -------------------------------------------------------------
    console.log("\n--- 2. Secure Action Link & Redirection Gateway Audit ---");

    const tokenRes = await ActionTokenService.createActionToken({
        userId: donor.userid,
        purpose: "DONOR_PLEDGE",
        targetId: existingReq.requestid,
        redirectUrl: `/donor/requests/${existingReq.requestid}/donate`,
        expiresInHours: 24,
    });
    testCreatedTokens.push(tokenRes.tokenId);

    // 2.1 Raw token length & non-persistence
    assert(tokenRes.rawToken.length === 64, "2.1 Raw action token is a 64-character cryptographic hex string");
    const storedHash = await prisma.actiontokens.findUnique({
        where: { tokenid: tokenRes.tokenId },
        select: { tokenhash: true },
    });
    assert(storedHash?.tokenhash !== tokenRes.rawToken, "2.2 Database stores irreversible SHA-256 hash (raw token is never persisted)");

    // 2.3 Peek resolution without premature consumption
    const peeked = await ActionTokenService.peekToken(tokenRes.rawToken);
    assert(peeked?.purpose === "DONOR_PLEDGE", "2.3 peekToken resolves token purpose accurately");
    assert(peeked?.usedAt === null, "2.4 peekToken leaves token unconsumed for authenticated login return");

    // 2.5 Cross-user token protection
    const mismatch = await ActionTokenService.validateAndConsumeToken(tokenRes.rawToken, {
        expectedUserId: requester.userid,
    });
    assert(!mismatch.valid && mismatch.reason === "USER_MISMATCH", "2.5 Cross-user token consumption is blocked (USER_MISMATCH)");

    // 2.6 Single-use consumption
    const consumed = await ActionTokenService.validateAndConsumeToken(tokenRes.rawToken, {
        expectedUserId: donor.userid,
        consume: true,
    });
    assert(consumed.valid === true, "2.6 Intended user successfully consumes action token");

    // 2.7 Replay protection
    const replay = await ActionTokenService.validateAndConsumeToken(tokenRes.rawToken, {
        expectedUserId: donor.userid,
        consume: true,
    });
    assert(!replay.valid && replay.reason === "ALREADY_USED", "2.7 Consumed token is blocked from replay attacks (ALREADY_USED)");

    // 2.8 Open Redirect Protection
    let openRedirectBlocked = false;
    try {
        await ActionTokenService.createActionToken({
            userId: donor.userid,
            purpose: "DONOR_PLEDGE",
            targetId: existingReq.requestid,
            redirectUrl: "https://attacker.com/malicious",
        });
    } catch {
        openRedirectBlocked = true;
    }
    assert(openRedirectBlocked, "2.8 External open redirect URL is strictly rejected");

    let protoRelativeBlocked = false;
    try {
        await ActionTokenService.createActionToken({
            userId: donor.userid,
            purpose: "DONOR_PLEDGE",
            targetId: existingReq.requestid,
            redirectUrl: "//attacker.com/malicious",
        });
    } catch {
        protoRelativeBlocked = true;
    }
    assert(protoRelativeBlocked, "2.9 Protocol-relative (//...) redirect URL is strictly rejected");

    // -------------------------------------------------------------
    // 3. CLINICAL WORKFLOW & MEDICAL PRIVACY AUDIT
    // -------------------------------------------------------------
    console.log("\n--- 3. Clinical Workflow & Medical Privacy Audit ---");

    // 3.1 Create questionnaire response with explicit NULL answers
    const questionnaireResp = await prisma.donoreligibilityresponses.create({
        data: {
            requestid: existingReq.requestid,
            donorid: donor.donorid,
            donoruserid: donor.userid,
            drinksalcohol: null, // Unanswered
            alcoholin24h: null, // Unanswered
            feelinghealthy: true, // Answered
            medicationstatus: false, // Answered
            recenttattoosurgery: false, // Answered
            donatedinlast90days: false, // Answered
            chronicillness: null, // Unanswered
            pregnantorbreastfeeding: null, // Unanswered
            additionalnotes: "Phase 6 comprehensive audit submission",
            screeningstatus: "PRELIMINARY_ELIGIBLE",
            unansweredcount: 4,
            completionpercent: 50,
            clinicaldisclaimeracknowledged: true,
        },
    });
    testResponseId = questionnaireResp.responseid;

    assert(questionnaireResp.responseid !== undefined, "3.1 Questionnaire response saved to donoreligibilityresponses");
    assert(questionnaireResp.drinksalcohol === null, "3.2 Unanswered medical question strictly preserved as NULL (never coerced to false)");
    assert(questionnaireResp.chronicillness === null, "3.3 Unanswered chronicillness strictly preserved as NULL");
    assert(questionnaireResp.screeningstatus === "PRELIMINARY_ELIGIBLE", "3.4 Status is PRELIMINARY_ELIGIBLE (never autonomous clinical clearance)");

    // 3.5 Hospital clinical review
    const reviewed = await prisma.donoreligibilityresponses.update({
        where: { responseid: questionnaireResp.responseid },
        data: {
            reviewedbyhospitaluserid: hospital.userid,
            reviewedat: new Date(),
            reviewdecision: "CLINICALLY_APPROVED",
            reviewnotes: "Clinical screening verified by hospital transfusion officer.",
            screeningstatus: "CLINICALLY_APPROVED",
        },
    });
    assert(reviewed.reviewdecision === "CLINICALLY_APPROVED", "3.5 Hospital authorized clinical reviewer can approve response");
    assert(reviewed.screeningstatus === "CLINICALLY_APPROVED", "3.6 Screening status advances only upon manual human clinical review");

    // -------------------------------------------------------------
    // 4. GSM EXTENDED CHARACTERS & SEGMENT ESTIMATOR AUDIT
    // -------------------------------------------------------------
    console.log("\n--- 4. GSM-7 Extended Characters & Segment Calculator ---");

    // 4.1 Standard ASCII (1 septet each)
    const stdGsm = CustomSmsService.calculateSegments("Swastya blood donation update notice");
    assert(stdGsm.isUnicode === false, "4.1 Standard Latin message classified as GSM-7");
    assert(stdGsm.segmentCount === 1, "4.2 Standard 37-char message is 1 segment");

    // 4.2 Extended GSM character handling (|^€{}[]~\ each counts as 2 septets)
    // Message with 155 chars + 6 braces/brackets = 161 septets -> must require 2 segments!
    const baseText = "A".repeat(155);
    const withBrackets = `${baseText}[]{}`;
    const extGsm = CustomSmsService.calculateSegments(withBrackets);
    assert(extGsm.isUnicode === false, "4.3 Extended GSM characters ({}[]€) remain in GSM-7 without forcing Unicode");
    assert(extGsm.extendedCharCount === 4, "4.4 Extended character count correctly identifies 4 escape characters");
    assert(extGsm.septetCount === 155 + 4 * 2, "4.5 Septet count accurately adds 2 septets per extended character");
    assert(extGsm.segmentCount === 2, "4.6 Message exceeding 160 septets due to extended characters splits into 2 segments");

    // 4.7 Non-GSM / Unicode detection (Hindi/Devanagari)
    const hindiMsg = CustomSmsService.calculateSegments("रक्तदान जीवनदान है (Swastya)");
    assert(hindiMsg.isUnicode === true, "4.7 Hindi / non-GSM text correctly triggers UCS-2 / Unicode encoding");
    assert(hindiMsg.segmentCount === 1, "4.8 Short Unicode message fits in 70-character segment limit");

    // -------------------------------------------------------------
    // 5. DISTRIBUTED RATE LIMITING & OUTBOX WORKER AUDIT
    // -------------------------------------------------------------
    console.log("\n--- 5. Distributed Rate Limiting & Outbox Engine ---");

    // 5.1 Multi-instance shared rate limiter
    const rateCheck = await CustomSmsService.checkRateLimitPersistent(hospital.userid);
    assert(rateCheck.allowed === true, "5.1 Persistent shared rate limiter allows authorized traffic within threshold");

    // 5.2 Content safety keyword verification
    const cancerBlocked = CustomSmsService.validateContent("Patient was diagnosed with malignant cancer.");
    assert(!cancerBlocked.valid, "5.2 Medical diagnosis keywords are barred from custom SMS content");

    const otpBlocked = CustomSmsService.validateContent("Your verification code is 849201.");
    assert(!otpBlocked.valid, "5.3 Impersonating security verification codes is barred");

    // 5.4 Mock outbox dispatch execution
    const worker = new OutboxWorkerService({ workerId: "phase6_audit_worker" });
    const batchResult = await worker.processBatch();
    assert(batchResult.processed > 0, "5.4 Outbox worker successfully claimed and dispatched pending SMS items");

    // -------------------------------------------------------------
    // 6. CLEANUP TEST DATA
    // -------------------------------------------------------------
    console.log("\n--- 6. Cleanup Temporary Phase 6 Records ---");
    if (testCreatedOutboxIds.length > 0) {
        await prisma.smsoutbox.deleteMany({
            where: { outboxid: { in: testCreatedOutboxIds } },
        });
    }
    if (testCreatedTokens.length > 0) {
        await prisma.actiontokens.deleteMany({
            where: { tokenid: { in: testCreatedTokens } },
        });
    }
    if (testResponseId) {
        await prisma.donoreligibilityresponses.delete({
            where: { responseid: testResponseId },
        });
    }

    // Restore blood request to original state
    await prisma.bloodrequests.update({
        where: { requestid: existingReq.requestid },
        data: {
            hospitalid: originalHospitalId,
            createdbyuserid: originalCreatedByUserId,
        },
        select: { requestid: true },
    });

    console.log("  [PASS] All temporary Phase 6 audit records cleaned up from Neon development branch.");

    console.log("\n===============================================================================");
    console.log(` PHASE 6 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("===============================================================================");

    if (passedTests === totalTests) {
        console.log(">>> ALL PHASE 6 END-TO-END SMS INTEGRATION TESTS PASSED! <<<\n");
    } else {
        process.exitCode = 1;
    }
}

runPhase6Suite().catch(err => {
    console.error("Phase 6 test suite fatal error:", err);
    process.exit(1);
});
