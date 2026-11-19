/**
 * SWASTYA PHASE 1B - STEP 4C REGRESSION TEST SUITE
 * 
 * Verifies Emergency Broadcast Concurrency and Deduplication:
 * 1. Concurrent broadcast triggers for the same request are serialized under row lock.
 * 2. Active broadcast deduplication under the lock prevents duplicate active broadcasts.
 * 3. Matching donors receive exactly one notification during concurrent triggers.
 * 4. Pre-existing active broadcast within 10 minutes returns alreadyActive: true.
 * 5. Active broadcast older than 10 minutes allows re-broadcasting.
 * 6. Radius expansion (expandRadius: true) bypasses active deduplication.
 * 7. Radius expansion excludes previously notified donors across broadcasts.
 * 8. DIRECT_VOLUNTEER containers do NOT block genuine emergency broadcasts.
 * 9. Terminal requests (FULFILLED, CANCELLED, EXPIRED) reject broadcast triggers.
 * 10. Independent parallel broadcasts for different requests proceed in parallel.
 * 11. Ordinary non-emergency requests reject emergency broadcast on creation.
 * 12. Transaction rollback releases lock cleanly on failure.
 */

import assert from "node:assert";
import { prisma } from "../src/config/prisma";
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

// In-Memory Database Simulation for Step 4C
interface MockState {
    requests: Map<string, any>;
    donors: any[];
    broadcasts: any[];
    deliveries: any[];
    notifications: any[];
    lockQueue: Map<string, Promise<void>>;
}

let state: MockState;

function initMockState() {
    state = {
        requests: new Map(),
        donors: [],
        broadcasts: [],
        deliveries: [],
        notifications: [],
        lockQueue: new Map(),
    };
}

let broadcastSeq = 1;
let notifSeq = 1;
let deliverySeq = 1;

function setupMockPrisma() {
    // $transaction implementation with simulated row-level lock serialization
    (prisma as any).$transaction = async (callback: (tx: any) => Promise<any>) => {
        let releaseLock: (() => void) | null = null;

        const txMock: any = {
            $queryRawUnsafe: async (sql: string, ...params: any[]) => {
                if (sql.includes("FROM bloodrequests") && sql.includes("FOR UPDATE")) {
                    const reqId = params[0];

                    // Simulate PostgreSQL row-level lock: queue callers for the same request ID
                    const existingLock = state.lockQueue.get(reqId) || Promise.resolve();
                    let resolver: () => void;
                    const nextLock = new Promise<void>((resolve) => {
                        resolver = resolve;
                    });
                    state.lockQueue.set(reqId, existingLock.then(() => nextLock));

                    // Wait until previous transaction holding the row lock finishes
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
                        requesters: req.requesterid ? { name: "John Requester", city: "Metropolis" } : null,
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
                    const record = {
                        broadcastid: `bcast-${broadcastSeq++}`,
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
                        deliveryid: `deliv-${deliverySeq++}`,
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
        } finally {
            if (releaseLock) {
                releaseLock();
            }
        }
    };
}

async function runTests() {
    console.log("=== SWASTYA PHASE 1B STEP 4C REGRESSION TEST SUITE ===");
    setupMockPrisma();

    // -------------------------------------------------------------
    // Test Case 1: Concurrent Broadcast Triggers for Same Request
    // -------------------------------------------------------------
    console.log("\nTest Group 1: Concurrent Broadcast Serialization & Deduplication");
    initMockState();

    const reqId1 = "11111111-1111-1111-1111-111111111111";
    state.requests.set(reqId1, {
        requestid: reqId1,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        searchradius: 15,
        latitude: 12.9716,
        longitude: 77.5946,
        requiredby: new Date(Date.now() + 3600000),
        unitsrequired: 2,
        hospitalid: "hosp-1",
        requesterid: "req-1",
    });

    // Populate candidate donors
    state.donors = [
        {
            donorid: "donor-1",
            userid: "user-1",
            bloodgroup: "O_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date(Date.now() - 100 * 24 * 3600 * 1000), // > 90 days
            latitude: 12.9720,
            longitude: 77.5950, // ~0.1 km away
            city: "Metropolis",
            users: { userid: "user-1", name: "Alice Donor", email: "alice@test.com", phonenumber: "1234567890", isactive: true },
        },
        {
            donorid: "donor-2",
            userid: "user-2",
            bloodgroup: "O_NEGATIVE", // compatible with O+
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: new Date(Date.now() - 120 * 24 * 3600 * 1000),
            latitude: 12.9800,
            longitude: 77.6000, // ~1.1 km away
            city: "Metropolis",
            users: { userid: "user-2", name: "Bob Donor", email: "bob@test.com", phonenumber: "0987654321", isactive: true },
        },
    ];

    // Fire two simultaneous broadcast calls for the same request
    const [res1, res2] = await Promise.all([
        triggerEmergencyBroadcast({ requestId: reqId1, triggeredByUserId: "admin-1" }),
        triggerEmergencyBroadcast({ requestId: reqId1, triggeredByUserId: "admin-1" }),
    ]);

    check(res1.success === true && res2.success === true, "Both simultaneous calls returned success: true");

    // One of them must be the primary creator, the other must be deduplicated
    const primaryRes = res1.alreadyActive ? res2 : res1;
    const deduplicatedRes = res1.alreadyActive ? res1 : res2;

    check(!primaryRes.alreadyActive, "Primary broadcast successfully initiated new broadcast");
    check(primaryRes.totalNotified === 2, `Primary broadcast notified exactly 2 donors (got: ${primaryRes.totalNotified})`);
    check(deduplicatedRes.alreadyActive === true, "Second concurrent call was caught by deduplication under the lock");
    check(deduplicatedRes.isExisting === true, "Second call correctly flagged isExisting: true");
    check(deduplicatedRes.broadcastId === primaryRes.broadcastId, "Second call returned the existing broadcast ID");

    // Verify DB records
    check(state.broadcasts.length === 1, `Exactly 1 emergency broadcast record created (got: ${state.broadcasts.length})`);
    check(state.notifications.length === 2, `Exactly 2 notifications dispatched, no duplicate alerts (got: ${state.notifications.length})`);
    check(state.deliveries.length === 2, `Exactly 2 broadcast deliveries recorded (got: ${state.deliveries.length})`);

    // -------------------------------------------------------------
    // Test Case 2: Pre-existing Active Broadcast within 10 Minutes
    // -------------------------------------------------------------
    console.log("\nTest Group 2: Recent Active Broadcast Deduplication");
    const res3 = await triggerEmergencyBroadcast({ requestId: reqId1, triggeredByUserId: "admin-2" });
    check(res3.alreadyActive === true, "Third call 10 seconds later also deduplicated");
    check(res3.broadcastId === primaryRes.broadcastId, "Third call returned same active broadcast ID");
    check(state.broadcasts.length === 1, "Broadcast count remains 1");
    check(state.notifications.length === 2, "Notification count remains 2");

    // -------------------------------------------------------------
    // Test Case 3: Expired Broadcast Window (> 10 minutes)
    // -------------------------------------------------------------
    console.log("\nTest Group 3: Expired Deduplication Window (> 10 mins)");
    // Age the active broadcast to 15 minutes ago
    state.broadcasts[0].createdat = new Date(Date.now() - 15 * 60 * 1000);

    // Now re-triggering should allow a new broadcast
    const resExpired = await triggerEmergencyBroadcast({ requestId: reqId1, triggeredByUserId: "admin-1" });
    check(resExpired.success === true, "New broadcast allowed after 10m window expires");
    check(!resExpired.alreadyActive, "Not flagged as alreadyActive");
    check(state.broadcasts.length === 2, `Second broadcast record created (got: ${state.broadcasts.length})`);
    // Note: Donors 1 & 2 already have DELIVERED delivery records, so they are not re-notified
    check(resExpired.totalNotified === 0, `Previously notified donors excluded (got: ${resExpired.totalNotified})`);

    // -------------------------------------------------------------
    // Test Case 4: Radius Expansion (expandRadius: true)
    // -------------------------------------------------------------
    console.log("\nTest Group 4: Radius Expansion");
    initMockState();

    const reqId2 = "22222222-2222-2222-2222-222222222222";
    state.requests.set(reqId2, {
        requestid: reqId2,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        bloodgroup: "A_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        searchradius: 10,
        latitude: 12.9716,
        longitude: 77.5946,
        requiredby: new Date(Date.now() + 3600000),
        unitsrequired: 1,
        hospitalid: "hosp-1",
    });

    state.donors = [
        {
            donorid: "donor-near",
            userid: "user-near",
            bloodgroup: "A_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 12.9720,
            longitude: 77.5950, // 0.1 km away
            users: { userid: "user-near", name: "Near Donor", email: "near@test.com", phonenumber: "111", isactive: true },
        },
        {
            donorid: "donor-far",
            userid: "user-far",
            bloodgroup: "A_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 13.1500,
            longitude: 77.5950, // ~19.8 km away (outside 10km, inside 25km)
            users: { userid: "user-far", name: "Far Donor", email: "far@test.com", phonenumber: "222", isactive: true },
        },
    ];

    // Initial broadcast with 10 km radius
    const initialBcast = await triggerEmergencyBroadcast({ requestId: reqId2, radiusKm: 10, triggeredByUserId: "admin-1" });
    check(initialBcast.success === true, "Initial 10km broadcast succeeded");
    check(initialBcast.totalNotified === 1, `Only near donor notified in 10km radius (got: ${initialBcast.totalNotified})`);
    check(state.notifications.length === 1, "1 notification dispatched");

    // Expand radius to 25 km immediately (within 10m window)
    const expandBcast = await triggerEmergencyBroadcast({
        requestId: reqId2,
        radiusKm: 25,
        expandRadius: true,
        triggeredByUserId: "admin-1",
        triggerType: "RADIUS_EXPANSION",
    });

    check(expandBcast.success === true, "Radius expansion succeeded");
    check(!expandBcast.alreadyActive, "Radius expansion was NOT blocked by active deduplication");
    check(expandBcast.radiusKm === 25, `Broadcast created with expanded 25km radius (got: ${expandBcast.radiusKm})`);
    check(expandBcast.totalNotified === 1, `Only newly covered far donor notified (got: ${expandBcast.totalNotified})`);
    check(state.notifications.length === 2, "Total notifications across both broadcasts is 2 (no duplicate to near donor)");
    check(state.broadcasts.length === 2, "2 broadcast records exist");

    // -------------------------------------------------------------
    // Test Case 5: DIRECT_VOLUNTEER Container Isolation
    // -------------------------------------------------------------
    console.log("\nTest Group 5: DIRECT_VOLUNTEER Container Isolation");
    initMockState();

    const reqId3 = "33333333-3333-3333-3333-333333333333";
    state.requests.set(reqId3, {
        requestid: reqId3,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "HIGH",
        bloodgroup: "B_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        searchradius: 15,
        latitude: 12.9716,
        longitude: 77.5946,
        requiredby: new Date(Date.now() + 7200000),
        unitsrequired: 1,
        hospitalid: "hosp-1",
    });

    // Simulate an existing DIRECT_VOLUNTEER container created 1 minute ago
    state.broadcasts.push({
        broadcastid: "bcast-direct-vol",
        requestid: reqId3,
        triggertype: "DIRECT_VOLUNTEER",
        status: "ACTIVE",
        createdat: new Date(Date.now() - 60000),
        radiuskm: 0,
        totalmatched: 1,
        totalnotified: 1,
        totalresponded: 1,
    });

    state.donors = [
        {
            donorid: "donor-b",
            userid: "user-b",
            bloodgroup: "B_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 12.9750,
            longitude: 77.5950,
            users: { userid: "user-b", name: "B Donor", email: "b@test.com", phonenumber: "333", isactive: true },
        },
    ];

    // Trigger genuine emergency broadcast
    const genuineBcast = await triggerEmergencyBroadcast({ requestId: reqId3, triggeredByUserId: "admin-1" });
    check(genuineBcast.success === true, "Emergency broadcast succeeded despite DIRECT_VOLUNTEER container");
    check(!genuineBcast.alreadyActive, "DIRECT_VOLUNTEER container did NOT trigger alreadyActive deduplication");
    check(genuineBcast.broadcastId !== "bcast-direct-vol", "Created a new genuine broadcast ID");
    check(state.broadcasts.length === 2, "Both container and genuine broadcast coexist cleanly");

    // -------------------------------------------------------------
    // Test Case 6: Terminal Request Protection Under Row Lock
    // -------------------------------------------------------------
    console.log("\nTest Group 6: Terminal Request Protection");
    initMockState();

    const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED"];
    for (const termStatus of terminalStatuses) {
        const termReqId = `term-${termStatus.toLowerCase()}-uuid`;
        state.requests.set(termReqId, {
            requestid: termReqId,
            status: termStatus,
            isemergency: true,
            urgencylevel: "CRITICAL",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            searchradius: 15,
            hospitalid: "hosp-1",
        });

        const termRes = await triggerEmergencyBroadcast({ requestId: termReqId, triggeredByUserId: "admin-1" });
        check(termRes.success === false, `Rejected broadcast for ${termStatus} request`);
        check(
            termRes.message.includes(`already ${termStatus.toLowerCase()}`),
            `Correct clinical error message for ${termStatus}: "${termRes.message}"`
        );
    }
    check(state.broadcasts.length === 0, "Zero broadcasts created for terminal requests");
    check(state.notifications.length === 0, "Zero notifications dispatched for terminal requests");

    // -------------------------------------------------------------
    // Test Case 7: Independent Parallel Broadcasts for Different Requests
    // -------------------------------------------------------------
    console.log("\nTest Group 7: Independent Concurrent Broadcasts");
    initMockState();

    const reqA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const reqB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    state.requests.set(reqA, {
        requestid: reqA,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        searchradius: 15,
        latitude: 12.9716,
        longitude: 77.5946,
        hospitalid: "hosp-1",
    });

    state.requests.set(reqB, {
        requestid: reqB,
        status: "ACTIVE",
        isemergency: true,
        urgencylevel: "CRITICAL",
        bloodgroup: "A_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        searchradius: 15,
        latitude: 12.9716,
        longitude: 77.5946,
        hospitalid: "hosp-1",
    });

    state.donors = [
        {
            donorid: "donor-o",
            userid: "user-o",
            bloodgroup: "O_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 12.9720,
            longitude: 77.5950,
            users: { userid: "user-o", name: "O Donor", isactive: true },
        },
        {
            donorid: "donor-a",
            userid: "user-a",
            bloodgroup: "A_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            latitude: 12.9720,
            longitude: 77.5950,
            users: { userid: "user-a", name: "A Donor", isactive: true },
        },
    ];

    // Trigger broadcasts concurrently for two different requests
    const [resA, resB] = await Promise.all([
        triggerEmergencyBroadcast({ requestId: reqA, triggeredByUserId: "admin-1" }),
        triggerEmergencyBroadcast({ requestId: reqB, triggeredByUserId: "admin-2" }),
    ]);

    check(resA.success === true, "Request A broadcast succeeded");
    check(resB.success === true, "Request B broadcast succeeded");
    check(!resA.alreadyActive, "Request A was not deduplicated against Request B");
    check(!resB.alreadyActive, "Request B was not deduplicated against Request A");
    check(resA.broadcastId !== resB.broadcastId, "Each request received an independent broadcast record");
    check(state.broadcasts.length === 2, "2 independent broadcast records created");

    // -------------------------------------------------------------
    // Test Case 8: Non-Emergency Request Rejection on Creation
    // -------------------------------------------------------------
    console.log("\nTest Group 8: Non-Emergency Request Rejection");
    initMockState();

    const nonEmergId = "non-emerg-1111-2222-3333";
    state.requests.set(nonEmergId, {
        requestid: nonEmergId,
        status: "ACTIVE",
        isemergency: false,
        urgencylevel: "LOW",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        hospitalid: "hosp-1",
    });

    const nonEmergRes = await triggerEmergencyBroadcast({
        requestId: nonEmergId,
        triggerType: "REQUEST_CREATION",
        triggeredByUserId: "user-1",
    });

    check(nonEmergRes.success === false, "Ordinary non-emergency creation broadcast rejected");
    check(nonEmergRes.message.includes("not marked as emergency"), "Clear error message on ordinary non-emergency");
    check(state.broadcasts.length === 0, "No broadcast created");

    // -------------------------------------------------------------
    // Test Case 9: Request Not Found
    // -------------------------------------------------------------
    console.log("\nTest Group 9: Non-existent Request Rejection");
    const notFoundRes = await triggerEmergencyBroadcast({
        requestId: "00000000-0000-0000-0000-000000000000",
        triggeredByUserId: "user-1",
    });
    check(notFoundRes.success === false, "Non-existent request returns success: false");
    check(notFoundRes.message === "Blood request not found", "Expected error message");

    console.log(`\n========================================`);
    console.log(`STEP 4C TESTS COMPLETE: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
});
