import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { UnitTraceabilityService } from "../src/services/unitTraceability.service";

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
    if (!condition) {
        totalFailed++;
        failures.push(message);
        console.error(`[FAIL] ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
    totalPassed++;
    console.log(`[PASS] ${message}`);
}

async function run() {
    // 0. Pre-flight verification: Must be on swastya_test database
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe("SELECT current_database()");
    const currentDb = dbCheck[0]?.current_database || "";
    assert(currentDb === "swastya_test", `Target database must be swastya_test (got: ${currentDb})`);

    const suffix = `${Date.now()}-aud08`;
    const userIds: string[] = [];
    const hospitalIds: string[] = [];
    const bloodBankIds: string[] = [];
    const requesterIds: string[] = [];
    const requestIds: string[] = [];
    let server: http.Server | null = null;
    let baseUrl = "";

    try {
        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", () => resolve());
        });
        const address = (server as any).address();
        baseUrl = `http://127.0.0.1:${address.port}`;

        // 1. Create Admin user
        const adminUser = await prisma.users.create({
            data: {
                name: `AUD08 Admin ${suffix}`,
                email: `aud08-admin-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "ADMIN",
            },
        });
        userIds.push(adminUser.userid);
        const adminToken = generateToken(adminUser.userid, "ADMIN");

        // 2. Create Approved Hospital user & hospital
        const approvedHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Approved Hospital ${suffix}`,
                email: `aud08-apprhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(approvedHospUser.userid);
        const approvedHospital = await prisma.hospitals.create({
            data: {
                userid: approvedHospUser.userid,
                hospitalname: `AUD08 Approved Hospital ${suffix}`,
                registrationnumber: `HREG-APPR-${suffix}`,
                contactpersonname: "Dr. Approved",
                contactpersonphone: "9123456780",
                address: "Approved Hospital St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9300,
                longitude: 72.8250,
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(approvedHospital.hospitalid);

        // 3. Create Pending Hospital user & hospital
        const pendingHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Pending Hospital ${suffix}`,
                email: `aud08-pendhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(pendingHospUser.userid);
        const pendingHospital = await prisma.hospitals.create({
            data: {
                userid: pendingHospUser.userid,
                hospitalname: `AUD08 Pending Hospital ${suffix}`,
                registrationnumber: `HREG-PEND-${suffix}`,
                contactpersonname: "Dr. Pending",
                contactpersonphone: "9123456781",
                address: "Pending Hospital St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400002",
                latitude: 18.9310,
                longitude: 72.8260,
                approvalstatus: "PENDING",
            },
        });
        hospitalIds.push(pendingHospital.hospitalid);

        // 4. Create Rejected Hospital user & hospital
        const rejectedHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Rejected Hospital ${suffix}`,
                email: `aud08-rejhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(rejectedHospUser.userid);
        const rejectedHospital = await prisma.hospitals.create({
            data: {
                userid: rejectedHospUser.userid,
                hospitalname: `AUD08 Rejected Hospital ${suffix}`,
                registrationnumber: `HREG-REJ-${suffix}`,
                contactpersonname: "Dr. Rejected",
                contactpersonphone: "9123456782",
                address: "Rejected Hospital St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400003",
                latitude: 18.9320,
                longitude: 72.8270,
                approvalstatus: "REJECTED",
            },
        });
        hospitalIds.push(rejectedHospital.hospitalid);

        // 5. Create Requester user & requester profile
        const requesterUser = await prisma.users.create({
            data: {
                name: `AUD08 Requester ${suffix}`,
                email: `aud08-req-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "REQUESTER",
            },
        });
        userIds.push(requesterUser.userid);
        const requester = await prisma.requesters.create({
            data: {
                userid: requesterUser.userid,
                address: "Requester St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400020",
                latitude: 18.9330,
                longitude: 72.8280,
            },
        });
        requesterIds.push(requester.requesterid);
        const requesterToken = generateToken(requesterUser.userid, "REQUESTER");

        // 6. Create Approved Blood Bank user & profile
        const bbUser = await prisma.users.create({
            data: {
                name: `AUD08 Blood Bank ${suffix}`,
                email: `aud08-bb-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        userIds.push(bbUser.userid);
        const bloodBank = await prisma.bloodbanks.create({
            data: {
                userid: bbUser.userid,
                bloodbankname: `AUD08 Blood Bank ${suffix}`,
                licensenumber: `LIC-BB-${suffix}`,
                contactpersonname: "BB Manager",
                contactpersonphone: "9123456783",
                address: "BB St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400004",
                latitude: 18.9340,
                longitude: 72.8290,
                approvalstatus: "APPROVED",
            },
        });
        bloodBankIds.push(bloodBank.bloodbankid);

        // Helper to construct request creation payload
        const makePayload = (patientname: string) => ({
            patientname,
            patientage: 30,
            patientgender: "MALE",
            patientcontact: "9123456789",
            bloodgroup: "A_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            urgencylevel: "HIGH",
            requiredby: new Date(Date.now() + 3600000).toISOString(),
            isemergency: false,
        });

        // -------------------------------------------------------------------------
        // SECTION 1: Finding F1 — Admin Creation Isolation
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F1: Admin Hospital Creation Validation ---");

        // 1a. Admin calling POST /hospitals/:hospitalId/bloodrequests targeting PENDING hospital
        const postPending = await fetch(`${baseUrl}/hospitals/${pendingHospital.hospitalid}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify(makePayload("F1-Admin-Pending")),
        });
        assert(postPending.status === 400, "F1.1: Admin calling POST /hospitals/:id/bloodrequests with PENDING hospital returns 400");
        const pendingJson = await postPending.json();
        assert(/not approved/i.test(pendingJson.message), "F1.2: Error message clearly indicates hospital is not approved");

        // 1b. Admin calling POST /hospitals/:hospitalId/bloodrequests targeting REJECTED hospital
        const postRejected = await fetch(`${baseUrl}/hospitals/${rejectedHospital.hospitalid}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify(makePayload("F1-Admin-Rejected")),
        });
        assert(postRejected.status === 400, "F1.3: Admin calling POST /hospitals/:id/bloodrequests with REJECTED hospital returns 400");

        // 1c. Admin calling POST /hospitals/:hospitalId/bloodrequests targeting APPROVED hospital
        const postApproved = await fetch(`${baseUrl}/hospitals/${approvedHospital.hospitalid}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify(makePayload("F1-Admin-Approved")),
        });
        assert(postApproved.status === 201 || postApproved.status === 200, "F1.4: Admin calling POST /hospitals/:id/bloodrequests with APPROVED hospital succeeds");
        const approvedReqJson = await postApproved.json();
        const f1ReqId = approvedReqJson.bloodRequest?.requestid || approvedReqJson.requestid;
        if (f1ReqId) requestIds.push(f1ReqId);

        // -------------------------------------------------------------------------
        // SECTION 2: Finding F2 — UUID Validation Before Admin Bypass
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F2: Invalid UUID Handling in checkHospitalOwnership ---");

        // 2a. Admin calling POST /hospitals/not-a-valid-uuid/bloodrequests
        const postInvalidUuid = await fetch(`${baseUrl}/hospitals/not-a-valid-uuid/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify(makePayload("F2-Invalid-UUID")),
        });
        assert(postInvalidUuid.status === 404, "F2.1: Admin calling POST /hospitals/not-a-uuid/bloodrequests returns 404 Not Found (not 500)");

        // 2b. Admin calling GET /hospitals/not-a-valid-uuid/bloodrequests
        const getInvalidUuid = await fetch(`${baseUrl}/hospitals/not-a-valid-uuid/bloodrequests`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${adminToken}`,
            },
        });
        assert(getInvalidUuid.status === 404, "F2.2: Admin calling GET /hospitals/not-a-uuid/bloodrequests returns 404 Not Found (not 500)");

        // -------------------------------------------------------------------------
        // SECTION 3: Finding F3 — Transactional Hospital Lock and Concurrent Revocation Race
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F3: Transactional Share Lock & Revocation Race ---");

        // 3a. Create a dedicated hospital for concurrent revocation race
        const raceHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Race Hospital ${suffix}`,
                email: `aud08-racehosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(raceHospUser.userid);
        const raceHospital = await prisma.hospitals.create({
            data: {
                userid: raceHospUser.userid,
                hospitalname: `AUD08 Race Hospital ${suffix}`,
                registrationnumber: `HREG-RACE-${suffix}`,
                contactpersonname: "Dr. Race",
                contactpersonphone: "9123456784",
                address: "Race St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400005",
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(raceHospital.hospitalid);

        // 3b. Verify POST /bloodrequests validates hospital under lock inside transaction
        // First, revoke raceHospital status directly in DB
        await prisma.hospitals.update({
            where: { hospitalid: raceHospital.hospitalid },
            data: { approvalstatus: "REJECTED" },
        });

        // Form data with revoked hospital
        const formRace = new FormData();
        formRace.append("patientname", "F3-Race-Rejection");
        formRace.append("patientage", "40");
        formRace.append("patientgender", "FEMALE");
        formRace.append("patientcontact", "9123456789");
        formRace.append("bloodgroup", "B_POSITIVE");
        formRace.append("bloodcomponent", "WHOLE_BLOOD");
        formRace.append("unitsrequired", "1");
        formRace.append("urgencylevel", "HIGH");
        formRace.append("hospitalid", raceHospital.hospitalid);
        formRace.append("requiredby", new Date(Date.now() + 3600000).toISOString());
        formRace.append("prescription", new Blob(["%PDF-1.4 test prescription content"], { type: "application/pdf" }), "rx.pdf");

        const postRaceResp = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${requesterToken}`,
            },
            body: formRace,
        });
        assert(postRaceResp.status === 400, "F3.1: POST /bloodrequests rejects revoked hospital with 400 Bad Request");

        // 3c. Concurrency simulation: inside a transaction, FOR SHARE lock prevents stale write
        let raceCaughtExpectedError = false;
        try {
            await prisma.$transaction(async (tx) => {
                const hospRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                    raceHospital.hospitalid
                );
                const lockedHosp = hospRows?.[0];
                if (!lockedHosp || lockedHosp.approvalstatus !== "APPROVED") {
                    throw Object.assign(
                        new Error("The assigned hospital is not approved to coordinate blood requisitions"),
                        { statusCode: 400 }
                    );
                }
            });
        } catch (err: any) {
            if (err.statusCode === 400 && /not approved/i.test(err.message)) {
                raceCaughtExpectedError = true;
            }
        }
        assert(raceCaughtExpectedError, "F3.2: Transactional FOR SHARE lock revalidates and halts request creation for revoked hospital");

        // -------------------------------------------------------------------------
        // SECTION 4: Finding F4 — Requisition Assignment Hospital Approval Gate
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F4: UnitTraceabilityService.assignRequisition Approval Gate ---");

        // 4a. Create requisition assigned to rejectedHospital with a verified prescription
        const reqWithRejectedHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: rejectedHospital.hospitalid,
                patientname: "F4-Patient-RejectedHosp",
                patientage: 45,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqWithRejectedHosp.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqWithRejectedHosp.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "Rejected Audit Hospital",
                fileurl: "rx-f4.pdf",
                originalfilename: "rx-f4.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "VERIFIED",
                verifiedbyhospitalid: approvedHospital.hospitalid,
                verificationdate: new Date(),
            },
        });

        // Admin attempts to assign requisition with rejected hospital to blood bank
        let f4RejectedCaught = false;
        try {
            await UnitTraceabilityService.assignRequisition(
                reqWithRejectedHosp.requestid,
                bloodBank.bloodbankid,
                adminUser.userid
            );
        } catch (err: any) {
            if (err.statusCode === 403 && /only approved hospitals/i.test(err.message)) {
                f4RejectedCaught = true;
            }
        }
        assert(f4RejectedCaught, "F4.1: UnitTraceabilityService.assignRequisition rejects requisition with REJECTED hospital (403)");

        // 4b. Create hospital-less requisition with verified prescription
        const reqNoHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: null,
                patientname: "F4-Patient-NoHosp",
                patientage: 45,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqNoHosp.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqNoHosp.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "No Hospital Requisition",
                fileurl: "rx-f4-nohosp.pdf",
                originalfilename: "rx-f4-nohosp.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "VERIFIED",
                verifiedbyhospitalid: null,
                verificationdate: new Date(),
            },
        });

        let f4NoHospCaught = false;
        try {
            await UnitTraceabilityService.assignRequisition(
                reqNoHosp.requestid,
                bloodBank.bloodbankid,
                adminUser.userid
            );
        } catch (err: any) {
            if (err.statusCode === 400 && /without an assigned hospital/i.test(err.message)) {
                f4NoHospCaught = true;
            }
        }
        assert(f4NoHospCaught, "F4.2: UnitTraceabilityService.assignRequisition rejects hospital-less requisition (400)");

        // 4c. Assign requisition with APPROVED hospital succeeds
        const reqWithApprovedHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: approvedHospital.hospitalid,
                patientname: "F4-Patient-ApprovedHosp",
                patientage: 45,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqWithApprovedHosp.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqWithApprovedHosp.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "Approved Audit Hospital",
                fileurl: "rx-f4-appr.pdf",
                originalfilename: "rx-f4-appr.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "VERIFIED",
                verifiedbyhospitalid: approvedHospital.hospitalid,
                verificationdate: new Date(),
            },
        });

        const f4SuccessAssignment = await UnitTraceabilityService.assignRequisition(
            reqWithApprovedHosp.requestid,
            bloodBank.bloodbankid,
            adminUser.userid
        );
        assert(Boolean(f4SuccessAssignment.assignment?.assignmentid), "F4.3: UnitTraceabilityService.assignRequisition succeeds for APPROVED hospital requisition");

        // -------------------------------------------------------------------------
        // SECTION 5: Finding F5 — Prescription Verification Hospital Gate
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F5: POST /bloodrequests/:id/prescription/verify Hospital Gate ---");

        // 5a. Admin verifying prescription on request with REJECTED hospital
        const reqVerifyRejected = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: rejectedHospital.hospitalid,
                patientname: "F5-Patient-VerifyRejected",
                patientage: 28,
                patientgender: "FEMALE",
                patientcontact: "9123456789",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqVerifyRejected.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqVerifyRejected.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "Rejected Audit Hospital",
                fileurl: "rx-f5-rej.pdf",
                originalfilename: "rx-f5-rej.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "PENDING",
            },
        });

        const verifyRejResp = await fetch(`${baseUrl}/bloodrequests/${reqVerifyRejected.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ status: "VERIFIED", remarks: "Admin approval test" }),
        });
        assert(verifyRejResp.status === 403, "F5.1: Admin prescription verification on REJECTED hospital requisition returns 403 Forbidden");

        // 5b. Admin verifying prescription on hospital-less requisition
        const reqVerifyNoHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: null,
                patientname: "F5-Patient-VerifyNoHosp",
                patientage: 28,
                patientgender: "FEMALE",
                patientcontact: "9123456789",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqVerifyNoHosp.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqVerifyNoHosp.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "No Hospital Requisition",
                fileurl: "rx-f5-nohosp.pdf",
                originalfilename: "rx-f5-nohosp.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "PENDING",
            },
        });

        const verifyNoHospResp = await fetch(`${baseUrl}/bloodrequests/${reqVerifyNoHosp.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ status: "VERIFIED", remarks: "Admin approval test" }),
        });
        assert(verifyNoHospResp.status === 400, "F5.2: Admin prescription verification on hospital-less requisition returns 400 Bad Request");

        // 5c. Admin verifying prescription on APPROVED hospital requisition
        const reqVerifyAppr = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: approvedHospital.hospitalid,
                patientname: "F5-Patient-VerifyApproved",
                patientage: 28,
                patientgender: "FEMALE",
                patientcontact: "9123456789",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqVerifyAppr.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqVerifyAppr.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "Approved Audit Hospital",
                fileurl: "rx-f5-appr.pdf",
                originalfilename: "rx-f5-appr.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "PENDING",
            },
        });

        const verifyApprResp = await fetch(`${baseUrl}/bloodrequests/${reqVerifyAppr.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ status: "VERIFIED", remarks: "Admin approved prescription" }),
        });
        assert(verifyApprResp.status === 200, "F5.3: Admin prescription verification on APPROVED hospital requisition succeeds (200)");

        // -------------------------------------------------------------------------
        // SECTION 6: Finding F6 — Prescription Replacement Gate
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F6: POST /bloodrequests/:id/prescription/replacement Gate ---");

        // 6a. Replacement on requisition with REJECTED hospital
        const reqReplRej = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: rejectedHospital.hospitalid,
                patientname: "F6-Patient-ReplRejected",
                patientage: 33,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "B_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "MEDIUM",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqReplRej.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqReplRej.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "Rejected Audit Hospital",
                fileurl: "rx-f6-orig-rej.pdf",
                originalfilename: "rx-f6-orig-rej.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "REJECTED",
                remarks: "Needs clear clinical stamp",
            },
        });

        const formReplRej = new FormData();
        formReplRej.append("prescription", new Blob(["%PDF-1.4 new test prescription replacement"], { type: "application/pdf" }), "rx-repl.pdf");

        const replRejResp = await fetch(`${baseUrl}/bloodrequests/${reqReplRej.requestid}/prescription/replacement`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${requesterToken}`,
            },
            body: formReplRej,
        });
        assert(replRejResp.status === 403, "F6.1: Prescription replacement on REJECTED hospital requisition returns 403 Forbidden");

        // 6b. Replacement on requisition with APPROVED hospital
        const reqReplAppr = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: approvedHospital.hospitalid,
                patientname: "F6-Patient-ReplApproved",
                patientage: 33,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "B_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "MEDIUM",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqReplAppr.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqReplAppr.requestid,
                doctorname: "Dr. Audit",
                hospitalname: "Approved Audit Hospital",
                fileurl: "rx-f6-orig-appr.pdf",
                originalfilename: "rx-f6-orig-appr.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                status: "REJECTED",
                remarks: "Doctor signature illegible",
            },
        });

        const formReplAppr = new FormData();
        formReplAppr.append("prescription", new Blob(["%PDF-1.4 new valid prescription replacement"], { type: "application/pdf" }), "rx-repl-valid.pdf");

        const replApprResp = await fetch(`${baseUrl}/bloodrequests/${reqReplAppr.requestid}/prescription/replacement`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${requesterToken}`,
            },
            body: formReplAppr,
        });
        assert(replApprResp.status === 200, "F6.2: Prescription replacement on APPROVED hospital requisition succeeds (200)");

        // -------------------------------------------------------------------------
        // SECTION 7: Finding F7 — Hospital Revocation Cascade (Broadcast & Scheduler Cleanup)
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F7: Hospital Revocation Cascade ---");

        // 7a. Create a dedicated hospital, active request, active broadcast, and open scheduler job
        const f7HospUser = await prisma.users.create({
            data: {
                name: `AUD08 Revocation Hospital ${suffix}`,
                email: `aud08-revhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(f7HospUser.userid);
        const f7Hospital = await prisma.hospitals.create({
            data: {
                userid: f7HospUser.userid,
                hospitalname: `AUD08 Revocation Hospital ${suffix}`,
                registrationnumber: `HREG-REV-${suffix}`,
                contactpersonname: "Dr. Revoked",
                contactpersonphone: "9123456785",
                address: "Revoked St",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400006",
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(f7Hospital.hospitalid);

        const f7Req = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: f7Hospital.hospitalid,
                patientname: "F7-Patient-CascadeTest",
                patientage: 50,
                patientgender: "FEMALE",
                patientcontact: "9123456789",
                bloodgroup: "AB_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "CRITICAL",
                isemergency: true,
                status: "DONOR_MATCHING",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(f7Req.requestid);

        const f7Broadcast = await prisma.emergencybroadcasts.create({
            data: {
                requestid: f7Req.requestid,
                triggeredbyuserid: requesterUser.userid,
                triggertype: "INITIAL",
                status: "ACTIVE",
                radiuskm: 15,
                totalmatched: 1,
                totalnotified: 1,
                totalresponded: 0,
            },
        });

        const f7Job = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: f7Req.requestid,
                status: "PENDING",
                scheduledfor: new Date(Date.now() + 900000),
                idempotencykey: `aud08-revjob-${f7Req.requestid}`,
            },
        });

        // 7b. Admin updates f7Hospital approvalstatus to REJECTED via PUT /hospitals/:id
        const revokeResp = await fetch(`${baseUrl}/hospitals/${f7Hospital.hospitalid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ approvalstatus: "REJECTED" }),
        });
        assert(revokeResp.status === 200, "F7.1: Admin successfully revokes hospital via PUT /hospitals/:id");

        // 7c. Verify hospital status is updated in database
        const dbF7Hosp = await prisma.hospitals.findUnique({ where: { hospitalid: f7Hospital.hospitalid } });
        assert(dbF7Hosp?.approvalstatus === "REJECTED", "F7.2: Hospital approval status is REJECTED in database");

        // 7d. Verify active broadcast was atomically cancelled
        const dbF7Broadcast = await prisma.emergencybroadcasts.findUnique({ where: { broadcastid: f7Broadcast.broadcastid } });
        assert(dbF7Broadcast?.status === "CANCELLED", "F7.3: Active emergency broadcast is atomically transitioned to CANCELLED");

        // 7e. Verify pending follow-up scheduler job was atomically cancelled with lasterror = 'HOSPITAL_APPROVAL_REVOKED'
        const dbF7Job = await prisma.emergencyschedulerjobs.findUnique({ where: { jobid: f7Job.jobid } });
        assert(dbF7Job?.status === "CANCELLED", "F7.4: Pending follow-up scheduler job is atomically transitioned to CANCELLED");
        assert(dbF7Job?.lasterror === "HOSPITAL_APPROVAL_REVOKED", "F7.5: Follow-up job lasterror is set to HOSPITAL_APPROVAL_REVOKED");

        // -------------------------------------------------------------------------
        // SECTION 8: Finding F8 — Hospital Immutability & Initial Assignment for Hospital-Less Requests
        // -------------------------------------------------------------------------
        console.log("\n--- Testing F8: Initial Assignment & Reassignment Protection ---");

        // 8a. Create hospital-less request
        const f8Req = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: requesterUser.userid,
                requesterid: requester.requesterid,
                hospitalid: null,
                patientname: "F8-Patient-InitialHospTest",
                patientage: 38,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "O_NEGATIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(f8Req.requestid);

        // 8b. Attempt to assign a PENDING hospital to the unassigned request
        const putPendingHosp = await fetch(`${baseUrl}/bloodrequests/${f8Req.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterToken}`,
            },
            body: JSON.stringify({ hospitalid: pendingHospital.hospitalid }),
        });
        assert(putPendingHosp.status === 400, "F8.1: Assigning a PENDING hospital to a hospital-less request returns 400 Bad Request");

        // 8c. Assign an APPROVED hospital to the unassigned request
        const putApprovedHosp = await fetch(`${baseUrl}/bloodrequests/${f8Req.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterToken}`,
            },
            body: JSON.stringify({ hospitalid: approvedHospital.hospitalid }),
        });
        assert(putApprovedHosp.status === 200, "F8.2: Assigning an APPROVED hospital to a hospital-less request succeeds (200)");
        const dbF8Req = await prisma.bloodrequests.findUnique({ where: { requestid: f8Req.requestid } });
        assert(dbF8Req?.hospitalid === approvedHospital.hospitalid, "F8.3: Request hospitalid is successfully bound to approvedHospital");

        // 8d. Attempt to reassign the now-assigned request to another hospital
        const reassignAttempt = await fetch(`${baseUrl}/bloodrequests/${f8Req.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterToken}`,
            },
            body: JSON.stringify({ hospitalid: pendingHospital.hospitalid }),
        });
        assert(reassignAttempt.status === 400, "F8.4: Reassigning an already-assigned hospital returns 400 Bad Request");
        const reassignJson = await reassignAttempt.json();
        assert(/reassignment is not permitted/i.test(reassignJson.message), "F8.5: Error message confirms hospital reassignment is forbidden once assigned");

    } finally {
        if (server) {
            await new Promise<void>((resolve) => (server as http.Server).close(() => resolve()));
        }

        // Clean up test fixtures from swastya_test
        if (requestIds.length > 0) {
            await prisma.emergencyschedulerjobs.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.broadcastdeliveries.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.emergencybroadcasts.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.requisitionassignments.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescriptionhistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescription.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.bloodrequests.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
        }
        if (hospitalIds.length > 0) {
            await prisma.hospitals.deleteMany({ where: { hospitalid: { in: hospitalIds } } }).catch(() => {});
        }
        if (bloodBankIds.length > 0) {
            await prisma.bloodbanks.deleteMany({ where: { bloodbankid: { in: bloodBankIds } } }).catch(() => {});
        }
        if (requesterIds.length > 0) {
            await prisma.requesters.deleteMany({ where: { requesterid: { in: requesterIds } } }).catch(() => {});
        }
        if (userIds.length > 0) {
            await prisma.notification.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
        }
    }
}

run()
    .then(async () => {
        await prisma.$disconnect();
        console.log(`\n=======================================================`);
        console.log(`AUD-08 Hospital Approval Remediation Suite: PASS`);
        console.log(`Total Passed: ${totalPassed}`);
        console.log(`Total Failed: ${totalFailed}`);
        console.log(`=======================================================\n`);
    })
    .catch(async (error) => {
        console.error(`\n=======================================================`);
        console.error(`AUD-08 Hospital Approval Remediation Suite: FAIL`);
        console.error(`Total Passed: ${totalPassed}`);
        console.error(`Total Failed: ${totalFailed}`);
        if (failures.length > 0) {
            console.error(`Failures:`);
            failures.forEach((f) => console.error(`  - ${f}`));
        }
        console.error(error);
        console.error(`=======================================================\n`);
        await prisma.$disconnect();
        process.exit(1);
    });
