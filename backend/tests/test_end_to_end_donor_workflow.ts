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
        throw new Error(`Assertion failed: ${name}${detail ? ` (${detail})` : ""}`);
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
    });
    let data: any = null;
    try {
        data = await res.json();
    } catch {}
    return { status: res.status, data };
}

async function runTests() {
    const tag = crypto.randomBytes(4).toString("hex");
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        await new Promise<void>((resolve) => {
            server = app.listen(0, () => {
                const addr: any = server.address();
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        const reqUser = await prisma.users.create({
            data: { name: `E2E Req ${tag}`, email: `e2e_req_${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const otherReqUser = await prisma.users.create({
            data: { name: `E2E OtherReq ${tag}`, email: `e2e_oreq_${tag}@test.local`, password: "x", role: "REQUESTER", isactive: true },
        });
        const hospUser = await prisma.users.create({
            data: { name: `E2E Hosp ${tag}`, email: `e2e_hosp_${tag}@test.local`, password: "x", role: "HOSPITAL", isactive: true },
        });
        const donor1User = await prisma.users.create({
            data: { name: `E2E Donor1 ${tag}`, email: `e2e_d1_${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        const donor2User = await prisma.users.create({
            data: { name: `E2E Donor2 ${tag}`, email: `e2e_d2_${tag}@test.local`, password: "x", role: "DONOR", isactive: true },
        });
        createdUserIds.push(reqUser.userid, otherReqUser.userid, hospUser.userid, donor1User.userid, donor2User.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `E2E Hospital ${tag}`,
                registrationnumber: `REG-E2E-${tag}`,
                address: "100 Medical Way",
                city: "Pune",
                state: "MH",
                pincode: "411001",
                contactpersonname: "Dr. E2E",
                contactpersonphone: "9999700001",
                approvalstatus: "APPROVED",
            },
        });
        const requester = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "10 Req St", city: "Pune", state: "MH", pincode: "411001" },
        });
        await prisma.requesters.create({
            data: { userid: otherReqUser.userid, address: "11 Req St", city: "Pune", state: "MH", pincode: "411001" },
        });

        await prisma.donors.create({
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
        await prisma.donors.create({
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

        const reqToken = makeToken(reqUser.userid, "REQUESTER");
        const otherReqToken = makeToken(otherReqUser.userid, "REQUESTER");
        const hospToken = makeToken(hospUser.userid, "HOSPITAL");
        const d1Token = makeToken(donor1User.userid, "DONOR");
        const d2Token = makeToken(donor2User.userid, "DONOR");

        const bloodReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `E2E Patient ${tag}`,
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9999700099",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                status: "VERIFIED",
                isemergency: true,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(bloodReq.requestid);

        await prisma.prescription.create({
            data: {
                requestid: bloodReq.requestid,
                fileurl: `https://test.local/rx-e2e-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. E2E",
                hospitalname: hospital.hospitalname,
                status: "VERIFIED",
                verifiedbyhospitalid: hospital.hospitalid,
            },
        });

        const screeningPayload = {
            estimatedArrival: "30 mins",
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
        };

        // 1. Donor 1 & Donor 2 volunteer
        const rD1Vol = await reqJson("POST", `/bloodrequests/${bloodReq.requestid}/respond`, screeningPayload, d1Token);
        const rD2Vol = await reqJson("POST", `/bloodrequests/${bloodReq.requestid}/respond`, screeningPayload, d2Token);
        assert(
            rD1Vol.status === 200 && rD2Vol.status === 200,
            "1. Both donors volunteer successfully (200)",
            `d1=${rD1Vol.status}:${JSON.stringify(rD1Vol.data)} d2=${rD2Vol.status}:${JSON.stringify(rD2Vol.data)}`
        );

        // 2. Requester sees both with PENDING acceptanceStatus
        const rReqGet1 = await reqJson("GET", `/bloodrequests/${bloodReq.requestid}`, undefined, reqToken);
        const d1VolRow = rReqGet1.data?.volunteers?.find((v: any) => v.donorUserId === donor1User.userid);
        const d2VolRow = rReqGet1.data?.volunteers?.find((v: any) => v.donorUserId === donor2User.userid);
        assert(
            Boolean(d1VolRow?.deliveryId) &&
                Boolean(d2VolRow?.deliveryId) &&
                d1VolRow.acceptanceStatus === "PENDING" &&
                d2VolRow.acceptanceStatus === "PENDING",
            "2. Requester sees both volunteers with PENDING acceptanceStatus"
        );

        // 3. Pending donor cannot start journey
        const rD1PendingStart = await reqJson("PATCH", `/bloodrequests/${bloodReq.requestid}/transit-status`, { status: "STARTED" }, d1Token);
        assert(rD1PendingStart.status === 403, "3. Pending donor rejected (403) when trying to start journey before acceptance");

        // 4. Unauthorized requester cannot decide on volunteer
        const rUnauthDecide = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}/decision`,
            { decision: "ACCEPTED" },
            otherReqToken
        );
        assert(rUnauthDecide.status === 403, "4. Non-owning requester rejected (403) on volunteer decision");

        // 5. Owning requester accepts Donor 1 and rejects Donor 2
        const rAcceptD1 = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}/decision`,
            { decision: "ACCEPTED" },
            reqToken
        );
        const rRejectD2 = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d2VolRow.deliveryId}/decision`,
            { decision: "REJECTED", reason: "Another donor confirmed" },
            reqToken
        );
        assert(
            rAcceptD1.status === 200 &&
                rAcceptD1.data?.acceptanceStatus === "ACCEPTED" &&
                rRejectD2.status === 200 &&
                rRejectD2.data?.acceptanceStatus === "REJECTED",
            "5. Owning requester accepts Donor 1 and rejects Donor 2"
        );

        // 6. Idempotent accept retry & conflicting decision guard
        const rAcceptRetry = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}/decision`,
            { decision: "ACCEPTED" },
            reqToken
        );
        const rConflictReject = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}/decision`,
            { decision: "REJECTED" },
            reqToken
        );
        assert(
            rAcceptRetry.status === 200 && rAcceptRetry.data?.alreadyDecided === true && rConflictReject.status === 409,
            "6. Idempotent accept retry succeeds (200) and conflicting decision returns 409"
        );

        // 7. Rejected Donor 2 cannot start journey
        const rD2RejStart = await reqJson("PATCH", `/bloodrequests/${bloodReq.requestid}/transit-status`, { status: "STARTED" }, d2Token);
        assert(rD2RejStart.status === 403, "7. Rejected donor cannot start journey (403)");

        // 8. Accepted Donor 1 cannot skip STARTED -> REACHED_LOCATION
        const rD1Skip = await reqJson("PATCH", `/bloodrequests/${bloodReq.requestid}/transit-status`, { status: "REACHED_LOCATION" }, d1Token);
        assert(rD1Skip.status === 400, "8. Accepted donor cannot skip STARTED -> REACHED_LOCATION (400)");

        // 9. Requester cannot manually mark STARTED or REACHED_LOCATION
        const rReqStart = await reqJson(
            "PATCH",
            `/bloodrequests/${bloodReq.requestid}/transit-status`,
            { status: "STARTED", deliveryId: d1VolRow.deliveryId },
            reqToken
        );
        const rReqReach = await reqJson(
            "PATCH",
            `/bloodrequests/${bloodReq.requestid}/transit-status`,
            { status: "REACHED_LOCATION", deliveryId: d1VolRow.deliveryId },
            reqToken
        );
        assert(rReqStart.status === 403 && rReqReach.status === 403, "9. Requester cannot manually set STARTED or REACHED_LOCATION (403)");

        // 10. Accepted Donor 1 starts journey and reaches hospital
        const rD1Start = await reqJson("PATCH", `/bloodrequests/${bloodReq.requestid}/transit-status`, { status: "STARTED" }, d1Token);
        const rD1Reach = await reqJson("PATCH", `/bloodrequests/${bloodReq.requestid}/transit-status`, { status: "REACHED_LOCATION" }, d1Token);
        assert(rD1Start.status === 200 && rD1Reach.status === 200, "10. Accepted donor advances STARTED -> REACHED_LOCATION (200)");

        // 11. Donor 1 cannot self-confirm COMPLETED
        const rD1Comp = await reqJson("PATCH", `/bloodrequests/${bloodReq.requestid}/transit-status`, { status: "COMPLETED" }, d1Token);
        assert(rD1Comp.status === 403, "11. Donor cannot self-confirm blood receipt COMPLETED (403)");

        // 12. Unauthorized requester cannot confirm blood receipt
        const rUnauthReceipt = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}/confirm-receipt`,
            {},
            otherReqToken
        );
        assert(rUnauthReceipt.status === 403, "12. Non-owning requester rejected (403) on confirm-receipt");

        // 13. Owning requester confirms Blood Received -> records receipt & PENDING clinical verification, notifies donor
        const rReqReceipt = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}/confirm-receipt`,
            {},
            reqToken
        );
        const d1HistoryPending = await prisma.donationhistory.findMany({
            where: { requestid: bloodReq.requestid },
        });
        const d1ReceiptNotifs = await prisma.notification.findMany({
            where: { userid: donor1User.userid, requestid: bloodReq.requestid, title: "Blood Receipt Confirmed" },
        });
        assert(
            rReqReceipt.status === 200 &&
                d1HistoryPending.length === 1 &&
                d1HistoryPending[0].verificationstatus === "PENDING" &&
                d1ReceiptNotifs.length === 1,
            "13. Requester confirms Blood Received -> 1 PENDING donationhistory + 1 donor notification"
        );

        // 14. Idempotent receipt confirmation retry does not duplicate history or notification
        const rReqReceiptRetry = await reqJson(
            "POST",
            `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}/confirm-receipt`,
            {},
            reqToken
        );
        const d1HistoryAfterRetry = await prisma.donationhistory.findMany({
            where: { requestid: bloodReq.requestid },
        });
        const d1ReceiptNotifsAfterRetry = await prisma.notification.findMany({
            where: { userid: donor1User.userid, requestid: bloodReq.requestid, title: "Blood Receipt Confirmed" },
        });
        assert(
            rReqReceiptRetry.status === 200 &&
                d1HistoryAfterRetry.length === 1 &&
                d1ReceiptNotifsAfterRetry.length === 1,
            "14. Idempotent receipt confirmation produces no duplicate records or notifications"
        );

        // 15. Donor dashboard exposes myCommitments for both Donor 1 (COMPLETED) and Donor 2 (REJECTED)
        const rD1Dash = await reqJson("GET", `/donors/me/dashboard`, undefined, d1Token);
        const rD2Dash = await reqJson("GET", `/donors/me/dashboard`, undefined, d2Token);
        const d1Comm = rD1Dash.data?.myCommitments?.find((c: any) => c.requestid === bloodReq.requestid)?.myCommitment;
        const d2Comm = rD2Dash.data?.myCommitments?.find((c: any) => c.requestid === bloodReq.requestid)?.myCommitment;
        assert(
            d1Comm?.acceptanceStatus === "ACCEPTED" &&
                d1Comm?.transitStatus === "COMPLETED" &&
                Boolean(d1Comm?.receiptConfirmedAt) &&
                d2Comm?.acceptanceStatus === "REJECTED",
            "15. Donor dashboard myCommitments reflects COMPLETED+receiptConfirmedAt for Donor 1 and REJECTED for Donor 2"
        );

        // 16. Assigned hospital clinical verification upgrade on already-confirmed delivery or new delivery
        // Verify hospital token can also see volunteers and bloodrequests/:id includes receiptConfirmedAt
        const rHospGet = await reqJson("GET", `/bloodrequests/${bloodReq.requestid}`, undefined, hospToken);
        const hospD1 = rHospGet.data?.volunteers?.find((v: any) => v.deliveryId === d1VolRow.deliveryId);
        assert(
            rHospGet.status === 200 && Boolean(hospD1?.receiptConfirmedAt) && hospD1?.acceptanceStatus === "ACCEPTED",
            "16. Assigned hospital sees receiptConfirmedAt and acceptanceStatus on bloodrequests/:id"
        );

        // 17. Direct Donor Details endpoint returns exact commitment for Donor 1 (with all persisted timestamps) and Donor 2 (rejected, contact redacted)
        const rDetD1 = await reqJson("GET", `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}`, undefined, reqToken);
        const rDetD2 = await reqJson("GET", `/bloodrequests/${bloodReq.requestid}/volunteers/${d2VolRow.deliveryId}`, undefined, reqToken);
        assert(
            rDetD1.status === 200 &&
                rDetD1.data?.volunteer?.deliveryId === d1VolRow.deliveryId &&
                Boolean(rDetD1.data?.volunteer?.acceptedAt) &&
                Boolean(rDetD1.data?.volunteer?.startedAt) &&
                Boolean(rDetD1.data?.volunteer?.reachedAt) &&
                Boolean(rDetD1.data?.volunteer?.receiptConfirmedAt) &&
                rDetD2.status === 200 &&
                rDetD2.data?.volunteer?.acceptanceStatus === "REJECTED" &&
                rDetD2.data?.volunteer?.donorPhone === "",
            "17. Dedicated donor details endpoint returns exact Donor 1 timestamps and redacts rejected Donor 2 contact"
        );

        // 18. Unauthorized requester and non-existent deliveryId rejected on donor details endpoint
        const rDetUnauth = await reqJson("GET", `/bloodrequests/${bloodReq.requestid}/volunteers/${d1VolRow.deliveryId}`, undefined, otherReqToken);
        const rDetMissing = await reqJson(
            "GET",
            `/bloodrequests/${bloodReq.requestid}/volunteers/00000000-0000-0000-0000-000000000000`,
            undefined,
            reqToken
        );
        assert(
            rDetUnauth.status === 403 && rDetMissing.status === 404,
            "18. Unauthorized requester (403) and missing deliveryId (404) rejected on donor details endpoint"
        );

        console.log(`\nALL E2E DONOR WORKFLOW TESTS PASSED: ${passed}/${passed + failed}`);
    } finally {
        for (const reqId of createdRequestIds) {
            await prisma.donationhistory.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.requeststatushistory.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.broadcastdeliveries.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.emergencybroadcasts.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.prescription.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.bloodrequests.deleteMany({ where: { requestid: reqId } }).catch(() => {});
        }
        for (const uid of createdUserIds) {
            await prisma.notification.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.donors.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.requesters.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.hospitals.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: uid } }).catch(() => {});
        }
        if (server) server.close();
        await prisma.$disconnect();
    }
}

runTests().catch((err) => {
    console.error("Test suite error:", err);
    process.exit(1);
});
