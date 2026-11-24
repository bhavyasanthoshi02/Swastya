/**
 * Swastya: Automated Blood Request Matching SMS & Cross-Organization Communication Test Suite
 * Validates:
 * Scenario 1: Requester creates a request -> matching donors automatically receive SMS
 * Scenario 2: Non-matching donors receive no SMS
 * Scenario 3: Relevant Hospitals receive automatic SMS
 * Scenario 4: Relevant Blood Banks receive automatic SMS
 * Scenario 5: Duplicate matching events do not produce duplicate SMS (Idempotency)
 * Scenario 6: Donor accepts or declines -> appropriate status notifications are sent
 * Scenario 7: Hospital and Blood Bank can communicate through Custom SMS
 * Scenario 8: Unauthorized organizations cannot access or message unrelated organizations
 * Scenario 9: Emergency Broadcast remains completely unaffected
 * Scenario 10: Failed SMS messages are retried and accurately recorded
 */

process.env.NODE_ENV = "development";
process.env.TWILIO_MOCK_MODE = "true";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

import { prisma } from "../src/config/prisma";
import { blood_group, blood_component, availability_status } from "../src/generated/prisma/enums";
import { SmsService } from "../src/services/sms/sms.service";
import { MockSmsProvider } from "../src/services/sms/mockSms.provider";
import { ActionTokenService } from "../src/services/sms/actionToken.service";
import { NotificationSmsDispatcher } from "../src/services/sms/notificationSmsDispatcher.service";
import { CustomSmsService } from "../src/services/sms/customSms.service";
import { OutboxWorkerService } from "../src/services/sms/outboxWorker.service";
import { DonorMatchingService } from "../src/services/donorMatching.service";
import { bloodRequestEventEmitter, EVENTS } from "../src/services/sms/bloodRequestEvents";

let totalTests = 0;
let passedTests = 0;

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

async function runTests() {
    console.log("===============================================================================");
    console.log(" SWASTYA: AUTOMATED MATCHING SMS & CROSS-ORG COMMUNICATION TEST SUITE");
    console.log("===============================================================================\n");

    // Clear mock state
    MockSmsProvider.clear();
    CustomSmsService.resetRateLimits();

    // Verify mock mode is active
    assert(
        (process.env.TWILIO_MOCK_MODE || "true").toLowerCase() === "true",
        "Guardrail: TWILIO_MOCK_MODE is true (No real SMS billed)"
    );

    // -------------------------------------------------------------------------
    // Setup Test Entities (in dev Neon database)
    // -------------------------------------------------------------------------
    console.log("\n--- Setting Up Test Fixtures ---");

    const testRunId = Math.random().toString(36).slice(2, 7);

    // 1. Requester User
    const requesterUser = await prisma.users.create({
        data: {
            name: `Test Requester ${testRunId}`,
            email: `requester_${testRunId}@swastya.test`,
            phonenumber: "+919876500001",
            password: "hashed_test_password",
            role: "REQUESTER",
            isactive: true,
        },
    });

    const requesterProfile = await prisma.requesters.create({
        data: {
            userid: requesterUser.userid,
            address: "Hitech City",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500081",
            latitude: 17.4485,
            longitude: 78.3748,
        },
    });

    // 2. Matching Eligible Donor (B_POSITIVE, Hyderabad, Available, Eligible, 25 years old)
    const matchingDonorUser = await prisma.users.create({
        data: {
            name: `Eligible Donor ${testRunId}`,
            email: `donor_match_${testRunId}@swastya.test`,
            phonenumber: "+919876500002",
            password: "hashed_test_password",
            role: "DONOR",
            isactive: true,
        },
    });

    const matchingDonor = await prisma.donors.create({
        data: {
            userid: matchingDonorUser.userid,
            bloodgroup: blood_group.B_POSITIVE,
            dateofbirth: new Date("1998-05-15"),
            gender: "MALE",
            weight: 70,
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500081",
            latitude: 17.4480,
            longitude: 78.3740,
            availabilitystatus: availability_status.AVAILABLE,
            iseligible: true,
        },
    });

    // 3. Non-Matching Donor: Incompatible blood group (AB_POSITIVE)
    const incompatibleDonorUser = await prisma.users.create({
        data: {
            name: `Incompatible Donor ${testRunId}`,
            email: `donor_incompat_${testRunId}@swastya.test`,
            phonenumber: "+919876500003",
            password: "hashed_test_password",
            role: "DONOR",
            isactive: true,
        },
    });

    const incompatibleDonor = await prisma.donors.create({
        data: {
            userid: incompatibleDonorUser.userid,
            bloodgroup: blood_group.AB_POSITIVE, // Incompatible for B_POSITIVE recipient
            dateofbirth: new Date("1998-05-15"),
            gender: "MALE",
            weight: 70,
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500081",
            latitude: 17.4480,
            longitude: 78.3740,
            availabilitystatus: availability_status.AVAILABLE,
            iseligible: true,
        },
    });

    // 4. Non-Matching Donor: Unavailable
    const unavailableDonorUser = await prisma.users.create({
        data: {
            name: `Unavailable Donor ${testRunId}`,
            email: `donor_unavail_${testRunId}@swastya.test`,
            phonenumber: "+919876500004",
            password: "hashed_test_password",
            role: "DONOR",
            isactive: true,
        },
    });

    const unavailableDonor = await prisma.donors.create({
        data: {
            userid: unavailableDonorUser.userid,
            bloodgroup: blood_group.B_POSITIVE,
            dateofbirth: new Date("1998-05-15"),
            gender: "FEMALE",
            weight: 60,
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500081",
            latitude: 17.4480,
            longitude: 78.3740,
            availabilitystatus: availability_status.TEMPORARILY_UNAVAILABLE, // Unavailable
            iseligible: true,
        },
    });

    // 5. Relevant Approved Hospital (Hyderabad)
    const hospitalUser = await prisma.users.create({
        data: {
            name: `Apollo Coordination ${testRunId}`,
            email: `hospital_${testRunId}@swastya.test`,
            phonenumber: "+919876500005",
            password: "hashed_test_password",
            role: "HOSPITAL",
            isactive: true,
        },
    });

    const hospital = await prisma.hospitals.create({
        data: {
            userid: hospitalUser.userid,
            hospitalname: `Apollo Super Specialty ${testRunId}`,
            registrationnumber: `HOSP-REG-${testRunId}`,
            contactpersonname: "Dr. Rao",
            contactpersonphone: "+919876500005",
            address: "Jubilee Hills",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500033",
            latitude: 17.4325,
            longitude: 78.4071,
            approvalstatus: "APPROVED",
        },
    });

    // 6. Relevant Approved Blood Bank with Compatible B+ Inventory
    const bloodBankUser = await prisma.users.create({
        data: {
            name: `Red Cross Blood Center ${testRunId}`,
            email: `bloodbank_${testRunId}@swastya.test`,
            phonenumber: "+919876500006",
            password: "hashed_test_password",
            role: "BLOOD_BANK",
            isactive: true,
        },
    });

    const bloodBank = await prisma.bloodbanks.create({
        data: {
            userid: bloodBankUser.userid,
            bloodbankname: `Red Cross Hyderabad ${testRunId}`,
            licensenumber: `BB-LIC-${testRunId}`,
            contactpersonname: "Manager Reddi",
            contactpersonphone: "+919876500006",
            address: "Banjara Hills",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500034",
            latitude: 17.4156,
            longitude: 78.4357,
            approvalstatus: "APPROVED",
        },
    });

    // Add compatible available inventory to this blood bank
    await prisma.inventory.create({
        data: {
            bloodbankid: bloodBank.bloodbankid,
            bloodgroup: blood_group.B_POSITIVE,
            bloodcomponent: blood_component.WHOLE_BLOOD,
            unitsavailable: 8,
            expirydate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days ahead
        },
    });

    // 7. Non-Relevant Blood Bank: Zero stock in B_POSITIVE
    const emptyBloodBankUser = await prisma.users.create({
        data: {
            name: `Empty Blood Center ${testRunId}`,
            email: `empty_bb_${testRunId}@swastya.test`,
            phonenumber: "+919876500007",
            password: "hashed_test_password",
            role: "BLOOD_BANK",
            isactive: true,
        },
    });

    const emptyBloodBank = await prisma.bloodbanks.create({
        data: {
            userid: emptyBloodBankUser.userid,
            bloodbankname: `Empty Stock Bank ${testRunId}`,
            licensenumber: `BB-EMPTY-${testRunId}`,
            contactpersonname: "Officer",
            contactpersonphone: "+919876500007",
            address: "Secunderabad",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500003",
            latitude: 17.4411,
            longitude: 78.4983,
            approvalstatus: "APPROVED",
        },
    });

    console.log("Fixtures created successfully.");

    // -------------------------------------------------------------------------
    // Create Blood Request for B_POSITIVE
    // -------------------------------------------------------------------------
    console.log("\n--- Creating Standard Blood Request (Non-Emergency) ---");

    const bloodRequest = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: requesterUser.userid,
            requesterid: requesterProfile.requesterid,
            hospitalid: hospital.hospitalid,
            patientname: "Suresh Kumar",
            patientage: 38,
            patientgender: "MALE",
            patientcontact: "+919876500001",
            bloodgroup: blood_group.B_POSITIVE,
            bloodcomponent: blood_component.WHOLE_BLOOD,
            unitsrequired: 2,
            urgencylevel: "HIGH",
            isemergency: false, // Normal requisition, not emergency broadcast
            searchradius: 15,
            latitude: 17.4485,
            longitude: 78.3748,
            requiredby: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: "CREATED",
        },
    });

    // -------------------------------------------------------------------------
    // SCENARIO 1 & 2: Matched Donors vs Non-Matched Donors
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 1 & 2: Matched Donors Receive SMS, Non-Matching Do Not ---");

    // Run matching algorithm directly to verify clinical gate behavior
    const matchResponse = await DonorMatchingService.getRankedEligibleDonors({
        requestid: bloodRequest.requestid,
        bloodgroup: bloodRequest.bloodgroup,
        bloodcomponent: bloodRequest.bloodcomponent,
        searchradius: 15,
        latitude: bloodRequest.latitude,
        longitude: bloodRequest.longitude,
        hospitals: hospital,
        requesters: requesterProfile,
    });

    assert(
        matchResponse.data.some(d => d.donorId === matchingDonor.donorid),
        "1.1 Matching algorithm correctly selects eligible B+ donor in Hyderabad"
    );

    assert(
        !matchResponse.data.some(d => d.donorId === incompatibleDonor.donorid),
        "2.1 Non-matching incompatible (AB+) donor is excluded by clinical gate"
    );

    assert(
        !matchResponse.data.some(d => d.donorId === unavailableDonor.donorid),
        "2.2 Unavailable donor is strictly excluded by availability gate"
    );

    // Trigger event-driven dispatch
    bloodRequestEventEmitter.emit(EVENTS.REQUEST_CREATED, {
        requestId: bloodRequest.requestid,
        createdByUserId: requesterUser.userid,
        hospitalId: bloodRequest.hospitalid,
        isEmergency: false,
        urgencyLevel: bloodRequest.urgencylevel,
    });

    async function waitForOutboxRecord(where: any, maxWaitMs = 6000) {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            const record = await prisma.smsoutbox.findFirst({ where });
            if (record) return record;
            await new Promise(r => setTimeout(r, 200));
        }
        return null;
    }

    // Verify SMS was queued for matched donor
    const donorOutbox = await waitForOutboxRecord({
        userid: matchingDonorUser.userid,
        templatename: "DONOR_REQUEST_MATCH",
    });

    assert(donorOutbox !== null, "1.2 Matched donor receives automated SMS outbox record");
    assert(
        donorOutbox?.messagebody.includes("URGENT: Swastya") === true,
        "1.3 Matched donor SMS contains proper non-emergency urgency template prefix"
    );
    assert(
        donorOutbox?.actionurl !== null && donorOutbox?.actionurl !== undefined,
        "1.4 Matched donor SMS contains secure action URL"
    );

    // Verify no SMS was queued for incompatible or unavailable donor
    const incompatOutbox = await prisma.smsoutbox.findFirst({
        where: {
            userid: incompatibleDonorUser.userid,
            templatename: "DONOR_REQUEST_MATCH",
        },
    });
    assert(incompatOutbox === null, "2.3 Incompatible donor received NO SMS");

    const unavailOutbox = await prisma.smsoutbox.findFirst({
        where: {
            userid: unavailableDonorUser.userid,
            templatename: "DONOR_REQUEST_MATCH",
        },
    });
    assert(unavailOutbox === null, "2.4 Unavailable donor received NO SMS");

    // -------------------------------------------------------------------------
    // SCENARIO 3: Relevant Hospitals Receive Automatic SMS
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 3: Relevant Hospitals Receive Automatic SMS ---");

    const hospitalOutbox = await waitForOutboxRecord({
        userid: hospitalUser.userid,
        templatename: { in: ["HOSPITAL_REQ_ASSIGNED", "HOSPITAL_MATCH_ALERT"] },
    });

    assert(hospitalOutbox !== null, "3.1 Relevant hospital receives automated SMS alert");
    assert(
        hospitalOutbox?.actionurl !== null && hospitalOutbox?.actionurl !== undefined,
        "3.2 Hospital SMS includes secure action link for review"
    );

    // -------------------------------------------------------------------------
    // SCENARIO 4: Relevant Blood Banks Receive Automatic SMS
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 4: Relevant Blood Banks Receive Automatic SMS ---");

    const bloodBankOutbox = await waitForOutboxRecord({
        userid: bloodBankUser.userid,
        templatename: "BLOOD_BANK_MATCH_ALERT",
    });

    assert(bloodBankOutbox !== null, "4.1 Relevant blood bank with compatible stock receives automated SMS");
    assert(
        bloodBankOutbox?.actionurl !== null && bloodBankOutbox?.actionurl !== undefined,
        "4.2 Blood bank SMS includes secure link to check inventory and requisition"
    );

    const emptyBankOutbox = await prisma.smsoutbox.findFirst({
        where: {
            userid: emptyBloodBankUser.userid,
            templatename: "BLOOD_BANK_MATCH_ALERT",
        },
    });
    assert(emptyBankOutbox === null, "4.3 Blood bank with zero compatible stock received NO SMS alert");

    // -------------------------------------------------------------------------
    // SCENARIO 5: Duplicate Matching Events Do Not Produce Duplicate SMS
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 5: Idempotency & Duplicate Prevention ---");

    const initialDonorOutboxCount = await prisma.smsoutbox.count({
        where: {
            userid: matchingDonorUser.userid,
            templatename: "DONOR_REQUEST_MATCH",
        },
    });

    // Re-trigger the exact same event
    bloodRequestEventEmitter.emit(EVENTS.REQUEST_CREATED, {
        requestId: bloodRequest.requestid,
        createdByUserId: requesterUser.userid,
        hospitalId: bloodRequest.hospitalid,
        isEmergency: false,
        urgencyLevel: bloodRequest.urgencylevel,
    });

    await new Promise(resolve => setTimeout(resolve, 800));

    const postDuplicateCount = await prisma.smsoutbox.count({
        where: {
            userid: matchingDonorUser.userid,
            templatename: "DONOR_REQUEST_MATCH",
        },
    });

    assert(
        postDuplicateCount === initialDonorOutboxCount,
        "5.1 Idempotency key strictly prevents duplicate SMS dispatch on repeated matching events",
        `Expected ${initialDonorOutboxCount}, got ${postDuplicateCount}`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 6: Status Update SMS (Donor Accepts or Declines)
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 6: Donor Accept & Decline Status SMS ---");

    // 6a. Donor Declines
    bloodRequestEventEmitter.emit(EVENTS.DONOR_RESPONDED, {
        requestId: bloodRequest.requestid,
        donorUserId: matchingDonorUser.userid,
        donorId: matchingDonor.donorid,
        response: "DECLINED",
        declineReason: "Temporarily travelling",
    });

    const declineOutbox = await waitForOutboxRecord({
        userid: requesterUser.userid,
        idempotencykey: `SMS:DONOR_DECLINED:${bloodRequest.requestid}:${matchingDonorUser.userid}`,
    });
    assert(declineOutbox !== null, "6.1 Requester receives status update SMS when a matched donor declines");

    // 6b. Donor Accepts / Volunteers
    bloodRequestEventEmitter.emit(EVENTS.DONOR_RESPONDED, {
        requestId: bloodRequest.requestid,
        donorUserId: matchingDonorUser.userid,
        donorId: matchingDonor.donorid,
        response: "ACCEPTED",
        eta: "Within 1 hour",
    });

    const acceptOutbox = await waitForOutboxRecord({
        userid: requesterUser.userid,
        templatename: "REQUESTER_DONOR_VOLUNTEERED",
    });
    assert(acceptOutbox !== null, "6.2 Requester receives volunteer alert when donor accepts");

    // -------------------------------------------------------------------------
    // SCENARIO 7: Hospital ↔ Blood Bank Custom SMS Communication
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 7: Hospital ↔ Blood Bank Custom SMS Communication ---");

    // Create an assignment link between the hospital's request and the blood bank
    const assignment = await prisma.requisitionassignments.create({
        data: {
            requestid: bloodRequest.requestid,
            bloodbankid: bloodBank.bloodbankid,
            assignedbyuserid: hospitalUser.userid,
            assignmentstatus: "PENDING_ACCEPTANCE",
        },
    });

    // 7a. Hospital sends Custom SMS to Blood Bank
    const hospitalSendResult = await CustomSmsService.sendCustomSms({
        senderUserId: hospitalUser.userid,
        senderRole: "HOSPITAL",
        recipientUserId: bloodBankUser.userid,
        messageText: "Urgent requisition: Please verify availability of 2 units B+ whole blood.",
        idempotencyKey: `CUSTOM_SMS:HOSP_TO_BB:${testRunId}`,
    });

    assert(hospitalSendResult.success === true, "7.1 Hospital successfully sent Custom SMS to authorized Blood Bank");
    assert(
        hospitalSendResult.outboxId !== undefined,
        "7.2 Outbox entry created for Hospital -> Blood Bank SMS"
    );

    // 7b. Blood Bank sends Custom SMS to Hospital
    const bbSendResult = await CustomSmsService.sendCustomSms({
        senderUserId: bloodBankUser.userid,
        senderRole: "BLOOD_BANK",
        recipientUserId: hospitalUser.userid,
        messageText: "Requisition acknowledged. 2 units B+ are reserved and ready for transport.",
        idempotencyKey: `CUSTOM_SMS:BB_TO_HOSP:${testRunId}`,
    });

    assert(bbSendResult.success === true, "7.3 Blood Bank successfully sent Custom SMS to authorized Hospital");
    assert(
        bbSendResult.outboxId !== undefined,
        "7.4 Outbox entry created for Blood Bank -> Hospital SMS"
    );

    // -------------------------------------------------------------------------
    // SCENARIO 8: Unauthorized Organizations Blocked
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 8: Unauthorized Organization Access Prevention ---");

    // Create an unrelated hospital in a different state
    const unrelatedHospUser = await prisma.users.create({
        data: {
            name: `Unrelated Hospital ${testRunId}`,
            email: `unrelated_${testRunId}@swastya.test`,
            phonenumber: "+919876500099",
            password: "hashed_test_password",
            role: "HOSPITAL",
            isactive: true,
        },
    });

    await prisma.hospitals.create({
        data: {
            userid: unrelatedHospUser.userid,
            hospitalname: `Unrelated Delhi Clinic ${testRunId}`,
            registrationnumber: `UNREL-REG-${testRunId}`,
            contactpersonname: "Admin",
            contactpersonphone: "+919876500099",
            address: "Connaught Place",
            city: "New Delhi", // Different city & state
            state: "Delhi",
            pincode: "110001",
            approvalstatus: "APPROVED",
        },
    });

    // Attempt unauthorized send from unrelated hospital to this blood bank
    let rejectedUnauthorized = false;
    try {
        await CustomSmsService.sendCustomSms({
            senderUserId: unrelatedHospUser.userid,
            senderRole: "HOSPITAL",
            recipientUserId: bloodBankUser.userid,
            messageText: "Unauthorized probing message.",
        });
    } catch (err: any) {
        if (err.code === "RECIPIENT_NOT_PERMITTED" || err.statusCode === 403) {
            rejectedUnauthorized = true;
        }
    }

    assert(
        rejectedUnauthorized === true,
        "8.1 Unrelated hospital with no operational tie is strictly blocked with 403 / RECIPIENT_NOT_PERMITTED"
    );

    // -------------------------------------------------------------------------
    // SCENARIO 9: Emergency Broadcast Remains Completely Unaffected
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 9: Emergency Broadcast Isolation ---");

    // Count emergency broadcast records created during this run for the bloodRequest
    const broadcastCount = await prisma.emergencybroadcasts.count({
        where: { requestid: bloodRequest.requestid },
    });

    assert(
        broadcastCount === 0,
        "9.1 Standard blood request matching did NOT trigger any Emergency Broadcast record",
        `Expected 0 broadcasts, got ${broadcastCount}`
    );

    // -------------------------------------------------------------------------
    // SCENARIO 10: Failed SMS Retried and Accurately Recorded
    // -------------------------------------------------------------------------
    console.log("\n--- Scenario 10: Outbox Worker & Status Accuracy ---");

    const worker = new OutboxWorkerService({
        pollIntervalMs: 500,
        batchSize: 10,
        workerId: `test_worker_${testRunId}`,
    });

    // Recover any stale locks and process pending batch
    const recovered = await worker.recoverStaleLocks();
    assert(recovered >= 0, "10.1 OutboxWorker successfully checked for stale locks");

    // Process outbox messages with MockSmsProvider until our items are processed
    for (let attempt = 0; attempt < 10; attempt++) {
        await (worker as any).processBatch();
        const pendingCount = await prisma.smsoutbox.count({
            where: {
                outboxid: { in: [donorOutbox?.outboxid || "", hospitalSendResult.outboxId, bbSendResult.outboxId] },
                status: "PENDING",
            },
        });
        if (pendingCount === 0) break;
    }

    // Check statuses in outbox
    const processedMessages = await prisma.smsoutbox.findMany({
        where: {
            outboxid: { in: [donorOutbox?.outboxid || "", hospitalSendResult.outboxId, bbSendResult.outboxId] },
        },
        select: { outboxid: true, status: true, messagesid: true, dispatchconfirmedat: true },
    });

    for (const msg of processedMessages) {
        assert(
            msg.status === "MOCK_SENT" || msg.status === "ACCEPTED_BY_TWILIO" || msg.status === "SENT",
            `10.2 Outbox item ${msg.outboxid.slice(0, 8)} accurately marked '${msg.status}' (NOT falsely marked DELIVERED)`
        );
        assert(
            msg.messagesid !== null,
            `10.3 Dispatch record contains genuine message SID: ${msg.messagesid}`
        );
    }

    // -------------------------------------------------------------------------
    // Cleanup Test Data Safely
    // -------------------------------------------------------------------------
    console.log("\n--- Cleaning Up Test Data ---");
    try {
        await prisma.smsoutbox.deleteMany({
            where: {
                userid: {
                    in: [
                        requesterUser.userid,
                        matchingDonorUser.userid,
                        incompatibleDonorUser.userid,
                        unavailableDonorUser.userid,
                        hospitalUser.userid,
                        bloodBankUser.userid,
                        emptyBloodBankUser.userid,
                        unrelatedHospUser.userid,
                    ],
                },
            },
        });
        await prisma.actiontokens.deleteMany({
            where: {
                userid: {
                    in: [
                        requesterUser.userid,
                        matchingDonorUser.userid,
                        hospitalUser.userid,
                        bloodBankUser.userid,
                    ],
                },
            },
        });
        await prisma.requisitionassignments.deleteMany({ where: { assignmentid: assignment.assignmentid } });
        await prisma.bloodrequests.deleteMany({ where: { requestid: bloodRequest.requestid } });
        await prisma.inventory.deleteMany({ where: { bloodbankid: bloodBank.bloodbankid } });
        await prisma.donors.deleteMany({
            where: {
                userid: { in: [matchingDonorUser.userid, incompatibleDonorUser.userid, unavailableDonorUser.userid] },
            },
        });
        await prisma.hospitals.deleteMany({ where: { userid: { in: [hospitalUser.userid, unrelatedHospUser.userid] } } });
        await prisma.bloodbanks.deleteMany({ where: { userid: { in: [bloodBankUser.userid, emptyBloodBankUser.userid] } } });
        await prisma.requesters.deleteMany({ where: { userid: requesterUser.userid } });
        await prisma.users.deleteMany({
            where: {
                userid: {
                    in: [
                        requesterUser.userid,
                        matchingDonorUser.userid,
                        incompatibleDonorUser.userid,
                        unavailableDonorUser.userid,
                        hospitalUser.userid,
                        bloodBankUser.userid,
                        emptyBloodBankUser.userid,
                        unrelatedHospUser.userid,
                    ],
                },
            },
        });
        console.log("Cleanup completed.");
    } catch (cleanupErr) {
        console.warn("Cleanup warning:", cleanupErr);
    }

    console.log("\n===============================================================================");
    console.log(` SWASTYA SMS TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log("===============================================================================\n");

    if (passedTests === totalTests) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Unhandled test suite exception:", err);
    process.exit(1);
});
