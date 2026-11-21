/**
 * SWASTYA PHASE 1B - STEP 1 & STEP 2 REGRESSION TEST SUITE
 * 
 * Verifies:
 * 1. Task 1: Clinical Prescription Gate in PATCH /bloodrequests/:id/transit-status
 *    - Requester-created requisition with PENDING prescription cannot complete transit (400).
 *    - Requester-created requisition with REJECTED prescription cannot complete transit (400).
 *    - Requester-created requisition with missing prescription cannot complete transit (400).
 *    - Requester-created requisition with VERIFIED prescription can complete transit (200 -> BLOOD_ARRANGED).
 *    - Hospital-created requisition (requesterid === null) retains legitimate exemption (200 -> BLOOD_ARRANGED).
 * 
 * 2. Task 2 & 3: Terminal Request Protection & Transactional Row-Lock Safety
 *    - CANCELLED requisition rejects STARTED, REACHED_LOCATION, and COMPLETED (400).
 *    - EXPIRED requisition rejects STARTED, REACHED_LOCATION, and COMPLETED (400).
 *    - FULFILLED requisition rejects STARTED, REACHED_LOCATION, and COMPLETED (400).
 *    - Concurrent cancellation race safety: locked row status is verified inside transaction,
 *      preventing completed transit from reviving a cancelled requisition.
 */

process.env.DISABLE_RATE_LIMIT = "true";
process.env.JWT_SECRET = "test_super_secret_jwt_key_swastya_phase1b_32chars_min";

import http from "http";
import assert from "node:assert";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";

let server: http.Server;
let API_BASE = "";
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

async function patchJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }
    return { status: res.status, headers: res.headers, data: json };
}

// In-Memory Test State Store for isolated testing
interface MockRequestState {
    requestid: string;
    createdbyuserid: string;
    requesterid: string | null;
    hospitalid: string | null;
    status: string;
    patientname: string;
    bloodgroup: string;
    unitsrequired: number;
    hospitals: any;
    requesters: any;
    prescription: {
        prescriptionid: string;
        requestid: string;
        status: string;
    } | null;
    volunteerNotification: {
        notificationid: string;
        userid: string;
        requestid: string;
        type: string;
        title: string;
        message: string;
        sentat: Date;
    } | null;
    transitStatus?: string;
}

let mockState: MockRequestState;

// Setup mock spies on prisma singleton
function setupPrismaSpies() {
    prisma.users.findUnique = (async (args: any) => {
        const id = args.where.userid;
        if (id === "11111111-1111-1111-1111-111111111111") {
            return { userid: id, role: "REQUESTER", isactive: true };
        }
        if (id === "22222222-2222-2222-2222-222222222222") {
            return { userid: id, role: "HOSPITAL", isactive: true };
        }
        if (id === "44444444-4444-4444-4444-444444444444") {
            return { userid: id, role: "DONOR", isactive: true };
        }
        if (id === "55555555-5555-5555-5555-555555555555") {
            return { userid: id, role: "ADMIN", isactive: true };
        }
        return null;
    }) as any;

    prisma.bloodrequests.findUnique = (async (args: any) => {
        if (args.where.requestid === mockState.requestid) {
            return {
                requestid: mockState.requestid,
                createdbyuserid: mockState.createdbyuserid,
                requesterid: mockState.requesterid,
                hospitalid: mockState.hospitalid,
                status: mockState.status,
                patientname: mockState.patientname,
                bloodgroup: mockState.bloodgroup,
                unitsrequired: mockState.unitsrequired,
                hospitals: mockState.hospitals,
                requesters: mockState.requesters,
            };
        }
        return null;
    }) as any;

    prisma.hospitals.findUnique = (async (args: any) => {
        if (mockState.hospitals && args.where.userid === mockState.hospitals.userid) {
            return mockState.hospitals;
        }
        return null;
    }) as any;

    prisma.broadcastdeliveries.findFirst = (async () => null) as any;

    prisma.notification.findFirst = (async (args: any) => {
        if (
            mockState.volunteerNotification &&
            args.where.requestid === mockState.requestid &&
            args.where.title === mockState.volunteerNotification.title
        ) {
            return mockState.volunteerNotification;
        }
        return null;
    }) as any;

    prisma.$transaction = (async (callback: (tx: any) => Promise<any>) => {
        const tx = {
            $queryRawUnsafe: async (query: string, ...params: any[]) => {
                if (query.includes("FROM bloodrequests")) {
                    return [
                        {
                            requestid: mockState.requestid,
                            status: mockState.status,
                            requesterid: mockState.requesterid,
                            hospitalid: mockState.hospitalid,
                        },
                    ];
                }
                if (query.includes("FROM broadcastdeliveries")) {
                    return [
                        {
                            deliveryid: "delivery-uuid-1",
                            transitstatus: mockState.transitStatus || "REACHED_LOCATION",
                            acceptancestatus: "ACCEPTED",
                            startedat: null,
                            reachedat: null,
                            completedat: null,
                            transitnotes: null,
                        },
                    ];
                }
                return [];
            },
            prescription: {
                findUnique: async (args: any) => {
                    if (mockState.prescription && args.where.requestid === mockState.requestid) {
                        return mockState.prescription;
                    }
                    return null;
                },
            },
            notification: {
                update: async (args: any) => {
                    if (mockState.volunteerNotification) {
                        mockState.volunteerNotification.message = args.data.message;
                    }
                    return mockState.volunteerNotification;
                },
                findFirst: async (args: any) => {
                    if (
                        mockState.volunteerNotification &&
                        args?.where?.requestid === mockState.requestid &&
                        args?.where?.userid === mockState.volunteerNotification.userid
                    ) {
                        return mockState.volunteerNotification;
                    }
                    return null;
                },
                create: async (args: any) => args.data,
            },
            donors: {
                findUnique: async () => ({ donorid: "donor-uuid-1", userid: "donor-user-uuid" }),
                update: async (args: any) => ({ donorid: args.where.donorid, ...args.data }),
            },
            donationhistory: {
                findFirst: async () => null,
                create: async (args: any) => ({ donationhistoryid: "history-uuid-1", ...args.data }),
            },
            broadcastdeliveries: {
                findMany: async () => {
                    if (!mockState.volunteerNotification) {
                        return [];
                    }
                    const donorUid = mockState.volunteerNotification.userid || "44444444-4444-4444-4444-444444444444";
                    return [
                        {
                            deliveryid: "delivery-uuid-1",
                            requestid: mockState.requestid,
                            donorid: "donor-uuid-1",
                            donoruserid: donorUid,
                            response: "ACCEPTED",
                            acceptancestatus: "ACCEPTED",
                            respondedat: new Date(),
                            transitstatus: "STARTED",
                            startedat: new Date(),
                            reachedat: null,
                            completedat: null,
                            transitnotes: null,
                            donors: {
                                donorid: "donor-uuid-1",
                                userid: donorUid,
                                users: { fullname: "Mock Donor" },
                            },
                        },
                    ];
                },
                update: async (args: any) => {
                    if (args?.data?.transitstatus) {
                        mockState.transitStatus = args.data.transitstatus;
                    }
                    return {
                        deliveryid: "delivery-uuid-1",
                        ...(args?.data || {}),
                    };
                },
                updateMany: async () => ({ count: 1 }),
            },
            bloodrequests: {
                update: async (args: any) => {
                    if (args.where.requestid === mockState.requestid) {
                        mockState.status = args.data.status;
                    }
                    return mockState;
                },
            },
            requeststatushistory: {
                create: async (args: any) => args.data,
            },
        };
        return await callback(tx);
    }) as any;
}

async function runTests() {
    console.log("\n==========================================================================");
    console.log("  SWASTYA PHASE 1B - STEP 1 & 2 REGRESSION TEST SUITE                      ");
    console.log("  Clinical Prescription Gate & Terminal Request Protection                 ");
    console.log("==========================================================================\n");

    setupPrismaSpies();

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, () => {
            const addr = server.address() as any;
            API_BASE = `http://localhost:${addr.port}`;
            resolve();
        });
    });

    const requesterUserId = "11111111-1111-1111-1111-111111111111";
    const hospitalUserId = "22222222-2222-2222-2222-222222222222";
    const hospitalId = "33333333-3333-3333-3333-333333333333";
    const donorUserId = "44444444-4444-4444-4444-444444444444";
    const adminUserId = "55555555-5555-5555-5555-555555555555";
    const requestId = "66666666-6666-6666-6666-666666666666";

    const hospitalToken = generateToken(hospitalUserId, "HOSPITAL");
    const adminToken = generateToken(adminUserId, "ADMIN");
    const donorToken = generateToken(donorUserId, "DONOR");

    function resetState(overrides: Partial<MockRequestState> = {}) {
        mockState = {
            requestid: requestId,
            createdbyuserid: requesterUserId,
            requesterid: "requester-uuid-1",
            hospitalid: hospitalId,
            status: "DONOR_MATCHING",
            patientname: "Test Patient",
            bloodgroup: "O_POSITIVE",
            unitsrequired: 1,
            hospitals: {
                hospitalid: hospitalId,
                userid: hospitalUserId,
                hospitalname: "City Care Hospital",
                approvalstatus: "APPROVED",
            },
            requesters: {
                userid: requesterUserId,
            },
            prescription: {
                prescriptionid: "rx-uuid-1",
                requestid: requestId,
                status: "PENDING",
            },
            volunteerNotification: {
                notificationid: "notif-uuid-1",
                userid: donorUserId,
                requestid: requestId,
                type: "MATCH",
                title: "Volunteer Response Confirmed",
                message: "Donor volunteered <!--META:{\"donorName\":\"Jane Donor\",\"transitStatus\":\"DONOR_FOUND\"}-->",
                sentat: new Date(),
            },
            ...overrides,
        };
    }

    try {
        // =========================================================================
        // TASK 1: PRESCRIPTION CLINICAL GATE
        // =========================================================================
        console.log("--- Task 1: Clinical Prescription Gate Enforcements ---");

        // 1. Requester-created request with PENDING prescription cannot complete transit
        resetState({
            requesterid: "requester-uuid-1",
            status: "DONOR_MATCHING",
            prescription: { prescriptionid: "rx-1", requestid: requestId, status: "PENDING" },
        });
        const resPending = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "COMPLETED",
        });
        check(resPending.status === 400, "1. PENDING prescription blocks transit COMPLETED with HTTP 400");
        check(
            resPending.data.message.toLowerCase().includes("verified prescription"),
            "1b. Rejection message mentions verified prescription required",
            resPending.data.message
        );
        check(mockState.status === "DONOR_MATCHING", "1c. Request status remains DONOR_MATCHING (not BLOOD_ARRANGED)");

        // 2. Requester-created request with REJECTED prescription cannot complete transit
        resetState({
            requesterid: "requester-uuid-1",
            status: "DONOR_MATCHING",
            prescription: { prescriptionid: "rx-1", requestid: requestId, status: "REJECTED" },
        });
        const resRejected = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "COMPLETED",
        });
        check(resRejected.status === 400, "2. REJECTED prescription blocks transit COMPLETED with HTTP 400");
        check(
            resRejected.data.message.toLowerCase().includes("verified prescription"),
            "2b. Rejection message mentions verified prescription required"
        );
        check(mockState.status === "DONOR_MATCHING", "2c. Request status remains DONOR_MATCHING");

        // 3. Requester-created request with missing prescription cannot complete transit
        resetState({
            requesterid: "requester-uuid-1",
            status: "DONOR_MATCHING",
            prescription: null,
        });
        const resMissing = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "COMPLETED",
        });
        check(resMissing.status === 400, "3. Missing prescription blocks transit COMPLETED with HTTP 400");
        check(
            resMissing.data.message.toLowerCase().includes("verified prescription"),
            "3b. Rejection message mentions verified prescription required"
        );
        check(mockState.status === "DONOR_MATCHING", "3c. Request status remains DONOR_MATCHING");

        // 4. Requester-created request with VERIFIED prescription CAN complete transit
        resetState({
            requesterid: "requester-uuid-1",
            status: "DONOR_MATCHING",
            prescription: { prescriptionid: "rx-1", requestid: requestId, status: "VERIFIED" },
        });
        const resVerified = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "COMPLETED",
        });
        check(resVerified.status === 200, "4. VERIFIED prescription allows transit COMPLETED with HTTP 200");
        check(mockState.status === "BLOOD_ARRANGED", "4b. Request status properly advanced to BLOOD_ARRANGED");

        // 5. Hospital-created request (requesterid === null) retains legitimate exemption
        resetState({
            requesterid: null, // Hospital-created order
            createdbyuserid: hospitalUserId,
            status: "DONOR_MATCHING",
            prescription: null, // No consumer prescription
        });
        const resHospOrder = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "COMPLETED",
        });
        check(resHospOrder.status === 200, "5. Hospital-created order exempted from prescription gate (HTTP 200)");
        check(mockState.status === "BLOOD_ARRANGED", "5b. Hospital order status properly advanced to BLOOD_ARRANGED");

        // =========================================================================
        // TASK 2: TERMINAL REQUEST PROTECTION
        // =========================================================================
        console.log("\n--- Task 2: Terminal Request State Protections ---");

        // 6. CANCELLED request rejects STARTED, REACHED_LOCATION, and COMPLETED
        for (const targetStatus of ["STARTED", "REACHED_LOCATION", "COMPLETED"]) {
            resetState({
                status: "CANCELLED",
                prescription: { prescriptionid: "rx-1", requestid: requestId, status: "VERIFIED" },
            });
            const resCancelled = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
                status: targetStatus,
            });
            check(resCancelled.status === 400, `6a. CANCELLED request rejects ${targetStatus} with HTTP 400`);
            check(
                resCancelled.data.message.toLowerCase().includes("cancelled"),
                `6b. Error message indicates request is cancelled for ${targetStatus}`
            );
            check(mockState.status === "CANCELLED", `6c. Request remains CANCELLED (no revival)`);
        }

        // 7. EXPIRED request rejects STARTED, REACHED_LOCATION, and COMPLETED
        for (const targetStatus of ["STARTED", "REACHED_LOCATION", "COMPLETED"]) {
            resetState({
                status: "EXPIRED",
                prescription: { prescriptionid: "rx-1", requestid: requestId, status: "VERIFIED" },
            });
            const resExpired = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
                status: targetStatus,
            });
            check(resExpired.status === 400, `7a. EXPIRED request rejects ${targetStatus} with HTTP 400`);
            check(
                resExpired.data.message.toLowerCase().includes("expired"),
                `7b. Error message indicates request is expired for ${targetStatus}`
            );
            check(mockState.status === "EXPIRED", `7c. Request remains EXPIRED (no revival)`);
        }

        // 8. FULFILLED request rejects STARTED, REACHED_LOCATION, and COMPLETED
        for (const targetStatus of ["STARTED", "REACHED_LOCATION", "COMPLETED"]) {
            resetState({
                status: "FULFILLED",
                prescription: { prescriptionid: "rx-1", requestid: requestId, status: "VERIFIED" },
            });
            const resFulfilled = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
                status: targetStatus,
            });
            check(resFulfilled.status === 400, `8a. FULFILLED request rejects ${targetStatus} with HTTP 400`);
            check(
                resFulfilled.data.message.toLowerCase().includes("fulfilled"),
                `8b. Error message indicates request is fulfilled for ${targetStatus}`
            );
            check(mockState.status === "FULFILLED", `8c. Request remains FULFILLED (no state corruption)`);
        }

        // =========================================================================
        // TASK 3: TRANSACTION AND CONCURRENCY RACE SAFETY
        // =========================================================================
        console.log("\n--- Task 3: Transactional Row-Lock and Race Condition Safety ---");

        // 9. Concurrent cancellation race test:
        // Requisition was loaded as DONOR_MATCHING before transaction,
        // but by the time the FOR UPDATE lock was acquired in the transaction, it had transitioned to CANCELLED.
        resetState({
            status: "DONOR_MATCHING", // In-memory snapshot pre-transaction
            prescription: { prescriptionid: "rx-1", requestid: requestId, status: "VERIFIED" },
        });

        // Simulate concurrent cancellation inside $transaction row lock:
        // tx.$queryRawUnsafe returns CANCELLED as current committed DB state
        const originalTransaction = prisma.$transaction;
        prisma.$transaction = (async (callback: (tx: any) => Promise<any>) => {
            const tx = {
                $queryRawUnsafe: async (query: string, ...params: any[]) => {
                    if (query.includes("FROM bloodrequests")) {
                        // Concurrent writer just committed CANCELLED
                        return [
                            {
                                requestid: mockState.requestid,
                                status: "CANCELLED",
                                requesterid: mockState.requesterid,
                                hospitalid: mockState.hospitalid,
                            },
                        ];
                    }
                    return [];
                },
                prescription: {
                    findUnique: async () => mockState.prescription,
                },
                notification: {
                    update: async () => mockState.volunteerNotification,
                    findFirst: async () => null,
                    create: async (args: any) => args.data,
                },
                donors: { findUnique: async () => ({ donorid: "donor-1", userid: donorUserId }) },
                broadcastdeliveries: { updateMany: async () => ({ count: 1 }) },
                bloodrequests: {
                    update: async (args: any) => {
                        mockState.status = args.data.status;
                        return mockState;
                    },
                },
                requeststatushistory: { create: async (args: any) => args.data },
            };
            return await callback(tx);
        }) as any;

        const resConcurrentRace = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "COMPLETED",
        });

        check(resConcurrentRace.status === 400, "9. Concurrent cancellation race caught by locked row check (HTTP 400)");
        check(
            resConcurrentRace.data.message.toLowerCase().includes("cancelled"),
            "9b. Rejection explains request was already cancelled",
            resConcurrentRace.data.message
        );
        check(mockState.status === "DONOR_MATCHING", "9c. Cancelled request was NOT revived to BLOOD_ARRANGED");

        // Restore default transaction mock
        prisma.$transaction = originalTransaction;

        // 10. Valid intermediate transit transitions for active requests remain functional
        resetState({
            status: "DONOR_MATCHING",
            prescription: { prescriptionid: "rx-1", requestid: requestId, status: "PENDING" },
            transitStatus: "DONOR_FOUND",
        });
        const resStarted = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "STARTED",
        });
        check(resStarted.status === 200, "10. STARTED transition succeeds for active request (HTTP 200)");
        check(mockState.status === "DONOR_MATCHING", "10b. STARTED transition leaves request in DONOR_MATCHING");

        const resReached = await patchJson(`/bloodrequests/${requestId}/transit-status`, hospitalToken, {
            status: "REACHED_LOCATION",
        });
        check(resReached.status === 200, "11. REACHED_LOCATION transition succeeds for active request (HTTP 200)");
        check(mockState.status === "DONOR_MATCHING", "11b. REACHED_LOCATION transition leaves request in DONOR_MATCHING");

        console.log(`\n==========================================================================`);
        console.log(`  ALL REGRESSION TESTS PASSED: ${passed} passed, ${failed} failed           `);
        console.log(`==========================================================================\n`);
    } finally {
        server.close();
    }
}

runTests().catch((err) => {
    console.error("Test execution failed:", err);
    if (server) server.close();
    process.exit(1);
});
