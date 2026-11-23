import http from "node:http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, urgency_level, gender_type } from "../src/generated/prisma/enums";

let API_BASE = "http://127.0.0.1:5000";
let server: http.Server | null = null;

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

async function runE2EIntegrationTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 5.5: COMPLETE MULTI-ROLE E2E WORKFLOW & SECURITY VERIFICATION  ");
    console.log("===============================================================================\n");

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as any;
    API_BASE = `http://127.0.0.1:${addr.port}`;
    console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);

    const timestamp = Date.now();
    const reqEmail = `e2e_req_${timestamp}@example.com`;
    const hospAEmail = `e2e_hosp_a_${timestamp}@example.com`;
    const hospBEmail = `e2e_hosp_b_${timestamp}@example.com`;
    const donorEmail = `e2e_donor_${timestamp}@example.com`;
    const legacyHospEmail = `e2e_legacy_hosp_${timestamp}@example.com`;

    let reqUser: any = null;
    let hospAUser: any = null;
    let hospBUser: any = null;
    let donorUser: any = null;
    let legacyHospUser: any = null;

    let hospitalARecord: any = null;
    let hospitalBRecord: any = null;
    let donorRecord: any = null;

    let reqToken = "";
    let hospAToken = "";
    let hospBToken = "";
    let donorToken = "";
    let legacyHospToken = "";

    let createdRequest: any = null;
    let hospitalANotifId = "";

    try {
        console.log("--- 1. Provisioning Disposable Entities for Requester, Hospital A, Hospital B, and Donor ---");

        // 1a. Register Requester
        const regReqRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Ananya Sharma",
                email: reqEmail,
                password: "SecurePassword123!",
                role: "REQUESTER",
                phonenumber: "9111110001",
                address: "Flat 101, Palm Grove",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
            }),
        });
        const reqData: any = await regReqRes.json();
        assert(regReqRes.status === 201, "1a. Requester registration returned HTTP 201");
        assert(Boolean(reqData.token), "1b. Requester received JWT token");
        reqToken = reqData.token;
        reqUser = reqData.user;

        // 1b. Register Hospital A (Assigned Medical Facility)
        const regHospARes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "St. Jude Memorial Hospital",
                email: hospAEmail,
                password: "HospitalPassword123!",
                role: "HOSPITAL",
                hospitalname: "St. Jude Memorial Hospital",
                registrationnumber: `REG-HOSP-A-${timestamp}`,
                contactpersonname: "Dr. Vikram Seth",
                contactpersonphone: "9111110002",
                address: "100 Medical Enclave",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560002",
            }),
        });
        const hospAData: any = await regHospARes.json();
        assert(regHospARes.status === 201, "1c. Hospital A registration returned HTTP 201");
        assert(Boolean(hospAData.token), "1d. Hospital A received JWT token");
        assert(Boolean(hospAData.hospital), "1e. Hospital A profile record linked");
        hospAToken = hospAData.token;
        hospAUser = hospAData.user;
        hospitalARecord = hospAData.hospital;

        // 1c. Register Hospital B (Unrelated Facility for Isolation Testing)
        const regHospBRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Metro Apex Hospital",
                email: hospBEmail,
                password: "HospitalPassword123!",
                role: "HOSPITAL",
                hospitalname: "Metro Apex Hospital",
                registrationnumber: `REG-HOSP-B-${timestamp}`,
                contactpersonname: "Dr. Sunita Rao",
                contactpersonphone: "9111110003",
                address: "200 Health Way",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560003",
            }),
        });
        const hospBData: any = await regHospBRes.json();
        assert(regHospBRes.status === 201, "1f. Hospital B registration returned HTTP 201");
        hospBToken = hospBData.token;
        hospBUser = hospBData.user;
        hospitalBRecord = hospBData.hospital;

        await prisma.hospitals.updateMany({
            where: { hospitalid: { in: [hospitalARecord.hospitalid, hospitalBRecord.hospitalid] } },
            data: { approvalstatus: "APPROVED" },
        });

        // 1d. Register Compatible Eligible Donor
        const regDonorRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Karan Malhotra",
                email: donorEmail,
                password: "DonorPassword123!",
                role: "DONOR",
                bloodgroup: "O+",
                dateofbirth: "1996-08-20",
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                phone: "9111110004",
                availabilitystatus: "AVAILABLE",
            }),
        });
        const donorData: any = await regDonorRes.json();
        assert(regDonorRes.status === 201, `1g. Donor registration returned HTTP 201 (got ${regDonorRes.status}: ${donorData?.message || ""})`);
        donorToken = donorData.token;
        donorUser = donorData.user;
        donorRecord = donorData.donor;

        // 1e. Provision Legacy Hospital Account without linked hospital profile
        legacyHospUser = await prisma.users.create({
            data: {
                name: "Legacy Hospital Staff",
                email: legacyHospEmail,
                password: "HashedPassword123!",
                role: "HOSPITAL",
                isactive: true,
                emailverified: true,
            },
        });
        legacyHospToken = generateToken(legacyHospUser.userid, "HOSPITAL");
        assert(Boolean(legacyHospToken), "1h. Legacy unlinked hospital account provisioned");

        console.log("\n--- 2. Workflow Steps 1 & 2: Blood Requisition Creation & Initial Persistence ---");
        const reqForm = new FormData();
        reqForm.append("patientname", "Rajesh Sharma");
        reqForm.append("patientage", "45");
        reqForm.append("patientgender", "MALE");
        reqForm.append("patientcontact", "9876543210");
        reqForm.append("bloodgroup", "O_POSITIVE");
        reqForm.append("bloodcomponent", "WHOLE_BLOOD");
        reqForm.append("unitsrequired", "1");
        reqForm.append("urgencylevel", "CRITICAL");
        reqForm.append("isemergency", "true");
        reqForm.append("requiredby", new Date(Date.now() + 86400000).toISOString());
        reqForm.append("notes", "Emergency surgical requisition for cardiac care.");
        reqForm.append("hospitalid", hospitalARecord.hospitalid);
        reqForm.append(
            "prescription",
            new Blob([Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n")], { type: "application/pdf" }),
            "prescription.pdf"
        );

        const createReqRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${reqToken}`,
            },
            body: reqForm,
        });
        const reqCreateData: any = await createReqRes.json();
        assert(createReqRes.status === 201, "2a. Requester created blood requisition (HTTP 201)");
        createdRequest = reqCreateData.bloodRequest || reqCreateData;
        assert(Boolean(createdRequest.requestid), "2b. Requisition has valid UUID requestid");
        assert(createdRequest.status === "CREATED", "2c. Initial requisition status is CREATED");
        assert(createdRequest.hospitalid === hospitalARecord.hospitalid, "2d. Correctly assigned to Hospital A");

        // Verify Status History Table
        const initialHist = await prisma.requeststatushistory.findMany({
            where: { requestid: createdRequest.requestid },
        });
        assert(initialHist.length === 1, "2e. Exactly 1 status history record created initially");
        assert(initialHist[0].newstatus === "CREATED", "2f. Initial history record newstatus is CREATED");
        assert(initialHist[0].changedbyuserid === reqUser.userid, "2g. Initial history changedby matches Requester");

        console.log("\n--- 3. Workflow Step 3: Targeted Hospital Notification Delivery ---");
        const hospANotifsRes = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const hospANotifsData: any = await hospANotifsRes.json();
        assert(hospANotifsRes.status === 200, "3a. Hospital A fetched notifications (HTTP 200)");
        const newReqNotif = hospANotifsData.notifications.find((n: any) => n.requestid === createdRequest.requestid);
        assert(Boolean(newReqNotif), "3b. Hospital A received notification for new requisition");
        assert(newReqNotif.title === "New Blood Requisition Received", "3c. Notification title verified");
        assert(newReqNotif.message.includes("unit") && !newReqNotif.message.includes("Rajesh Sharma"), "3d. Notification message omits unaccepted patient PII per privacy standards");
        hospitalANotifId = newReqNotif.notificationid;

        // Isolation: Hospital B received 0 notifications
        const hospBNotifsRes = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        const hospBNotifsData: any = await hospBNotifsRes.json();
        const leakNotif = hospBNotifsData.notifications.find((n: any) => n.requestid === createdRequest.requestid);
        assert(!leakNotif, "3e. Privacy isolation: Hospital B received 0 notifications for Hospital A's requisition");

        console.log("\n--- 4. Workflow Steps 4 & 5: Donor Matching Feed & Voluntary Response ---");
        const donorFeedRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${donorToken}` },
        });
        const donorFeedData: any = await donorFeedRes.json();
        assert(donorFeedRes.status === 200, "4a. Donor matching feed returned HTTP 200");
        const matchedItem = (donorFeedData.requests || donorFeedData).find((r: any) => r.requestid === createdRequest.requestid);
        assert(Boolean(matchedItem), "4b. Eligible donor sees compatible requisition in feed");

        // Donor voluntarily responds
        const respondRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/respond`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({
                estimatedArrival: "Within 45 minutes",
                notes: "On my way to hospital blood center",
                screeningAnswers: {
                    drinksAlcohol: false,
                    alcoholInPast24Hours: false,
                    feelingHealthy: true,
                    recentAntibioticsOrMedication: false,
                    recentTattooOrSurgery: false,
                    donatedInLast90Days: false,
                    chronicIllness: false,
                    isPregnantOrBreastfeeding: false,
                },
            }),
        });
        const respondData: any = await respondRes.json();
        assert(respondRes.status === 200, "4c. Donor volunteered successfully (HTTP 200)");
        assert(respondData.status === "DONOR_MATCHING", `4d. Request status transitioned to DONOR_MATCHING (got ${respondData.status})`);

        // Step 5b: Deduplication - Prevent duplicate voluntary response
        const dupRespondRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/respond`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({
                estimatedArrival: "1 hour",
                screeningAnswers: {
                    drinksAlcohol: false,
                    alcoholInPast24Hours: false,
                    feelingHealthy: true,
                    recentAntibioticsOrMedication: false,
                    recentTattooOrSurgery: false,
                    donatedInLast90Days: false,
                    chronicIllness: false,
                    isPregnantOrBreastfeeding: false,
                },
            }),
        });
        assert(dupRespondRes.status === 400, "4e. Deduplication: Duplicate volunteer response rejected with HTTP 400");

        console.log("\n--- 5. Workflow Step 6: Dual Notification to Requester & Assigned Hospital ---");
        const reqNotifsRes = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${reqToken}` },
        });
        const reqNotifsData: any = await reqNotifsRes.json();
        const reqMatchNotif = reqNotifsData.notifications.find((n: any) => n.requestid === createdRequest.requestid && n.type === "MATCH");
        assert(Boolean(reqMatchNotif), "5a. Requester received volunteer match notification");

        const hospANotifs2 = await fetch(`${API_BASE}/notifications`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const hospANotifsData2: any = await hospANotifs2.json();
        const hospVolNotif = hospANotifsData2.notifications.find((n: any) => n.requestid === createdRequest.requestid && n.title === "Volunteer Donor Matched");
        assert(Boolean(hospVolNotif), "5b. Hospital A received 'Volunteer Donor Matched' notification");

        console.log("\n--- 6. Workflow Steps 7 & 8: Hospital Coordination & Permitted Transitions ---");
        // Hospital A accesses request details
        const getReqRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const getReqData: any = await getReqRes.json();
        assert(getReqRes.status === 200, "6a. Hospital A fetched requisition details (HTTP 200)");
        assert(getReqData.volunteers && getReqData.volunteers.length === 1, "6b. Volunteers array contains exactly 1 voluntary donor");
        assert(getReqData.volunteers[0].donorName === "Karan Malhotra", "6c. Donor identity correctly presented");

        // Prohibited jump: Direct jump to FULFILLED rejected
        const directFulfillRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(directFulfillRes.status === 400, "6d. Safety guard: Direct jump to FULFILLED rejected with HTTP 400");

        // Authorized hospital verifies prescription before advancing to BLOOD_ARRANGED
        const verifyRxRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                status: "VERIFIED",
                remarks: "Clinical prescription verified by Hospital A",
            }),
        });
        const verifyRxData: any = await verifyRxRes.json();
        assert(
            verifyRxRes.status === 200 && (verifyRxData.prescription?.status === "VERIFIED" || verifyRxData.status === "VERIFIED"),
            "6d-rx. Hospital A verified clinical prescription (VERIFIED)"
        );

        // Requester accepts volunteer commitment before transit begins
        const acceptVolRes = await fetch(
            `${API_BASE}/bloodrequests/${createdRequest.requestid}/volunteers/${getReqData.volunteers[0].deliveryId}/decision`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${reqToken}`,
                },
                body: JSON.stringify({ decision: "ACCEPTED" }),
            }
        );
        assert(acceptVolRes.status === 200, "6d-vol. Requester accepted volunteer commitment before transit");

        console.log("\n--- 7. Workflow Step 9: Donor Transit Milestones Tracking ---");
        // Donor updates transit: STARTED -> REACHED_LOCATION
        const transitStart = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/transit-status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({ status: "STARTED" }),
        });
        assert(transitStart.status === 200, "7a. Donor transit updated to STARTED");

        const transitReached = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/transit-status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${donorToken}`,
            },
            body: JSON.stringify({ status: "REACHED_LOCATION" }),
        });
        assert(transitReached.status === 200, "7b. Donor transit updated to REACHED_LOCATION");

        // Assigned hospital confirms blood collected / transit completed
        const transitDone = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}/transit-status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({ status: "COMPLETED", donorUserId: donorUser.userid }),
        });
        const transitDoneData: any = await transitDone.json();
        assert(transitDone.status === 200, "7c. Assigned hospital confirmed transit COMPLETED");
        assert(transitDoneData.bloodArranged === true, "6e. Status automatically transitioned to BLOOD_ARRANGED upon completed units");

        console.log("\n--- 8. Workflow Step 10: Physical Transfusion Verification & Fulfillment ---");
        // Requester cannot fulfill
        const reqFulfillRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${reqToken}`,
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(reqFulfillRes.status === 403, "8a. Requester cannot mark request FULFILLED (HTTP 403)");

        // Unrelated Hospital B cannot fulfill
        const hospBFulfillRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospBToken}`,
            },
            body: JSON.stringify({ status: "FULFILLED" }),
        });
        assert(hospBFulfillRes.status === 403, "8b. Unrelated Hospital B cannot mark request FULFILLED (HTTP 403)");

        // Authorized Hospital A fulfills with explicit clinical confirmation
        const fulfillRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                status: "FULFILLED",
                remarks: "Physical transfusion completed and clinically verified by attending medical staff.",
                notes: "Whole blood transfusion completed without acute reaction. Patient vitals stable.",
            }),
        });
        assert(fulfillRes.status === 200, "8c. Authorized Hospital A marks request FULFILLED (HTTP 200)");

        // Terminal state lock: No further modifications allowed
        const postFulfillEdit = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({ status: "BLOOD_ARRANGED" }),
        });
        assert(postFulfillEdit.status === 400, "8d. Terminal lock: Attempt to reverse FULFILLED request rejected with HTTP 400");

        console.log("\n--- 9. Workflow Step 11: Cross-Portal Consistency Check ---");
        // Requester view
        const finalReqCheck = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            headers: { Authorization: `Bearer ${reqToken}` },
        });
        const finalReqData: any = await finalReqCheck.json();
        assert(finalReqData.status === "FULFILLED", "9a. Requester portal reflects FULFILLED status");
        assert(finalReqData.requeststatushistory.length >= 3, "9b. Complete audit history trail available to requester");

        // Hospital view
        const finalHospCheck = await fetch(`${API_BASE}/hospitals/me/dashboard`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const finalHospData: any = await finalHospCheck.json();
        assert(finalHospData.fulfilledRequests >= 1, "9c. Hospital dashboard reflects fulfilled count increment");

        console.log("\n--- 10. Security & Authorization Deep-Dive ---");
        // 10a. Cross-Hospital Tenant Isolation
        const crossReadRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        assert(crossReadRes.status === 403, "10a. Hospital B blocked from reading Hospital A requisition (HTTP 403)");

        const crossEditRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospBToken}`,
            },
            body: JSON.stringify({ notes: "Malicious override" }),
        });
        assert(crossEditRes.status === 403, "10b. Hospital B blocked from updating Hospital A requisition (HTTP 403)");

        // 10b. Legacy Account Safety (Unlinked Hospital Profile)
        const legacyEditRes = await fetch(`${API_BASE}/bloodrequests/${createdRequest.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${legacyHospToken}`,
            },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW" }),
        });
        assert(legacyEditRes.status === 403, "10c. Legacy account without hospital profile receives HTTP 403 without crash");

        // 10c. Privacy: Password hash never exposed in API responses
        assert(!("password" in finalReqData.users), "10d. User password hash NOT leaked in blood request users object");
        const selfHospRes = await fetch(`${API_BASE}/hospitals/me`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const selfHospData: any = await selfHospRes.json();
        assert(!("password" in (selfHospData.hospital?.users || {})), "10e. Password hash NOT leaked in /hospitals/me response");

        // 10d. Notification Ownership Guards
        const notifReadRes = await fetch(`${API_BASE}/notifications/${hospitalANotifId}/read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        assert(notifReadRes.status === 403, "10f. Hospital B blocked from marking Hospital A notification as read (HTTP 403)");

        const notifDeleteRes = await fetch(`${API_BASE}/notifications/${hospitalANotifId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        assert(notifDeleteRes.status === 403, "10g. Hospital B blocked from deleting Hospital A notification (HTTP 403)");

        // Authorized Hospital A marks read cleanly
        const validNotifRead = await fetch(`${API_BASE}/notifications/${hospitalANotifId}/read`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        assert(validNotifRead.status === 200, "10h. Authorized Hospital A marks notification as read (HTTP 200)");

        console.log("\n===============================================================================");
        console.log(`  ALL ${passedTests} E2E INTEGRATION TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
        console.log("===============================================================================\n");

    } finally {
        console.log("--- Safely cleaning up disposable test records ---");
        try {
            if (createdRequest?.requestid) {
                await prisma.notification.deleteMany({ where: { requestid: createdRequest.requestid } });
                await prisma.donationhistory.deleteMany({ where: { requestid: createdRequest.requestid } });
                await prisma.prescription.deleteMany({ where: { requestid: createdRequest.requestid } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: createdRequest.requestid } });
                await prisma.bloodrequests.delete({ where: { requestid: createdRequest.requestid } });
            }
            if (reqUser?.userid) {
                await prisma.requesters.deleteMany({ where: { userid: reqUser.userid } });
                await prisma.notification.deleteMany({ where: { userid: reqUser.userid } });
                await prisma.users.delete({ where: { userid: reqUser.userid } });
            }
            if (hospAUser?.userid) {
                await prisma.hospitals.deleteMany({ where: { userid: hospAUser.userid } });
                await prisma.notification.deleteMany({ where: { userid: hospAUser.userid } });
                await prisma.users.delete({ where: { userid: hospAUser.userid } });
            }
            if (hospBUser?.userid) {
                await prisma.hospitals.deleteMany({ where: { userid: hospBUser.userid } });
                await prisma.notification.deleteMany({ where: { userid: hospBUser.userid } });
                await prisma.users.delete({ where: { userid: hospBUser.userid } });
            }
            if (donorUser?.userid) {
                await prisma.donors.deleteMany({ where: { userid: donorUser.userid } });
                await prisma.notification.deleteMany({ where: { userid: donorUser.userid } });
                await prisma.users.delete({ where: { userid: donorUser.userid } });
            }
            if (legacyHospUser?.userid) {
                await prisma.users.delete({ where: { userid: legacyHospUser.userid } });
            }
            console.log("Cleanup completed cleanly.");
        } catch (cleanupErr) {
            console.error("Cleanup notice:", cleanupErr);
        }

        if (server) {
            server.close();
        }
    }
}

runE2EIntegrationTests().catch((err) => {
    console.error("E2E Test Execution Error:", err);
    process.exit(1);
});
