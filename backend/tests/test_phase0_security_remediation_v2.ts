import http from "http";
import crypto from "crypto";
import bcrypt from "bcrypt";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import {
    user_role,
    blood_group,
    blood_component,
    urgency_level,
    request_status,
    approval_status,
    prescription_status,
} from "../src/generated/prisma/enums";

let server: http.Server;
let API_BASE = "";
let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
    if (condition) {
        console.log(`[PASS] ${label}`);
        passed++;
    } else {
        console.error(`[FAIL] ${label}${detail ? ` -> ${detail}` : ""}`);
        failed++;
    }
}

async function reqJson(method: string, path: string, body?: any, token?: string) {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }
    return { status: res.status, headers: res.headers, data: json };
}

async function runTests() {
    process.env.DISABLE_RATE_LIMIT = "true";
    const ts = Date.now();
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];

    try {
        await new Promise<void>((resolve) => {
            server = http.createServer(app);
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address() as any;
                API_BASE = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        console.log(`\n=== SWASTYA PHASE 0 SECURITY REMEDIATION TESTS (${API_BASE}) ===\n`);

        const pwHash = await bcrypt.hash("StrongPass!123", 10);

        // Provision isolated test users
        const admin = await prisma.users.create({
            data: { name: "P0 Admin", email: `p0_admin_${ts}@swastya.test`, password: pwHash, role: user_role.ADMIN, phonenumber: "9000000001", isactive: true },
        });
        createdUserIds.push(admin.userid);

        const donorUserA = await prisma.users.create({
            data: { name: "P0 Donor A", email: `p0_donora_${ts}@swastya.test`, password: pwHash, role: user_role.DONOR, phonenumber: "9000000002", isactive: true },
        });
        createdUserIds.push(donorUserA.userid);
        const donorA = await prisma.donors.create({
            data: {
                userid: donorUserA.userid,
                bloodgroup: blood_group.O_POSITIVE,
                dateofbirth: new Date("1995-01-01"),
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                iseligible: false,
            },
        });

        const donorUserB = await prisma.users.create({
            data: { name: "P0 Donor B", email: `p0_donorb_${ts}@swastya.test`, password: pwHash, role: user_role.DONOR, phonenumber: "9000000003", isactive: true },
        });
        createdUserIds.push(donorUserB.userid);

        const inactiveUser = await prisma.users.create({
            data: { name: "P0 Inactive", email: `p0_inactive_${ts}@swastya.test`, password: pwHash, role: user_role.DONOR, phonenumber: "9000000004", isactive: false },
        });
        createdUserIds.push(inactiveUser.userid);

        const reqUserA = await prisma.users.create({
            data: { name: "P0 Req A", email: `p0_reqa_${ts}@swastya.test`, password: pwHash, role: user_role.REQUESTER, phonenumber: "9000000005", isactive: true },
        });
        createdUserIds.push(reqUserA.userid);
        const reqA = await prisma.requesters.create({
            data: { userid: reqUserA.userid, address: "Addr A", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
        });

        const reqUserB = await prisma.users.create({
            data: { name: "P0 Req B", email: `p0_reqb_${ts}@swastya.test`, password: pwHash, role: user_role.REQUESTER, phonenumber: "9000000006", isactive: true },
        });
        createdUserIds.push(reqUserB.userid);

        const hospUserA = await prisma.users.create({
            data: { name: "P0 Hosp A", email: `p0_hospa_${ts}@swastya.test`, password: pwHash, role: user_role.HOSPITAL, phonenumber: "9000000007", isactive: true },
        });
        createdUserIds.push(hospUserA.userid);
        const hospA = await prisma.hospitals.create({
            data: {
                userid: hospUserA.userid,
                hospitalname: "Hosp A",
                registrationnumber: `P0-REG-A-${ts}`,
                contactpersonname: "Dr A",
                contactpersonphone: "9000000007",
                address: "Addr HA",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.APPROVED,
            },
        });

        const hospUserB = await prisma.users.create({
            data: { name: "P0 Hosp B", email: `p0_hospb_${ts}@swastya.test`, password: pwHash, role: user_role.HOSPITAL, phonenumber: "9000000008", isactive: true },
        });
        createdUserIds.push(hospUserB.userid);
        await prisma.hospitals.create({
            data: {
                userid: hospUserB.userid,
                hospitalname: "Hosp B",
                registrationnumber: `P0-REG-B-${ts}`,
                contactpersonname: "Dr B",
                contactpersonphone: "9000000008",
                address: "Addr HB",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.APPROVED,
            },
        });

        const bbUserA = await prisma.users.create({
            data: { name: "P0 BB A", email: `p0_bba_${ts}@swastya.test`, password: pwHash, role: user_role.BLOOD_BANK, phonenumber: "9000000009", isactive: true },
        });
        createdUserIds.push(bbUserA.userid);
        const bbA = await prisma.bloodbanks.create({
            data: {
                userid: bbUserA.userid,
                bloodbankname: "BB A",
                licensenumber: `P0-BB-A-${ts}`,
                contactpersonname: "BB Lead A",
                contactpersonphone: "9000000009",
                address: "BB Addr A",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.APPROVED,
            },
        });

        const bbUserB = await prisma.users.create({
            data: { name: "P0 BB B", email: `p0_bbb_${ts}@swastya.test`, password: pwHash, role: user_role.BLOOD_BANK, phonenumber: "9000000010", isactive: true },
        });
        createdUserIds.push(bbUserB.userid);
        const bbB = await prisma.bloodbanks.create({
            data: {
                userid: bbUserB.userid,
                bloodbankname: "BB B",
                licensenumber: `P0-BB-B-${ts}`,
                contactpersonname: "BB Lead B",
                contactpersonphone: "9000000010",
                address: "BB Addr B",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.APPROVED,
            },
        });

        const lotB = await prisma.inventory.create({
            data: {
                bloodbankid: bbB.bloodbankid,
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsavailable: 0,
                unitsquarantined: 1,
                unitsreserved: 0,
                islegacyreconciled: true,
                expirydate: new Date(Date.now() + 30 * 86400 * 1000),
            },
        });

        const unitB = await prisma.inventoryunits.create({
            data: {
                inventoryid: lotB.inventoryid,
                bloodbankid: bbB.bloodbankid,
                unitbarcode: `P0-UNIT-B-${ts}`,
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                status: "QUARANTINED",
                ttiscreeningstatus: "PENDING",
                expirydate: new Date(Date.now() + 30 * 86400 * 1000),
            },
        });

        const bloodReqA = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUserA.userid,
                requesterid: reqA.requesterid,
                hospitalid: hospA.hospitalid,
                patientname: "Patient A",
                patientage: 35,
                patientgender: "MALE",
                patientcontact: "9999999999",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: urgency_level.HIGH,
                requiredby: new Date(Date.now() + 86400 * 1000),
                status: request_status.CREATED,
            },
        });
        createdRequestIds.push(bloodReqA.requestid);

        await prisma.prescription.create({
            data: {
                requestid: bloodReqA.requestid,
                fileurl: "/uploads/prescriptions/rx-test.pdf",
                doctorname: "Dr. Test",
                hospitalname: "Hosp A",
                status: prescription_status.PENDING,
            },
        });

        const donorAToken = generateToken(donorUserA.userid, donorUserA.role);
        const donorBToken = generateToken(donorUserB.userid, donorUserB.role);
        const inactiveToken = generateToken(inactiveUser.userid, inactiveUser.role);
        const reqBToken = generateToken(reqUserB.userid, reqUserB.role);
        const hospAToken = generateToken(hospUserA.userid, hospUserA.role);
        const hospBToken = generateToken(hospUserB.userid, hospUserB.role);
        const bbAToken = generateToken(bbUserA.userid, bbUserA.role);
        const bbBToken = generateToken(bbUserB.userid, bbUserB.role);

        // 1. Admin self-registration rejection
        const adminReg = await reqJson("POST", "/auth/register", {
            name: "Evil Admin",
            email: `p0_evil_${ts}@swastya.test`,
            password: "Password123!",
            role: "ADMIN",
        });
        assert(adminReg.status === 403, "1. POST /auth/register rejects ADMIN self-registration with 403", `got ${adminReg.status}`);

        // 2. Role escalation rejection & BLOOD_BANK profile creation
        const roleEsc = await reqJson("PUT", `/users/${donorUserA.userid}`, { role: "ADMIN" }, donorAToken);
        assert(roleEsc.status === 403, "2a. PUT /users/:id rejects self role escalation with 403", `got ${roleEsc.status}`);

        const bbReg = await reqJson("POST", "/auth/register", {
            name: "New BB Lead",
            email: `p0_newbb_${ts}@swastya.test`,
            password: "Password123!",
            phoneNumber: "9000000099",
            role: "BLOOD_BANK",
            bloodbankname: "New Safe Blood Bank",
            licensenumber: `P0-NEW-BB-${ts}`,
            address: "100 Main St",
            city: "Bengaluru",
            state: "Karnataka",
            pincode: "560001",
        });
        if (bbReg.data?.user?.userid) createdUserIds.push(bbReg.data.user.userid);
        assert(
            bbReg.status === 201 && Boolean(bbReg.data?.bloodbank?.bloodbankid),
            "2b. POST /auth/register BLOOD_BANK creates linked bloodbanks record",
            `status=${bbReg.status}`
        );

        // 3. Unauthenticated PII access rejection
        const unauthDonors = await reqJson("GET", "/donors");
        assert(unauthDonors.status === 401, "3a. GET /donors rejects unauthenticated access with 401", `got ${unauthDonors.status}`);

        const unauthDonorById = await reqJson("GET", `/donors/${donorA.donorid}`);
        assert(unauthDonorById.status === 401, "3b. GET /donors/:donorId rejects unauthenticated access with 401", `got ${unauthDonorById.status}`);

        const unauthRequesters = await reqJson("GET", "/requesters");
        assert(unauthRequesters.status === 401, "3c. GET /requesters rejects unauthenticated access with 401", `got ${unauthRequesters.status}`);

        const pubBbs = await reqJson("GET", "/bloodbanks");
        const bbSample = Array.isArray(pubBbs.data) ? pubBbs.data.find((b: any) => b.bloodbankid === bbA.bloodbankid) : null;
        assert(
            pubBbs.status === 200 &&
                bbSample &&
                bbSample.users === undefined &&
                bbSample.licensenumber === undefined &&
                bbSample.contactpersonphone === undefined,
            "3d. GET /bloodbanks returns only safe public directory fields (no PII)"
        );

        const pubBbById = await reqJson("GET", `/bloodbanks/${bbA.bloodbankid}`);
        assert(
            pubBbById.status === 200 &&
                pubBbById.data?.users === undefined &&
                pubBbById.data?.licensenumber === undefined &&
                pubBbById.data?.contactpersonphone === undefined,
            "3e. GET /bloodbanks/:id hides PII from unauthenticated callers"
        );

        // 4. Unauthorized cross-user profile access & malformed UUID
        const crossDonor = await reqJson("GET", `/donors/${donorA.donorid}`, undefined, donorBToken);
        assert(crossDonor.status === 403, "4a. GET /donors/:donorId rejects cross-donor access with 403", `got ${crossDonor.status}`);

        const badUuidDonor = await reqJson("GET", "/donors/not-a-uuid", undefined, donorAToken);
        assert(badUuidDonor.status === 404, "4b. GET /donors/not-a-uuid returns 404 instead of 500", `got ${badUuidDonor.status}`);

        // 5. Cross-blood-bank IDOR prevention
        const crossUnitScreen = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitB.unitid}/screening`,
            {
                verifiedByUserId: admin.userid,
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NON_REACTIVE",
                overallStatus: "PASSED",
            },
            bbAToken
        );
        assert(crossUnitScreen.status === 403, "5a. Cross-blood-bank unit screening rejected with 403", `got ${crossUnitScreen.status}`);

        const crossUnitHistory = await reqJson(
            "GET",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitB.unitid}/screening-history`,
            undefined,
            bbAToken
        );
        assert(crossUnitHistory.status === 403, "5b. Cross-blood-bank screening-history rejected with 403", `got ${crossUnitHistory.status}`);

        // 6. Unauthorized requisition assignment rejection
        const donorAssign = await reqJson(
            "POST",
            `/bloodrequests/${bloodReqA.requestid}/assign`,
            { bloodBankId: bbA.bloodbankid },
            donorAToken
        );
        assert(donorAssign.status === 403, "6a. POST /bloodrequests/:id/assign rejects DONOR with 403", `got ${donorAssign.status}`);

        const hospBAssign = await reqJson(
            "POST",
            `/bloodrequests/${bloodReqA.requestid}/assign`,
            { bloodBankId: bbA.bloodbankid },
            hospBToken
        );
        assert(hospBAssign.status === 403, "6b. POST /bloodrequests/:id/assign rejects non-owning Hospital with 403", `got ${hospBAssign.status}`);

        const unverifiedAssign = await reqJson(
            "POST",
            `/bloodrequests/${bloodReqA.requestid}/assign`,
            { bloodBankId: bbA.bloodbankid },
            hospAToken
        );
        assert(unverifiedAssign.status === 400, "6c. POST /bloodrequests/:id/assign blocks unverified prescription with 400", `got ${unverifiedAssign.status}`);

        // 7. Unauthorized transit updates
        const crossTransit = await reqJson(
            "PATCH",
            `/bloodrequests/${bloodReqA.requestid}/transit-status`,
            { status: "COMPLETED" },
            reqBToken
        );
        assert(crossTransit.status === 403, "7. PATCH /bloodrequests/:id/transit-status rejects non-owner requester with 403", `got ${crossTransit.status}`);

        // 8. Clinical dual-sign-off separation of duties
        const missingVerifier = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/units/${unitB.unitid}/screening`,
            {
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NON_REACTIVE",
                overallStatus: "PASSED",
            },
            bbBToken
        );
        assert(missingVerifier.status === 400, "8a. Clinical screening rejects missing verifiedByUserId with 400", `got ${missingVerifier.status}`);

        const selfVerify = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/units/${unitB.unitid}/screening`,
            {
                testedByUserId: bbUserB.userid,
                verifiedByUserId: bbUserB.userid,
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NON_REACTIVE",
                overallStatus: "PASSED",
            },
            bbBToken
        );
        assert(selfVerify.status === 403, "8b. Clinical screening rejects same-user dual sign-off with 403", `got ${selfVerify.status}`);

        const donorVerifier = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/units/${unitB.unitid}/screening`,
            {
                testedByUserId: bbUserB.userid,
                verifiedByUserId: donorUserA.userid,
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NON_REACTIVE",
                overallStatus: "PASSED",
            },
            bbBToken
        );
        assert(donorVerifier.status === 403, "8c. Clinical screening rejects DONOR as clinical verifier with 403", `got ${donorVerifier.status}`);

        // 9. Donor self-eligibility manipulation rejection
        const selfEligible = await reqJson(
            "PUT",
            `/donors/${donorA.donorid}`,
            { iseligible: true },
            donorAToken
        );
        assert(selfEligible.status === 403, "9. PUT /donors/:donorId rejects donor self-setting iseligible with 403", `got ${selfEligible.status}`);

        // 10. Deactivated account access rejection
        const inactiveAuthMe = await reqJson("GET", "/auth/me", undefined, inactiveToken);
        assert(inactiveAuthMe.status === 403, "10a. GET /auth/me rejects deactivated user JWT with 403", `got ${inactiveAuthMe.status}`);

        // Security headers check
        assert(
            unauthDonors.headers.get("x-content-type-options") === "nosniff" &&
                unauthDonors.headers.get("x-frame-options") === "DENY",
            "10b. Security headers (X-Content-Type-Options, X-Frame-Options) present"
        );

        // Atomic donor activation token single-use check
        const rawActToken = `p0_act_${ts}`;
        const hashActToken = crypto.createHash("sha256").update(rawActToken).digest("hex");
        await prisma.donoractivationtokens.create({
            data: {
                userid: inactiveUser.userid,
                tokenhash: hashActToken,
                expiresat: new Date(Date.now() + 3600 * 1000),
            },
        });
        const [act1, act2] = await Promise.all([
            reqJson("POST", "/auth/activate-donor", { token: rawActToken, password: "NewPassword123!" }),
            reqJson("POST", "/auth/activate-donor", { token: rawActToken, password: "NewPassword123!" }),
        ]);
        const statuses = [act1.status, act2.status].sort();
        assert(statuses[0] === 200 && statuses[1] === 400, "10c. Concurrent activate-donor allows exactly one 200 and rejects replay with 400", `got ${statuses.join(",")}`);

        // 11. Institutional approval enforcement (PENDING & REJECTED blocked, profile view allowed, ADMIN governance allowed)
        const pendingHospUser = await prisma.users.create({
            data: { name: "Pending Hosp", email: `p0_phosp_${ts}@swastya.test`, password: pwHash, role: user_role.HOSPITAL, phonenumber: "9000000011", isactive: true },
        });
        createdUserIds.push(pendingHospUser.userid);
        const pendingHosp = await prisma.hospitals.create({
            data: {
                userid: pendingHospUser.userid,
                hospitalname: "Pending Hosp",
                registrationnumber: `P0-PHOSP-${ts}`,
                contactpersonname: "Dr P",
                contactpersonphone: "9000000011",
                address: "Addr P",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.PENDING,
            },
        });
        const pendingHospToken = generateToken(pendingHospUser.userid, pendingHospUser.role);
        const pendingHospMe = await reqJson("GET", "/hospitals/me", undefined, pendingHospToken);
        assert(pendingHospMe.status === 200, "11a. PENDING Hospital can view its own profile (/hospitals/me)", `got ${pendingHospMe.status}`);

        const pendingHospClinical = await reqJson(
            "POST",
            "/hospitals/me/bloodrequests",
            { patientname: "Test", bloodgroup: "O+", unitsrequired: 1, urgencylevel: "HIGH", requiredby: new Date(Date.now() + 86400000).toISOString() },
            pendingHospToken
        );
        assert(pendingHospClinical.status === 403, "11b. PENDING Hospital blocked from clinical request creation with 403", `got ${pendingHospClinical.status}`);

        const pendingBbUser = await prisma.users.create({
            data: { name: "Pending BB", email: `p0_pbb_${ts}@swastya.test`, password: pwHash, role: user_role.BLOOD_BANK, phonenumber: "9000000012", isactive: true },
        });
        createdUserIds.push(pendingBbUser.userid);
        const pendingBb = await prisma.bloodbanks.create({
            data: {
                userid: pendingBbUser.userid,
                bloodbankname: "Pending BB",
                licensenumber: `P0-PBB-${ts}`,
                contactpersonname: "BB P",
                contactpersonphone: "9000000012",
                address: "BB Addr P",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.REJECTED,
            },
        });
        const pendingBbToken = generateToken(pendingBbUser.userid, pendingBbUser.role);
        const rejectedBbClinical = await reqJson(
            "POST",
            `/bloodbanks/${pendingBb.bloodbankid}/inventory`,
            { bloodgroup: "O+", bloodcomponent: "RBC", unitsavailable: 2, expirydate: new Date(Date.now() + 86400000).toISOString() },
            pendingBbToken
        );
        assert(rejectedBbClinical.status === 403, "11c. REJECTED Blood Bank blocked from clinical inventory mutation with 403", `got ${rejectedBbClinical.status}`);

        const adminToken = generateToken(admin.userid, admin.role);
        const adminApproveHosp = await reqJson(
            "PUT",
            `/hospitals/${pendingHosp.hospitalid}`,
            { approvalstatus: "APPROVED" },
            adminToken
        );
        assert(adminApproveHosp.status === 200 && adminApproveHosp.data?.approvalstatus === "APPROVED", "11d. ADMIN can approve PENDING hospital", `got ${adminApproveHosp.status}`);

        // 12. Hospital donor-import /commit backend revalidation & concurrent duplicate safety
        const forgedCommit = await reqJson(
            "POST",
            "/hospitals/me/donors/import/commit",
            {
                toLink: [{ donorId: donorA.donorid, name: "Forged", email: `nonexistent_${ts}@swastya.test`, phone: "9111111111" }],
            },
            hospAToken
        );
        assert(
            forgedCommit.status === 200 && forgedCommit.data?.linkedCount === 0,
            "12a. Forged toLink donorId is ignored and revalidated on backend (linkedCount=0)",
            `linkedCount=${forgedCommit.data?.linkedCount}`
        );

        const impEmail = `p0_imp_${ts}@swastya.test`;
        const importPayload = {
            toCreate: [
                {
                    name: "Imported Safe Donor",
                    email: impEmail,
                    phone: "9876511111",
                    bloodGroup: "A+",
                    dob: "1994-05-12",
                    gender: "FEMALE",
                    city: "Bengaluru",
                    state: "Karnataka",
                    pincode: "560001",
                },
            ],
        };
        const [imp1, imp2] = await Promise.all([
            reqJson("POST", "/hospitals/me/donors/import/commit", importPayload, hospAToken),
            reqJson("POST", "/hospitals/me/donors/import/commit", importPayload, hospAToken),
        ]);
        const totalImported = (imp1.data?.importedCount || 0) + (imp2.data?.importedCount || 0);
        const impUser = await prisma.users.findUnique({ where: { email: impEmail } });
        if (impUser) createdUserIds.push(impUser.userid);
        assert(
            imp1.status === 200 && imp2.status === 200 && totalImported === 1,
            "12b. Concurrent duplicate donor import commits create exactly 1 donor record",
            `totalImported=${totalImported}`
        );

        // 13. Eligible clinical verifiers endpoint
        const verifiersRes = await reqJson("GET", `/bloodbanks/${bbB.bloodbankid}/verifiers`, undefined, bbBToken);
        const verifierIds: string[] = (verifiersRes.data?.verifiers || []).map((v: any) => v.userid);
        assert(
            verifiersRes.status === 200 &&
                verifierIds.includes(admin.userid) &&
                !verifierIds.includes(bbUserB.userid) &&
                !verifierIds.includes(donorUserA.userid),
            "13. GET /bloodbanks/:id/verifiers returns eligible active ADMIN/BLOOD_BANK verifiers excluding caller"
        );

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        // Clean up only our P0 test records
        if (createdRequestIds.length > 0) {
            await prisma.prescription.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.bloodrequests.deleteMany({ where: { requestid: { in: createdRequestIds } } });
        }
        if (createdUserIds.length > 0) {
            await prisma.donoractivationtokens.deleteMany({ where: { userid: { in: createdUserIds } } });
            await prisma.hospitaldonors.deleteMany({ where: { donors: { userid: { in: createdUserIds } } } });
            await prisma.inventoryunits.deleteMany({ where: { bloodbanks: { userid: { in: createdUserIds } } } });
            await prisma.inventory.deleteMany({ where: { bloodbanks: { userid: { in: createdUserIds } } } });
            await prisma.bloodbanks.deleteMany({ where: { userid: { in: createdUserIds } } });
            await prisma.hospitals.deleteMany({ where: { userid: { in: createdUserIds } } });
            await prisma.requesters.deleteMany({ where: { userid: { in: createdUserIds } } });
            await prisma.donors.deleteMany({ where: { userid: { in: createdUserIds } } });
            await prisma.users.deleteMany({ where: { userid: { in: createdUserIds } } });
        }
        if (server) server.close();
        await prisma.$disconnect();
    }
}

runTests();
