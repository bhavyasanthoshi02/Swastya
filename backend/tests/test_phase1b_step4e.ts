import http from "http";
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
    availability_status,
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
    return { status: res.status, data: json };
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

        console.log(`\n=== SWASTYA PHASE 1B STEP 4E: MULTI-VOLUNTEER TRANSIT DISAMBIGUATION TESTS (${API_BASE}) ===\n`);

        const pwHash = await bcrypt.hash("Step4ePass!123", 10);

        const admin = await prisma.users.create({
            data: { name: "4E Admin", email: `4e_admin_${ts}@swastya.test`, password: pwHash, role: user_role.ADMIN, phonenumber: "9100000001", isactive: true },
        });
        createdUserIds.push(admin.userid);

        const hospUser = await prisma.users.create({
            data: { name: "4E Hosp", email: `4e_hosp_${ts}@swastya.test`, password: pwHash, role: user_role.HOSPITAL, phonenumber: "9100000002", isactive: true },
        });
        createdUserIds.push(hospUser.userid);
        const hosp = await prisma.hospitals.create({
            data: {
                userid: hospUser.userid,
                hospitalname: "4E Medical Center",
                registrationnumber: `4E-HOSP-${ts}`,
                contactpersonname: "Dr 4E",
                contactpersonphone: "9100000002",
                address: "100 Clinical Way",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.APPROVED,
            },
        });

        const otherHospUser = await prisma.users.create({
            data: { name: "4E Other Hosp", email: `4e_ohosp_${ts}@swastya.test`, password: pwHash, role: user_role.HOSPITAL, phonenumber: "9100000003", isactive: true },
        });
        createdUserIds.push(otherHospUser.userid);
        await prisma.hospitals.create({
            data: {
                userid: otherHospUser.userid,
                hospitalname: "Other Center",
                registrationnumber: `4E-OHOSP-${ts}`,
                contactpersonname: "Dr Other",
                contactpersonphone: "9100000003",
                address: "200 Other Way",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                approvalstatus: approval_status.APPROVED,
            },
        });

        const reqUser = await prisma.users.create({
            data: { name: "4E Requester", email: `4e_req_${ts}@swastya.test`, password: pwHash, role: user_role.REQUESTER, phonenumber: "9100000004", isactive: true },
        });
        createdUserIds.push(reqUser.userid);
        const reqProfile = await prisma.requesters.create({
            data: { userid: reqUser.userid, address: "Req Addr", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
        });

        const otherReqUser = await prisma.users.create({
            data: { name: "4E Other Req", email: `4e_oreq_${ts}@swastya.test`, password: pwHash, role: user_role.REQUESTER, phonenumber: "9100000005", isactive: true },
        });
        createdUserIds.push(otherReqUser.userid);

        const donor1User = await prisma.users.create({
            data: { name: "4E Donor One", email: `4e_d1_${ts}@swastya.test`, password: pwHash, role: user_role.DONOR, phonenumber: "9100000006", isactive: true },
        });
        createdUserIds.push(donor1User.userid);
        const donor1 = await prisma.donors.create({
            data: {
                userid: donor1User.userid,
                bloodgroup: blood_group.O_POSITIVE,
                dateofbirth: new Date("1994-01-01"),
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                availabilitystatus: availability_status.AVAILABLE,
                iseligible: true,
            },
        });

        const donor2User = await prisma.users.create({
            data: { name: "4E Donor Two", email: `4e_d2_${ts}@swastya.test`, password: pwHash, role: user_role.DONOR, phonenumber: "9100000007", isactive: true },
        });
        createdUserIds.push(donor2User.userid);
        const donor2 = await prisma.donors.create({
            data: {
                userid: donor2User.userid,
                bloodgroup: blood_group.O_POSITIVE,
                dateofbirth: new Date("1993-01-01"),
                gender: "FEMALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                availabilitystatus: availability_status.AVAILABLE,
                iseligible: true,
            },
        });

        const uncommittedDonorUser = await prisma.users.create({
            data: { name: "4E Uncommitted", email: `4e_d3_${ts}@swastya.test`, password: pwHash, role: user_role.DONOR, phonenumber: "9100000008", isactive: true },
        });
        createdUserIds.push(uncommittedDonorUser.userid);
        await prisma.donors.create({
            data: {
                userid: uncommittedDonorUser.userid,
                bloodgroup: blood_group.O_POSITIVE,
                dateofbirth: new Date("1992-01-01"),
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560001",
                availabilitystatus: availability_status.AVAILABLE,
                iseligible: true,
            },
        });

        const adminToken = generateToken(admin.userid, admin.role);
        const hospToken = generateToken(hospUser.userid, hospUser.role);
        const otherHospToken = generateToken(otherHospUser.userid, otherHospUser.role);
        const reqToken = generateToken(reqUser.userid, reqUser.role);
        const otherReqToken = generateToken(otherReqUser.userid, otherReqUser.role);
        const donor1Token = generateToken(donor1User.userid, donor1User.role);
        const donor2Token = generateToken(donor2User.userid, donor2User.role);
        const uncommittedToken = generateToken(uncommittedDonorUser.userid, uncommittedDonorUser.role);

        // Request A: Single-donor test
        const reqA = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: reqProfile.requesterid,
                hospitalid: hosp.hospitalid,
                patientname: "Single Donor Patient",
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9999999991",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 2,
                urgencylevel: urgency_level.HIGH,
                requiredby: new Date(Date.now() + 86400 * 1000),
                status: request_status.VERIFIED,
            },
        });
        createdRequestIds.push(reqA.requestid);
        await prisma.prescription.create({
            data: {
                requestid: reqA.requestid,
                fileurl: "/uploads/prescriptions/rx-4e-a.pdf",
                doctorname: "Dr 4E",
                hospitalname: "4E Medical Center",
                status: prescription_status.VERIFIED,
            },
        });

        const bcastA = await prisma.emergencybroadcasts.create({
            data: {
                requestid: reqA.requestid,
                triggeredbyuserid: reqUser.userid,
                triggertype: "REQUEST_CREATION",
                radiuskm: 10,
                status: "ACTIVE",
            },
        });

        const delA1 = await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bcastA.broadcastid,
                requestid: reqA.requestid,
                donorid: donor1.donorid,
                donoruserid: donor1User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(Date.now() - 60000),
                transitstatus: "DONOR_FOUND",
            },
        });

        // 1. Single eligible donor: hospital omitting donorUserId preserves existing safe behavior
        const singleUpdate = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "STARTED" },
            hospToken
        );
        const delA1After = await prisma.broadcastdeliveries.findUnique({ where: { deliveryid: delA1.deliveryid } });
        assert(
            singleUpdate.status === 200 &&
                singleUpdate.data?.donorUserId === donor1User.userid &&
                delA1After?.transitstatus === "STARTED",
            "1. Single eligible donor: omitting donorUserId preserves safe behavior",
            `status=${singleUpdate.status}, transit=${delA1After?.transitstatus}`
        );

        // Add Donor 2 to Request A -> now 2 eligible donors exist
        const delA2 = await prisma.broadcastdeliveries.create({
            data: {
                broadcastid: bcastA.broadcastid,
                requestid: reqA.requestid,
                donorid: donor2.donorid,
                donoruserid: donor2User.userid,
                matchtype: "DIRECT_VOLUNTEER",
                deliverystatus: "RESPONDED",
                response: "ACCEPTED",
                respondedat: new Date(),
                transitstatus: "DONOR_FOUND",
            },
        });

        // 2. Multiple eligible donors with no donorUserId -> HTTP 400
        const ambigHosp = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "REACHED_LOCATION" },
            hospToken
        );
        const ambigAdmin = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "REACHED_LOCATION" },
            adminToken
        );
        const ambigReq = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "REACHED_LOCATION" },
            reqToken
        );
        assert(
            ambigHosp.status === 400 && ambigAdmin.status === 400 && ambigReq.status === 403,
            "2. Multiple eligible donors without donorUserId rejected with HTTP 400 for hospital/admin and 403 for requester",
            `statuses=${ambigHosp.status},${ambigAdmin.status},${ambigReq.status}`
        );

        // 3 & 6. Multiple eligible donors with explicit valid donorUserId -> updates ONLY that donor (even with no notification metadata)
        const targetDonor2 = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "STARTED", donorUserId: donor2User.userid },
            hospToken
        );
        const d1Check = await prisma.broadcastdeliveries.findUnique({ where: { deliveryid: delA1.deliveryid } });
        const d2Check = await prisma.broadcastdeliveries.findUnique({ where: { deliveryid: delA2.deliveryid } });
        assert(
            targetDonor2.status === 200 &&
                targetDonor2.data?.donorUserId === donor2User.userid &&
                d2Check?.transitstatus === "STARTED" &&
                d1Check?.transitstatus === "STARTED", // d1 remained at its prior STARTED state, untouched by d2's update
            "3. Explicit donorUserId updates only target donor without altering other donor"
        );

        // Verify updating donor 1 to REACHED_LOCATION does not alter donor 2
        const targetDonor1 = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "REACHED_LOCATION", donorUserId: donor1User.userid },
            hospToken
        );
        const d1AfterReach = await prisma.broadcastdeliveries.findUnique({ where: { deliveryid: delA1.deliveryid } });
        const d2AfterReach = await prisma.broadcastdeliveries.findUnique({ where: { deliveryid: delA2.deliveryid } });
        assert(
            targetDonor1.status === 200 &&
                d1AfterReach?.transitstatus === "REACHED_LOCATION" &&
                d2AfterReach?.transitstatus === "STARTED",
            "6. Updating Donor 1 to REACHED_LOCATION leaves Donor 2 at STARTED"
        );

        // 4. Invalid or unrelated donorUserId rejected safely
        const badUuid = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "STARTED", donorUserId: "not-a-uuid" },
            hospToken
        );
        assert(badUuid.status === 400, "4a. Invalid donorUserId format rejected with 400", `got ${badUuid.status}`);

        const unrelatedDonor = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "STARTED", donorUserId: uncommittedDonorUser.userid },
            hospToken
        );
        assert(unrelatedDonor.status === 404, "4b. Unrelated donorUserId without commitment rejected with 404", `got ${unrelatedDonor.status}`);

        // 5. Donor without an eligible commitment cannot update transit
        const uncommittedSelf = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "STARTED" },
            uncommittedToken
        );
        assert(uncommittedSelf.status === 404, "5. Donor without eligible commitment rejected with 404", `got ${uncommittedSelf.status}`);

        // 8. Authorization & ownership checks remain intact
        const unauthHosp = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "STARTED", donorUserId: donor1User.userid },
            otherHospToken
        );
        const unauthReq = await reqJson(
            "PATCH",
            `/bloodrequests/${reqA.requestid}/transit-status`,
            { status: "STARTED", donorUserId: donor1User.userid },
            otherReqToken
        );
        assert(
            unauthHosp.status === 403 && unauthReq.status === 403,
            "8. Non-owning hospital and non-owning requester rejected with 403",
            `got ${unauthHosp.status},${unauthReq.status}`
        );

        // 9. Concurrent distinct donor updates serialize cleanly on request row lock
        const [conc1, conc2] = await Promise.all([
            reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "REACHED_LOCATION", donorUserId: donor2User.userid }, donor2Token),
            reqJson("PATCH", `/bloodrequests/${reqA.requestid}/transit-status`, { status: "COMPLETED", donorUserId: donor1User.userid }, hospToken),
        ]);
        const d1Final = await prisma.broadcastdeliveries.findUnique({ where: { deliveryid: delA1.deliveryid } });
        const d2Final = await prisma.broadcastdeliveries.findUnique({ where: { deliveryid: delA2.deliveryid } });
        assert(
            conc1.status === 200 &&
                conc2.status === 200 &&
                d1Final?.transitstatus === "COMPLETED" &&
                d2Final?.transitstatus === "REACHED_LOCATION",
            "9. Concurrent updates target respective donor deliveries without cross-contamination"
        );

        // 7. Terminal request remains protected
        const termReq = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqUser.userid,
                requesterid: reqProfile.requesterid,
                hospitalid: hosp.hospitalid,
                patientname: "Cancelled Patient",
                patientage: 45,
                patientgender: "FEMALE",
                patientcontact: "9999999992",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: urgency_level.HIGH,
                requiredby: new Date(Date.now() + 86400 * 1000),
                status: request_status.CANCELLED,
            },
        });
        createdRequestIds.push(termReq.requestid);
        const termUpdate = await reqJson(
            "PATCH",
            `/bloodrequests/${termReq.requestid}/transit-status`,
            { status: "STARTED", donorUserId: donor1User.userid },
            hospToken
        );
        assert(termUpdate.status === 400, "7. Terminal CANCELLED request remains protected (400)", `got ${termUpdate.status}`);

        console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
        if (failed > 0) process.exitCode = 1;
    } finally {
        if (createdRequestIds.length > 0) {
            await prisma.donationhistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.notification.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.requeststatushistory.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.prescription.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.broadcastdeliveries.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.emergencybroadcasts.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            await prisma.bloodrequests.deleteMany({ where: { requestid: { in: createdRequestIds } } });
        }
        if (createdUserIds.length > 0) {
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
