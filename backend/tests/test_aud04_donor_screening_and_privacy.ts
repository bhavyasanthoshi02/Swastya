import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { user_role } from "../src/generated/prisma/enums";

let server: http.Server;
let API_BASE = "";
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, detail?: string) {
    if (condition) {
        console.log(`[PASS] ${message}`);
        passed++;
    } else {
        console.error(`[FAIL] ${message}${detail ? ` (${detail})` : ""}`);
        failed++;
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function reqJson(method: string, endpoint: string, token: string, body?: any) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
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
    } catch {
        data = null;
    }
    return { status: res.status, data };
}

const VALID_SCREENING = {
    drinksAlcohol: false,
    alcoholInPast24Hours: false,
    feelingHealthy: true,
    recentAntibioticsOrMedication: false,
    recentTattooOrSurgery: false,
    donatedInLast90Days: false,
    chronicIllness: false,
    isPregnantOrBreastfeeding: false,
};

async function main() {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, () => {
            const addr = server.address() as any;
            API_BASE = `http://127.0.0.1:${addr.port}`;
            resolve();
        });
    });

    console.log(`\n=== SWASTYA AUD-04: DONOR SCREENING VALIDATION & PRIVACY TESTS (${API_BASE}) ===\n`);

    const tag = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const createdUserIds: string[] = [];
    const createdRequestIds: string[] = [];
    const secretPatientName = `ConfidentialPatient_${tag}`;

    try {
        // Seed requester, hospital, and 3 eligible O+ donors
        const reqUser = await prisma.users.create({
            data: {
                name: "AUD04 Requester",
                email: `aud04_req_${tag}@swastya.org`,
                password: "hash",
                role: user_role.REQUESTER,
                phonenumber: "9800001001",
            },
        });
        createdUserIds.push(reqUser.userid);

        const requester = await prisma.requesters.create({
            data: {
                userid: reqUser.userid,
                address: "100 Requester Lane",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
            },
        });

        const hospUser = await prisma.users.create({
            data: {
                name: "AUD04 Hospital",
                email: `aud04_hosp_${tag}@swastya.org`,
                password: "hash",
                role: user_role.HOSPITAL,
                phonenumber: "9800001002",
            },
        });
        createdUserIds.push(hospUser.userid);

        const hospital = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: `AUD04 Hospital ${tag}`,
                registrationnumber: `HOSP-AUD04-${tag}`,
                contactpersonname: "Dr. AUD04",
                contactpersonphone: "9800001002",
                address: "100 Clinical Rd",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                approvalstatus: "APPROVED",
            },
        });

        const donorUsers: any[] = [];
        const donors: any[] = [];
        const donorTokens: string[] = [];

        for (let i = 1; i <= 3; i++) {
            const du = await prisma.users.create({
                data: {
                    name: `AUD04 Donor ${i}`,
                    email: `aud04_d${i}_${tag}@swastya.org`,
                    password: "hash",
                    role: user_role.DONOR,
                    phonenumber: `980000101${i}`,
                },
            });
            createdUserIds.push(du.userid);
            const d = await prisma.donors.create({
                data: {
                    userid: du.userid,
                    bloodgroup: "O_POSITIVE",
                    dateofbirth: new Date("1997-01-01"),
                    gender: "MALE",
                    weight: 70,
                    address: `${i} Donor Lane`,
                    city: "Mumbai",
                    state: "Maharashtra",
                    pincode: "400001",
                    availabilitystatus: "AVAILABLE",
                    iseligible: true,
                    lastdonationdate: null,
                },
            });
            donorUsers.push(du);
            donors.push(d);
            donorTokens.push(generateToken(du.userid, user_role.DONOR));
        }

        const reqToken = generateToken(reqUser.userid, user_role.REQUESTER);

        // Active request (VERIFIED)
        const reqActive = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: secretPatientName,
                patientage: 42,
                patientgender: "FEMALE",
                patientcontact: "9999988888",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "RBC",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                status: "VERIFIED",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqActive.requestid);

        await prisma.prescription.create({
            data: {
                requestid: reqActive.requestid,
                fileurl: `https://test.local/rx-aud04-${tag}.pdf`,
                originalfilename: "rx.pdf",
                mimetype: "application/pdf",
                filesize: 1024,
                doctorname: "Dr. AUD04",
                hospitalname: hospital.hospitalname,
                status: "VERIFIED",
                verifiedbyhospitalid: hospital.hospitalid,
            },
        });

        // BLOOD_ARRANGED request
        const reqArranged = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: requester.requesterid,
                hospitalid: hospital.hospitalid,
                patientname: `Arranged_${secretPatientName}`,
                patientage: 35,
                patientgender: "MALE",
                patientcontact: "9999977777",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "RBC",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                status: "BLOOD_ARRANGED",
                isemergency: false,
                requiredby: new Date(Date.now() + 86400000),
            },
        });
        createdRequestIds.push(reqArranged.requestid);

        // 1. Missing screening object
        const rMissingObj = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            estimatedArrival: "30 mins",
        });
        assert(rMissingObj.status === 400, "1. Missing screeningAnswers object rejected with 400", `got=${rMissingObj.status}`);

        // 2. Empty screening object {}
        const rEmptyObj = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: {},
        });
        assert(rEmptyObj.status === 400, "2. Empty screeningAnswers {} rejected with 400", `got=${rEmptyObj.status}`);

        // 3. Missing mandatory boolean fields
        const { feelingHealthy: _omitted, ...partialScreening } = VALID_SCREENING;
        const rMissingField = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: partialScreening,
        });
        assert(
            rMissingField.status === 400 && String(rMissingField.data?.message || "").includes("feelingHealthy"),
            "3. Missing mandatory boolean field (feelingHealthy) rejected with 400"
        );

        // 4. Boolean fields supplied as strings
        const rStringBool = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: { ...VALID_SCREENING, drinksAlcohol: "false" },
        });
        assert(
            rStringBool.status === 400 && String(rStringBool.data?.message || "").includes("drinksAlcohol"),
            "4. String boolean ('false') rejected with 400"
        );

        // 5. Boolean fields supplied as numbers
        const rNumBool = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: { ...VALID_SCREENING, feelingHealthy: 1 },
        });
        assert(
            rNumBool.status === 400 && String(rNumBool.data?.message || "").includes("feelingHealthy"),
            "5. Numeric boolean (1) rejected with 400"
        );

        // 6. Null screening values
        const rNullBool = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: { ...VALID_SCREENING, chronicIllness: null },
        });
        assert(
            rNullBool.status === 400 && String(rNullBool.data?.message || "").includes("chronicIllness"),
            "6. Null screening value rejected with 400"
        );

        // 7 & 9. Ineligible donor response (with all 8 explicit booleans)
        const rIneligible = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: { ...VALID_SCREENING, feelingHealthy: false },
        });
        assert(
            rIneligible.status === 400 && rIneligible.data?.ineligibilityReason === "ACUTE_SYMPTOMS_OR_FEVER",
            "9. Ineligible donor response (feelingHealthy: false) rejected with 400 and clinical reason"
        );

        const rAlcoholIneligible = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: { ...VALID_SCREENING, drinksAlcohol: true, alcoholInPast24Hours: true },
        });
        assert(
            rAlcoholIneligible.status === 400 && rAlcoholIneligible.data?.ineligibilityReason === "ALCOHOL_PAST_24_HOURS",
            "9b. Alcohol in past 24h rejected with 400 and clinical reason"
        );

        // 10. Donor response against BLOOD_ARRANGED request
        const rArranged = await reqJson("POST", `/bloodrequests/${reqArranged.requestid}/respond`, donorTokens[0], {
            screeningAnswers: VALID_SCREENING,
        });
        assert(
            rArranged.status === 400 && String(rArranged.data?.message || "").toLowerCase().includes("blood_arranged"),
            "10. Donor response against BLOOD_ARRANGED request rejected with 400",
            `got=${rArranged.status} msg=${rArranged.data?.message}`
        );

        // Ensure no commitments were created from any of the rejected calls
        const countBeforeValid = await prisma.broadcastdeliveries.count({ where: { requestid: reqActive.requestid } });
        assert(countBeforeValid === 0, "No broadcastdeliveries created for invalid/ineligible responses");

        // 7 & 8 & 11. Valid eligible donor response + patient name hidden before ACCEPTED
        const rValid = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: VALID_SCREENING,
            estimatedArrival: "Within 30 mins",
        });
        assert(rValid.status === 200 && rValid.data?.success === true, "7 & 8. Valid eligible donor response succeeds (200)");
        assert(
            rValid.data?.patientName === null && !JSON.stringify(rValid.data).includes(secretPatientName),
            "11a. POST /respond does not expose patientName before ACCEPTED"
        );

        const d1Notif = await prisma.notification.findFirst({
            where: { userid: donorUsers[0].userid, requestid: reqActive.requestid, title: "Volunteer Response Confirmed" },
        });
        assert(
            Boolean(d1Notif) && !String(d1Notif?.message || "").includes(secretPatientName),
            "11b. Donor confirmation notification hides patientname while PENDING"
        );

        const rDashPending = await reqJson("GET", `/donors/me/dashboard`, donorTokens[0]);
        assert(rDashPending.status === 200, "Donor dashboard fetched (200)");
        const pendingCommit = (rDashPending.data?.myCommitments || []).find((c: any) => c.requestid === reqActive.requestid);
        assert(
            Boolean(pendingCommit) && pendingCommit.patientname === null && pendingCommit.myCommitment?.acceptanceStatus === "PENDING",
            "11c. Donor dashboard hides patientname while acceptanceStatus is PENDING"
        );

        // 12. Requester accepts Donor 1 -> patientname becomes visible to Donor 1
        const delivery1 = await prisma.broadcastdeliveries.findFirst({
            where: { requestid: reqActive.requestid, donorid: donors[0].donorid },
        });
        assert(Boolean(delivery1), "Delivery record found for Donor 1");

        const rAccept1 = await reqJson(
            "POST",
            `/bloodrequests/${reqActive.requestid}/volunteers/${delivery1!.deliveryid}/decision`,
            reqToken,
            { decision: "ACCEPTED" }
        );
        assert(rAccept1.status === 200 && rAccept1.data?.acceptanceStatus === "ACCEPTED", "12a. Requester accepts Donor 1");

        const rDashAccepted = await reqJson("GET", `/donors/me/dashboard`, donorTokens[0]);
        const acceptedCommit = (rDashAccepted.data?.myCommitments || []).find((c: any) => c.requestid === reqActive.requestid);
        assert(
            Boolean(acceptedCommit) && acceptedCommit.patientname === secretPatientName,
            "12b. Donor dashboard reveals patientname once acceptanceStatus is ACCEPTED"
        );

        // Donor 2 volunteers and is REJECTED -> patientname stays hidden from Donor 2
        const rValid2 = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[1], {
            screeningAnswers: VALID_SCREENING,
        });
        assert(rValid2.status === 200, "Donor 2 valid response succeeds");
        const delivery2 = await prisma.broadcastdeliveries.findFirst({
            where: { requestid: reqActive.requestid, donorid: donors[1].donorid },
        });
        const rReject2 = await reqJson(
            "POST",
            `/bloodrequests/${reqActive.requestid}/volunteers/${delivery2!.deliveryid}/decision`,
            reqToken,
            { decision: "REJECTED", reason: "Already matched" }
        );
        assert(rReject2.status === 200 && rReject2.data?.acceptanceStatus === "REJECTED", "Requester rejects Donor 2");
        const d2RejNotif = await prisma.notification.findFirst({
            where: { userid: donorUsers[1].userid, requestid: reqActive.requestid, title: "Donation Offer Not Selected" },
        });
        assert(
            Boolean(d2RejNotif) && !String(d2RejNotif?.message || "").includes(secretPatientName),
            "12c. Rejection notification hides patientname from rejected donor"
        );

        // 13. Duplicate-response & concurrency protections
        const rDup = await reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[0], {
            screeningAnswers: VALID_SCREENING,
        });
        assert(rDup.status === 400, "13a. Duplicate donor response rejected with 400");

        const [rConcA, rConcB] = await Promise.all([
            reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[2], {
                screeningAnswers: VALID_SCREENING,
            }),
            reqJson("POST", `/bloodrequests/${reqActive.requestid}/respond`, donorTokens[2], {
                screeningAnswers: VALID_SCREENING,
            }),
        ]);
        const concStatuses = [rConcA.status, rConcB.status].sort();
        const d3Count = await prisma.broadcastdeliveries.count({
            where: { requestid: reqActive.requestid, donorid: donors[2].donorid },
        });
        assert(
            concStatuses[0] === 200 && concStatuses[1] === 400 && d3Count === 1,
            "13b. Concurrent responses from same donor serialize to exactly 1 x 200, 1 x 400, and 1 delivery row",
            `statuses=${concStatuses.join(",")}, count=${d3Count}`
        );

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
    } finally {
        try {
            if (createdRequestIds.length > 0) {
                await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
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
