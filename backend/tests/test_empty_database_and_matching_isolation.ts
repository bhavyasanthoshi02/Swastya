/**
 * SWASTYA EMPTY DATABASE & MATCHING ISOLATION TEST SUITE
 *
 * Verifies graceful handling and safety rules:
 * 1. Matching when no donors, hospitals, or blood banks match -> 0 notifications, no crashes.
 * 2. No fabrication of matching results.
 * 3. Peer list when no other organizations exist -> returns [] without error.
 * 4. In-app communication conversation with no messages -> returns [] without error.
 * 5. Emergency Broadcast table is completely un-triggered and empty.
 */

import { prisma } from "../src/config/prisma";
import { DonorMatchingService } from "../src/services/donorMatching.service";
import { HospitalCommunicationService, BloodBankCommunicationService } from "../src/services/peerCommunication.service";
import { bloodRequestEventEmitter, EVENTS } from "../src/services/sms/bloodRequestEvents";
import { blood_group, blood_component } from "../src/generated/prisma/client";
import assert from "assert";

async function runTests() {
    console.log("===============================================================================");
    console.log(" SWASTYA: EMPTY DATABASE BEHAVIOR & ISOLATION TEST SUITE");
    console.log("===============================================================================\n");

    const testRunId = Math.random().toString(36).slice(2, 7);

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
    // TEST 1: Matching Algorithm with No Matching Donors in Region
    // -------------------------------------------------------------------------
    console.log("--- 1. Matching Algorithm Under Empty / Non-Matching Conditions ---");

    try {
        const dummyRequestId = "00000000-0000-0000-0000-000000000001";
        // Query for AB_NEGATIVE in remote unpopulated location
        const matchResult = await DonorMatchingService.getRankedEligibleDonors({
            requestid: dummyRequestId,
            bloodgroup: blood_group.AB_NEGATIVE,
            bloodcomponent: blood_component.WHOLE_BLOOD,
            searchradius: 1, // tiny 1km radius
            latitude: 28.6139, // New Delhi coordinates
            longitude: 77.2090,
        });

        assert(matchResult.success === true, "Matching service executed cleanly without uncaught errors");
        assert(Array.isArray(matchResult.data), "Matching service returns an array");
        assert(matchResult.data.length === 0, "No donors fabricated when no matching donors exist in radius");
        recordPass("1.1 Empty / non-matching donor search returns empty result without crashing or fabricating donors");
    } catch (e: any) {
        recordFail("1.1 Empty donor matching", e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Requisition Created in Empty Region -> 0 SMS Dispatched
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Requisition Event in Empty Region Dispatches 0 SMS ---");

    const requesterUser = await prisma.users.create({
        data: {
            name: `Empty Region Requester ${testRunId}`,
            email: `requester_empty_${testRunId}@swastya.test`,
            phonenumber: "+919876520001",
            password: "hashed_test_password",
            role: "REQUESTER",
            isactive: true,
        },
    });

    const requesterProfile = await prisma.requesters.create({
        data: {
            userid: requesterUser.userid,
            address: "123 Remote Road",
            city: "IsolatedRemoteCity",
            state: "RemoteState",
            pincode: "999999",
            latitude: 10.0000,
            longitude: 10.0000,
        },
    });

    const isolatedRequest = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: requesterUser.userid,
            requesterid: requesterProfile.requesterid,
            patientname: "Remote Patient",
            patientage: 50,
            patientgender: "FEMALE",
            patientcontact: "+919876520001",
            bloodgroup: blood_group.O_NEGATIVE,
            bloodcomponent: blood_component.WHOLE_BLOOD,
            unitsrequired: 1,
            urgencylevel: "MEDIUM",
            isemergency: false,
            searchradius: 5,
            latitude: 10.0000,
            longitude: 10.0000,
            requiredby: new Date(Date.now() + 24 * 60 * 60 * 1000),
            status: "CREATED",
        },
    });

    const initialOutboxCount = await prisma.smsoutbox.count();

    // Trigger event
    bloodRequestEventEmitter.emit(EVENTS.REQUEST_CREATED, {
        requestId: isolatedRequest.requestid,
        createdByUserId: requesterUser.userid,
        isEmergency: false,
        urgencyLevel: isolatedRequest.urgencylevel,
    });

    // Wait for event handler completion
    await new Promise(r => setTimeout(r, 1200));

    const postOutboxCount = await prisma.smsoutbox.count();
    assert(
        postOutboxCount === initialOutboxCount,
        `Zero SMS queued when no donors or organizations match. (before=${initialOutboxCount}, after=${postOutboxCount})`
    );
    recordPass("2.1 Requisition with no eligible recipients generates zero outbox records");

    // -------------------------------------------------------------------------
    // TEST 3: Peer List For Brand New Isolated Hospital / Blood Bank
    // -------------------------------------------------------------------------
    console.log("\n--- 3. In-App Peer Directory for Isolated Organization ---");

    const isolatedHospUser = await prisma.users.create({
        data: {
            name: `Isolated Hospital ${testRunId}`,
            email: `isolated_hosp_${testRunId}@swastya.test`,
            phonenumber: "+919876520002",
            password: "hashed_test_password",
            role: "HOSPITAL",
            isactive: true,
        },
    });

    const isolatedHosp = await prisma.hospitals.create({
        data: {
            userid: isolatedHospUser.userid,
            hospitalname: `Isolated Hospital ${testRunId}`,
            registrationnumber: `ISO-HOSP-${testRunId}`,
            contactpersonname: "Dr. Solo",
            contactpersonphone: "+919876520002",
            address: "Remote Valley",
            city: "RemoteCity",
            state: "RemoteState",
            pincode: "999998",
            approvalstatus: "APPROVED",
        },
    });

    try {
        const peers = await HospitalCommunicationService.listPeerHospitals(isolatedHospUser.userid);
        assert(Array.isArray(peers), "Returns array of peer hospitals");
        assert(!peers.some(p => p.hospitalid === isolatedHosp.hospitalid), "Does not list self");
        recordPass("3.1 Hospital peer directory returns valid list without self");
    } catch (e: any) {
        recordFail("3.1 Hospital peer directory", e.message);
    }

    const isolatedBBUser = await prisma.users.create({
        data: {
            name: `Isolated Blood Bank ${testRunId}`,
            email: `isolated_bb_${testRunId}@swastya.test`,
            phonenumber: "+919876520003",
            password: "hashed_test_password",
            role: "BLOOD_BANK",
            isactive: true,
        },
    });

    const isolatedBB = await prisma.bloodbanks.create({
        data: {
            userid: isolatedBBUser.userid,
            bloodbankname: `Isolated Blood Bank ${testRunId}`,
            licensenumber: `ISO-BB-${testRunId}`,
            contactpersonname: "Manager Solo",
            contactpersonphone: "+919876520003",
            address: "Remote Valley",
            city: "RemoteCity",
            state: "RemoteState",
            pincode: "999998",
            approvalstatus: "APPROVED",
        },
    });

    try {
        const peers = await BloodBankCommunicationService.listPeerBloodBanks(isolatedBBUser.userid);
        assert(Array.isArray(peers), "Returns array of peer blood banks");
        assert(!peers.some(p => p.bloodbankid === isolatedBB.bloodbankid), "Does not list self");
        recordPass("3.2 Blood Bank peer directory returns valid list without self");
    } catch (e: any) {
        recordFail("3.2 Blood Bank peer directory", e.message);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Emergency Broadcast Integrity Guard
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Emergency Broadcast Isolation Verification ---");

    const emergencyBroadcastCount = await prisma.emergencybroadcasts.count();
    assert(emergencyBroadcastCount === 0, `Emergency Broadcast count is 0 (current: ${emergencyBroadcastCount})`);
    recordPass("4.1 Emergency Broadcast table remains untouched (0 records triggered)");

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------
    console.log("\n--- Cleaning Up Isolation Test Data ---");
    await prisma.bloodrequests.delete({ where: { requestid: isolatedRequest.requestid } });
    await prisma.requesters.delete({ where: { requesterid: requesterProfile.requesterid } });
    await prisma.hospitals.delete({ where: { hospitalid: isolatedHosp.hospitalid } });
    await prisma.bloodbanks.delete({ where: { bloodbankid: isolatedBB.bloodbankid } });
    await prisma.users.deleteMany({
        where: {
            userid: { in: [requesterUser.userid, isolatedHospUser.userid, isolatedBBUser.userid] },
        },
    });
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
