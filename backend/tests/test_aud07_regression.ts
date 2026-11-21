import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { triggerEmergencyBroadcast } from "../src/services/broadcast.service";
import {
    claimNextDueJob,
    executeFollowUpJob,
    scheduleEmergencyFollowUp,
    sanitizeErrorMessage,
} from "../src/services/scheduler.service";

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
    if (!condition) {
        totalFailed++;
        failures.push(message);
        console.error(`[FAIL] ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
    totalPassed++;
    console.log(`[PASS] ${message}`);
}

async function run() {
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe("SELECT current_database()");
    const currentDb = dbCheck[0]?.current_database || "";
    assert(currentDb === "swastya_test", `Target database must be swastya_test (got: ${currentDb})`);

    const suffix = `${Date.now()}-aud07`;
    const userIds: string[] = [];
    const hospitalIds: string[] = [];
    const requesterIds: string[] = [];
    const requestIds: string[] = [];
    let server: http.Server | null = null;
    let baseUrl = "";

    try {
        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", () => resolve());
        });
        const address = (server as any).address();
        baseUrl = `http://127.0.0.1:${address.port}`;

        // 1. Create test users: Approved Hospital, Pending Hospital, and Requester
        const approvedHospUser = await prisma.users.create({
            data: {
                name: `AUD07 Approved Hospital ${suffix}`,
                email: `aud07-apprhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(approvedHospUser.userid);
        const approvedHospital = await prisma.hospitals.create({
            data: {
                userid: approvedHospUser.userid,
                hospitalname: `AUD07 Approved Hospital ${suffix}`,
                registrationnumber: `APPR-${suffix}`,
                contactpersonname: "Approved Clinician",
                contactpersonphone: "9123456781",
                address: "Approved Hospital St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9300,
                longitude: 72.8250,
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(approvedHospital.hospitalid);

        const pendingHospUser = await prisma.users.create({
            data: {
                name: `AUD07 Pending Hospital ${suffix}`,
                email: `aud07-pendhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(pendingHospUser.userid);
        const pendingHospital = await prisma.hospitals.create({
            data: {
                userid: pendingHospUser.userid,
                hospitalname: `AUD07 Pending Hospital ${suffix}`,
                registrationnumber: `PEND-${suffix}`,
                contactpersonname: "Pending Clinician",
                contactpersonphone: "9123456782",
                address: "Pending Hospital St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400002",
                latitude: 18.9310,
                longitude: 72.8260,
                approvalstatus: "PENDING",
            },
        });
        hospitalIds.push(pendingHospital.hospitalid);

        const requesterUser = await prisma.users.create({
            data: {
                name: `AUD07 Requester ${suffix}`,
                email: `aud07-req-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "REQUESTER",
            },
        });
        userIds.push(requesterUser.userid);
        const requester = await prisma.requesters.create({
            data: {
                userid: requesterUser.userid,
                address: "Requester St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400020",
                latitude: 18.9320,
                longitude: 72.8270,
            },
        });
        requesterIds.push(requester.requesterid);

        const approvedHospToken = generateToken(approvedHospUser.userid, "HOSPITAL");
        const requesterToken = generateToken(requesterUser.userid, "REQUESTER");

        const makeRequest = async (
            status: string,
            hospitalId?: string | null,
            rxStatus?: "PENDING" | "VERIFIED" | "REJECTED",
            unitsRequired: number = 1
        ) => {
            const request = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: requesterUser.userid,
                    requesterid: requester.requesterid,
                    hospitalid: hospitalId !== undefined ? hospitalId : approvedHospital.hospitalid,
                    patientname: `AUD07 Patient ${suffix}`,
                    patientage: 42,
                    patientgender: "OTHER",
                    patientcontact: "9123456789",
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: unitsRequired,
                    urgencylevel: "CRITICAL",
                    isemergency: true,
                    searchradius: 15,
                    latitude: 18.9300,
                    longitude: 72.8250,
                    requiredby: new Date(Date.now() + 60 * 60 * 1000),
                    status: status as any,
                },
            });
            requestIds.push(request.requestid);
            if (rxStatus) {
                await prisma.prescription.create({
                    data: {
                        requestid: request.requestid,
                        fileurl: `/aud07/${suffix}.pdf`,
                        originalfilename: `${suffix}.pdf`,
                        mimetype: "application/pdf",
                        filesize: 100,
                        doctorname: "Attending Doctor",
                        hospitalname: "AUD07 Clinic",
                        status: rxStatus,
                    },
                });
            }
            return request;
        };

        // =========================================================================
        // FINDING 1: PRESCRIPTION REJECTION
        // =========================================================================
        console.log("\n--- Testing F1: Prescription Rejection Protections ---");

        // 1a. Locked check inside broadcast transaction blocks broadcast when prescription is REJECTED
        const rxRejectedReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid, "REJECTED");
        const rxRejectedBroadcast = await triggerEmergencyBroadcast({
            requestId: rxRejectedReq.requestid,
            triggeredByUserId: requesterUser.userid,
            triggerType: "STATUS_UPDATE",
        });
        assert(!rxRejectedBroadcast.success && /rejected/i.test(rxRejectedBroadcast.message), "F1: Rejected prescription blocks emergency broadcast");

        // 1b. Follow-up worker executeFollowUpJob cancels when prescription is REJECTED
        const rxWorkerReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid, "REJECTED");
        const rxJob = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rxWorkerReq.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PROCESSING",
                lockedby: "worker-rx-test",
                lockeduntil: new Date(Date.now() + 60000),
                scheduledfor: new Date(Date.now() - 5000),
                idempotencykey: `aud07-rxworker-${rxWorkerReq.requestid}`,
            },
        });
        const executeRxResult = await executeFollowUpJob(rxJob as any);
        assert(executeRxResult.status === "CANCELLED", "F1: executeFollowUpJob cancels when prescription is REJECTED");
        const updatedRxJob = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: rxJob.jobid } });
        assert(updatedRxJob?.status === "CANCELLED" && updatedRxJob?.lasterror === "PRESCRIPTION_REJECTED", "F1: Job status set to CANCELLED with PRESCRIPTION_REJECTED error");

        // 1c. Rejection via POST /:id/prescription/verify cancels active broadcasts and open scheduler jobs
        const rxVerifyReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid, "PENDING");
        const rxBroadcast = await prisma.emergencybroadcasts.create({
            data: {
                requestid: rxVerifyReq.requestid,
                triggeredbyuserid: requesterUser.userid,
                triggertype: "INITIAL",
                status: "ACTIVE",
                radiuskm: 15,
                totalmatched: 1,
                totalnotified: 1,
                totalresponded: 0,
            },
        });
        const rxSchedJob = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rxVerifyReq.requestid,
                status: "PENDING",
                scheduledfor: new Date(Date.now() + 60000),
                idempotencykey: `aud07-verifyrx-${rxVerifyReq.requestid}`,
            },
        });
        const rejectVerifyResp = await fetch(`${baseUrl}/bloodrequests/${rxVerifyReq.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${approvedHospToken}`,
            },
            body: JSON.stringify({
                status: "REJECTED",
                remarks: "Prescription unreadable or expired",
            }),
        });
        assert(rejectVerifyResp.status === 200, "F1: Prescription verify route accepts rejection");
        const postRejectBroadcast = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: rxBroadcast.broadcastid } });
        assert(postRejectBroadcast?.status === "CANCELLED", "F1: Prescription rejection atomically cancels active emergency broadcasts");
        const postRejectJob = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: rxSchedJob.jobid } });
        assert(postRejectJob?.status === "CANCELLED", "F1: Prescription rejection atomically cancels pending scheduler jobs");

        // =========================================================================
        // FINDING 2: BLOOD_ARRANGED PROTECTIONS
        // =========================================================================
        console.log("\n--- Testing F2: BLOOD_ARRANGED Protections ---");

        // 2a. Broadcast blocked under row lock for BLOOD_ARRANGED
        const arrangedReq = await makeRequest("BLOOD_ARRANGED", approvedHospital.hospitalid, "VERIFIED");
        const arrangedBroadcastResult = await triggerEmergencyBroadcast({
            requestId: arrangedReq.requestid,
            triggeredByUserId: requesterUser.userid,
            triggerType: "RADIUS_EXPANSION",
            expandRadius: true,
        });
        assert(!arrangedBroadcastResult.success && arrangedBroadcastResult.terminal === true, "F2: Broadcast blocked under row lock for BLOOD_ARRANGED");

        // 2b. scheduleEmergencyFollowUp returns null for BLOOD_ARRANGED
        const arrangedSchedJob = await scheduleEmergencyFollowUp({ requestId: arrangedReq.requestid });
        assert(arrangedSchedJob === null, "F2: scheduleEmergencyFollowUp returns null for BLOOD_ARRANGED request");

        // 2c. PATCH /:id/transit-status transition to BLOOD_ARRANGED tears down active broadcast and scheduler jobs
        const fulfillReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid, "VERIFIED");
        const fulfillBroadcast = await prisma.emergencybroadcasts.create({
            data: {
                requestid: fulfillReq.requestid,
                triggeredbyuserid: requesterUser.userid,
                triggertype: "INITIAL",
                status: "ACTIVE",
                radiuskm: 15,
                totalmatched: 1,
                totalnotified: 1,
                totalresponded: 1,
            },
        });
        const fulfillSchedJob = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: fulfillReq.requestid,
                status: "PENDING",
                scheduledfor: new Date(Date.now() + 60000),
                idempotencykey: `aud07-fulfill-${fulfillReq.requestid}`,
            },
        });
        // Create matching donor and delivery commitment to fulfill the 2 units
        const donorUser = await prisma.users.create({
            data: {
                name: `AUD07 Donor ${suffix}`,
                email: `aud07-donor-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "DONOR",
            },
        });
        userIds.push(donorUser.userid);
        const donor = await prisma.donors.create({
            data: {
                userid: donorUser.userid,
                bloodgroup: "O_POSITIVE",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                dateofbirth: new Date("1995-05-15"),
                gender: "OTHER",
            },
        });
        const delivery1 = await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: fulfillBroadcast.broadcastid,
                requestid: fulfillReq.requestid,
                donorid: donor.donorid,
                donoruserid: donorUser.userid,
                matchtype: "COORDINATES",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                acceptancestatus: "ACCEPTED",
                transitstatus: "REACHED_LOCATION",
                respondedat: new Date(),
            },
        });
        // Now complete the 1 required unit via transit-status
        const transitResp = await fetch(`${baseUrl}/bloodrequests/${fulfillReq.requestid}/transit-status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${approvedHospToken}`,
            },
            body: JSON.stringify({
                status: "COMPLETED",
                deliveryId: delivery1.deliveryid,
            }),
        });
        assert(transitResp.status === 200, "F2: PATCH /transit-status succeeds for final fulfillment");
        const reqPostFulfill = await prisma.bloodrequests.findUnique({ where: { requestid: fulfillReq.requestid } });
        assert(reqPostFulfill?.status === "BLOOD_ARRANGED", "F2: Blood request status transitions to BLOOD_ARRANGED");
        const bcastPostFulfill = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: fulfillBroadcast.broadcastid } });
        assert(bcastPostFulfill?.status === "BLOOD_ARRANGED", "F2: Active broadcast atomically cancelled/marked BLOOD_ARRANGED");
        const jobPostFulfill = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: fulfillSchedJob.jobid } });
        assert(jobPostFulfill?.status === "CANCELLED", "F2: Open scheduler job atomically cancelled upon reaching BLOOD_ARRANGED");

        // =========================================================================
        // FINDING 3: ASSIGNED HOSPITAL APPROVAL VALIDATION
        // =========================================================================
        console.log("\n--- Testing F3: Assigned Hospital Approval ---");

        // 3a. Request creation with unapproved hospital is rejected with HTTP 400
        const formUnapproved = new FormData();
        formUnapproved.append("patientname", "Test Unapproved Hospital");
        formUnapproved.append("patientage", "30");
        formUnapproved.append("patientgender", "OTHER");
        formUnapproved.append("patientcontact", "9123456789");
        formUnapproved.append("bloodgroup", "A_POSITIVE");
        formUnapproved.append("bloodcomponent", "WHOLE_BLOOD");
        formUnapproved.append("unitsrequired", "1");
        formUnapproved.append("urgencylevel", "CRITICAL");
        formUnapproved.append("isemergency", "true");
        formUnapproved.append("hospitalid", pendingHospital.hospitalid);
        formUnapproved.append("requiredby", new Date(Date.now() + 3600000).toISOString());
        formUnapproved.append("prescription", new Blob(["%PDF-1.4 test prescription content"], { type: "application/pdf" }), "rx.pdf");

        const unapprovedCreationResp = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${requesterToken}`,
            },
            body: formUnapproved,
        });
        assert(unapprovedCreationResp.status === 400, "F3: POST /bloodrequests rejects unapproved hospital with 400 Bad Request");
        const unapprovedCreationJson = await unapprovedCreationResp.json();
        assert(/not approved/i.test(unapprovedCreationJson.message), "F3: Error message clearly specifies hospital is not approved");

        // 3b. Request creation without assigned hospital succeeds
        const formNoHosp = new FormData();
        formNoHosp.append("patientname", "Test Hospital-Less Requisition");
        formNoHosp.append("patientage", "35");
        formNoHosp.append("patientgender", "MALE");
        formNoHosp.append("patientcontact", "9123456789");
        formNoHosp.append("bloodgroup", "A_POSITIVE");
        formNoHosp.append("bloodcomponent", "WHOLE_BLOOD");
        formNoHosp.append("unitsrequired", "1");
        formNoHosp.append("urgencylevel", "CRITICAL");
        formNoHosp.append("isemergency", "true");
        formNoHosp.append("latitude", "18.9300");
        formNoHosp.append("longitude", "72.8250");
        formNoHosp.append("requiredby", new Date(Date.now() + 3600000).toISOString());
        formNoHosp.append("prescription", new Blob(["%PDF-1.4 test prescription content"], { type: "application/pdf" }), "rx.pdf");

        const noHospCreationResp = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${requesterToken}`,
            },
            body: formNoHosp,
        });
        assert(noHospCreationResp.status === 201, "F3: POST /bloodrequests allows request without assigned hospital");
        const noHospCreated = await noHospCreationResp.json();
        requestIds.push(noHospCreated.requestid);

        // 3c. triggerEmergencyBroadcast rejects assigned unapproved hospital
        const pendingHospReq = await makeRequest("DONOR_MATCHING", pendingHospital.hospitalid);
        const pendingBroadcast = await triggerEmergencyBroadcast({
            requestId: pendingHospReq.requestid,
            triggeredByUserId: requesterUser.userid,
            triggerType: "INITIAL",
        });
        assert(!pendingBroadcast.success && /not approved/i.test(pendingBroadcast.message), "F3: triggerEmergencyBroadcast blocks unapproved assigned hospital");

        // 3d. executeFollowUpJob cancels when assigned hospital is unapproved
        const pendingHospJob = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: pendingHospReq.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PROCESSING",
                lockedby: "worker-pendhosp-test",
                lockeduntil: new Date(Date.now() + 60000),
                scheduledfor: new Date(Date.now() - 5000),
                idempotencykey: `aud07-pendhosp-worker-${pendingHospReq.requestid}`,
            },
        });
        const executePendHospResult = await executeFollowUpJob(pendingHospJob as any);
        assert(executePendHospResult.status === "CANCELLED", "F3: executeFollowUpJob cancels for unapproved assigned hospital");
        const updatedPendHospJob = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: pendingHospJob.jobid } });
        assert(updatedPendHospJob?.status === "CANCELLED" && updatedPendHospJob?.lasterror === "HOSPITAL_NOT_APPROVED", "F3: Unapproved hospital job set to CANCELLED with HOSPITAL_NOT_APPROVED");

        // =========================================================================
        // FINDING 4: ERROR SANITIZATION (DELIVERY & SCHEDULER APIS)
        // =========================================================================
        console.log("\n--- Testing F4: Error Sanitization ---");

        // 4a. sanitizeErrorMessage replaces SQL/database internals and removes credentials
        const rawDbError = "Invalid `prisma.users.create()` invocation: relation \"users\" does not exist on postgresql://admin:secret123@localhost:5432/db";
        const sanitizedDbMsg = sanitizeErrorMessage(rawDbError);
        assert(sanitizedDbMsg === "DATABASE_OPERATION_FAILED", "F4: sanitizeErrorMessage maps raw database/Prisma errors to DATABASE_OPERATION_FAILED");
        const authLeakMsg = "Failed authorization for Bearer eyJhbGciOiJIUzI1NiJ9 password=supersecret";
        const sanitizedAuthMsg = sanitizeErrorMessage(authLeakMsg);
        assert(sanitizedAuthMsg === "AUTHENTICATION_FAILED", "F4: sanitizeErrorMessage maps password/token leaks to AUTHENTICATION_FAILED");

        // 4b. Delivery failure stores safe code NOTIFICATION_DELIVERY_FAILED and API returns safe code
        const failureReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid);
        const failBcast = await prisma.emergencybroadcasts.create({
            data: {
                requestid: failureReq.requestid,
                triggeredbyuserid: requesterUser.userid,
                triggertype: "INITIAL",
                status: "ACTIVE",
                radiuskm: 15,
                totalmatched: 1,
                totalnotified: 0,
                totalresponded: 0,
            },
        });
        // Create delivery record with raw failure string
        await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: failBcast.broadcastid,
                requestid: failureReq.requestid,
                donorid: donor.donorid,
                donoruserid: donorUser.userid,
                matchtype: "COORDINATES",
                deliverystatus: "FAILED",
                failuremessage: "Raw Prisma database exception: connection terminated",
            },
        });
        const bcastStatusResp = await fetch(`${baseUrl}/bloodrequests/${failureReq.requestid}/broadcast`, {
            headers: { Authorization: `Bearer ${requesterToken}` },
        });
        assert(bcastStatusResp.status === 200, "F4: GET /bloodrequests/:id/broadcast succeeds");
        const bcastStatusJson = await bcastStatusResp.json();
        const deliveryItem = bcastStatusJson.deliveries?.[0];
        assert(deliveryItem && deliveryItem.failuremessage === "NOTIFICATION_DELIVERY_FAILED", "F4: Broadcast status API returns sanitized safe code NOTIFICATION_DELIVERY_FAILED");

        // 4c. GET /:id/scheduler-jobs sanitizes lasterror in API response
        await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: failureReq.requestid,
                status: "FAILED",
                scheduledfor: new Date(Date.now() - 1000),
                lasterror: "FATAL: password authentication failed for user postgres on postgresql://localhost:5432",
                idempotencykey: `aud07-sanitize-api-${failureReq.requestid}`,
            },
        });
        const schedJobsResp = await fetch(`${baseUrl}/bloodrequests/${failureReq.requestid}/scheduler-jobs`, {
            headers: { Authorization: `Bearer ${requesterToken}` },
        });
        assert(schedJobsResp.status === 200, "F4: GET /bloodrequests/:id/scheduler-jobs succeeds");
        const schedJobsJson = await schedJobsResp.json();
        const returnedJob = schedJobsJson.jobs?.[0];
        assert(
            returnedJob &&
            !returnedJob.lasterror.includes("password") &&
            !returnedJob.lasterror.includes("postgres") &&
            (returnedJob.lasterror === "DATABASE_OPERATION_FAILED" || returnedJob.lasterror === "AUTHENTICATION_FAILED"),
            "F4: Scheduler jobs API sanitizes lasterror and prevents credential/DB exposure"
        );

        // =========================================================================
        // FINDING 5: SCHEDULER DEDUPLICATION, DB UNIQUENESS & CONCURRENCY
        // =========================================================================
        console.log("\n--- Testing F5: Scheduler Deduplication & Concurrency ---");

        // 5a. Stable default key deduplication without explicit idempotencyKey
        const stableDedupReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid);
        const sched1 = await scheduleEmergencyFollowUp({ requestId: stableDedupReq.requestid });
        const sched2 = await scheduleEmergencyFollowUp({ requestId: stableDedupReq.requestid });
        assert(Boolean(sched1 && sched2 && sched1.jobid === sched2.jobid), "F5: scheduleEmergencyFollowUp without explicit key uses stable key and deduplicates");

        // 5b. Concurrent scheduleEmergencyFollowUp calls race safely and return the same job
        const concurrentReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid);
        const concurrentResults = await Promise.all([
            scheduleEmergencyFollowUp({ requestId: concurrentReq.requestid }),
            scheduleEmergencyFollowUp({ requestId: concurrentReq.requestid }),
            scheduleEmergencyFollowUp({ requestId: concurrentReq.requestid }),
            scheduleEmergencyFollowUp({ requestId: concurrentReq.requestid }),
            scheduleEmergencyFollowUp({ requestId: concurrentReq.requestid }),
        ]);
        const validJobIds = concurrentResults.filter((j) => j !== null).map((j) => j!.jobid);
        const uniqueJobIds = new Set(validJobIds);
        assert(validJobIds.length === 5 && uniqueJobIds.size === 1, "F5: Concurrent scheduling calls return the exact same single job");

        // 5c. Database-level partial unique index blocks duplicate open jobs
        let partialIndexViolated = false;
        try {
            await prisma.$executeRawUnsafe(`
                INSERT INTO emergencyschedulerjobs (jobid, requestid, jobtype, status, scheduledfor, idempotencykey)
                VALUES (gen_random_uuid(), $1::uuid, 'FOLLOW_UP_ESCALATION', 'PENDING', NOW(), 'manual_conflict_key');
            `, concurrentReq.requestid);
        } catch (dbErr: any) {
            partialIndexViolated = dbErr?.message?.includes("uq_open_scheduler_job_per_request") || dbErr?.code === "P2010" || dbErr?.code === "23505";
        }
        assert(partialIndexViolated, "F5: PostgreSQL partial unique index uq_open_scheduler_job_per_request strictly rejects second open job for same request");

        // 5d. Manual radius expansion during active cooldown deduplicates and does not create duplicate broadcasts
        const radiusExpandReq = await makeRequest("DONOR_MATCHING", approvedHospital.hospitalid);
        const initBcast = await triggerEmergencyBroadcast({
            requestId: radiusExpandReq.requestid,
            triggeredByUserId: requesterUser.userid,
            triggerType: "INITIAL",
            radiusKm: 15,
        });
        assert(initBcast.success && !initBcast.alreadyActive, "F5: Initial broadcast succeeds");
        // Manual radius expansion within cooldown (10 minutes)
        const manualExpand1 = await triggerEmergencyBroadcast({
            requestId: radiusExpandReq.requestid,
            triggeredByUserId: requesterUser.userid,
            triggerType: "RADIUS_EXPANSION",
            radiusKm: 25,
            expandRadius: true,
        });
        assert(manualExpand1.success && manualExpand1.alreadyActive === true, "F5: Manual radius expansion during cooldown is deduplicated to existing active broadcast");
        const activeBcastCount = await prisma.emergencybroadcasts.count({
            where: { requestid: radiusExpandReq.requestid, status: "ACTIVE" },
        });
        assert(activeBcastCount === 1, "F5: Exactly one active broadcast exists during cooldown");

        // 5e. Automated worker expansion supersedes prior active broadcast
        const workerExpand = await triggerEmergencyBroadcast({
            requestId: radiusExpandReq.requestid,
            triggeredByUserId: requesterUser.userid,
            triggerType: "RADIUS_EXPANSION",
            triggerReason: "Automatic follow-up escalation: search radius expanded from 15 km to 25 km",
            radiusKm: 25,
            expandRadius: true,
            isWorkerEscalation: true,
        });
        assert(workerExpand.success && !workerExpand.alreadyActive, "F5: Worker escalation successfully creates expanded broadcast");
        const previousBcast = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: initBcast.broadcastId! } });
        assert(previousBcast?.status === "CANCELLED", "F5: Prior active broadcast was atomically cancelled/superseded by worker expansion");
        const postWorkerActiveCount = await prisma.emergencybroadcasts.count({
            where: { requestid: radiusExpandReq.requestid, status: "ACTIVE" },
        });
        assert(postWorkerActiveCount === 1, "F5: Exactly one active broadcast remains active after worker expansion");

    } finally {
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));

        if (requestIds.length > 0) {
            await prisma.emergencyschedulerjobs.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.broadcastdeliveries.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.emergencybroadcasts.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.donationhistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescriptionhistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescription.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.bloodrequests.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
        }
        if (hospitalIds.length > 0) await prisma.hospitals.deleteMany({ where: { hospitalid: { in: hospitalIds } } }).catch(() => {});
        if (requesterIds.length > 0) await prisma.requesters.deleteMany({ where: { requesterid: { in: requesterIds } } }).catch(() => {});
        if (userIds.length > 0) {
            await prisma.notification.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
            await prisma.donors.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
        }
    }
}

run()
    .then(async () => {
        await prisma.$disconnect();
        console.log(`\n=======================================================`);
        console.log(`AUD-07 Comprehensive Remediation Suite: PASS`);
        console.log(`Total Passed: ${totalPassed}`);
        console.log(`Total Failed: ${totalFailed}`);
        console.log(`=======================================================\n`);
    })
    .catch(async (error) => {
        console.error(`\n=======================================================`);
        console.error(`AUD-07 Comprehensive Remediation Suite: FAIL`);
        console.error(`Total Passed: ${totalPassed}`);
        console.error(`Total Failed: ${totalFailed}`);
        if (failures.length > 0) {
            console.error(`Failures:`);
            failures.forEach((f) => console.error(`  - ${f}`));
        }
        console.error(error);
        console.error(`=======================================================\n`);
        await prisma.$disconnect();
        process.exit(1);
    });
