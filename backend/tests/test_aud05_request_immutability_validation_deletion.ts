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

function buildValidPdfBlob(): Blob {
    const pdfBytes = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
        "utf-8"
    );
    return new Blob([pdfBytes], { type: "application/pdf" });
}

async function runTests() {
    console.log("==================================================================");
    console.log(" AUD-05: PATIENT IDENTITY IMMUTABILITY, VALIDATION & SAFE DELETION");
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

    const tag = `aud05_${Date.now()}`;
    const createdRequestIds: string[] = [];
    const createdUserIds: string[] = [];
    const createdHospitalIds: string[] = [];
    const createdRequesterIds: string[] = [];
    const createdDonorIds: string[] = [];
    const createdBloodBankIds: string[] = [];
    const createdFilesOnDisk: string[] = [];

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

    const postMultipartRequest = async (
        fields: Record<string, string>,
        token: string,
        attachPdf = true
    ) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) {
            form.append(k, v);
        }
        if (attachPdf) {
            form.append("prescription", buildValidPdfBlob(), "prescription.pdf");
        }
        const res = await fetch(`${baseUrl}/bloodrequests`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
        });
        const data = await res.json().catch(() => null);
        if (data?.requestid) {
            createdRequestIds.push(data.requestid);
            if (data?.prescription?.fileurl) {
                createdFilesOnDisk.push(
                    path.resolve(getPrescriptionStorageDir(), path.basename(data.prescription.fileurl))
                );
            }
        }
        return { status: res.status, data };
    };

    try {
        // --- Seed test fixtures ---
        const [reqOwnerUser, reqOtherUser, hospUser, donorUser, bbUser] = await Promise.all([
            prisma.users.create({
                data: {
                    name: `AUD05 Owner ${tag}`,
                    email: `owner.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9810000001",
                    role: "REQUESTER",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD05 Other ${tag}`,
                    email: `other.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9810000002",
                    role: "REQUESTER",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD05 Hospital ${tag}`,
                    email: `hosp.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9810000003",
                    role: "HOSPITAL",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD05 Donor ${tag}`,
                    email: `donor.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9810000004",
                    role: "DONOR",
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD05 BloodBank ${tag}`,
                    email: `bb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9810000005",
                    role: "BLOOD_BANK",
                    isactive: true,
                    emailverified: true,
                },
            }),
        ]);
        createdUserIds.push(
            reqOwnerUser.userid,
            reqOtherUser.userid,
            hospUser.userid,
            donorUser.userid,
            bbUser.userid
        );

        const [reqOwnerProfile, reqOtherProfile, hospProfile, donorProfile, bbProfile] = await Promise.all([
            prisma.requesters.create({
                data: {
                    userid: reqOwnerUser.userid,
                    address: "100 Main St",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    latitude: 17.385,
                    longitude: 78.4867,
                },
            }),
            prisma.requesters.create({
                data: {
                    userid: reqOtherUser.userid,
                    address: "200 Main St",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    latitude: 17.386,
                    longitude: 78.487,
                },
            }),
            prisma.hospitals.create({
                data: {
                    userid: hospUser.userid,
                    hospitalname: `AUD05 Hospital ${tag}`,
                    registrationnumber: `REG-${tag}`,
                    contactpersonname: "Dr. Verify",
                    contactpersonphone: "9810000003",
                    address: "300 Medical Rd",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    latitude: 17.385,
                    longitude: 78.4867,
                    approvalstatus: "APPROVED",
                },
            }),
            prisma.donors.create({
                data: {
                    userid: donorUser.userid,
                    bloodgroup: "O_POSITIVE",
                    dateofbirth: new Date("1995-05-15"),
                    gender: "MALE",
                    weight: 72,
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    latitude: 17.386,
                    longitude: 78.487,
                    availabilitystatus: "AVAILABLE",
                    iseligible: true,
                },
            }),
            prisma.bloodbanks.create({
                data: {
                    userid: bbUser.userid,
                    bloodbankname: `AUD05 Blood Bank ${tag}`,
                    licensenumber: `LIC-${tag}`,
                    contactpersonname: "BB Staff",
                    contactpersonphone: "9810000005",
                    address: "400 Bank Rd",
                    city: "Hyderabad",
                    state: "Telangana",
                    pincode: "500001",
                    latitude: 17.385,
                    longitude: 78.4867,
                    approvalstatus: "APPROVED",
                },
            }),
        ]);
        createdRequesterIds.push(reqOwnerProfile.requesterid, reqOtherProfile.requesterid);
        createdHospitalIds.push(hospProfile.hospitalid);
        createdDonorIds.push(donorProfile.donorid);
        createdBloodBankIds.push(bbProfile.bloodbankid);

        const ownerToken = generateToken(reqOwnerUser.userid, "REQUESTER");
        const otherToken = generateToken(reqOtherUser.userid, "REQUESTER");
        const hospToken = generateToken(hospUser.userid, "HOSPITAL");

        const futureIso = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

        // =========================================================================
        // OBJECTIVE 1: PATIENT IDENTITY & CLINICAL IMMUTABILITY
        // =========================================================================
        console.log("--- Objective 1: Patient Identity & Clinical Immutability ---");

        const baseFields = {
            patientname: "Original Patient A",
            patientage: "34",
            patientgender: "MALE",
            patientcontact: "9876543210",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: "2",
            urgencylevel: "HIGH",
            requiredby: futureIso(),
            hospitalid: hospProfile.hospitalid,
            doctorname: "Dr. Sharma",
            hospitalname: hospProfile.hospitalname,
        };

        const createRes1 = await postMultipartRequest(baseFields, ownerToken);
        assert(createRes1.status === 201, "1.1 Create initial CREATED request with PENDING prescription", `status=${createRes1.status}`);
        const reqId1 = createRes1.data.requestid;

        // 1.2 Pre-verification correction of patient identity & clinical fields succeeds
        const preEditRes = await reqJson(
            "PUT",
            `/bloodrequests/${reqId1}`,
            {
                patientname: "Corrected Patient A",
                patientage: 36,
                patientgender: "FEMALE",
                patientcontact: "9876543219",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "RBC",
                unitsrequired: 3,
            },
            ownerToken
        );
        assert(
            preEditRes.status === 200 &&
                preEditRes.data?.patientname === "Corrected Patient A" &&
                preEditRes.data?.patientage === 36 &&
                preEditRes.data?.patientgender === "FEMALE" &&
                preEditRes.data?.patientcontact === "9876543219" &&
                preEditRes.data?.bloodgroup === "A_POSITIVE" &&
                preEditRes.data?.bloodcomponent === "RBC" &&
                preEditRes.data?.unitsrequired === 3,
            "1.2 Pre-verification correction of patient identity and clinical fields succeeds (200)",
            `status=${preEditRes.status}`
        );

        // 1.3 Strict validation on editable patient identity fields during pre-verification
        const badNameEmpty = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientname: "   " }, ownerToken);
        const badNameLong = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientname: "X".repeat(101) }, ownerToken);
        const badAgeZero = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientage: 0 }, ownerToken);
        const badAgeNeg = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientage: -5 }, ownerToken);
        const badAgeHigh = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientage: 126 }, ownerToken);
        const badAgeDec = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientage: 35.5 }, ownerToken);
        const badAgeStr = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientage: "35yrs" }, ownerToken);
        const badAgeNull = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientage: null }, ownerToken);
        const badGender = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientgender: "INVALID" }, ownerToken);
        const badContactEmpty = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientcontact: "" }, ownerToken);
        const badContactShort = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientcontact: "12345" }, ownerToken);
        const badContactAlpha = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientcontact: "98765abcde" }, ownerToken);
        assert(
            badNameEmpty.status === 400 &&
                badNameLong.status === 400 &&
                badAgeZero.status === 400 &&
                badAgeNeg.status === 400 &&
                badAgeHigh.status === 400 &&
                badAgeDec.status === 400 &&
                badAgeStr.status === 400 &&
                badAgeNull.status === 400 &&
                badGender.status === 400 &&
                badContactEmpty.status === 400 &&
                badContactShort.status === 400 &&
                badContactAlpha.status === 400,
            "1.3 Strict validation rejects invalid patientname, patientage, patientgender, and patientcontact on PUT (400)"
        );

        // 1.4 Verify prescription via assigned hospital
        const verifyRes = await reqJson(
            "POST",
            `/bloodrequests/${reqId1}/prescription/verify`,
            { status: "VERIFIED", remarks: "Verified identity and clinical dosage" },
            hospToken
        );
        assert(verifyRes.status === 200, "1.4 Hospital approves prescription (VERIFIED)", `status=${verifyRes.status}`);

        // 1.5 Post-verification immutability on each patient identity field and clinical field
        const postSwapName = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientname: "Swapped Patient B" }, ownerToken);
        const postSwapAge = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientage: 50 }, ownerToken);
        const postSwapGender = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientgender: "MALE" }, ownerToken);
        const postSwapContact = await reqJson("PUT", `/bloodrequests/${reqId1}`, { patientcontact: "9111111111" }, ownerToken);
        const postSwapBg = await reqJson("PUT", `/bloodrequests/${reqId1}`, { bloodgroup: "B_POSITIVE" }, ownerToken);
        const postSwapComp = await reqJson("PUT", `/bloodrequests/${reqId1}`, { bloodcomponent: "PLASMA" }, ownerToken);
        const postSwapUnits = await reqJson("PUT", `/bloodrequests/${reqId1}`, { unitsrequired: 5 }, ownerToken);

        const dbAfterSwapAttempts = await prisma.bloodrequests.findUnique({ where: { requestid: reqId1 } });
        assert(
            postSwapName.status === 400 &&
                postSwapAge.status === 400 &&
                postSwapGender.status === 400 &&
                postSwapContact.status === 400 &&
                postSwapBg.status === 400 &&
                postSwapComp.status === 400 &&
                postSwapUnits.status === 400 &&
                dbAfterSwapAttempts?.patientname === "Corrected Patient A" &&
                dbAfterSwapAttempts?.patientage === 36 &&
                dbAfterSwapAttempts?.patientgender === "FEMALE" &&
                dbAfterSwapAttempts?.patientcontact === "9876543219" &&
                dbAfterSwapAttempts?.bloodgroup === "A_POSITIVE" &&
                dbAfterSwapAttempts?.bloodcomponent === "RBC" &&
                dbAfterSwapAttempts?.unitsrequired === 3,
            "1.5 Post-verification changes to patientname, patientage, patientgender, patientcontact, bloodgroup, bloodcomponent, unitsrequired are all rejected (400) with zero DB mutation"
        );

        // 1.6 No-op update with identical patient/clinical values + updated notes & searchradius succeeds
        const noOpRes = await reqJson(
            "PUT",
            `/bloodrequests/${reqId1}`,
            {
                patientname: "Corrected Patient A",
                patientage: 36,
                patientgender: "FEMALE",
                patientcontact: "9876543219",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "RBC",
                unitsrequired: 3,
                notes: "Updated clinical note without mutating identity",
                searchradius: 25,
            },
            ownerToken
        );
        assert(
            noOpRes.status === 200 &&
                noOpRes.data?.notes === "Updated clinical note without mutating identity" &&
                noOpRes.data?.searchradius === 25,
            "1.6 Idempotent no-op payload with identical patient/clinical values and updated notes/searchradius succeeds (200)",
            `status=${noOpRes.status}`
        );

        // 1.7 Immutability when donor commitment exists even while status is CREATED and prescription is PENDING
        const createResCommit = await postMultipartRequest(baseFields, ownerToken);
        const reqIdCommit = createResCommit.data.requestid;
        const bcast = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqIdCommit,
                triggeredbyuserid: reqOwnerUser.userid,
                triggertype: "INITIAL_EMERGENCY",
                radiuskm: 10,
                status: "DONOR_RESPONDED",
            },
        });
        await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bcast.broadcastid,
                requestid: reqIdCommit,
                donorid: donorProfile.donorid,
                donoruserid: donorUser.userid,
                matchtype: "EXACT",
                deliverystatus: "DELIVERED",
                response: "ACCEPTED",
                respondedat: new Date(),
            },
        });
        const swapAfterDonorCommit = await reqJson(
            "PUT",
            `/bloodrequests/${reqIdCommit}`,
            { patientname: "Swap After Donor Committed" },
            ownerToken
        );
        assert(
            swapAfterDonorCommit.status === 400,
            "1.7 Patient identity change rejected (400) when donor commitment exists even in CREATED/PENDING state"
        );

        // 1.8 Immutability when blood bank requisition assignment exists even in CREATED/PENDING state
        const createResAssign = await postMultipartRequest(baseFields, ownerToken);
        const reqIdAssign = createResAssign.data.requestid;
        await prisma.requisitionassignments.create({
            data: {
                requestid: reqIdAssign,
                bloodbankid: bbProfile.bloodbankid,
                assignedbyuserid: hospUser.userid,
                assignmentstatus: "PENDING_ACCEPTANCE",
            },
        });
        const swapAfterBBAssign = await reqJson(
            "PUT",
            `/bloodrequests/${reqIdAssign}`,
            { patientname: "Swap After Blood Bank Assigned" },
            ownerToken
        );
        assert(
            swapAfterBBAssign.status === 400,
            "1.8 Patient identity change rejected (400) when blood bank requisition assignment exists"
        );

        // 1.9 Concurrency test: concurrent prescription verification and patient identity update
        const createResRace = await postMultipartRequest(baseFields, ownerToken);
        const reqIdRace = createResRace.data.requestid;
        const [raceVerify, raceUpdate] = await Promise.all([
            reqJson(
                "POST",
                `/bloodrequests/${reqIdRace}/prescription/verify`,
                { status: "VERIFIED", remarks: "Concurrent verification" },
                hospToken
            ),
            reqJson(
                "PUT",
                `/bloodrequests/${reqIdRace}`,
                { patientname: "Concurrent Identity Update" },
                ownerToken
            ),
        ]);
        const racePostSwap = await reqJson(
            "PUT",
            `/bloodrequests/${reqIdRace}`,
            { patientname: "Post-Race Tamper Attempt" },
            ownerToken
        );
        assert(
            raceVerify.status === 200 &&
                (raceUpdate.status === 200 || raceUpdate.status === 400) &&
                racePostSwap.status === 400,
            "1.9 Concurrent prescription verification and PUT identity update serialize cleanly via FOR UPDATE without 500/deadlock, and subsequent update is rejected (400)",
            `verify=${raceVerify.status} update=${raceUpdate.status} postSwap=${racePostSwap.status}`
        );

        // =========================================================================
        // OBJECTIVE 2: STRICT INPUT VALIDATION (unitsrequired: 1-50, searchradius: 1-100)
        // =========================================================================
        console.log("\n--- Objective 2: Strict Input Validation (unitsrequired & searchradius) ---");

        // 2.1 Requester POST /bloodrequests defaults & valid boundaries
        const reqDefaultRadius = await postMultipartRequest(
            { ...baseFields, unitsrequired: "1" },
            ownerToken
        );
        const reqMaxBounds = await postMultipartRequest(
            { ...baseFields, unitsrequired: "50", searchradius: "100" },
            ownerToken
        );
        const reqMinRadius = await postMultipartRequest(
            { ...baseFields, unitsrequired: "25", searchradius: "1" },
            ownerToken
        );
        assert(
            reqDefaultRadius.status === 201 &&
                reqDefaultRadius.data?.searchradius === 5 &&
                reqDefaultRadius.data?.unitsrequired === 1 &&
                reqMaxBounds.status === 201 &&
                reqMaxBounds.data?.unitsrequired === 50 &&
                reqMaxBounds.data?.searchradius === 100 &&
                reqMinRadius.status === 201 &&
                reqMinRadius.data?.searchradius === 1,
            "2.1 Requester POST /bloodrequests preserves default searchradius=5 and accepts boundary integers unitsrequired (1, 50) & searchradius (1, 100)"
        );

        // 2.2 Requester POST /bloodrequests invalid unitsrequired and searchradius
        const invalidRequesterUnits = ["0", "-1", "51", "100", "2.5", "5abc", "abc", ""];
        for (const badUnit of invalidRequesterUnits) {
            const r = await postMultipartRequest({ ...baseFields, unitsrequired: badUnit }, ownerToken);
            assert(r.status === 400, `2.2a Requester POST rejects unitsrequired="${badUnit}" (400)`, `got=${r.status}`);
        }
        const invalidRequesterRadii = ["0", "-5", "101", "500", "10.5", "15km", "abc", ""];
        for (const badRadius of invalidRequesterRadii) {
            const r = await postMultipartRequest({ ...baseFields, searchradius: badRadius }, ownerToken);
            assert(r.status === 400, `2.2b Requester POST rejects searchradius="${badRadius}" (400)`, `got=${r.status}`);
        }

        // 2.3 Hospital POST /hospitals/me/bloodrequests defaults, valid boundaries, and invalid values
        const hospBasePayload = {
            patientname: "Hosp Patient",
            patientage: 42,
            patientgender: "MALE",
            patientcontact: "9876543210",
            bloodgroup: "O_POSITIVE",
            bloodcomponent: "WHOLE_BLOOD",
            unitsrequired: 1,
            urgencylevel: "HIGH",
            requiredby: futureIso(),
        };
        const hospDefaultRes = await reqJson("POST", "/hospitals/me/bloodrequests", hospBasePayload, hospToken);
        if (hospDefaultRes.data?.requestid) createdRequestIds.push(hospDefaultRes.data.requestid);
        const hospMaxRes = await reqJson(
            "POST",
            "/hospitals/me/bloodrequests",
            { ...hospBasePayload, unitsrequired: 50, searchradius: 100 },
            hospToken
        );
        if (hospMaxRes.data?.requestid) createdRequestIds.push(hospMaxRes.data.requestid);
        assert(
            hospDefaultRes.status === 201 &&
                hospDefaultRes.data?.searchradius === 15 &&
                hospMaxRes.status === 201 &&
                hospMaxRes.data?.unitsrequired === 50 &&
                hospMaxRes.data?.searchradius === 100,
            "2.3 Hospital POST /hospitals/me/bloodrequests preserves default searchradius=15 and accepts boundary integers (50, 100)"
        );

        const invalidHospUnits: any[] = [0, -1, 51, 100, 2.5, "2.5", "10abc", null, ""];
        for (const badUnit of invalidHospUnits) {
            const r = await reqJson(
                "POST",
                "/hospitals/me/bloodrequests",
                { ...hospBasePayload, unitsrequired: badUnit },
                hospToken
            );
            assert(
                r.status === 400,
                `2.4a Hospital POST rejects invalid unitsrequired=${JSON.stringify(badUnit)} (400)`,
                `got=${r.status}`
            );
        }

        const invalidHospRadii: any[] = [0, "0", -5, 101, 500, 15.5, "15.5", "15km", "abc", null, ""];
        for (const badRadius of invalidHospRadii) {
            const r = await reqJson(
                "POST",
                "/hospitals/me/bloodrequests",
                { ...hospBasePayload, searchradius: badRadius },
                hospToken
            );
            assert(
                r.status === 400,
                `2.4b Hospital POST rejects invalid searchradius=${JSON.stringify(badRadius)} (400)`,
                `got=${r.status}`
            );
        }

        // 2.5 PUT /bloodrequests/:id strict validation on unitsrequired and searchradius
        const targetEditableId = reqDefaultRadius.data.requestid;
        for (const badUnit of [0, -1, 51, 100, 2.5, "2.5", "5abc", null, ""]) {
            const r = await reqJson("PUT", `/bloodrequests/${targetEditableId}`, { unitsrequired: badUnit }, ownerToken);
            assert(
                r.status === 400,
                `2.5a PUT /bloodrequests/:id rejects invalid unitsrequired=${JSON.stringify(badUnit)} (400)`,
                `got=${r.status}`
            );
        }
        for (const badRadius of [0, "0", -10, 101, 500, 12.5, "12.5", "10km", "abc", null, ""]) {
            const r = await reqJson("PUT", `/bloodrequests/${targetEditableId}`, { searchradius: badRadius }, ownerToken);
            assert(
                r.status === 400,
                `2.5b PUT /bloodrequests/:id rejects invalid searchradius=${JSON.stringify(badRadius)} (400)`,
                `got=${r.status}`
            );
        }
        const putValidBounds = await reqJson(
            "PUT",
            `/bloodrequests/${targetEditableId}`,
            { unitsrequired: 50, searchradius: 100 },
            ownerToken
        );
        assert(
            putValidBounds.status === 200 &&
                putValidBounds.data?.unitsrequired === 50 &&
                putValidBounds.data?.searchradius === 100,
            "2.5c PUT /bloodrequests/:id accepts valid boundary integers unitsrequired=50 and searchradius=100 (200)"
        );

        // =========================================================================
        // OBJECTIVE 3: SAFE REQUEST DELETION (DELETE /bloodrequests/:id)
        // =========================================================================
        console.log("\n--- Objective 3: Safe Request Deletion (DELETE /bloodrequests/:id) ---");

        // 3.1 Cross-user ownership enforcement on CREATED request
        const delTargetRes = await postMultipartRequest(baseFields, ownerToken);
        const delTargetId = delTargetRes.data.requestid;
        const delFileUrl = delTargetRes.data?.prescription?.fileurl;
        const delFilePath = path.resolve(getPrescriptionStorageDir(), path.basename(delFileUrl));

        const otherDeleteAttempt = await reqJson("DELETE", `/bloodrequests/${delTargetId}`, undefined, otherToken);
        const hospDeleteAttempt = await reqJson("DELETE", `/bloodrequests/${delTargetId}`, undefined, hospToken);
        assert(
            otherDeleteAttempt.status === 403 && hospDeleteAttempt.status === 403,
            "3.1 Non-owner requester and hospital are blocked from deleting CREATED request (403)"
        );

        // 3.2 Eligible CREATED request deletion succeeds, cleans dependent rows, and removes prescription file from disk
        const fileExistedBeforeDelete = fs.existsSync(delFilePath);
        const ownerDeleteRes = await reqJson("DELETE", `/bloodrequests/${delTargetId}`, undefined, ownerToken);
        const [reqAfterDel, rxAfterDel, notifAfterDel] = await Promise.all([
            prisma.bloodrequests.findUnique({ where: { requestid: delTargetId } }),
            prisma.prescription.findUnique({ where: { requestid: delTargetId } }),
            prisma.notification.count({ where: { requestid: delTargetId } }),
        ]);
        const fileExistsAfterDelete = fs.existsSync(delFilePath);
        assert(
            fileExistedBeforeDelete &&
                ownerDeleteRes.status === 200 &&
                reqAfterDel === null &&
                rxAfterDel === null &&
                notifAfterDel === 0 &&
                !fileExistsAfterDelete,
            "3.2 Owner successfully deletes eligible CREATED request (200), cleaning prescription & notifications and removing prescription PDF from disk",
            `status=${ownerDeleteRes.status} fileBefore=${fileExistedBeforeDelete} fileAfter=${fileExistsAfterDelete}`
        );

        // 3.3 Blocked deletion when prescription is VERIFIED (even if status is CREATED)
        const rxVerifiedReqRes = await postMultipartRequest(baseFields, ownerToken);
        const rxVerifiedReqId = rxVerifiedReqRes.data.requestid;
        const rxVerifiedFilePath = path.resolve(
            getPrescriptionStorageDir(),
            path.basename(rxVerifiedReqRes.data.prescription.fileurl)
        );
        await prisma.prescription.update({
            where: { requestid: rxVerifiedReqId },
            data: { status: "VERIFIED", verifiedbyhospitalid: hospProfile.hospitalid, verificationdate: new Date() },
        });
        const delVerifiedRxRes = await reqJson("DELETE", `/bloodrequests/${rxVerifiedReqId}`, undefined, ownerToken);
        assert(
            delVerifiedRxRes.status === 400 && fs.existsSync(rxVerifiedFilePath),
            "3.3 DELETE /bloodrequests/:id rejects CREATED request whose prescription is VERIFIED (400) and preserves file on disk"
        );

        // 3.4 Blocked deletion when donor commitment or blood bank assignment exists on CREATED request
        const delDonorCommitRes = await reqJson("DELETE", `/bloodrequests/${reqIdCommit}`, undefined, ownerToken);
        const delBBAssignRes = await reqJson("DELETE", `/bloodrequests/${reqIdAssign}`, undefined, ownerToken);
        assert(
            delDonorCommitRes.status === 400 && delBBAssignRes.status === 400,
            "3.4 DELETE /bloodrequests/:id rejects CREATED requests that have donor commitments or blood bank assignments (400)"
        );

        // 3.5 Blocked deletion across all non-CREATED statuses (preserving request and audit history)
        const nonCreatedStatuses = [
            "HOSPITAL_REVIEW",
            "VERIFIED",
            "BLOOD_BANK_CHECK",
            "DONOR_MATCHING",
            "BLOOD_ARRANGED",
            "FULFILLED",
            "CANCELLED",
            "EXPIRED",
        ] as const;

        const statusTestReqRes = await postMultipartRequest(baseFields, ownerToken);
        const statusTestReqId = statusTestReqRes.data.requestid;

        for (const st of nonCreatedStatuses) {
            await prisma.bloodrequests.update({
                where: { requestid: statusTestReqId },
                data: { status: st },
            });
            const delRes = await reqJson("DELETE", `/bloodrequests/${statusTestReqId}`, undefined, ownerToken);
            const stillExists = await prisma.bloodrequests.findUnique({ where: { requestid: statusTestReqId } });
            const historyCount = await prisma.requeststatushistory.count({ where: { requestid: statusTestReqId } });
            assert(
                delRes.status === 400 && stillExists !== null && historyCount > 0,
                `3.5 DELETE /bloodrequests/:id rejects status=${st} (400) and preserves request + requeststatushistory`,
                `got=${delRes.status}`
            );
        }
    } finally {
        // Cleanup all test artifacts
        if (createdRequestIds.length > 0) {
            await prisma.clinicalcrossmatches.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.bloodreservations.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.requisitionassignments.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.hospitalcoordination.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.donationhistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.prescriptionhistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.prescription.deleteMany({ where: { requestid: { in: createdRequestIds } } });
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
        for (const f of createdFilesOnDisk) {
            await fs.promises.unlink(f).catch(() => { });
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await prisma.$disconnect();
    }

    console.log("\n==================================================================");
    console.log(` AUD-05 RESULTS: ${passed} passed, ${failed} failed`);
    console.log("==================================================================");
    if (failed > 0) {
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Fatal error in test_aud05:", err);
    process.exit(1);
});
