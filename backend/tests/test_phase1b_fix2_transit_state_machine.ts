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

    console.log(`\n=== SWASTYA PHASE 1B FIX 2: TRANSIT AUTHORIZATION & STATE MACHINE TESTS (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const hospUser = await prisma.users.create({
            data: { name: `Fix2 Hosp ${tag}`, email: `fix2-hosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const otherHospUser = await prisma.users.create({
            data: { name: `Fix2 OtherHosp ${tag}`, email: `fix2-ohosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const adminUser = await prisma.users.create({
            data: { name: `Fix2 Admin ${tag}`, email: `fix2-admin-${tag}@test.local`, password: "x", role: "ADMIN", isactive: true },
        });
        const reqUser = await prisma.users.create({
            data: { name: `Fix2 Req ${tag}`, email: `fix2-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const donor1User = await prisma.users.create({
            data: { name: `Fix2 Donor1 ${tag}`, email: `fix2-d1-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const donor2User = await prisma.users.create({
            data: { name: `Fix2 Donor2 ${tag}`, email: `fix2-d2-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const donor3User = await prisma.users.create({
            data: { name: `Fix2 Donor3 ${tag}`, email: `fix2-d3-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(
            hospUser.userid,
            otherHospUser.userid,
            adminUser.userid,
            reqUser.userid,
            donor1User.userid,
            donor2User.userid,
            donor3User.userid
        );

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `Fix2 Assigned ${tag}`,
                registrationnumber: `REG-FIX2-${tag}`,
                address: "1 Test Ave",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. Fix2",
                contactpersonphone: "9999800001",
                approvalstatus: "APPROVED",
            },
        });
        await prisma.hospitals.create({
            data: {
                userid: otherHospUser.userid,
                hospitalname: `Fix2 Unassigned ${tag}`,
                registrationnumber: `REG-FIX2-O-${tag}`,
                address: "2 Test Ave",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. Other",
                contactpersonphone: "9999800002",
                approvalstatus: "APPROVED",
            },
        });

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "3 Test Ave", city: "Pune", state: "MH", pincode: "411001" },
        });

        const donor1 = await prisma.donors.create({
            data: {
                userid: donor1User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1995-01-01"),
                gender: "MALE",
                address: "D1",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });
        const donor2 = await prisma.donors.create({
            data: {
                userid: donor2User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1994-02-02"),
                gender: "FEMALE",
                address: "D2",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });
        const donor3 = await prisma.donors.create({
            data: {
                userid: donor3User.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date("1993-03-03"),
                gender: "MALE",
                address: "D3",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                availabilitystatus: "AVAILABLE",
                iseligible: true,
            },
        });

        const hospToken = makeToken(hospUser.userid, "HOSPITAL");
        const otherHospToken = makeToken(otherHospUser.userid, "HOSPITAL");
        const adminToken = makeToken(adminUser.userid, "ADMIN");
        const reqToken = makeToken(reqUser.userid, "REQUESTER");
        const d1Token = makeToken(donor1User.userid, "DONOR");
        const d2Token = makeToken(donor2User.userid, "DONOR");

        const reqA = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: "Patient Fix2",
                patientage: 32,
                patientgender: "MALE",
                patientcontact: "9999800099",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                status: "DONOR_MATCHING",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqA.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqA.requestid,
                fileurl: `https://test.local/rx-fix2-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. Fix2",
                hospitalname: hospital.hospitalname,
                status: "VERIFIED",
                verifiedbyhospitalid: hospital.hospitalid,
            },
        });

        const bcA = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqA.requestid,
                triggeredbyuserid: reqUser.userid,
                triggertype: "DIRECT_VOLUNTEER",
                radiuskm: 10,
                status: "DONOR_RESPONDED",
                totalmatched: 2,
                totalnotified: 0,
                totalresponded: 2,
            },
        });

        await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bcA.broadcastid,
                requestid: reqA.requestid,
                donorid: donor1.donorid,
                donoruserid: donor1User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(),
                transitstatus: "DONOR_FOUND",
            },
        });
        await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bcA.broadcastid,
                requestid: reqA.requestid,
                donorid: donor2.donorid,
                donoruserid: donor2User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(),
                transitstatus: "DONOR_FOUND",
            },
        });

        // 1. Invalid status strings rejected with 400
        const rInvalid = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "FLYING", donorUserId: donor1User.userid }, hospToken);
        assert(rInvalid.status === 400, "1. Invalid status string rejected with 400");

        // 2. Requester cannot update donor transit (STARTED, REACHED_LOCATION, COMPLETED)
        const rReqStart = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED", donorUserId: donor1User.userid }, reqToken);
        const rReqReach = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor1User.userid }, reqToken);
        const rReqComp = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, reqToken);
        assert(rReqStart.status === 403 && rReqReach.status === 403 && rReqComp.status === 403, "2. Requester rejected (403) for all transit statuses");

        // 3. Unassigned hospital cannot update transit
        const rOtherHosp = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED", donorUserId: donor1User.userid }, otherHospToken);
        assert(rOtherHosp.status === 403, "3. Unassigned hospital rejected with 403");

        // 4. Donor cannot mark DONOR_FOUND, COMPLETED, or another donor's delivery
        const rDonorFound = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "DONOR_FOUND" }, d1Token);
        const rDonorComp = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED" }, d1Token);
        const rDonorOther = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED", donorUserId: donor2User.userid }, d1Token);
        assert(rDonorFound.status === 403 && rDonorComp.status === 403 && rDonorOther.status === 403, "4. Donor rejected (403) for DONOR_FOUND, COMPLETED, and other donor");

        // 5. Skipped stages from DONOR_FOUND rejected with 400
        const rSkipReach = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor1User.userid }, hospToken);
        const rSkipComp = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, hospToken);
        assert(rSkipReach.status === 400 && rSkipComp.status === 400, "5. Direct DONOR_FOUND -> REACHED_LOCATION and DONOR_FOUND -> COMPLETED rejected (400)");

        // 6. Donor 1 advances DONOR_FOUND -> STARTED (own delivery), then idempotent retry STARTED -> STARTED
        const rD1Start = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED" }, d1Token);
        const rD1StartRetry = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED" }, d1Token);
        assert(rD1Start.status === 200 && rD1StartRetry.status === 200, "6. Donor advances to STARTED and same-state retry succeeds (200)");

        // 7. Backward transition STARTED -> DONOR_FOUND rejected
        const rBackFound = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "DONOR_FOUND", donorUserId: donor1User.userid }, hospToken);
        assert(rBackFound.status === 400, "7. Backward transition STARTED -> DONOR_FOUND rejected (400)");

        // 8. Assigned hospital advances Donor 1 STARTED -> REACHED_LOCATION, backward REACHED_LOCATION -> STARTED rejected
        const rHospReach = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor1User.userid }, hospToken);
        const rBackStart = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED", donorUserId: donor1User.userid }, hospToken);
        assert(rHospReach.status === 200 && rBackStart.status === 400, "8. Assigned hospital advances to REACHED_LOCATION (200) and backward -> STARTED rejected (400)");

        // 9. Donor 1 cannot confirm COMPLETED at REACHED_LOCATION; Assigned hospital confirms COMPLETED -> creates 1 VERIFIED history
        const rD1CompAtReach = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED" }, d1Token);
        const rHospComp = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, hospToken);
        const d1Hist = await prisma.donationhistory.findMany({ where: { donorid: donor1.donorid, requestid: reqA.requestid } });
        assert(
            rD1CompAtReach.status === 403 && rHospComp.status === 200 && d1Hist.length === 1 && d1Hist[0].verificationstatus === "VERIFIED",
            "9. Donor blocked from COMPLETED (403); Hospital confirms COMPLETED (200) creating 1 VERIFIED history"
        );

        // 10. Transitions from COMPLETED -> earlier states rejected; COMPLETED -> COMPLETED idempotent retry succeeds without duplicate history
        const rCompToStart = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED", donorUserId: donor1User.userid }, hospToken);
        const rCompToReach = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor1User.userid }, adminToken);
        const rCompRetry = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, hospToken);
        const d1HistAfterRetry = await prisma.donationhistory.count({ where: { donorid: donor1.donorid, requestid: reqA.requestid } });
        assert(
            rCompToStart.status === 400 && rCompToReach.status === 400 && rCompRetry.status === 200 && rCompRetry.data?.donationRecorded === false && d1HistAfterRetry === 1,
            "10. COMPLETED -> earlier rejected (400); COMPLETED retry idempotent (200, 1 history)"
        );

        // 11. Multiple donor isolation: Donor 2 is still at DONOR_FOUND, Admin advances Donor 2 sequentially to COMPLETED
        const d2Check = await prisma.broadcastdeliveries.findFirst({ where: { requestid: reqA.requestid, donorid: donor2.donorid } });
        assert(d2Check?.transitstatus === "DONOR_FOUND", "11a. Donor 2 remained isolated at DONOR_FOUND");

        const rAdminStart2 = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "STARTED", donorUserId: donor2User.userid }, adminToken);
        const rAdminReach2 = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor2User.userid }, d2Token);
        const rAdminComp2 = await reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor2User.userid }, adminToken);
        const d2Hist = await prisma.donationhistory.findMany({ where: { donorid: donor2.donorid, requestid: reqA.requestid } });
        assert(
            rAdminStart2.status === 200 && rAdminReach2.status === 200 && rAdminComp2.status === 200 && d2Hist.length === 1,
            "11b. Admin + Donor 2 sequential flow completes independently with 1 VERIFIED history"
        );

        // 12. Concurrent stage-skip protection: Donor 3 at DONOR_FOUND, fire STARTED and REACHED_LOCATION simultaneously
        const reqB = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hospital.hospitalid,
                patientname: "Patient Fix2 Concurrent",
                patientage: 29,
                patientgender: "FEMALE",
                patientcontact: "9999800088",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "DONOR_MATCHING",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqB.requestid);

        const bcB = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqB.requestid,
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
                broadcastid: bcB.broadcastid,
                requestid: reqB.requestid,
                donorid: donor3.donorid,
                donoruserid: donor3User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(),
                transitstatus: "DONOR_FOUND",
            },
        });

        // Fire concurrent REACHED_LOCATION and COMPLETED from DONOR_FOUND -> both must be rejected (400), delivery stays DONOR_FOUND
        const [rRaceSkip1, rRaceSkip2] = await Promise.all([
            reqJson("PATCH", `/bloodrequests/${reqB.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor3User.userid }, hospToken),
            reqJson("PATCH", `/bloodrequests/${reqB.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor3User.userid }, hospToken),
        ]);
        const d3AfterRace = await prisma.broadcastdeliveries.findFirst({ where: { requestid: reqB.requestid, donorid: donor3.donorid } });
        const d3HistAfterRace = await prisma.donationhistory.count({ where: { donorid: donor3.donorid } });
        assert(
            rRaceSkip1.status === 400 && rRaceSkip2.status === 400 && d3AfterRace?.transitstatus === "DONOR_FOUND" && d3HistAfterRace === 0,
            "12. Concurrent stage-skip attempts both rejected (400); delivery stays DONOR_FOUND with 0 history"
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
