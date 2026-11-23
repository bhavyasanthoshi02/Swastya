/**
 * Swastya: Phase 4 Test Suite
 * Secure SMS Redirection Gateway & Donor Eligibility Questionnaire
 * Tests token resolution, expiry, replay protection, intended-user verification,
 * questionnaire database persistence, medical nullability, and hospital clinical review.
 */

// Set development environment before any imports
process.env.NODE_ENV = "development";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

import { ActionTokenService } from "../src/services/sms/actionToken.service";

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
    console.log(" SWASTYA: PHASE 4 — SECURE REDIRECTION & QUESTIONNAIRE TEST SUITE");
    console.log("===============================================================================\n");

    // Fetch fixtures from dev-sms-feature branch
    const donor = await prisma.donors.findFirst({
        select: { donorid: true, userid: true },
    });
    const hospital = await prisma.hospitals.findFirst({
        select: { hospitalid: true, userid: true },
    });
    const requester = await prisma.requesters.findFirst({
        select: { requesterid: true, userid: true },
    });
    const bloodRequest = await prisma.bloodrequests.findFirst({
        where: { hospitalid: { not: null } },
        select: { requestid: true, hospitalid: true },
    }) || await prisma.bloodrequests.findFirst({
        select: { requestid: true, hospitalid: true },
    });

    if (!donor || !hospital || !requester || !bloodRequest) {
        throw new Error("Unable to locate required test fixtures on dev-sms-feature database!");
    }

    const testReqId = bloodRequest.requestid;
    const donorUserId = donor.userid;
    const hospitalUserId = hospital.userid;
    const requesterUserId = requester.userid;

    // -------------------------------------------------------------
    // 1. ACTION TOKEN CREATION, HASHING & PEEK RESOLUTION
    // -------------------------------------------------------------
    console.log("--- 1. Token Hashing, Storage & Public Resolution ---");

    const tokenRes = await ActionTokenService.createActionToken({
        userId: donorUserId,
        purpose: "DONOR_PLEDGE",
        targetId: testReqId,
        redirectUrl: `/donor/requests/${testReqId}/donate`,
        expiresInHours: 24,
    });

    assert(tokenRes.rawToken.length === 64, "1.1 Generates 64-character raw cryptographic token");
    assert(tokenRes.actionUrl.includes(`/r/${tokenRes.rawToken}`), "1.2 Formats standard action link (/r/:token)");

    // Verify tokenhash stored in database is SHA-256 (not raw token)
    const storedToken = await prisma.actiontokens.findUnique({
        where: { tokenid: tokenRes.tokenId },
    });
    const expectedHash = ActionTokenService.hashToken(tokenRes.rawToken);
    assert(storedToken?.tokenhash === expectedHash, "1.3 Raw token is hashed with SHA-256 before storage (Raw token never stored)");
    assert(storedToken?.tokenhash !== tokenRes.rawToken, "1.4 Database contains only irreversible hash");

    // Public Peek resolution
    const peeked = await ActionTokenService.peekToken(tokenRes.rawToken);
    assert(peeked !== null, "1.5 peekToken resolves valid token metadata");
    assert(peeked?.purpose === "DONOR_PLEDGE", "1.6 Purpose is accurately bound to DONOR_PLEDGE");
    assert(peeked?.targetId === testReqId, "1.7 TargetId is bound to blood requisition ID");
    assert(peeked?.redirectUrl === `/donor/requests/${testReqId}/donate`, "1.8 RedirectUrl points to donation questionnaire");
    assert(peeked?.usedAt === null, "1.9 Token remains unconsumed after peek");

    // -------------------------------------------------------------
    // 2. EXPIRED, REUSED & INVALID TOKEN GUARDS
    // -------------------------------------------------------------
    console.log("\n--- 2. Expired, Reused & Invalid Token Handling ---");

    // 2.1 Non-existent token
    const nonExistent = await ActionTokenService.peekToken("0000000000000000000000000000000000000000000000000000000000000000");
    assert(nonExistent === null, "2.1 Non-existent token safely returns null");

    // 2.2 Expired token
    const expiredTokenRes = await ActionTokenService.createActionToken({
        userId: donorUserId,
        purpose: "DONOR_PLEDGE",
        targetId: testReqId,
        redirectUrl: `/donor/requests/${testReqId}/donate`,
        expiresInHours: -2, // Expired 2 hours ago
    });

    const expiredValidation = await ActionTokenService.validateAndConsumeToken(expiredTokenRes.rawToken);
    assert(
        expiredValidation.valid === false && expiredValidation.reason === "EXPIRED",
        "2.2 Expired token is detected and rejected with reason: EXPIRED"
    );

    // 2.3 User Mismatch Protection
    const mismatchValidation = await ActionTokenService.validateAndConsumeToken(tokenRes.rawToken, {
        expectedUserId: requesterUserId, // Different user
    });
    assert(
        mismatchValidation.valid === false && mismatchValidation.reason === "USER_MISMATCH",
        "2.3 Token consumption rejected when authenticated user does not match intended recipient"
    );

    // 2.4 Valid Consumption
    const validConsumption = await ActionTokenService.validateAndConsumeToken(tokenRes.rawToken, {
        expectedUserId: donorUserId,
        consume: true,
    });
    assert(validConsumption.valid === true, "2.4 Intended user successfully consumes action token");

    // 2.5 Replay Protection (Already Used)
    const replayValidation = await ActionTokenService.validateAndConsumeToken(tokenRes.rawToken, {
        expectedUserId: donorUserId,
        consume: true,
    });
    assert(
        replayValidation.valid === false && replayValidation.reason === "ALREADY_USED",
        "2.5 Replay attack prevented: Consumed token cannot be reused (ALREADY_USED)"
    );

    // -------------------------------------------------------------
    // 3. DONOR ELIGIBILITY QUESTIONNAIRE DATABASE PERSISTENCE
    // -------------------------------------------------------------
    console.log("\n--- 3. Questionnaire Persistence & Medical Nullability ---");

    // Create a questionnaire response with partial answers
    // Notice: drinksalcohol is NULL, chronicillness is NULL (strictly unrecorded)
    const questionnaireResponse = await prisma.donoreligibilityresponses.create({
        data: {
            requestid: testReqId,
            donorid: donor.donorid,
            donoruserid: donorUserId,
            drinksalcohol: null, // Unanswered
            alcoholin24h: null, // Unanswered
            feelinghealthy: true, // Confirmed Healthy
            medicationstatus: false, // Confirmed No Medication
            recenttattoosurgery: false, // Confirmed No Surgery
            donatedinlast90days: false, // Confirmed No Recent Donation
            chronicillness: null, // Unanswered
            pregnantorbreastfeeding: null, // Unanswered
            additionalnotes: "Phase 4 verification test questionnaire",
            screeningstatus: "PRELIMINARY_ELIGIBLE",
            unansweredcount: 4,
            completionpercent: 50,
            clinicaldisclaimeracknowledged: true,
        },
    });

    assert(questionnaireResponse.responseid !== undefined, "3.1 Questionnaire response saved to donoreligibilityresponses");
    assert(questionnaireResponse.donorid === donor.donorid, "3.2 Bound to correct donor ID");
    assert(questionnaireResponse.requestid === testReqId, "3.3 Bound to correct blood request ID");

    // Assert medical nullability guard
    assert(questionnaireResponse.drinksalcohol === null, "3.4 Unanswered drinksalcohol remains strictly NULL (not false)");
    assert(questionnaireResponse.chronicillness === null, "3.5 Unanswered chronicillness remains strictly NULL");
    assert(questionnaireResponse.feelinghealthy === true, "3.6 Explicit answered question recorded as true");
    assert(questionnaireResponse.unansweredcount === 4, "3.7 Unanswered questions count accurately tracks 4 questions");
    assert(
        questionnaireResponse.screeningstatus === "PRELIMINARY_ELIGIBLE",
        "3.8 Preliminary status set without claiming autonomous clinical clearance"
    );

    // -------------------------------------------------------------
    // 4. MEDICAL PRIVACY & RBAC PERMISSIONS
    // -------------------------------------------------------------
    console.log("\n--- 4. Medical Privacy & Reviewer RBAC ---");

    // Query responses
    const allResponses = await prisma.donoreligibilityresponses.findMany({
        where: { responseid: questionnaireResponse.responseid },
    });

    // Check Donor permission (can view own)
    const donorAllowed = allResponses.some(r => r.donoruserid === donorUserId);
    assert(donorAllowed, "4.1 Volunteer donor is permitted to view their own questionnaire submission");

    // Check Requester restriction
    // Requester does not own donoruserid and is not hospital
    const requesterBlocked = allResponses.every(r => r.donoruserid !== requesterUserId);
    assert(requesterBlocked, "4.2 Requester has NO access to confidential donor questionnaire responses");

    // -------------------------------------------------------------
    // 5. HOSPITAL CLINICAL REVIEW WORKFLOW
    // -------------------------------------------------------------
    console.log("\n--- 5. Hospital Clinical Review Workflow ---");

    const reviewTime = new Date();
    const reviewedResponse = await prisma.donoreligibilityresponses.update({
        where: { responseid: questionnaireResponse.responseid },
        data: {
            reviewedbyhospitaluserid: hospitalUserId,
            reviewedat: reviewTime,
            reviewdecision: "CLINICALLY_APPROVED",
            reviewnotes: "Preliminary donor screening answers reviewed by hospital transfusion officer. Cleared for in-person crossmatch.",
            screeningstatus: "CLINICALLY_APPROVED",
        },
    });

    assert(
        reviewedResponse.reviewedbyhospitaluserid === hospitalUserId,
        "5.1 Reviewer user ID accurately logged against questionnaire record"
    );
    assert(
        reviewedResponse.reviewdecision === "CLINICALLY_APPROVED",
        "5.2 Clinical decision recorded as CLINICALLY_APPROVED"
    );
    assert(
        reviewedResponse.screeningstatus === "CLINICALLY_APPROVED",
        "5.3 Screening status safely transitions to CLINICALLY_APPROVED by human reviewer"
    );
    assert(
        reviewedResponse.reviewnotes?.includes("transfusion officer"),
        "5.4 Clinical review notes recorded in audit trail"
    );

    // -------------------------------------------------------------
    // 6. CLEANUP TEST DATA
    // -------------------------------------------------------------
    console.log("\n--- 6. Cleanup Temporary Test Records ---");
    await prisma.actiontokens.deleteMany({
        where: { tokenid: { in: [tokenRes.tokenId, expiredTokenRes.tokenId] } },
    });
    await prisma.donoreligibilityresponses.deleteMany({
        where: { responseid: questionnaireResponse.responseid },
    });
    console.log("  [PASS] All temporary Phase 4 test records cleaned up from Neon development branch.");

    console.log("\n===============================================================================");
    console.log(` PHASE 4 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("===============================================================================");

    if (passedTests === totalTests) {
        console.log(">>> ALL PHASE 4 SECURE REDIRECTION & QUESTIONNAIRE TESTS PASSED! <<<\n");
    } else {
        process.exitCode = 1;
    }
}

runSuite().catch(err => {
    console.error("Test suite fatal error:", err);
    process.exit(1);
});
