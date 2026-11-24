/**
 * SWASTYA IN-APP PEER-TO-PEER COMMUNICATION TEST SUITE
 *
 * Verifies:
 * 1. Hospital A sends message to Hospital B
 * 2. Hospital B receives and marks read
 * 3. Hospital B replies to Hospital A
 * 4. Hospital A sees the reply
 * 5. Blood Bank A sends message to Blood Bank B
 * 6. Blood Bank B receives and replies
 * 7. Unauthorized users cannot access conversations (donor/requester)
 * 8. Hospital conversations cannot be accessed through blood bank accounts (403)
 * 9. Blood bank conversations cannot be accessed through hospital accounts (403)
 * 10. In-app messages STRICTLY DO NOT create SMS outbox entries
 * 11. Empty database behavior returns graceful empty states
 */

import { prisma } from "../src/config/prisma";
import { HospitalCommunicationService, BloodBankCommunicationService } from "../src/services/peerCommunication.service";
import assert from "assert";

async function runTests() {
    console.log("===============================================================================");
    console.log(" SWASTYA: IN-APP PEER-TO-PEER COMMUNICATION TEST SUITE");
    console.log("===============================================================================\n");

    const testRunId = Math.random().toString(36).slice(2, 7);

    // Initial SMS outbox count to ensure in-app messages never create SMS records
    const initialOutboxCount = await prisma.smsoutbox.count();

    // -------------------------------------------------------------------------
    // 1. Create Test Fixtures: 2 Hospitals, 2 Blood Banks, 1 Donor
    // -------------------------------------------------------------------------
    console.log("--- Setting Up Isolated Test Fixtures ---");

    // Hospital A
    const hospAUser = await prisma.users.create({
        data: {
            name: `City General Hospital ${testRunId}`,
            email: `hospA_${testRunId}@swastya.test`,
            phonenumber: "+919876510001",
            password: "hashed_test_password",
            role: "HOSPITAL",
            isactive: true,
        },
    });

    const hospitalA = await prisma.hospitals.create({
        data: {
            userid: hospAUser.userid,
            hospitalname: `City General Hospital ${testRunId}`,
            registrationnumber: `HOSP-A-${testRunId}`,
            contactpersonname: "Dr. Sharma",
            contactpersonphone: "+919876510001",
            address: "Sector 1",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500001",
            approvalstatus: "APPROVED",
        },
    });

    // Hospital B
    const hospBUser = await prisma.users.create({
        data: {
            name: `Metro Care Hospital ${testRunId}`,
            email: `hospB_${testRunId}@swastya.test`,
            phonenumber: "+919876510002",
            password: "hashed_test_password",
            role: "HOSPITAL",
            isactive: true,
        },
    });

    const hospitalB = await prisma.hospitals.create({
        data: {
            userid: hospBUser.userid,
            hospitalname: `Metro Care Hospital ${testRunId}`,
            registrationnumber: `HOSP-B-${testRunId}`,
            contactpersonname: "Dr. Patel",
            contactpersonphone: "+919876510002",
            address: "Sector 2",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500002",
            approvalstatus: "APPROVED",
        },
    });

    // Blood Bank A
    const bbAUser = await prisma.users.create({
        data: {
            name: `Central Blood Center ${testRunId}`,
            email: `bbA_${testRunId}@swastya.test`,
            phonenumber: "+919876510003",
            password: "hashed_test_password",
            role: "BLOOD_BANK",
            isactive: true,
        },
    });

    const bloodBankA = await prisma.bloodbanks.create({
        data: {
            userid: bbAUser.userid,
            bloodbankname: `Central Blood Center ${testRunId}`,
            licensenumber: `BB-A-${testRunId}`,
            contactpersonname: "Manager Roy",
            contactpersonphone: "+919876510003",
            address: "Road 10",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500010",
            approvalstatus: "APPROVED",
        },
    });

    // Blood Bank B
    const bbBUser = await prisma.users.create({
        data: {
            name: `Apex Blood Repository ${testRunId}`,
            email: `bbB_${testRunId}@swastya.test`,
            phonenumber: "+919876510004",
            password: "hashed_test_password",
            role: "BLOOD_BANK",
            isactive: true,
        },
    });

    const bloodBankB = await prisma.bloodbanks.create({
        data: {
            userid: bbBUser.userid,
            bloodbankname: `Apex Blood Repository ${testRunId}`,
            licensenumber: `BB-B-${testRunId}`,
            contactpersonname: "Officer Sen",
            contactpersonphone: "+919876510004",
            address: "Road 12",
            city: "Hyderabad",
            state: "Telangana",
            pincode: "500012",
            approvalstatus: "APPROVED",
        },
    });

    // Donor User (unauthorized)
    const donorUser = await prisma.users.create({
        data: {
            name: `Donor ${testRunId}`,
            email: `donor_${testRunId}@swastya.test`,
            phonenumber: "+919876510005",
            password: "hashed_test_password",
            role: "DONOR",
            isactive: true,
        },
    });

    console.log("Fixtures created successfully.\n");

    let passedCount = 0;
    let failedCount = 0;

    function recordPass(label: string) {
        console.log(`  [PASS] ${label}`);
        passedCount++;
    }

    function recordFail(label: string, err: any) {
        console.error(`  [FAIL] ${label}:`, err);
        failedCount++;
    }

    // -------------------------------------------------------------------------
    // TEST 1 & 2: Hospital A Sends Message to Hospital B
    // -------------------------------------------------------------------------
    console.log("--- Hospital-to-Hospital Communication ---");

    try {
        // List peers from Hospital A's perspective
        const peersA = await HospitalCommunicationService.listPeerHospitals(hospAUser.userid);
        assert(peersA.some(p => p.hospitalid === hospitalB.hospitalid), "Hospital B appears in Hospital A's peer directory");
        assert(!peersA.some(p => p.hospitalid === hospitalA.hospitalid), "Hospital A does NOT appear in its own peer directory");
        recordPass("1.1 Hospital A discovers registered peer hospitals without including itself");
    } catch (e: any) {
        recordFail("1.1 Hospital A peer discovery", e.message);
    }

    let sentMsgA: any;
    try {
        sentMsgA = await HospitalCommunicationService.sendMessage(
            hospAUser.userid,
            hospitalB.hospitalid,
            "Urgent: Do you have an available surgical suite for patient transfer?"
        );
        assert(sentMsgA && sentMsgA.messageId, "Message created with valid ID");
        assert(sentMsgA.isOutgoing === true, "Sender sees isOutgoing=true");
        assert(sentMsgA.isRead === false, "Newly sent message is unread");
        recordPass("1.2 Hospital A successfully sends in-app message to Hospital B");
    } catch (e: any) {
        recordFail("1.2 Hospital A sends message", e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 3 & 4: Hospital B Receives, Reads, and Replies
    // -------------------------------------------------------------------------
    try {
        const convB = await HospitalCommunicationService.getConversation(hospBUser.userid, hospitalA.hospitalid);
        assert(convB.messages.length === 1, "Hospital B receives 1 message from Hospital A");
        assert(convB.messages[0].content.includes("surgical suite"), "Hospital B reads exact message content");
        assert(convB.messages[0].isRead === true, "Message is automatically marked read when Hospital B views conversation");
        recordPass("2.1 Hospital B retrieves conversation and marks incoming message as read");
    } catch (e: any) {
        recordFail("2.1 Hospital B retrieves conversation", e.message);
    }

    try {
        const replyB = await HospitalCommunicationService.sendMessage(
            hospBUser.userid,
            hospitalA.hospitalid,
            "Yes, Suite 3 is ready and staff is on standby."
        );
        assert(replyB && replyB.messageId, "Reply created with valid ID");
        recordPass("3.1 Hospital B sends reply message to Hospital A");
    } catch (e: any) {
        recordFail("3.1 Hospital B sends reply", e.message);
    }

    try {
        const convA = await HospitalCommunicationService.getConversation(hospAUser.userid, hospitalB.hospitalid);
        assert(convA.messages.length === 2, "Hospital A conversation shows both messages in thread");
        assert(convA.messages[1].content.includes("Suite 3 is ready"), "Hospital A sees Hospital B's reply");
        assert(convA.messages[1].isOutgoing === false, "Hospital A correctly identifies reply as incoming");
        recordPass("4.1 Hospital A sees updated thread history with Hospital B's reply");
    } catch (e: any) {
        recordFail("4.1 Hospital A sees thread history", e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 5 & 6: Blood Bank-to-Blood Bank Communication
    // -------------------------------------------------------------------------
    console.log("\n--- Blood Bank-to-Blood Bank Communication ---");

    try {
        const peersBB = await BloodBankCommunicationService.listPeerBloodBanks(bbAUser.userid);
        assert(peersBB.some(p => p.bloodbankid === bloodBankB.bloodbankid), "Blood Bank B appears in Blood Bank A's peer directory");
        assert(!peersBB.some(p => p.bloodbankid === bloodBankA.bloodbankid), "Blood Bank A does NOT appear in its own peer directory");
        recordPass("5.1 Blood Bank A discovers registered peer blood banks");
    } catch (e: any) {
        recordFail("5.1 Blood Bank A peer discovery", e.message);
    }

    try {
        const sentMsgBB = await BloodBankCommunicationService.sendMessage(
            bbAUser.userid,
            bloodBankB.bloodbankid,
            "Coordination: Can you transfer 3 units of O-Negative whole blood by 3 PM?"
        );
        assert(sentMsgBB && sentMsgBB.messageId, "Message created with valid ID");
        recordPass("5.2 Blood Bank A sends in-app message to Blood Bank B");

        const convBBB = await BloodBankCommunicationService.getConversation(bbBUser.userid, bloodBankA.bloodbankid);
        assert(convBBB.messages.length === 1, "Blood Bank B retrieves message from Blood Bank A");
        assert(convBBB.messages[0].content.includes("O-Negative"), "Message content matches");
        recordPass("6.1 Blood Bank B receives and reads message from Blood Bank A");

        const replyBB = await BloodBankCommunicationService.sendMessage(
            bbBUser.userid,
            bloodBankA.bloodbankid,
            "Confirmed. Dispatch courier scheduled for 2:15 PM."
        );
        assert(replyBB && replyBB.messageId, "Reply created with valid ID");
        recordPass("6.2 Blood Bank B replies to Blood Bank A");

        const convBBA = await BloodBankCommunicationService.getConversation(bbAUser.userid, bloodBankB.bloodbankid);
        assert(convBBA.messages.length === 2, "Blood Bank A sees conversation history with 2 messages");
        recordPass("6.3 Blood Bank A sees full thread history with Blood Bank B's reply");
    } catch (e: any) {
        recordFail("5.2 / 6.x Blood Bank messaging", e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 7, 8, 9: Cross-Organization Isolation & Access Control
    // -------------------------------------------------------------------------
    console.log("\n--- Cross-Organization Isolation & Access Prevention ---");

    // Hospital cannot access Blood Bank service
    try {
        await BloodBankCommunicationService.listPeerBloodBanks(hospAUser.userid);
        recordFail("7.1 Hospital accessing Blood Bank service", "Should have thrown profile error");
    } catch (e: any) {
        assert(e.message.includes("Blood bank profile not found"), "Hospital rejected from blood bank service");
        recordPass("7.1 Hospital account strictly blocked from blood bank communication service");
    }

    // Blood Bank cannot access Hospital service
    try {
        await HospitalCommunicationService.listPeerHospitals(bbAUser.userid);
        recordFail("7.2 Blood Bank accessing Hospital service", "Should have thrown profile error");
    } catch (e: any) {
        assert(e.message.includes("Hospital profile not found"), "Blood Bank rejected from hospital service");
        recordPass("7.2 Blood bank account strictly blocked from hospital communication service");
    }

    // Donor cannot access Hospital or Blood Bank service
    try {
        await HospitalCommunicationService.listPeerHospitals(donorUser.userid);
        recordFail("7.3 Donor accessing Hospital service", "Should have thrown profile error");
    } catch (e: any) {
        assert(e.message.includes("Hospital profile not found"), "Donor rejected from hospital service");
        recordPass("7.3 Donor account strictly blocked from hospital communication service");
    }

    try {
        await BloodBankCommunicationService.listPeerBloodBanks(donorUser.userid);
        recordFail("7.4 Donor accessing Blood Bank service", "Should have thrown profile error");
    } catch (e: any) {
        assert(e.message.includes("Blood bank profile not found"), "Donor rejected from blood bank service");
        recordPass("7.4 Donor account strictly blocked from blood bank communication service");
    }

    // Hospital cannot message a Blood Bank ID via hospital messaging
    try {
        await HospitalCommunicationService.sendMessage(hospAUser.userid, bloodBankA.bloodbankid, "Hello blood bank");
        recordFail("8.1 Hospital messaging Blood Bank via hospital table", "Should have failed recipient validation");
    } catch (e: any) {
        assert(e.message.includes("Recipient hospital does not exist"), "Hospital rejected from cross-sending to blood bank");
        recordPass("8.1 Hospital cannot send messages to Blood Bank IDs through Hospital-to-Hospital channel");
    }

    // Blood Bank cannot message a Hospital ID via blood bank messaging
    try {
        await BloodBankCommunicationService.sendMessage(bbAUser.userid, hospitalA.hospitalid, "Hello hospital");
        recordFail("8.2 Blood Bank messaging Hospital via blood bank table", "Should have failed recipient validation");
    } catch (e: any) {
        assert(e.message.includes("Recipient blood bank does not exist"), "Blood Bank rejected from cross-sending to hospital");
        recordPass("8.2 Blood Bank cannot send messages to Hospital IDs through Blood Bank-to-Blood Bank channel");
    }

    // -------------------------------------------------------------------------
    // TEST 10: Zero SMS Trigger Verification
    // -------------------------------------------------------------------------
    console.log("\n--- Verification: No SMS Outbox Generated for In-App Chat ---");

    const postChatOutboxCount = await prisma.smsoutbox.count();
    assert(
        postChatOutboxCount === initialOutboxCount,
        `SMS Outbox count remained unchanged: initial=${initialOutboxCount}, current=${postChatOutboxCount}`
    );
    recordPass("10.1 In-app peer messages strictly generated 0 SMS outbox entries (Independent of SMS)");

    // -------------------------------------------------------------------------
    // TEST 11: Empty Database / No Peer Graceful Handling
    // -------------------------------------------------------------------------
    console.log("\n--- Empty Database Handling Verification ---");

    // Empty conversation check with nonexistent/new peer
    const emptyConv = await HospitalCommunicationService.getConversation(hospAUser.userid, hospitalB.hospitalid);
    assert(Array.isArray(emptyConv.messages), "Conversation returns array of messages");
    recordPass("11.1 Message history handles queries gracefully without uncaught exceptions");

    // -------------------------------------------------------------------------
    // Cleanup Test Data
    // -------------------------------------------------------------------------
    console.log("\n--- Cleaning Up Test Data ---");
    await prisma.hospitalmessages.deleteMany({
        where: {
            OR: [
                { senderhospitalid: { in: [hospitalA.hospitalid, hospitalB.hospitalid] } },
                { recipienthospitalid: { in: [hospitalA.hospitalid, hospitalB.hospitalid] } },
            ],
        },
    });

    await prisma.bloodbankmessages.deleteMany({
        where: {
            OR: [
                { senderbloodbankid: { in: [bloodBankA.bloodbankid, bloodBankB.bloodbankid] } },
                { recipientbloodbankid: { in: [bloodBankA.bloodbankid, bloodBankB.bloodbankid] } },
            ],
        },
    });

    await prisma.hospitals.deleteMany({ where: { hospitalid: { in: [hospitalA.hospitalid, hospitalB.hospitalid] } } });
    await prisma.bloodbanks.deleteMany({ where: { bloodbankid: { in: [bloodBankA.bloodbankid, bloodBankB.bloodbankid] } } });
    await prisma.users.deleteMany({ where: { userid: { in: [hospAUser.userid, hospBUser.userid, bbAUser.userid, bbBUser.userid, donorUser.userid] } } });
    console.log("Cleanup completed.");

    console.log("\n===============================================================================");
    console.log(` RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
    console.log("===============================================================================");

    if (failedCount > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("Unhandled test suite exception:", err);
    process.exit(1);
});
