import "dotenv/config";
import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { triggerEmergencyBroadcast } from "../src/services/broadcast.service";

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

    console.log(`\n=== SWASTYA PHASE 1B BATCH A FIX 1: DONOR RESPONSE & BROADCAST INTEGRITY (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const city = `BA1City_${tag}`;
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const reqUser = await prisma.users.create({
            data: { name: `BA1 Req ${tag}`, email: `ba1-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const d1User = await prisma.users.create({
            data: { name: `BA1 D1 ${tag}`, email: `ba1-d1-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const d2User = await prisma.users.create({
            data: { name: `BA1 D2 ${tag}`, email: `ba1-d2-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const d3User = await prisma.users.create({
            data: { name: `BA1 D3 ${tag}`, email: `ba1-d3-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(reqUser.userid, d1User.userid, d2User.userid, d3User.userid);

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "1 BA1 St", city, state: "MH", pincode: "411001" },
        });

        const donor1 = await prisma.donors.create({
            data: {
                userid: d1User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1995-01-01"),
                gender: "MALE",
                address: "D1",
                city,
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });
        const donor2 = await prisma.donors.create({
            data: {
                userid: d2User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1994-02-02"),
                gender: "FEMALE",
                address: "D2",
                city,
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });
        const donor3 = await prisma.donors.create({
            data: {
                userid: d3User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1993-03-03"),
                gender: "MALE",
                address: "D3",
                city,
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });

        const d1Token = generateToken(d1User.userid, "DONOR");
        const d2Token = generateToken(d2User.userid, "DONOR");
        const d3Token = generateToken(d3User.userid, "DONOR");

        // 1, 3 & 8: DIRECT_VOLUNTEER creation sets totalresponded=1 (not 2), duplicate rejected, and DIRECT_VOLUNTEER excluded from emergency dedup
        const reqDV = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                patientname: `BA1 DV ${tag}`,
                patientage: 30,
                patientgender: "MALE",
                patientcontact: "9999500001",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "CRITICAL",
                status: "CREATED",
                isemergency: true,
                searchradius: 15,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqDV.requestid);

        const rDV1 = await reqJson("POST", `/bloodrequests/${reqDV.requestid}/respond`, { screeningPassed: true }, d1Token);
        const dvBroadcastAfter1 = await prisma.emergencybroadcasts.findFirst({ where: { requestid: reqDV.requestid } });
        assert(
            rDV1.status === 200 && dvBroadcastAfter1?.triggertype === "DIRECT_VOLUNTEER" && dvBroadcastAfter1?.totalresponded === 1,
            "1. DIRECT_VOLUNTEER response sets totalresponded to exactly 1",
            `status=${rDV1.status}, totalresponded=${dvBroadcastAfter1?.totalresponded}`
        );

        const rDVDup = await reqJson("POST", `/bloodrequests/${reqDV.requestid}/respond`, { screeningPassed: true }, d1Token);
        const dvBroadcastAfterDup = await prisma.emergencybroadcasts.findFirst({ where: { requestid: reqDV.requestid } });
        assert(
            rDVDup.status === 400 && dvBroadcastAfterDup?.totalresponded === 1,
            "3. Duplicate response rejected (400) and does not increment totalresponded"
        );

        // Trigger genuine emergency broadcast on reqDV -> must NOT be deduplicated by DIRECT_VOLUNTEER container
        const bcastGenuine = await triggerEmergencyBroadcast({
            requestId: reqDV.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
            radiusKm: 15,
        });
        assert(
            bcastGenuine.success === true && !bcastGenuine.alreadyActive && bcastGenuine.broadcastId !== dvBroadcastAfter1?.broadcastid,
            "8. DIRECT_VOLUNTEER container (even with DONOR_RESPONDED) does not block genuine emergency broadcast"
        );

        // 2 & 7: Emergency broadcast response increments exact count once, and DONOR_RESPONDED preserves active-broadcast deduplication
        const reqEm = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                patientname: `BA1 Em ${tag}`,
                patientage: 35,
                patientgender: "FEMALE",
                patientcontact: "9999500002",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 3,
                urgencylevel: "CRITICAL",
                status: "CREATED",
                isemergency: true,
                searchradius: 15,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqEm.requestid);

        const emBcast = await triggerEmergencyBroadcast({
            requestId: reqEm.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "REQUEST_CREATION",
            radiusKm: 15,
        });
        assert(emBcast.success === true && emBcast.totalNotified === 3, "2a. Emergency broadcast notified 3 donors");

        const rEmD1 = await reqJson("POST", `/bloodrequests/${reqEm.requestid}/respond`, { screeningPassed: true }, d1Token);
        const emBcastAfter1 = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: emBcast.broadcastId } });
        assert(
            rEmD1.status === 200 && emBcastAfter1?.totalresponded === 1 && emBcastAfter1?.status === "DONOR_RESPONDED",
            "2b. Emergency broadcast totalresponded incremented to 1 and status=DONOR_RESPONDED"
        );

        // Active broadcast deduplication MUST still treat DONOR_RESPONDED as active within 10 minutes
        const emDedup = await triggerEmergencyBroadcast({
            requestId: reqEm.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
            radiusKm: 15,
            expandRadius: false,
        });
        const emBcastCount = await prisma.emergencybroadcasts.count({ where: { requestid: reqEm.requestid } });
        assert(
            emDedup.success === true && emDedup.alreadyActive === true && emBcastCount === 1,
            "7. DONOR_RESPONDED broadcast still triggers active-broadcast deduplication (no duplicate broadcast)"
        );

        // 6. Concurrent responses (d2 & d3 + duplicate d1) do not double-count
        const [rConcD2, rConcD3, rConcD1Dup] = await Promise.all([
            reqJson("POST", `/bloodrequests/${reqEm.requestid}/respond`, { screeningPassed: true }, d2Token),
            reqJson("POST", `/bloodrequests/${reqEm.requestid}/respond`, { screeningPassed: true }, d3Token),
            reqJson("POST", `/bloodrequests/${reqEm.requestid}/respond`, { screeningPassed: true }, d1Token),
        ]);
        const emBcastAfterConc = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: emBcast.broadcastId } });
        assert(
            rConcD2.status === 200 && rConcD3.status === 200 && rConcD1Dup.status === 400 && emBcastAfterConc?.totalresponded === 3,
            "6. Concurrent donor responses + duplicate call result in exact totalresponded=3",
            `statuses=${rConcD2.status},${rConcD3.status},${rConcD1Dup.status}, totalresponded=${emBcastAfterConc?.totalresponded}`
        );

        // 4 & 5: Correct deliveryRecord.broadcastid updated when multiple broadcasts exist; unrelated broadcast unchanged
        const reqMulti = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                patientname: `BA1 Multi ${tag}`,
                patientage: 42,
                patientgender: "MALE",
                patientcontact: "9999500003",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "CRITICAL",
                status: "DONOR_MATCHING",
                isemergency: true,
                searchradius: 25,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqMulti.requestid);

        const bcOld = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqMulti.requestid,
                triggeredbyuserid: reqUser.userid,
                triggertype: "REQUEST_CREATION",
                radiuskm: 10,
                status: "ACTIVE",
                totalmatched: 1,
                totalnotified: 1,
                totalresponded: 0,
                createdat: new Date(Date.now() - 60000),
            },
        });
        const bcNew = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqMulti.requestid,
                triggeredbyuserid: reqUser.userid,
                triggertype: "RADIUS_EXPANSION",
                radiuskm: 25,
                status: "ACTIVE",
                totalmatched: 1,
                totalnotified: 1,
                totalresponded: 0,
                createdat: new Date(),
            },
        });
        await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bcOld.broadcastid,
                requestid: reqMulti.requestid,
                donorid: donor1.donorid,
                donoruserid: d1User.userid,
                matchtype: "CITY_FALLBACK",
                deliverystatus: "DELIVERED",
                attemptcount: 1,
            },
        });

        const rOldResp = await reqJson("POST", `/bloodrequests/${reqMulti.requestid}/respond`, { screeningPassed: true }, d1Token);
        const bcOldAfter = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: bcOld.broadcastid } });
        const bcNewAfter = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: bcNew.broadcastid } });
        assert(
            rOldResp.status === 200 && bcOldAfter?.totalresponded === 1 && bcNewAfter?.totalresponded === 0 && bcNewAfter?.status === "ACTIVE",
            "4 & 5. Response updates exact deliveryRecord.broadcastid (bcOld=1) while newer/unrelated broadcast (bcNew=0) stays unchanged",
            `bcOld=${bcOldAfter?.totalresponded}, bcNew=${bcNewAfter?.totalresponded}`
        );

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    } finally {
        try {
            if (createdRequestIds.length > 0) {
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
