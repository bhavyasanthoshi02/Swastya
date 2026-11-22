import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import http from "http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { UnitTraceabilityService } from "../src/services/unitTraceability.service";
import { triggerEmergencyBroadcast } from "../src/services/broadcast.service";
import { scheduleEmergencyFollowUp } from "../src/services/scheduler.service";

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

        // 1. Create test users and facilities
        // Admin
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

        // Approved Hospital
        const apprHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Appr Hospital ${suffix}`,
                email: `aud08-apprhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(apprHospUser.userid);
        const approvedHospital = await prisma.hospitals.create({
            data: {
                userid: apprHospUser.userid,
                hospitalname: `AUD08 Approved Hospital ${suffix}`,
                registrationnumber: `HOSP-APPR-${suffix}`,
                contactpersonname: "Dr. Approved",
                contactpersonphone: "9123456701",
                address: "123 Approved Rd",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9300,
                longitude: 72.8250,
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(approvedHospital.hospitalid);
        const apprHospToken = generateToken(apprHospUser.userid, "HOSPITAL");

        // Pending Hospital
        const pendHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Pend Hospital ${suffix}`,
                email: `aud08-pendhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(pendHospUser.userid);
        const pendingHospital = await prisma.hospitals.create({
            data: {
                userid: pendHospUser.userid,
                hospitalname: `AUD08 Pending Hospital ${suffix}`,
                registrationnumber: `HOSP-PEND-${suffix}`,
                contactpersonname: "Dr. Pending",
                contactpersonphone: "9123456702",
                address: "124 Pending Rd",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400002",
                latitude: 18.9310,
                longitude: 72.8260,
                approvalstatus: "PENDING",
            },
        });
        hospitalIds.push(pendingHospital.hospitalid);
        const pendHospToken = generateToken(pendHospUser.userid, "HOSPITAL");

        // Rejected Hospital
        const rejHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Rej Hospital ${suffix}`,
                email: `aud08-rejhosp-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(rejHospUser.userid);
        const rejectedHospital = await prisma.hospitals.create({
            data: {
                userid: rejHospUser.userid,
                hospitalname: `AUD08 Rejected Hospital ${suffix}`,
                registrationnumber: `HOSP-REJ-${suffix}`,
                contactpersonname: "Dr. Rejected",
                contactpersonphone: "9123456703",
                address: "125 Rejected Rd",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400003",
                latitude: 18.9320,
                longitude: 72.8270,
                approvalstatus: "REJECTED",
            },
        });
        hospitalIds.push(rejectedHospital.hospitalid);
        const rejHospToken = generateToken(rejHospUser.userid, "HOSPITAL");

        // Requester
        const reqUser = await prisma.users.create({
            data: {
                name: `AUD08 Requester ${suffix}`,
                email: `aud08-requester-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "REQUESTER",
            },
        });
        userIds.push(reqUser.userid);
        const requester = await prisma.requesters.create({
            data: {
                userid: reqUser.userid,
                address: "10 Requester Lane",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400020",
                latitude: 18.9330,
                longitude: 72.8280,
            },
        });
        requesterIds.push(requester.requesterid);
        const requesterToken = generateToken(reqUser.userid, "REQUESTER");

        // Approved Blood Bank
        const bbUser = await prisma.users.create({
            data: {
                name: `AUD08 BB ${suffix}`,
                email: `aud08-bb-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "BLOOD_BANK",
            },
        });
        userIds.push(bbUser.userid);
        const approvedBloodBank = await prisma.bloodbanks.create({
            data: {
                userid: bbUser.userid,
                bloodbankname: `AUD08 BB ${suffix}`,
                licensenumber: `LIC-BB-${suffix}`,
                contactpersonname: "Manager BB",
                contactpersonphone: "9876543201",
                address: "50 Blood Bank Rd",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9305,
                longitude: 72.8255,
                approvalstatus: "APPROVED",
            },
        });
        bloodBankIds.push(approvedBloodBank.bloodbankid);

        console.log("\n--- Testing F1: Require APPROVED hospital status for hospital-created requests ---");
        // 1a. Admin calling POST /hospitals/:pendingHospitalId/bloodrequests -> must return 400
        const postPendingResp = await fetch(`${baseUrl}/hospitals/${pendingHospital.hospitalid}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                patientname: "Test Patient Pending Hosp",
                patientage: 30,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "A+",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 3600000).toISOString(),
            }),
        });
        assert(postPendingResp.status === 400, "F1: Admin creating request targeting PENDING hospital returns 400 Bad Request");
        const pendingJson = await postPendingResp.json();
        assert(/not approved/i.test(pendingJson.message), "F1: Error message specifies hospital is not approved");

        // 1b. Admin calling POST /hospitals/:rejectedHospitalId/bloodrequests -> must return 400
        const postRejectedResp = await fetch(`${baseUrl}/hospitals/${rejectedHospital.hospitalid}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                patientname: "Test Patient Rej Hosp",
                patientage: 30,
                patientgender: "FEMALE",
                patientcontact: "9123456789",
                bloodgroup: "O+",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                requiredby: new Date(Date.now() + 3600000).toISOString(),
            }),
        });
        assert(postRejectedResp.status === 400, "F1: Admin creating request targeting REJECTED hospital returns 400 Bad Request");

        // 1c. Admin calling POST /hospitals/:approvedHospitalId/bloodrequests -> succeeds
        const postApprResp = await fetch(`${baseUrl}/hospitals/${approvedHospital.hospitalid}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                patientname: "Test Patient Appr Hosp",
                patientage: 30,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "B+",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "MEDIUM",
                requiredby: new Date(Date.now() + 3600000).toISOString(),
            }),
        });
        assert(postApprResp.status === 201, "F1: Admin creating request targeting APPROVED hospital succeeds with 201 Created");
        const apprCreatedJson = await postApprResp.json();
        requestIds.push(apprCreatedJson.requestid);
        assert(apprCreatedJson.hospitalid === approvedHospital.hospitalid, "F1: Created request binds to approved hospital ID");

        console.log("\n--- Testing F2: Validate hospital UUID before ADMIN middleware bypass ---");
        // 2a. Admin sending POST /hospitals/not-a-valid-uuid/bloodrequests -> returns 404, NOT 500
        const invalidUuidPostResp = await fetch(`${baseUrl}/hospitals/not-a-valid-uuid/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                patientname: "Invalid UUID Patient",
            }),
        });
        assert(invalidUuidPostResp.status === 404, "F2: Admin request with invalid UUID returns 404 Not Found (no 500 DB crash)");

        // 2b. Admin sending GET /hospitals/not-a-valid-uuid/bloodrequests -> returns 404, NOT 500
        const invalidUuidGetResp = await fetch(`${baseUrl}/hospitals/not-a-valid-uuid/bloodrequests`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${adminToken}`,
            },
        });
        assert(invalidUuidGetResp.status === 404, "F2: Admin GET with invalid UUID returns 404 Not Found (no 500 DB crash)");

        console.log("\n--- Testing F3: Recheck and lock assigned hospital approval in POST /bloodrequests using FOR SHARE ---");
        // 3a. Requester POST /bloodrequests targeting PENDING hospital -> 400
        const formPend = new FormData();
        formPend.append("patientname", "F3 Patient Pending");
        formPend.append("patientage", "40");
        formPend.append("patientgender", "FEMALE");
        formPend.append("patientcontact", "9123456789");
        formPend.append("bloodgroup", "A_POSITIVE");
        formPend.append("bloodcomponent", "WHOLE_BLOOD");
        formPend.append("unitsrequired", "1");
        formPend.append("urgencylevel", "HIGH");
        formPend.append("hospitalid", pendingHospital.hospitalid);
        formPend.append("requiredby", new Date(Date.now() + 3600000).toISOString());
        formPend.append("prescription", new Blob(["%PDF test rx"], { type: "application/pdf" }), "rx.pdf");

        const respPendCreation = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: { Authorization: `Bearer ${requesterToken}` },
            body: formPend,
        });
        assert(respPendCreation.status === 400, "F3: POST /bloodrequests rejects PENDING hospital with 400 Bad Request");

        // 3b. Requester POST /bloodrequests targeting REJECTED hospital -> 400
        const formRej = new FormData();
        formRej.append("patientname", "F3 Patient Rejected");
        formRej.append("patientage", "40");
        formRej.append("patientgender", "FEMALE");
        formRej.append("patientcontact", "9123456789");
        formRej.append("bloodgroup", "A_POSITIVE");
        formRej.append("bloodcomponent", "WHOLE_BLOOD");
        formRej.append("unitsrequired", "1");
        formRej.append("urgencylevel", "HIGH");
        formRej.append("hospitalid", rejectedHospital.hospitalid);
        formRej.append("requiredby", new Date(Date.now() + 3600000).toISOString());
        formRej.append("prescription", new Blob(["%PDF test rx"], { type: "application/pdf" }), "rx.pdf");

        const respRejCreation = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: { Authorization: `Bearer ${requesterToken}` },
            body: formRej,
        });
        assert(respRejCreation.status === 400, "F3: POST /bloodrequests rejects REJECTED hospital with 400 Bad Request");

        // 3c. Concurrency simulation: Hospital is revoked while request transaction executes
        // Create an ephemeral approved hospital
        const ephemHospUser = await prisma.users.create({
            data: {
                name: `AUD08 Ephem Hosp ${suffix}`,
                email: `aud08-ephem-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(ephemHospUser.userid);
        const ephemHosp = await prisma.hospitals.create({
            data: {
                userid: ephemHospUser.userid,
                hospitalname: `AUD08 Ephem Hosp ${suffix}`,
                registrationnumber: `HOSP-EPH-${suffix}`,
                contactpersonname: "Dr. Ephem",
                contactpersonphone: "9123456709",
                address: "99 Ephem Rd",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(ephemHosp.hospitalid);

        // Revoke the hospital immediately
        await prisma.hospitals.update({
            where: { hospitalid: ephemHosp.hospitalid },
            data: { approvalstatus: "REJECTED" },
        });

        // Now attempt creation referencing ephemHosp
        const formEphem = new FormData();
        formEphem.append("patientname", "F3 Patient Ephem Revoked");
        formEphem.append("patientage", "40");
        formEphem.append("patientgender", "MALE");
        formEphem.append("patientcontact", "9123456789");
        formEphem.append("bloodgroup", "O_POSITIVE");
        formEphem.append("bloodcomponent", "WHOLE_BLOOD");
        formEphem.append("unitsrequired", "1");
        formEphem.append("urgencylevel", "HIGH");
        formEphem.append("hospitalid", ephemHosp.hospitalid);
        formEphem.append("requiredby", new Date(Date.now() + 3600000).toISOString());
        formEphem.append("prescription", new Blob(["%PDF test rx"], { type: "application/pdf" }), "rx.pdf");

        const respEphemCreation = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: { Authorization: `Bearer ${requesterToken}` },
            body: formEphem,
        });
        assert(respEphemCreation.status === 400, "F3: POST /bloodrequests transactionally rejects revoked hospital with 400");

        console.log("\n--- Testing F4: Enforce assigned hospital approval in UnitTraceabilityService.assignRequisition ---");
        // Create a requisition linked to rejectedHospital with a VERIFIED prescription
        const reqRejHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: rejectedHospital.hospitalid,
                patientname: "F4 Patient Rej Assigned",
                patientage: 50,
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
        requestIds.push(reqRejHosp.requestid);
        await prisma.prescription.create({
            data: {
                requestid: reqRejHosp.requestid,
                fileurl: "test-f4.pdf",
                doctorname: "Dr. F4",
                hospitalname: rejectedHospital.hospitalname,
                status: "VERIFIED",
                verifiedbyhospitalid: approvedHospital.hospitalid,
            },
        });

        // Admin attempts to assign this requisition to approved blood bank
        let assignRejError: any = null;
        try {
            await UnitTraceabilityService.assignRequisition({
                requestId: reqRejHosp.requestid,
                bloodBankId: approvedBloodBank.bloodbankid,
                assignedByUserId: adminUser.userid,
                actorUserId: adminUser.userid,
            });
        } catch (err: any) {
            assignRejError = err;
        }
        assert(assignRejError !== null, "F4: assignRequisition throws an error when assigned hospital is REJECTED");
        assert(assignRejError.statusCode === 403, "F4: assignRequisition returns 403 Forbidden for REJECTED assigned hospital");
        assert(/Only APPROVED hospitals/i.test(assignRejError.message), "F4: Error message indicates assigned hospital is not approved");

        console.log("\n--- Testing F5: Approved hospital validation in prescription verification transaction ---");
        // 5a. Hospital-less requisition verification attempt by Admin -> 400
        const reqNoHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: null,
                patientname: "F5 Patient No Hospital",
                patientage: 45,
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
        requestIds.push(reqNoHosp.requestid);
        await prisma.prescription.create({
            data: {
                requestid: reqNoHosp.requestid,
                fileurl: "test-f5-nohosp.pdf",
                doctorname: "Dr. NoHosp",
                hospitalname: "Unassigned Clinic",
                status: "PENDING",
            },
        });

        const verifyNoHospResp = await fetch(`${baseUrl}/bloodrequests/${reqNoHosp.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                status: "VERIFIED",
            }),
        });
        assert(verifyNoHospResp.status === 400, "F5: Admin cannot verify prescription on requisition with null hospitalid (returns 400)");

        // 5b. Requisition with REJECTED hospital verification attempt by Admin -> 403
        const reqWithRejHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: rejectedHospital.hospitalid,
                patientname: "F5 Patient Rej Hospital",
                patientage: 45,
                patientgender: "FEMALE",
                patientcontact: "9123456789",
                bloodgroup: "AB_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "MEDIUM",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqWithRejHosp.requestid);
        await prisma.prescription.create({
            data: {
                requestid: reqWithRejHosp.requestid,
                fileurl: "test-f5-rejhosp.pdf",
                doctorname: "Dr. Rej",
                hospitalname: rejectedHospital.hospitalname,
                status: "PENDING",
            },
        });

        const verifyRejHospResp = await fetch(`${baseUrl}/bloodrequests/${reqWithRejHosp.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                status: "VERIFIED",
            }),
        });
        assert(verifyRejHospResp.status === 403, "F5: Admin cannot verify prescription on requisition with REJECTED hospital (returns 403)");

        // 5c. Requisition with APPROVED hospital verification attempt by Hospital -> succeeds
        const reqWithApprHosp = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: approvedHospital.hospitalid,
                patientname: "F5 Patient Appr Hospital",
                patientage: 45,
                patientgender: "OTHER",
                patientcontact: "9123456789",
                bloodgroup: "O_NEGATIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqWithApprHosp.requestid);
        await prisma.prescription.create({
            data: {
                requestid: reqWithApprHosp.requestid,
                fileurl: "test-f5-apprhosp.pdf",
                doctorname: "Dr. Appr",
                hospitalname: approvedHospital.hospitalname,
                status: "PENDING",
            },
        });

        const verifyApprHospResp = await fetch(`${baseUrl}/bloodrequests/${reqWithApprHosp.requestid}/prescription/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apprHospToken}`,
            },
            body: JSON.stringify({
                status: "VERIFIED",
            }),
        });
        assert(verifyApprHospResp.status === 200, "F5: Prescription verification succeeds for requisition with APPROVED hospital (200 OK)");

        console.log("\n--- Testing F6: Revalidate hospital approval in prescription replacement ---");
        // 6a. Attempt prescription replacement on reqWithRejHosp (rejected hospital) -> 403
        // Mark prescription as REJECTED first so replacement is eligible
        await prisma.prescription.update({
            where: { requestid: reqWithRejHosp.requestid },
            data: { status: "REJECTED", remarks: "Invalid clinical details" },
        });

        const formReplRej = new FormData();
        formReplRej.append("doctorname", "Dr. Replacement");
        formReplRej.append("hospitalname", rejectedHospital.hospitalname);
        formReplRej.append("prescription", new Blob(["%PDF replacement rx"], { type: "application/pdf" }), "rx-repl.pdf");

        const replRejResp = await fetch(`${baseUrl}/bloodrequests/${reqWithRejHosp.requestid}/prescription/replacement`, {
            method: "POST",
            headers: { Authorization: `Bearer ${requesterToken}` },
            body: formReplRej,
        });
        assert(replRejResp.status === 403, "F6: Prescription replacement rejected with 403 when assigned hospital is not APPROVED");
        const replRejJson = await replRejResp.json();
        assert(/Replacement prescriptions cannot be submitted/i.test(replRejJson.message), "F6: Clear message on unapproved hospital replacement rejection");

        // 6b. Attempt prescription replacement on reqWithApprHosp (mark REJECTED first) -> succeeds
        await prisma.prescription.update({
            where: { requestid: reqWithApprHosp.requestid },
            data: { status: "REJECTED", remarks: "Needs clearer signature" },
        });

        const formReplAppr = new FormData();
        formReplAppr.append("doctorname", "Dr. Replacement Approved");
        formReplAppr.append("hospitalname", approvedHospital.hospitalname);
        formReplAppr.append("prescription", new Blob(["%PDF replacement rx 2"], { type: "application/pdf" }), "rx-repl2.pdf");

        const replApprResp = await fetch(`${baseUrl}/bloodrequests/${reqWithApprHosp.requestid}/prescription/replacement`, {
            method: "POST",
            headers: { Authorization: `Bearer ${requesterToken}` },
            body: formReplAppr,
        });
        assert(replApprResp.status === 200, "F6: Prescription replacement succeeds for requisition with APPROVED hospital");

        console.log("\n--- Testing F7: Hospital approval revocation containment ---");
        // Create an approved hospital with active broadcast and scheduler job
        const hospToRevokeUser = await prisma.users.create({
            data: {
                name: `AUD08 Hosp Revoke ${suffix}`,
                email: `aud08-hosp-rev-${suffix}@swastya.org`,
                password: "hashed_password",
                role: "HOSPITAL",
            },
        });
        userIds.push(hospToRevokeUser.userid);
        const hospToRevoke = await prisma.hospitals.create({
            data: {
                userid: hospToRevokeUser.userid,
                hospitalname: `AUD08 Hosp Revoke ${suffix}`,
                registrationnumber: `HOSP-REV-${suffix}`,
                contactpersonname: "Dr. RevokeTarget",
                contactpersonphone: "9123456780",
                address: "77 Revoke Way",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9300,
                longitude: 72.8250,
                approvalstatus: "APPROVED",
            },
        });
        hospitalIds.push(hospToRevoke.hospitalid);

        const reqActive = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospToRevoke.hospitalid,
                patientname: "F7 Patient Active Broadcast",
                patientage: 38,
                patientgender: "MALE",
                patientcontact: "9123456789",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "CRITICAL",
                isemergency: true,
                status: "DONOR_MATCHING",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqActive.requestid);

        // Arm active broadcast and scheduler follow-up job
        const activeBc = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqActive.requestid,
                triggeredbyuserid: adminUser.userid,
                triggertype: "MANUAL",
                triggerreason: "Initial broadcast",
                radiuskm: 15,
                broadcaststatus: "ACTIVE",
            },
        });

        const activeJob = await prisma.emergency_followup_jobs.create({
            data: {
                requestid: reqActive.requestid,
                jobtype: "RADIUS_EXPANSION",
                status: "PENDING",
                scheduledfor: new Date(Date.now() + 180000),
                cooldowndurationminutes: 15,
                currentstep: 0,
                maxsteps: 3,
                idempotencykey: `dedup-${reqActive.requestid}`,
            },
        });

        // Admin revokes hospital approval via PUT /hospitals/:id
        const revokeResp = await fetch(`${baseUrl}/hospitals/${hospToRevoke.hospitalid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                approvalstatus: "REJECTED",
            }),
        });
        assert(revokeResp.status === 200, "F7: Admin PUT /hospitals/:id succeeds when revoking approval to REJECTED");

        // Verify active broadcast is CANCELLED
        const checkBc = await prisma.emergencybroadcasts.findUnique({
            where: { broadcastid: activeBc.broadcastid },
        });
        assert(checkBc?.broadcaststatus === "CANCELLED", "F7: Active emergency broadcast is atomically CANCELLED upon hospital revocation");

        // Verify open scheduler job is CANCELLED with stable error
        const checkJob = await prisma.emergency_followup_jobs.findUnique({
            where: { jobid: activeJob.jobid },
        });
        assert(checkJob?.status === "CANCELLED", "F7: Open scheduler job is atomically CANCELLED upon hospital revocation");
        assert(checkJob?.lasterror === "HOSPITAL_APPROVAL_REVOKED", "F7: Scheduler job lasterror is safely set to HOSPITAL_APPROVAL_REVOKED");

        // Verify bloodrequest row itself is PRESERVED
        const checkReq = await prisma.bloodrequests.findUnique({
            where: { requestid: reqActive.requestid },
        });
        assert(checkReq !== null, "F7: Blood request record is preserved (not deleted)");
        assert(checkReq?.status === "DONOR_MATCHING", "F7: Blood request status is preserved without arbitrary state destruction");

        console.log("\n--- Testing F8: Safe initial hospital assignment for requests with null hospitalid ---");
        // 8a. Create a request with null hospitalid
        const reqUnassigned = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: null,
                patientname: "F8 Patient Hospital-Less",
                patientage: 28,
                patientgender: "FEMALE",
                patientcontact: "9123456789",
                bloodgroup: "B_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "CREATED",
                requiredby: new Date(Date.now() + 3600000),
            },
        });
        requestIds.push(reqUnassigned.requestid);
        assert(reqUnassigned.hospitalid === null, "F8: Requisition created with initial null hospitalid");

        // 8b. Initial assignment attempt with invalid UUID format -> 400
        const assignInvalidResp = await fetch(`${baseUrl}/bloodrequests/${reqUnassigned.requestid}/assign-hospital`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterToken}`,
            },
            body: JSON.stringify({ hospitalid: "invalid-uuid" }),
        });
        assert(assignInvalidResp.status === 400, "F8: Initial assignment with invalid UUID format returns 400 Bad Request");

        // 8c. Initial assignment attempt targeting PENDING hospital -> 400
        const assignPendResp = await fetch(`${baseUrl}/bloodrequests/${reqUnassigned.requestid}/assign-hospital`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterToken}`,
            },
            body: JSON.stringify({ hospitalid: pendingHospital.hospitalid }),
        });
        assert(assignPendResp.status === 400, "F8: Initial assignment targeting PENDING hospital returns 400 Bad Request");

        // 8d. Initial assignment targeting APPROVED hospital by requester -> succeeds with 200
        const assignApprResp = await fetch(`${baseUrl}/bloodrequests/${reqUnassigned.requestid}/assign-hospital`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${requesterToken}`,
            },
            body: JSON.stringify({ hospitalid: approvedHospital.hospitalid }),
        });
        assert(assignApprResp.status === 200, "F8: Initial assignment targeting APPROVED hospital succeeds with 200 OK");
        const assignJson = await assignApprResp.json();
        assert(assignJson.bloodRequest.hospitalid === approvedHospital.hospitalid, "F8: Assigned hospital ID is now populated with approved hospital");

        // Verify requeststatushistory audit entry was created
        const historyCheck = await prisma.requeststatushistory.findFirst({
            where: {
                requestid: reqUnassigned.requestid,
                remarks: { contains: "Initial hospital assigned" },
            },
        });
        assert(historyCheck !== null, "F8: Request status history audit entry created for initial hospital assignment");

        // 8e. Attempt to REASSIGN the request to another hospital via POST /assign-hospital -> strictly 409 Conflict!
        const reassignResp = await fetch(`${baseUrl}/bloodrequests/${reqUnassigned.requestid}/assign-hospital`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ hospitalid: approvedHospital.hospitalid }),
        });
        assert(reassignResp.status === 409, "F8: Reassignment attempt via POST /assign-hospital strictly rejected with 409 Conflict");
        const reassignJson = await reassignResp.json();
        assert(/Reassignment is strictly prohibited/i.test(reassignJson.message), "F8: Reassignment error message clearly states prohibition");

        // 8f. Attempt to REASSIGN via PUT /bloodrequests/:id -> strictly 409 Conflict!
        const putReassignResp = await fetch(`${baseUrl}/bloodrequests/${reqUnassigned.requestid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({ hospitalid: pendingHospital.hospitalid }),
        });
        assert(putReassignResp.status === 409, "F8: Reassignment attempt via PUT /bloodrequests/:id strictly rejected with 409 Conflict");

        console.log("\n=======================================================");
        console.log("AUD-08 Hospital Approval Remediation Suite: PASS");
        console.log(`Total Passed: ${totalPassed}`);
        console.log(`Total Failed: ${totalFailed}`);
        console.log("=======================================================\n");

    } finally {
        if (server) {
            await new Promise<void>((resolve) => (server as http.Server).close(() => resolve()));
        }

        // Clean up test data
        if (requestIds.length > 0) {
            await prisma.emergency_followup_jobs.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.emergencybroadcasts.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescriptionhistory.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.prescription.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
            await prisma.bloodrequests.deleteMany({ where: { requestid: { in: requestIds } } }).catch(() => {});
        }

        if (bloodBankIds.length > 0) {
            await prisma.bloodbanks.deleteMany({ where: { bloodbankid: { in: bloodBankIds } } }).catch(() => {});
        }
        if (requesterIds.length > 0) {
            await prisma.requesters.deleteMany({ where: { requesterid: { in: requesterIds } } }).catch(() => {});
        }
        if (hospitalIds.length > 0) {
            await prisma.hospitals.deleteMany({ where: { hospitalid: { in: hospitalIds } } }).catch(() => {});
        }
        if (userIds.length > 0) {
            await prisma.notification.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: { in: userIds } } }).catch(() => {});
        }
    }
}

run().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
