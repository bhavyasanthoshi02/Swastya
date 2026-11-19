import "dotenv/config";
import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";

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

    console.log(`\n=== SWASTYA PHASE 1B BATCH A FIX 5: MULTI-UNIT COMPLETION (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const hospUser = await prisma.users.create({
            data: { name: `BA5 Hosp ${tag}`, email: `ba5-hosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const reqUser = await prisma.users.create({
            data: { name: `BA5 Req ${tag}`, email: `ba5-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        createdUserIds.push(hospUser.userid, reqUser.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `BA5 Hospital ${tag}`,
                registrationnumber: `REG-BA5-${tag}`,
                address: "1 BA5 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. BA5",
                contactpersonphone: "9999100001",
                approvalstatus: "APPROVED",
            },
        });
        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "2 BA5 St", city: "Pune", state: "MH", pincode: "411001" },
        });

        async function createDonor(idx: number) {
            const u = await prisma.users.create({
                data: { name: `BA5 D${idx} ${tag}`, email: `ba5-d${idx}-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
            });
            createdUserIds.push(u.userid);
            const d = await prisma.donors.create({
                data: {
                    userid: u.userid,
                    bloodgroup: "O_POSITIVE",
                    dateofbirth: new Date("1995-01-01"),
                    gender: "MALE",
                    address: `D${idx}`,
                    city: "Pune",
                    state: "MH",
                    pincode: "411001",
                    availabilitystatus: "AVAILABLE",
                    iseligible: true,
                    lastdonationdate: null,
                },
            });
            return { user: u, donor: d };
        }

        const d1 = await createDonor(1);
        const d2 = await createDonor(2);
        const d3 = await createDonor(3);
        const d4 = await createDonor(4);
        const d5 = await createDonor(5);
        const d6 = await createDonor(6);
        const d7 = await createDonor(7);

        const hospToken = generateToken(hospUser.userid, "HOSPITAL");

        async function createVerifiedRequest(unitsrequired: number, status: any = "DONOR_MATCHING") {
            const req = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: reqUser.userid,
                    requesterid: requester.requesterid,
                    hospitalid: hospital.hospitalid,
                    patientname: `BA5 P${unitsrequired} ${tag}`,
                    patientage: 35,
                    patientgender: "MALE",
                    patientcontact: "9999100099",
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired,
                    urgencylevel: "HIGH",
                    status,
                    isemergency: false,
                    requiredby: new Date(Date.now() + 86400000),
                },
            });
            createdRequestIds.push(req.requestid);

            await prisma.prescription.create({
                data: {
                    requestid: req.requestid,
                    fileurl: `https://test.local/rx-ba5-${req.requestid}.pdf`,
                    originalfilename: "rx.pdf",
                    mimetype: "application/pdf",
                    filesize: 1024,
                    doctorname: "Dr. BA5",
                    hospitalname: hospital.hospitalname,
                    status: "VERIFIED",
                    verifiedbyhospitalid: hospital.hospitalid,
                },
            });

            const bc = await prisma.emergencybroadcasts.create({
                data: {
                    requestid: req.requestid,
                    triggeredbyuserid: reqUser.userid,
                    triggertype: "DIRECT_VOLUNTEER",
                    radiuskm: 10,
                    status: "DONOR_RESPONDED",
                    totalmatched: 1,
                    totalnotified: 0,
                    totalresponded: 1,
                },
            });
            return { req, bc };
        }

        async function addDelivery(bcId: string, reqId: string, d: { user: any; donor: any }, transitstatus = "REACHED_LOCATION") {
            return await prisma.broadcastdeliveries.create({
                data: {
                    broadcastid: bcId,
                    requestid: reqId,
                    donorid: d.donor.donorid,
                    donoruserid: d.user.userid,
                    matchtype: "DIRECT_VOLUNTEER",
                    deliverystatus: "RESPONDED",
                    response: "ACCEPTED",
                    respondedat: new Date(),
                    transitstatus,
                },
            });
        }

        // 1. One-unit request becomes BLOOD_ARRANGED after 1 valid completion
        const { req: req1, bc: bc1 } = await createVerifiedRequest(1);
        await addDelivery(bc1.broadcastid, req1.requestid, d1, "REACHED_LOCATION");
        const r1 = await reqJson("PATCH", `/bloodrequests/${req1.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d1.user.userid }, hospToken);
        const req1After = await prisma.bloodrequests.findUnique({ where: { requestid: req1.requestid } });
        assert(
            r1.status === 200 && r1.data?.completedUnits === 1 && r1.data?.bloodArranged === true && req1After?.status === "BLOOD_ARRANGED",
            "1. One-unit request transitions to BLOOD_ARRANGED after 1 completion"
        );

        // 2, 3, 4, 5, 7, 8, 10: Multi-unit (2-unit) request with 3 donors (2 REACHED_LOCATION, 1 STARTED incomplete)
        const { req: req2, bc: bc2 } = await createVerifiedRequest(2);
        await addDelivery(bc2.broadcastid, req2.requestid, d2, "REACHED_LOCATION");
        await addDelivery(bc2.broadcastid, req2.requestid, d3, "REACHED_LOCATION");
        await addDelivery(bc2.broadcastid, req2.requestid, d4, "STARTED"); // Incomplete commitment

        // First partial completion (d2) -> stays DONOR_MATCHING, 0 BLOOD_ARRANGED history
        const r2First = await reqJson("PATCH", `/bloodrequests/${req2.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d2.user.userid }, hospToken);
        const req2AfterFirst = await prisma.bloodrequests.findUnique({ where: { requestid: req2.requestid } });
        const hist2AfterFirst = await prisma.requeststatushistory.count({ where: { requestid: req2.requestid, newstatus: "BLOOD_ARRANGED" } });
        assert(
            r2First.status === 200 &&
                r2First.data?.completedUnits === 1 &&
                r2First.data?.bloodArranged === false &&
                req2AfterFirst?.status === "DONOR_MATCHING" &&
                hist2AfterFirst === 0,
            "2, 5 & 10. 2-unit request stays DONOR_MATCHING after 1st partial completion (incomplete STARTED donor not counted)"
        );

        // Duplicate completion of d2 -> idempotent, does NOT increase completedUnits or arrange request
        const r2Dup = await reqJson("PATCH", `/bloodrequests/${req2.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d2.user.userid }, hospToken);
        const req2AfterDup = await prisma.bloodrequests.findUnique({ where: { requestid: req2.requestid } });
        const d2HistCount = await prisma.donationhistory.count({ where: { donorid: d2.donor.donorid, requestid: req2.requestid } });
        assert(
            r2Dup.status === 200 && r2Dup.data?.donationRecorded === false && req2AfterDup?.status === "DONOR_MATCHING" && d2HistCount === 1,
            "4 & 7. Duplicate completion does not overcount or prematurely arrange request"
        );

        // Second completion (d3) -> reaches 2/2 units -> transitions to BLOOD_ARRANGED with 1 history entry
        const r2Second = await reqJson("PATCH", `/bloodrequests/${req2.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d3.user.userid }, hospToken);
        const req2AfterSecond = await prisma.bloodrequests.findUnique({ where: { requestid: req2.requestid } });
        const hist2AfterSecond = await prisma.requeststatushistory.count({ where: { requestid: req2.requestid, newstatus: "BLOOD_ARRANGED" } });
        const d2After = await prisma.donors.findUnique({ where: { donorid: d2.donor.donorid } });
        const d3After = await prisma.donors.findUnique({ where: { donorid: d3.donor.donorid } });
        const d4After = await prisma.donors.findUnique({ where: { donorid: d4.donor.donorid } });
        assert(
            r2Second.status === 200 &&
                r2Second.data?.completedUnits === 2 &&
                r2Second.data?.bloodArranged === true &&
                req2AfterSecond?.status === "BLOOD_ARRANGED" &&
                hist2AfterSecond === 1 &&
                d2After?.lastdonationdate !== null &&
                d3After?.lastdonationdate !== null &&
                d4After?.lastdonationdate === null,
            "3, 8 & 10. Request becomes BLOOD_ARRANGED after 2/2 units; 1 history entry; lastdonationdate updated for completed donors only"
        );

        // 6. Concurrent completions on a 3-unit request (2 donors complete concurrently -> stays DONOR_MATCHING at 2/3; 3rd completes -> BLOOD_ARRANGED)
        const { req: req3, bc: bc3 } = await createVerifiedRequest(3);
        await addDelivery(bc3.broadcastid, req3.requestid, d5, "REACHED_LOCATION");
        await addDelivery(bc3.broadcastid, req3.requestid, d6, "REACHED_LOCATION");
        await addDelivery(bc3.broadcastid, req3.requestid, d7, "REACHED_LOCATION");

        const [r3Conc1, r3Conc2] = await Promise.all([
            reqJson("PATCH", `/bloodrequests/${req3.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d5.user.userid }, hospToken),
            reqJson("PATCH", `/bloodrequests/${req3.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d6.user.userid }, hospToken),
        ]);
        const req3Mid = await prisma.bloodrequests.findUnique({ where: { requestid: req3.requestid } });
        const req3HistMid = await prisma.donationhistory.count({ where: { requestid: req3.requestid } });
        assert(
            r3Conc1.status === 200 && r3Conc2.status === 200 && req3HistMid === 2 && req3Mid?.status === "DONOR_MATCHING",
            "6a. Concurrent 2/3 completions on 3-unit request record 2 donations and keep status DONOR_MATCHING"
        );

        const r3Final = await reqJson("PATCH", `/bloodrequests/${req3.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d7.user.userid }, hospToken);
        const req3End = await prisma.bloodrequests.findUnique({ where: { requestid: req3.requestid } });
        const req3HistEnd = await prisma.requeststatushistory.count({ where: { requestid: req3.requestid, newstatus: "BLOOD_ARRANGED" } });
        assert(
            r3Final.status === 200 && r3Final.data?.completedUnits === 3 && req3End?.status === "BLOOD_ARRANGED" && req3HistEnd === 1,
            "6b. 3rd completion reaches 3/3 units and transitions to BLOOD_ARRANGED once"
        );

        // 9. Terminal request remains protected
        const { req: reqTerm, bc: bcTerm } = await createVerifiedRequest(1, "CANCELLED");
        await addDelivery(bcTerm.broadcastid, reqTerm.requestid, d1, "REACHED_LOCATION");
        const rTerm = await reqJson("PATCH", `/bloodrequests/${reqTerm.requestid}/transit-status`, { status: "COMPLETED", donorUserId: d1.user.userid }, hospToken);
        assert(rTerm.status === 400, "9. Terminal CANCELLED request remains protected (400)");

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    } finally {
        try {
            if (createdRequestIds.length > 0) {
                await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.donationhistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.prescriptionhistory.deleteMany({
                    where: { prescription: { requestid: { in: createdRequestIds } } },
                });
                await prisma.prescription.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.broadcastdeliveries.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.emergencybroadcasts.deleteMany({ where: { requestid: { in: createdRequestIds } } });
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
