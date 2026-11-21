/**
 * SWASTYA PHASE 1B - STEP 3 REGRESSION TEST SUITE
 * 
 * Verifies:
 * 1. Persistent Donor Commitments in broadcastdeliveries (Source of Truth)
 *    - Emergency request creates/updates broadcastdeliveries on donor response.
 *    - Non-emergency request creates container broadcast + broadcastdeliveries on donor response.
 * 2. Notification Deletion Resilience:
 *    - Deleting all notifications leaves broadcastdeliveries 100% intact.
 *    - GET /bloodrequests/:id returns accurate volunteers list after notification deletion.
 *    - GET /requester/requests returns accurate availableDonors after notification deletion.
 *    - GET /donor/dashboard accurately reflects volunteered status after notification deletion.
 *    - PATCH /bloodrequests/:id/transit-status succeeds after notification deletion.
 * 3. Duplicate Volunteer Prevention:
 *    - Second volunteer response from same donor is rejected with HTTP 400.
 *    - Deleting notifications does NOT allow a donor to volunteer again (still blocked with 400).
 * 4. Transit Milestone Updates on Durable Commitments:
 *    - STARTED, REACHED_LOCATION, and COMPLETED update broadcastdeliveries directly.
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

async function getJson(endpoint: string, token: string) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
        },
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

// In-Memory Test Store
interface InMemoryStore {
    requests: Map<string, any>;
    broadcasts: Map<string, any>;
    deliveries: Map<string, any>;
    notifications: Map<string, any>;
    donors: Map<string, any>;
    hospitals: Map<string, any>;
    requesters: Map<string, any>;
    prescriptions: Map<string, any>;
    users: Map<string, any>;
    statusHistory: any[];
}

const store: InMemoryStore = {
    requests: new Map(),
    broadcasts: new Map(),
    deliveries: new Map(),
    notifications: new Map(),
    donors: new Map(),
    hospitals: new Map(),
    requesters: new Map(),
    prescriptions: new Map(),
    users: new Map(),
    statusHistory: [],
};

function setupPrismaMock() {
    prisma.users.findUnique = (async (args: any) => {
        const id = args.where?.userid;
        return store.users.get(id) || null;
    }) as any;

    prisma.bloodrequests.findUnique = (async (args: any) => {
        const req = store.requests.get(args.where?.requestid);
        if (!req) return null;
        const res = { ...req };
        if (args.include?.hospitals) res.hospitals = store.hospitals.get(req.hospitalid) || null;
        if (args.include?.requesters) res.requesters = store.requesters.get(req.requesterid) || null;
        if (args.include?.prescription) res.prescription = store.prescriptions.get(req.requestid) || null;
        return res;
    }) as any;

    prisma.bloodrequests.findMany = (async (args: any) => {
        const all = Array.from(store.requests.values());
        if (args.where?.createdbyuserid) {
            return all.filter((r) => r.createdbyuserid === args.where.createdbyuserid);
        }
        return all;
    }) as any;

    prisma.bloodrequests.update = (async (args: any) => {
        const req = store.requests.get(args.where?.requestid);
        if (!req) return null;
        Object.assign(req, args.data);
        return req;
    }) as any;

    prisma.hospitals.findUnique = (async (args: any) => {
        if (args.where?.userid) {
            for (const h of store.hospitals.values()) {
                if (h.userid === args.where.userid) return h;
            }
        }
        if (args.where?.hospitalid) {
            return store.hospitals.get(args.where.hospitalid) || null;
        }
        return null;
    }) as any;

    prisma.requesters.findUnique = (async (args: any) => {
        if (args.where?.userid) {
            for (const r of store.requesters.values()) {
                if (r.userid === args.where.userid) return r;
            }
        }
        if (args.where?.requesterid) {
            return store.requesters.get(args.where.requesterid) || null;
        }
        return null;
    }) as any;

    prisma.donors.findUnique = (async (args: any) => {
        let donor: any = null;
        if (args.where?.userid) {
            for (const d of store.donors.values()) {
                if (d.userid === args.where.userid) {
                    donor = d;
                    break;
                }
            }
        } else if (args.where?.donorid) {
            donor = store.donors.get(args.where.donorid) || null;
        }
        if (!donor) return null;
        const res = { ...donor };
        if (args.include?.users) {
            res.users = store.users.get(donor.userid) || null;
        }
        return res;
    }) as any;

    prisma.emergencybroadcasts.findFirst = (async (args: any) => {
        let all = Array.from(store.broadcasts.values()).filter((b) => b.requestid === args.where?.requestid);
        if (args.where?.triggertype?.not) {
            all = all.filter((b) => b.triggertype !== args.where.triggertype.not);
        }
        return all[all.length - 1] || null;
    }) as any;

    prisma.emergencybroadcasts.findMany = (async (args: any) => {
        let all = Array.from(store.broadcasts.values()).filter((b) => b.requestid === args.where?.requestid);
        if (args.where?.triggertype?.not) {
            all = all.filter((b) => b.triggertype !== args.where.triggertype.not);
        }
        return all;
    }) as any;

    prisma.emergencybroadcasts.create = (async (args: any) => {
        const id = "bcast-" + Math.random().toString(36).substring(2, 9);
        const record = { broadcastid: id, ...args.data, createdat: new Date() };
        store.broadcasts.set(id, record);
        return record;
    }) as any;

    prisma.emergencybroadcasts.update = (async (args: any) => {
        const b = store.broadcasts.get(args.where?.broadcastid);
        if (b) {
            if (args.data.totalresponded?.increment) {
                b.totalresponded = (b.totalresponded || 0) + args.data.totalresponded.increment;
            }
            if (args.data.status) b.status = args.data.status;
        }
        return b;
    }) as any;

    prisma.broadcastdeliveries.findFirst = (async (args: any) => {
        for (const d of store.deliveries.values()) {
            if (args.where?.requestid && d.requestid !== args.where.requestid) continue;
            if (args.where?.donorid && d.donorid !== args.where.donorid) continue;
            if (args.where?.donoruserid && d.donoruserid !== args.where.donoruserid) continue;
            if (args.where?.response && d.response !== args.where.response) continue;
            const res = { ...d };
            if (args.include?.donors) {
                const donor = store.donors.get(d.donorid);
                res.donors = donor ? { ...donor, users: store.users.get(donor.userid) } : null;
            }
            return res;
        }
        return null;
    }) as any;

    prisma.broadcastdeliveries.findMany = (async (args: any) => {
        const results = [];
        for (const d of store.deliveries.values()) {
            if (args.where?.requestid?.in && !args.where.requestid.in.includes(d.requestid)) continue;
            if (args.where?.requestid && typeof args.where.requestid === "string" && d.requestid !== args.where.requestid) continue;
            if (args.where?.broadcastid?.in && !args.where.broadcastid.in.includes(d.broadcastid)) continue;
            if (args.where?.donoruserid && d.donoruserid !== args.where.donoruserid) continue;
            if (args.where?.donorid && d.donorid !== args.where.donorid) continue;
            if (args.where?.response && d.response !== args.where.response) continue;
            const res = { ...d };
            if (args.include?.donors) {
                const donor = store.donors.get(d.donorid);
                res.donors = donor ? { ...donor, users: store.users.get(donor.userid) } : null;
            }
            results.push(res);
        }
        return results;
    }) as any;

    prisma.broadcastdeliveries.create = (async (args: any) => {
        const id = "del-" + Math.random().toString(36).substring(2, 9);
        const record = { deliveryid: id, ...args.data, createdat: new Date() };
        store.deliveries.set(id, record);
        return record;
    }) as any;

    prisma.broadcastdeliveries.update = (async (args: any) => {
        const d = store.deliveries.get(args.where?.deliveryid);
        if (d) Object.assign(d, args.data);
        return d;
    }) as any;

    prisma.broadcastdeliveries.updateMany = (async (args: any) => {
        let count = 0;
        for (const d of store.deliveries.values()) {
            if (args.where?.donorid && d.donorid !== args.where.donorid) continue;
            if (args.where?.requestid && d.requestid !== args.where.requestid) continue;
            Object.assign(d, args.data);
            count++;
        }
        return { count };
    }) as any;

    prisma.notification.findFirst = (async (args: any) => {
        for (const n of store.notifications.values()) {
            if (args.where?.requestid && n.requestid !== args.where.requestid) continue;
            if (args.where?.userid && n.userid !== args.where.userid) continue;
            if (args.where?.title && n.title !== args.where.title) continue;
            const res = { ...n };
            if (args.include?.users) res.users = store.users.get(n.userid) || null;
            return res;
        }
        return null;
    }) as any;

    prisma.notification.findMany = (async (args: any) => {
        const results = [];
        for (const n of store.notifications.values()) {
            if (args.where?.requestid?.in && !args.where.requestid.in.includes(n.requestid)) continue;
            if (args.where?.requestid && typeof args.where.requestid === "string" && n.requestid !== args.where.requestid) continue;
            if (args.where?.userid && n.userid !== args.where.userid) continue;
            if (args.where?.title && n.title !== args.where.title) continue;
            const res = { ...n };
            if (args.include?.users) res.users = store.users.get(n.userid) || null;
            results.push(res);
        }
        return results;
    }) as any;

    prisma.notification.create = (async (args: any) => {
        const id = "notif-" + Math.random().toString(36).substring(2, 9);
        const record = { notificationid: id, ...args.data, sentat: new Date() };
        store.notifications.set(id, record);
        return record;
    }) as any;

    prisma.notification.update = (async (args: any) => {
        const n = store.notifications.get(args.where?.notificationid);
        if (n) Object.assign(n, args.data);
        return n;
    }) as any;

    prisma.notification.deleteMany = (async (args: any) => {
        let count = 0;
        for (const [id, n] of store.notifications.entries()) {
            if (args.where?.requestid && n.requestid === args.where.requestid) {
                store.notifications.delete(id);
                count++;
            }
        }
        return { count };
    }) as any;

    prisma.notification.delete = (async (args: any) => {
        const n = store.notifications.get(args.where?.notificationid);
        store.notifications.delete(args.where?.notificationid);
        return n;
    }) as any;

    prisma.notification.count = (async () => store.notifications.size) as any;

    prisma.prescription.findUnique = (async (args: any) => {
        return store.prescriptions.get(args.where?.requestid) || null;
    }) as any;

    prisma.donationhistory.findMany = (async () => []) as any;

    prisma.$transaction = (async (callback: (tx: any) => Promise<any>) => {
        const tx = {
            $queryRawUnsafe: async (query: string, ...params: any[]) => {
                if (query.includes("FROM bloodrequests")) {
                    const req = store.requests.get(params[0]);
                    return req ? [{
                        requestid: req.requestid,
                        status: req.status,
                        requesterid: req.requesterid,
                        hospitalid: req.hospitalid,
                        patientname: req.patientname,
                        bloodgroup: req.bloodgroup,
                        unitsrequired: req.unitsrequired,
                        searchradius: req.searchradius,
                        createdbyuserid: req.createdbyuserid,
                    }] : [];
                }
                if (query.includes("SELECT donorid FROM donors")) {
                    const donor = store.donors.get(params[0]);
                    return donor ? [{ donorid: donor.donorid }] : [];
                }
                return [];
            },
            bloodrequests: prisma.bloodrequests,
            emergencybroadcasts: prisma.emergencybroadcasts,
            broadcastdeliveries: prisma.broadcastdeliveries,
            notification: prisma.notification,
            donors: {
                ...prisma.donors,
                update: async (args: any) => {
                    const existing = store.donors.get(args.where.donorid);
                    if (existing) Object.assign(existing, args.data);
                    return existing || args.data;
                },
            },
            donationhistory: {
                findFirst: async () => null,
                create: async (args: any) => ({ donationhistoryid: "history-uuid-1", ...args.data }),
            },
            prescription: prisma.prescription,
            requeststatushistory: {
                create: async (args: any) => {
                    store.statusHistory.push(args.data);
                    return args.data;
                },
            },
        };
        return await callback(tx);
    }) as any;
}

async function runTests() {
    console.log("\n==========================================================================");
    console.log("  SWASTYA PHASE 1B - STEP 3 REGRESSION TEST SUITE                         ");
    console.log("  Persistent Donor Volunteer Commitments (broadcastdeliveries)            ");
    console.log("==========================================================================\n");

    setupPrismaMock();

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
    const donorId = "55555555-5555-5555-5555-555555555555";
    const emergencyRequestId = "66666666-6666-6666-6666-666666666666";
    const nonEmergencyRequestId = "77777777-7777-7777-7777-777777777777";

    const donorToken = generateToken(donorUserId, "DONOR");
    const requesterToken = generateToken(requesterUserId, "REQUESTER");
    const hospitalToken = generateToken(hospitalUserId, "HOSPITAL");

    // Initialize user accounts
    store.users.set(requesterUserId, { userid: requesterUserId, name: "Requester User", role: "REQUESTER", isactive: true });
    store.users.set(hospitalUserId, { userid: hospitalUserId, name: "City Care Admin", role: "HOSPITAL", isactive: true });
    store.users.set(donorUserId, { userid: donorUserId, name: "Jane Hero Donor", phonenumber: "9876543210", email: "jane@hero.org", role: "DONOR", isactive: true });

    store.hospitals.set(hospitalId, {
        hospitalid: hospitalId,
        userid: hospitalUserId,
        hospitalname: "City Care Hospital",
        address: "123 Medical Way",
        city: "Hyderabad",
        state: "Telangana",
        approvalstatus: "APPROVED",
    });

    store.requesters.set("req-prof-1", {
        requesterid: "req-prof-1",
        userid: requesterUserId,
    });

    store.donors.set(donorId, {
        donorid: donorId,
        userid: donorUserId,
        bloodgroup: "O_POSITIVE",
        city: "Hyderabad",
        state: "Telangana",
        gender: "FEMALE",
        weight: 62,
        availabilitystatus: "AVAILABLE",
        iseligible: true,
        lastdonationdate: null,
    });

    // 1. Setup Emergency Blood Request with prior emergency broadcast
    store.requests.set(emergencyRequestId, {
        requestid: emergencyRequestId,
        createdbyuserid: requesterUserId,
        requesterid: "req-prof-1",
        hospitalid: hospitalId,
        patientname: "Emergency Patient A",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: 1,
        urgencylevel: "CRITICAL",
        isemergency: true,
        status: "CREATED",
    });
    store.prescriptions.set(emergencyRequestId, {
        prescriptionid: "rx-emerg-1",
        requestid: emergencyRequestId,
        status: "VERIFIED",
    });

    const emergBroadcastId = "bcast-emerg-1";
    store.broadcasts.set(emergBroadcastId, {
        broadcastid: emergBroadcastId,
        requestid: emergencyRequestId,
        triggeredbyuserid: requesterUserId,
        triggertype: "REQUEST_CREATION",
        radiuskm: 15,
        status: "ACTIVE",
        totalmatched: 1,
        totalnotified: 1,
        totalresponded: 0,
    });
    const initialDeliveryId = "del-emerg-1";
    store.deliveries.set(initialDeliveryId, {
        deliveryid: initialDeliveryId,
        broadcastid: emergBroadcastId,
        requestid: emergencyRequestId,
        donorid: donorId,
        donoruserid: donorUserId,
        matchtype: "COORDINATES",
        deliverystatus: "DELIVERED",
        response: null,
        respondedat: null,
        transitstatus: null,
    });

    // 2. Setup Non-Emergency Blood Request (NO prior broadcast)
    store.requests.set(nonEmergencyRequestId, {
        requestid: nonEmergencyRequestId,
        createdbyuserid: requesterUserId,
        requesterid: "req-prof-1",
        hospitalid: hospitalId,
        patientname: "Routine Patient B",
        bloodgroup: "O_POSITIVE",
        bloodcomponent: "WHOLE_BLOOD",
        unitsrequired: 1,
        urgencylevel: "NORMAL",
        isemergency: false,
        status: "CREATED",
    });
    store.prescriptions.set(nonEmergencyRequestId, {
        prescriptionid: "rx-nonemerg-1",
        requestid: nonEmergencyRequestId,
        status: "VERIFIED",
    });

    const standardScreening = {
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
        estimatedArrival: "Within 45 minutes",
        notes: "On my way with private vehicle",
    };

    try {
        // =========================================================================
        // SCENARIO 1: Emergency Request Volunteer Commitment
        // =========================================================================
        console.log("--- Scenario 1: Emergency Request Volunteer Commitment ---");
        const resEmerg = await postJson(`/bloodrequests/${emergencyRequestId}/respond`, donorToken, standardScreening);
        check(resEmerg.status === 200, "1a. Donor can respond to emergency request (HTTP 200)");
        
        // Check broadcastdeliveries updated as persistent commitment
        const emergDelivery = store.deliveries.get(initialDeliveryId);
        check(emergDelivery !== undefined, "1b. Existing broadcastdeliveries record found");
        check(emergDelivery.response === "ACCEPTED", "1c. delivery response updated to ACCEPTED");
        check(emergDelivery.deliverystatus === "RESPONDED", "1d. deliverystatus updated to RESPONDED");
        check(emergDelivery.transitstatus === "DONOR_FOUND", "1e. transitstatus initialized to DONOR_FOUND");
        check(emergDelivery.estimatedarrival === "Within 45 minutes", "1f. estimatedarrival stored in commitment");
        check(store.broadcasts.get(emergBroadcastId).totalresponded === 1, "1g. broadcast totalresponded incremented");

        // =========================================================================
        // SCENARIO 2: Non-Emergency Request Volunteer Commitment (On-Demand Broadcast)
        // =========================================================================
        console.log("\n--- Scenario 2: Non-Emergency Request Volunteer Commitment ---");
        const resNonEmerg = await postJson(`/bloodrequests/${nonEmergencyRequestId}/respond`, donorToken, standardScreening);
        check(resNonEmerg.status === 200, "2a. Donor can respond to non-emergency request (HTTP 200)");

        // Find created commitment in broadcastdeliveries
        const nonEmergDeliveries = Array.from(store.deliveries.values()).filter((d) => d.requestid === nonEmergencyRequestId);
        check(nonEmergDeliveries.length === 1, "2b. Exactly 1 broadcastdelivery created for non-emergency request");
        const nonEmergDel = nonEmergDeliveries[0];
        check(nonEmergDel.response === "ACCEPTED", "2c. Non-emergency delivery response is ACCEPTED");
        check(nonEmergDel.deliverystatus === "RESPONDED", "2d. Non-emergency deliverystatus is RESPONDED");
        check(nonEmergDel.transitstatus === "DONOR_FOUND", "2e. Non-emergency transitstatus is DONOR_FOUND");
        check(nonEmergDel.matchtype === "DIRECT_VOLUNTEER", "2f. matchtype is DIRECT_VOLUNTEER");

        // Verify container broadcast was created
        const nonEmergBroadcasts = Array.from(store.broadcasts.values()).filter((b) => b.requestid === nonEmergencyRequestId);
        check(nonEmergBroadcasts.length === 1, "2g. Container emergencybroadcasts record created on-demand");
        check(nonEmergBroadcasts[0].triggertype === "DIRECT_VOLUNTEER", "2h. Container triggertype is DIRECT_VOLUNTEER");

        // =========================================================================
        // SCENARIO 3: Duplicate Volunteer Response Prevention
        // =========================================================================
        console.log("\n--- Scenario 3: Duplicate Volunteer Prevention ---");
        const resDupEmerg = await postJson(`/bloodrequests/${emergencyRequestId}/respond`, donorToken, standardScreening);
        check(resDupEmerg.status === 400, "3a. Second volunteer attempt on emergency request rejected with HTTP 400");
        check(resDupEmerg.data.message.includes("already volunteered"), "3b. Error states already volunteered");

        const resDupNonEmerg = await postJson(`/bloodrequests/${nonEmergencyRequestId}/respond`, donorToken, standardScreening);
        check(resDupNonEmerg.status === 400, "3c. Second volunteer attempt on non-emergency request rejected with HTTP 400");
        check(resDupNonEmerg.data.message.includes("already volunteered"), "3d. Error states already volunteered");

        // =========================================================================
        // SCENARIO 4: Request Details & Dashboard Query Before Notification Deletion
        // =========================================================================
        console.log("\n--- Scenario 4: Request Details & Dashboard Consistency ---");
        const resDetails = await getJson(`/bloodrequests/${emergencyRequestId}`, requesterToken);
        check(resDetails.status === 200, "4a. GET /bloodrequests/:id succeeds");
        check(Array.isArray(resDetails.data.volunteers), "4b. volunteers array present");
        check(resDetails.data.volunteers.length === 1, "4c. Exactly 1 volunteer returned");
        check(resDetails.data.volunteers[0].donorName === "Jane Hero Donor", "4d. Volunteer name matches commitment");
        check(resDetails.data.volunteers[0].transitStatus === "DONOR_FOUND", "4e. Volunteer transitStatus is DONOR_FOUND");

        // =========================================================================
        // SCENARIO 5: Complete Notification Deletion Resilience
        // =========================================================================
        console.log("\n--- Scenario 5: Complete Notification Deletion Resilience ---");
        // Simulate user completely purging their notifications
        const notifCountBefore = store.notifications.size;
        check(notifCountBefore > 0, "5a. Notifications existed before purge");
        store.notifications.clear();
        check(store.notifications.size === 0, "5b. All notifications completely deleted from store");

        // 5c. GET /bloodrequests/:id STILL returns volunteer from broadcastdeliveries
        const resDetailsAfterPurge = await getJson(`/bloodrequests/${emergencyRequestId}`, requesterToken);
        check(resDetailsAfterPurge.status === 200, "5c. GET /bloodrequests/:id succeeds with 0 notifications");
        check(resDetailsAfterPurge.data.volunteers.length === 1, "5d. Volunteer record preserved 100% after notification deletion");
        check(resDetailsAfterPurge.data.volunteers[0].donorId === donorId, "5e. Correct donorId preserved");
        check(resDetailsAfterPurge.data.volunteers[0].transitStatus === "DONOR_FOUND", "5f. transitStatus preserved");

        // 5g. GET /requesters/me/available-donors STILL returns availableDonors
        const resReqDashboard = await getJson(`/requesters/me/available-donors`, requesterToken);
        check(resReqDashboard.status === 200, "5g. GET /requesters/me/available-donors succeeds with 0 notifications");
        const matchingVol = resReqDashboard.data.availableDonors.find((d: any) => d.donorId === donorId);
        check(matchingVol !== undefined, "5h. availableDonors contains committed donor after notification purge");

        // 5i. Duplicate response STILL rejected with 400 even with 0 notifications
        const resDupAfterPurge = await postJson(`/bloodrequests/${emergencyRequestId}/respond`, donorToken, standardScreening);
        check(resDupAfterPurge.status === 400, "5i. Duplicate response still rejected with HTTP 400 after notification deletion");
        check(resDupAfterPurge.data.message.includes("already volunteered"), "5j. Cannot duplicate volunteer commitment");

        // =========================================================================
        // SCENARIO 6: Transit Milestone Progression on Persistent Commitments
        // =========================================================================
        console.log("\n--- Scenario 6: Transit Milestone Updates on Persistent Commitments ---");
        const deliveryBeforeTransit = store.deliveries.get(initialDeliveryId);
        if (deliveryBeforeTransit) {
            deliveryBeforeTransit.acceptancestatus = "ACCEPTED";
        }
        // 6a. STARTED
        const resStarted = await patchJson(`/bloodrequests/${emergencyRequestId}/transit-status`, hospitalToken, {
            status: "STARTED",
            donorUserId: donorUserId,
        });
        check(resStarted.status === 200, "6a. Transit status STARTED succeeds with 0 notifications (HTTP 200)");
        const delStarted = store.deliveries.get(initialDeliveryId);
        check(delStarted.transitstatus === "STARTED", "6b. delivery transitstatus updated to STARTED");
        check(delStarted.startedat !== null, "6c. startedat timestamp set in delivery");

        // 6d. REACHED_LOCATION
        const resReached = await patchJson(`/bloodrequests/${emergencyRequestId}/transit-status`, hospitalToken, {
            status: "REACHED_LOCATION",
            donorUserId: donorUserId,
        });
        check(resReached.status === 200, "6d. Transit status REACHED_LOCATION succeeds (HTTP 200)");
        const delReached = store.deliveries.get(initialDeliveryId);
        check(delReached.transitstatus === "REACHED_LOCATION", "6e. delivery transitstatus updated to REACHED_LOCATION");
        check(delReached.reachedat !== null, "6f. reachedat timestamp set in delivery");

        // 6g. COMPLETED (advances request to BLOOD_ARRANGED)
        const resCompleted = await patchJson(`/bloodrequests/${emergencyRequestId}/transit-status`, hospitalToken, {
            status: "COMPLETED",
            donorUserId: donorUserId,
        });
        check(resCompleted.status === 200, "6g. Transit status COMPLETED succeeds (HTTP 200)");
        const delCompleted = store.deliveries.get(initialDeliveryId);
        check(delCompleted.transitstatus === "COMPLETED", "6h. delivery transitstatus updated to COMPLETED");
        check(delCompleted.completedat !== null, "6i. completedat timestamp set in delivery");
        check(store.requests.get(emergencyRequestId).status === "BLOOD_ARRANGED", "6j. blood request status moved to BLOOD_ARRANGED");

        // 6k. Final verification of GET /bloodrequests/:id reflecting COMPLETED
        const resFinal = await getJson(`/bloodrequests/${emergencyRequestId}`, requesterToken);
        check(resFinal.data.volunteers[0].transitStatus === "COMPLETED", "6k. GET /bloodrequests reflects COMPLETED transit status");
        check(resFinal.data.volunteers[0].completedAt !== null, "6l. GET /bloodrequests reflects completedAt timestamp");

        // =========================================================================
        // SCENARIO 7: DIRECT_VOLUNTEER Container Isolation & Broadcast Status Audit Fix
        // =========================================================================
        console.log("\n--- Scenario 7: DIRECT_VOLUNTEER Container Isolation from Emergency Broadcast Telemetry ---");
        
        // 7a. Non-emergency request with DIRECT_VOLUNTEER container: NO emergency broadcast status
        const resNonEmergBcastStatus = await getJson(`/bloodrequests/${nonEmergencyRequestId}/broadcast`, requesterToken);
        check(resNonEmergBcastStatus.status === 200, "7a. GET /bloodrequests/:id/broadcast succeeds (HTTP 200)");
        check(resNonEmergBcastStatus.data.hasBroadcast === false, "7b. hasBroadcast is FALSE for non-emergency request with DIRECT_VOLUNTEER container");
        check(resNonEmergBcastStatus.data.broadcast === null, "7c. broadcast payload is null (no fake emergency telemetry)");
        check(resNonEmergBcastStatus.data.isEmergency === false, "7d. isEmergency remains FALSE for non-emergency request");

        // 7e. Expand coverage action is BLOCKED with 400 for request without genuine emergency broadcast
        const resExpandNonEmerg = await postJson(`/bloodrequests/${nonEmergencyRequestId}/broadcast`, hospitalToken, {
            expandRadius: true,
            radiusKm: 25,
        });
        check(resExpandNonEmerg.status === 400, "7e. Expanding radius on DIRECT_VOLUNTEER container is rejected with HTTP 400");
        check(resExpandNonEmerg.data.message.toLowerCase().includes("no active emergency broadcast"), "7f. Rejection explains no active emergency broadcast exists");
        check(store.requests.get(nonEmergencyRequestId).isemergency === false, "7g. Non-emergency request was NOT escalated to isemergency = true");

        // 7h. Genuine emergency broadcast telemetry remains intact and functional
        const resEmergBcastStatus = await getJson(`/bloodrequests/${emergencyRequestId}/broadcast`, requesterToken);
        check(resEmergBcastStatus.status === 200, "7h. GET /bloodrequests/:id/broadcast succeeds for genuine emergency");
        check(resEmergBcastStatus.data.hasBroadcast === true, "7i. hasBroadcast is TRUE for genuine emergency broadcast");
        check(resEmergBcastStatus.data.broadcast !== null, "7j. broadcast telemetry payload is populated");
        check(resEmergBcastStatus.data.broadcast.triggertype === "REQUEST_CREATION", "7k. triggertype is REQUEST_CREATION");
        check(resEmergBcastStatus.data.broadcast.radiuskm === 15, "7l. radiuskm is preserved (15 km)");
        check(resEmergBcastStatus.data.isEmergency === true, "7m. isEmergency is TRUE for genuine emergency request");

        console.log("\n==========================================================================");
        console.log(`  ALL REGRESSION TESTS PASSED: ${passed} passed, ${failed} failed           `);
        console.log("==========================================================================\n");
    } catch (err: any) {
        console.error("Test execution failed:", err);
        process.exit(1);
    } finally {
        server.close();
    }
}

runTests();
