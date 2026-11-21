import dotenv from "dotenv";
import path from "path";
import http from "http";
import crypto from "crypto";
import jwt from "jsonwebtoken";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/Swastya(\?|$)/i, "/swastya_test$1");
}

import { generateToken, getJwtSecret } from "../src/utils/jwt";
const { prisma } = require("../src/config/prisma") as typeof import("../src/config/prisma");
const app = (require("../src/app") as typeof import("../src/app")).default;

let server: http.Server;
let baseUrl = "";
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
        console.log(`[PASS] ${name}`);
        passed++;
    } else {
        const msg = `${name}${detail ? ` -> ${detail}` : ""}`;
        console.error(`[FAIL] ${msg}`);
        failures.push(msg);
        failed++;
    }
}

async function reqJson(method: string, path: string, body?: any, token?: string, extraHeaders?: Record<string, string>) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(extraHeaders || {}),
    };
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data: any = null;
    try {
        data = await res.json();
    } catch {}
    return { status: res.status, data };
}

async function runAuditTests() {
    const tag = crypto.randomBytes(4).toString("hex");
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];
    const createdBloodBankIds: string[] = [];
    const createdHospitalIds: string[] = [];

    try {
        await new Promise<void>((resolve) => {
            server = app.listen(0, () => {
                const addr: any = server.address();
                baseUrl = `http://127.0.0.1:${addr.port}`;
                resolve();
            });
        });

        // Create independent identities for all 4 portals + Admin + Pending/Deactivated accounts
        const mkUser = async (name: string, role: any, isactive = true, emailverified = true, phone?: string) => {
            const u = await prisma.users.create({
                data: {
                    name: `${name} ${tag}`,
                    email: `${name.toLowerCase().replace(/\s+/g, "_")}_${tag}@audit.local`,
                    password: "hashed_placeholder",
                    role,
                    isactive,
                    emailverified,
                    phonenumber: phone || `9990${Math.floor(100000 + Math.random() * 899999)}`,
                },
            });
            createdUserIds.push(u.userid);
            return u;
        };

        const adminUser = await mkUser("AuditAdmin", "ADMIN");
        const reqAUser = await mkUser("ReqA", "REQUESTER");
        const reqBUser = await mkUser("ReqB", "REQUESTER");
        const donorAUser = await mkUser("DonorA", "DONOR", true, true, "9876500001");
        const donorBUser = await mkUser("DonorB", "DONOR", true, true, "9876500002");
        const inactiveDonorUser = await mkUser("InactiveDonor", "DONOR", false, true, "9876500003");
        const hospAUser = await mkUser("HospA", "HOSPITAL");
        const hospBUser = await mkUser("HospB", "HOSPITAL");
        const hospPendingUser = await mkUser("HospPending", "HOSPITAL");
        const bbAUser = await mkUser("BBA", "BLOOD_BANK");
        const bbBUser = await mkUser("BBB", "BLOOD_BANK");
        const bbPendingUser = await mkUser("BBPending", "BLOOD_BANK");

        const reqA = await prisma.requesters.create({
            data: { userid: reqAUser.userid, address: "123 Secret Home Rd", city: "Hyderabad", state: "TS", pincode: "500001", latitude: 17.385, longitude: 78.4867 },
        });
        const reqB = await prisma.requesters.create({
            data: { userid: reqBUser.userid, address: "456 Private Lane", city: "Hyderabad", state: "TS", pincode: "500002" },
        });

        const donorA = await prisma.donors.create({
            data: { userid: donorAUser.userid, bloodgroup: "O_POSITIVE", dateofbirth: new Date("1995-05-05"), gender: "MALE", address: "DonorA St", city: "Hyderabad", state: "TS", pincode: "500001", availabilitystatus: "AVAILABLE", iseligible: true },
        });
        const donorB = await prisma.donors.create({
            data: { userid: donorBUser.userid, bloodgroup: "A_POSITIVE", dateofbirth: new Date("1994-06-06"), gender: "FEMALE", address: "DonorB St", city: "Hyderabad", state: "TS", pincode: "500002", availabilitystatus: "AVAILABLE", iseligible: true },
        });
        await prisma.donors.create({
            data: { userid: inactiveDonorUser.userid, bloodgroup: "O_POSITIVE", dateofbirth: new Date("1992-01-01"), gender: "MALE", address: "Inactive St", city: "Hyderabad", state: "TS", pincode: "500003", availabilitystatus: "AVAILABLE", iseligible: true },
        });

        const hospA = await prisma.hospitals.create({
            data: { userid: hospAUser.userid, hospitalname: `HospA ${tag}`, registrationnumber: `HREG-A-${tag}`, address: "HospA Rd", city: "Hyderabad", state: "TS", pincode: "500001", contactpersonname: "Dr A", contactpersonphone: "9000000001", approvalstatus: "APPROVED" },
        });
        const hospB = await prisma.hospitals.create({
            data: { userid: hospBUser.userid, hospitalname: `HospB ${tag}`, registrationnumber: `HREG-B-${tag}`, address: "HospB Rd", city: "Hyderabad", state: "TS", pincode: "500002", contactpersonname: "Dr B", contactpersonphone: "9000000002", approvalstatus: "APPROVED" },
        });
        const hospPending = await prisma.hospitals.create({
            data: { userid: hospPendingUser.userid, hospitalname: `HospPending ${tag}`, registrationnumber: `HREG-P-${tag}`, address: "HospP Rd", city: "Hyderabad", state: "TS", pincode: "500003", contactpersonname: "Dr P", contactpersonphone: "9000000003", approvalstatus: "PENDING" },
        });
        createdHospitalIds.push(hospA.hospitalid, hospB.hospitalid, hospPending.hospitalid);

        const bbA = await prisma.bloodbanks.create({
            data: { userid: bbAUser.userid, bloodbankname: `BBA ${tag}`, licensenumber: `LIC-A-${tag}`, address: "BBA Rd", city: "Hyderabad", state: "TS", pincode: "500001", contactpersonname: "Mgr A", contactpersonphone: "8000000001", approvalstatus: "APPROVED" },
        });
        const bbB = await prisma.bloodbanks.create({
            data: { userid: bbBUser.userid, bloodbankname: `BBB ${tag}`, licensenumber: `LIC-B-${tag}`, address: "BBB Rd", city: "Hyderabad", state: "TS", pincode: "500002", contactpersonname: "Mgr B", contactpersonphone: "8000000002", approvalstatus: "APPROVED" },
        });
        const bbPending = await prisma.bloodbanks.create({
            data: { userid: bbPendingUser.userid, bloodbankname: `BBPending ${tag}`, licensenumber: `LIC-P-${tag}`, address: "BBP Rd", city: "Hyderabad", state: "TS", pincode: "500003", contactpersonname: "Mgr P", contactpersonphone: "8000000003", approvalstatus: "PENDING" },
        });
        createdBloodBankIds.push(bbA.bloodbankid, bbB.bloodbankid, bbPending.bloodbankid);

        const adminToken = generateToken(adminUser.userid, "ADMIN");
        const reqAToken = generateToken(reqAUser.userid, "REQUESTER");
        const reqBToken = generateToken(reqBUser.userid, "REQUESTER");
        const donorAToken = generateToken(donorAUser.userid, "DONOR");
        const donorBToken = generateToken(donorBUser.userid, "DONOR");
        const inactiveDonorToken = generateToken(inactiveDonorUser.userid, "DONOR");
        const hospAToken = generateToken(hospAUser.userid, "HOSPITAL");
        const hospBToken = generateToken(hospBUser.userid, "HOSPITAL");
        const hospPendingToken = generateToken(hospPendingUser.userid, "HOSPITAL");
        const bbAToken = generateToken(bbAUser.userid, "BLOOD_BANK");
        const bbBToken = generateToken(bbBUser.userid, "BLOOD_BANK");
        const bbPendingToken = generateToken(bbPendingUser.userid, "BLOOD_BANK");

        // === PHASE 2: AUTHENTICATION ===
        const rNoToken = await reqJson("GET", "/auth/me");
        const rBadToken = await reqJson("GET", "/auth/me", undefined, "malformed.token.here");
        const rBadSig = await reqJson("GET", "/auth/me", undefined, jwt.sign({ userid: reqAUser.userid, role: "ADMIN" }, "wrong_secret"));
        const rExpired = await reqJson("GET", "/auth/me", undefined, jwt.sign({ userid: reqAUser.userid, role: "REQUESTER" }, getJwtSecret(), { expiresIn: -10 }));
        const rForgedRole = await reqJson("GET", "/users", undefined, jwt.sign({ userid: reqAUser.userid, role: "ADMIN" }, getJwtSecret()));
        const rDeactivated = await reqJson("GET", "/auth/me", undefined, inactiveDonorToken);
        assert(
            rNoToken.status === 401 && rBadToken.status === 401 && rBadSig.status === 401 && rExpired.status === 401 && rForgedRole.status === 403 && rDeactivated.status === 403,
            "1. Auth guards reject missing/malformed/invalid-sig/expired tokens (401), deactivated accounts (403), and forged ADMIN JWT role (403)",
            `no=${rNoToken.status} bad=${rBadToken.status} sig=${rBadSig.status} exp=${rExpired.status} role=${rForgedRole.status} deact=${rDeactivated.status}`
        );

        // Activation bypass against admin-deactivated donor (emailverified: true, isactive: false)
        const rawActToken = crypto.randomBytes(24).toString("hex");
        const actHash = crypto.createHash("sha256").update(rawActToken).digest("hex");
        await prisma.donoractivationtokens.create({
            data: { userid: inactiveDonorUser.userid, tokenhash: actHash, expiresat: new Date(Date.now() + 3600000) },
        });
        const rActBypass = await reqJson("POST", "/auth/activate-donor", { token: rawActToken, password: "NewPassword123!" });
        assert(rActBypass.status === 400, "2. Admin-deactivated donor cannot bypass deactivation via /auth/activate-donor (400)", `got=${rActBypass.status}`);

        // Boolean coercion bug check on PUT /users/:id
        const rBoolCoerce = await reqJson("PUT", `/users/${reqAUser.userid}`, { isactive: "false" }, adminToken);
        const reqAStillActive = await prisma.users.findUnique({ where: { userid: reqAUser.userid }, select: { isactive: true } });
        assert(rBoolCoerce.status === 400 && reqAStillActive?.isactive === true, "3. PUT /users/:id rejects string 'false' for isactive (400)");

        // === CREATE BLOOD REQUESTS FOR ISOLATION & E2E TESTS ===
        const bloodReqA = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqAUser.userid,
                requesterid: reqA.requesterid,
                hospitalid: hospA.hospitalid,
                patientname: `PatientA ${tag}`,
                patientage: 35,
                patientgender: "MALE",
                patientcontact: "9111111111",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                status: "VERIFIED",
                isemergency: true,
                requiredby: new Date(Date.now() + 86400000),
                notes: "Confidential clinical note A",
                latitude: 17.385,
                longitude: 78.4867,
            },
        });
        const bloodReqB = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqBUser.userid,
                requesterid: reqB.requesterid,
                hospitalid: hospB.hospitalid,
                patientname: `PatientB ${tag}`,
                patientage: 29,
                patientgender: "FEMALE",
                patientcontact: "9222222222",
                bloodgroup: "A_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "VERIFIED",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
                notes: "Confidential clinical note B",
            },
        });
        createdRequestIds.push(bloodReqA.requestid, bloodReqB.requestid);

        await prisma.prescription.create({
            data: {
                requestid: bloodReqA.requestid,
                fileurl: `rx_a_${tag}.pdf`,
                originalfilename: "rxA.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr A",
                hospitalname: hospA.hospitalname,
                status: "VERIFIED",
                verifiedbyhospitalid: hospA.hospitalid,
            },
        });
        await prisma.prescription.create({
            data: {
                requestid: bloodReqB.requestid,
                fileurl: `rx_b_${tag}.pdf`,
                originalfilename: "rxB.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr B",
                hospitalname: hospB.hospitalname,
                status: "PENDING",
            },
        });

        // === PHASE 3: SAME-ROLE REQUESTER ISOLATION (A vs B) ===
        const rReqAGetB = await reqJson("GET", `/bloodrequests/${bloodReqB.requestid}`, undefined, reqAToken);
        const rReqAPutB = await reqJson("PUT", `/bloodrequests/${bloodReqB.requestid}`, { patientname: "Hacked" }, reqAToken);
        const rReqADelB = await reqJson("DELETE", `/bloodrequests/${bloodReqB.requestid}`, undefined, reqAToken);
        const rReqARxB = await reqJson("GET", `/bloodrequests/${bloodReqB.requestid}/prescription/file`, undefined, reqAToken);
        const rReqAProfB = await reqJson("GET", `/requesters/${reqB.requesterid}`, undefined, reqAToken);
        const rReqBCheckDb = await prisma.bloodrequests.findUnique({ where: { requestid: bloodReqB.requestid } });
        assert(
            rReqAGetB.status === 403 && rReqAPutB.status === 403 && rReqADelB.status === 403 && rReqARxB.status === 403 && rReqAProfB.status === 403 && rReqBCheckDb?.patientname === `PatientB ${tag}`,
            "4. Requester A blocked (403) from Requester B GET/PUT/DELETE/prescription/profile with zero DB side effects"
        );

        // === PHASE 3: SAME-ROLE DONOR ISOLATION & PRIVACY ===
        const rDonAGetB = await reqJson("GET", `/donors/${donorB.donorid}`, undefined, donorAToken);
        const rDonAPutB = await reqJson("PUT", `/donors/${donorB.donorid}`, { city: "Hacked" }, donorAToken);
        const rDonAHistB = await reqJson("GET", `/donors/${donorB.donorid}/history`, undefined, donorAToken);
        const rDonASelfDel = await reqJson("DELETE", `/donors/${donorA.donorid}`, undefined, donorAToken);
        assert(
            rDonAGetB.status === 403 && rDonAPutB.status === 403 && rDonAHistB.status === 403 && rDonASelfDel.status === 403,
            "5. Donor A blocked (403) from Donor B profile/update/history and cannot self-delete profile"
        );

        // Parameterized donor endpoint PHI/GPS leak check
        const rDonAMatch = await reqJson("GET", `/donors/${donorA.donorid}/matching-requests`, undefined, donorAToken);
        const matchList: any[] = rDonAMatch.data?.requests || [];
        const rDonAllReqs = await reqJson("GET", `/bloodrequests`, undefined, donorAToken);
        const donorList: any[] = Array.isArray(rDonAllReqs.data) ? rDonAllReqs.data : [];
        const anyMatchLeaks = matchList.some(
            (r) => Boolean(r.patientcontact) || r.latitude !== undefined || r.longitude !== undefined || r.requesters?.address !== undefined
        );
        const anyListLeaks = donorList.some((r) => r.patientname !== undefined || r.patientcontact !== undefined);
        assert(
            rDonAMatch.status === 200 &&
                matchList.length > 0 &&
                !anyMatchLeaks &&
                rDonAllReqs.status === 200 &&
                donorList.length > 0 &&
                !anyListLeaks,
            "6. Donor matching-requests and GET /bloodrequests redact patientcontact, GPS, requester address, and patientname",
            `matchStatus=${rDonAMatch.status} matchLen=${matchList.length} matchLeak=${anyMatchLeaks} listLen=${donorList.length} listLeak=${anyListLeaks}`
        );

        // === PHASE 3: SAME-ROLE HOSPITAL ISOLATION & DONOR IMPORT PII HARVESTING ===
        const rHospAGetB = await reqJson("GET", `/hospitals/${hospB.hospitalid}/bloodrequests`, undefined, hospAToken);
        const rHospAReqB = await reqJson("GET", `/bloodrequests/${bloodReqB.requestid}`, undefined, hospAToken);
        const rHospAVerifyB = await reqJson("POST", `/bloodrequests/${bloodReqB.requestid}/prescription/verify`, { action: "APPROVE" }, hospAToken);
        assert(
            rHospAGetB.status === 403 && rHospAReqB.status === 403 && rHospAVerifyB.status === 403,
            "7. Hospital A blocked (403) from Hospital B bloodrequests and prescription verification"
        );

        // Hospital A tries to harvest Donor B's phone via email-only CSV import preview
        const csvContent = [
            "name,email,phone,bloodGroup,dob,gender,city",
            `Probe,${donorBUser.email},,A+,1994-06-06,FEMALE,Hyderabad`,
            `Probe2,${donorBUser.email},1111111111,A+,1994-06-06,FEMALE,Hyderabad`,
        ].join("\n");
        const importForm = new FormData();
        importForm.append("file", new Blob([csvContent], { type: "text/csv" }), "probe.csv");
        const importResRaw = await fetch(`${baseUrl}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: { Authorization: `Bearer ${hospAToken}` },
            body: importForm,
        });
        const rImportHarvest = { status: importResRaw.status, data: await importResRaw.json().catch(() => null) };
        const harvestStr = JSON.stringify(rImportHarvest.data || {});
        assert(
            rImportHarvest.status === 200 &&
                (rImportHarvest.data?.toLink || []).length === 0 &&
                !harvestStr.includes("9876500002") &&
                !harvestStr.includes(donorB.donorid),
            "8. Hospital A donor import preview does NOT leak Donor B phone/donorId or auto-link on email-only",
            `status=${rImportHarvest.status} toLink=${(rImportHarvest.data?.toLink || []).length}`
        );

        // === PHASE 3: SAME-ROLE BLOOD BANK ISOLATION & VERIFIER/DUAL SIGN-OFF ===
        const rBBAGetBInv = await reqJson("GET", `/bloodbanks/${bbB.bloodbankid}/inventory`, undefined, bbAToken);
        const rBBAGetBUnits = await reqJson("GET", `/bloodbanks/${bbB.bloodbankid}/units`, undefined, bbAToken);
        const rBBAGetBAssign = await reqJson("GET", `/bloodbanks/${bbB.bloodbankid}/assignments`, undefined, bbAToken);
        const rBBALicMutate = await reqJson("PUT", `/bloodbanks/${bbA.bloodbankid}`, { licensenumber: `FORGED-${tag}` }, bbAToken);
        const rBBAVerifiers = await reqJson("GET", `/bloodbanks/${bbA.bloodbankid}/verifiers`, undefined, bbAToken);
        const verifiersStr = JSON.stringify(rBBAVerifiers.data || {});
        assert(
            rBBAGetBInv.status === 403 &&
                rBBAGetBUnits.status === 403 &&
                rBBAGetBAssign.status === 403 &&
                rBBALicMutate.status === 403 &&
                rBBAVerifiers.status === 200 &&
                !verifiersStr.includes(adminUser.email),
            "9. Blood Bank A blocked (403) from BB B resources & license mutation; verifiers endpoint hides admin emails"
        );

        // === PHASE 2 & 4: PENDING INSTITUTION ISOLATION ===
        const rPendHospReqs = await reqJson("GET", "/hospitals/me/bloodrequests", undefined, hospPendingToken);
        const rPendHospDonors = await reqJson("GET", "/hospitals/me/donors", undefined, hospPendingToken);
        const rPendBBUnits = await reqJson("GET", `/bloodbanks/${bbPending.bloodbankid}/units`, undefined, bbPendingToken);
        const rPendBBAssign = await reqJson("GET", `/bloodbanks/${bbPending.bloodbankid}/assignments`, undefined, bbPendingToken);
        const rAssignToPendBB = await reqJson("POST", `/bloodrequests/${bloodReqA.requestid}/assign`, { bloodBankId: bbPending.bloodbankid }, hospAToken);
        const rPubHosp = await reqJson("GET", "/hospitals");
        const rPubBB = await reqJson("GET", "/bloodbanks");
        assert(
            rPendHospReqs.status === 403 &&
                rPendHospDonors.status === 403 &&
                rPendBBUnits.status === 403 &&
                rPendBBAssign.status === 403 &&
                rAssignToPendBB.status === 403 &&
                !(rPubHosp.data || []).some((h: any) => h.hospitalid === hospPending.hospitalid) &&
                !(rPubBB.data || []).some((b: any) => b.bloodbankid === bbPending.bloodbankid),
            "10. Pending Hospital/Blood Bank blocked (403) from operational endpoints, assignment, and public directories"
        );

        // === PHASE 4: CROSS-ROLE & NOTIFICATION ISOLATION ===
        const rDonToReq = await reqJson("GET", "/requesters/me/bloodrequests", undefined, donorAToken);
        const rReqToDon = await reqJson("GET", "/donors/me/dashboard", undefined, reqAToken);
        const rBBToHosp = await reqJson("POST", `/bloodrequests/${bloodReqA.requestid}/prescription/verify`, { action: "APPROVE" }, bbAToken);
        assert(rDonToReq.status === 403 && rReqToDon.status === 403 && rBBToHosp.status === 403, "11. Cross-role portal boundaries strictly enforced (403)");

        const secretNotif = await prisma.notification.create({
            data: {
                userid: reqBUser.userid,
                requestid: bloodReqB.requestid,
                type: "MATCH",
                title: "Volunteer Alert",
                message: `Donor volunteered\n<!--META:{"donorPhone":"9999999999","chronicIllness":true}-->`,
                isread: false,
            },
        });
        const rNotifCrossRead = await reqJson("PATCH", `/notifications/${secretNotif.notificationid}/read`, {}, reqAToken);
        const rNotifCrossDel = await reqJson("DELETE", `/notifications/${secretNotif.notificationid}`, undefined, reqAToken);
        const rNotifOwnRead = await reqJson("PATCH", `/notifications/${secretNotif.notificationid}/read`, {}, reqBToken);
        assert(
            rNotifCrossRead.status === 403 &&
                rNotifCrossDel.status === 403 &&
                rNotifOwnRead.status === 200 &&
                !String(rNotifOwnRead.data?.notification?.message || "").includes("<!--META:"),
            "12. Notification cross-user access blocked (403) and PATCH /:id/read strips <!--META:--> PII/PHI"
        );

        // === PHASE 5: FOUR-PORTAL END-TO-END WORKFLOW + CLINICAL UPGRADE ===
        const screeningPayload = {
            estimatedArrival: "25 mins",
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
        const rVolA = await reqJson("POST", `/bloodrequests/${bloodReqA.requestid}/respond`, screeningPayload, donorAToken);
        const rGetReqA = await reqJson("GET", `/bloodrequests/${bloodReqA.requestid}`, undefined, reqAToken);
        const delA = rGetReqA.data?.volunteers?.find((v: any) => v.donorUserId === donorAUser.userid);

        const rAccA = await reqJson("POST", `/bloodrequests/${bloodReqA.requestid}/volunteers/${delA.deliveryId}/decision`, { decision: "ACCEPTED" }, reqAToken);
        const rStartA = await reqJson("PATCH", `/bloodrequests/${bloodReqA.requestid}/transit-status`, { status: "STARTED" }, donorAToken);
        const rReachA = await reqJson("PATCH", `/bloodrequests/${bloodReqA.requestid}/transit-status`, { status: "REACHED_LOCATION" }, donorAToken);
        const rReqConfirm = await reqJson("POST", `/bloodrequests/${bloodReqA.requestid}/volunteers/${delA.deliveryId}/confirm-receipt`, {}, reqAToken);
        const histPending = await prisma.donationhistory.findFirst({ where: { donorid: donorA.donorid, requestid: bloodReqA.requestid } });
        // Now Hospital A clinically verifies the already-requester-confirmed receipt!
        const rHospUpgrade = await reqJson("POST", `/bloodrequests/${bloodReqA.requestid}/volunteers/${delA.deliveryId}/confirm-receipt`, {}, hospAToken);
        const histVerified = await prisma.donationhistory.findFirst({ where: { donorid: donorA.donorid, requestid: bloodReqA.requestid } });
        const reqAAfter = await prisma.bloodrequests.findUnique({ where: { requestid: bloodReqA.requestid } });
        assert(
            rVolA.status === 200 &&
                rAccA.status === 200 &&
                rStartA.status === 200 &&
                rReachA.status === 200 &&
                rReqConfirm.status === 200 &&
                histPending?.verificationstatus === "PENDING" &&
                rHospUpgrade.status === 200 &&
                histVerified?.verificationstatus === "VERIFIED" &&
                reqAAfter?.status === "BLOOD_ARRANGED",
            "13. Four-portal E2E flow: Volunteer -> Accept -> Start -> Reach -> Requester Receipt (PENDING) -> Hospital Clinical Upgrade (VERIFIED + BLOOD_ARRANGED)"
        );

        // === PHASE 5: BLOOD BANK ASSIGNMENT, INCOMPATIBLE SPECIFIC UNIT BLOCK & CROSS-FACILITY SIGN-OFF BLOCK ===
        const rAssignBB = await reqJson("POST", `/bloodrequests/${bloodReqA.requestid}/assign`, { bloodBankId: bbA.bloodbankid }, hospAToken);
        const assignId = rAssignBB.data?.assignment?.assignmentid;
        // Blood Bank B tries to use Blood Bank A's assignmentId -> 404
        const rBBBStealAssign = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/reservations`,
            { assignmentId: assignId, requestedUnits: 1 },
            bbBToken,
            { "Idempotency-Key": `steal-assign-${tag}-123456` }
        );
        // Blood Bank A accepts assignment, intakes an incompatible AB_POSITIVE unit, clears screening with cross-facility tester (must fail 403!), clears legitimately, and tries allocating incompatible specificUnitIds (must fail 409!)
        const rBBAAccept = await reqJson("PATCH", `/bloodbanks/${bbA.bloodbankid}/assignments/${assignId}`, { action: "ACCEPT" }, bbAToken);
        const rIntake = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/intake`,
            {
                bloodGroup: "AB_POSITIVE",
                bloodComponent: "WHOLE_BLOOD",
                expiryDate: new Date(Date.now() + 86400000 * 30).toISOString(),
                collectionDate: new Date().toISOString(),
                units: [{ unitBarcode: `ABU-${tag}` }],
            },
            bbAToken,
            { "Idempotency-Key": `intake-${tag}-1234567890` }
        );
        const createdUnit = await prisma.inventoryunits.findFirst({
            where: { bloodbankid: bbA.bloodbankid, unitbarcode: `ABU-${tag}` },
            select: { unitid: true },
        });
        const unitId = createdUnit?.unitid;
        const rForgedTester = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitId}/screening`,
            {
                testedByUserId: bbBUser.userid,
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NON_REACTIVE",
                overallStatus: "PASSED",
            },
            bbAToken
        );
        const rValidScreenSubmit = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitId}/screening`,
            {
                hivResult: "NON_REACTIVE",
                hbvResult: "NON_REACTIVE",
                hcvResult: "NON_REACTIVE",
                syphilisResult: "NON_REACTIVE",
                malariaResult: "NON_REACTIVE",
                overallStatus: "PASSED",
            },
            bbAToken
        );
        const rValidScreen = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitId}/screening/verify`,
            {},
            adminToken
        );
        const rIncompatAlloc = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/reservations`,
            { assignmentId: assignId, requestedUnits: 1, specificUnitIds: [unitId] },
            bbAToken,
            { "Idempotency-Key": `alloc-${tag}-1234567890` }
        );
        assert(
            rAssignBB.status === 201 &&
                rBBBStealAssign.status === 404 &&
                rBBAAccept.status === 200 &&
                rIntake.status === 201 &&
                rForgedTester.status === 403 &&
                rValidScreenSubmit.status === 200 &&
                rValidScreen.status === 200 &&
                rIncompatAlloc.status === 409,
            "14. Blood Bank assignment isolation, cross-facility tester forgery block (403), and incompatible specificUnitIds block (409)",
            `assign=${rAssignBB.status} steal=${rBBBStealAssign.status} acc=${rBBAAccept.status} intake=${rIntake.status} forged=${rForgedTester.status} submit=${rValidScreenSubmit.status} screen=${rValidScreen.status} incompat=${rIncompatAlloc.status}`
        );

        console.log(`\n=== FOUR-PORTAL AUDIT TEST SUMMARY: ${passed}/${passed + failed} PASSED ===`);
        if (failed > 0) {
            console.error("Failures:", failures);
            process.exitCode = 1;
        }
    } finally {
        for (const reqId of createdRequestIds) {
            await prisma.reservationitems.deleteMany({ where: { reservation: { requestid: reqId } } }).catch(() => {});
            await prisma.bloodreservations.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.requisitionassignments.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.donationhistory.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.requeststatushistory.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.broadcastdeliveries.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.emergencybroadcasts.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.prescriptionhistory.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.prescription.deleteMany({ where: { requestid: reqId } }).catch(() => {});
            await prisma.bloodrequests.deleteMany({ where: { requestid: reqId } }).catch(() => {});
        }
        for (const bbId of createdBloodBankIds) {
            await prisma.unitdispositionhistory.deleteMany({ where: { bloodbankid: bbId } }).catch(() => {});
            await prisma.unitscreeningrecords.deleteMany({ where: { unit: { bloodbankid: bbId } } }).catch(() => {});
            await prisma.inventoryledger.deleteMany({ where: { bloodbankid: bbId } }).catch(() => {});
            await prisma.inventoryunits.deleteMany({ where: { bloodbankid: bbId } }).catch(() => {});
            await prisma.inventory.deleteMany({ where: { bloodbankid: bbId } }).catch(() => {});
            await prisma.bloodbanks.deleteMany({ where: { bloodbankid: bbId } }).catch(() => {});
        }
        for (const hId of createdHospitalIds) {
            await prisma.hospitaldonors.deleteMany({ where: { hospitalid: hId } }).catch(() => {});
            await prisma.hospitals.deleteMany({ where: { hospitalid: hId } }).catch(() => {});
        }
        for (const uid of createdUserIds) {
            await prisma.donoractivationtokens.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.donors.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.requesters.deleteMany({ where: { userid: uid } }).catch(() => {});
            await prisma.users.deleteMany({ where: { userid: uid } }).catch(() => {});
        }
        if (server) server.close();
        await prisma.$disconnect();
    }
}

runAuditTests().catch((err) => {
    console.error("Audit suite fatal error:", err);
    process.exit(1);
});
