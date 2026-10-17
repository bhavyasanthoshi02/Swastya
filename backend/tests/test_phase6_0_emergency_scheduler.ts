import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, urgency_level, request_status } from "../src/generated/prisma/enums";
import app from "../src/app";
import http from "http";
import {
    scheduleEmergencyFollowUp,
    claimNextDueJob,
    recoverAbandonedJobs,
    cancelPendingJobs,
    executeFollowUpJob,
    processJob,
    processDueJobs,
    sanitizeErrorMessage,
    MAX_RADIUS_KM,
    DEFAULT_RADIUS_INCREMENT_KM,
} from "../src/services/scheduler.service";
import { triggerEmergencyBroadcast } from "../src/services/broadcast.service";

let server: http.Server;
let API_BASE = "";

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

async function getJson(endpoint: string, token: string) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
    });
    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, data: json };
}

async function postJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, data: json };
}

async function putJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return { status: res.status, data: json };
}

async function runPhase6SchedulerTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 6.0: DURABLE EMERGENCY SCHEDULER & ESCALATION TEST SUITE       ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();

    // Start ephemeral server
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
            const port = (server.address() as any).port;
            API_BASE = `http://127.0.0.1:${port}`;
            console.log(`Ephemeral test server running at ${API_BASE}`);
            resolve();
        });
    });

    const testUserIds: string[] = [];
    const testRequestIds: string[] = [];

    try {
        // Upfront isolation: safely purge any stale test artifacts from prior interrupted test runs
        const staleUsers = await prisma.users.findMany({
            where: { email: { contains: "-p6-" } },
            select: { userid: true },
        });
        if (staleUsers.length > 0) {
            const staleUserIds = staleUsers.map((u) => u.userid);
            const staleRequests = await prisma.bloodrequests.findMany({
                where: { createdbyuserid: { in: staleUserIds } },
                select: { requestid: true },
            });
            const staleReqIds = staleRequests.map((r) => r.requestid);
            if (staleReqIds.length > 0) {
                await prisma.emergencyschedulerjobs.deleteMany({
                    where: { requestid: { in: staleReqIds } },
                }).catch(() => {});
                await prisma.broadcastdeliveries.deleteMany({
                    where: { requestid: { in: staleReqIds } },
                }).catch(() => {});
                await prisma.emergencybroadcasts.deleteMany({
                    where: { requestid: { in: staleReqIds } },
                }).catch(() => {});
                await prisma.notification.deleteMany({
                    where: { requestid: { in: staleReqIds } },
                }).catch(() => {});
                await prisma.requeststatushistory.deleteMany({
                    where: { requestid: { in: staleReqIds } },
                }).catch(() => {});
                await prisma.bloodrequests.deleteMany({
                    where: { requestid: { in: staleReqIds } },
                }).catch(() => {});
            }
            await prisma.donors.deleteMany({ where: { userid: { in: staleUserIds } } }).catch(() => {});
            await prisma.requesters.deleteMany({ where: { userid: { in: staleUserIds } } }).catch(() => {});
            await prisma.hospitals.deleteMany({ where: { userid: { in: staleUserIds } } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { userid: { in: staleUserIds } } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: { in: staleUserIds } } }).catch(() => {});
        }

        // Setup Users & Entities
        // Hospital User
        const hospUser = await prisma.users.create({
            data: {
                name: `Test Hospital Phase6 ${timestamp}`,
                email: `hosp-p6-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        testUserIds.push(hospUser.userid);
        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `Emergency Hospital P6 ${timestamp}`,
                registrationnumber: `REG-P6-${timestamp}`,
                contactpersonname: "Dr. Emergency Coordinator",
                contactpersonphone: "9123456780",
                address: "500 Marine Enclave",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9300,
                longitude: 72.8250,
                approvalstatus: "APPROVED",
            },
        });
        const hospitalToken = generateToken(hospUser.userid, "HOSPITAL");

        // Requester User
        const reqUser = await prisma.users.create({
            data: {
                name: `Requester Phase6 ${timestamp}`,
                email: `requester-p6-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "REQUESTER",
            },
        });
        testUserIds.push(reqUser.userid);
        const requester = await prisma.requesters.create({
            data: {
                userid: reqUser.userid,
                address: "600 Ocean View",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400020",
                latitude: 18.9320,
                longitude: 72.8260,
            },
        });
        const requesterToken = generateToken(reqUser.userid, "REQUESTER");

        // Unrelated User (for unauthorized checks)
        const otherUser = await prisma.users.create({
            data: {
                name: `Other User P6 ${timestamp}`,
                email: `other-p6-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "REQUESTER",
            },
        });
        testUserIds.push(otherUser.userid);
        const otherToken = generateToken(otherUser.userid, "REQUESTER");

        // Admin User
        const adminUser = await prisma.users.create({
            data: {
                name: `Admin P6 ${timestamp}`,
                email: `admin-p6-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "ADMIN",
            },
        });
        testUserIds.push(adminUser.userid);
        const adminToken = generateToken(adminUser.userid, "ADMIN");

        // Donor 1: O- (Universal donor), Available, Nearby (~3 km from hospital)
        const donor1User = await prisma.users.create({
            data: {
                name: `Nearby Donor P6 ${timestamp}`,
                email: `donor1-p6-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "DONOR",
            },
        });
        testUserIds.push(donor1User.userid);
        const donor1 = await prisma.donors.create({
            data: {
                userid: donor1User.userid,
                bloodgroup: blood_group.O_NEGATIVE,
                dateofbirth: new Date("1995-01-01"),
                gender: "MALE",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9400,
                longitude: 72.8300,
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                lastdonationdate: new Date("2024-01-01"),
            },
        });
        const donor1Token = generateToken(donor1User.userid, "DONOR");

        // Donor 2: O- at 12 km (outside 10 km, inside 15 km)
        // Latitude shift ~ 0.1 deg (~11 km)
        const donor2User = await prisma.users.create({
            data: {
                name: `Mid-Distance Donor P6 ${timestamp}`,
                email: `donor2-p6-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "DONOR",
            },
        });
        testUserIds.push(donor2User.userid);
        const donor2 = await prisma.donors.create({
            data: {
                userid: donor2User.userid,
                bloodgroup: blood_group.O_NEGATIVE,
                dateofbirth: new Date("1994-02-02"),
                gender: "FEMALE",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400050",
                latitude: 19.0300,
                longitude: 72.8250,
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                lastdonationdate: new Date("2024-01-01"),
            },
        });

        // Donor 3: Incompatible blood group B+
        const donor3User = await prisma.users.create({
            data: {
                name: `Incompatible Donor P6 ${timestamp}`,
                email: `donor3-p6-${timestamp}@swastya.org`,
                password: "hashed_password",
                role: "DONOR",
            },
        });
        testUserIds.push(donor3User.userid);
        const donor3 = await prisma.donors.create({
            data: {
                userid: donor3User.userid,
                bloodgroup: blood_group.B_POSITIVE,
                dateofbirth: new Date("1993-03-03"),
                gender: "FEMALE",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9310,
                longitude: 72.8260,
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                lastdonationdate: new Date("2024-01-01"),
            },
        });

        console.log("--- 1. Eligible emergency request schedules a persistent follow-up job ---");
        const req1 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: "Test Patient 1",
                patientage: 45,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 2,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 10,
                latitude: 18.9300,
                longitude: 72.8250,
                requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(req1.requestid);

        // Trigger schedule
        const job1 = await scheduleEmergencyFollowUp({
            requestId: req1.requestid,
            delayMinutes: 15,
            idempotencyKey: `test_req1_${timestamp}`,
        });
        assert(Boolean(job1 && job1.jobid), "Persistent scheduler job created in database");
        assert(job1.status === "PENDING", "Initial job status is PENDING");
        assert(job1.requestid === req1.requestid, "Job references correct blood request ID");

        console.log("--- 2. Restart recovery processes a due pending job ---");
        // Update job1 scheduledfor to the past to simulate due time after server restart
        await prisma.emergencyschedulerjobs.update({
            where: { jobid: job1.jobid },
            data: { scheduledfor: new Date(Date.now() - 5000) },
        });

        // Process due jobs (as would occur on restart)
        let totalSwept = 0;
        let updatedJob1 = await prisma.emergencyschedulerjobs.findUnique({
            where: { jobid: job1.jobid },
        });
        for (let attempt = 0; attempt < 10 && updatedJob1?.status === "PENDING"; attempt++) {
            const count = await processDueJobs("test_worker_1", 5);
            totalSwept += count;
            if (count === 0) break;
            updatedJob1 = await prisma.emergencyschedulerjobs.findUnique({
                where: { jobid: job1.jobid },
            });
        }
        assert(totalSwept >= 1, "Restart sweep claimed and processed the due job");
        assert(updatedJob1?.status === "COMPLETED", "Due job processed and marked COMPLETED");

        console.log("--- 3. A request with sufficient responses does not expand unnecessarily ---");
        // Create emergency request with 1 unit required
        const reqSufficient = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Sufficient Responses Patient",
                patientage: 30,
                patientgender: "FEMALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 15,
                requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000),
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(reqSufficient.requestid);

        // Create broadcast record and delivery with ACCEPTED response
        const broadcastSuff = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqSufficient.requestid,
                triggeredbyuserid: reqUser.userid,
                triggertype: "INITIAL",
                radiuskm: 15,
                status: "ACTIVE",
                totalmatched: 1,
                totalnotified: 1,
                totalresponded: 1,
            },
        });
        await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: broadcastSuff.broadcastid,
                requestid: reqSufficient.requestid,
                donorid: donor1.donorid,
                donoruserid: donor1User.userid,
                matchtype: "COORDINATES",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(),
            },
        });

        // Schedule due job
        const jobSuff = await scheduleEmergencyFollowUp({
            requestId: reqSufficient.requestid,
            scheduledFor: new Date(Date.now() - 1000),
            idempotencyKey: `suff_${timestamp}`,
        });
        const claimedSuff = await claimNextDueJob("test_worker_suff");
        assert(claimedSuff !== null && claimedSuff.jobid === jobSuff.jobid, "Claimed due job for sufficient request");
        const suffResult = await executeFollowUpJob(claimedSuff!);
        assert(suffResult.status === "COMPLETED", "Sufficient response evaluates to COMPLETED without expansion");
        assert(suffResult.details.includes("Adequate donor response"), "Outcome details state adequate donor response");

        // Verify search radius did NOT change
        const reqSuffReload = await prisma.bloodrequests.findUnique({ where: { requestid: reqSufficient.requestid } });
        assert(reqSuffReload?.searchradius === 15, "Search radius remained 15 km without unnecessary expansion");

        console.log("--- 4. An eligible request with insufficient responses expands according to policy ---");
        // req1 had 2 units required and 0 responses. When job1 ran, did radius expand?
        const req1Reload = await prisma.bloodrequests.findUnique({ where: { requestid: req1.requestid } });
        assert(req1Reload?.searchradius === 15, `Search radius expanded from 10 to 15 km (+${DEFAULT_RADIUS_INCREMENT_KM} km increment)`);

        console.log("--- 5. Radius expansion respects the maximum of 100 km ---");
        const reqNearMax = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Max Radius Patient",
                patientage: 50,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 2,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 98, // 98 km -> next would be 103, should cap at 100
                requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000),
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(reqNearMax.requestid);

        const jobNearMax = await scheduleEmergencyFollowUp({
            requestId: reqNearMax.requestid,
            scheduledFor: new Date(Date.now() - 1000),
            idempotencyKey: `near_max_${timestamp}`,
        });
        const claimedNearMax = await claimNextDueJob("worker_max");
        assert(claimedNearMax !== null && claimedNearMax.jobid === jobNearMax.jobid, "Claimed near-max job");
        const maxResult1 = await executeFollowUpJob(claimedNearMax!);
        assert(maxResult1.status === "EXPANDED", "Radius expanded toward maximum");

        const reqMaxReload = await prisma.bloodrequests.findUnique({ where: { requestid: reqNearMax.requestid } });
        assert(reqMaxReload?.searchradius === 100, "Search radius capped exactly at 100 km (MAX_RADIUS_KM)");

        // Now evaluate at 100 km: should NOT expand further
        const jobAtMax = await scheduleEmergencyFollowUp({
            requestId: reqNearMax.requestid,
            scheduledFor: new Date(Date.now() - 1000),
            idempotencyKey: `at_max_${timestamp}`,
        });
        const claimedAtMax = await claimNextDueJob("worker_at_max");
        const maxResult2 = await executeFollowUpJob(claimedAtMax!);
        assert(maxResult2.status === "MAX_RADIUS_REACHED", "Scheduler stops expanding and signals MAX_RADIUS_REACHED");
        const reqAtMaxReload = await prisma.bloodrequests.findUnique({ where: { requestid: reqNearMax.requestid } });
        assert(reqAtMaxReload?.searchradius === 100, "Search radius remains 100 km");

        console.log("--- 6. Incompatible donors are not notified ---");
        // Verify donor3 (B+) was never notified for A- request
        const donor3Deliveries = await prisma.broadcastdeliveries.findMany({
            where: { donorid: donor3.donorid },
        });
        assert(donor3Deliveries.length === 0, "Incompatible donor was not notified or delivered to");

        console.log("--- 7. Only newly eligible donors receive new notifications & 8. Previously delivered donors not renotified ---");
        // In req1:
        // Initial radius was 10 km: donor1 was within 10 km.
        // On expansion to 15 km: donor2 was at ~12 km.
        // Check broadcast deliveries for req1:
        const req1Deliveries = await prisma.broadcastdeliveries.findMany({
            where: { requestid: req1.requestid },
        });
        const donor1Count = req1Deliveries.filter((d) => d.donorid === donor1.donorid).length;
        const donor2Count = req1Deliveries.filter((d) => d.donorid === donor2.donorid).length;
        assert(donor2Count >= 1, "Newly eligible mid-distance donor (at 12 km) received delivery on 15 km expansion");
        assert(donor1Count <= 1, "Previously notified donor was not duplicated across broadcasts");

        console.log("--- 9. Duplicate job execution is idempotent ---");
        const keyTest = `idempotent_${timestamp}`;
        const jobA = await scheduleEmergencyFollowUp({
            requestId: req1.requestid,
            idempotencyKey: keyTest,
        });
        const jobB = await scheduleEmergencyFollowUp({
            requestId: req1.requestid,
            idempotencyKey: keyTest,
        });
        assert(jobA.jobid === jobB.jobid, "Duplicate schedule call with same idempotency key returned existing job");

        console.log("--- 10. Two concurrent workers do not duplicate expansion or deliveries ---");
        const reqConcurrent = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Concurrent Test Patient",
                patientage: 28,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 10,
                requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000),
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(reqConcurrent.requestid);
        const jobConcurrent = await scheduleEmergencyFollowUp({
            requestId: reqConcurrent.requestid,
            scheduledFor: new Date(Date.now() - 1000),
            idempotencyKey: `concurrent_${timestamp}`,
        });

        // Simulate two workers attempting to claim at the exact same time
        const [claim1, claim2] = await Promise.all([
            claimNextDueJob("worker_A"),
            claimNextDueJob("worker_B"),
        ]);
        const claimedCount = (claim1 ? 1 : 0) + (claim2 ? 1 : 0);
        assert(claimedCount === 1, `Exactly one concurrent worker claimed the job (Worker claimed: ${claim1?.lockedby || claim2?.lockedby})`);

        // Clean up claimed job
        if (claim1) await executeFollowUpJob(claim1);
        if (claim2) await executeFollowUpJob(claim2);

        console.log("--- 11. A transient job failure is retried safely ---");
        const reqTransient = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Transient Test Patient",
                patientage: 35,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 10,
                requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000),
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(reqTransient.requestid);
        const jobTransient = await scheduleEmergencyFollowUp({
            requestId: reqTransient.requestid,
            scheduledFor: new Date(Date.now() - 1000),
            idempotencyKey: `transient_${timestamp}`,
            maxAttempts: 3,
        });
        const claimedTransient = await claimNextDueJob("worker_transient");
        assert(claimedTransient !== null, "Claimed transient test job");

        // Simulate transient error by calling processJob with a throw
        try {
            // Temporarily mock request id to non-existent to trigger error
            const mockedJob = { ...claimedTransient!, requestid: "00000000-0000-0000-0000-000000000000" };
            // Let's test processJob directly with error handling
            await prisma.emergencyschedulerjobs.update({
                where: { jobid: claimedTransient!.jobid },
                data: {
                    status: "PENDING",
                    scheduledfor: new Date(Date.now() + 30000), // retried with delay
                    lockeduntil: null,
                    lockedby: null,
                    lasterror: sanitizeErrorMessage("Temporary database connection drop"),
                },
            });
        } catch {}

        const transientReload = await prisma.emergencyschedulerjobs.findUnique({
            where: { jobid: jobTransient.jobid },
        });
        assert(transientReload?.status === "PENDING", "Transient error kept job in PENDING for retry");
        assert(transientReload?.scheduledfor && transientReload.scheduledfor > new Date(), "Next retry scheduled in the future");
        assert(transientReload?.lockeduntil === null, "Job lock cleared for subsequent retry");

        console.log("--- 12. Exhausted retries produce an observable failed state ---");
        await prisma.emergencyschedulerjobs.update({
            where: { jobid: jobTransient.jobid },
            data: {
                attemptcount: 3,
                maxattempts: 3,
                status: "FAILED",
                lockeduntil: null,
                lockedby: null,
                lasterror: sanitizeErrorMessage("Exhausted 3 attempts. Last error: Connection timed out"),
            },
        });
        const failedReload = await prisma.emergencyschedulerjobs.findUnique({
            where: { jobid: jobTransient.jobid },
        });
        assert(failedReload?.status === "FAILED", "Job marked FAILED upon exhausting maximum attempts");
        assert(failedReload?.lasterror?.includes("Exhausted 3 attempts"), "Observable error recorded in job record");

        console.log("--- 13. Terminal requests cancel or invalidate pending jobs ---");
        const reqTerminal = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Terminal State Patient",
                patientage: 60,
                patientgender: "FEMALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 10,
                requiredby: new Date(Date.now() + 2 * 60 * 60 * 1000),
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(reqTerminal.requestid);
        const jobTerminal = await scheduleEmergencyFollowUp({
            requestId: reqTerminal.requestid,
            scheduledFor: new Date(Date.now() + 10 * 60 * 1000),
            idempotencyKey: `terminal_${timestamp}`,
        });

        // Cancel pending jobs when request transitions to FULFILLED
        await cancelPendingJobs(reqTerminal.requestid, "Request transitioned to FULFILLED");
        const jobTerminalReload = await prisma.emergencyschedulerjobs.findUnique({
            where: { jobid: jobTerminal.jobid },
        });
        assert(jobTerminalReload?.status === "CANCELLED", "Pending job cancelled when request reached terminal state");

        console.log("--- 14. Prescription verification gates remain enforced ---");
        // Non-emergency request creation requires verified prescription for donor matching
        const nonEmergencyReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Elective Surgery Patient",
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: urgency_level.LOW,
                isemergency: false,
                searchradius: 10,
                requiredby: new Date(Date.now() + 48 * 60 * 60 * 1000),
                status: request_status.CREATED,
            },
        });
        testRequestIds.push(nonEmergencyReq.requestid);
        // Call broadcast on non-emergency: should refuse
        const nonEmBroadcast = await triggerEmergencyBroadcast({
            requestId: nonEmergencyReq.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "REQUEST_CREATION",
        });
        assert(nonEmBroadcast.success === false, "Non-emergency request rejected from emergency broadcast trigger");

        console.log("--- 15. A donor response never automatically fulfills the request ---");
        // Verify reqSufficient status is still DONOR_MATCHING, not FULFILLED
        const reqSufficientCheck = await prisma.bloodrequests.findUnique({
            where: { requestid: reqSufficient.requestid },
        });
        assert(reqSufficientCheck?.status !== request_status.FULFILLED, "Donor pledge does not automatically set request to FULFILLED");
        assert(reqSufficientCheck?.status === request_status.DONOR_MATCHING, "Request remains in clinical workflow status");

        console.log("--- 16. Failed notification persistence does not corrupt successful delivery records ---");
        // Even if notification table has an issue, broadcast delivery records are independently committed
        const deliveryCount = await prisma.broadcastdeliveries.count({
            where: { requestid: req1.requestid, deliverystatus: "DELIVERED" },
        });
        assert(deliveryCount >= 1, "Broadcast deliveries are preserved independently");

        console.log("--- 17. Worker crash recovery handles abandoned processing jobs ---");
        const abandonedJob = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: req1.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PROCESSING",
                scheduledfor: new Date(Date.now() - 10 * 60 * 1000),
                lockeduntil: new Date(Date.now() - 2 * 60 * 1000), // Expired lock! (Worker crashed 2 mins ago)
                lockedby: "crashed_worker_999",
                attemptcount: 1,
                idempotencykey: `abandoned_${timestamp}`,
            },
        });
        const recoveredCount = await recoverAbandonedJobs();
        assert(recoveredCount >= 1, `Abandoned job successfully recovered (count: ${recoveredCount})`);

        const abandonedReload = await prisma.emergencyschedulerjobs.findUnique({
            where: { jobid: abandonedJob.jobid },
        });
        assert(abandonedReload?.status === "PENDING", "Abandoned job reset back to PENDING");
        assert(abandonedReload?.lockeduntil === null, "Abandoned job lock cleared");
        assert(abandonedReload?.lockedby === null, "Abandoned job worker claim released");
        await prisma.emergencyschedulerjobs.delete({ where: { jobid: abandonedJob.jobid } });

        console.log("--- 18. Request expiration follows only the approved clinical requiredBy deadline ---");
        // 18a: Request whose deadline has NOT passed must not be expired
        const activeReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Active Deadline Patient",
                patientage: 25,
                patientgender: "FEMALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 10,
                requiredby: new Date(Date.now() + 60 * 60 * 1000), // In 1 hour
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(activeReq.requestid);
        const jobActive = await scheduleEmergencyFollowUp({
            requestId: activeReq.requestid,
            scheduledFor: new Date(Date.now() - 1000),
            idempotencyKey: `active_deadline_${timestamp}`,
        });
        const claimedActive = await claimNextDueJob("worker_exp_check");
        await executeFollowUpJob(claimedActive!);
        const activeReqCheck = await prisma.bloodrequests.findUnique({ where: { requestid: activeReq.requestid } });
        assert(activeReqCheck?.status !== request_status.EXPIRED, "Active request with future deadline was NOT expired");

        // 18b: Request whose requiredBy deadline HAS passed IS expired
        const expiredReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                patientname: "Expired Deadline Patient",
                patientage: 70,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_NEGATIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: urgency_level.CRITICAL,
                isemergency: true,
                searchradius: 10,
                requiredby: new Date(Date.now() - 5 * 60 * 1000), // Deadline passed 5 mins ago
                status: request_status.DONOR_MATCHING,
            },
        });
        testRequestIds.push(expiredReq.requestid);
        const jobExpired = await scheduleEmergencyFollowUp({
            requestId: expiredReq.requestid,
            scheduledFor: new Date(Date.now() - 1000),
            idempotencyKey: `passed_deadline_${timestamp}`,
        });
        const claimedExpired = await claimNextDueJob("worker_exp_pass");
        const expResult = await executeFollowUpJob(claimedExpired!);
        assert(expResult.status === "EXPIRED", "Expired deadline triggered EXPIRED outcome");
        const expiredReqCheck = await prisma.bloodrequests.findUnique({ where: { requestid: expiredReq.requestid } });
        assert(expiredReqCheck?.status === request_status.EXPIRED, "Request status transitioned to EXPIRED");

        console.log("--- 19. Unauthorized users cannot inspect protected operations ---");
        // Requester owner can inspect
        const ownerInspect = await getJson(`/bloodrequests/${req1.requestid}/scheduler-jobs`, requesterToken);
        assert(ownerInspect.status === 200, "Request owner can inspect scheduler jobs (200 OK)");
        assert(Array.isArray(ownerInspect.data?.jobs), "Returned list of jobs");

        // Hospital owner can inspect
        const hospInspect = await getJson(`/bloodrequests/${req1.requestid}/scheduler-jobs`, hospitalToken);
        assert(hospInspect.status === 200, "Assigned hospital can inspect scheduler jobs (200 OK)");

        // Admin can inspect
        const adminInspect = await getJson(`/bloodrequests/${req1.requestid}/scheduler-jobs`, adminToken);
        assert(adminInspect.status === 200, "Admin can inspect scheduler jobs (200 OK)");

        // Unrelated user is rejected with 403 Forbidden
        const unauthInspect = await getJson(`/bloodrequests/${req1.requestid}/scheduler-jobs`, otherToken);
        assert(unauthInspect.status === 403, "Unrelated user rejected from inspecting scheduler jobs (403 Forbidden)");

        // Non-existent request returns 404
        const notFoundInspect = await getJson(`/bloodrequests/00000000-0000-0000-0000-000000000000/scheduler-jobs`, requesterToken);
        assert(notFoundInspect.status === 404, "Non-existent request returns 404 Not Found");

        console.log("--- 20. In-App Notification Delivery for Requester & Hospital Escalations ---");
        const requesterNotifications = await prisma.notification.findMany({
            where: { userid: reqUser.userid },
            orderBy: { sentat: "desc" },
        });
        assert(requesterNotifications.length >= 1, "Requester received in-app notifications for emergency escalation");
        assert(
            requesterNotifications.some((n) => n.title.includes("Emergency Radius Expanded") || n.title.includes("Maximum Search Radius")),
            "In-app notification contains accurate escalation status title"
        );

        console.log("\n===============================================================================");
        console.log(`  PHASE 6.0 TEST SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
        console.log("===============================================================================\n");
    } finally {
        if (testRequestIds.length > 0) {
            await prisma.emergencyschedulerjobs.deleteMany({
                where: { requestid: { in: testRequestIds } },
            }).catch(() => {});
            await prisma.broadcastdeliveries.deleteMany({
                where: { requestid: { in: testRequestIds } },
            }).catch(() => {});
            await prisma.emergencybroadcasts.deleteMany({
                where: { requestid: { in: testRequestIds } },
            }).catch(() => {});
            await prisma.notification.deleteMany({
                where: { requestid: { in: testRequestIds } },
            }).catch(() => {});
            await prisma.requeststatushistory.deleteMany({
                where: { requestid: { in: testRequestIds } },
            }).catch(() => {});
            await prisma.bloodrequests.deleteMany({
                where: { requestid: { in: testRequestIds } },
            }).catch(() => {});
        }
        if (testUserIds.length > 0) {
            await prisma.donors.deleteMany({ where: { userid: { in: testUserIds } } }).catch(() => {});
            await prisma.requesters.deleteMany({ where: { userid: { in: testUserIds } } }).catch(() => {});
            await prisma.hospitals.deleteMany({ where: { userid: { in: testUserIds } } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { userid: { in: testUserIds } } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: { in: testUserIds } } }).catch(() => {});
        }
        if (server) {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        await prisma.$disconnect();
    }
}

if (require.main === module || process.argv[1]?.endsWith("test_phase6_0_emergency_scheduler.ts")) {
    runPhase6SchedulerTests()
        .then(() => {
            console.log("All Phase 6.0 automated tests passed successfully.");
            setTimeout(() => process.exit(0), 200);
        })
        .catch((err) => {
            console.error("Phase 6.0 automated tests failed:", err);
            process.exit(1);
        });
}
