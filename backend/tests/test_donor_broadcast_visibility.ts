import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, user_role, availability_status, urgency_level } from "../src/generated/prisma/enums";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: Array<{ test: string; error: string }> = [];

function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failedTests++;
        const err = detail ? `${testName} — ${detail}` : testName;
        failures.push({ test: testName, error: err });
        console.error(`  [FAIL] ${err}`);
    }
}

async function runBroadcastVisibilityTestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: DONOR BROADCAST VISIBILITY & PRIVACY TEST SUITE");
    console.log("===============================================================================\n");

    const suffix = crypto.randomBytes(4).toString("hex");

    // 1. Seed Hospital User & Hospital
    const hospUser = await prisma.users.create({
        data: {
            email: `hosp_vis_${suffix}@swastya.org`,
            password: "Password@123",
            name: `Apex Hospital ${suffix}`,
            role: user_role.HOSPITAL,
            phonenumber: `91998877${suffix.slice(0, 2)}`,
            isactive: true,
        },
    });

    const hospital = await prisma.hospitals.create({
        data: {
            userid: hospUser.userid,
            hospitalname: `Apex Hospital ${suffix}`,
            registrationnumber: `HOSP-REG-${suffix}`,
            contactpersonname: "Dr. Sharma",
            contactpersonphone: "9876543210",
            address: "123 Medical Enclave",
            city: "Bhubaneswar",
            state: "Odisha",
            pincode: "751024",
            latitude: 20.2961,
            longitude: 85.8245,
            approvalstatus: "APPROVED",
        },
    });

    // 2. Seed Donor A (O_POSITIVE, Available, Eligible)
    const donorAUser = await prisma.users.create({
        data: {
            email: `donorA_${suffix}@swastya.org`,
            password: "Password@123",
            name: `Donor Alice ${suffix}`,
            role: user_role.DONOR,
            phonenumber: `91111111${suffix.slice(0, 2)}`,
            isactive: true,
        },
    });

    const donorA = await prisma.donors.create({
        data: {
            userid: donorAUser.userid,
            bloodgroup: blood_group.O_POSITIVE,
            dateofbirth: new Date("1995-05-15"),
            gender: "MALE",
            weight: 65,
            pincode: "751024",
            availabilitystatus: availability_status.AVAILABLE,
            iseligible: true,
            city: "Bhubaneswar",
            state: "Odisha",
            latitude: 20.3000,
            longitude: 85.8300,
        },
    });

    // 3. Seed Donor B (O_POSITIVE, Available, Eligible)
    const donorBUser = await prisma.users.create({
        data: {
            email: `donorB_${suffix}@swastya.org`,
            password: "Password@123",
            name: `Donor Bob ${suffix}`,
            role: user_role.DONOR,
            phonenumber: `92222222${suffix.slice(0, 2)}`,
            isactive: true,
        },
    });

    const donorB = await prisma.donors.create({
        data: {
            userid: donorBUser.userid,
            bloodgroup: blood_group.O_POSITIVE,
            dateofbirth: new Date("1995-05-15"),
            gender: "MALE",
            weight: 68,
            pincode: "751024",
            availabilitystatus: availability_status.AVAILABLE,
            iseligible: true,
            city: "Bhubaneswar",
            state: "Odisha",
            latitude: 20.3100,
            longitude: 85.8400,
        },
    });

    // 4. Create Blood Request R1
    const request1 = await prisma.bloodrequests.create({
        data: {
            createdbyuserid: hospUser.userid,
            hospitalid: hospital.hospitalid,
            patientname: `Patient John ${suffix}`,
            patientage: 45,
            patientgender: "MALE",
            patientcontact: "9876500000",
            bloodgroup: blood_group.O_POSITIVE,
            bloodcomponent: blood_component.RBC,
            unitsrequired: 2,
            urgencylevel: urgency_level.CRITICAL,
            isemergency: true,
            searchradius: 15,
            latitude: 20.2961,
            longitude: 85.8245,
            requiredby: new Date(Date.now() + 86400000),
            status: "DONOR_MATCHING",
        },
    });

    // Create prescription record
    await prisma.prescription.create({
        data: {
            requestid: request1.requestid,
            hospitalname: hospital.hospitalname,
            doctorname: "Dr. Sharma",
            status: "VERIFIED",
            fileurl: "/uploads/prescriptions/mock.pdf",
        },
    });

    // Generate JWT auth tokens
    const tokenDonorA = generateToken(donorAUser.userid, donorAUser.role);
    const tokenDonorB = generateToken(donorBUser.userid, donorBUser.role);

    // Spin up local HTTP server
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        console.log("--- TEST PHASE 1: BROADCAST EXCLUSIVELY TO DONOR A ---");
        // Create emergency broadcast container
        const broadcast1 = await prisma.emergencybroadcasts.create({
            data: {
                requestid: request1.requestid,
                triggeredbyuserid: hospUser.userid,
                triggertype: "MANUAL_TRIGGER",
                triggerreason: "Emergency broadcast to matched donor A",
                radiuskm: 15,
                status: "ACTIVE",
                totalmatched: 1,
                totalnotified: 1,
            },
        });

        // Delivery specifically to Donor A
        const deliveryA = await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: broadcast1.broadcastid,
                requestid: request1.requestid,
                donorid: donorA.donorid,
                donoruserid: donorAUser.userid,
                matchtype: "COORDINATES",
                distancekm: 1.2,
                deliverystatus: "DELIVERED",
                attemptcount: 1,
            },
        });
        assert(Boolean(deliveryA.deliveryid), "1. Broadcast delivery created exclusively for Donor A");

        console.log("\n--- TEST PHASE 2: VERIFY DONOR A VISIBILITY ---");
        const resA1 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorA}` },
        });
        const dataA1 = await resA1.json();
        assert(resA1.status === 200, "2.1 Donor A GET /matching-requests returns HTTP 200");
        assert(dataA1.success === true, "2.2 Donor A response has success: true");
        const foundA1 = (dataA1.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(Boolean(foundA1), "2.3 Donor A sees the broadcast request R1 in Blood Requests feed");
        assert(foundA1?.myCommitment?.deliveryId === deliveryA.deliveryid, "2.4 Donor A request payload contains deliveryId");
        assert(foundA1?.hasResponded === false, "2.5 Donor A request status is pending response (hasResponded: false)");

        console.log("\n--- TEST PHASE 3: VERIFY DONOR B PRIVACY (ISOLATION) ---");
        const resB1 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorB}` },
        });
        const dataB1 = await resB1.json();
        assert(resB1.status === 200, "3.1 Donor B GET /matching-requests returns HTTP 200");
        const foundB1 = (dataB1.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(!foundB1, "3.2 Donor B CANNOT see Request R1 broadcast exclusively to Donor A (Broadcast Privacy enforced)");

        console.log("\n--- TEST PHASE 4 & 5: BROADCAST TO BOTH DONORS ---");
        // Create delivery for Donor B
        const deliveryB = await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: broadcast1.broadcastid,
                requestid: request1.requestid,
                donorid: donorB.donorid,
                donoruserid: donorBUser.userid,
                matchtype: "COORDINATES",
                distancekm: 2.1,
                deliverystatus: "DELIVERED",
                attemptcount: 1,
            },
        });
        assert(Boolean(deliveryB.deliveryid), "4.1 Delivery created for Donor B on Request R1");

        const resB2 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorB}` },
        });
        const dataB2 = await resB2.json();
        const foundB2 = (dataB2.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(Boolean(foundB2), "5.1 Donor B now sees Request R1 after broadcast delivery");

        const resA2 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorA}` },
        });
        const dataA2 = await resA2.json();
        const foundA2 = (dataA2.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(Boolean(foundA2), "5.2 Donor A still sees Request R1 without duplication");
        const duplicatesA = (dataA2.requests || []).filter((r: any) => r.requestid === request1.requestid);
        assert(duplicatesA.length === 1, "5.3 No duplicate requests returned in feed");

        console.log("\n--- TEST PHASE 6: ACCEPT USING DONOR A ---");
        const acceptPayload = {
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
            estimatedArrival: "Within 1 hour",
            contactPhone: "9111111111",
            notes: "Ready to donate",
        };
        const resAcceptA = await fetch(`${baseUrl}/bloodrequests/${request1.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonorA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(acceptPayload),
        });
        const dataAcceptA = await resAcceptA.json();
        assert(resAcceptA.status === 200, "6.1 Donor A response submission returns HTTP 200");
        assert(dataAcceptA.success === true, "6.2 Donor A acceptance response has success: true");

        const resA3 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorA}` },
        });
        const dataA3 = await resA3.json();
        const foundA3 = (dataA3.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(foundA3?.hasResponded === true, "6.3 Donor A request status updated to hasResponded: true");
        assert(foundA3?.myCommitment?.response === "ACCEPTED", "6.4 Donor A commitment response is ACCEPTED");
        assert(foundA3?.myCommitment?.acceptanceStatus === "PENDING", "6.5 Donor A acceptanceStatus is PENDING hospital review");

        console.log("\n--- TEST PHASE 7: DECLINE USING DONOR B ---");
        const declinePayload = {
            action: "DECLINE",
            declineReason: "Currently traveling out of town",
        };
        const resDeclineB = await fetch(`${baseUrl}/bloodrequests/${request1.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonorB}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(declinePayload),
        });
        const dataDeclineB = await resDeclineB.json();
        assert(resDeclineB.status === 200, "7.1 Donor B decline returns HTTP 200 without requiring clinical screening");
        assert(dataDeclineB.success === true, "7.2 Donor B decline has success: true");
        assert(dataDeclineB.response === "DECLINED", "7.3 Donor B decline response indicates DECLINED");

        const resB3 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorB}` },
        });
        const dataB3 = await resB3.json();
        const foundB3 = (dataB3.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(foundB3?.isDeclined === true, "7.4 Donor B request status updated to isDeclined: true");
        assert(foundB3?.myCommitment?.response === "DECLINED", "7.5 Donor B commitment response is DECLINED");
        assert(foundB3?.myCommitment?.acceptanceStatus === "DECLINED", "7.6 Donor B commitment acceptanceStatus is DECLINED");

        console.log("\n--- TEST PHASE 8: PERSISTENCE AFTER REFRESH ---");
        // Donor A refresh
        const resA4 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorA}` },
        });
        const dataA4 = await resA4.json();
        const foundA4 = (dataA4.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(foundA4?.hasResponded === true, "8.1 Donor A ACCEPTED state persists on refresh");
        assert(foundA4?.myCommitment?.response === "ACCEPTED", "8.2 Donor A response remains ACCEPTED");

        // Donor B refresh
        const resB4 = await fetch(`${baseUrl}/donors/me/matching-requests`, {
            headers: { Authorization: `Bearer ${tokenDonorB}` },
        });
        const dataB4 = await resB4.json();
        const foundB4 = (dataB4.requests || []).find((r: any) => r.requestid === request1.requestid);
        assert(foundB4?.isDeclined === true, "8.3 Donor B DECLINED state persists on refresh");
        assert(foundB4?.myCommitment?.response === "DECLINED", "8.4 Donor B response remains DECLINED");

        console.log("\n--- TEST PHASE 9: PREVENT DUPLICATE OR CONFLICTING RESPONSES ---");
        // Donor A attempts duplicate acceptance
        const resDupA = await fetch(`${baseUrl}/bloodrequests/${request1.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonorA}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(acceptPayload),
        });
        assert(resDupA.status === 400, "9.1 Donor A duplicate volunteer returns HTTP 400");
        const dataDupA = await resDupA.json();
        assert(dataDupA.message.includes("already volunteered"), "9.2 Error message identifies duplicate volunteer");

        // Donor B attempts duplicate decline
        const resDupB = await fetch(`${baseUrl}/bloodrequests/${request1.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonorB}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(declinePayload),
        });
        assert(resDupB.status === 400, "9.3 Donor B duplicate decline returns HTTP 400");
        const dataDupB = await resDupB.json();
        assert(dataDupB.message.includes("already declined"), "9.4 Error message identifies duplicate decline");

        // Donor B attempts to accept after declining
        const resConflictB = await fetch(`${baseUrl}/bloodrequests/${request1.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonorB}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(acceptPayload),
        });
        assert(resConflictB.status === 400, "9.5 Conflicting response (accept after decline) rejected with HTTP 400");

        console.log("\n--- TEST PHASE 10: CLINICAL SCREENING & ELIGIBILITY INTEGRITY ---");
        // Clinical questionnaire enforcement: invalid/missing questions rejected when accepting
        const badScreeningPayload = {
            screeningAnswers: {
                drinksAlcohol: true,
                alcoholInPast24Hours: true, // Should fail clinical safety
                feelingHealthy: true,
                recentAntibioticsOrMedication: false,
                recentTattooOrSurgery: false,
                donatedInLast90Days: false,
                chronicIllness: false,
                isPregnantOrBreastfeeding: false,
            },
        };
        // Create fresh donor C and fresh request R2
        const donorCUser = await prisma.users.create({
            data: {
                email: `donorC_${suffix}@swastya.org`,
                password: "Password@123",
                name: `Donor Charlie ${suffix}`,
                role: user_role.DONOR,
                phonenumber: `93333333${suffix.slice(0, 2)}`,
                isactive: true,
            },
        });
        const donorC = await prisma.donors.create({
            data: {
                userid: donorCUser.userid,
                bloodgroup: blood_group.O_POSITIVE,
                dateofbirth: new Date("1995-05-15"),
                gender: "MALE",
                weight: 70,
                pincode: "751024",
                availabilitystatus: availability_status.AVAILABLE,
                iseligible: true,
                city: "Bhubaneswar",
                state: "Odisha",
            },
        });
        const tokenDonorC = generateToken(donorCUser.userid, donorCUser.role);

        const request2 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospUser.userid,
                hospitalid: hospital.hospitalid,
                patientname: `Patient Mary ${suffix}`,
                patientage: 30,
                patientgender: "FEMALE",
                patientcontact: "9876500001",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: urgency_level.HIGH,
                isemergency: true,
                searchradius: 10,
                requiredby: new Date(Date.now() + 86400000),
                status: "DONOR_MATCHING",
            },
        });

        const resScreeningFail = await fetch(`${baseUrl}/bloodrequests/${request2.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonorC}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(badScreeningPayload),
        });
        assert(resScreeningFail.status === 400, "10.1 Clinical ineligibility (alcohol in past 24h) rejected with HTTP 400");
        const dataScreeningFail = await resScreeningFail.json();
        assert(dataScreeningFail.ineligibilityReason === "ALCOHOL_PAST_24_HOURS", "10.2 Ineligibility reason is ALCOHOL_PAST_24_HOURS");

        // Ineligible donor cooldown check
        await prisma.donors.update({
            where: { donorid: donorC.donorid },
            data: { availabilitystatus: availability_status.TEMPORARILY_UNAVAILABLE },
        });
        const resAvailFail = await fetch(`${baseUrl}/bloodrequests/${request2.requestid}/respond`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${tokenDonorC}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(acceptPayload),
        });
        assert(resAvailFail.status === 400, "10.3 Unavailable donor rejected from volunteering");

    } finally {
        server.close();
        console.log("\n===============================================================================");
        console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
        console.log("===============================================================================");
    }
}

runBroadcastVisibilityTestSuite()
    .catch((err) => {
        console.error("Test Suite Fatal Error:", err);
        process.exit(1);
    })
    .finally(() => {
        prisma.$disconnect();
    });
