import "dotenv/config";
import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";

function makeToken(userid: string, role: string) {
    return generateToken(userid, role);
}

let server: http.Server;
let baseUrl = "";
let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
    if (cond) {
        console.log(`[PASS] ${name}`);
        passed++;
    } else {
        console.error(`[FAIL] ${name}`);
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

    console.log(`\n=== SWASTYA PHASE 1B FIX 1: DONATION HISTORY & COOLDOWN TESTS (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const hospUser = await prisma.users.create({
            data: { name: `Fix1 Hosp ${tag}`, email: `fix1-hosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        createdUserIds.push(hospUser.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `Fix1 General ${tag}`,
                registrationnumber: `REG-FIX1-${tag}`,
                address: "1 Test St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. Fix1",
                contactpersonphone: "9999900001",
                approvalstatus: "APPROVED",
            },
        });

        const adminUser = await prisma.users.create({
            data: { name: `Fix1 Admin ${tag}`, email: `fix1-admin-${tag}@test.local`, password: "x", role: "ADMIN", isactive: true },
        });
        createdUserIds.push(adminUser.userid);

        const reqUser = await prisma.users.create({
            data: { name: `Fix1 Req ${tag}`, email: `fix1-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        createdUserIds.push(reqUser.userid);

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "2 Test St", city: "Pune", state: "MH", pincode: "411001" },
        });

        const donor1User = await prisma.users.create({
            data: { name: `Fix1 Donor1 ${tag}`, email: `fix1-d1-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const donor2User = await prisma.users.create({
            data: { name: `Fix1 Donor2 ${tag}`, email: `fix1-d2-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const donor3User = await prisma.users.create({
            data: { name: `Fix1 Donor3 ${tag}`, email: `fix1-d3-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(donor1User.userid, donor2User.userid, donor3User.userid);

        const donor1 = await prisma.donors.create({
            data: {
                userid: donor1User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1995-01-01"),
                gender: "MALE",
                address: "10 D1 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                lastdonationdate: null,
            },
        });
        const donor2 = await prisma.donors.create({
            data: {
                userid: donor2User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1996-02-02"),
                gender: "FEMALE",
                address: "20 D2 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                lastdonationdate: null,
            },
        });
        const donor3 = await prisma.donors.create({
            data: {
                userid: donor3User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1994-03-03"),
                gender: "MALE",
                address: "30 D3 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                lastdonationdate: null,
            },
        });

        const hospToken = makeToken(hospUser.userid, "HOSPITAL");
        const adminToken = makeToken(adminUser.userid, "ADMIN");
        const reqToken = makeToken(reqUser.userid, "REQUESTER");
        const d1Token = makeToken(donor1User.userid, "DONOR");
        const d3Token = makeToken(donor3User.userid, "DONOR");

        // Create Request 1 (with VERIFIED prescription)
        const req1 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: "Patient Fix1",
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9999900099",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "RBC",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                status: "DONOR_MATCHING",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req1.requestid);

        await prisma.prescription.create({
            data: {
                requestid: req1.requestid,
                fileurl: `https://test.local/rx-fix1-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. Fix1",
                hospitalname: hospital.hospitalname,
                status: "VERIFIED",
                verifiedbyhospitalid: hospital.hospitalid,
            },
        });

        const bc1 = await prisma.emergencybroadcasts.create({
            data: {
                requestid: req1.requestid,
                triggeredbyuserid: reqUser.userid,
                triggertype: "DIRECT_VOLUNTEER",
                radiuskm: 10,
                status: "DONOR_RESPONDED",
                totalmatched: 2,
                totalnotified: 0,
                totalresponded: 2,
            },
        });

        const del1 = await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bc1.broadcastid,
                requestid: req1.requestid,
                donorid: donor1.donorid,
                donoruserid: donor1User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(Date.now() - 2000),
                transitstatus: "REACHED_LOCATION",
            },
        });
        const del2 = await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bc1.broadcastid,
                requestid: req1.requestid,
                donorid: donor2.donorid,
                donoruserid: donor2User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(Date.now() - 1000),
                transitstatus: "REACHED_LOCATION",
            },
        });

        // 1. Unauthorized DONOR / REQUESTER cannot confirm COMPLETED or create verified history
        const rDonorComplete = await reqJson("PATCH", `/bloodrequests/${req1.requestid}/transit-status`, { status: "COMPLETED" }, d1Token);
        const rReqComplete = await reqJson("PATCH", `/bloodrequests/${req1.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, reqToken);
        assert(rDonorComplete.status === 403 && rReqComplete.status === 403, "1. Unauthorized donor/requester COMPLETED rejected with 403");
        const hCountAfterUnauth = await prisma.donationhistory.count({ where: { requestid: req1.requestid } });
        const d1Before = await prisma.donors.findUnique({ where: { donorid: donor1.donorid } });
        assert(hCountAfterUnauth === 0 && d1Before?.lastdonationdate === null, "1b. No history or cooldown created on unauthorized attempt");

        // 2. Authorized hospital completes Donor 1 -> creates 1 verified history entry, updates Donor 1 lastdonationdate, leaves Donor 2 untouched
        const rHospComplete1 = await reqJson("PATCH", `/bloodrequests/${req1.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, hospToken);
        assert(rHospComplete1.status === 200 && rHospComplete1.data?.donationRecorded === true, "2. Hospital completion for Donor 1 returns 200 with donationRecorded=true");

        const d1Hist = await prisma.donationhistory.findMany({ where: { donorid: donor1.donorid, requestid: req1.requestid } });
        assert(
            d1Hist.length === 1 &&
                d1Hist[0].verificationstatus === "VERIFIED" &&
                d1Hist[0].hospitalid === hospital.hospitalid &&
                d1Hist[0].bloodcomponent === "RBC" &&
                d1Hist[0].unitsdonated === 1 &&
                d1Hist[0].isimported === false,
            "2b. Exactly 1 VERIFIED donationhistory entry created for Donor 1 with correct request/hospital/component"
        );

        const d1After = await prisma.donors.findUnique({ where: { donorid: donor1.donorid } });
        const d2AfterD1 = await prisma.donors.findUnique({ where: { donorid: donor2.donorid } });
        const d2HistAfterD1 = await prisma.donationhistory.count({ where: { donorid: donor2.donorid } });
        assert(d1After?.lastdonationdate !== null, "2c. Donor 1 lastdonationdate updated");
        assert(d2AfterD1?.lastdonationdate === null && d2HistAfterD1 === 0, "2d. Completing Donor 1 does not modify Donor 2 history or cooldown");

        // 3. Repeated completion for Donor 1 is idempotent (no duplicate history, lastdonationdate unchanged)
        const savedLastDonation1 = d1After!.lastdonationdate!.getTime();
        const rRepeat = await reqJson("PATCH", `/bloodrequests/${req1.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, hospToken);
        assert(rRepeat.status === 200 && rRepeat.data?.donationRecorded === false, "3. Repeated completion returns 200 with donationRecorded=false");
        const d1HistRepeat = await prisma.donationhistory.count({ where: { donorid: donor1.donorid, requestid: req1.requestid } });
        const d1AfterRepeat = await prisma.donors.findUnique({ where: { donorid: donor1.donorid } });
        assert(d1HistRepeat === 1 && d1AfterRepeat?.lastdonationdate?.getTime() === savedLastDonation1, "3b. No duplicate history or lastdonationdate mutation on repeat");

        // 4. Existing donor cooldown rejects new volunteer attempt inside 90 days
        const req2 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: "Patient Fix1 Second",
                patientage: 30,
                patientgender: "FEMALE",
                patientcontact: "9999900088",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req2.requestid);

        const rCooldownReject = await reqJson("POST", `/bloodrequests/${req2.requestid}/respond`, { screeningPassed: true }, d1Token);
        assert(
            rCooldownReject.status === 400 && String(rCooldownReject.data?.message || "").includes("90-day cooldown"),
            "4. Donor 1 with recent completion is rejected by 90-day cooldown on new request"
        );

        // 5. Multiple donors completing the same request are recorded independently (Admin confirms Donor 2)
        const rAdminComplete2 = await reqJson("PATCH", `/bloodrequests/${req1.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor2User.userid }, adminToken);
        assert(rAdminComplete2.status === 200 && rAdminComplete2.data?.donationRecorded === true, "5. Admin completion for Donor 2 succeeds independently");
        const d2Hist = await prisma.donationhistory.findMany({ where: { donorid: donor2.donorid, requestid: req1.requestid } });
        const d2After = await prisma.donors.findUnique({ where: { donorid: donor2.donorid } });
        const req1HistTotal = await prisma.donationhistory.count({ where: { requestid: req1.requestid } });
        assert(d2Hist.length === 1 && d2After?.lastdonationdate !== null && req1HistTotal === 2, "5b. Both Donor 1 and Donor 2 have independent history & cooldown records");

        // 6. Transaction rollback atomicity: if history/donor update fails, delivery transitstatus must also roll back
        const req3 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hospital.hospitalid,
                patientname: "Patient Fix1 Rollback",
                patientage: 50,
                patientgender: "MALE",
                patientcontact: "9999900077",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "DONOR_MATCHING",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req3.requestid);

        // Donor 3 volunteers via real HTTP endpoint and advances to REACHED_LOCATION
        const rD3Vol = await reqJson("POST", `/bloodrequests/${req3.requestid}/respond`, { screeningPassed: true }, d3Token);
        assert(rD3Vol.status === 200, "6a. Donor 3 volunteers on Request 3");
        await reqJson("PATCH", `/bloodrequests/${req3.requestid}/transit-status`, { status: "STARTED", donorUserId: donor3User.userid }, hospToken);
        await reqJson("PATCH", `/bloodrequests/${req3.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor3User.userid }, hospToken);

        const origTransaction = prisma.$transaction.bind(prisma);
        (prisma as any).$transaction = async (cb: any) => {
            return origTransaction(async (tx: any) => {
                const wrappedTx = new Proxy(tx, {
                    get(target, prop) {
                        if (prop === "donors") {
                            return {
                                ...target.donors,
                                update: async () => {
                                    throw new Error("Simulated donor update failure");
                                },
                            };
                        }
                        return target[prop];
                    },
                });
                return await cb(wrappedTx);
            });
        };

        let rRollback: any;
        try {
            rRollback = await reqJson("PATCH", `/bloodrequests/${req3.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor3User.userid }, hospToken);
        } finally {
            (prisma as any).$transaction = origTransaction;
        }

        assert(rRollback.status === 500, "6b. Simulated failure returns 500");
        const del3AfterFail = await prisma.broadcastdeliveries.findFirst({ where: { requestid: req3.requestid, donorid: donor3.donorid } });
        const d3HistAfterFail = await prisma.donationhistory.count({ where: { donorid: donor3.donorid, requestid: req3.requestid } });
        const d3AfterFail = await prisma.donors.findUnique({ where: { donorid: donor3.donorid } });
        assert(
            del3AfterFail?.transitstatus === "REACHED_LOCATION" && d3HistAfterFail === 0 && d3AfterFail?.lastdonationdate === null,
            "6c. Failed transaction rolled back delivery transitstatus, donationhistory, and donor lastdonationdate"
        );

        // 7. Concurrent completions for the SAME donor (Donor 3) across TWO different requests (req3 & req4)
        const req4 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hospital.hospitalid,
                patientname: "Patient Fix1 Concurrent B",
                patientage: 45,
                patientgender: "FEMALE",
                patientcontact: "9999900066",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "DONOR_MATCHING",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req4.requestid);

        const rD3Vol4 = await reqJson("POST", `/bloodrequests/${req4.requestid}/respond`, { screeningPassed: true }, d3Token);
        assert(rD3Vol4.status === 200, "7a. Donor 3 also volunteers on Request 4 before either completes");
        await reqJson("PATCH", `/bloodrequests/${req4.requestid}/transit-status`, { status: "STARTED", donorUserId: donor3User.userid }, hospToken);
        await reqJson("PATCH", `/bloodrequests/${req4.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor3User.userid }, hospToken);

        const [rConc3, rConc4] = await Promise.all([
            reqJson("PATCH", `/bloodrequests/${req3.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor3User.userid }, hospToken),
            reqJson("PATCH", `/bloodrequests/${req4.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor3User.userid }, hospToken),
        ]);

        const concResults = [
            { reqId: req3.requestid, res: rConc3 },
            { reqId: req4.requestid, res: rConc4 },
        ];
        const winners = concResults.filter((x) => x.res.status === 200);
        const losers = concResults.filter((x) => x.res.status === 400);

        assert(
            winners.length === 1 && losers.length === 1 && String(losers[0].res.data?.message || "").includes("90-day cooldown"),
            "7b. Concurrent completions for same donor across req3/req4 yield exactly 1 HTTP 200 and 1 HTTP 400 cooldown rejection"
        );

        const d3HistTotal = await prisma.donationhistory.findMany({ where: { donorid: donor3.donorid } });
        const d3AfterConc = await prisma.donors.findUnique({ where: { donorid: donor3.donorid } });
        const winnerDel = await prisma.broadcastdeliveries.findFirst({ where: { requestid: winners[0].reqId, donorid: donor3.donorid } });
        const loserDel = await prisma.broadcastdeliveries.findFirst({ where: { requestid: losers[0].reqId, donorid: donor3.donorid } });

        assert(
            d3HistTotal.length === 1 && d3HistTotal[0].requestid === winners[0].reqId && d3HistTotal[0].verificationstatus === "VERIFIED",
            "7c. Donor 3 has exactly 1 VERIFIED donationhistory record (for winning request only)"
        );
        assert(
            winnerDel?.transitstatus === "COMPLETED" && loserDel?.transitstatus === "REACHED_LOCATION",
            "7d. Winning delivery is COMPLETED while rejected delivery remains REACHED_LOCATION"
        );
        assert(d3AfterConc?.lastdonationdate !== null, "7e. Donor 3 lastdonationdate updated from winning completion");

        // Same-request idempotent retry on winner still succeeds without duplicate history
        const rConcRetry = await reqJson("PATCH", `/bloodrequests/${winners[0].reqId}/transit-status`, { status: "COMPLETED", donorUserId: donor3User.userid }, hospToken);
        const d3HistAfterRetry = await prisma.donationhistory.count({ where: { donorid: donor3.donorid } });
        assert(
            rConcRetry.status === 200 && rConcRetry.data?.donationRecorded === false && d3HistAfterRetry === 1,
            "7f. Idempotent retry on winning request succeeds (200) without duplicate history"
        );

        // 8. Donor with lastdonationdate=null but a recent VERIFIED donationhistory record is still rejected
        const donor4User = await prisma.users.create({
            data: { name: `Fix1 Donor4 ${tag}`, email: `fix1-d4-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(donor4User.userid);

        const donor4 = await prisma.donors.create({
            data: {
                userid: donor4User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1993-04-04"),
                gender: "FEMALE",
                address: "40 D4 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
                lastdonationdate: null,
            },
        });

        await prisma.donationhistory.create({
            data: {
                donorid: donor4.donorid,
                hospitalid: hospital.hospitalid,
                unitsdonated: 1,
                donationdate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                bloodcomponent: "WHOLE_BLOOD",
                verificationstatus: "VERIFIED",
                isimported: false,
            },
        });

        const req5 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hospital.hospitalid,
                patientname: "Patient Fix1 NullLastDate",
                patientage: 35,
                patientgender: "MALE",
                patientcontact: "9999900055",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "DONOR_MATCHING",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req5.requestid);

        const bc5 = await prisma.emergencybroadcasts.create({
            data: {
                requestid: req5.requestid,
                triggeredbyuserid: hospUser.userid,
                triggertype: "DIRECT_VOLUNTEER",
                radiuskm: 10,
                status: "DONOR_RESPONDED",
                totalmatched: 1,
                totalnotified: 0,
                totalresponded: 1,
            },
        });
        await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bc5.broadcastid,
                requestid: req5.requestid,
                donorid: donor4.donorid,
                donoruserid: donor4User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(),
                transitstatus: "REACHED_LOCATION",
            },
        });

        const rD4NullLastDate = await reqJson("PATCH", `/bloodrequests/${req5.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor4User.userid }, hospToken);
        const d4HistCount = await prisma.donationhistory.count({ where: { donorid: donor4.donorid } });
        const d4Del = await prisma.broadcastdeliveries.findFirst({ where: { requestid: req5.requestid, donorid: donor4.donorid } });
        assert(
            rD4NullLastDate.status === 400 &&
                String(rD4NullLastDate.data?.message || "").includes("90-day cooldown") &&
                d4HistCount === 1 &&
                d4Del?.transitstatus === "REACHED_LOCATION",
            "8. Donor with lastdonationdate=null but recent VERIFIED history is rejected (400) with delivery uncompleted"
        );

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    } finally {
        try {
            if (createdRequestIds.length > 0) {
                await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.donationhistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.prescription.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.bloodrequests.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            }
            if (createdUserIds.length > 0) {
                await prisma.donationhistory.deleteMany({ where: { donors: { userid: { in: createdUserIds } } } });
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
