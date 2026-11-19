import "dotenv/config";
import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import {
    scheduleEmergencyFollowUp,
    claimNextDueJob,
    cancelPendingJobs,
    executeFollowUpJob,
    processJob,
    processDueJobs,
    ClaimedSchedulerJob,
} from "../src/services/scheduler.service";

let server: http.Server;
let baseUrl = "";
let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
        console.log(`[PASS] ${name}`);
        passed++;
    } else {
        console.error(`[FAIL] ${name}${detail ? ` -> ${detail}` : ""}`);
        failed++;
        throw new Error(`Assertion failed: ${name}`);
    }
}

async function reqJson(method: string, path: string, body: any, token: string) {
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let data: any = null;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text };
    }
    return { status: res.status, data };
}

async function main() {
    if (!process.env.DATABASE_URL?.includes("swastya_test")) {
        throw new Error(`Refusing to run against non-test DB: ${process.env.DATABASE_URL}`);
    }

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as any;
            baseUrl = `http://127.0.0.1:${addr.port}`;
            resolve();
        });
    });

    console.log(`\n=== SWASTYA PHASE 1B FIX 3: SCHEDULER FOLLOW-UP RACE TESTS (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const reqUser = await prisma.users.create({
            data: { name: `Fix3 Req ${tag}`, email: `fix3-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const donorUser = await prisma.users.create({
            data: { name: `Fix3 Donor ${tag}`, email: `fix3-d-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(reqUser.userid, donorUser.userid);

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "10 Test", city: "Nashik", state: "MH", pincode: "422001" },
        });
        await prisma.donors.create({
            data: {
                userid: donorUser.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1995-05-05"),
                gender: "MALE",
                address: "11 Test",
                city: "Nashik",
                state: "MH",
                pincode: "422001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });

        const reqToken = generateToken(reqUser.userid, "REQUESTER");

        // Helper to create an emergency request
        async function createEmergencyReq(status: any = "DONOR_MATCHING", requiredby = new Date(Date.now() + 86400000)) {
            const r = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: reqUser.userid,
                    requesterid: requester.requesterid,
                    patientname: `Patient ${tag}`,
                    patientage: 30,
                    patientgender: "MALE",
                    patientcontact: "9999700001",
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "CRITICAL",
                    status,
                    isemergency: true,
                    searchradius: 15,
                    requiredby,
                },
            });
            createdRequestIds.push(r.requestid);
            return r;
        }

        // 1 & 2. Cancelled job is never changed back to PENDING or COMPLETED
        const r1 = await createEmergencyReq("DONOR_MATCHING");
        const j1 = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: r1.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "CANCELLED",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 1,
                maxattempts: 5,
                idempotencykey: `fix3-cancelled-${r1.requestid}`,
            },
        });
        const out1 = await executeFollowUpJob(j1 as unknown as ClaimedSchedulerJob);
        const j1After = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: j1.jobid } });
        const n1After = await prisma.notification.count({ where: { requestid: r1.requestid } });
        const j1Total = await prisma.emergencyschedulerjobs.count({ where: { requestid: r1.requestid } });
        assert(
            out1.status === "CANCELLED" && j1After?.status === "CANCELLED" && n1After === 0 && j1Total === 1,
            "1 & 2. Cancelled job stays CANCELLED (never PENDING/COMPLETED), 0 notifications, 0 orphan jobs"
        );

        // 3. Cancelled blood request receives no follow-up notification (even if job was PROCESSING)
        const rCancel = await createEmergencyReq("CANCELLED");
        const jCancel = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rCancel.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PROCESSING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 1,
                maxattempts: 5,
                idempotencykey: `fix3-rcancel-${rCancel.requestid}`,
            },
        });
        const outCancel = await executeFollowUpJob(jCancel as unknown as ClaimedSchedulerJob);
        const jCancelAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jCancel.jobid } });
        const nCancelAfter = await prisma.notification.count({ where: { requestid: rCancel.requestid } });
        assert(
            outCancel.status === "CANCELLED" && jCancelAfter?.status === "CANCELLED" && nCancelAfter === 0,
            "3. Cancelled blood request settles job as CANCELLED with 0 notifications"
        );

        // 4. Fulfilled request receives no follow-up notification
        const rFulfilled = await createEmergencyReq("FULFILLED");
        const jFulfilled = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rFulfilled.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PROCESSING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 1,
                maxattempts: 5,
                idempotencykey: `fix3-rfulfilled-${rFulfilled.requestid}`,
            },
        });
        const outFulfilled = await executeFollowUpJob(jFulfilled as unknown as ClaimedSchedulerJob);
        const jFulfilledAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jFulfilled.jobid } });
        const nFulfilledAfter = await prisma.notification.count({ where: { requestid: rFulfilled.requestid } });
        assert(
            outFulfilled.status === "CANCELLED" && jFulfilledAfter?.status === "CANCELLED" && nFulfilledAfter === 0,
            "4. Fulfilled request settles job as CANCELLED with 0 follow-up notifications"
        );

        // 5. Expired request receives no follow-up notification
        const rExpired = await createEmergencyReq("EXPIRED");
        const jExpired = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rExpired.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PROCESSING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 1,
                maxattempts: 5,
                idempotencykey: `fix3-rexpired-${rExpired.requestid}`,
            },
        });
        const outExpired = await executeFollowUpJob(jExpired as unknown as ClaimedSchedulerJob);
        const jExpiredAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jExpired.jobid } });
        const nExpiredAfter = await prisma.notification.count({ where: { requestid: rExpired.requestid } });
        assert(
            outExpired.status === "CANCELLED" && jExpiredAfter?.status === "CANCELLED" && nExpiredAfter === 0,
            "5. Expired request settles job as CANCELLED with 0 follow-up notifications"
        );

        // 6. Request cancellation (PUT /bloodrequests/:id) racing scheduler execution
        const rRaceReq = await createEmergencyReq("DONOR_MATCHING");
        const jRaceReq = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rRaceReq.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PENDING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 0,
                maxattempts: 5,
                idempotencykey: `fix3-racereq-${rRaceReq.requestid}`,
            },
        });
        const [resPutCancel, resSchedRace] = await Promise.all([
            reqJson("PUT", `/bloodrequests/${rRaceReq.requestid}`, { status: "CANCELLED" }, reqToken),
            processDueJobs(`fix3-race-${tag}`, 5),
        ]);
        const rRaceAfter = await prisma.bloodrequests.findUnique({ where: { requestid: rRaceReq.requestid } });
        const jRaceAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jRaceReq.jobid } });
        const jobsRaceCount = await prisma.emergencyschedulerjobs.count({ where: { requestid: rRaceReq.requestid } });
        const expansionNotifsRace = await prisma.notification.count({
            where: { requestid: rRaceReq.requestid, title: "Emergency Radius Expanded" },
        });
        assert(
            resPutCancel.status === 200 &&
                rRaceAfter?.status === "CANCELLED" &&
                jRaceAfter?.status === "CANCELLED" &&
                jobsRaceCount === 1 &&
                expansionNotifsRace === 0,
            "6. Concurrent PUT cancellation vs scheduler leaves request & job CANCELLED with 0 expansion notifications and 0 orphan jobs",
            `put=${resPutCancel.status}, reqStatus=${rRaceAfter?.status}, jobStatus=${jRaceAfter?.status}, jobs=${jobsRaceCount}, notifs=${expansionNotifsRace}`
        );

        // 7. Job cancellation racing scheduler execution
        const rRaceJob = await createEmergencyReq("DONOR_MATCHING");
        const jRaceJob = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rRaceJob.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PENDING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 0,
                maxattempts: 5,
                idempotencykey: `fix3-racejob-${rRaceJob.requestid}`,
            },
        });
        const claimedForRace = await claimNextDueJob(`fix3-claimer-${tag}`);
        assert(claimedForRace?.jobid === jRaceJob.jobid, "7a. Claimed job for job-cancellation race");
        await cancelPendingJobs(rRaceJob.requestid, "Cancelled mid-flight");
        const outRaceJob = await executeFollowUpJob(claimedForRace!);
        const jRaceJobAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jRaceJob.jobid } });
        const nRaceJob = await prisma.notification.count({
            where: { requestid: rRaceJob.requestid, title: "Emergency Radius Expanded" },
        });
        assert(
            outRaceJob.status === "CANCELLED" && jRaceJobAfter?.status === "CANCELLED" && nRaceJob === 0,
            "7b. Job cancelled mid-flight stays CANCELLED with 0 expansion notifications"
        );

        // 8. Duplicate scheduler sweeps do not execute the same job twice
        const rSweep = await createEmergencyReq("DONOR_MATCHING");
        const jSweep = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rSweep.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PENDING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 0,
                maxattempts: 5,
                idempotencykey: `fix3-sweep-${rSweep.requestid}`,
            },
        });
        const [sweep1, sweep2] = await Promise.all([
            processDueJobs(`fix3-w1-${tag}`, 5),
            processDueJobs(`fix3-w2-${tag}`, 5),
        ]);
        const bcastsSweep = await prisma.emergencybroadcasts.count({ where: { requestid: rSweep.requestid } });
        const notifsSweep = await prisma.notification.count({
            where: { requestid: rSweep.requestid, title: "Emergency Radius Expanded" },
        });
        const jSweepAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jSweep.jobid } });
        assert(
            sweep1 + sweep2 === 1 && bcastsSweep === 1 && notifsSweep === 1 && jSweepAfter?.status === "COMPLETED",
            "8. Duplicate concurrent scheduler sweeps execute the job exactly once",
            `sweeps=${sweep1}+${sweep2}, bcasts=${bcastsSweep}, notifs=${notifsSweep}`
        );

        // 9, 10, 12. Failed execution does not create orphan follow-up jobs, rollback preserves searchradius, and retry does not revive cancelled job
        const rFail = await createEmergencyReq("DONOR_MATCHING");
        const jFail = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rFail.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PENDING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 0,
                maxattempts: 5,
                idempotencykey: `fix3-fail-${rFail.requestid}`,
            },
        });
        const claimedFail = await claimNextDueJob(`fix3-failer-${tag}`);
        assert(claimedFail?.jobid === jFail.jobid, "9a. Claimed job for failure/rollback test");

        // Simulate broadcast failure during processJob while job is cancelled mid-flight -> retry must NOT revive CANCELLED job
        const origTx = prisma.$transaction.bind(prisma);
        (prisma as any).$transaction = async () => {
            await cancelPendingJobs(rFail.requestid, "Cancelled mid-flight during broadcast");
            throw new Error("Simulated transient DB failure during broadcast");
        };
        let threw = false;
        try {
            await processJob(claimedFail!);
        } catch {
            threw = true;
        } finally {
            (prisma as any).$transaction = origTx;
        }
        const jFailAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jFail.jobid } });
        const rFailAfter = await prisma.bloodrequests.findUnique({ where: { requestid: rFail.requestid } });
        const jFailCount = await prisma.emergencyschedulerjobs.count({ where: { requestid: rFail.requestid } });
        const orphanSched = await scheduleEmergencyFollowUp({ requestId: rCancel.requestid });
        assert(
            threw &&
                jFailAfter?.status === "CANCELLED" &&
                rFailAfter?.searchradius === 15 &&
                jFailCount === 1 &&
                orphanSched === null,
            "9, 10 & 12. Failed execution creates 0 orphan jobs, preserves searchradius=15, and retry never revives CANCELLED job"
        );

        // 11. Eligible active job executes successfully (expands radius, notifies requester, schedules next follow-up)
        const rOk = await createEmergencyReq("DONOR_MATCHING");
        const jOk = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: rOk.requestid,
                jobtype: "FOLLOW_UP_ESCALATION",
                status: "PENDING",
                scheduledfor: new Date(Date.now() - 1000),
                attemptcount: 0,
                maxattempts: 5,
                idempotencykey: `fix3-ok-${rOk.requestid}`,
            },
        });
        const processedOk = await processDueJobs(`fix3-ok-${tag}`, 5);
        const rOkAfter = await prisma.bloodrequests.findUnique({ where: { requestid: rOk.requestid } });
        const jOkAfter = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: jOk.jobid } });
        const nextOkJobs = await prisma.emergencyschedulerjobs.count({
            where: { requestid: rOk.requestid, status: "PENDING" },
        });
        const notifsOk = await prisma.notification.count({
            where: { requestid: rOk.requestid, title: "Emergency Radius Expanded" },
        });
        assert(
            processedOk === 1 &&
                rOkAfter?.searchradius === 20 &&
                jOkAfter?.status === "COMPLETED" &&
                nextOkJobs === 1 &&
                notifsOk === 1,
            "11. Eligible active job executes, expands radius 15->20, notifies requester, and schedules next follow-up"
        );

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    } finally {
        try {
            if (createdRequestIds.length > 0) {
                await prisma.emergencyschedulerjobs.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.broadcastdeliveries.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.emergencybroadcasts.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.bloodrequests.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            }
            if (createdUserIds.length > 0) {
                await prisma.notification.deleteMany({ where: { userid: { in: createdUserIds } } });
                await prisma.users.deleteMany({ where: { userid: { in: createdUserIds } } });
            }
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }
        await prisma.$disconnect();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

main().catch((e) => {
    console.error("Test suite error:", e);
    process.exit(1);
});
