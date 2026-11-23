/**
 * Swastya: Phase 2 Core SMS Engine Test Suite
 * Tests MockSmsProvider, TwilioProvider architecture, template rendering,
 * ActionTokenService security, transactional outbox worker, retries, and crash recovery.
 */

// Set development environment before any imports
process.env.NODE_ENV = "development";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

import { MockSmsProvider } from "../src/services/sms/mockSms.provider";
import { TwilioProvider } from "../src/services/sms/twilio.provider";
import { renderSmsTemplate, SMS_TEMPLATES } from "../src/services/sms/smsTemplates";
import { ActionTokenService } from "../src/services/sms/actionToken.service";
import { SmsService } from "../src/services/sms/sms.service";
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
    console.log(" SWASTYA: PHASE 2 — CORE SMS ENGINE TEST SUITE");
    console.log("===============================================================================\n");

    // -------------------------------------------------------------
    // 1. SAFETY & DEFAULT CONFIGURATION CHECKS
    // -------------------------------------------------------------
    console.log("--- 1. Safety & Environment Guardrails ---");
    assert(
        (process.env.TWILIO_MOCK_MODE || "true").toLowerCase() === "true",
        "1.1 TWILIO_MOCK_MODE is enabled by default ('true')",
        `Current value: ${process.env.TWILIO_MOCK_MODE}`
    );

    const activeProvider = SmsService.getProvider();
    assert(
        activeProvider.providerName === "MOCK",
        "1.2 SmsService defaults to MockSmsProvider (Zero real SMS)",
        `Active provider: ${activeProvider.providerName}`
    );

    const devEndpoint = "ep-holy-flower-bive3xfn";
    const prodEndpoint = "ep-empty-surf-bictmr98";
    const currentDbUrl = process.env.DATABASE_URL || "";
    assert(
        !currentDbUrl.includes(prodEndpoint),
        "1.3 Production database (ep-empty-surf-bictmr98) is strictly shielded"
    );
    assert(
        currentDbUrl.includes(devEndpoint) || currentDbUrl.includes("swastya_test"),
        "1.4 Tests target dev-sms-feature Neon branch or local test database"
    );

    // -------------------------------------------------------------
    // 2. MOCKSMSPROVIDER TESTS
    // -------------------------------------------------------------
    console.log("\n--- 2. MockSmsProvider Architecture ---");
    MockSmsProvider.clear();
    const mockProvider = new MockSmsProvider();
    const mockRes = await mockProvider.send("+919876543210", "Test mock message body");

    assert(mockRes.success === true, "2.1 Mock send returns success: true");
    assert(mockRes.messageSid.startsWith("SMmock_"), "2.2 Generates simulated Twilio message SID (SMmock_...)");
    assert(mockRes.mock === true, "2.3 Response explicitly flags mock: true");
    assert(MockSmsProvider.getDispatchedMessages().length === 1, "2.4 In-memory dispatched log captures message");
    assert(MockSmsProvider.getLastDispatchedMessage()?.to === "+919876543210", "2.5 Captured recipient phone matches");

    // -------------------------------------------------------------
    // 3. TWILIOPROVIDER ARCHITECTURE & E.164 NORMALIZATION
    // -------------------------------------------------------------
    console.log("\n--- 3. TwilioProvider & E.164 Normalization ---");
    assert(
        TwilioProvider.normalizeE164("9876543210") === "+919876543210",
        "3.1 Normalizes 10-digit Indian number to +91XXXXXXXXXX"
    );
    assert(
        TwilioProvider.normalizeE164("919876543210") === "+919876543210",
        "3.2 Normalizes 12-digit 91XXXXXXXXXX to +91XXXXXXXXXX"
    );
    assert(
        TwilioProvider.normalizeE164("+14155552671") === "+14155552671",
        "3.3 Preserves valid international E.164 numbers (+1...)"
    );

    const unconfiguredTwilio = new TwilioProvider({ accountSid: "", authToken: "" });
    const twilioRes = await unconfiguredTwilio.send("9876543210", "Test message");
    assert(
        twilioRes.success === false,
        "3.4 TwilioProvider handles missing credentials gracefully without throwing"
    );
    assert(
        twilioRes.errorCode === "MISSING_TWILIO_CREDENTIALS",
        "3.5 Returns clear error code MISSING_TWILIO_CREDENTIALS"
    );

    // -------------------------------------------------------------
    // 4. CENTRALIZED TEMPLATE MANAGEMENT FOR ALL 4 ROLES
    // -------------------------------------------------------------
    console.log("\n--- 4. Centralized SMS Template Management ---");
    // Donor Template
    const donorMsg = renderSmsTemplate("DONOR_EMERGENCY_MATCH", {
        bloodGroup: "O+",
        units: "2",
        facilityName: "Apollo Hospital",
        actionUrl: "http://localhost:3000/r/token_abc",
    });
    assert(
        donorMsg.includes("O+") && donorMsg.includes("Apollo Hospital") && donorMsg.includes("http://localhost:3000/r/token_abc"),
        "4.1 Donor emergency match template renders correctly with all variables"
    );

    // Hospital Template
    const hospMsg = renderSmsTemplate("HOSPITAL_REQ_ASSIGNED", {
        requestId: "REQ-101",
        bloodGroup: "B+",
        actionUrl: "http://localhost:3000/r/token_hosp",
    });
    assert(
        hospMsg.includes("REQ-101") && hospMsg.includes("B+") && hospMsg.includes("http://localhost:3000/r/token_hosp"),
        "4.2 Hospital requisition assigned template renders correctly"
    );

    // Blood Bank Template
    const bbMsg = renderSmsTemplate("BLOOD_BANK_REQ_ASSIGNED", {
        requestId: "REQ-202",
        units: "3",
        bloodGroup: "AB-",
        actionUrl: "http://localhost:3000/r/token_bb",
    });
    assert(
        bbMsg.includes("REQ-202") && bbMsg.includes("3 unit(s)") && bbMsg.includes("AB-"),
        "4.3 Blood Bank requisition assigned template renders correctly"
    );

    // Requester Template
    const reqMsg = renderSmsTemplate("REQUESTER_CONFIRMATION", {
        requestId: "REQ-303",
        bloodGroup: "A-",
        actionUrl: "http://localhost:3000/r/token_req",
    });
    assert(
        reqMsg.includes("REQ-303") && reqMsg.includes("A-") && reqMsg.includes("http://localhost:3000/r/token_req"),
        "4.4 Requester confirmation template renders correctly"
    );

    // Custom Message Template
    const customMsg = renderSmsTemplate("CUSTOM_COMMUNICATION", {
        senderName: "City Blood Bank",
        customMessage: "Please verify your dispatch receipt",
        actionUrl: "http://localhost:3000/r/token_custom",
    });
    assert(
        customMsg.includes("City Blood Bank") && customMsg.includes("Please verify your dispatch receipt"),
        "4.5 Custom communication template renders with sender attribution"
    );

    // Template validation guard
    let missingVarCaught = false;
    try {
        renderSmsTemplate("DONOR_EMERGENCY_MATCH", { bloodGroup: "O+" }); // Missing units, facilityName, actionUrl
    } catch {
        missingVarCaught = true;
    }
    assert(missingVarCaught, "4.6 Throws validation error if required template variable is missing");

    // -------------------------------------------------------------
    // 5. ACTION TOKEN SERVICE & EXPIRY / HASHING
    // -------------------------------------------------------------
    console.log("\n--- 5. ActionTokenService Security & Expiry ---");

    // Fetch a user from database for foreign key
    const anyUser = await prisma.users.findFirst({ select: { userid: true } });
    const testUserId = anyUser ? anyUser.userid : "00000000-0000-0000-0000-000000000001";

    const createdToken = await ActionTokenService.createActionToken({
        userId: testUserId,
        purpose: "DONOR_PLEDGE",
        targetId: "REQ-TEST-PHASE2",
        redirectUrl: "/donor/requests/REQ-TEST-PHASE2/donate",
        expiresInHours: 1, // 1 hour
    });

    assert(createdToken.rawToken.length === 64, "5.1 Raw token generated as 64-char hex string (32 random bytes)");
    assert(
        createdToken.actionUrl.startsWith("http://localhost:3000/r/") || createdToken.actionUrl.includes("/r/"),
        "5.2 Action URL formatted with configurable base URL (/r/:token)"
    );

    // Peek token without consuming
    const peeked = await ActionTokenService.peekToken(createdToken.rawToken);
    assert(peeked !== null && peeked.purpose === "DONOR_PLEDGE", "5.3 peekToken inspects token metadata without consumption");
    assert(peeked?.usedAt === null, "5.4 Token remains unconsumed after peek");

    // Validate with purpose mismatch
    const wrongPurpose = await ActionTokenService.validateAndConsumeToken(createdToken.rawToken, {
        requiredPurpose: "VIEW_REQUEST",
    });
    assert(
        wrongPurpose.valid === false && wrongPurpose.reason === "PURPOSE_MISMATCH",
        "5.5 Purpose mismatch is detected and rejected"
    );

    // Consume token
    const consumed = await ActionTokenService.validateAndConsumeToken(createdToken.rawToken, {
        requiredPurpose: "DONOR_PLEDGE",
        consume: true,
    });
    assert(consumed.valid === true, "5.6 Valid token consumed successfully");

    // Try consuming again (replay attack)
    const replay = await ActionTokenService.validateAndConsumeToken(createdToken.rawToken, {
        consume: true,
    });
    assert(
        replay.valid === false && replay.reason === "ALREADY_USED",
        "5.7 Replay protection: Already-used token is strictly rejected"
    );

    // Expired token test
    const expiredToken = await ActionTokenService.createActionToken({
        userId: testUserId,
        purpose: "DONOR_PLEDGE",
        targetId: "REQ-EXPIRED",
        redirectUrl: "/donor/expired",
        expiresInHours: -1, // Expired 1 hour ago
    });
    const expiredCheck = await ActionTokenService.validateAndConsumeToken(expiredToken.rawToken);
    assert(
        expiredCheck.valid === false && expiredCheck.reason === "EXPIRED",
        "5.8 Expired token is detected and rejected"
    );

    // Clean up test action tokens
    await prisma.actiontokens.deleteMany({
        where: { targetid: { in: ["REQ-TEST-PHASE2", "REQ-EXPIRED"] } },
    });

    // -------------------------------------------------------------
    // 6. TRANSACTIONAL OUTBOX & IDEMPOTENCY
    // -------------------------------------------------------------
    console.log("\n--- 6. Transactional Outbox Queuing & Idempotency ---");
    const testIdempotencyKey = `PHASE2_IDEMP_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const queueRes1 = await SmsService.queueSms({
        to: "9876543210",
        template: "DONOR_EMERGENCY_MATCH",
        variables: {
            bloodGroup: "B+",
            units: "1",
            facilityName: "City Care Clinic",
            actionUrl: "http://localhost:3000/r/token_queue_1",
        },
        idempotencyKey: testIdempotencyKey,
        userId: testUserId,
    });

    assert(queueRes1.queued === true, "6.1 Successfully enqueued SMS into transactional outbox");
    assert(queueRes1.outboxId !== undefined, "6.2 Outbox record ID generated");

    // Attempt duplicate enqueue with same idempotency key
    const queueRes2 = await SmsService.queueSms({
        to: "9876543210",
        template: "DONOR_EMERGENCY_MATCH",
        variables: {
            bloodGroup: "B+",
            units: "1",
            facilityName: "City Care Clinic",
            actionUrl: "http://localhost:3000/r/token_queue_1",
        },
        idempotencyKey: testIdempotencyKey,
        userId: testUserId,
    });

    assert(queueRes2.queued === false && queueRes2.isDuplicate === true, "6.3 Duplicate SMS rejected via idempotency key");
    assert(queueRes2.outboxId === queueRes1.outboxId, "6.4 Duplicate returns reference to existing outbox row");

    // -------------------------------------------------------------
    // 7. OUTBOX WORKER BATCH PROCESSING & LOCKING
    // -------------------------------------------------------------
    console.log("\n--- 7. Outbox Background Worker & Retry Engine ---");
    MockSmsProvider.clear();
    const worker = new OutboxWorkerService({
        batchSize: 5,
        pollIntervalMs: 1000,
        workerId: "test_phase2_worker",
    });

    const batchRes = await worker.processBatch();
    assert(batchRes.processed >= 1, "7.1 Worker claimed and processed pending outbox batch");
    assert(batchRes.sent >= 1, "7.2 Outbox item dispatched through MockSmsProvider");

    // Verify row state in database
    const updatedRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: queueRes1.outboxId },
    });
    assert(updatedRow?.status === "SENT", "7.3 Database status updated from PENDING to SENT");
    assert(updatedRow?.messagesid !== null, "7.4 Twilio Message SID saved in database");
    assert(updatedRow?.dispatchconfirmedat !== null, "7.5 Dispatch confirmation timestamp recorded");

    // -------------------------------------------------------------
    // 8. RETRY HANDLING & DEAD-LETTER QUEUE
    // -------------------------------------------------------------
    console.log("\n--- 8. Failure Retries & Dead-Letter Handling ---");

    // Insert a failing outbox record
    const failIdempotencyKey = `FAIL_IDEMP_${Date.now()}`;
    const failingItem = await prisma.smsoutbox.create({
        data: {
            phonenumber: "+919999999999",
            templatename: "DONOR_EMERGENCY_MATCH",
            messagebody: "Failing test body",
            idempotencykey: failIdempotencyKey,
            status: "PENDING",
            attempts: 2, // 2 previous attempts
            maxattempts: 3, // max 3 attempts
            nextattemptat: new Date(Date.now() - 1000), // due now
        },
    });

    // Temporarily inject failing provider
    const failingProvider = {
        providerName: "FAILING_MOCK",
        async send() {
            return {
                success: false,
                messageSid: "",
                status: "FAILED" as const,
                recipientPhone: "+919999999999",
                renderedMessage: "Failing test body",
                errorCode: "SIMULATED_CARRIER_REJECTION",
                errorMessage: "Carrier network dropped SMS",
                mock: true,
                dispatchedAt: new Date(),
            };
        },
    };

    SmsService.setProvider(failingProvider);

    await worker.processBatch();

    const deadLetterRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: failingItem.outboxid },
    });

    assert(deadLetterRow?.status === "DEAD_LETTER", "8.1 Message transitions to DEAD_LETTER after exceeding maxattempts");
    assert(deadLetterRow?.errorcode === "SIMULATED_CARRIER_REJECTION", "8.2 Error code recorded in database");
    assert(deadLetterRow?.attempts === 3, "8.3 Attempt count accurately increments to 3");

    // Restore default MockSmsProvider
    SmsService.setProvider(null);

    // -------------------------------------------------------------
    // 9. STALE LOCK CRASH RECOVERY
    // -------------------------------------------------------------
    console.log("\n--- 9. Crash Recovery & Stale Lock Management ---");
    const staleIdempotencyKey = `STALE_IDEMP_${Date.now()}`;
    const staleItem = await prisma.smsoutbox.create({
        data: {
            phonenumber: "+918888888888",
            templatename: "DONOR_EMERGENCY_MATCH",
            messagebody: "Stale test body",
            idempotencykey: staleIdempotencyKey,
            status: "PROCESSING", // Left in processing by crashed worker
            lockedby: "crashed_worker_process_999",
            lockeduntil: new Date(Date.now() - 60000), // Expired 1 minute ago
            attempts: 0,
        },
    });

    const recoveredCount = await worker.recoverStaleLocks();
    assert(recoveredCount >= 1, "9.1 Stale lock recovery identified abandoned lock");

    const recoveredRow = await prisma.smsoutbox.findUnique({
        where: { outboxid: staleItem.outboxid },
    });
    assert(
        recoveredRow?.status === "PENDING" && recoveredRow?.lockedby === null,
        "9.2 Stale locked row reverted to PENDING and released for healthy workers"
    );

    // -------------------------------------------------------------
    // 10. CLEANUP TEST DATA
    // -------------------------------------------------------------
    console.log("\n--- 10. Test Records Cleanup ---");
    await prisma.smsoutbox.deleteMany({
        where: {
            idempotencykey: { in: [testIdempotencyKey, failIdempotencyKey, staleIdempotencyKey] },
        },
    });
    console.log("  [PASS] All temporary test outbox records cleaned up.");

    console.log("\n===============================================================================");
    console.log(` PHASE 2 TEST RESULTS: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("===============================================================================");

    if (passedTests === totalTests) {
        console.log(">>> ALL PHASE 2 CORE SMS ENGINE TEST SCENARIOS PASSED SUCCESSFULLY! <<<\n");
    } else {
        process.exitCode = 1;
    }
}

runSuite().catch(err => {
    console.error("Test suite fatal error:", err);
    process.exit(1);
});
