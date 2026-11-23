import dotenv from "dotenv";
import path from "path";

// Load test environment
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

import { prisma } from "../src/config/prisma";
import {
    normalizeState,
    normalizeDistrict,
    getNormalizedLocation,
    isSameDistrict,
    isSameState,
} from "../src/utils/location";
import { RegionalAiInsightsService } from "../src/services/regionalAiInsights.service";
import { blood_group, blood_component, request_status, tti_screening_status, unit_status } from "../src/generated/prisma/enums";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: Array<{ name: string; error: string }> = [];

function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failedTests++;
        const err = detail ? `${testName} — ${detail}` : testName;
        failures.push({ name: testName, error: err });
        console.error(`  [FAIL] ${err}`);
    }
}

async function runRegionAwareAiTestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: REGION-AWARE AI INSIGHTS VERIFICATION TEST SUITE                   ");
    console.log("===============================================================================\n");

    // -------------------------------------------------------------------------
    // TEST SECTION 1: SAFETY GUARDS & DATABASE PROTECTION
    // -------------------------------------------------------------------------
    console.log("--- 1. Safety Guards & Database Protection ---");
    const dbUrl = process.env.DATABASE_URL || "";
    const isNeon = dbUrl.includes("neon.tech") || dbUrl.includes("neondb");
    assert(!isNeon, "1.1 Tests strictly avoid remote production Neon database");

    const dbCheck: any = await prisma.$queryRawUnsafe("SELECT current_database();");
    const currentDb = dbCheck[0]?.current_database || "";
    assert(currentDb === "swastya_test", `1.2 Target database is strictly swastya_test (got: ${currentDb})`);

    // -------------------------------------------------------------------------
    // TEST SECTION 2: LOCATION NORMALIZATION UTILITY TESTS
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Location Normalization & Resolution Tests ---");

    // 2.1 State code abbreviations
    assert(normalizeState("MH") === "MAHARASHTRA", "2.1.a State abbreviation MH -> MAHARASHTRA");
    assert(normalizeState("OD") === "ODISHA", "2.1.b State abbreviation OD -> ODISHA");
    assert(normalizeState("TS") === "TELANGANA", "2.1.c State abbreviation TS -> TELANGANA");
    assert(normalizeState("KA") === "KARNATAKA", "2.1.d State abbreviation KA -> KARNATAKA");
    assert(normalizeState("DL") === "DELHI", "2.1.e State abbreviation DL -> DELHI");
    assert(normalizeState("WB") === "WEST BENGAL", "2.1.f State abbreviation WB -> WEST BENGAL");
    assert(normalizeState("  Maharashtra  ") === "MAHARASHTRA", "2.1.g State text with whitespace trimmed");

    // 2.2 District normalization
    assert(normalizeDistrict("  Mumbai  ") === "MUMBAI", "2.2.a District whitespace trimmed and normalized");
    assert(normalizeDistrict("PUNE") === "PUNE", "2.2.b District uppercase normalized");
    assert(normalizeDistrict("Bengaluru Urban") === "BENGALURU", "2.2.c Multi-word district alias normalized");

    // 2.3 Location validation & completeness
    const validLoc = getNormalizedLocation({ city: "Mumbai", state: "Maharashtra" });
    assert(validLoc.isValid, "2.3.a Valid facility location correctly detected");
    assert(validLoc.displayDistrict === "Mumbai", "2.3.b Display district title-cased");
    assert(validLoc.displayState === "Maharashtra", "2.3.c Display state title-cased");

    const missingCityLoc = getNormalizedLocation({ city: null, state: "Maharashtra" });
    assert(!missingCityLoc.isValid, "2.3.d Missing city marked invalid");
    assert(Boolean(missingCityLoc.missingLocationMessage), "2.3.e Missing city has clear clinical notice");

    const missingStateLoc = getNormalizedLocation({ city: "Mumbai", state: null });
    assert(!missingStateLoc.isValid, "2.3.f Missing state marked invalid");

    // 2.4 District & State matching equality
    assert(
        isSameDistrict({ city: "Mumbai", state: "MH" }, { city: "mumbai", state: "Maharashtra" }),
        "2.4.a District equality matches across state code vs full name"
    );
    assert(
        !isSameDistrict({ city: "Mumbai", state: "MH" }, { city: "Pune", state: "MH" }),
        "2.4.b Different districts in same state do NOT match"
    );
    assert(
        isSameState({ state: "KA" }, { state: "karnataka" }),
        "2.4.c State equality matches across abbreviation and lowercase full name"
    );
    assert(
        !isSameState({ state: "MH" }, { state: "KA" }),
        "2.4.d Different states do not match"
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 3: MULTI-DISTRICT & MULTI-STATE DATA INTEGRATION
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Regional AI Insights Multi-Tier Scope Isolation ---");

    const testRunId = `reg_${Date.now()}`;
    const createdUserIds: string[] = [];
    const createdHospitalIds: string[] = [];
    const createdBloodBankIds: string[] = [];
    const createdRequestIds: string[] = [];
    const createdInventoryIds: string[] = [];
    const createdUnitIds: string[] = [];

    try {
        // Helper to create test user
        const makeUser = async (role: "HOSPITAL" | "BLOOD_BANK", name: string) => {
            const u = await prisma.users.create({
                data: {
                    name,
                    email: `${testRunId}_${name.toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`,
                    password: "hash_test_123",
                    role,
                    isactive: true,
                    emailverified: true,
                },
            });
            createdUserIds.push(u.userid);
            return u;
        };

        const testDistA = `DistA_${testRunId.slice(-6)}`;
        const testDistB = `DistB_${testRunId.slice(-6)}`;
        const testDistC = `DistC_${testRunId.slice(-6)}`;
        const testStateX = `StateX_${testRunId.slice(-6)}`;
        const testStateY = `StateY_${testRunId.slice(-6)}`;

        // Facility 1: Hospital A1 (DistA, StateX)
        const uHospA1 = await makeUser("HOSPITAL", "HospA1");
        const hospA1 = await prisma.hospitals.create({
            data: {
                userid: uHospA1.userid,
                hospitalname: `Test Hospital A1 (${testRunId})`,
                registrationnumber: `HREG-A1-${testRunId}`,
                contactpersonname: "Dr. A1",
                contactpersonphone: "9123456701",
                city: testDistA,
                state: testStateX,
                pincode: "400001",
                address: "Marine Lines, City A",
                approvalstatus: "APPROVED",
            },
        });
        createdHospitalIds.push(hospA1.hospitalid);

        // Facility 2: Hospital A2 (DistA, StateX)
        const uHospA2 = await makeUser("HOSPITAL", "HospA2");
        const hospA2 = await prisma.hospitals.create({
            data: {
                userid: uHospA2.userid,
                hospitalname: `Test Hospital A2 (${testRunId})`,
                registrationnumber: `HREG-A2-${testRunId}`,
                contactpersonname: "Dr. A2",
                contactpersonphone: "9123456702",
                city: testDistA,
                state: testStateX,
                pincode: "400012",
                address: "Parel, City A",
                approvalstatus: "APPROVED",
            },
        });
        createdHospitalIds.push(hospA2.hospitalid);

        // Facility 3: Hospital B1 (DistB, StateX)
        const uHospB1 = await makeUser("HOSPITAL", "HospB1");
        const hospB1 = await prisma.hospitals.create({
            data: {
                userid: uHospB1.userid,
                hospitalname: `Test Hospital B1 (${testRunId})`,
                registrationnumber: `HREG-B1-${testRunId}`,
                contactpersonname: "Dr. B1",
                contactpersonphone: "9123456703",
                city: testDistB,
                state: testStateX,
                pincode: "411001",
                address: "Shivajinagar, City B",
                approvalstatus: "APPROVED",
            },
        });
        createdHospitalIds.push(hospB1.hospitalid);

        // Facility 4: Hospital C1 (DistC, StateY)
        const uHospC1 = await makeUser("HOSPITAL", "HospC1");
        const hospC1 = await prisma.hospitals.create({
            data: {
                userid: uHospC1.userid,
                hospitalname: `Test Hospital C1 (${testRunId})`,
                registrationnumber: `HREG-C1-${testRunId}`,
                contactpersonname: "Dr. C1",
                contactpersonphone: "9123456704",
                city: testDistC,
                state: testStateY,
                pincode: "560001",
                address: "MG Road, City C",
                approvalstatus: "APPROVED",
            },
        });
        createdHospitalIds.push(hospC1.hospitalid);

        // Facility 5: Blood Bank A1 (DistA, StateX)
        const uBbA1 = await makeUser("BLOOD_BANK", "BbA1");
        const bbA1 = await prisma.bloodbanks.create({
            data: {
                userid: uBbA1.userid,
                bloodbankname: `Test Blood Bank A1 (${testRunId})`,
                licensenumber: `LIC-A1-${testRunId}`,
                contactpersonname: "BB Manager A1",
                contactpersonphone: "9123456705",
                city: testDistA,
                state: testStateX,
                pincode: "400001",
                address: "Fort, City A",
                approvalstatus: "APPROVED",
            },
        });
        createdBloodBankIds.push(bbA1.bloodbankid);

        // Facility 6: Blood Bank B1 (DistB, StateX)
        const uBbB1 = await makeUser("BLOOD_BANK", "BbB1");
        const bbB1 = await prisma.bloodbanks.create({
            data: {
                userid: uBbB1.userid,
                bloodbankname: `Test Blood Bank B1 (${testRunId})`,
                licensenumber: `LIC-B1-${testRunId}`,
                contactpersonname: "BB Manager B1",
                contactpersonphone: "9123456706",
                city: testDistB,
                state: testStateX,
                pincode: "411001",
                address: "Kothrud, City B",
                approvalstatus: "APPROVED",
            },
        });
        createdBloodBankIds.push(bbB1.bloodbankid);

        // Helper to create blood request
        const createReq = async (
            hospId: string,
            creatorUserId: string,
            bg: blood_group,
            comp: blood_component,
            units: number,
            status: request_status = "FULFILLED",
            daysAgo: number = 2
        ) => {
            const req = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: creatorUserId,
                    hospitalid: hospId,
                    patientname: `Patient_${testRunId}`,
                    patientage: 35,
                    patientgender: "MALE",
                    patientcontact: "9123456799",
                    bloodgroup: bg,
                    bloodcomponent: comp,
                    unitsrequired: units,
                    urgencylevel: "MEDIUM",
                    requiredby: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    status,
                    createdat: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
                },
            });
            createdRequestIds.push(req.requestid);
            return req;
        };

        // Seed Requests:
        // Hospital A1 (DistA): 5 requests spanning 10 days (10 units A_POSITIVE, 5 units O_POSITIVE = 15 units valid)
        // Plus 1 CANCELLED and 1 EXPIRED request (must be excluded from real demand)
        await createReq(hospA1.hospitalid, uHospA1.userid, "A_POSITIVE", "RBC", 2, "FULFILLED", 1);
        await createReq(hospA1.hospitalid, uHospA1.userid, "A_POSITIVE", "RBC", 3, "FULFILLED", 3);
        await createReq(hospA1.hospitalid, uHospA1.userid, "A_POSITIVE", "RBC", 5, "FULFILLED", 6);
        await createReq(hospA1.hospitalid, uHospA1.userid, "O_POSITIVE", "WHOLE_BLOOD", 2, "FULFILLED", 8);
        await createReq(hospA1.hospitalid, uHospA1.userid, "O_POSITIVE", "WHOLE_BLOOD", 3, "VERIFIED", 10);
        await createReq(hospA1.hospitalid, uHospA1.userid, "A_POSITIVE", "RBC", 10, "CANCELLED", 2); // Excluded
        await createReq(hospA1.hospitalid, uHospA1.userid, "A_POSITIVE", "RBC", 10, "EXPIRED", 3);   // Excluded

        // Hospital A2 (DistA): 3 requests (6 units B_POSITIVE)
        await createReq(hospA2.hospitalid, uHospA2.userid, "B_POSITIVE", "PLATELETS", 2, "FULFILLED", 2);
        await createReq(hospA2.hospitalid, uHospA2.userid, "B_POSITIVE", "PLATELETS", 2, "FULFILLED", 4);
        await createReq(hospA2.hospitalid, uHospA2.userid, "B_POSITIVE", "PLATELETS", 2, "FULFILLED", 6);

        // Hospital B1 (DistB): 2 requests (8 units AB_POSITIVE)
        await createReq(hospB1.hospitalid, uHospB1.userid, "AB_POSITIVE", "PLASMA", 4, "FULFILLED", 2);
        await createReq(hospB1.hospitalid, uHospB1.userid, "AB_POSITIVE", "PLASMA", 4, "FULFILLED", 5);

        // Hospital C1 (DistC, StateY): 2 requests (12 units O_NEGATIVE)
        await createReq(hospC1.hospitalid, uHospC1.userid, "O_NEGATIVE", "WHOLE_BLOOD", 6, "FULFILLED", 1);
        await createReq(hospC1.hospitalid, uHospC1.userid, "O_NEGATIVE", "WHOLE_BLOOD", 6, "FULFILLED", 3);

        // Seed Inventory for Blood Bank A1 (Mumbai):
        // 3 available units (PASSED TTI, unexpired)
        // 1 expired unit (status AVAILABLE, but expired 2 days ago) -> MUST be excluded from supply
        // 1 quarantined unit (status QUARANTINED) -> MUST be excluded
        // 1 TTI-failed unit (ttiscreeningstatus FAILED) -> MUST be excluded
        const makeUnit = async (
            bbId: string,
            barcode: string,
            bg: blood_group,
            comp: blood_component,
            status: unit_status,
            tti: tti_screening_status,
            expiryDate: Date
        ) => {
            let lot = await prisma.inventory.findFirst({
                where: {
                    bloodbankid: bbId,
                    bloodgroup: bg,
                    bloodcomponent: comp,
                    expirydate: expiryDate,
                },
            });
            if (!lot) {
                lot = await prisma.inventory.create({
                    data: {
                        bloodbankid: bbId,
                        bloodgroup: bg,
                        bloodcomponent: comp,
                        unitsavailable: 0,
                        unitsquarantined: 0,
                        unitsreserved: 0,
                        islegacyreconciled: true,
                        expirydate: expiryDate,
                    },
                });
                createdInventoryIds.push(lot.inventoryid);
            }

            const u = await prisma.inventoryunits.create({
                data: {
                    inventoryid: lot.inventoryid,
                    bloodbankid: bbId,
                    unitbarcode: `${testRunId}_${barcode}`,
                    bloodgroup: bg,
                    bloodcomponent: comp,
                    status: "QUARANTINED",
                    ttiscreeningstatus: "PENDING",
                    expirydate: expiryDate,
                },
            });
            createdUnitIds.push(u.unitid);

            if (status === "AVAILABLE" && tti === "PASSED") {
                const scr = await prisma.unitscreeningrecords.create({
                    data: {
                        unitid: u.unitid,
                        revisionnumber: 1,
                        iscurrent: true,
                        hivresult: "NON_REACTIVE",
                        hbvresult: "NON_REACTIVE",
                        hcvresult: "NON_REACTIVE",
                        syphilisresult: "NON_REACTIVE",
                        malariaresult: "NON_REACTIVE",
                        overallstatus: "PASSED",
                        testedbyuserid: uBbA1.userid,
                        verifiedbyuserid: uBbB1.userid,
                        verifiedat: new Date(),
                    },
                });
                await prisma.inventoryunits.update({
                    where: { unitid: u.unitid },
                    data: {
                        currentscreeningid: scr.screeningid,
                        status: "AVAILABLE",
                        ttiscreeningstatus: "PASSED",
                    },
                });
            } else if (tti === "FAILED") {
                const scr = await prisma.unitscreeningrecords.create({
                    data: {
                        unitid: u.unitid,
                        revisionnumber: 1,
                        iscurrent: true,
                        hivresult: "REACTIVE",
                        hbvresult: "NON_REACTIVE",
                        hcvresult: "NON_REACTIVE",
                        syphilisresult: "NON_REACTIVE",
                        malariaresult: "NON_REACTIVE",
                        overallstatus: "FAILED",
                        testedbyuserid: uBbA1.userid,
                        verifiedbyuserid: uBbB1.userid,
                        verifiedat: new Date(),
                    },
                });
                await prisma.inventoryunits.update({
                    where: { unitid: u.unitid },
                    data: {
                        currentscreeningid: scr.screeningid,
                        ttiscreeningstatus: "FAILED",
                    },
                });
            }

            return u;
        };

        const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
        const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        await makeUnit(bbA1.bloodbankid, "UNIT_OK_1", "A_POSITIVE", "RBC", "AVAILABLE", "PASSED", futureDate);
        await makeUnit(bbA1.bloodbankid, "UNIT_OK_2", "A_POSITIVE", "RBC", "AVAILABLE", "PASSED", futureDate);
        await makeUnit(bbA1.bloodbankid, "UNIT_OK_3", "O_POSITIVE", "WHOLE_BLOOD", "AVAILABLE", "PASSED", futureDate);
        await makeUnit(bbA1.bloodbankid, "UNIT_EXPIRED", "A_POSITIVE", "RBC", "AVAILABLE", "PASSED", pastDate); // Expired!
        await makeUnit(bbA1.bloodbankid, "UNIT_QUARANTINED", "A_POSITIVE", "RBC", "QUARANTINED", "PASSED", futureDate); // Quarantined!
        await makeUnit(bbA1.bloodbankid, "UNIT_TTI_FAIL", "B_POSITIVE", "PLATELETS", "AVAILABLE", "FAILED", futureDate); // TTI failed!

        // Seed Inventory for Blood Bank B1 (Pune):
        // 5 available units
        for (let i = 1; i <= 5; i++) {
            await makeUnit(bbB1.bloodbankid, `UNIT_PUNE_${i}`, "AB_POSITIVE", "PLASMA", "AVAILABLE", "PASSED", futureDate);
        }

        // ---------------------------------------------------------------------
        // TEST 3.1: HOSPITAL SCOPE ISOLATION
        // ---------------------------------------------------------------------
        console.log("\n--- 3.1 Hospital Scope Isolation ---");
        const hospA1Result = await RegionalAiInsightsService.getHospitalInsights({
            hospitalId: hospA1.hospitalid,
            scope: "HOSPITAL",
            timeframeDays: 30,
        });

        assert(hospA1Result.scope === "HOSPITAL", "3.1.a Scope is strictly HOSPITAL");
        assert(
            hospA1Result.overview.totalUnitsRequested === 15,
            `3.1.b Only Hospital A1 units counted (expected 15, got ${hospA1Result.overview.totalUnitsRequested})`
        );
        assert(
            hospA1Result.overview.totalRequestsCount === 5,
            `3.1.c Cancelled and expired requests are excluded (expected 5, got ${hospA1Result.overview.totalRequestsCount})`
        );
        assert(
            Number.isInteger(hospA1Result.overview.estimatedUpcoming7d),
            `3.1.d 7-day estimate is an integer whole unit (got ${hospA1Result.overview.estimatedUpcoming7d})`
        );
        assert(
            hospA1Result.overview.mostRequestedGroup?.bloodGroup === "A_POSITIVE",
            "3.1.e Most requested group is A_POSITIVE"
        );
        assert(
            hospA1Result.isDataSufficient === true,
            "3.1.f Data sufficiency requirement (>=5 requests) satisfied"
        );

        // ---------------------------------------------------------------------
        // TEST 3.2: DISTRICT SCOPE AGGREGATION
        // ---------------------------------------------------------------------
        console.log("\n--- 3.2 District Scope Aggregation ---");
        const distResult = await RegionalAiInsightsService.getHospitalInsights({
            hospitalId: hospA1.hospitalid,
            scope: "DISTRICT",
            timeframeDays: 30,
        });

        assert(distResult.scope === "DISTRICT", "3.2.a Scope is DISTRICT");
        // Mumbai district = Hosp A1 (15 units) + Hosp A2 (6 units) = 21 units
        assert(
            distResult.overview.totalUnitsRequested === 21,
            `3.2.b District aggregates Hospital A1 (15u) and Hospital A2 (6u) = 21u (got ${distResult.overview.totalUnitsRequested})`
        );
        assert(
            distResult.overview.totalRequestsCount === 8,
            `3.2.c District total requests = 5 + 3 = 8 (got ${distResult.overview.totalRequestsCount})`
        );
        assert(
            distResult.regionalContext?.participatingHospitalsCount === 2,
            `3.2.d Participating hospitals in district = 2 (got ${distResult.regionalContext?.participatingHospitalsCount})`
        );
        assert(
            distResult.regionalContext?.hospitalComparison?.hospitalUnits === 15,
            `3.2.e Hospital comparison tracks Hospital A1's 15 units`
        );
        assert(
            distResult.regionalContext?.hospitalComparison?.districtUnits === 21,
            `3.2.f Hospital comparison tracks District's 21 units`
        );
        const expectedShare = Math.round((15 / 21) * 1000) / 10;
        assert(
            distResult.regionalContext?.hospitalComparison?.hospitalSharePercent === expectedShare,
            `3.2.g Hospital comparison share percent is ${expectedShare}% (got ${distResult.regionalContext?.hospitalComparison?.hospitalSharePercent}%)`
        );

        // ---------------------------------------------------------------------
        // TEST 3.3: STATE SCOPE AGGREGATION & BREAKDOWN
        // ---------------------------------------------------------------------
        console.log("\n--- 3.3 State Scope Aggregation & Breakdown ---");
        const stateResult = await RegionalAiInsightsService.getHospitalInsights({
            hospitalId: hospA1.hospitalid,
            scope: "STATE",
            timeframeDays: 30,
        });

        assert(stateResult.scope === "STATE", "3.3.a Scope is STATE");
        // Maharashtra state = Mumbai (21u) + Pune (8u) = 29 units. (Bengaluru C1 in Karnataka is excluded).
        assert(
            stateResult.overview.totalUnitsRequested === 29,
            `3.3.b State aggregates Maharashtra hospitals (21 + 8 = 29 units, got ${stateResult.overview.totalUnitsRequested})`
        );
        assert(
            stateResult.regionalContext?.participatingHospitalsCount === 3,
            `3.3.c Participating hospitals across Maharashtra = 3 (got ${stateResult.regionalContext?.participatingHospitalsCount})`
        );

        const districtBreakdown = stateResult.regionalContext?.districtBreakdown || [];
        assert(districtBreakdown.length >= 2, "3.3.d District breakdown includes at least DistA and DistB");
        const distADump = districtBreakdown.find((d) => d.districtName.toLowerCase() === testDistA.toLowerCase());
        const distBDump = districtBreakdown.find((d) => d.districtName.toLowerCase() === testDistB.toLowerCase());
        assert(distADump?.totalUnits === 21, `3.3.e DistA district shows 21 units (got ${distADump?.totalUnits})`);
        assert(distBDump?.totalUnits === 8, `3.3.f DistB district shows 8 units (got ${distBDump?.totalUnits})`);

        // ---------------------------------------------------------------------
        // TEST 3.4: BLOOD BANK INVENTORY & CLINICAL SAFETY (FEFO QUEUE)
        // ---------------------------------------------------------------------
        console.log("\n--- 3.4 Blood Bank Inventory & Safety Isolation ---");
        const bbInventoryResult = await RegionalAiInsightsService.getBloodBankInsights({
            bloodBankId: bbA1.bloodbankid,
            scope: "INVENTORY",
            timeframeDays: 30,
        });

        assert(bbInventoryResult.scope === "INVENTORY", "3.4.a Scope is INVENTORY");
        assert(
            bbInventoryResult.inventoryOverview?.totalAvailableUnits === 6,
            `3.4.b Total active units = 6 (got ${bbInventoryResult.inventoryOverview?.totalAvailableUnits})`
        );
        assert(
            bbInventoryResult.inventoryOverview?.eligibleAllocationCount === 3,
            `3.4.c Eligible allocation count strictly excludes expired, quarantined, or TTI-failed (expected 3, got ${bbInventoryResult.inventoryOverview?.eligibleAllocationCount})`
        );

        // FEFO Queue must ONLY have the 3 safe units
        const fefoUnits = bbInventoryResult.unitsToUseFirst || [];
        assert(
            fefoUnits.length === 3,
            `3.4.d FEFO queue contains exactly 3 safe units (got ${fefoUnits.length})`
        );
        const containsExpired = fefoUnits.some((u) => u.unitBarcode.includes("EXPIRED"));
        const containsQuarantine = fefoUnits.some((u) => u.unitBarcode.includes("QUARANTINED"));
        const containsTtiFail = fefoUnits.some((u) => u.unitBarcode.includes("TTI_FAIL"));
        assert(!containsExpired, "3.4.e FEFO queue strictly excludes expired unit");
        assert(!containsQuarantine, "3.4.f FEFO queue strictly excludes quarantined unit");
        assert(!containsTtiFail, "3.4.g FEFO queue strictly excludes TTI failed unit");

        // ---------------------------------------------------------------------
        // TEST 3.5: BLOOD BANK DISTRICT SUPPLY VS DEMAND
        // ---------------------------------------------------------------------
        console.log("\n--- 3.5 Blood Bank District Supply vs Demand ---");
        const bbDistResult = await RegionalAiInsightsService.getBloodBankInsights({
            bloodBankId: bbA1.bloodbankid,
            scope: "DISTRICT",
            timeframeDays: 30,
        });

        assert(bbDistResult.scope === "DISTRICT", "3.5.a Scope is DISTRICT");
        assert(
            bbDistResult.regionalDemand?.totalUnitsRequested === 21,
            `3.5.b District demand aggregates DistA hospital requisitions (expected 21, got ${bbDistResult.regionalDemand?.totalUnitsRequested})`
        );
        assert(
            bbDistResult.regionalSupply?.totalAvailableUnits === 3,
            `3.5.c District supply strictly counts available safe units in DistA (expected 3, got ${bbDistResult.regionalSupply?.totalAvailableUnits})`
        );
        const comparison = bbDistResult.demandSupplyComparison || [];
        assert(comparison.length > 0, "3.5.d Blood group comparison is populated");

        // ---------------------------------------------------------------------
        // TEST 3.6: INCOMPLETE LOCATION HANDLING
        // ---------------------------------------------------------------------
        console.log("\n--- 3.6 Incomplete Location Handling ---");
        const uIncomplete = await makeUser("HOSPITAL", "IncompleteLoc");
        const hospIncomplete = await prisma.hospitals.create({
            data: {
                userid: uIncomplete.userid,
                hospitalname: `Incomplete Loc Hospital (${testRunId})`,
                registrationnumber: `HREG-INC-${testRunId}`,
                contactpersonname: "Dr. Incomplete",
                contactpersonphone: "9123456709",
                address: "100 Unknown St",
                pincode: "400099",
                city: "",
                state: "",
                approvalstatus: "APPROVED",
            },
        });
        createdHospitalIds.push(hospIncomplete.hospitalid);

        const incompleteResult = await RegionalAiInsightsService.getHospitalInsights({
            hospitalId: hospIncomplete.hospitalid,
            scope: "DISTRICT",
            timeframeDays: 30,
        });

        assert(
            !incompleteResult.location.isValid,
            "3.6.a Hospital with missing location is flagged as invalid"
        );
        assert(
            Boolean(incompleteResult.location.missingLocationMessage),
            "3.6.b Clear notice returned explaining that regional comparisons are unavailable"
        );

    } catch (err: any) {
        console.error("Error inside Section 3:", err);
        throw err;
    } finally {
        // CLEANUP TEST DATA
        console.log("\n--- Cleaning up test records ---");
        try {
            if (createdRequestIds.length > 0) {
                await prisma.bloodrequests.deleteMany({ where: { requestid: { in: createdRequestIds } } });
            }
            if (createdHospitalIds.length > 0) {
                await prisma.hospitals.deleteMany({ where: { hospitalid: { in: createdHospitalIds } } });
            }
            console.log("  [CLEANUP COMPLETE] Test records removed safely.");
        } catch (e: any) {
            console.log(`  [CLEANUP NOTE] ${e.message}`);
        }
    }

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n===============================================================================");
    console.log(`  TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
    console.log("===============================================================================");

    if (failedTests > 0) {
        console.error("\nFailures:");
        failures.forEach((f) => console.error(`  - ${f.error}`));
        process.exit(1);
    } else {
        console.log("\n  ALL REGION-AWARE AI INSIGHTS TESTS PASSED SUCCESSFULLY!  \n");
    }
}

runRegionAwareAiTestSuite().catch((err) => {
    console.error("Fatal error during test run:", err);
    process.exit(1);
});
