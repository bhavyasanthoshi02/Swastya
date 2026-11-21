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

    console.log(`\n=== SWASTYA PHASE 1B BATCH A FIX 3: CLINICAL FIELD IMMUTABILITY (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const hospUser = await prisma.users.create({
            data: { name: `BA3 Hosp ${tag}`, email: `ba3-hosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const reqUser = await prisma.users.create({
            data: { name: `BA3 Req ${tag}`, email: `ba3-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const donorUser = await prisma.users.create({
            data: { name: `BA3 Donor ${tag}`, email: `ba3-d-${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(hospUser.userid, reqUser.userid, donorUser.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `BA3 Hospital ${tag}`,
                registrationnumber: `REG-BA3-${tag}`,
                address: "1 BA3 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. BA3",
                contactpersonphone: "9999300001",
                approvalstatus: "APPROVED",
            },
        });

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "2 BA3 St", city: "Pune", state: "MH", pincode: "411001" },
        });

        const donor = await prisma.donors.create({
            data: {
                userid: donorUser.userid,
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

        const reqToken = generateToken(reqUser.userid, "REQUESTER");
        const hospToken = generateToken(hospUser.userid, "HOSPITAL");
        const donorToken = generateToken(donorUser.userid, "DONOR");

        // 1 & 10. Editable before clinical processing begins, but null/invalid clinical values rejected (400)
        const req1 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `BA3 Patient ${tag}`,
                patientage: 30,
                patientgender: "MALE",
                patientcontact: "9999300010",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req1.requestid);

        await prisma.prescription.create({
            data: {
                requestid: req1.requestid,
                fileurl: `https://test.local/rx-ba3-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. BA3",
                hospitalname: hospital.hospitalname,
                status: "PENDING",
            },
        });

        const rNullBg = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { bloodgroup: null }, reqToken);
        const rInvalidBg = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { bloodgroup: "Z_PLUS" }, reqToken);
        const rNullComp = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { bloodcomponent: null }, reqToken);
        const rZeroUnits = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { unitsrequired: 0 }, reqToken);
        const rNullUnits = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { unitsrequired: null }, reqToken);
        assert(
            rNullBg.status === 400 &&
                rInvalidBg.status === 400 &&
                rNullComp.status === 400 &&
                rZeroUnits.status === 400 &&
                rNullUnits.status === 400,
            "10. Null and invalid clinical values rejected with 400"
        );

        const rValidEarly = await reqJson(
            "PUT",
            `/bloodrequests/${req1.requestid}`,
            { bloodgroup: "O_POSITIVE", bloodcomponent: "RBC", unitsrequired: 2 },
            reqToken
        );
        assert(
            rValidEarly.status === 200 &&
                rValidEarly.data?.bloodgroup === "O_POSITIVE" &&
                rValidEarly.data?.bloodcomponent === "RBC" &&
                rValidEarly.data?.unitsrequired === 2,
            "1. Clinical fields editable before prescription verification or donor matching"
        );

        // Verify prescription -> now VERIFIED
        const rVerify = await reqJson(
            "POST",
            `/bloodrequests/${req1.requestid}/prescription/verify`,
            { status: "VERIFIED", remarks: "Confirmed" },
            hospToken
        );
        assert(rVerify.status === 200, "1b. Prescription verified");

        // 2, 3, 4, 12: Changes to bloodgroup, bloodcomponent, unitsrequired blocked after VERIFIED, leaving DB unchanged
        const rBlockBg = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { bloodgroup: "A_NEGATIVE" }, reqToken);
        const rBlockComp = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { bloodcomponent: "PLASMA" }, reqToken);
        const rBlockUnits = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { unitsrequired: 4 }, reqToken);
        const req1AfterBlocks = await prisma.bloodrequests.findUnique({ where: { requestid: req1.requestid } });
        assert(
            rBlockBg.status === 400 &&
                rBlockComp.status === 400 &&
                rBlockUnits.status === 400 &&
                req1AfterBlocks?.bloodgroup === "O_POSITIVE" &&
                req1AfterBlocks?.bloodcomponent === "RBC" &&
                req1AfterBlocks?.unitsrequired === 2,
            "2, 3, 4 & 12. Clinical changes blocked (400) after VERIFIED and DB records unchanged"
        );

        // 7, 8, 9: Unrelated fields, omitted clinical fields, and unchanged clinical/patient values succeed
        const rUnchanged = await reqJson(
            "PUT",
            `/bloodrequests/${req1.requestid}`,
            {
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "RBC",
                unitsrequired: 2,
                patientname: `BA3 Patient ${tag}`,
                notes: "Updated patient ward",
                searchradius: 25,
            },
            reqToken
        );
        const rOmitted = await reqJson("PUT", `/bloodrequests/${req1.requestid}`, { notes: "Ward 4B" }, reqToken);
        assert(
            rUnchanged.status === 200 &&
                rUnchanged.data?.notes === "Updated patient ward" &&
                rUnchanged.data?.searchradius === 25 &&
                rOmitted.status === 200 &&
                rOmitted.data?.notes === "Ward 4B",
            "7, 8 & 9. Unrelated fields, unchanged clinical values, and omitted clinical fields succeed (200)"
        );

        // 5 & 6: Blocked when DONOR_MATCHING or ACCEPTED commitment exists (even when prescription is PENDING)
        const req2 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `BA3 Matching ${tag}`,
                patientage: 40,
                patientgender: "FEMALE",
                patientcontact: "9999300020",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                status: "DONOR_MATCHING",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req2.requestid);

        const rBlockMatching = await reqJson("PUT", `/bloodrequests/${req2.requestid}`, { unitsrequired: 5 }, reqToken);
        assert(rBlockMatching.status === 400, "5. Clinical field edit blocked (400) when status is DONOR_MATCHING");

        // Request still CREATED but has an ACCEPTED broadcastdelivery
        const req3 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `BA3 Committed ${tag}`,
                patientage: 45,
                patientgender: "MALE",
                patientcontact: "9999300030",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                status: "CREATED",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req3.requestid);

        const bc3 = await prisma.emergencybroadcasts.create({
            data: {
                requestid: req3.requestid,
                triggeredbyuserid: reqUser.userid,
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
                broadcastid: bc3.broadcastid,
                requestid: req3.requestid,
                donorid: donor.donorid,
                donoruserid: donorUser.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(),
                transitstatus: "DONOR_FOUND",
            },
        });

        const rBlockCommitted = await reqJson("PUT", `/bloodrequests/${req3.requestid}`, { bloodgroup: "B_POSITIVE" }, reqToken);
        assert(rBlockCommitted.status === 400, "6. Clinical field edit blocked (400) when an ACCEPTED commitment exists");

        // 11. Concurrent donor response vs clinical update (bloodgroup change to AB_NEGATIVE which is incompatible with O+ donor)
        const req4 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `BA3 Race ${tag}`,
                patientage: 28,
                patientgender: "MALE",
                patientcontact: "9999300040",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(req4.requestid);

        const [resPutRace, resDonorRace] = await Promise.all([
            reqJson("PUT", `/bloodrequests/${req4.requestid}`, { bloodgroup: "AB_NEGATIVE" }, reqToken),
            reqJson("POST", `/bloodrequests/${req4.requestid}/respond`, { screeningAnswers: { drinksAlcohol: false, alcoholInPast24Hours: false, feelingHealthy: true, recentAntibioticsOrMedication: false, recentTattooOrSurgery: false, donatedInLast90Days: false, chronicIllness: false, isPregnantOrBreastfeeding: false } }, donorToken),
        ]);
        const req4After = await prisma.bloodrequests.findUnique({ where: { requestid: req4.requestid } });
        const del4Count = await prisma.broadcastdeliveries.count({ where: { requestid: req4.requestid, response: "ACCEPTED" } });

        // Either donor won first (req4 stays O_POSITIVE, PUT returned 400, del4Count=1)
        // OR PUT won first (req4 became AB_NEGATIVE, donor O+ incompatible -> respond returned 400, del4Count=0)
        const validSerialized =
            (resDonorRace.status === 200 && resPutRace.status === 400 && req4After?.bloodgroup === "O_POSITIVE" && del4Count === 1) ||
            (resPutRace.status === 200 && resDonorRace.status === 400 && req4After?.bloodgroup === "AB_NEGATIVE" && del4Count === 0);
        assert(
            validSerialized,
            "11. Concurrent donor response and clinical update serialize cleanly without mismatched commitment",
            `put=${resPutRace.status}, respond=${resDonorRace.status}, bg=${req4After?.bloodgroup}, dels=${del4Count}`
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
