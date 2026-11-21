import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import http from "http";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/Swastya(\?|$)/i, "/swastya_test$1");
}

import { generateToken } from "../src/utils/jwt";
import { getPrescriptionStorageDir } from "../src/utils/fileValidation";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
        console.log(`  [PASS] ${testName}`);
        passed++;
    } else {
        const msg = detail ? `${testName} — ${detail}` : testName;
        console.error(`  [FAIL] ${msg}`);
        failed++;
        failures.push(msg);
    }
}

function buildValidPdfBlob(label = "Catalog"): Blob {
    const pdfBytes = Buffer.from(
        `%PDF-1.4\n1 0 obj\n<< /Type /${label} >>\nendobj\n%%EOF\n`,
        "utf-8"
    );
    return new Blob([pdfBytes], { type: "application/pdf" });
}

async function runTests() {
    console.log("==================================================================");
    console.log(" AUD-06: PRESCRIPTION REPLACEMENT SECURITY & CONCURRENCY TESTS");
    console.log("==================================================================\n");

    const { default: app } = await import("../src/app");
    const { prisma } = await import("../src/config/prisma");

    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe(
        `SELECT current_database()`
    );
    const currentDb = dbCheck[0]?.current_database || "";
    if (currentDb !== "swastya_test") {
        throw new Error(`SAFETY ABORT: Expected swastya_test database, got "${currentDb}"`);
    }
    console.log(`[DB Guard] Verified target database: ${currentDb}\n`);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const tag = `aud06_${Date.now()}`;
    const createdRequestIds: string[] = [];
    const createdUserIds: string[] = [];
    const createdHospitalIds: string[] = [];
    const createdRequesterIds: string[] = [];
    const createdDonorIds: string[] = [];
    const createdBloodBankIds: string[] = [];
    const trackedDiskFiles = new Set<string>();

    const trackPrescriptionFile = (fileurl?: string | null) => {
        if (fileurl) {
            trackedDiskFiles.add(path.resolve(getPrescriptionStorageDir(), path.basename(fileurl)));
        }
    };

    const reqJson = async (method: string, urlPath: string, body?: any, token?: string) => {
        const headers: Record<string, string> = {};
        if (body !== undefined) headers["Content-Type"] = "application/json";
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${baseUrl}${urlPath}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => null);
        return { status: res.status, data };
    };

    const createRequestWithPdf = async (fields: Record<string, string>, token: string) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) {
            form.append(k, v);
        }
        form.append("prescription", buildValidPdfBlob("InitialRx"), "initial.pdf");
        const res = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        const data = await res.json().catch(() => null);
        if (data?.requestid) {
            createdRequestIds.push(data.requestid);
            trackPrescriptionFile(data?.prescription?.fileurl);
        }
        return { status: res.status, data };
    };

    const uploadReplacement = async (
        requestId: string,
        token: string,
        options?: { doctorname?: string; hospitalname?: string; attachFile?: boolean; pdfTag?: string }
    ) => {
        const form = new FormData();
        if (options?.doctorname) form.append("doctorname", options.doctorname);
        if (options?.hospitalname) form.append("hospitalname", options.hospitalname);
        if (options?.attachFile !== false) {
            form.append("prescription", buildValidPdfBlob(options?.pdfTag || "ReplacementRx"), "replacement.pdf");
        }
        const res = await fetch(`${baseUrl}/bloodrequests/${requestId}/prescription/replacement`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        const data = await res.json().catch(() => null);
        trackPrescriptionFile(data?.prescription?.fileurl);
        return { status: res.status, data };
    };

    try {
        // --- Seed users & profiles ---
        const [
            ownerUser,
            otherReqUser,
            approvedHospUser,
            pendingHospUser,
            rejectedHospUser,
            donorUser,
            bbUser,
        ] = await Promise.all([
            prisma.users.create({
                data: {
                    name: `AUD06 Owner ${tag}`,
                    email: `owner.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9820000001",
                    role: "REQUESTER",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD06 OtherReq ${tag}`,
                    email: `other.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9820000002",
                    role: "REQUESTER",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD06 ApprovedHosp ${tag}`,
                    email: `hosp.app.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9820000003",
                    role: "HOSPITAL",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD06 PendingHosp ${tag}`,
                    email: `hosp.pend.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9820000004",
                    role: "HOSPITAL",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD06 RejectedHosp ${tag}`,
                    email: `hosp.rej.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9820000005",
                    role: "HOSPITAL",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD06 Donor ${tag}`,
                    email: `donor.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9820000006",
                    role: "DONOR",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD06 BloodBank ${tag}`,
                    email: `bb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9820000007",
                    role: "BLOOD_BANK",
                    isactive: true,
                    emailverified: true,
                },
            }),
        ]);
        createdUserIds.push(
            ownerUser.userid,
            otherReqUser.userid,
            approvedHospUser.userid,
            pendingHospUser.userid,
            rejectedHospUser.userid,
            donorUser.userid,
            bbUser.userid
        );

        const [
            ownerProfile,
            otherReqProfile,
            approvedHosp,
            pendingHosp,
            rejectedHosp,
            donorProfile,
            bbProfile,
        ] = await Promise.all([
            prisma.requesters.create({
                data: {
                    userid: ownerUser.userid,
                    address: "10 Owner Rd",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                },
            }),
            prisma.requesters.create({
                data: {
                    userid: otherReqUser.userid,
                    address: "20 Other Rd",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                },
            }),
            prisma.hospitals.create({
                data: {
                    userid: approvedHospUser.userid,
                    hospitalname: `AUD06 Approved Hospital ${tag}`,
                    registrationnumber: `REG-APP-${tag}`,
                    contactpersonname: "Dr. Approved",
                    contactpersonphone: "9820000003",
                    address: "30 Medical Way",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    approvalstatus: "APPROVED",
                },
            }),
            prisma.hospitals.create({
                data: {
                    userid: pendingHospUser.userid,
                    hospitalname: `AUD06 Pending Hospital ${tag}`,
                    registrationnumber: `REG-PEND-${tag}`,
                    contactpersonname: "Dr. Pending",
                    contactpersonphone: "9820000004",
                    address: "40 Medical Way",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    approvalstatus: "PENDING",
                },
            }),
            prisma.hospitals.create({
                data: {
                    userid: rejectedHospUser.userid,
                    hospitalname: `AUD06 Rejected Hospital ${tag}`,
                    registrationnumber: `REG-REJ-${tag}`,
                    contactpersonname: "Dr. Rejected",
                    contactpersonphone: "9820000005",
                    address: "50 Medical Way",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    approvalstatus: "REJECTED",
                },
            }),
            prisma.donors.create({
                data: {
                    userid: donorUser.userid,
                    bloodgroup: "O_POSITIVE",
                    dateofbirth: new Date("1995-03-10"),
                    gender: "MALE",
                    weight: 70,
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    availabilitystatus: "AVAILABLE",
                    iseligible: true,
                },
            }),
            prisma.bloodbanks.create({
                data: {
                    userid: bbUser.userid,
                    bloodbankname: `AUD06 BB ${tag}`,
                    licensenumber: `LIC-AUD06-${tag}`,
                    contactpersonname: "BB Officer",
                    contactpersonphone: "9820000007",
                    address: "70 Bank St",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    approvalstatus: "APPROVED",
                },
            }),
        ]);
        createdRequesterIds.push(ownerProfile.requesterid, otherReqProfile.requesterid);
        createdHospitalIds.push(approvedHosp.hospitalid, pendingHosp.hospitalid, rejectedHosp.hospitalid);
        createdDonorIds.push(donorProfile.donorid);
        createdBloodBankIds.push(bbProfile.bloodbankid);

        const ownerToken = generateToken(ownerUser.userid, "REQUESTER");
        const otherReqToken = generateToken(otherReqUser.userid, "REQUESTER");
        const approvedHospToken = generateToken(approvedHospUser.userid, "HOSPITAL");
        const pendingHospToken = generateToken(pendingHospUser.userid, "HOSPITAL");
        const rejectedHospToken = generateToken(rejectedHospUser.userid, "HOSPITAL");
        const donorToken = generateToken(donorUser.userid, "DONOR");
        const bbToken = generateToken(bbUser.userid, "BLOOD_BANK");

        const futureIso = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        const baseFields = {
            patientname: "AUD06 Patient",
            patientage: "38",
            patientgender: "FEMALE",
            patientcontact: "9876543210",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: "2",
            urgencylevel: "HIGH",
            requiredby: futureIso(),
            hospitalid: approvedHosp.hospitalid,
            doctorname: "Dr. Initial",
            hospitalname: approvedHosp.hospitalname,
        };

        // =========================================================================
        // 1. ROLE AUTHORIZATION, requireApprovedHospital & PRE-UPLOAD GUARDS
        // =========================================================================
        console.log("--- 1. Role Authorization, Approved Hospital & Pre-Upload Guards ---");

        const initReq = await createRequestWithPdf(baseFields, ownerToken);
        assert(initReq.status === 201, "1.1 Seeded initial CREATED request with PENDING prescription");
        const reqId1 = initReq.data.requestid;

        // 1.2 DONOR and BLOOD_BANK roles blocked with 403 before upload processing
        const donorAttempt = await uploadReplacement(reqId1, donorToken);
        const bbAttempt = await uploadReplacement(reqId1, bbToken);
        assert(
            donorAttempt.status === 403 && bbAttempt.status === 403,
            "1.2 DONOR and BLOOD_BANK roles rejected with 403 Forbidden",
            `donor=${donorAttempt.status} bb=${bbAttempt.status}`
        );

        // 1.3 PENDING and REJECTED hospital accounts blocked by requireApprovedHospital even if creator
        const pendingHospOwnedReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: pendingHospUser.userid,
                hospitalid: pendingHosp.hospitalid,
                patientname: "Pending Hosp Patient",
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(pendingHospOwnedReq.requestid);

        const pendHospAttempt = await uploadReplacement(pendingHospOwnedReq.requestid, pendingHospToken);
        const rejHospAttempt = await uploadReplacement(reqId1, rejectedHospToken);
        assert(
            pendHospAttempt.status === 403 && rejHospAttempt.status === 403,
            "1.3 PENDING and REJECTED hospitals blocked with 403 by requireApprovedHospital (even when request creator)",
            `pending=${pendHospAttempt.status} rejected=${rejHospAttempt.status}`
        );

        // 1.4 Invalid UUID and non-existent UUID return 404 before upload
        const badUuidAttempt = await uploadReplacement("not-a-valid-uuid", ownerToken);
        const missingUuidAttempt = await uploadReplacement("00000000-0000-0000-0000-000000000000", ownerToken);
        assert(
            badUuidAttempt.status === 404 && missingUuidAttempt.status === 404,
            "1.4 Invalid UUID and non-existent UUID return 404 before Multer processing"
        );

        // 1.5 Non-owner requester and assigned hospital (non-creator) blocked with 403 before upload
        const otherReqAttempt = await uploadReplacement(reqId1, otherReqToken);
        const assignedHospAttempt = await uploadReplacement(reqId1, approvedHospToken);
        assert(
            otherReqAttempt.status === 403 && assignedHospAttempt.status === 403,
            "1.5 Non-owner requester and non-creator assigned hospital rejected with 403 before upload processing",
            `otherReq=${otherReqAttempt.status} hosp=${assignedHospAttempt.status}`
        );

        // =========================================================================
        // 2. VALID PENDING & REJECTED REPLACEMENT WORKFLOWS
        // =========================================================================
        console.log("\n--- 2. Valid PENDING and REJECTED Prescription Replacement Workflows ---");

        // 2.1 Replace while PENDING
        const originalFileUrl = initReq.data?.prescription?.fileurl;
        const replacePendingRes = await uploadReplacement(reqId1, ownerToken, {
            doctorname: "Dr. Replaced Pending",
            pdfTag: "PendingReplacement",
        });
        const histAfterPendingReplace = await prisma.prescriptionhistory.findMany({
            where: { requestid: reqId1 },
            orderBy: { createdat: "asc" },
        });
        assert(
            replacePendingRes.status === 200 &&
                replacePendingRes.data?.prescription?.status === "PENDING" &&
                replacePendingRes.data?.prescription?.doctorname === "Dr. Replaced Pending" &&
                replacePendingRes.data?.prescription?.fileurl !== originalFileUrl &&
                histAfterPendingReplace.length === 1 &&
                histAfterPendingReplace[0].fileurl === originalFileUrl &&
                histAfterPendingReplace[0].status === "PENDING",
            "2.1 Replacing a PENDING prescription succeeds (200) and archives previous PENDING version in prescriptionhistory"
        );

        // 2.2 Hospital rejects prescription -> Requester replaces REJECTED prescription -> resets to PENDING
        const rejectRes = await reqJson(
            "POST",
            `/bloodrequests/${reqId1}/prescription/verify`,
            { status: "REJECTED", remarks: "Blurry stamp, please upload high-res scan" },
            approvedHospToken
        );
        assert(rejectRes.status === 200, "2.2a Hospital rejects prescription (REJECTED)");

        const notifsBeforeRejReplace = await prisma.notification.count({
            where: { requestid: reqId1, userid: approvedHospUser.userid, title: "Replacement Prescription Uploaded" },
        });
        const statusHistBeforeRejReplace = await prisma.requeststatushistory.count({
            where: { requestid: reqId1 },
        });

        const replaceRejectedRes = await uploadReplacement(reqId1, ownerToken, {
            doctorname: "Dr. Final Clear Scan",
            pdfTag: "RejectedReplacement",
        });

        const [rxAfterRejReplace, histAfterRejReplace, notifsAfterRejReplace, statusHistAfterRejReplace] =
            await Promise.all([
                prisma.prescription.findUnique({ where: { requestid: reqId1 } }),
                prisma.prescriptionhistory.findMany({ where: { requestid: reqId1 }, orderBy: { createdat: "asc" } }),
                prisma.notification.count({
                    where: {
                        requestid: reqId1,
                        userid: approvedHospUser.userid,
                        title: "Replacement Prescription Uploaded",
                    },
                }),
                prisma.requeststatushistory.count({ where: { requestid: reqId1 } }),
            ]);

        assert(
            replaceRejectedRes.status === 200 &&
                rxAfterRejReplace?.status === "PENDING" &&
                rxAfterRejReplace?.verifiedbyhospitalid === null &&
                rxAfterRejReplace?.verificationdate === null &&
                rxAfterRejReplace?.remarks === null &&
                rxAfterRejReplace?.doctorname === "Dr. Final Clear Scan" &&
                histAfterRejReplace.length === 3 &&
                notifsAfterRejReplace === notifsBeforeRejReplace + 1 &&
                statusHistAfterRejReplace === statusHistBeforeRejReplace + 1,
            "2.2b Replacing a REJECTED prescription atomically archives rejected state, resets prescription to PENDING, logs status history, and notifies assigned hospital"
        );

        // =========================================================================
        // 3. BLOCKED AFTER VERIFICATION & TERMINAL / ARRANGED REQUEST STATES
        // =========================================================================
        console.log("\n--- 3. Blocked Replacement After Verification & Terminal/Arranged States ---");

        // 3.1 Verify prescription -> replacement blocked (400)
        const verifyRes = await reqJson(
            "POST",
            `/bloodrequests/${reqId1}/prescription/verify`,
            { status: "VERIFIED", remarks: "Clinically verified" },
            approvedHospToken
        );
        const verifiedFileUrl = rxAfterRejReplace?.fileurl;
        const replaceAfterVerified = await uploadReplacement(reqId1, ownerToken, {
            doctorname: "Dr. Unauthorized Overwrite",
        });
        const rxCheckAfterBlock = await prisma.prescription.findUnique({ where: { requestid: reqId1 } });
        assert(
            verifyRes.status === 200 &&
                replaceAfterVerified.status === 400 &&
                rxCheckAfterBlock?.status === "VERIFIED" &&
                rxCheckAfterBlock?.fileurl === verifiedFileUrl &&
                rxCheckAfterBlock?.verifiedbyhospitalid === approvedHosp.hospitalid,
            "3.1 Replacement is blocked (400) after prescription is VERIFIED, leaving VERIFIED record untouched"
        );

        // 3.2 Blocked across CANCELLED, EXPIRED, FULFILLED, and BLOOD_ARRANGED even when prescription is REJECTED or PENDING
        const lifecycleReqRes = await createRequestWithPdf(baseFields, ownerToken);
        const lifecycleReqId = lifecycleReqRes.data.requestid;
        const blockedStatuses = ["BLOOD_ARRANGED", "FULFILLED", "CANCELLED", "EXPIRED"] as const;

        for (const st of blockedStatuses) {
            await prisma.bloodrequests.update({
                where: { requestid: lifecycleReqId },
                data: { status: st },
            });
            const attempt = await uploadReplacement(lifecycleReqId, ownerToken);
            const rxNow = await prisma.prescription.findUnique({ where: { requestid: lifecycleReqId } });
            assert(
                attempt.status === 400 && rxNow?.fileurl === lifecycleReqRes.data.prescription.fileurl,
                `3.2 Replacement blocked (400) when request status is ${st}`,
                `got=${attempt.status}`
            );
        }

        // =========================================================================
        // 4. CONCURRENCY TESTS: VERIFICATION RACE & CANCELLATION RACE
        // =========================================================================
        console.log("\n--- 4. Concurrency Tests: Verification Race & Cancellation Race ---");

        // 4.1 Concurrent prescription verification (VERIFIED) vs prescription replacement
        const raceReqRes = await createRequestWithPdf(baseFields, ownerToken);
        const raceReqId = raceReqRes.data.requestid;

        const [concVerify, concReplace] = await Promise.all([
            reqJson(
                "POST",
                `/bloodrequests/${raceReqId}/prescription/verify`,
                { status: "VERIFIED", remarks: "Concurrent approval" },
                approvedHospToken
            ),
            uploadReplacement(raceReqId, ownerToken, {
                doctorname: "Dr. Concurrent Replacement",
                pdfTag: "ConcurrentRacePdf",
            }),
        ]);

        const rxAfterConcurrency = await prisma.prescription.findUnique({ where: { requestid: raceReqId } });
        const postRaceReplaceAttempt = await uploadReplacement(raceReqId, ownerToken);

        // Whether verify locked first (verify=200, replace=400, final status=VERIFIED)
        // or replace locked first (replace=200, then verify locked and verified the new prescription -> verify=200, final status=VERIFIED),
        // the final prescription status MUST be VERIFIED (never overwritten back to PENDING after VERIFIED!)
        assert(
            concVerify.status === 200 &&
                (concReplace.status === 200 || concReplace.status === 400) &&
                rxAfterConcurrency?.status === "VERIFIED" &&
                rxAfterConcurrency?.verifiedbyhospitalid === approvedHosp.hospitalid &&
                postRaceReplaceAttempt.status === 400,
            "4.1 Concurrent verification and replacement serialize via FOR UPDATE: final prescription is strictly VERIFIED (never downgraded to PENDING) and subsequent replacement is blocked (400)",
            `verify=${concVerify.status} replace=${concReplace.status} finalRxStatus=${rxAfterConcurrency?.status}`
        );

        // 4.2 Concurrent request cancellation (PUT status=CANCELLED) vs prescription replacement
        const cancelRaceReqRes = await createRequestWithPdf(baseFields, ownerToken);
        const cancelRaceReqId = cancelRaceReqRes.data.requestid;

        const [concCancel, concReplaceOnCancel] = await Promise.all([
            reqJson(
                "PUT",
                `/bloodrequests/${cancelRaceReqId}`,
                { status: "CANCELLED", remarks: "Concurrent requester cancellation" },
                ownerToken
            ),
            uploadReplacement(cancelRaceReqId, ownerToken, {
                doctorname: "Dr. Cancel Race",
                pdfTag: "CancelRacePdf",
            }),
        ]);

        const reqAfterCancelRace = await prisma.bloodrequests.findUnique({
            where: { requestid: cancelRaceReqId },
        });
        const historyAfterCancelRace = await prisma.requeststatushistory.findMany({
            where: { requestid: cancelRaceReqId },
            orderBy: { changedat: "asc" },
        });
        const lastHistoryEntry = historyAfterCancelRace[historyAfterCancelRace.length - 1];
        const postCancelReplaceAttempt = await uploadReplacement(cancelRaceReqId, ownerToken);

        assert(
            concCancel.status === 200 &&
                (concReplaceOnCancel.status === 200 || concReplaceOnCancel.status === 400) &&
                reqAfterCancelRace?.status === "CANCELLED" &&
                lastHistoryEntry?.newstatus === "CANCELLED" &&
                postCancelReplaceAttempt.status === 400,
            "4.2 Concurrent cancellation and replacement serialize via FOR UPDATE: final request status and latest history entry remain CANCELLED, and post-cancel replacement is blocked (400)",
            `cancel=${concCancel.status} replace=${concReplaceOnCancel.status} lastHistory=${lastHistoryEntry?.newstatus}`
        );
    } finally {
        if (createdRequestIds.length > 0) {
            const allRx = await prisma.prescription.findMany({
                where: { requestid: { in: createdRequestIds } },
                select: { fileurl: true },
            });
            const allHist = await prisma.prescriptionhistory.findMany({
                where: { requestid: { in: createdRequestIds } },
                select: { fileurl: true },
            });
            for (const r of allRx) trackPrescriptionFile(r.fileurl);
            for (const h of allHist) trackPrescriptionFile(h.fileurl);

            await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.prescriptionhistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.prescription.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.bloodrequests.deleteMany({ where: { requestid: { in: createdRequestIds } } });
        }
        if (createdBloodBankIds.length > 0) {
            await prisma.bloodbanks.deleteMany({ where: { bloodbankid: { in: createdBloodBankIds } } });
        }
        if (createdDonorIds.length > 0) {
            await prisma.donors.deleteMany({ where: { donorid: { in: createdDonorIds } } });
        }
        if (createdHospitalIds.length > 0) {
            await prisma.hospitals.deleteMany({ where: { hospitalid: { in: createdHospitalIds } } });
        }
        if (createdRequesterIds.length > 0) {
            await prisma.requesters.deleteMany({ where: { requesterid: { in: createdRequesterIds } } });
        }
        if (createdUserIds.length > 0) {
            await prisma.notification.deleteMany({ where: { userid: { in: createdUserIds } } });
            await prisma.users.deleteMany({ where: { userid: { in: createdUserIds } } });
        }
        for (const f of trackedDiskFiles) {
            await fs.promises.unlink(f).catch(() => { });
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await prisma.$disconnect();
    }

    console.log("\n==================================================================");
    console.log(` AUD-06 RESULTS: ${passed} passed, ${failed} failed`);
    console.log("==================================================================");
    if (failed > 0) {
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Fatal error in test_aud06:", err);
    process.exit(1);
});
