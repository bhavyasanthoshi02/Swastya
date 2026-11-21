import dotenv from "dotenv";
import path from "path";
import http from "http";
import crypto from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/Swastya(\?|$)/i, "/swastya_test$1");
}

import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, user_role } from "../src/generated/prisma/enums";

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

const ALL_NON_REACTIVE_PANEL = {
    hivResult: "NON_REACTIVE",
    hbvResult: "NON_REACTIVE",
    hcvResult: "NON_REACTIVE",
    syphilisResult: "NON_REACTIVE",
    malariaResult: "NON_REACTIVE",
};

async function runTests() {
    console.log("===============================================================================");
    console.log("  AUD-03: TRACEABILITY TENANT ISOLATION, LOCK ORDERING & CONCURRENCY RACES     ");
    console.log("===============================================================================\n");

    const { default: app } = await import("../src/app");
    const { prisma } = await import("../src/config/prisma");
    const { UnitTraceabilityService } = await import("../src/services/unitTraceability.service");

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

    const tag = `aud03_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    let barcodeSeq = 0;
    let expiryOffsetDays = 4500;
    const createdRequestIds: string[] = [];
    const createdHospitalIds: string[] = [];

    const reqJson = async (
        method: string,
        urlPath: string,
        body?: any,
        token?: string,
        extraHeaders?: Record<string, string>
    ) => {
        const headers: Record<string, string> = { ...(extraHeaders || {}) };
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

    try {
        // --- Seed Test Users & Facilities ---
        const [bbAUser, bbBUser, admin1User, admin2User, hospAUser, hospBUser] = await Promise.all([
            prisma.users.create({
                data: {
                    name: `AUD03 BloodBank A Owner ${tag}`,
                    email: `bba.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9840000101",
                    role: user_role.BLOOD_BANK,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD03 BloodBank B Owner ${tag}`,
                    email: `bbb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9840000102",
                    role: user_role.BLOOD_BANK,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD03 Clinical Verifier 1 ${tag}`,
                    email: `adm1.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9840000103",
                    role: user_role.ADMIN,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD03 Clinical Verifier 2 ${tag}`,
                    email: `adm2.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9840000104",
                    role: user_role.ADMIN,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD03 Hospital A Owner ${tag}`,
                    email: `hospa.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9840000105",
                    role: user_role.HOSPITAL,
                    isactive: true,
                    emailverified: true,
                },
            }),
            prisma.users.create({
                data: {
                    name: `AUD03 Hospital B Owner ${tag}`,
                    email: `hospb.${tag}@swastya.test`,
                    password: "TestPassword123!",
                    phonenumber: "9840000106",
                    role: user_role.HOSPITAL,
                    isactive: true,
                    emailverified: true,
                },
            }),
        ]);

        const [bbA, bbB, hospA, hospB] = await Promise.all([
            prisma.bloodbanks.create({
                data: {
                    userid: bbAUser.userid,
                    bloodbankname: `AUD03 Blood Bank A ${tag}`,
                    licensenumber: `LIC-BBA-${tag}`,
                    contactpersonname: "Dr. A",
                    contactpersonphone: "9840000101",
                    address: "Sector 1, Pune",
                    city: "Pune",
                    state: "Maharashtra",
                    pincode: "411001",
                    approvalstatus: "APPROVED",
                },
            }),
            prisma.bloodbanks.create({
                data: {
                    userid: bbBUser.userid,
                    bloodbankname: `AUD03 Blood Bank B ${tag}`,
                    licensenumber: `LIC-BBB-${tag}`,
                    contactpersonname: "Dr. B",
                    contactpersonphone: "9840000102",
                    address: "Sector 2, Pune",
                    city: "Pune",
                    state: "Maharashtra",
                    pincode: "411002",
                    approvalstatus: "APPROVED",
                },
            }),
            prisma.hospitals.create({
                data: {
                    userid: hospAUser.userid,
                    hospitalname: `AUD03 Hospital A ${tag}`,
                    registrationnumber: `REG-HOSPA-${tag}`,
                    contactpersonname: "Dr. Hosp A",
                    contactpersonphone: "9840000105",
                    address: "Hospital A Rd, Pune",
                    city: "Pune",
                    state: "Maharashtra",
                    pincode: "411003",
                    approvalstatus: "APPROVED",
                },
            }),
            prisma.hospitals.create({
                data: {
                    userid: hospBUser.userid,
                    hospitalname: `AUD03 Hospital B ${tag}`,
                    registrationnumber: `REG-HOSPB-${tag}`,
                    contactpersonname: "Dr. Hosp B",
                    contactpersonphone: "9840000106",
                    address: "Hospital B Rd, Pune",
                    city: "Pune",
                    state: "Maharashtra",
                    pincode: "411004",
                    approvalstatus: "APPROVED",
                },
            }),
        ]);
        createdHospitalIds.push(hospA.hospitalid, hospB.hospitalid);

        const bbAToken = generateToken(bbAUser.userid, user_role.BLOOD_BANK);
        const bbBToken = generateToken(bbBUser.userid, user_role.BLOOD_BANK);
        const hospAToken = generateToken(hospAUser.userid, user_role.HOSPITAL);
        const hospBToken = generateToken(hospBUser.userid, user_role.HOSPITAL);

        // Helper: create a QUARANTINED unit in a blood bank
        const createQuarantinedUnit = async (targetBbId: string, actorId: string) => {
            barcodeSeq++;
            expiryOffsetDays++;
            const bc = `BC-AUD03-${tag}-${barcodeSeq}`;
            const res = await UnitTraceabilityService.intakeUnits({
                bloodBankId: targetBbId,
                actorUserId: actorId,
                bloodGroup: blood_group.O_POSITIVE,
                bloodComponent: blood_component.RBC,
                collectionDate: new Date(Date.now() - 24 * 3600 * 1000),
                expiryDate: new Date(Date.now() + expiryOffsetDays * 24 * 3600 * 1000),
                units: [{ unitBarcode: bc }],
                idempotencyKey: `idem-intake-${tag}-${barcodeSeq}`,
                reason: "AUD-03 test unit intake",
            });
            return {
                unitId: res.units[0].unitId as string,
                inventoryId: res.lot.inventoryId as string,
                bagBarcode: bc,
            };
        };

        // Helper: create a verified AVAILABLE unit in a blood bank
        const createAvailableUnit = async (targetBbId: string, testerId: string, verifierId: string) => {
            const u = await createQuarantinedUnit(targetBbId, testerId);
            await UnitTraceabilityService.recordScreeningSubmission({
                unitId: u.unitId,
                bloodBankId: targetBbId,
                actorUserId: testerId,
                testedByUserId: testerId,
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
                laboratoryRemarks: "TTI clean",
            });
            await UnitTraceabilityService.verifyScreeningClearance({
                unitId: u.unitId,
                bloodBankId: targetBbId,
                verifierUserId: verifierId,
                laboratoryRemarks: "Independent verification pass",
            });
            return u;
        };

        // Helper: create a verified blood request for a hospital
        const createVerifiedBloodRequest = async (targetHospitalId: string, creatorUserId: string, unitsRequired = 1) => {
            const reqRow = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: creatorUserId,
                    hospitalid: targetHospitalId,
                    patientname: `Patient ${tag}`,
                    patientage: 40,
                    patientgender: "MALE",
                    patientcontact: "9840000199",
                    bloodgroup: blood_group.O_POSITIVE,
                    bloodcomponent: blood_component.RBC,
                    unitsrequired: unitsRequired,
                    urgencylevel: "CRITICAL",
                    requiredby: new Date(Date.now() + 24 * 3600 * 1000),
                    status: "VERIFIED",
                },
            });
            createdRequestIds.push(reqRow.requestid);
            return reqRow;
        };

        // Helper: create an accepted requisition assignment + reservation with allocated unit(s)
        const createAllocatedReservation = async (
            targetBbId: string,
            bbActorId: string,
            targetHospitalId: string,
            hospActorId: string,
            unitCount = 1
        ) => {
            const units = [];
            for (let i = 0; i < unitCount; i++) {
                units.push(await createAvailableUnit(targetBbId, bbActorId, admin1User.userid));
            }
            const reqRow = await createVerifiedBloodRequest(targetHospitalId, hospActorId, unitCount);
            const assignRes = await UnitTraceabilityService.assignRequisition(
                reqRow.requestid,
                targetBbId,
                hospActorId,
                targetHospitalId
            );
            await UnitTraceabilityService.respondToAssignment(
                assignRes.assignment.assignmentid,
                targetBbId,
                bbActorId,
                "ACCEPT"
            );
            const allocRes = await UnitTraceabilityService.allocateReservation({
                requestId: reqRow.requestid,
                bloodBankId: targetBbId,
                actorUserId: bbActorId,
                requestedUnits: unitCount,
                specificUnitIds: units.map((u) => u.unitId),
                idempotencyKey: `idem-alloc-${tag}-${crypto.randomUUID()}`,
            });
            const reservationId = allocRes.reservation.reservationId as string;
            const items = await prisma.reservationitems.findMany({
                where: { reservationid: reservationId },
                orderBy: { unitid: "asc" },
            });
            return {
                request: reqRow,
                assignmentId: assignRes.assignment.assignmentid,
                reservationId,
                items,
                units,
            };
        };

        // =========================================================================
        // SECTION 1: CROSS-TENANT ISOLATION ACROSS ALL 7 METHODS
        // =========================================================================
        console.log("--- Section 1: Cross-Tenant Isolation Across All 7 Methods ---");

        // 1.1 recordScreeningSubmission & verifyScreeningClearance cross-tenant isolation
        const unitBbA_S1 = await createQuarantinedUnit(bbA.bloodbankid, bbAUser.userid);

        // HTTP route: bbB tries to submit screening on bbA's unit via bbB's URL
        const s1HttpSub = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/units/${unitBbA_S1.unitId}/screening`,
            {
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
            },
            bbBToken
        );
        assert(
            s1HttpSub.status === 403,
            "1.1a HTTP POST /bloodbanks/:bbB/units/:unitA/screening by BloodBank B rejected with 403 Forbidden",
            `status=${s1HttpSub.status}, msg=${s1HttpSub.data?.message}`
        );

        // Direct service call: bbB tries to submit screening on bbA's unit
        let s1SvcSubErr: any = null;
        try {
            await UnitTraceabilityService.recordScreeningSubmission({
                unitId: unitBbA_S1.unitId,
                bloodBankId: bbB.bloodbankid,
                actorUserId: bbBUser.userid,
                testedByUserId: bbBUser.userid,
                ...ALL_NON_REACTIVE_PANEL,
                overallStatus: "PASSED",
            });
        } catch (e: any) {
            s1SvcSubErr = e;
        }
        assert(
            s1SvcSubErr !== null && s1SvcSubErr.statusCode === 403,
            "1.1b Direct UnitTraceabilityService.recordScreeningSubmission with foreign bloodBankId rejected with 403",
            `statusCode=${s1SvcSubErr?.statusCode}, msg=${s1SvcSubErr?.message}`
        );

        // Now bbA legitimately submits screening on unitBbA_S1, then bbB attempts to verify it
        await UnitTraceabilityService.recordScreeningSubmission({
            unitId: unitBbA_S1.unitId,
            bloodBankId: bbA.bloodbankid,
            actorUserId: bbAUser.userid,
            testedByUserId: bbAUser.userid,
            ...ALL_NON_REACTIVE_PANEL,
            overallStatus: "PASSED",
        });

        const s1HttpVer = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/units/${unitBbA_S1.unitId}/screening/verify`,
            { laboratoryRemarks: "Cross-tenant verify attempt" },
            bbBToken
        );
        assert(
            s1HttpVer.status === 403,
            "1.1c HTTP POST /bloodbanks/:bbB/units/:unitA/screening/verify by BloodBank B rejected with 403 Forbidden",
            `status=${s1HttpVer.status}`
        );

        let s1SvcVerErr: any = null;
        try {
            await UnitTraceabilityService.verifyScreeningClearance({
                unitId: unitBbA_S1.unitId,
                bloodBankId: bbB.bloodbankid,
                verifierUserId: admin1User.userid,
            });
        } catch (e: any) {
            s1SvcVerErr = e;
        }
        assert(
            s1SvcVerErr !== null && s1SvcVerErr.statusCode === 403,
            "1.1d Direct UnitTraceabilityService.verifyScreeningClearance with foreign bloodBankId rejected with 403",
            `statusCode=${s1SvcVerErr?.statusCode}`
        );

        const unitBbA_S1After = await prisma.inventoryunits.findUnique({ where: { unitid: unitBbA_S1.unitId } });
        assert(
            unitBbA_S1After?.status === "QUARANTINED",
            "1.1e Unit in BloodBank A remains QUARANTINED and unmodified after cross-tenant screening/verify attempts"
        );

        // 1.2 assignRequisition cross-tenant isolation (Hospital B attacking Hospital A's request)
        const reqHospA_S1 = await createVerifiedBloodRequest(hospA.hospitalid, hospAUser.userid, 1);

        const s1HttpAssign = await reqJson(
            "POST",
            `/bloodrequests/${reqHospA_S1.requestid}/assign`,
            { bloodBankId: bbB.bloodbankid },
            hospBToken
        );
        assert(
            s1HttpAssign.status === 403,
            "1.2a HTTP POST /bloodrequests/:reqA/assign by Hospital B rejected with 403 Forbidden",
            `status=${s1HttpAssign.status}`
        );

        let s1SvcAssignErr: any = null;
        try {
            await UnitTraceabilityService.assignRequisition(
                reqHospA_S1.requestid,
                bbB.bloodbankid,
                hospBUser.userid,
                hospB.hospitalid
            );
        } catch (e: any) {
            s1SvcAssignErr = e;
        }
        assert(
            s1SvcAssignErr !== null && s1SvcAssignErr.statusCode === 403,
            "1.2b Direct UnitTraceabilityService.assignRequisition by Hospital B on Hospital A's request rejected with 403",
            `statusCode=${s1SvcAssignErr?.statusCode}, msg=${s1SvcAssignErr?.message}`
        );

        const assignCountS1 = await prisma.requisitionassignments.count({
            where: { requestid: reqHospA_S1.requestid },
        });
        assert(assignCountS1 === 0, "1.2c Zero requisitionassignments created after cross-tenant assignRequisition attempts");

        // 1.3 recordCrossmatch cross-tenant isolation (BloodBank B attacking BloodBank A's reservation item)
        const allocBbA_S1 = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );
        const itemBbA_S1 = allocBbA_S1.items[0];

        const s1HttpCm = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/crossmatches`,
            {
                reservationItemId: itemBbA_S1.itemid,
                testedByUserId: bbBUser.userid,
                verifiedByUserId: admin1User.userid,
                methodology: "INDIRECT_ANTIGLOBULIN",
                testResult: "COMPATIBLE",
            },
            bbBToken
        );
        assert(
            s1HttpCm.status === 403,
            "1.3a HTTP POST /bloodbanks/:bbB/crossmatches on BloodBank A item by BloodBank B rejected with 403 Forbidden",
            `status=${s1HttpCm.status}, msg=${s1HttpCm.data?.message}`
        );

        let s1SvcCmErr: any = null;
        try {
            await UnitTraceabilityService.recordCrossmatch({
                reservationItemId: itemBbA_S1.itemid,
                bloodBankId: bbB.bloodbankid,
                actorUserId: bbBUser.userid,
                testedByUserId: bbBUser.userid,
                verifiedByUserId: admin1User.userid,
                methodology: "INDIRECT_ANTIGLOBULIN",
                testResult: "COMPATIBLE",
            });
        } catch (e: any) {
            s1SvcCmErr = e;
        }
        assert(
            s1SvcCmErr !== null && s1SvcCmErr.statusCode === 403,
            "1.3b Direct UnitTraceabilityService.recordCrossmatch with foreign bloodBankId rejected with 403",
            `statusCode=${s1SvcCmErr?.statusCode}, msg=${s1SvcCmErr?.message}`
        );

        const itemBbA_S1AfterCm = await prisma.reservationitems.findUnique({ where: { itemid: itemBbA_S1.itemid } });
        assert(
            itemBbA_S1AfterCm?.itemstatus === "RESERVED",
            "1.3c BloodBank A reservation item remains RESERVED with zero crossmatch records after cross-tenant attempt"
        );

        // 1.4 cancelReservation cross-tenant isolation (BloodBank B attacking BloodBank A's reservation)
        const s1HttpCancel = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/reservations/${allocBbA_S1.reservationId}/cancel`,
            { reason: "Malicious cross-tenant cancel" },
            bbBToken,
            { "Idempotency-Key": `idem-s1-cancel-${tag}` }
        );
        assert(
            s1HttpCancel.status === 403,
            "1.4a HTTP POST /bloodbanks/:bbB/reservations/:resA/cancel by BloodBank B rejected with 403 Forbidden",
            `status=${s1HttpCancel.status}, msg=${s1HttpCancel.data?.message}`
        );

        let s1SvcCancelErr: any = null;
        try {
            await UnitTraceabilityService.cancelReservation(
                allocBbA_S1.reservationId,
                bbBUser.userid,
                "Malicious direct service cancel",
                `idem-s1-cancel-svc-${tag}`,
                bbB.bloodbankid
            );
        } catch (e: any) {
            s1SvcCancelErr = e;
        }
        assert(
            s1SvcCancelErr !== null && s1SvcCancelErr.statusCode === 403,
            "1.4b Direct UnitTraceabilityService.cancelReservation with foreign bloodBankId rejected with 403",
            `statusCode=${s1SvcCancelErr?.statusCode}, msg=${s1SvcCancelErr?.message}`
        );

        // 1.5 dispatchReservation cross-tenant isolation (BloodBank B attacking BloodBank A's prepared reservation)
        // First, BloodBank A legitimately crossmatches itemBbA_S1 so item is PREPARED
        await UnitTraceabilityService.recordCrossmatch({
            reservationItemId: itemBbA_S1.itemid,
            bloodBankId: bbA.bloodbankid,
            actorUserId: bbAUser.userid,
            testedByUserId: bbAUser.userid,
            verifiedByUserId: admin1User.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
        });

        const s1HttpDispatch = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/reservations/${allocBbA_S1.reservationId}/dispatch`,
            {
                courierName: "Attacker Courier",
                coldBoxSealNumber: "SEAL-ATK-1",
                initialTemperature: 4.0,
            },
            bbBToken,
            { "Idempotency-Key": `idem-s1-disp-${tag}` }
        );
        assert(
            s1HttpDispatch.status === 403,
            "1.5a HTTP POST /bloodbanks/:bbB/reservations/:resA/dispatch by BloodBank B rejected with 403 Forbidden",
            `status=${s1HttpDispatch.status}, msg=${s1HttpDispatch.data?.message}`
        );

        let s1SvcDispatchErr: any = null;
        try {
            await UnitTraceabilityService.dispatchReservation({
                reservationId: allocBbA_S1.reservationId,
                bloodBankId: bbB.bloodbankid,
                actorUserId: bbBUser.userid,
                courierName: "Attacker Courier",
                coldBoxSealNumber: "SEAL-ATK-2",
                initialTemperature: 4.0,
                idempotencyKey: `idem-s1-disp-svc-${tag}`,
            });
        } catch (e: any) {
            s1SvcDispatchErr = e;
        }
        assert(
            s1SvcDispatchErr !== null && s1SvcDispatchErr.statusCode === 403,
            "1.5b Direct UnitTraceabilityService.dispatchReservation with foreign bloodBankId rejected with 403",
            `statusCode=${s1SvcDispatchErr?.statusCode}, msg=${s1SvcDispatchErr?.message}`
        );

        const resBbA_S1AfterDisp = await prisma.bloodreservations.findUnique({
            where: { reservationid: allocBbA_S1.reservationId },
        });
        assert(
            resBbA_S1AfterDisp?.reservationstatus === "ACTIVE" || resBbA_S1AfterDisp?.reservationstatus === "PREPARED",
            "1.5c BloodBank A reservation remains undelivered/undispatched after cross-tenant dispatch & cancel attempts"
        );

        // 1.6 confirmHospitalReceipt cross-tenant isolation (Hospital B attacking Hospital A's dispatched reservation)
        await UnitTraceabilityService.dispatchReservation({
            reservationId: allocBbA_S1.reservationId,
            bloodBankId: bbA.bloodbankid,
            actorUserId: bbAUser.userid,
            courierName: "Legit BBA Courier",
            coldBoxSealNumber: "SEAL-BBA-1",
            initialTemperature: 4.0,
            idempotencyKey: `idem-s1-legit-disp-${tag}`,
        });

        const s1HttpReceipt = await reqJson(
            "POST",
            `/bloodrequests/reservations/${allocBbA_S1.reservationId}/receipt`,
            {
                itemReceipts: [{ itemId: itemBbA_S1.itemid, receivedStatus: "ACCEPTED", tempReading: 4.2 }],
            },
            hospBToken,
            { "Idempotency-Key": `idem-s1-rcpt-${tag}` }
        );
        assert(
            s1HttpReceipt.status === 403,
            "1.6a HTTP POST /bloodrequests/reservations/:resA/receipt by Hospital B rejected with 403 Forbidden",
            `status=${s1HttpReceipt.status}, msg=${s1HttpReceipt.data?.message}`
        );

        let s1SvcReceiptErr: any = null;
        try {
            await UnitTraceabilityService.confirmHospitalReceipt(
                allocBbA_S1.reservationId,
                hospBUser.userid,
                [{ itemId: itemBbA_S1.itemid, receivedStatus: "ACCEPTED", tempReading: 4.2 }],
                `idem-s1-rcpt-svc-${tag}`,
                hospB.hospitalid
            );
        } catch (e: any) {
            s1SvcReceiptErr = e;
        }
        assert(
            s1SvcReceiptErr !== null && s1SvcReceiptErr.statusCode === 403,
            "1.6b Direct UnitTraceabilityService.confirmHospitalReceipt by Hospital B on Hospital A's reservation rejected with 403",
            `statusCode=${s1SvcReceiptErr?.statusCode}, msg=${s1SvcReceiptErr?.message}`
        );

        const unitBbA_S1InTransit = await prisma.inventoryunits.findUnique({
            where: { unitid: itemBbA_S1.unitid },
        });
        assert(
            unitBbA_S1InTransit?.status === "IN_TRANSIT",
            "1.6c Dispatched unit remains IN_TRANSIT after cross-tenant confirmHospitalReceipt attempts"
        );

        // 1.7 discardUnit cross-tenant isolation (BloodBank B attacking BloodBank A's unit)
        const unitBbA_DiscardTarget = await createAvailableUnit(bbA.bloodbankid, bbAUser.userid, admin1User.userid);

        const s1HttpDiscard = await reqJson(
            "POST",
            `/bloodbanks/${bbB.bloodbankid}/units/${unitBbA_DiscardTarget.unitId}/discard`,
            { reason: "Cross-tenant malicious discard" },
            bbBToken
        );
        assert(
            s1HttpDiscard.status === 403,
            "1.7a HTTP POST /bloodbanks/:bbB/units/:unitA/discard by BloodBank B rejected with 403 Forbidden",
            `status=${s1HttpDiscard.status}, msg=${s1HttpDiscard.data?.message}`
        );

        let s1SvcDiscardErr: any = null;
        try {
            await UnitTraceabilityService.discardUnit(
                unitBbA_DiscardTarget.unitId,
                bbBUser.userid,
                "Cross-tenant direct service discard",
                bbB.bloodbankid
            );
        } catch (e: any) {
            s1SvcDiscardErr = e;
        }
        assert(
            s1SvcDiscardErr !== null && s1SvcDiscardErr.statusCode === 403,
            "1.7b Direct UnitTraceabilityService.discardUnit with foreign bloodBankId rejected with 403",
            `statusCode=${s1SvcDiscardErr?.statusCode}, msg=${s1SvcDiscardErr?.message}`
        );

        const unitBbA_DiscardAfter = await prisma.inventoryunits.findUnique({
            where: { unitid: unitBbA_DiscardTarget.unitId },
        });
        assert(
            unitBbA_DiscardAfter?.status === "AVAILABLE",
            "1.7c Target unit in BloodBank A remains AVAILABLE after cross-tenant discard attempts"
        );
        console.log("");

        // =========================================================================
        // SECTION 2: CONCURRENT DISPATCH & DISPATCH-VS-CANCELLATION RACES
        // =========================================================================
        console.log("--- Section 2: Concurrent Dispatch & Dispatch-vs-Cancellation Races ---");

        // 2.1 Concurrent dispatchReservation with different idempotency keys (prevent double-decrement)
        const allocS2_1 = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );
        await UnitTraceabilityService.recordCrossmatch({
            reservationItemId: allocS2_1.items[0].itemid,
            bloodBankId: bbA.bloodbankid,
            actorUserId: bbAUser.userid,
            testedByUserId: bbAUser.userid,
            verifiedByUserId: admin1User.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
        });

        const lotBeforeS2_1 = await prisma.inventory.findUnique({
            where: { inventoryid: allocS2_1.units[0].inventoryId },
        });

        const [dispRace1, dispRace2] = await Promise.all([
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS2_1.reservationId}/dispatch`,
                { courierName: "Courier 1", coldBoxSealNumber: "SEAL-S2-1A", initialTemperature: 4.0 },
                bbAToken,
                { "Idempotency-Key": `idem-s2-disp-1-${tag}` }
            ),
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS2_1.reservationId}/dispatch`,
                { courierName: "Courier 2", coldBoxSealNumber: "SEAL-S2-1B", initialTemperature: 4.1 },
                bbAToken,
                { "Idempotency-Key": `idem-s2-disp-2-${tag}` }
            ),
        ]);

        const dispStatuses = [dispRace1.status, dispRace2.status].sort((a, b) => a - b);
        assert(
            dispStatuses[0] === 200 && dispStatuses[1] === 409,
            "2.1a Two concurrent dispatch requests with distinct idempotency keys yield one 200 OK and one 409 Conflict",
            `statuses=${JSON.stringify(dispStatuses)}`
        );

        const lotAfterS2_1 = await prisma.inventory.findUnique({
            where: { inventoryid: allocS2_1.units[0].inventoryId },
        });
        assert(
            Number(lotBeforeS2_1?.unitsreserved) - Number(lotAfterS2_1?.unitsreserved) === 1,
            "2.1b Inventory lot unitsreserved decremented by exactly 1 (no double-decrement)",
            `before=${lotBeforeS2_1?.unitsreserved}, after=${lotAfterS2_1?.unitsreserved}`
        );

        const dispLedgerCount = await prisma.inventoryledger.count({
            where: {
                bloodbankid: bbA.bloodbankid,
                inventoryid: allocS2_1.units[0].inventoryId,
                operationtype: "DISPATCH_DEPARTURE",
            },
        });
        assert(
            dispLedgerCount === 1,
            "2.1c Exactly 1 DISPATCH_DEPARTURE ledger entry recorded for the reservation",
            `count=${dispLedgerCount}`
        );

        // 2.2 Concurrent dispatchReservation vs cancelReservation on the same PREPARED reservation
        const allocS2_2 = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );
        await UnitTraceabilityService.recordCrossmatch({
            reservationItemId: allocS2_2.items[0].itemid,
            bloodBankId: bbA.bloodbankid,
            actorUserId: bbAUser.userid,
            testedByUserId: bbAUser.userid,
            verifiedByUserId: admin1User.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
        });

        const [raceDisp, raceCancel] = await Promise.all([
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS2_2.reservationId}/dispatch`,
                { courierName: "Race Courier", coldBoxSealNumber: "SEAL-S2-2", initialTemperature: 3.8 },
                bbAToken,
                { "Idempotency-Key": `idem-s2-racedisp-${tag}` }
            ),
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS2_2.reservationId}/cancel`,
                { reason: "Concurrent cancellation race test" },
                bbAToken,
                { "Idempotency-Key": `idem-s2-racecancel-${tag}` }
            ),
        ]);

        const raceDispCancelStatuses = [raceDisp.status, raceCancel.status].sort((a, b) => a - b);
        assert(
            raceDispCancelStatuses[0] === 200 && (raceDispCancelStatuses[1] === 400 || raceDispCancelStatuses[1] === 409),
            "2.2a Concurrent dispatch vs cancel yields exactly one 200 OK and one controlled 400/409 rejection (never both 200 or 500)",
            `dispatch=${raceDisp.status}, cancel=${raceCancel.status}`
        );

        const resAfterS2_2 = await prisma.bloodreservations.findUnique({
            where: { reservationid: allocS2_2.reservationId },
        });
        const unitAfterS2_2 = await prisma.inventoryunits.findUnique({
            where: { unitid: allocS2_2.units[0].unitId },
        });
        if (raceDisp.status === 200) {
            assert(
                resAfterS2_2?.reservationstatus === "DISPATCHED" && unitAfterS2_2?.status === "IN_TRANSIT",
                "2.2b Winning dispatch leaves reservation DISPATCHED and unit IN_TRANSIT"
            );
        } else {
            assert(
                resAfterS2_2?.reservationstatus === "CANCELLED" && unitAfterS2_2?.status === "AVAILABLE",
                "2.2b Winning cancel leaves reservation CANCELLED and unit AVAILABLE"
            );
        }
        console.log("");

        // =========================================================================
        // SECTION 3: CONCURRENT CROSSMATCH & CROSSMATCH-VS-CANCELLATION RACES
        // =========================================================================
        console.log("--- Section 3: Concurrent Crossmatch & Crossmatch-vs-Cancellation Races ---");

        // 3.1 Two concurrent recordCrossmatch calls on the same reservationItemId
        const allocS3_1 = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );
        const itemS3_1 = allocS3_1.items[0];

        const [cmRace1, cmRace2] = await Promise.all([
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/crossmatches`,
                {
                    reservationItemId: itemS3_1.itemid,
                    testedByUserId: bbAUser.userid,
                    verifiedByUserId: admin1User.userid,
                    methodology: "INDIRECT_ANTIGLOBULIN",
                    testResult: "COMPATIBLE",
                },
                bbAToken
            ),
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/crossmatches`,
                {
                    reservationItemId: itemS3_1.itemid,
                    testedByUserId: bbAUser.userid,
                    verifiedByUserId: admin2User.userid,
                    methodology: "GEL_CARD",
                    testResult: "COMPATIBLE",
                },
                bbAToken
            ),
        ]);

        assert(
            cmRace1.status === 200 && cmRace2.status === 200,
            "3.1a Two concurrent crossmatch submissions serialize cleanly under row lock without P2002 500 error",
            `s1=${cmRace1.status}, s2=${cmRace2.status}`
        );

        const activeCmS3_1 = await prisma.clinicalcrossmatches.findMany({
            where: { reservationitemid: itemS3_1.itemid, iscurrent: true },
        });
        const allCmS3_1 = await prisma.clinicalcrossmatches.findMany({
            where: { reservationitemid: itemS3_1.itemid },
            orderBy: { attemptnumber: "asc" },
        });
        assert(
            allCmS3_1.length === 2 &&
                allCmS3_1[0].attemptnumber === 1 &&
                allCmS3_1[1].attemptnumber === 2 &&
                activeCmS3_1.length === 1,
            "3.1b Serialized crossmatches recorded attempt 1 and attempt 2 with exactly 1 current crossmatch",
            `attempts=${allCmS3_1.map((c) => c.attemptnumber).join(",")}, current=${activeCmS3_1.length}`
        );

        // 3.2 Concurrent recordCrossmatch vs cancelReservation
        const allocS3_2 = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );
        const itemS3_2 = allocS3_2.items[0];

        const [raceCm, raceCancelCm] = await Promise.all([
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/crossmatches`,
                {
                    reservationItemId: itemS3_2.itemid,
                    testedByUserId: bbAUser.userid,
                    verifiedByUserId: admin1User.userid,
                    methodology: "INDIRECT_ANTIGLOBULIN",
                    testResult: "COMPATIBLE",
                },
                bbAToken
            ),
            reqJson(
                "POST",
                `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS3_2.reservationId}/cancel`,
                { reason: "Cancel racing with crossmatch" },
                bbAToken,
                { "Idempotency-Key": `idem-s3-cmcancel-${tag}` }
            ),
        ]);

        assert(
            raceCancelCm.status === 200 && (raceCm.status === 200 || raceCm.status === 409),
            "3.2a Concurrent crossmatch vs cancel completes without 500 error (cancel succeeds; crossmatch either ran first or rejected with 409)",
            `cm=${raceCm.status}, cancel=${raceCancelCm.status}`
        );

        const resAfterS3_2 = await prisma.bloodreservations.findUnique({
            where: { reservationid: allocS3_2.reservationId },
        });
        const itemAfterS3_2 = await prisma.reservationitems.findUnique({
            where: { itemid: itemS3_2.itemid },
        });
        const unitAfterS3_2 = await prisma.inventoryunits.findUnique({
            where: { unitid: itemS3_2.unitid },
        });
        assert(
            resAfterS3_2?.reservationstatus === "CANCELLED" &&
                itemAfterS3_2?.itemstatus === "RELEASED" &&
                unitAfterS3_2?.status === "AVAILABLE",
            "3.2b Cancelled reservation never leaves item in PREPARED state (reservation=CANCELLED, item=RELEASED, unit=AVAILABLE)",
            `res=${resAfterS3_2?.reservationstatus}, item=${itemAfterS3_2?.itemstatus}, unit=${unitAfterS3_2?.status}`
        );
        console.log("");

        // =========================================================================
        // SECTION 4: CONCURRENT REQUISITION ASSIGNMENT & ACCEPTED-ASSIGNMENT PROTECTION
        // =========================================================================
        console.log("--- Section 4: Concurrent Requisition Assignment & Accepted-Assignment Protection ---");

        // 4.1 Two concurrent assignRequisition calls on the same requestId
        const reqS4_1 = await createVerifiedBloodRequest(hospA.hospitalid, hospAUser.userid, 1);

        const [assignRace1, assignRace2] = await Promise.all([
            reqJson(
                "POST",
                `/bloodrequests/${reqS4_1.requestid}/assign`,
                { bloodBankId: bbA.bloodbankid },
                hospAToken
            ),
            reqJson(
                "POST",
                `/bloodrequests/${reqS4_1.requestid}/assign`,
                { bloodBankId: bbB.bloodbankid },
                hospAToken
            ),
        ]);

        assert(
            assignRace1.status === 201 && assignRace2.status === 201,
            "4.1a Two concurrent assignRequisition calls serialize under row lock without P2002 500 error",
            `a1=${assignRace1.status}, a2=${assignRace2.status}`
        );

        const pendingAssignmentsS4_1 = await prisma.requisitionassignments.findMany({
            where: { requestid: reqS4_1.requestid, assignmentstatus: "PENDING_ACCEPTANCE" },
        });
        assert(
            pendingAssignmentsS4_1.length === 1,
            "4.1b Exactly 1 PENDING_ACCEPTANCE assignment remains active after concurrent assignment race",
            `count=${pendingAssignmentsS4_1.length}`
        );

        // 4.2 Attempting to reassign after blood bank has ACCEPTED the assignment
        const allocS4_2 = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );

        const reassignAfterAccept = await reqJson(
            "POST",
            `/bloodrequests/${allocS4_2.request.requestid}/assign`,
            { bloodBankId: bbB.bloodbankid },
            hospAToken
        );
        assert(
            reassignAfterAccept.status === 409,
            "4.2a Calling assignRequisition on a request with an ACCEPTED assignment returns 409 Conflict (not 500)",
            `status=${reassignAfterAccept.status}, msg=${reassignAfterAccept.data?.message}`
        );

        const acceptedAssignmentsS4_2 = await prisma.requisitionassignments.findMany({
            where: { requestid: allocS4_2.request.requestid, assignmentstatus: "ACCEPTED" },
        });
        assert(
            acceptedAssignmentsS4_2.length === 1 && acceptedAssignmentsS4_2[0].bloodbankid === bbA.bloodbankid,
            "4.2b Original ACCEPTED assignment for BloodBank A remains intact"
        );
        console.log("");

        // =========================================================================
        // SECTION 5: FOREIGN itemId INJECTION DURING HOSPITAL RECEIPT
        // =========================================================================
        console.log("--- Section 5: Foreign itemId Injection During Hospital Receipt ---");

        // Prepare and dispatch two reservations: resA (Hospital A) and resB (Hospital B)
        const allocHospA_S5 = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );
        const allocHospB_S5 = await createAllocatedReservation(
            bbB.bloodbankid,
            bbBUser.userid,
            hospB.hospitalid,
            hospBUser.userid,
            1
        );

        await UnitTraceabilityService.recordCrossmatch({
            reservationItemId: allocHospA_S5.items[0].itemid,
            bloodBankId: bbA.bloodbankid,
            actorUserId: bbAUser.userid,
            testedByUserId: bbAUser.userid,
            verifiedByUserId: admin1User.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
        });
        await UnitTraceabilityService.dispatchReservation({
            reservationId: allocHospA_S5.reservationId,
            bloodBankId: bbA.bloodbankid,
            actorUserId: bbAUser.userid,
            courierName: "Courier S5 A",
            coldBoxSealNumber: "SEAL-S5-A",
            initialTemperature: 4.0,
            idempotencyKey: `idem-s5-disp-a-${tag}`,
        });

        await UnitTraceabilityService.recordCrossmatch({
            reservationItemId: allocHospB_S5.items[0].itemid,
            bloodBankId: bbB.bloodbankid,
            actorUserId: bbBUser.userid,
            testedByUserId: bbBUser.userid,
            verifiedByUserId: admin1User.userid,
            methodology: "INDIRECT_ANTIGLOBULIN",
            testResult: "COMPATIBLE",
        });
        await UnitTraceabilityService.dispatchReservation({
            reservationId: allocHospB_S5.reservationId,
            bloodBankId: bbB.bloodbankid,
            actorUserId: bbBUser.userid,
            courierName: "Courier S5 B",
            coldBoxSealNumber: "SEAL-S5-B",
            initialTemperature: 4.0,
            idempotencyKey: `idem-s5-disp-b-${tag}`,
        });

        // 5.1 Hospital A submits receipt confirmation on its own reservationId, injecting Hospital B's itemId
        const foreignItemInjectRes = await reqJson(
            "POST",
            `/bloodrequests/reservations/${allocHospA_S5.reservationId}/receipt`,
            {
                itemReceipts: [
                    { itemId: allocHospA_S5.items[0].itemid, receivedStatus: "ACCEPTED", tempReading: 4.1 },
                    { itemId: allocHospB_S5.items[0].itemid, receivedStatus: "ACCEPTED", tempReading: 4.1 },
                ],
            },
            hospAToken,
            { "Idempotency-Key": `idem-s5-inject-${tag}` }
        );
        assert(
            foreignItemInjectRes.status === 403,
            "5.1a Injecting a foreign reservation's itemId into confirmHospitalReceipt is rejected with 403 Forbidden",
            `status=${foreignItemInjectRes.status}, msg=${foreignItemInjectRes.data?.message}`
        );

        // Verify neither Hospital A's item nor Hospital B's item was mutated (atomic rollback)
        const itemHospA_AfterInject = await prisma.reservationitems.findUnique({
            where: { itemid: allocHospA_S5.items[0].itemid },
        });
        const itemHospB_AfterInject = await prisma.reservationitems.findUnique({
            where: { itemid: allocHospB_S5.items[0].itemid },
        });
        assert(
            itemHospA_AfterInject?.itemstatus === "DISPATCHED" && itemHospB_AfterInject?.itemstatus === "DISPATCHED",
            "5.1b Both Hospital A and Hospital B items remain DISPATCHED (full transaction rollback on foreign itemId)"
        );

        // 5.2 Duplicate itemId in same payload rejected with 400
        const dupItemRes = await reqJson(
            "POST",
            `/bloodrequests/reservations/${allocHospA_S5.reservationId}/receipt`,
            {
                itemReceipts: [
                    { itemId: allocHospA_S5.items[0].itemid, receivedStatus: "ACCEPTED", tempReading: 4.1 },
                    { itemId: allocHospA_S5.items[0].itemid, receivedStatus: "ACCEPTED", tempReading: 4.1 },
                ],
            },
            hospAToken,
            { "Idempotency-Key": `idem-s5-dup-${tag}` }
        );
        assert(
            dupItemRes.status === 400,
            "5.2 Duplicate itemId in confirmHospitalReceipt payload is rejected with 400 Bad Request",
            `status=${dupItemRes.status}`
        );

        // 5.3 Non-existent random UUID itemId rejected with 404
        const missingItemRes = await reqJson(
            "POST",
            `/bloodrequests/reservations/${allocHospA_S5.reservationId}/receipt`,
            {
                itemReceipts: [{ itemId: crypto.randomUUID(), receivedStatus: "ACCEPTED", tempReading: 4.1 }],
            },
            hospAToken,
            { "Idempotency-Key": `idem-s5-missing-${tag}` }
        );
        assert(
            missingItemRes.status === 404,
            "5.3 Non-existent itemId in confirmHospitalReceipt payload is rejected with 404 Not Found",
            `status=${missingItemRes.status}`
        );
        console.log("");

        // =========================================================================
        // SECTION 6: IDEMPOTENCY, REQUESTHASH VERIFICATION & LEDGER RECONCILIATION
        // =========================================================================
        console.log("--- Section 6: Idempotency, RequestHash Verification & Ledger Reconciliation ---");

        // 6.1 confirmHospitalReceipt idempotency replay & mismatched payload 409
        const rcptIdemKey = `idem-s6-rcpt-${tag}`;
        const legitRcpt1 = await reqJson(
            "POST",
            `/bloodrequests/reservations/${allocHospA_S5.reservationId}/receipt`,
            {
                itemReceipts: [{ itemId: allocHospA_S5.items[0].itemid, receivedStatus: "ACCEPTED", tempReading: 4.2 }],
            },
            hospAToken,
            { "Idempotency-Key": rcptIdemKey }
        );
        assert(
            legitRcpt1.status === 200 && legitRcpt1.data?.deliveredCount === 1,
            "6.1a Initial confirmHospitalReceipt succeeds with 200 OK and deliveredCount=1",
            `status=${legitRcpt1.status}, deliveredCount=${legitRcpt1.data?.deliveredCount}`
        );

        const legitRcptReplay = await reqJson(
            "POST",
            `/bloodrequests/reservations/${allocHospA_S5.reservationId}/receipt`,
            {
                itemReceipts: [{ itemId: allocHospA_S5.items[0].itemid, receivedStatus: "ACCEPTED", tempReading: 4.2 }],
            },
            hospAToken,
            { "Idempotency-Key": rcptIdemKey }
        );
        assert(
            legitRcptReplay.status === 200 && legitRcptReplay.data?.idempotentReplay === true,
            "6.1b Repeating confirmHospitalReceipt with identical Idempotency-Key and payload returns idempotentReplay=true",
            `status=${legitRcptReplay.status}, replay=${legitRcptReplay.data?.idempotentReplay}`
        );

        const conflictRcptReplay = await reqJson(
            "POST",
            `/bloodrequests/reservations/${allocHospA_S5.reservationId}/receipt`,
            {
                itemReceipts: [
                    { itemId: allocHospA_S5.items[0].itemid, receivedStatus: "REJECTED_EXCURSION", tempReading: 12.5 },
                ],
            },
            hospAToken,
            { "Idempotency-Key": rcptIdemKey }
        );
        assert(
            conflictRcptReplay.status === 409,
            "6.1c Reusing confirmHospitalReceipt Idempotency-Key with modified payload is rejected with 409 Conflict",
            `status=${conflictRcptReplay.status}`
        );

        // 6.2 cancelReservation idempotency replay & mismatched payload 409
        const allocS6_Cancel = await createAllocatedReservation(
            bbA.bloodbankid,
            bbAUser.userid,
            hospA.hospitalid,
            hospAUser.userid,
            1
        );
        const cancelIdemKey = `idem-s6-cancel-${tag}`;

        const cancel1 = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS6_Cancel.reservationId}/cancel`,
            { reason: "Patient surgery postponed" },
            bbAToken,
            { "Idempotency-Key": cancelIdemKey }
        );
        assert(cancel1.status === 200, "6.2a Initial cancelReservation succeeds with 200 OK");

        const cancelReplay = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS6_Cancel.reservationId}/cancel`,
            { reason: "Patient surgery postponed" },
            bbAToken,
            { "Idempotency-Key": cancelIdemKey }
        );
        assert(
            cancelReplay.status === 200 && cancelReplay.data?.idempotentReplay === true,
            "6.2b Repeating cancelReservation with identical Idempotency-Key and reason returns idempotentReplay=true"
        );

        const cancelConflict = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/reservations/${allocS6_Cancel.reservationId}/cancel`,
            { reason: "Different reason with same idempotency key" },
            bbAToken,
            { "Idempotency-Key": cancelIdemKey }
        );
        assert(
            cancelConflict.status === 409,
            "6.2c Reusing cancelReservation Idempotency-Key with different reason returns 409 Conflict",
            `status=${cancelConflict.status}`
        );

        // 6.3 discardUnit idempotency replay & mismatched payload 409
        const discardIdemKey = `idem-s6-discard-${tag}`;
        const discard1 = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitBbA_DiscardTarget.unitId}/discard`,
            { reason: "Bag seal damaged during inspection" },
            bbAToken,
            { "Idempotency-Key": discardIdemKey }
        );
        assert(discard1.status === 200, "6.3a Initial discardUnit succeeds with 200 OK");

        const discardReplay = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitBbA_DiscardTarget.unitId}/discard`,
            { reason: "Bag seal damaged during inspection" },
            bbAToken,
            { "Idempotency-Key": discardIdemKey }
        );
        assert(
            discardReplay.status === 200 && discardReplay.data?.idempotentReplay === true,
            "6.3b Repeating discardUnit with identical Idempotency-Key and reason returns idempotentReplay=true"
        );

        const discardConflict = await reqJson(
            "POST",
            `/bloodbanks/${bbA.bloodbankid}/units/${unitBbA_DiscardTarget.unitId}/discard`,
            { reason: "Tampered reason on replay" },
            bbAToken,
            { "Idempotency-Key": discardIdemKey }
        );
        assert(
            discardConflict.status === 409,
            "6.3c Reusing discardUnit Idempotency-Key with different reason returns 409 Conflict",
            `status=${discardConflict.status}`
        );

        // 6.4 Inventory & Ledger Reconciliation across both BloodBank A and BloodBank B
        const [reconBbA, reconBbB] = await Promise.all([
            UnitTraceabilityService.reconcileInventory(bbA.bloodbankid),
            UnitTraceabilityService.reconcileInventory(bbB.bloodbankid),
        ]);

        assert(
            reconBbA.length > 0 &&
                reconBbA.every(
                    (l: any) =>
                        l.is_available_reconciled === true &&
                        l.is_reserved_reconciled === true &&
                        l.is_quarantined_reconciled === true &&
                        l.is_ledger_balanced === true
                ),
            "6.4a BloodBank A inventory lots and ledger balances are 100% reconciled after all concurrency and isolation tests"
        );

        assert(
            reconBbB.length > 0 &&
                reconBbB.every(
                    (l: any) =>
                        l.is_available_reconciled === true &&
                        l.is_reserved_reconciled === true &&
                        l.is_quarantined_reconciled === true &&
                        l.is_ledger_balanced === true
                ),
            "6.4b BloodBank B inventory lots and ledger balances are 100% reconciled after all concurrency and isolation tests"
        );
        console.log("");
    } finally {
        try {
            // Clean up mutable requisition/reservation records in FK dependency order
            // (Immutable ledger/screening records and ON DELETE RESTRICT parents are retained)
            if (createdRequestIds.length > 0) {
                await prisma.clinicalcrossmatches.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
                await prisma.reservationitems.deleteMany({
                    where: { reservation: { requestid: { in: createdRequestIds } } },
                });
                await prisma.bloodreservations.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
                await prisma.requisitionassignments.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
                await prisma.notification.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
                await prisma.bloodrequests.deleteMany({
                    where: { requestid: { in: createdRequestIds } },
                });
            }
            if (createdHospitalIds.length > 0) {
                await prisma.hospitals.deleteMany({
                    where: { hospitalid: { in: createdHospitalIds } },
                });
            }
        } catch (cleanupErr) {
            console.error("Cleanup warning:", cleanupErr);
        }
        server.close();
        await prisma.$disconnect();
    }

    console.log("===============================================================================");
    console.log(`  AUD-03 TEST SUMMARY: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
    console.log("===============================================================================");

    if (failed > 0) {
        console.error("\nFailed Assertions:");
        for (const f of failures) {
            console.error(`  - ${f}`);
        }
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Unhandled error in AUD-03 test suite:", err);
    process.exit(1);
});
