/**
 * SWASTYA PHASE 1B - STEP 4D REGRESSION TEST SUITE
 * 
 * Verifies Radius Expansion Retry Safety:
 * 1. Successful expansion advances the radius exactly once and persists it.
 * 2. Failed broadcast leaves the previous radius unchanged (transaction rollback).
 * 3. Retrying after failure retries the exact same radius band (no skipping).
 * 4. Repeated successful calls do not duplicate donor notifications (idempotent retry).
 * 5. Concurrent expansion attempts cannot skip a radius band.
 * 6. Existing active-broadcast deduplication still works for non-expansion triggers.
 * 7. DIRECT_VOLUNTEER containers do not interfere with emergency radius expansion.
 * 8. Radius expansion respects MAX_RADIUS_KM cap (100 km).
 */

import assert from "node:assert";
import { prisma } from "../src/config/prisma";
import { executeFollowUpJob, ClaimedSchedulerJob, MAX_RADIUS_KM, DEFAULT_RADIUS_INCREMENT_KM } from "../src/services/scheduler.service";
import { triggerEmergencyBroadcast } from "../src/services/broadcast.service";

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string, detail?: string) {
    if (condition) {
        console.log(`  [PASS] ${label}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${label}${detail ? ` -> ${detail}` : ""}`);
        failed++;
        throw new Error(`Assertion failed: ${label}`);
    }
}

interface MockState {
    requests: Map<string, any>;
    donors: any[];
    broadcasts: any[];
    deliveries: any[];
    notifications: any[];
    jobUpdates: any[];
    lockQueue: Map<string, Promise<void>>;
    simulateBroadcastFailure?: boolean;
}

let state: MockState;
let bcastSeq = 1;
let notifSeq = 1;
let delivSeq = 1;

function initMockState() {
    state = {
        requests: new Map(),
        donors: [],
        broadcasts: [],
        deliveries: [],
        notifications: [],
        jobUpdates: [],
        lockQueue: new Map(),
        simulateBroadcastFailure: false,
    };
    bcastSeq = 1;
    notifSeq = 1;
    delivSeq = 1;
}

function createJob(requestId: string, jobId = "job-test-4d"): ClaimedSchedulerJob {
    return {
        jobid: jobId,
        requestid: requestId,
        jobtype: "FOLLOW_UP_ESCALATION",
        status: "PROCESSING",
        scheduledfor: new Date(Date.now() - 60000),
        lockeduntil: new Date(Date.now() + 300000),
        lockedby: "test-worker",
        attemptcount: 1,
        maxattempts: 5,
        lasterror: null,
        idempotencykey: `key_${requestId}`,
        createdat: new Date(),
        updatedat: new Date(),
        completedat: null,
    };
}

function setupMockPrisma() {
    (prisma as any).bloodrequests = {
        findUnique: async (args: any) => {
            const req = state.requests.get(args.where.requestid);
            if (!req) return null;
            return {
                ...req,
                hospitals: req.hospitalid ? { hospitalname: "City General Hospital", city: "Metropolis", userid: "hosp-user-1" } : null,
                requesters: req.requesterid ? { name: "Requester Name", city: "Metropolis" } : null,
                broadcastdeliveries: state.deliveries.filter((d) => d.requestid === req.requestid),
                emergencybroadcasts: state.broadcasts.filter((b) => b.requestid === req.requestid),
            };
        },
        update: async (args: any) => {
            const req = state.requests.get(args.where.requestid);
            if (!req) throw new Error("Request not found");
            Object.assign(req, args.data);
            return { ...req };
        },
    };

    (prisma as any).emergencyschedulerjobs = {
        findFirst: async (args: any) => {
            return null;
        },
        create: async (args: any) => {
            return { jobid: "subsequent-job", ...args.data };
        },
        update: async (args: any) => {
            state.jobUpdates.push(args);
            return { ...args.data, jobid: args.where.jobid };
        },
    };

    (prisma as any).notification = {
        create: async (args: any) => {
            const notif = {
                notificationid: `notif-${notifSeq++}`,
                createdat: new Date(),
                ...args.data,
            };
            state.notifications.push(notif);
            return { ...notif };
        },
    };

    (prisma as any).emergencybroadcasts = {
        findFirst: async (args: any) => {
            const { where, orderBy } = args;
            let matches = state.broadcasts.filter((b) => b.requestid === where.requestid);
            if (where.status) {
                matches = matches.filter((b) => b.status === where.status);
            }
            if (where.triggertype?.not) {
                matches = matches.filter((b) => b.triggertype !== where.triggertype.not);
            }
            if (where.radiuskm?.gte !== undefined) {
                matches = matches.filter((b) => (b.radiuskm || 0) >= where.radiuskm.gte);
            }
            if (where.createdat?.gte) {
                matches = matches.filter((b) => new Date(b.createdat).getTime() >= new Date(where.createdat.gte).getTime());
            }
            if (orderBy?.createdat === "desc") {
                matches.sort((a, b) => new Date(b.createdat).getTime() - new Date(a.createdat).getTime());
            }
            return matches[0] ? { ...matches[0] } : null;
        },
    };

    (prisma as any).broadcastdeliveries = {
        findMany: async (args: any) => {
            const { where } = args;
            return state.deliveries.filter((del) => {
                if (where.requestid && del.requestid !== where.requestid) return false;
                if (where.deliverystatus?.in && !where.deliverystatus.in.includes(del.deliverystatus)) return false;
                return true;
            }).map((del) => ({ ...del }));
        },
    };

    // $transaction implementation with row-level lock simulation & rollback
    (prisma as any).$transaction = async (callback: (tx: any) => Promise<any>) => {
        let releaseLock: (() => void) | null = null;
        let lockedReqId: string | null = null;

        // Take snapshot for rollback simulation
        const snapshot = {
            requests: new Map(Array.from(state.requests.entries()).map(([k, v]) => [k, { ...v }])),
            broadcasts: state.broadcasts.map((b) => ({ ...b })),
            deliveries: state.deliveries.map((d) => ({ ...d })),
            notifications: state.notifications.map((n) => ({ ...n })),
        };

        const txMock: any = {
            $queryRawUnsafe: async (sql: string, ...params: any[]) => {
                if (sql.includes("FROM bloodrequests") && sql.includes("FOR UPDATE")) {
                    const reqId = params[0];
                    lockedReqId = reqId;

                    const existingLock = state.lockQueue.get(reqId) || Promise.resolve();
                    let resolver: () => void;
                    const nextLock = new Promise<void>((resolve) => {
                        resolver = resolve;
                    });
                    state.lockQueue.set(reqId, existingLock.then(() => nextLock));

                    await existingLock;
                    releaseLock = resolver!;

                    const req = state.requests.get(reqId);
                    if (!req) return [];
                    return [{ ...req }];
                }
                return [];
            },

            bloodrequests: {
                findUnique: async (args: any) => {
                    const req = state.requests.get(args.where.requestid);
                    if (!req) return null;
                    return {
                        ...req,
                        hospitals: req.hospitalid ? { hospitalname: "City General Hospital", city: "Metropolis" } : null,
                        requesters: req.requesterid ? { name: "Requester Name", city: "Metropolis" } : null,
                    };
                },
                update: async (args: any) => {
                    const req = state.requests.get(args.where.requestid);
                    if (!req) throw new Error("Request not found");
                    Object.assign(req, args.data);
                    return { ...req };
                },
            },

            emergencybroadcasts: {
                findFirst: async (args: any) => {
                    const { where, orderBy } = args;
                    let matches = state.broadcasts.filter((b) => b.requestid === where.requestid);
                    if (where.status) {
                        matches = matches.filter((b) => b.status === where.status);
                    }
                    if (where.triggertype?.not) {
                        matches = matches.filter((b) => b.triggertype !== where.triggertype.not);
                    }
                    if (where.radiuskm?.gte !== undefined) {
                        matches = matches.filter((b) => (b.radiuskm || 0) >= where.radiuskm.gte);
                    }
                    if (where.createdat?.gte) {
                        matches = matches.filter((b) => new Date(b.createdat).getTime() >= new Date(where.createdat.gte).getTime());
                    }
                    if (orderBy?.createdat === "desc") {
                        matches.sort((a, b) => new Date(b.createdat).getTime() - new Date(a.createdat).getTime());
                    }
                    return matches[0] ? { ...matches[0] } : null;
                },
                create: async (args: any) => {
                    if (state.simulateBroadcastFailure) {
                        throw new Error("Simulated database write error during broadcast creation");
                    }
                    const record = {
                        broadcastid: `bcast-${bcastSeq++}`,
                        createdat: new Date(),
                        ...args.data,
                    };
                    state.broadcasts.push(record);
                    return { ...record };
                },
                update: async (args: any) => {
                    const record = state.broadcasts.find((b) => b.broadcastid === args.where.broadcastid);
                    if (!record) throw new Error("Broadcast not found");
                    Object.assign(record, args.data);
                    return { ...record };
                },
            },

            donors: {
                findMany: async (args: any) => {
                    const { where } = args;
                    return state.donors.filter((d) => {
                        if (where.bloodgroup?.in && !where.bloodgroup.in.includes(d.bloodgroup)) return false;
                        if (where.availabilitystatus && d.availabilitystatus !== where.availabilitystatus) return false;
                        if (where.iseligible !== undefined && d.iseligible !== where.iseligible) return false;
                        if (where.users?.isactive !== undefined && d.users?.isactive !== where.users.isactive) return false;
                        return true;
                    }).map((d) => ({ ...d }));
                },
            },

            broadcastdeliveries: {
                findMany: async (args: any) => {
                    const { where } = args;
                    return state.deliveries.filter((del) => {
                        if (where.requestid && del.requestid !== where.requestid) return false;
                        if (where.deliverystatus?.in && !where.deliverystatus.in.includes(del.deliverystatus)) return false;
                        return true;
                    }).map((del) => ({ ...del }));
                },
                create: async (args: any) => {
                    const record = {
                        deliveryid: `deliv-${delivSeq++}`,
                        createdat: new Date(),
                        ...args.data,
                    };
                    state.deliveries.push(record);
                    return { ...record };
                },
            },

            notification: {
                create: async (args: any) => {
                    const record = {
                        notificationid: `notif-${notifSeq++}`,
                        createdat: new Date(),
                        ...args.data,
                    };
                    state.notifications.push(record);
                    return { ...record };
                },
            },
        };

        try {
            const result = await callback(txMock);
            return result;
        } catch (txErr) {
            // Rollback state changes on failure
            state.requests = snapshot.requests;
            state.broadcasts = snapshot.broadcasts;
            state.deliveries = snapshot.deliveries;
            state.notifications = snapshot.notifications;
            throw txErr;
        } finally {
            if (releaseLock) {
                releaseLock();
            }
        }
    };
}

async function runTests() {
    console.log("=== SWASTYA PHASE 1B STEP 4D REGRESSION TEST SUITE ===");
    setupMockPrisma();

    // --------------------------------------------------------------------------
    // Test 1: Successful expansion advances radius exactly once and persists it
    // --------------------------------------------------------------------------
    console.log("\nTest Group 1: Successful Expansion Advances Radius Atomically");
    initMockState();

    const reqId1 = "11111111-1111-1111-1111-111111111111";
    state.requests.set(reqId1, {
        requestid: reqId1,
        createdbyuserid: "user-req-1",
        patientname: "John Patient",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: 2,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        requiredby: new Date(Date.now() + 3600000),
        searchradius: 10,
        latitude: 12.9716,
        longitude: 77.5946,
        hospitalid: "hosp-1",
    });

    state.donors = [
        {
            donorid: "donor-10km",
            userid: "user-d1",
            bloodgroup: "O_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 12.9720,
            longitude: 77.5950, // ~0.1 km
            users: { userid: "user-d1", name: "Near Donor", isactive: true },
        },
        {
            donorid: "donor-15km",
            userid: "user-d2",
            bloodgroup: "O_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 13.0800,
            longitude: 77.5950, // ~12 km (outside 10km, inside 15km)
            users: { userid: "user-d2", name: "Mid Donor", isactive: true },
        },
    ];

    // Seed prior delivery to donor-10km so only donor-15km is newly notified
    state.deliveries.push({
        deliveryid: "deliv-prior",
        requestid: reqId1,
        donorid: "donor-10km",
        donoruserid: "user-d1",
        deliverystatus: "DELIVERED",
    });

    const job1 = createJob(reqId1, "job-1");
    const result1 = await executeFollowUpJob(job1);

    check(result1.status === "EXPANDED", "Job result status is EXPANDED");
    check(state.requests.get(reqId1).searchradius === 15, "Request searchradius in database advanced from 10 to 15 km");
    check(state.broadcasts.length === 1, "Exactly 1 emergency broadcast record created");
    check(state.broadcasts[0].radiuskm === 15, "Broadcast record has radiuskm = 15");
    check(state.broadcasts[0].totalnotified === 1, "Only newly covered donor at 12km was notified");
    check(state.jobUpdates.some((j) => j.where.jobid === "job-1" && j.data.status === "COMPLETED"), "Job marked COMPLETED");

    // --------------------------------------------------------------------------
    // Test 2: Failed broadcast leaves previous radius unchanged
    // --------------------------------------------------------------------------
    console.log("\nTest Group 2: Failed Broadcast Rollback (Preserves Previous Radius)");
    initMockState();

    const reqId2 = "22222222-2222-2222-2222-222222222222";
    state.requests.set(reqId2, {
        requestid: reqId2,
        createdbyuserid: "user-req-2",
        patientname: "Alice Patient",
        bloodgroup: "A_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: 1,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        requiredby: new Date(Date.now() + 3600000),
        searchradius: 10,
        latitude: 12.9716,
        longitude: 77.5946,
        hospitalid: "hosp-1",
    });

    state.donors = [
        {
            donorid: "donor-a",
            userid: "user-da",
            bloodgroup: "A_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 12.9720,
            longitude: 77.5950,
            users: { userid: "user-da", isactive: true },
        },
    ];

    // Trigger failure simulation
    state.simulateBroadcastFailure = true;

    const job2 = createJob(reqId2, "job-fail-1");
    let caughtError: any = null;
    try {
        await executeFollowUpJob(job2);
    } catch (err) {
        caughtError = err;
    }

    check(caughtError !== null, "executeFollowUpJob threw error when broadcast failed");
    check(state.requests.get(reqId2).searchradius === 10, "Request searchradius remained 10 km (NOT advanced to 15)");
    check(state.broadcasts.length === 0, "Zero broadcast records persisted");
    check(state.notifications.filter((n) => n.title === "Emergency Radius Expanded").length === 0, "Zero 'Radius Expanded' notifications sent to user");
    check(!state.jobUpdates.some((j) => j.where.jobid === "job-fail-1" && j.data.status === "COMPLETED"), "Job was NOT marked COMPLETED");

    // --------------------------------------------------------------------------
    // Test 3: Retrying after failure retries the same radius band
    // --------------------------------------------------------------------------
    console.log("\nTest Group 3: Retrying After Failure Retries Same Radius Band");
    state.simulateBroadcastFailure = false; // Issue resolved

    const retryJob = createJob(reqId2, "job-retry-1");
    retryJob.attemptcount = 2; // Second attempt
    const retryResult = await executeFollowUpJob(retryJob);

    check(retryResult.status === "EXPANDED", "Retry job succeeded with EXPANDED");
    check(state.requests.get(reqId2).searchradius === 15, "Radius successfully advanced to 15 km on retry (NOT skipped to 20!)");
    check(state.broadcasts.length === 1, "Exactly 1 broadcast record created on retry");
    check(state.broadcasts[0].radiuskm === 15, "Broadcast created with radiuskm = 15");

    // --------------------------------------------------------------------------
    // Test 4: Repeated successful calls do not duplicate donor notifications
    // --------------------------------------------------------------------------
    console.log("\nTest Group 4: Idempotency on Repeated Successful Calls");
    const initialNotifCount = state.notifications.length;
    const initialBcastCount = state.broadcasts.length;

    // Repeated call to triggerEmergencyBroadcast for the same radius band (15 km)
    const repeatBcast = await triggerEmergencyBroadcast({
        requestId: reqId2,
        radiusKm: 15,
        expandRadius: true,
        triggeredByUserId: "user-req-2",
        triggerType: "RADIUS_EXPANSION",
    });

    check(repeatBcast.success === true, "Repeated call returns success: true");
    check(repeatBcast.alreadyActive === true, "Repeated call returns alreadyActive: true");
    check(repeatBcast.totalNotified === 1, "Returns existing broadcast totalNotified (1)");
    check(state.broadcasts.length === initialBcastCount, "No duplicate broadcast record created");
    check(state.notifications.length === initialNotifCount, "Zero duplicate notifications sent to donors or user");
    check(state.requests.get(reqId2).searchradius === 15, "Search radius remains 15 km");

    // --------------------------------------------------------------------------
    // Test 5: Concurrent expansion attempts cannot skip a radius band
    // --------------------------------------------------------------------------
    console.log("\nTest Group 5: Concurrent Expansion Serialization (No Band Skipping)");
    initMockState();

    const reqIdRace = "33333333-3333-3333-3333-333333333333";
    state.requests.set(reqIdRace, {
        requestid: reqIdRace,
        createdbyuserid: "user-req-race",
        patientname: "Race Patient",
        bloodgroup: "B_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: 2,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        requiredby: new Date(Date.now() + 3600000),
        searchradius: 10,
        latitude: 12.9716,
        longitude: 77.5946,
        hospitalid: "hosp-1",
    });

    state.donors = [
        {
            donorid: "donor-b1",
            userid: "user-b1",
            bloodgroup: "B_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 13.0000,
            longitude: 77.5950, // ~3.1 km away
            users: { userid: "user-b1", isactive: true },
        },
    ];

    // Fire two follow-up executions simultaneously
    const jobRace1 = createJob(reqIdRace, "job-race-1");
    const jobRace2 = createJob(reqIdRace, "job-race-2");

    const [out1, out2] = await Promise.all([
        executeFollowUpJob(jobRace1),
        executeFollowUpJob(jobRace2),
    ]);

    // One must be EXPANDED (primary), the other must be COMPLETED (deduplicated)
    const outcomes = [out1.status, out2.status].sort();
    check(outcomes[0] === "COMPLETED" && outcomes[1] === "EXPANDED", `One worker expanded, one deduplicated (got: ${out1.status}, ${out2.status})`);
    check(state.requests.get(reqIdRace).searchradius === 15, `Final radius is exactly 15 km (NOT skipped to 20 or 25, got: ${state.requests.get(reqIdRace).searchradius})`);
    check(state.broadcasts.length === 1, `Exactly 1 broadcast record created (got: ${state.broadcasts.length})`);
    check(state.deliveries.length === 1, `Exactly 1 delivery created (got: ${state.deliveries.length})`);

    // --------------------------------------------------------------------------
    // Test 6: Existing active-broadcast deduplication still works
    // --------------------------------------------------------------------------
    console.log("\nTest Group 6: Existing Active Broadcast Deduplication Preserved");
    initMockState();

    const reqIdDedup = "44444444-4444-4444-4444-444444444444";
    state.requests.set(reqIdDedup, {
        requestid: reqIdDedup,
        createdbyuserid: "user-dedup",
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        searchradius: 15,
        hospitalid: "hosp-1",
    });

    // Trigger initial broadcast
    const bcast1 = await triggerEmergencyBroadcast({ requestId: reqIdDedup, triggeredByUserId: "user-dedup" });
    check(bcast1.success === true && !bcast1.alreadyActive, "Initial broadcast succeeds");

    // Trigger second broadcast without expandRadius
    const bcast2 = await triggerEmergencyBroadcast({ requestId: reqIdDedup, triggeredByUserId: "user-dedup" });
    check(bcast2.success === true && bcast2.alreadyActive === true, "Second broadcast caught by deduplication");
    check(bcast2.broadcastId === bcast1.broadcastId, "Returns existing broadcast ID");
    check(state.broadcasts.length === 1, "Only 1 broadcast record exists");

    // --------------------------------------------------------------------------
    // Test 7: DIRECT_VOLUNTEER containers do NOT interfere with emergency expansion
    // --------------------------------------------------------------------------
    console.log("\nTest Group 7: DIRECT_VOLUNTEER Container Isolation");
    initMockState();

    const reqIdDirVol = "55555555-5555-5555-5555-555555555555";
    state.requests.set(reqIdDirVol, {
        requestid: reqIdDirVol,
        createdbyuserid: "user-dir-vol",
        patientname: "Direct Vol Patient",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: 2,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        requiredby: new Date(Date.now() + 3600000),
        searchradius: 10,
        latitude: 12.9716,
        longitude: 77.5946,
        hospitalid: "hosp-1",
    });

    // Existing DIRECT_VOLUNTEER container record
    state.broadcasts.push({
        broadcastid: "bcast-dv-1",
        requestid: reqIdDirVol,
        triggertype: "DIRECT_VOLUNTEER",
        status: "ACTIVE",
        radiuskm: 0,
        createdat: new Date(),
    });

    state.donors = [
        {
            donorid: "donor-dv-far",
            userid: "user-dv-far",
            bloodgroup: "O_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 13.0700,
            longitude: 77.5950, // ~11 km
            users: { userid: "user-dv-far", isactive: true },
        },
    ];

    const dvJob = createJob(reqIdDirVol, "job-dv-1");
    const dvResult = await executeFollowUpJob(dvJob);

    check(dvResult.status === "EXPANDED", "Expansion succeeded despite DIRECT_VOLUNTEER container");
    check(state.requests.get(reqIdDirVol).searchradius === 15, "Radius successfully advanced from 10 to 15 km");
    check(state.broadcasts.length === 2, "Genuine broadcast created alongside DIRECT_VOLUNTEER container");
    check(state.broadcasts[1].triggertype === "RADIUS_EXPANSION", "Genuine broadcast triggertype is RADIUS_EXPANSION");

    // --------------------------------------------------------------------------
    // Test 8: Radius expansion respects MAX_RADIUS_KM cap (100 km)
    // --------------------------------------------------------------------------
    console.log("\nTest Group 8: MAX_RADIUS_KM Cap (100 km)");
    initMockState();

    const reqIdMax = "66666666-6666-6666-6666-666666666666";
    state.requests.set(reqIdMax, {
        requestid: reqIdMax,
        createdbyuserid: "user-max",
        patientname: "Max Patient",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: 2,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        requiredby: new Date(Date.now() + 3600000),
        searchradius: 98, // 98 km -> next would be 103, should cap at 100
        latitude: 12.9716,
        longitude: 77.5946,
        hospitalid: "hosp-1",
    });

    const maxJob1 = createJob(reqIdMax, "job-max-1");
    const maxResult1 = await executeFollowUpJob(maxJob1);

    check(maxResult1.status === "EXPANDED", "Expanded towards max radius");
    check(state.requests.get(reqIdMax).searchradius === 100, `Search radius capped at exactly 100 km (got: ${state.requests.get(reqIdMax).searchradius})`);

    // Next follow-up at 100 km
    const maxJob2 = createJob(reqIdMax, "job-max-2");
    const maxResult2 = await executeFollowUpJob(maxJob2);

    check(maxResult2.status === "MAX_RADIUS_REACHED", "Scheduler stops expanding and returns MAX_RADIUS_REACHED at 100 km");
    check(state.requests.get(reqIdMax).searchradius === 100, "Search radius remains 100 km");

    console.log("\n==========================================================================");
    console.log(`STEP 4D TESTS COMPLETE: ${passed} passed, ${failed} failed`);
    console.log("==========================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
});
