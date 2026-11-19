/**
 * SWASTYA PHASE 1B - STEP 4A REGRESSION TEST SUITE
 * 
 * Verifies:
 * 1. BLOOD_ARRANGED request past requiredby remains BLOOD_ARRANGED.
 * 2. FULFILLED request is never overwritten.
 * 3. CANCELLED request is never overwritten.
 * 4. EXPIRED request remains unchanged.
 * 5. Eligible overdue request still expires correctly.
 * 6. Concurrent fulfillment vs scheduler expiry cannot overwrite FULFILLED.
 * 7. No expiry notification is sent when the expiry transition is rejected.
 * 8. Concurrent BLOOD_ARRANGED transit completion safely aborts expiry without notification.
 * 9. Concurrent cancellation safely aborts expiry without notification.
 * 10. Deadline extended concurrently safely aborts expiry without notification.
 */

import assert from "node:assert";
import { prisma } from "../src/config/prisma";
import { executeFollowUpJob, ClaimedSchedulerJob } from "../src/services/scheduler.service";

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

// In-Memory Test State
interface MockSchedulerState {
    request: {
        requestid: string;
        createdbyuserid: string;
        patientname: string;
        bloodgroup: any;
        bloodcomponent: any;
        unitsrequired: number;
        status: string;
        isemergency: boolean;
        urgencylevel: string;
        requiredby: Date | null;
        searchradius: number;
        hospitals: any;
        requesters: any;
        broadcastdeliveries: any[];
        emergencybroadcasts: any[];
    };
    lockedStatusOverride?: string;
    lockedRequiredByOverride?: Date | null;
    requestUpdates: any[];
    statusHistoryEntries: any[];
    broadcastUpdates: any[];
    jobUpdates: any[];
    notificationsSent: any[];
}

let state: MockSchedulerState;

function createTestJob(requestId: string): ClaimedSchedulerJob {
    return {
        jobid: "job-1111-2222-3333-4444",
        requestid: requestId,
        jobtype: "FOLLOW_UP_ESCALATION",
        status: "PROCESSING",
        scheduledfor: new Date(Date.now() - 60000),
        attemptcount: 1,
        maxattempts: 5,
    };
}

function setupSpies() {
    prisma.bloodrequests.findUnique = (async (args: any) => {
        if (args.where.requestid === state.request.requestid) {
            return { ...state.request };
        }
        return null;
    }) as any;

    prisma.bloodrequests.update = (async (args: any) => {
        state.requestUpdates.push(args);
        if (args.data.status) {
            state.request.status = args.data.status;
        }
        if (args.data.searchradius) {
            state.request.searchradius = args.data.searchradius;
        }
        return { ...state.request, ...args.data };
    }) as any;

    prisma.emergencyschedulerjobs.update = (async (args: any) => {
        state.jobUpdates.push(args);
        return { ...args.data, jobid: args.where.jobid };
    }) as any;

    prisma.emergencyschedulerjobs.create = (async (args: any) => {
        state.jobUpdates.push(args);
        return { ...args.data, jobid: "mock-next-job-id" };
    }) as any;

    prisma.emergencyschedulerjobs.findFirst = (async () => null) as any;

    prisma.emergencybroadcasts.findFirst = (async () => null) as any;
    prisma.emergencybroadcasts.create = (async (args: any) => ({
        broadcastid: "mock-bcast-id",
        totalnotified: 0,
        ...args.data,
    })) as any;
    prisma.emergencybroadcasts.update = (async (args: any) => ({ ...args.data })) as any;

    prisma.broadcastdeliveries.findMany = (async () => []) as any;
    prisma.donors.findMany = (async () => []) as any;

    prisma.notification.create = (async (args: any) => {
        state.notificationsSent.push(args.data);
        return { notificationid: "notif-mock-id", ...args.data };
    }) as any;

    prisma.$transaction = (async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
            $queryRawUnsafe: async (query: string, ...params: any[]) => {
                if (query.includes("FOR UPDATE")) {
                    const currentStatus = state.lockedStatusOverride ?? state.request.status;
                    const currentRequiredBy = state.lockedRequiredByOverride !== undefined
                        ? state.lockedRequiredByOverride
                        : state.request.requiredby;

                    return [{
                        requestid: state.request.requestid,
                        status: currentStatus,
                        requiredby: currentRequiredBy,
                        patientname: state.request.patientname,
                        createdbyuserid: state.request.createdbyuserid,
                    }];
                }
                return [];
            },
            bloodrequests: {
                findUnique: async (args: any) => {
                    if (args.where.requestid === state.request.requestid) {
                        return { ...state.request };
                    }
                    return null;
                },
                update: async (args: any) => {
                    state.requestUpdates.push(args);
                    if (args.data.status) {
                        state.request.status = args.data.status;
                    }
                    return { ...state.request, ...args.data };
                },
            },
            donors: {
                findMany: async () => [],
            },
            broadcastdeliveries: {
                findMany: async () => [],
                create: async () => ({}),
            },
            requeststatushistory: {
                create: async (args: any) => {
                    state.statusHistoryEntries.push(args.data);
                    return { historyid: "mock-hist-id", ...args.data };
                },
            },
            emergencybroadcasts: {
                findFirst: async () => null,
                create: async (args: any) => ({ broadcastid: "mock-bcast-id", totalnotified: 0, ...args.data }),
                update: async (args: any) => ({ ...args.data }),
                updateMany: async (args: any) => {
                    state.broadcastUpdates.push(args);
                    return { count: 1 };
                },
            },
        };
        return await fn(mockTx);
    }) as any;
}

async function runTests() {
    console.log("==========================================================================");
    console.log("  SWASTYA PHASE 1B - STEP 4A REGRESSION TEST SUITE                        ");
    console.log("  Scheduler Expiry Protection & Row-Level Lock Verification              ");
    console.log("==========================================================================\n");

    setupSpies();

    const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
    const futureDate = new Date(Date.now() + 3600000); // 1 hour in future

    // --------------------------------------------------------------------------
    // Test 1: BLOOD_ARRANGED request past requiredby remains BLOOD_ARRANGED
    // --------------------------------------------------------------------------
    console.log("--- 1. BLOOD_ARRANGED Expiry Protection ---");
    state = {
        request: {
            requestid: "req-arranged-1",
            createdbyuserid: "user-req-1",
            patientname: "Alice Patient",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "BLOOD_ARRANGED",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: { userid: "hosp-user-1", hospitalname: "City Hospital" },
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome1 = await executeFollowUpJob(createTestJob("req-arranged-1"));
    check(outcome1.status === "COMPLETED", "Outcome status is COMPLETED for BLOOD_ARRANGED");
    check(state.request.status === "BLOOD_ARRANGED", "Request status remains BLOOD_ARRANGED (not EXPIRED)");
    check(state.requestUpdates.length === 0, "No bloodrequests update was executed");
    check(state.statusHistoryEntries.length === 0, "No requeststatushistory record created");
    check(state.notificationsSent.length === 0, "No expiry notification sent to user");
    check(state.jobUpdates.some((j) => j.data.status === "COMPLETED"), "Scheduler job marked COMPLETED");

    // --------------------------------------------------------------------------
    // Test 2: FULFILLED request is never overwritten
    // --------------------------------------------------------------------------
    console.log("\n--- 2. FULFILLED Request Protection ---");
    state = {
        request: {
            requestid: "req-fulfilled-1",
            createdbyuserid: "user-req-1",
            patientname: "Bob Patient",
            bloodgroup: "A_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "FULFILLED",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome2 = await executeFollowUpJob(createTestJob("req-fulfilled-1"));
    check(outcome2.status === "CANCELLED", "Job cancelled for already FULFILLED request");
    check(state.request.status === "FULFILLED", "Status remains FULFILLED");
    check(state.requestUpdates.length === 0, "No status update to EXPIRED");
    check(state.notificationsSent.length === 0, "No expiry notification sent");

    // --------------------------------------------------------------------------
    // Test 3: CANCELLED request is never overwritten
    // --------------------------------------------------------------------------
    console.log("\n--- 3. CANCELLED Request Protection ---");
    state = {
        request: {
            requestid: "req-cancelled-1",
            createdbyuserid: "user-req-1",
            patientname: "Charlie Patient",
            bloodgroup: "B_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "CANCELLED",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome3 = await executeFollowUpJob(createTestJob("req-cancelled-1"));
    check(outcome3.status === "CANCELLED", "Job cancelled for CANCELLED request");
    check(state.request.status === "CANCELLED", "Status remains CANCELLED");
    check(state.requestUpdates.length === 0, "No status update to EXPIRED");
    check(state.notificationsSent.length === 0, "No expiry notification sent");

    // --------------------------------------------------------------------------
    // Test 4: EXPIRED request remains unchanged
    // --------------------------------------------------------------------------
    console.log("\n--- 4. Already EXPIRED Request Idempotency ---");
    state = {
        request: {
            requestid: "req-expired-1",
            createdbyuserid: "user-req-1",
            patientname: "David Patient",
            bloodgroup: "AB_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "EXPIRED",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome4 = await executeFollowUpJob(createTestJob("req-expired-1"));
    check(outcome4.status === "CANCELLED", "Job cancelled for EXPIRED request");
    check(state.request.status === "EXPIRED", "Status remains EXPIRED");
    check(state.requestUpdates.length === 0, "No redundant status update");
    check(state.notificationsSent.length === 0, "No duplicate expiry notification");

    // --------------------------------------------------------------------------
    // Test 5: Eligible overdue request still expires correctly
    // --------------------------------------------------------------------------
    console.log("\n--- 5. Eligible Overdue Request Expiration ---");
    state = {
        request: {
            requestid: "req-overdue-1",
            createdbyuserid: "user-req-1",
            patientname: "Eva Patient",
            bloodgroup: "O_NEGATIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "DONOR_MATCHING",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome5 = await executeFollowUpJob(createTestJob("req-overdue-1"));
    check(outcome5.status === "EXPIRED", "Outcome status is EXPIRED for overdue unfulfilled request");
    check(state.request.status === "EXPIRED", "Request status updated to EXPIRED");
    check(state.requestUpdates.length === 1, "Exactly 1 bloodrequests update executed");
    check(state.statusHistoryEntries.length === 1, "Exactly 1 history record created");
    check(state.statusHistoryEntries[0].oldstatus === "DONOR_MATCHING", "History logs old status correctly");
    check(state.statusHistoryEntries[0].newstatus === "EXPIRED", "History logs new status as EXPIRED");
    check(state.broadcastUpdates.length === 1, "Emergency broadcasts marked EXPIRED");
    check(state.notificationsSent.length === 1, "Expiry notification sent to requester");
    check(state.notificationsSent[0].title === "Blood Requisition Expired", "Notification title correct");
    check(state.jobUpdates.some((j) => j.data.status === "CANCELLED"), "Job marked CANCELLED with expiry reason");

    // --------------------------------------------------------------------------
    // Test 6: Concurrent fulfillment vs scheduler expiry
    // --------------------------------------------------------------------------
    console.log("\n--- 6. Concurrent Fulfillment Race Condition ---");
    // Initially read as DONOR_MATCHING with past requiredby, but locked row inside transaction returns FULFILLED
    state = {
        request: {
            requestid: "req-race-fulfill-1",
            createdbyuserid: "user-req-1",
            patientname: "Frank Patient",
            bloodgroup: "A_NEGATIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "DONOR_MATCHING",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        lockedStatusOverride: "FULFILLED", // Concurrently fulfilled by hospital
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome6 = await executeFollowUpJob(createTestJob("req-race-fulfill-1"));
    check(outcome6.status === "CANCELLED", "Job cancelled safely when locked row is FULFILLED");
    check(state.requestUpdates.length === 0, "FULFILLED request was NOT overwritten with EXPIRED");
    check(state.statusHistoryEntries.length === 0, "No erroneous history record created");
    check(state.notificationsSent.length === 0, "NO expiry notification sent for fulfilled request");

    // --------------------------------------------------------------------------
    // Test 7: Concurrent BLOOD_ARRANGED transition
    // --------------------------------------------------------------------------
    console.log("\n--- 7. Concurrent BLOOD_ARRANGED Transition ---");
    // Initially read as DONOR_MATCHING, but locked row returns BLOOD_ARRANGED
    state = {
        request: {
            requestid: "req-race-arranged-1",
            createdbyuserid: "user-req-1",
            patientname: "Grace Patient",
            bloodgroup: "B_NEGATIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "DONOR_MATCHING",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        lockedStatusOverride: "BLOOD_ARRANGED", // Concurrently arranged
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome7 = await executeFollowUpJob(createTestJob("req-race-arranged-1"));
    check(outcome7.status === "COMPLETED", "Job marked COMPLETED when locked row is BLOOD_ARRANGED");
    check(state.requestUpdates.length === 0, "BLOOD_ARRANGED request was NOT overwritten with EXPIRED");
    check(state.notificationsSent.length === 0, "NO expiry notification sent");
    check(state.jobUpdates.some((j) => j.data.status === "COMPLETED"), "Job recorded as COMPLETED");

    // --------------------------------------------------------------------------
    // Test 8: Concurrent cancellation
    // --------------------------------------------------------------------------
    console.log("\n--- 8. Concurrent Cancellation Race Condition ---");
    state = {
        request: {
            requestid: "req-race-cancel-1",
            createdbyuserid: "user-req-1",
            patientname: "Harry Patient",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "DONOR_MATCHING",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        lockedStatusOverride: "CANCELLED", // Concurrently cancelled
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome8 = await executeFollowUpJob(createTestJob("req-race-cancel-1"));
    check(outcome8.status === "CANCELLED", "Job cancelled when locked row is CANCELLED");
    check(state.requestUpdates.length === 0, "CANCELLED request was NOT overwritten with EXPIRED");
    check(state.notificationsSent.length === 0, "NO expiry notification sent for cancelled request");

    // --------------------------------------------------------------------------
    // Test 9: Concurrent deadline extension
    // --------------------------------------------------------------------------
    console.log("\n--- 9. Concurrent Deadline Extension ---");
    state = {
        request: {
            requestid: "req-race-deadline-1",
            createdbyuserid: "user-req-1",
            patientname: "Iris Patient",
            bloodgroup: "A_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "DONOR_MATCHING",
            isemergency: true,
            urgencylevel: "HIGH",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        lockedRequiredByOverride: futureDate, // Deadline extended concurrently
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome9 = await executeFollowUpJob(createTestJob("req-race-deadline-1"));
    check(outcome9.status !== "EXPIRED", "Request does NOT expire when locked deadline is in future");
    check(!state.requestUpdates.some((u) => u.data.status === "EXPIRED"), "No status update to EXPIRED");
    check(state.request.status !== "EXPIRED", "Request status is not EXPIRED");
    check(!state.notificationsSent.some((n) => n.title === "Blood Requisition Expired"), "NO expiry notification sent when deadline was extended");

    // --------------------------------------------------------------------------
    // Test 10: Non-emergency request is cancelled safely
    // --------------------------------------------------------------------------
    console.log("\n--- 10. Non-Emergency Safety Check ---");
    state = {
        request: {
            requestid: "req-non-emerg-1",
            createdbyuserid: "user-req-1",
            patientname: "Jack Patient",
            bloodgroup: "B_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: "DONOR_MATCHING",
            isemergency: false,
            urgencylevel: "LOW",
            requiredby: pastDate,
            searchradius: 15,
            hospitals: null,
            requesters: null,
            broadcastdeliveries: [],
            emergencybroadcasts: [],
        },
        requestUpdates: [],
        statusHistoryEntries: [],
        broadcastUpdates: [],
        jobUpdates: [],
        notificationsSent: [],
    };

    const outcome10 = await executeFollowUpJob(createTestJob("req-non-emerg-1"));
    check(outcome10.status === "CANCELLED", "Job cancelled for non-emergency request");
    check(state.requestUpdates.length === 0, "No status update to EXPIRED");
    check(state.notificationsSent.length === 0, "No notification sent");

    console.log("\n==========================================================================");
    console.log(`  STEP 4A TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("==========================================================================");
}

runTests().catch((err) => {
    console.error("Test runner threw uncaught error:", err);
    process.exit(1);
});
