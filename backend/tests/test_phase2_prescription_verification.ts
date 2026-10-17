import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import app from "../src/app";
import http from "http";
import fs from "fs";
import path from "path";
import { getPrescriptionStorageDir } from "../src/utils/fileValidation";

let server: http.Server;
let API_BASE = "";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        throw new Error(message);
    }
    console.log(`[PASS] ${message}`);
    passedTests++;
}

// Helper to make multipart FormData requests
async function postMultipart(endpoint: string, token: string, fields: Record<string, string>, file?: { name: string; buffer: Buffer; filename: string; type: string }) {
    const formData = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        formData.append(k, v);
    }
    if (file) {
        const blob = new Blob([file.buffer], { type: file.type });
        formData.append(file.name, blob, file.filename);
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }

    return { status: res.status, data: json, headers: res.headers };
}

async function runPhase2PrescriptionTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 2: PRESCRIPTION UPLOAD & VERIFICATION TEST SUITE               ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();

    // Users
    const requester1Email = `rx_req1_${timestamp}@swastya.org`;
    const requester2Email = `rx_req2_${timestamp}@swastya.org`;
    const hospital1Email = `rx_hosp1_${timestamp}@swastya.org`;
    const hospital2Email = `rx_hosp2_${timestamp}@swastya.org`;
    const adminEmail = `rx_admin_${timestamp}@swastya.org`;

    let req1User: any = null;
    let req2User: any = null;
    let hosp1User: any = null;
    let hosp2User: any = null;
    let adminUser: any = null;

    let req1Record: any = null;
    let req2Record: any = null;
    let hosp1Record: any = null;
    let hosp2Record: any = null;

    let req1Token = "";
    let req2Token = "";
    let hosp1Token = "";
    let hosp2Token = "";
    let adminToken = "";

    try {
        // Start ephemeral HTTP server
        await new Promise<void>((resolve) => {
            server = http.createServer(app);
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address() as any;
                API_BASE = `http://127.0.0.1:${addr.port}`;
                console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);
                resolve();
            });
        });

        // Setup test users & profiles
        adminUser = await prisma.users.create({
            data: {
                name: "Admin Reviewer",
                email: adminEmail,
                password: "hashed_dummy_password",
                role: "ADMIN"
            }
        });
        adminToken = generateToken(adminUser.userid, "ADMIN");

        req1User = await prisma.users.create({
            data: {
                name: "Primary Requester",
                email: requester1Email,
                password: "hashed_dummy_password",
                role: "REQUESTER"
            }
        });
        req1Record = await prisma.requesters.create({
            data: {
                userid: req1User.userid,
                city: "Bengaluru",
                state: "Karnataka",
                address: "Koramangala, Bengaluru",
                pincode: "560034",
                latitude: 12.9352,
                longitude: 77.6245
            }
        });
        req1Token = generateToken(req1User.userid, "REQUESTER");

        req2User = await prisma.users.create({
            data: {
                name: "Secondary Requester",
                email: requester2Email,
                password: "hashed_dummy_password",
                role: "REQUESTER"
            }
        });
        req2Record = await prisma.requesters.create({
            data: {
                userid: req2User.userid,
                city: "Bengaluru",
                state: "Karnataka",
                address: "Indiranagar, Bengaluru",
                pincode: "560038",
                latitude: 12.9784,
                longitude: 77.6408
            }
        });
        req2Token = generateToken(req2User.userid, "REQUESTER");

        hosp1User = await prisma.users.create({
            data: {
                name: "City Care Hospital User",
                email: hospital1Email,
                password: "hashed_dummy_password",
                role: "HOSPITAL"
            }
        });
        hosp1Record = await prisma.hospitals.create({
            data: {
                userid: hosp1User.userid,
                hospitalname: "City Care Hospital",
                registrationnumber: `REG_HOSP1_${timestamp}`,
                contactpersonname: "Dr. Arvind",
                contactpersonphone: "9876543203",
                city: "Bengaluru",
                state: "Karnataka",
                address: "MG Road, Bengaluru",
                pincode: "560001",
                latitude: 12.9756,
                longitude: 77.6066
            }
        });
        hosp1Token = generateToken(hosp1User.userid, "HOSPITAL");

        hosp2User = await prisma.users.create({
            data: {
                name: "St Jude User",
                email: hospital2Email,
                password: "hashed_dummy_password",
                role: "HOSPITAL"
            }
        });
        hosp2Record = await prisma.hospitals.create({
            data: {
                userid: hosp2User.userid,
                hospitalname: "St. Jude Medical Center",
                registrationnumber: `REG_HOSP2_${timestamp}`,
                contactpersonname: "Dr. Matthew",
                contactpersonphone: "9876543204",
                city: "Bengaluru",
                state: "Karnataka",
                address: "Whitefield, Bengaluru",
                pincode: "560066",
                latitude: 12.9698,
                longitude: 77.7500
            }
        });
        hosp2Token = generateToken(hosp2User.userid, "HOSPITAL");

        // Sample valid binary buffers with authentic file magic bytes
        const validPdfBuffer = Buffer.concat([
            Buffer.from("%PDF-1.4\n%âãÏÓ\n"),
            Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")
        ]);

        const validJpgBuffer = Buffer.from([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0xFF, 0xD9
        ]);

        const validPngBuffer = Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89
        ]);

        // Base request fields
        const baseRequestFields = {
            bloodgroup: "A_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: "2",
            urgencylevel: "CRITICAL",
            requiredby: new Date(Date.now() + 86400000).toISOString(),
            hospitalid: hosp1Record.hospitalid,
            patientname: "Ramesh Sharma",
            patientage: "45",
            patientgender: "MALE",
            patientcontact: "9876543201",
            doctorname: "Dr. V. K. Rao",
            notes: "Immediate transfusion required for surgery"
        };

        // =========================================================================
        // TEST 1: Requester submission without prescription is rejected
        // =========================================================================
        console.log("--- TEST 1: Requester Submission Without Prescription ---");
        const noRxRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields);
        assert(noRxRes.status === 400, `Submission without prescription rejected with HTTP 400 (got ${noRxRes.status})`);
        assert(
            noRxRes.data?.message?.includes("Prescription upload is mandatory") ||
            noRxRes.data?.error?.includes("Prescription upload is mandatory") ||
            noRxRes.data?.message?.includes("prescription"),
            `Clear rejection message returned: ${noRxRes.data?.message || noRxRes.data?.error}`
        );

        // =========================================================================
        // TEST 2: Valid prescription upload and request creation succeed
        // =========================================================================
        console.log("\n--- TEST 2: Valid Prescription Upload & Request Creation ---");
        const validRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields, {
            name: "prescription",
            buffer: validPdfBuffer,
            filename: "doctor_prescription.pdf",
            type: "application/pdf"
        });
        assert(validRes.status === 201, `Valid PDF prescription accepted with HTTP 201 (got ${validRes.status})`);
        const createdRequestId = validRes.data?.data?.requestid || validRes.data?.requestid;
        assert(!!createdRequestId, `Created request returned with ID ${createdRequestId}`);

        // Verify prescription record in DB
        const rxInDb = await prisma.prescription.findUnique({
            where: { requestid: createdRequestId }
        });
        assert(rxInDb !== null, `Prescription row created and linked to request ${createdRequestId}`);
        assert(rxInDb?.status === "PENDING", `Prescription initial status is PENDING (got ${rxInDb?.status})`);
        assert(rxInDb?.originalfilename === "doctor_prescription.pdf", `Original filename recorded (${rxInDb?.originalfilename})`);
        assert(rxInDb?.mimetype === "application/pdf", `MIME type recorded (${rxInDb?.mimetype})`);
        assert((rxInDb?.filesize || 0) > 0, `File size recorded (${rxInDb?.filesize} bytes)`);

        // Verify file exists in private storage dir
        const storageDir = getPrescriptionStorageDir();
        const storedPath = path.join(storageDir, path.basename(rxInDb!.fileurl));
        assert(fs.existsSync(storedPath), `Prescription file safely stored in private directory: ${storedPath}`);

        // Also test PNG upload for another request
        const validPngRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields, {
            name: "prescription",
            buffer: validPngBuffer,
            filename: "rx_scan.png",
            type: "image/png"
        });
        assert(validPngRes.status === 201, `Valid PNG prescription accepted with HTTP 201 (got ${validPngRes.status})`);
        const pngReqId = validPngRes.data?.data?.requestid || validPngRes.data?.requestid;
        const pngRxInDb = await prisma.prescription.findUnique({
            where: { requestid: pngReqId }
        });
        assert(pngRxInDb?.mimetype === "image/png", `PNG MIME type verified (${pngRxInDb?.mimetype})`);

        // =========================================================================
        // TEST 3: Invalid file types, spoofed signatures, and oversized files rejected
        // =========================================================================
        console.log("\n--- TEST 3: Spoofed Signatures, Invalid Types & Size Validation ---");

        // 3a. Spoofed PDF (plain text file renamed as .pdf)
        const spoofedPdfBuffer = Buffer.from("Hello world, this is just plain text disguised as a PDF file!");
        const spoofedRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields, {
            name: "prescription",
            buffer: spoofedPdfBuffer,
            filename: "malicious.pdf",
            type: "application/pdf"
        });
        assert(spoofedRes.status === 400, `Spoofed PDF signature rejected with HTTP 400 (got ${spoofedRes.status})`);
        assert(
            spoofedRes.data?.message?.includes("File content does not match") ||
            spoofedRes.data?.message?.includes("signature") ||
            spoofedRes.data?.message?.includes("magic"),
            `Signature rejection message returned: ${spoofedRes.data?.message}`
        );

        // 3b. Executable / script file renamed as .png
        const spoofedScriptBuffer = Buffer.from("<script>alert('xss')</script>");
        const scriptRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields, {
            name: "prescription",
            buffer: spoofedScriptBuffer,
            filename: "exploit.png",
            type: "image/png"
        });
        assert(scriptRes.status === 400, `Script pretending to be PNG rejected with HTTP 400 (got ${scriptRes.status})`);

        // 3c. Disallowed extension / type (.txt)
        const textRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields, {
            name: "prescription",
            buffer: Buffer.from("plain text notes"),
            filename: "notes.txt",
            type: "text/plain"
        });
        assert(textRes.status === 400, `Disallowed extension (.txt) rejected with HTTP 400 (got ${textRes.status})`);

        // 3d. Oversized file (> 5MB)
        const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0x41); // 5.5MB
        const oversizeRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields, {
            name: "prescription",
            buffer: oversizedBuffer,
            filename: "huge.pdf",
            type: "application/pdf"
        });
        assert(oversizeRes.status === 400, `Oversized file (>5MB) rejected with HTTP 400 (got ${oversizeRes.status})`);

        // =========================================================================
        // TEST 4: Failed uploads do not leave inconsistent records or orphaned files
        // =========================================================================
        console.log("\n--- TEST 4: Atomic Transactions & Zero Orphaned Files ---");
        // Count files before
        const filesBefore = fs.readdirSync(storageDir);
        // Attempt an invalid request (invalid bloodgroup) with a valid PDF
        const failedReqRes = await postMultipart("/bloodrequests", req1Token, {
            ...baseRequestFields,
            bloodgroup: "INVALID_GROUP"
        }, {
            name: "prescription",
            buffer: validPdfBuffer,
            filename: "test_orphan.pdf",
            type: "application/pdf"
        });
        assert(failedReqRes.status === 400, `Invalid request parameters rejected with HTTP 400 (got ${failedReqRes.status})`);
        const filesAfter = fs.readdirSync(storageDir);
        assert(filesBefore.length === filesAfter.length, `Storage directory has zero orphaned files after failed transaction (${filesBefore.length} === ${filesAfter.length})`);

        // =========================================================================
        // TEST 5: Unauthorized prescription access is denied
        // =========================================================================
        console.log("\n--- TEST 5: Unauthorized Prescription Access Protection ---");

        // 5a. Unauthenticated GET /file
        const unauthRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/file`);
        assert(unauthRes.status === 401, `Unauthenticated prescription download returns HTTP 401 (got ${unauthRes.status})`);

        // 5b. Authenticated requester owner CAN download
        const ownerRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/file`, {
            headers: { Authorization: `Bearer ${req1Token}` }
        });
        assert(ownerRes.status === 200, `Requester owner can download prescription with HTTP 200 (got ${ownerRes.status})`);
        assert(ownerRes.headers.get("content-type") === "application/pdf", `Owner receives application/pdf Content-Type`);

        // 5c. Admin CAN download
        const adminRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/file`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(adminRes.status === 200, `Admin can access prescription with HTTP 200 (got ${adminRes.status})`);

        // 5d. Assigned hospital CAN download
        const hosp1DownloadRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/file`, {
            headers: { Authorization: `Bearer ${hosp1Token}` }
        });
        assert(hosp1DownloadRes.status === 200, `Assigned hospital can download prescription with HTTP 200 (got ${hosp1DownloadRes.status})`);

        // =========================================================================
        // TEST 6: Cross-requester and cross-hospital access is denied
        // =========================================================================
        console.log("\n--- TEST 6: Cross-Requester and Cross-Hospital Isolation ---");

        // 6a. Unrelated Requester 2 attempting to access Requester 1's prescription
        const crossReqRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/file`, {
            headers: { Authorization: `Bearer ${req2Token}` }
        });
        assert(crossReqRes.status === 403, `Cross-requester access denied with HTTP 403 (got ${crossReqRes.status})`);

        // 6b. Unrelated Hospital 2 attempting to access Hospital 1's assigned requisition prescription
        const crossHospRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/file`, {
            headers: { Authorization: `Bearer ${hosp2Token}` }
        });
        assert(crossHospRes.status === 403, `Cross-hospital access denied with HTTP 403 (got ${crossHospRes.status})`);

        // 6c. Hospital 2 attempting to review/verify Hospital 1's requisition
        const crossVerifyRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/verify`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${hosp2Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "VERIFIED", remarks: "Unauthorized review attempt" })
        });
        assert(crossVerifyRes.status === 403, `Cross-hospital review denied with HTTP 403 (got ${crossVerifyRes.status})`);

        // =========================================================================
        // TEST 7 & 8: Hospital verification, rejection, and mandatory explanation
        // =========================================================================
        console.log("\n--- TEST 7 & 8: Hospital Verification & Rejection Explanations ---");

        // 8. Rejection without remarks must fail with HTTP 400
        const emptyRejectRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/verify`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "REJECTED", remarks: "   " })
        });
        assert(emptyRejectRes.status === 400, `Prescription rejection without remarks rejected with HTTP 400 (got ${emptyRejectRes.status})`);

        // 7a. Proper Rejection with explanation
        const rejectRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/verify`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: "REJECTED",
                remarks: "Doctor signature is illegible and hospital stamp is blurred."
            })
        });
        assert(rejectRes.status === 200, `Prescription rejection succeeded with HTTP 200 (got ${rejectRes.status})`);

        // Verify status in DB
        const rejectedRx = await prisma.prescription.findUnique({
            where: { requestid: createdRequestId }
        });
        assert(rejectedRx?.status === "REJECTED", `Prescription status in DB updated to REJECTED (got ${rejectedRx?.status})`);
        assert(rejectedRx?.verifiedbyhospitalid === hosp1Record.hospitalid, `Verified by hospital ID recorded`);
        assert(rejectedRx?.remarks?.includes("illegible"), `Rejection remarks saved: ${rejectedRx?.remarks}`);

        // Verify audit record in prescriptionhistory
        const historyRecords = await prisma.prescriptionhistory.findMany({
            where: { requestid: createdRequestId }
        });
        assert(historyRecords.length === 1, `Audit entry logged in prescriptionhistory (count: ${historyRecords.length})`);
        assert(historyRecords[0].status === "REJECTED", `History entry has status REJECTED`);
        assert(historyRecords[0].reviewedbyhospitalid === hosp1Record.hospitalid, `History entry records reviewer hospital`);

        // =========================================================================
        // TEST 9: Replacement uploads return status to PENDING & preserve history
        // =========================================================================
        console.log("\n--- TEST 9: Requester Replacement Upload & Status Reset ---");

        // Requester 2 trying to upload replacement for Requester 1's request -> 403
        const unauthReplacement = await postMultipart(`/bloodrequests/${createdRequestId}/prescription/replacement`, req2Token, {
            doctorname: "Dr. New Doctor"
        }, {
            name: "prescription",
            buffer: validJpgBuffer,
            filename: "replacement_rx.jpg",
            type: "image/jpeg"
        });
        assert(unauthReplacement.status === 403, `Non-owner cannot upload replacement (got ${unauthReplacement.status})`);

        // Requester 1 uploads replacement JPEG
        const replacementRes = await postMultipart(`/bloodrequests/${createdRequestId}/prescription/replacement`, req1Token, {
            doctorname: "Dr. Arvind Rao",
            hospitalname: "Apollo Clinic"
        }, {
            name: "prescription",
            buffer: validJpgBuffer,
            filename: "replacement_rx.jpg",
            type: "image/jpeg"
        });
        assert(replacementRes.status === 200, `Requester replacement upload accepted with HTTP 200 (got ${replacementRes.status})`);

        // Verify prescription reset to PENDING
        const resetRx = await prisma.prescription.findUnique({
            where: { requestid: createdRequestId }
        });
        assert(resetRx?.status === "PENDING", `Prescription status reset to PENDING after replacement (got ${resetRx?.status})`);
        assert(resetRx?.originalfilename === "replacement_rx.jpg", `Updated filename recorded (${resetRx?.originalfilename})`);
        assert(resetRx?.mimetype === "image/jpeg", `Updated MIME type recorded (${resetRx?.mimetype})`);

        // Verify history preserved
        const historyAfterReplacement = await prisma.prescriptionhistory.findMany({
            where: { requestid: createdRequestId },
            orderBy: { createdat: "asc" }
        });
        assert(historyAfterReplacement.length >= 1, `Previous rejection history retained (${historyAfterReplacement.length} records)`);

        // Now Hospital 1 verifies the replacement prescription
        const verifyRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/verify`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: "VERIFIED",
                remarks: "Replacement prescription confirmed and verified with Apollo Clinic."
            })
        });
        assert(verifyRes.status === 200, `Replacement verification accepted with HTTP 200 (got ${verifyRes.status})`);

        const verifiedRx = await prisma.prescription.findUnique({
            where: { requestid: createdRequestId }
        });
        assert(verifiedRx?.status === "VERIFIED", `Prescription status is now VERIFIED`);

        // =========================================================================
        // TEST 10: Requesters cannot alter verification status & Clinical safety gates
        // =========================================================================
        console.log("\n--- TEST 10: Prevention of Requester Bypass & Clinical Safety Gates ---");

        // 10a. Requester cannot call POST /verify
        const reqVerifyAttempt = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}/prescription/verify`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${req1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "VERIFIED" })
        });
        assert(reqVerifyAttempt.status === 403, `Requester forbidden from calling /verify (got ${reqVerifyAttempt.status})`);

        // 10b. Clinical safety gate: Create a new request with PENDING prescription, attempt to advance to BLOOD_ARRANGED and FULFILLED
        const unverifiedReqRes = await postMultipart("/bloodrequests", req1Token, baseRequestFields, {
            name: "prescription",
            buffer: validPdfBuffer,
            filename: "pending_rx.pdf",
            type: "application/pdf"
        });
        const unverifiedReqId = unverifiedReqRes.data?.data?.requestid || unverifiedReqRes.data?.requestid;

        // 10b. Advance to HOSPITAL_REVIEW first (permitted from CREATED)
        const advanceToReviewRes = await fetch(`${API_BASE}/bloodrequests/${unverifiedReqId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW", remarks: "Beginning clinical review" })
        });
        assert(advanceToReviewRes.status === 200, `Advance to HOSPITAL_REVIEW succeeds while prescription is pending`);

        // From HOSPITAL_REVIEW, attempt to advance to BLOOD_ARRANGED by hospital without verified prescription
        const advanceArrangedRes = await fetch(`${API_BASE}/bloodrequests/${unverifiedReqId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "BLOOD_ARRANGED", remarks: "Attempting to arrange without verification" })
        });
        const advanceArrangedData = await advanceArrangedRes.json();
        assert(advanceArrangedRes.status === 400, `Advancement to BLOOD_ARRANGED blocked for unverified requester request (HTTP 400, got ${advanceArrangedRes.status})`);
        assert(
            advanceArrangedData.message?.toLowerCase().includes("verified prescription"),
            `Error explicitly mentions prescription verification gate: ${advanceArrangedData.message}`
        );

        // Try to advance to FULFILLED by hospital directly -> blocked by clinical gate
        const advanceFulfilledRes = await fetch(`${API_BASE}/bloodrequests/${unverifiedReqId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "FULFILLED", remarks: "Attempting fulfillment without verification" })
        });
        assert(advanceFulfilledRes.status === 400, `Advancement to FULFILLED blocked for unverified requester request (HTTP 400, got ${advanceFulfilledRes.status})`);

        // Non-transfusion status update like CANCELLED is permitted
        const cancelRes = await fetch(`${API_BASE}/bloodrequests/${unverifiedReqId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "CANCELLED", remarks: "Patient requisition superseded" })
        });
        assert(cancelRes.status === 200, `Cancelling requisition allowed while verification is pending (got ${cancelRes.status})`);

        // =========================================================================
        // TEST 11: Hospital-created requests & Emergency workflows exempt
        // =========================================================================
        console.log("\n--- TEST 11: Hospital-Created Requisitions Exempt from Mandatory Upload ---");

        // Hospital creates a blood request directly without prescription
        const hospReqRes = await postMultipart("/bloodrequests", hosp1Token, {
            bloodgroup: "O_NEGATIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: "3",
            urgencylevel: "CRITICAL",
            requiredby: new Date(Date.now() + 86400000).toISOString(),
            patientname: "ICU Emergency Patient",
            patientage: "62",
            patientgender: "FEMALE",
            patientcontact: "9876543299",
            doctorname: "Dr. Arvind (Chief of Surgery)",
            notes: "Emergency department requisition"
        });
        assert(hospReqRes.status === 201, `Hospital-created request accepted without prescription with HTTP 201 (got ${hospReqRes.status})`);
        const hospReqId = hospReqRes.data?.data?.requestid || hospReqRes.data?.requestid;

        // Verify request was created cleanly with no requesterid
        const hospReqInDb = await prisma.bloodrequests.findUnique({
            where: { requestid: hospReqId }
        });
        assert(hospReqInDb !== null, `Hospital requisition created in DB`);
        assert(hospReqInDb?.requesterid === null, `requesterid is null for hospital-created request`);
        assert(hospReqInDb?.hospitalid === hosp1Record.hospitalid, `Assigned to hospital correctly`);

        // Hospital-created request advances from CREATED to HOSPITAL_REVIEW
        const hospReviewRes = await fetch(`${API_BASE}/bloodrequests/${hospReqId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "HOSPITAL_REVIEW", remarks: "Clinical review of inpatient order" })
        });
        assert(hospReviewRes.status === 200, `Hospital requisition advances to HOSPITAL_REVIEW (got ${hospReviewRes.status})`);

        // Hospital-created request CAN advance to BLOOD_ARRANGED without prescription
        const hospArrangeRes = await fetch(`${API_BASE}/bloodrequests/${hospReqId}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${hosp1Token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "BLOOD_ARRANGED", remarks: "Units secured from blood bank" })
        });
        assert(hospArrangeRes.status === 200, `Hospital-created request can advance to BLOOD_ARRANGED without prescription (got ${hospArrangeRes.status})`);

        // =========================================================================
        // TEST 12: GET /bloodrequests includes prescription metadata without disk paths
        // =========================================================================
        console.log("\n--- TEST 12: Secure Prescription Presentation & Data Masking ---");
        const getReqRes = await fetch(`${API_BASE}/bloodrequests/${createdRequestId}`, {
            headers: { Authorization: `Bearer ${req1Token}` }
        });
        assert(getReqRes.status === 200, `GET /bloodrequests/:id succeeds with HTTP 200`);
        const reqData = await getReqRes.json();
        const rxPayload = reqData.data?.prescription || reqData.prescription;
        assert(rxPayload !== null && rxPayload !== undefined, `Prescription object included in response`);
        assert(rxPayload.fileurl.startsWith("/bloodrequests/"), `Private filesystem path masked as secure relative route: ${rxPayload.fileurl}`);
        assert(!rxPayload.fileurl.includes("C:"), `No raw disk path exposed in API response`);
        assert(!rxPayload.fileurl.includes("uploads"), `No static upload directory exposed`);

        console.log("\n===============================================================================");
        console.log(`  ALL ${passedTests}/${totalTests} PHASE 2 INTEGRATION TESTS PASSED SUCCESSFULLY! `);
        console.log("===============================================================================\n");

    } catch (err: any) {
        console.error("Test execution failed:", err);
        throw err;
    } finally {
        // Cleanup test data
        console.log("Cleaning up test records...");
        try {
            // Delete notifications
            await prisma.notification.deleteMany({
                where: {
                    bloodrequests: {
                        OR: [
                            { requesters: { users: { email: { in: [requester1Email, requester2Email] } } } },
                            { hospitals: { users: { email: { in: [hospital1Email, hospital2Email] } } } }
                        ]
                    }
                }
            });

            // Delete history
            await prisma.prescriptionhistory.deleteMany({
                where: {
                    bloodrequests: {
                        requesters: {
                            users: {
                                email: { in: [requester1Email, requester2Email] }
                            }
                        }
                    }
                }
            });

            // Delete prescriptions
            await prisma.prescription.deleteMany({
                where: {
                    bloodrequests: {
                        requesters: {
                            users: {
                                email: { in: [requester1Email, requester2Email] }
                            }
                        }
                    }
                }
            });

            // Delete blood requests
            await prisma.bloodrequests.deleteMany({
                where: {
                    OR: [
                        { requesters: { users: { email: { in: [requester1Email, requester2Email] } } } },
                        { hospitals: { users: { email: { in: [hospital1Email, hospital2Email] } } } }
                    ]
                }
            });

            // Delete profiles & users
            await prisma.requesters.deleteMany({
                where: { users: { email: { in: [requester1Email, requester2Email] } } }
            });
            await prisma.hospitals.deleteMany({
                where: { users: { email: { in: [hospital1Email, hospital2Email] } } }
            });
            await prisma.users.deleteMany({
                where: { email: { in: [requester1Email, requester2Email, hospital1Email, hospital2Email, adminEmail] } }
            });
        } catch (cleanupErr) {
            console.warn("Cleanup warning:", cleanupErr);
        }

        if (server) {
            server.close();
        }
    }
}

runPhase2PrescriptionTests().catch((e) => {
    console.error(e);
    process.exit(1);
});
