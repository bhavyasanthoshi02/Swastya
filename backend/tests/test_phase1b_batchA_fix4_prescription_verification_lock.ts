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

    console.log(`\n=== SWASTYA PHASE 1B BATCH A FIX 4: PRESCRIPTION VERIFICATION LOCKING (${baseUrl}) ===\n`);

    const tag = crypto.randomUUID().slice(0, 8);
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        const hospUser = await prisma.users.create({
            data: { name: `BA4 Hosp ${tag}`, email: `ba4-hosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const otherHospUser = await prisma.users.create({
            data: { name: `BA4 OtherHosp ${tag}`, email: `ba4-ohosp-${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const reqUser = await prisma.users.create({
            data: { name: `BA4 Req ${tag}`, email: `ba4-req-${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        createdUserIds.push(hospUser.userid, otherHospUser.userid, reqUser.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `BA4 Hospital ${tag}`,
                registrationnumber: `REG-BA4-${tag}`,
                address: "1 BA4 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. BA4",
                contactpersonphone: "9999200001",
                approvalstatus: "APPROVED",
            },
        });
        await prisma.hospitals.create({
            data: {
                userid: otherHospUser.userid,
                hospitalname: `BA4 Other ${tag}`,
                registrationnumber: `REG-BA4-O-${tag}`,
                address: "2 BA4 St",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. Other",
                contactpersonphone: "9999200002",
                approvalstatus: "APPROVED",
            },
        });

        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "3 BA4 St", city: "Pune", state: "MH", pincode: "411001" },
        });

        const hospToken = generateToken(hospUser.userid, "HOSPITAL");
        const otherHospToken = generateToken(otherHospUser.userid, "HOSPITAL");
        const reqToken = generateToken(reqUser.userid, "REQUESTER");

        async function createReqWithRx(status: any, rxStatus: any = "PENDING") {
            const req = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: reqUser.userid,
                    requesterid: requester.requesterid,
                    hospitalid: hospital.hospitalid,
                    patientname: `BA4 Patient ${tag}`,
                    patientage: 35,
                    patientgender: "MALE",
                    patientcontact: "9999200010",
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 1,
                    urgencylevel: "HIGH",
                    status,
                    isemergency: false,
                    requiredby: new Date(Date.now() + 86400000),
                },
            });
            createdRequestIds.push(req.requestid);

            const rx = await prisma.prescription.create({
                data: {
                    requestid: req.requestid,
                    fileurl: `https://test.local/rx-ba4-${req.requestid}.pdf`,
                    originalfilename: "rx.pdf",
                    mimetype: "application/pdf",
                    filesize: 1024,
                    doctorname: "Dr. BA4",
                    hospitalname: hospital.hospitalname,
                    status: rxStatus,
                },
            });
            return { req, rx };
        }

        // 1, 6, 7: Authorization, Normal Verification, and Idempotent Repeat
        const { req: rNormal } = await createReqWithRx("CREATED", "PENDING");
        const rUnauthReq = await reqJson("POST", `/bloodrequests/${rNormal.requestid}/prescription/verify`, { status: "VERIFIED" }, reqToken);
        const rUnauthHosp = await reqJson("POST", `/bloodrequests/${rNormal.requestid}/prescription/verify`, { status: "VERIFIED" }, otherHospToken);
        assert(rUnauthReq.status === 403 && rUnauthHosp.status === 403, "6. Requester and unassigned hospital rejected with 403");

        const rVerify1 = await reqJson("POST", `/bloodrequests/${rNormal.requestid}/prescription/verify`, { status: "VERIFIED", remarks: "Valid" }, hospToken);
        const rxHist1 = await prisma.prescriptionhistory.count({ where: { requestid: rNormal.requestid } });
        const statusHist1 = await prisma.requeststatushistory.count({ where: { requestid: rNormal.requestid } });
        const notif1 = await prisma.notification.count({ where: { requestid: rNormal.requestid } });
        assert(
            rVerify1.status === 200 && rVerify1.data?.prescription?.status === "VERIFIED" && rxHist1 === 1 && statusHist1 === 1 && notif1 === 1,
            "1. Normal verification succeeds (200) with 1 audit/history/notification"
        );

        const rVerifyRepeat = await reqJson("POST", `/bloodrequests/${rNormal.requestid}/prescription/verify`, { status: "VERIFIED", remarks: "Valid again" }, hospToken);
        const rxHistRepeat = await prisma.prescriptionhistory.count({ where: { requestid: rNormal.requestid } });
        const statusHistRepeat = await prisma.requeststatushistory.count({ where: { requestid: rNormal.requestid } });
        const notifRepeat = await prisma.notification.count({ where: { requestid: rNormal.requestid } });
        assert(
            rVerifyRepeat.status === 200 && rxHistRepeat === 1 && statusHistRepeat === 1 && notifRepeat === 1,
            "7. Repeated VERIFIED call is idempotent without duplicate history or notifications"
        );

        // 2, 3, 4, 5, 9: Terminal & BLOOD_ARRANGED requests reject verification with 0 partial changes
        for (const [label, blockedStatus] of [
            ["2. CANCELLED", "CANCELLED"],
            ["3. EXPIRED", "EXPIRED"],
            ["4. FULFILLED", "FULFILLED"],
            ["5. BLOOD_ARRANGED", "BLOOD_ARRANGED"],
        ] as const) {
            const { req: rBlocked, rx: rxBlocked } = await createReqWithRx(blockedStatus, "PENDING");
            const rRes = await reqJson("POST", `/bloodrequests/${rBlocked.requestid}/prescription/verify`, { status: "VERIFIED" }, hospToken);
            const rxAfter = await prisma.prescription.findUnique({ where: { prescriptionid: rxBlocked.prescriptionid } });
            const rxHistAfter = await prisma.prescriptionhistory.count({ where: { requestid: rBlocked.requestid } });
            const statusHistAfter = await prisma.requeststatushistory.count({ where: { requestid: rBlocked.requestid } });
            const notifAfter = await prisma.notification.count({ where: { requestid: rBlocked.requestid } });
            assert(
                rRes.status === 400 &&
                    rxAfter?.status === "PENDING" &&
                    rxHistAfter === 0 &&
                    statusHistAfter === 0 &&
                    notifAfter === 0,
                `${label} request rejects verification (400) with 0 partial audit/history/notification changes`
            );
        }

        // 10. Rejection path (PENDING -> REJECTED) still works cleanly
        const { req: rRej } = await createReqWithRx("CREATED", "PENDING");
        const rRejRes = await reqJson("POST", `/bloodrequests/${rRej.requestid}/prescription/verify`, { status: "REJECTED", remarks: "Blurry scan" }, hospToken);
        assert(rRejRes.status === 200 && rRejRes.data?.prescription?.status === "REJECTED", "10. Prescription rejection (PENDING -> REJECTED) still works");

        // 8. Concurrent cancellation vs verification serializes cleanly under bloodrequests FOR UPDATE
        const { req: rRace, rx: rxRace } = await createReqWithRx("CREATED", "PENDING");
        const [resCancelRace, resVerifyRace] = await Promise.all([
            reqJson("PUT", `/bloodrequests/${rRace.requestid}`, { status: "CANCELLED" }, reqToken),
            reqJson("POST", `/bloodrequests/${rRace.requestid}/prescription/verify`, { status: "VERIFIED", remarks: "Race check" }, hospToken),
        ]);
        const rRaceAfter = await prisma.bloodrequests.findUnique({ where: { requestid: rRace.requestid } });
        const rxRaceAfter = await prisma.prescription.findUnique({ where: { prescriptionid: rxRace.prescriptionid } });
        const postCancelVerify = await reqJson("POST", `/bloodrequests/${rRace.requestid}/prescription/verify`, { status: "VERIFIED" }, hospToken);

        const validRaceOutcome =
            resCancelRace.status === 200 &&
            rRaceAfter?.status === "CANCELLED" &&
            postCancelVerify.status === 400 &&
            ((resVerifyRace.status === 400 && rxRaceAfter?.status === "PENDING") ||
                (resVerifyRace.status === 200 && rxRaceAfter?.status === "VERIFIED"));
        assert(
            validRaceOutcome,
            "8. Concurrent cancellation vs verification serializes cleanly and blocks post-cancel verification",
            `cancel=${resCancelRace.status}, verify=${resVerifyRace.status}, rx=${rxRaceAfter?.status}, postCancel=${postCancelVerify.status}`
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
