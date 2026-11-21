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

    console.log(`\n=== SWASTYA PHASE 1B BATCH A FIX 2: REJECTED PRESCRIPTION PROTECTION (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const city = `BA2City_${tag}`;
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const hospUser = await prisma.users.create({
            data: { name: `BA2 Hosp ${tag}`, email: `ba2-hosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const reqUser = await prisma.users.create({
            data: { name: `BA2 Req ${tag}`, email: `ba2-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const d1User = await prisma.users.create({
            data: { name: `BA2 D1 ${tag}`, email: `ba2-d1-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const d2User = await prisma.users.create({
            data: { name: `BA2 D2 ${tag}`, email: `ba2-d2-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(hospUser.userid, reqUser.userid, d1User.userid, d2User.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `BA2 Hospital ${tag}`,
                registrationnumber: `REG-BA2-${tag}`,
                address: "1 BA2 St",
                city,
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. BA2",
                contactpersonphone: "9999400001",
                approvalstatus: "APPROVED",
            },
        });

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "2 BA2 St", city, state: "MH", pincode: "411001" },
        });

        await prisma.donors.create({
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
        await prisma.donors.create({
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

        const hospToken = generateToken(hospUser.userid, "HOSPITAL");
        const d1Token = generateToken(d1User.userid, "DONOR");
        const d2Token = generateToken(d2User.userid, "DONOR");

        // 1, 2, 3, 4: REJECTED prescription blocks volunteering with 0 deliveries, 0 broadcast increments, 0 notifications
        const reqRej = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `BA2 Rej ${tag}`,
                patientage: 35,
                patientgender: "MALE",
                patientcontact: "9999400010",
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
        createdRequestIds.push(reqRej.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqRej.requestid,
                fileurl: `https://test.local/rx-ba2-rej-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. BA2",
                hospitalname: hospital.hospitalname,
                status: "REJECTED",
                verifiedbyhospitalid: hospital.hospitalid,
                remarks: "Illegible prescription",
            },
        });

        const bcastRej = await triggerEmergencyBroadcast({
            requestId: reqRej.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "REQUEST_CREATION",
            radiusKm: 15,
        });
        assert(bcastRej.success === true, "1a. Emergency broadcast seeded for reqRej");

        const notifsBeforeRej = await prisma.notification.count({ where: { requestid: reqRej.requestid } });
        const delsBeforeRej = await prisma.broadcastdeliveries.count({ where: { requestid: reqRej.requestid, response: "ACCEPTED" } });

        const rRejVol = await reqJson("POST", `/bloodrequests/${reqRej.requestid}/respond`, { screeningAnswers: { drinksAlcohol: false, alcoholInPast24Hours: false, feelingHealthy: true, recentAntibioticsOrMedication: false, recentTattooOrSurgery: false, donatedInLast90Days: false, chronicIllness: false, isPregnantOrBreastfeeding: false } }, d1Token);
        const notifsAfterRej = await prisma.notification.count({ where: { requestid: reqRej.requestid } });
        const delsAfterRej = await prisma.broadcastdeliveries.count({ where: { requestid: reqRej.requestid, response: "ACCEPTED" } });
        const bcastAfterRej = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: bcastRej.broadcastId } });
        const reqRejAfter = await prisma.bloodrequests.findUnique({ where: { requestid: reqRej.requestid } });

        assert(
            rRejVol.status === 400 && String(rRejVol.data?.message || "").toLowerCase().includes("rejected"),
            "1. REJECTED prescription blocks donor volunteering with HTTP 400"
        );
        assert(
            delsBeforeRej === 0 && delsAfterRej === 0,
            "2. No ACCEPTED delivery record created for rejected prescription"
        );
        assert(
            bcastAfterRej?.totalresponded === 0 && bcastAfterRej?.status === "ACTIVE",
            "3. Broadcast totalresponded remains 0 and status remains ACTIVE"
        );
        assert(
            notifsAfterRej === notifsBeforeRej && reqRejAfter?.status === "CREATED",
            "4. No confirmation notification created and request status stays CREATED"
        );

        // 5, 6, 8, 9: VERIFIED prescription permits volunteering, DIRECT_VOLUNTEER=1, duplicate blocked, dedup intact
        const reqVer = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `BA2 Ver ${tag}`,
                patientage: 40,
                patientgender: "FEMALE",
                patientcontact: "9999400020",
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
        createdRequestIds.push(reqVer.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqVer.requestid,
                fileurl: `https://test.local/rx-ba2-ver-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. BA2",
                hospitalname: hospital.hospitalname,
                status: "VERIFIED",
                verifiedbyhospitalid: hospital.hospitalid,
            },
        });

        const rVerVol = await reqJson("POST", `/bloodrequests/${reqVer.requestid}/respond`, { screeningAnswers: { drinksAlcohol: false, alcoholInPast24Hours: false, feelingHealthy: true, recentAntibioticsOrMedication: false, recentTattooOrSurgery: false, donatedInLast90Days: false, chronicIllness: false, isPregnantOrBreastfeeding: false } }, d1Token);
        const dvVer = await prisma.emergencybroadcasts.findFirst({ where: { requestid: reqVer.requestid } });
        assert(
            rVerVol.status === 200 && dvVer?.triggertype === "DIRECT_VOLUNTEER" && dvVer?.totalresponded === 1,
            "5 & 8. VERIFIED prescription allows volunteering and DIRECT_VOLUNTEER totalresponded=1"
        );

        const rVerDup = await reqJson("POST", `/bloodrequests/${reqVer.requestid}/respond`, { screeningAnswers: { drinksAlcohol: false, alcoholInPast24Hours: false, feelingHealthy: true, recentAntibioticsOrMedication: false, recentTattooOrSurgery: false, donatedInLast90Days: false, chronicIllness: false, isPregnantOrBreastfeeding: false } }, d1Token);
        assert(rVerDup.status === 400, "6. Duplicate response remains protected (400)");

        const bcastVer1 = await triggerEmergencyBroadcast({
            requestId: reqVer.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
            radiusKm: 15,
        });
        const bcastVer2 = await triggerEmergencyBroadcast({
            requestId: reqVer.requestid,
            triggeredByUserId: reqUser.userid,
            triggerType: "MANUAL_TRIGGER",
            radiusKm: 15,
        });
        assert(
            bcastVer1.success === true && !bcastVer1.alreadyActive && bcastVer2.alreadyActive === true,
            "9. Broadcast deduplication remains intact alongside DIRECT_VOLUNTEER"
        );

        // 7. Concurrent prescription rejection vs donor response on PENDING prescription
        const reqConc = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `BA2 Conc ${tag}`,
                patientage: 29,
                patientgender: "MALE",
                patientcontact: "9999400030",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                isemergency: false,
                searchradius: 15,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqConc.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqConc.requestid,
                fileurl: `https://test.local/rx-ba2-conc-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. BA2",
                hospitalname: hospital.hospitalname,
                status: "PENDING",
            },
        });

        const [resReject, resVolConc] = await Promise.all([
            reqJson(
                "POST",
                `/bloodrequests/${reqConc.requestid}/prescription/verify`,
                { status: "REJECTED", remarks: "Invalid signature" },
                hospToken
            ),
            reqJson("POST", `/bloodrequests/${reqConc.requestid}/respond`, { screeningAnswers: { drinksAlcohol: false, alcoholInPast24Hours: false, feelingHealthy: true, recentAntibioticsOrMedication: false, recentTattooOrSurgery: false, donatedInLast90Days: false, chronicIllness: false, isPregnantOrBreastfeeding: false } }, d2Token),
        ]);

        // After concurrent race settles, prescription is REJECTED; any SUBSEQUENT donor response MUST be blocked (400)
        const rPostRace = await reqJson("POST", `/bloodrequests/${reqConc.requestid}/respond`, { screeningAnswers: { drinksAlcohol: false, alcoholInPast24Hours: false, feelingHealthy: true, recentAntibioticsOrMedication: false, recentTattooOrSurgery: false, donatedInLast90Days: false, chronicIllness: false, isPregnantOrBreastfeeding: false } }, d1Token);
        assert(
            resReject.status === 200 &&
                (resVolConc.status === 400 || resVolConc.status === 200) &&
                rPostRace.status === 400,
            "7. Concurrent prescription rejection vs donor response serializes cleanly and blocks subsequent volunteering (400)"
        );

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    } finally {
        try {
            if (createdRequestIds.length > 0) {
                await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
                await prisma.prescriptionhistory.deleteMany({
                    where: { prescription: { requestid: { in: createdRequestIds } } },
                });
                await prisma.prescription.deleteMany({ where: { requestid: { in: createdRequestIds } } });
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
