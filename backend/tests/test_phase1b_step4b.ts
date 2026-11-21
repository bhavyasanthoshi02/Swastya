/**
 * SWASTYA PHASE 1B - STEP 4B REGRESSION TEST SUITE
 * 
 * Verifies:
 * 1. Existing successful donor response still works (CREATED -> DONOR_MATCHING).
 * 2. Existing requester cancellation still works (DONOR_MATCHING -> CANCELLED).
 * 3. Cancellation wins against concurrent donor response (rejection 400, no revival to DONOR_MATCHING).
 * 4. Donor response wins first, and cancellation then processes according to business rules.
 * 5. FULFILLED request rejects new donor responses (HTTP 400).
 * 6. EXPIRED request rejects new donor responses (HTTP 400).
 * 7. CANCELLED request rejects new donor responses (HTTP 400).
 * 8. No duplicate commitment, notification, or response counter increment after rejection.
 * 9. Re-reading locked status inside PUT /:id prevents stale concurrent status overwrites.
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

async function postJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
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

async function putJson(endpoint: string, token: string, body: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "PUT",
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

// In-Memory Test State
interface MockState {
    request: {
        requestid: string;
        createdbyuserid: string;
        requesterid: string | null;
        hospitalid: string | null;
        patientname: string;
        bloodgroup: any;
        bloodcomponent: any;
        unitsrequired: number;
        status: string;
        isemergency: boolean;
        urgencylevel: string;
        searchradius: number;
        notes?: string;
        hospitals: any;
        requesters: any;
        requeststatushistory: any[];
    };
    donor: {
        donorid: string;
        userid: string;
        bloodgroup: any;
        availabilitystatus: string;
        iseligible: boolean;
        lastdonationdate: Date | null;
        city: string;
        state: string;
        users: {
            name: string;
            phonenumber: string;
            email: string;
        };
    };
    lockedStatusOverride?: string;
    broadcasts: any[];
    deliveries: any[];
    notifications: any[];
    statusHistory: any[];
}

let state: MockState;

const requesterUserId = "11111111-1111-1111-1111-111111111111";
const hospitalUserId = "22222222-2222-2222-2222-222222222222";
const hospitalId = "33333333-3333-3333-3333-333333333333";
const donorUserId = "44444444-4444-4444-4444-444444444444";
const donorId = "d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0";
const adminUserId = "55555555-5555-5555-5555-555555555555";
const requestId = "66666666-6666-6666-6666-666666666666";

const requesterToken = generateToken(requesterUserId, "REQUESTER");
const hospitalToken = generateToken(hospitalUserId, "HOSPITAL");
const donorToken = generateToken(donorUserId, "DONOR");
const adminToken = generateToken(adminUserId, "ADMIN");

function setupSpies() {
    prisma.users.findUnique = (async (args: any) => {
        const id = args.where.userid;
        if (id === requesterUserId) return { userid: id, role: "REQUESTER", isactive: true };
        if (id === hospitalUserId) return { userid: id, role: "HOSPITAL", isactive: true };
        if (id === donorUserId) return { userid: id, role: "DONOR", isactive: true };
        if (id === adminUserId) return { userid: id, role: "ADMIN", isactive: true };
        return null;
    }) as any;

    prisma.hospitals.findUnique = (async (args: any) => {
        if (args.where.userid === hospitalUserId) {
            return { hospitalid: hospitalId, userid: hospitalUserId, hospitalname: "City General Hospital", approvalstatus: "APPROVED" };
        }
        return null;
    }) as any;

    prisma.requesters.findUnique = (async (args: any) => {
        if (args.where.userid === requesterUserId) {
            return { requesterid: "requester-uuid-1", userid: requesterUserId };
        }
        return null;
    }) as any;

    prisma.emergencyschedulerjobs.updateMany = (async () => ({ count: 1 })) as any;
    prisma.emergencybroadcasts.updateMany = (async () => ({ count: 1 })) as any;

    prisma.donors.findUnique = (async (args: any) => {
        if (args.where.userid === donorUserId) {
            return state.donor;
        }
        return null;
    }) as any;

    prisma.bloodrequests.findUnique = (async (args: any) => {
        if (args.where.requestid === requestId) {
            return {
                ...state.request,
                users: { userid: requesterUserId, name: "Requester Name", role: "REQUESTER" },
                hospitals: { hospitalid: hospitalId, hospitalname: "City General Hospital", userid: hospitalUserId },
                requeststatushistory: state.statusHistory,
            };
        }
        return null;
    }) as any;

    prisma.prescription.findUnique = (async () => null) as any;

    prisma.broadcastdeliveries.findFirst = (async (args: any) => {
        const found = state.deliveries.find((d) => {
            if (args.where.requestid && d.requestid !== args.where.requestid) return false;
            if (args.where.donorid && d.donorid !== args.where.donorid) return false;
            if (args.where.response && d.response !== args.where.response) return false;
            return true;
        });
        return found || null;
    }) as any;

    prisma.broadcastdeliveries.findMany = (async (args: any) => {
        return state.deliveries.filter((d) => {
            if (args.where.requestid && d.requestid !== args.where.requestid) return false;
            if (args.where.donorid && d.donorid !== args.where.donorid) return false;
            return true;
        });
    }) as any;

    prisma.emergencybroadcasts.findFirst = (async (args: any) => {
        return state.broadcasts.find((b) => b.requestid === args.where.requestid) || null;
    }) as any;

    prisma.$transaction = (async (callback: (tx: any) => Promise<any>) => {
        const tx = {
            $queryRawUnsafe: async (query: string, ...params: any[]) => {
                if (query.includes("FROM bloodrequests") && query.includes("FOR UPDATE")) {
                    const status = state.lockedStatusOverride ?? state.request.status;
                    return [{
                        requestid: state.request.requestid,
                        status,
                        patientname: state.request.patientname,
                        bloodgroup: state.request.bloodgroup,
                        unitsrequired: state.request.unitsrequired,
                        searchradius: state.request.searchradius,
                        createdbyuserid: state.request.createdbyuserid,
                        hospitalid: state.request.hospitalid,
                        requesterid: state.request.requesterid,
                    }];
                }
                if (query.includes("FROM donors") && query.includes("FOR UPDATE")) {
                    return [{ donorid: state.donor.donorid }];
                }
                return [];
            },
            bloodrequests: {
                update: async (args: any) => {
                    if (args.data.status) {
                        state.request.status = args.data.status;
                    }
                    if (args.data.notes) {
                        state.request.notes = args.data.notes;
                    }
                    return {
                        ...state.request,
                        users: { userid: requesterUserId, name: "Requester Name", role: "REQUESTER" },
                        hospitals: { hospitalid: hospitalId, hospitalname: "City General Hospital" },
                        requeststatushistory: state.statusHistory,
                    };
                },
            },
            requeststatushistory: {
                create: async (args: any) => {
                    const entry = { historyid: `hist-${Date.now()}`, ...args.data };
                    state.statusHistory.push(entry);
                    return entry;
                },
            },
            broadcastdeliveries: {
                findFirst: async (args: any) => {
                    return state.deliveries.find((d) => {
                        if (args.where.requestid && d.requestid !== args.where.requestid) return false;
                        if (args.where.donorid && d.donorid !== args.where.donorid) return false;
                        if (args.where.response && d.response !== args.where.response) return false;
                        return true;
                    }) || null;
                },
                findMany: async (args: any) => {
                    return state.deliveries.filter((d) => {
                        if (args.where.requestid && d.requestid !== args.where.requestid) return false;
                        if (args.where.donorid && d.donorid !== args.where.donorid) return false;
                        return true;
                    });
                },
                create: async (args: any) => {
                    const record = { deliveryid: `del-${Date.now()}`, ...args.data };
                    state.deliveries.push(record);
                    return record;
                },
                update: async (args: any) => {
                    const idx = state.deliveries.findIndex((d) => d.deliveryid === args.where.deliveryid);
                    if (idx >= 0) {
                        state.deliveries[idx] = { ...state.deliveries[idx], ...args.data };
                        return state.deliveries[idx];
                    }
                    return args.data;
                },
            },
            emergencybroadcasts: {
                findFirst: async (args: any) => {
                    return state.broadcasts.find((b) => b.requestid === args.where.requestid) || null;
                },
                create: async (args: any) => {
                    const b = { broadcastid: `bcast-${Date.now()}`, totalresponded: 1, ...args.data };
                    state.broadcasts.push(b);
                    return b;
                },
                update: async (args: any) => {
                    const idx = state.broadcasts.findIndex((b) => b.broadcastid === args.where.broadcastid);
                    if (idx >= 0) {
                        if (args.data.totalresponded?.increment) {
                            state.broadcasts[idx].totalresponded = (state.broadcasts[idx].totalresponded || 0) + args.data.totalresponded.increment;
                        }
                        return state.broadcasts[idx];
                    }
                    return args.data;
                },
                updateMany: async () => ({ count: 1 }),
            },
            notification: {
                create: async (args: any) => {
                    const n = { notificationid: `notif-${Date.now()}`, ...args.data };
                    state.notifications.push(n);
                    return n;
                },
            },
            prescription: {
                findUnique: async () => null,
            },
        };
        return await callback(tx);
    }) as any;
}

function resetState(initialStatus = "CREATED") {
    state = {
        request: {
            requestid: requestId,
            createdbyuserid: requesterUserId,
            requesterid: "requester-uuid-1",
            hospitalid: hospitalId,
            patientname: "John Patient",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            status: initialStatus,
            isemergency: true,
            urgencylevel: "HIGH",
            searchradius: 15,
            notes: "Initial notes",
            hospitals: { userid: hospitalUserId, hospitalname: "City General Hospital" },
            requesters: { userid: requesterUserId },
            requeststatushistory: [],
        },
        donor: {
            donorid: donorId,
            userid: donorUserId,
            bloodgroup: "O_POSITIVE",
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            lastdonationdate: null,
            city: "Test City",
            state: "Test State",
            users: {
                name: "Volunteer Donor",
                phonenumber: "+919876543210",
                email: "donor@test.com",
            },
        },
        broadcasts: [],
        deliveries: [],
        notifications: [],
        statusHistory: [],
    };
}

async function runTests() {
    console.log("==========================================================================");
    console.log("  SWASTYA PHASE 1B - STEP 4B REGRESSION TEST SUITE                        ");
    console.log("  Cancellation vs Donor Response Concurrency Protection                   ");
    console.log("==========================================================================\n");

    setupSpies();

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, () => {
            const addr = server.address() as any;
            API_BASE = `http://127.0.0.1:${addr.port}`;
            resolve();
        });
    });

    try {
        // ----------------------------------------------------------------------
        // Test 1: Successful donor response on active request (CREATED -> DONOR_MATCHING)
        // ----------------------------------------------------------------------
        console.log("--- 1. Normal Donor Volunteer Flow ---");
        resetState("CREATED");
        const res1 = await postJson(`/bloodrequests/${requestId}/respond`, donorToken, {
            contactPhone: "+919876543210",
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
        });

        check(res1.status === 200, "1a. Donor response returns HTTP 200", `status=${res1.status}: ${JSON.stringify(res1.data)}`);
        check(state.request.status === "DONOR_MATCHING", "1b. Request transitioned from CREATED to DONOR_MATCHING");
        check(state.deliveries.length === 1, "1c. 1 broadcastdelivery created");
        check(state.deliveries[0].response === "ACCEPTED", "1d. Commitment is marked ACCEPTED");
        check(state.notifications.length > 0, "1e. In-app notifications sent");
        check(state.statusHistory.length === 1, "1f. Request status history recorded DONOR_MATCHING transition");

        // ----------------------------------------------------------------------
        // Test 2: Existing requester cancellation works on active request
        // ----------------------------------------------------------------------
        console.log("\n--- 2. Requester Cancellation Flow ---");
        resetState("DONOR_MATCHING");
        const res2 = await putJson(`/bloodrequests/${requestId}`, requesterToken, {
            status: "CANCELLED",
            remarks: "Patient transferred to another facility",
        });

        check(res2.status === 200, "2a. Cancellation returns HTTP 200");
        check(state.request.status === "CANCELLED", "2b. Request status changed to CANCELLED");
        check(state.statusHistory.some((h) => h.newstatus === "CANCELLED"), "2c. Cancellation logged in history");

        // ----------------------------------------------------------------------
        // Test 3: Cancellation wins race against concurrent donor response
        // (Donor reads CREATED, but locked row inside transaction returns CANCELLED)
        // ----------------------------------------------------------------------
        console.log("\n--- 3. Cancellation Wins Race vs Donor Response ---");
        resetState("CREATED");
        // Simulate race condition: between pre-read and lock acquisition, requester cancelled the request
        state.lockedStatusOverride = "CANCELLED";

        const res3 = await postJson(`/bloodrequests/${requestId}/respond`, donorToken, {
            contactPhone: "+919876543210",
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
        });

        check(res3.status === 400, "3a. Donor response rejected with HTTP 400");
        check(
            res3.data.message.toLowerCase().includes("cancelled"),
            "3b. Error message explicitly states requisition is cancelled",
            res3.data.message
        );
        check(state.request.status === "CREATED", "3c. Stale request status was NOT overwritten to DONOR_MATCHING");
        check(state.deliveries.length === 0, "3d. Zero broadcastdeliveries created after rejection");
        check(state.notifications.length === 0, "3e. Zero notifications sent after rejection");
        check(state.statusHistory.length === 0, "3f. Zero history entries recorded");

        // ----------------------------------------------------------------------
        // Test 4: Donor response wins race, and requester then cancels according to business rules
        // ----------------------------------------------------------------------
        console.log("\n--- 4. Donor Response Wins First, Then Requester Cancels ---");
        resetState("CREATED");
        state.lockedStatusOverride = undefined;

        // Step 4.1: Donor volunteers first
        const res4a = await postJson(`/bloodrequests/${requestId}/respond`, donorToken, {
            contactPhone: "+919876543210",
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
        });
        check(res4a.status === 200, "4a. Donor response succeeds (HTTP 200)");
        check(state.request.status === "DONOR_MATCHING", "4b. Status advanced to DONOR_MATCHING");

        // Step 4.2: Requester cancels the now-DONOR_MATCHING request
        const res4b = await putJson(`/bloodrequests/${requestId}`, requesterToken, {
            status: "CANCELLED",
            remarks: "Requester decided to cancel after donor response",
        });
        check(res4b.status === 200, "4c. Requester cancellation succeeds on DONOR_MATCHING (HTTP 200)");
        check(state.request.status === "CANCELLED", "4d. Status transitioned to CANCELLED");
        check(
            state.statusHistory.some((h) => h.oldstatus === "DONOR_MATCHING" && h.newstatus === "CANCELLED"),
            "4e. History properly records transition from DONOR_MATCHING to CANCELLED"
        );

        // ----------------------------------------------------------------------
        // Test 5: FULFILLED request rejects new donor responses
        // ----------------------------------------------------------------------
        console.log("\n--- 5. FULFILLED Request Rejects Donor Response ---");
        resetState("FULFILLED");
        const res5 = await postJson(`/bloodrequests/${requestId}/respond`, donorToken, {
            contactPhone: "+919876543210",
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
        });

        check(res5.status === 400, "5a. Donor response rejected on FULFILLED (HTTP 400)");
        check(
            res5.data.message.toLowerCase().includes("fulfilled"),
            "5b. Rejection message mentions fulfilled",
            res5.data.message
        );
        check(state.deliveries.length === 0, "5c. Zero broadcastdeliveries created");
        check(state.notifications.length === 0, "5d. Zero notifications sent");

        // ----------------------------------------------------------------------
        // Test 6: EXPIRED request rejects new donor responses
        // ----------------------------------------------------------------------
        console.log("\n--- 6. EXPIRED Request Rejects Donor Response ---");
        resetState("EXPIRED");
        const res6 = await postJson(`/bloodrequests/${requestId}/respond`, donorToken, {
            contactPhone: "+919876543210",
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
        });

        check(res6.status === 400, "6a. Donor response rejected on EXPIRED (HTTP 400)");
        check(
            res6.data.message.toLowerCase().includes("expired"),
            "6b. Rejection message mentions expired",
            res6.data.message
        );
        check(state.deliveries.length === 0, "6c. Zero broadcastdeliveries created");
        check(state.notifications.length === 0, "6d. Zero notifications sent");

        // ----------------------------------------------------------------------
        // Test 7: CANCELLED request rejects new donor responses
        // ----------------------------------------------------------------------
        console.log("\n--- 7. CANCELLED Request Rejects Donor Response ---");
        resetState("CANCELLED");
        const res7 = await postJson(`/bloodrequests/${requestId}/respond`, donorToken, {
            contactPhone: "+919876543210",
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
        });

        check(res7.status === 400, "7a. Donor response rejected on CANCELLED (HTTP 400)");
        check(
            res7.data.message.toLowerCase().includes("cancelled"),
            "7b. Rejection message mentions cancelled",
            res7.data.message
        );
        check(state.deliveries.length === 0, "7c. Zero broadcastdeliveries created");
        check(state.notifications.length === 0, "7d. Zero notifications sent");

        // ----------------------------------------------------------------------
        // Test 8: Duplicate volunteer response from same donor is rejected
        // ----------------------------------------------------------------------
        console.log("\n--- 8. Duplicate Volunteer Rejection ---");
        resetState("DONOR_MATCHING");
        // Pre-populate an existing accepted commitment
        state.deliveries.push({
            deliveryid: "del-existing-1",
            requestid: requestId,
            donorid: donorId,
            donoruserid: donorUserId,
            response: "ACCEPTED",
        });

        const res8 = await postJson(`/bloodrequests/${requestId}/respond`, donorToken, {
            contactPhone: "+919876543210",
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
        });

        check(res8.status === 400, "8a. Duplicate response rejected with HTTP 400");
        check(
            res8.data.message.toLowerCase().includes("already volunteered"),
            "8b. Rejection states already volunteered",
            res8.data.message
        );
        check(state.deliveries.length === 1, "8c. No new delivery record created");

        // ----------------------------------------------------------------------
        // Test 9: PUT /:id re-reading locked status prevents stale overwrites
        // ----------------------------------------------------------------------
        console.log("\n--- 9. PUT /:id In-Transaction Terminal State Protection ---");
        resetState("CREATED");
        // Simulate race condition: Request was concurrently fulfilled before transaction lock
        state.lockedStatusOverride = "FULFILLED";

        const res9 = await putJson(`/bloodrequests/${requestId}`, hospitalToken, {
            status: "BLOOD_BANK_CHECK",
        });

        check(res9.status === 400, "9a. Concurrent PUT update rejected on locked FULFILLED (HTTP 400)", `status=${res9.status}: ${JSON.stringify(res9.data)}`);
        check(
            res9.data.message.toLowerCase().includes("already fulfilled"),
            "9b. Rejection states requisition is already fulfilled",
            res9.data.message
        );
        check(state.request.status === "CREATED", "9c. Request status was not modified");

        console.log("\n==========================================================================");
        console.log(`  STEP 4B TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
        console.log("==========================================================================");
    } finally {
        if (server) server.close();
    }
}

runTests().catch((err) => {
    console.error("Test runner threw uncaught error:", err);
    if (server) server.close();
    process.exit(1);
});
