import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import { blood_group, blood_component, user_role, availability_status } from "../src/generated/prisma/enums";
import { DonorMatchingService } from "../src/services/donorMatching.service";

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

async function runDonorMatchingTestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: INTELLIGENT DONOR MATCHING CORE SERVICE & API TEST SUITE            ");
    console.log("===============================================================================\n");

    // Guard: Verify target database is swastya_test
    const dbCheck: Array<{ current_database: string }> = await prisma.$queryRawUnsafe(`SELECT current_database()`);
    const currentDb = dbCheck[0]?.current_database || "";
    if (currentDb !== "swastya_test") {
        throw new Error(`CRITICAL QA ABORT: Expected local test database swastya_test, got "${currentDb}"`);
    }
    console.log(`[DB Guard] Verified target database: ${currentDb}\n`);

    // Helper: Make HTTP request to Express app
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as any;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    async function reqJson(method: string, endpoint: string, body?: any, token?: string) {
        const url = `${baseUrl}${endpoint}`;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        const status = res.status;
        let data: any = null;
        try {
            data = await res.json();
        } catch {
            data = null;
        }
        return { status, data };
    }

    const testTag = crypto.randomBytes(4).toString("hex");

    try {
        // =====================================================================
        // SETUP: Create test users and facilities
        // =====================================================================
        console.log("--- Setup: Creating Test Entities ---");

        // 1. Hospital A & User
        const hospAUser = await prisma.users.create({
            data: {
                name: `Hospital Admin A ${testTag}`,
                email: `hosp_a_${testTag}@swastya.org`,
                password: "hashedpassword123",
                role: user_role.HOSPITAL,
            },
        });
        const hospA = await prisma.hospitals.create({
            data: {
                userid: hospAUser.userid,
                hospitalname: `City Hospital A ${testTag}`,
                registrationnumber: `REG-HA-${testTag}`,
                contactpersonname: "Dr. Smith",
                contactpersonphone: "9876543201",
                address: "100 Medical Center Way",
                city: "Pune",
                state: "Maharashtra",
                pincode: "411001",
                latitude: 18.5204,
                longitude: 73.8567,
                approvalstatus: "APPROVED",
            },
        });
        const hospAToken = generateToken(hospAUser.userid, hospAUser.role);

        // 2. Hospital B (Foreign hospital for tenant isolation tests)
        const hospBUser = await prisma.users.create({
            data: {
                name: `Hospital Admin B ${testTag}`,
                email: `hosp_b_${testTag}@swastya.org`,
                password: "hashedpassword123",
                role: user_role.HOSPITAL,
            },
        });
        const hospB = await prisma.hospitals.create({
            data: {
                userid: hospBUser.userid,
                hospitalname: `Suburban Hospital B ${testTag}`,
                registrationnumber: `REG-HB-${testTag}`,
                contactpersonname: "Dr. Jones",
                contactpersonphone: "9876543202",
                address: "200 Metro Road",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 19.0760,
                longitude: 72.8777,
                approvalstatus: "APPROVED",
            },
        });
        const hospBToken = generateToken(hospBUser.userid, hospBUser.role);

        // 3. Requester A & User
        const reqAUser = await prisma.users.create({
            data: {
                name: `Requester User A ${testTag}`,
                email: `req_a_${testTag}@swastya.org`,
                password: "hashedpassword123",
                role: user_role.REQUESTER,
            },
        });
        const reqA = await prisma.requesters.create({
            data: {
                userid: reqAUser.userid,
                address: "50 Park Lane",
                city: "Pune",
                state: "Maharashtra",
                pincode: "411001",
            },
        });
        const reqAToken = generateToken(reqAUser.userid, reqAUser.role);

        // 4. Requester B (Foreign requester)
        const reqBUser = await prisma.users.create({
            data: {
                name: `Requester User B ${testTag}`,
                email: `req_b_${testTag}@swastya.org`,
                password: "hashedpassword123",
                role: user_role.REQUESTER,
            },
        });
        const reqB = await prisma.requesters.create({
            data: {
                userid: reqBUser.userid,
                address: "60 Marine Drive",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
            },
        });
        const reqBToken = generateToken(reqBUser.userid, reqBUser.role);

        // 5. Admin User
        const adminUser = await prisma.users.create({
            data: {
                name: `Global Admin ${testTag}`,
                email: `admin_${testTag}@swastya.org`,
                password: "hashedpassword123",
                role: user_role.ADMIN,
            },
        });
        const adminToken = generateToken(adminUser.userid, adminUser.role);

        // Helper: Create donor
        let donorCounter = 0;
        async function createTestDonor(opts: {
            bloodGroup: blood_group;
            lat?: number | null;
            lng?: number | null;
            city?: string;
            availability?: availability_status;
            isEligible?: boolean;
            isActive?: boolean;
            lastDonationDaysAgo?: number | null;
            dob?: Date;
            weight?: number | null;
        }) {
            donorCounter++;
            const dUser = await prisma.users.create({
                data: {
                    name: `Donor ${donorCounter} ${testTag}`,
                    email: `donor_${donorCounter}_${testTag}@swastya.org`,
                    password: "hashedpassword123",
                    role: user_role.DONOR,
                    isactive: opts.isActive ?? true,
                },
            });

            const lastDonationDate = opts.lastDonationDaysAgo !== undefined && opts.lastDonationDaysAgo !== null
                ? new Date(Date.now() - opts.lastDonationDaysAgo * 24 * 60 * 60 * 1000)
                : null;

            const donor = await prisma.donors.create({
                data: {
                    userid: dUser.userid,
                    bloodgroup: opts.bloodGroup,
                    dateofbirth: opts.dob || new Date("1995-05-15"),
                    gender: "MALE",
                    weight: opts.weight ?? 65,
                    city: opts.city || "Pune",
                    state: "Maharashtra",
                    pincode: "411001",
                    latitude: opts.lat !== undefined ? opts.lat : 18.5204,
                    longitude: opts.lng !== undefined ? opts.lng : 73.8567,
                    availabilitystatus: opts.availability || availability_status.AVAILABLE,
                    iseligible: opts.isEligible ?? true,
                    lastdonationdate: lastDonationDate,
                },
                include: {
                    users: true,
                },
            });
            return { donor, user: dUser };
        }

        // =====================================================================
        // TEST 1: Blood Compatibility Filtering
        // =====================================================================
        console.log("\n--- Test 1: Blood Compatibility Filtering (A+ RBC) ---");

        // Hospital A requests A+ Packed Red Blood Cells (RBC)
        // Compatible donor groups for A+ RBC: O-, O+, A-, A+
        // Incompatible donor groups: B-, B+, AB-, AB+
        const req1 = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospAUser.userid,
                hospitalid: hospA.hospitalid,
                patientname: "RBC Recipient Patient",
                patientage: 30,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: blood_group.A_POSITIVE,
                bloodcomponent: blood_component.RBC,
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                searchradius: 10,
                latitude: 18.5204,
                longitude: 73.8567,
                requiredby: new Date(Date.now() + 24 * 3600 * 1000),
            },
            include: { hospitals: true, requesters: true },
        });

        const d_APos = await createTestDonor({ bloodGroup: blood_group.A_POSITIVE, lat: 18.525, lng: 73.858 });
        const d_OPos = await createTestDonor({ bloodGroup: blood_group.O_POSITIVE, lat: 18.530, lng: 73.860 });
        const d_ONeg = await createTestDonor({ bloodGroup: blood_group.O_NEGATIVE, lat: 18.535, lng: 73.862 });
        const d_ANeg = await createTestDonor({ bloodGroup: blood_group.A_NEGATIVE, lat: 18.540, lng: 73.865 });
        const d_BPos = await createTestDonor({ bloodGroup: blood_group.B_POSITIVE, lat: 18.521, lng: 73.857 }); // Closer, but incompatible!
        const d_ABPos = await createTestDonor({ bloodGroup: blood_group.AB_POSITIVE, lat: 18.522, lng: 73.858 }); // Incompatible

        const matchedReq1 = await DonorMatchingService.getRankedEligibleDonors(req1, { limit: 100 });

        const matchedIds1 = matchedReq1.data.map((m) => m.donorId);
        assert(matchedIds1.includes(d_APos.donor.donorid), "1.1 Compatible A+ donor included");
        assert(matchedIds1.includes(d_OPos.donor.donorid), "1.2 Universal RBC O+ donor included for A+ recipient");
        assert(matchedIds1.includes(d_ONeg.donor.donorid), "1.3 Universal O- donor included");
        assert(matchedIds1.includes(d_ANeg.donor.donorid), "1.4 Compatible A- donor included");
        assert(!matchedIds1.includes(d_BPos.donor.donorid), "1.5 Incompatible B+ donor excluded from A+ RBC match");
        assert(!matchedIds1.includes(d_ABPos.donor.donorid), "1.6 Incompatible AB+ donor excluded from A+ RBC match");

        // =====================================================================
        // TEST 2: Component Matching Specificity
        // =====================================================================
        console.log("\n--- Test 2: Component Matching Specificity (PLATELETS vs PLASMA) ---");

        // Platelets: ABO-identical policy enforced in Swastya bloodCompatibility.ts
        const reqPlatelets = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: hospAUser.userid,
                hospitalid: hospA.hospitalid,
                patientname: "Platelets Patient",
                patientage: 25,
                patientgender: "FEMALE",
                patientcontact: "9876543211",
                bloodgroup: blood_group.A_POSITIVE,
                bloodcomponent: blood_component.PLATELETS,
                unitsrequired: 1,
                urgencylevel: "HIGH",
                searchradius: 10,
                latitude: 18.5204,
                longitude: 73.8567,
                requiredby: new Date(Date.now() + 24 * 3600 * 1000),
            },
            include: { hospitals: true, requesters: true },
        });

        const matchedPlatelets = await DonorMatchingService.getRankedEligibleDonors(reqPlatelets, { limit: 100 });
        const plateletMatchedIds = matchedPlatelets.data.map((m) => m.donorId);
        assert(plateletMatchedIds.includes(d_APos.donor.donorid), "2.1 ABO-identical A+ donor included for A+ platelets");
        assert(!plateletMatchedIds.includes(d_OPos.donor.donorid), "2.2 O+ donor excluded for A+ platelets under ABO-identical rule");

        // =====================================================================
        // TEST 3: Inactive, Unavailable, and Medically Ineligible Donor Exclusion
        // =====================================================================
        console.log("\n--- Test 3: Inactive, Unavailable, and Clinical Gates Exclusion ---");

        const d_Inactive = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            isActive: false, // Inactive user
            lat: 18.521,
            lng: 73.857,
        });
        const d_Unavailable = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            availability: availability_status.TEMPORARILY_UNAVAILABLE,
            lat: 18.521,
            lng: 73.857,
        });
        const d_Busy = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            availability: availability_status.PERMANENTLY_UNAVAILABLE,
            lat: 18.521,
            lng: 73.857,
        });
        const d_NotEligible = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            isEligible: false,
            lat: 18.521,
            lng: 73.857,
        });
        const d_Underage = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            dob: new Date(Date.now() - 16 * 365.25 * 24 * 3600 * 1000), // 16 years old
            lat: 18.521,
            lng: 73.857,
        });
        const d_Overage = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            dob: new Date(Date.now() - 68 * 365.25 * 24 * 3600 * 1000), // 68 years old
            lat: 18.521,
            lng: 73.857,
        });
        const d_Underweight = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            weight: 44, // Below 50kg
            lat: 18.521,
            lng: 73.857,
        });

        const matchedExclusions = await DonorMatchingService.getRankedEligibleDonors(req1, { limit: 100 });
        const exclusionIds = matchedExclusions.data.map((m) => m.donorId);

        assert(!exclusionIds.includes(d_Inactive.donor.donorid), "3.1 Inactive donor account excluded");
        assert(!exclusionIds.includes(d_Unavailable.donor.donorid), "3.2 UNAVAILABLE status donor excluded");
        assert(!exclusionIds.includes(d_Busy.donor.donorid), "3.3 BUSY status donor excluded");
        assert(!exclusionIds.includes(d_NotEligible.donor.donorid), "3.4 iseligible=false donor excluded");
        assert(!exclusionIds.includes(d_Underage.donor.donorid), "3.5 Underage donor (<18) excluded");
        assert(!exclusionIds.includes(d_Overage.donor.donorid), "3.6 Overage donor (>65) excluded");
        assert(!exclusionIds.includes(d_Underweight.donor.donorid), "3.7 Underweight donor (<50kg) excluded");

        // =====================================================================
        // TEST 4: Donation Cooldown Enforcement
        // =====================================================================
        console.log("\n--- Test 4: Donation Cooldown Enforcement (90 Days) ---");

        const d_CooldownActive = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            lastDonationDaysAgo: 45, // 45 days ago -> in cooldown
            lat: 18.521,
            lng: 73.857,
        });
        const d_CooldownCleared = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            lastDonationDaysAgo: 105, // 105 days ago -> cooldown cleared
            lat: 18.522,
            lng: 73.858,
        });

        const matchedCooldown = await DonorMatchingService.getRankedEligibleDonors(req1, { limit: 100 });
        const cooldownIds = matchedCooldown.data.map((m) => m.donorId);

        assert(!cooldownIds.includes(d_CooldownActive.donor.donorid), "4.1 Donor within 90-day cooldown excluded");
        assert(cooldownIds.includes(d_CooldownCleared.donor.donorid), "4.2 Donor past 90-day cooldown included");

        // =====================================================================
        // TEST 5: Distance Ranking & Geographic Boundary
        // =====================================================================
        console.log("\n--- Test 5: Distance Ranking & Geographic Boundary ---");

        // Distance ranking check with identical other factors
        const d_Close = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            lat: 18.5220, // ~0.2 km from hospital (18.5204, 73.8567)
            lng: 73.8570,
        });
        const d_Far = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            lat: 18.5800, // ~7.0 km from hospital
            lng: 73.8900,
        });
        const d_OutsideRadius = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            lat: 18.7500, // ~25 km away (radius is 10 km)
            lng: 74.0000,
        });

        const matchedDistance = await DonorMatchingService.getRankedEligibleDonors(req1, { limit: 100 });
        const distanceItems = matchedDistance.data;
        const distIds = distanceItems.map((m) => m.donorId);

        assert(distIds.includes(d_Close.donor.donorid), "5.1 Close donor included");
        assert(distIds.includes(d_Far.donor.donorid), "5.2 Far within-radius donor included");
        assert(!distIds.includes(d_OutsideRadius.donor.donorid), "5.3 Donor outside 10 km search radius excluded");

        const closeItem = distanceItems.find((m) => m.donorId === d_Close.donor.donorid)!;
        const farItem = distanceItems.find((m) => m.donorId === d_Far.donor.donorid)!;
        assert(
            closeItem.scoreBreakdown.distanceScore > farItem.scoreBreakdown.distanceScore,
            "5.4 Closer donor receives strictly higher distanceScore than farther donor",
            `close=${closeItem.scoreBreakdown.distanceScore}, far=${farItem.scoreBreakdown.distanceScore}`
        );
        assert(
            closeItem.matchScore > farItem.matchScore,
            "5.5 Closer donor has higher overall matchScore"
        );

        // =====================================================================
        // TEST 6: Missing-Coordinate Fallback (City Match vs Non-Match)
        // =====================================================================
        console.log("\n--- Test 6: Missing-Coordinate Fallback ---");

        const d_CityMatchNoCoords = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            lat: null,
            lng: null,
            city: "Pune", // Matches hospital A city
        });
        const d_CityMismatchNoCoords = await createTestDonor({
            bloodGroup: blood_group.A_POSITIVE,
            lat: null,
            lng: null,
            city: "Nagpur", // Mismatched city
        });

        const matchedFallback = await DonorMatchingService.getRankedEligibleDonors(req1, { limit: 100 });
        const fallbackIds = matchedFallback.data.map((m) => m.donorId);

        assert(fallbackIds.includes(d_CityMatchNoCoords.donor.donorid), "6.1 City fallback donor included when coordinates null");
        assert(!fallbackIds.includes(d_CityMismatchNoCoords.donor.donorid), "6.2 Mismatched city donor excluded when coordinates null");

        const fallbackItem = matchedFallback.data.find((m) => m.donorId === d_CityMatchNoCoords.donor.donorid)!;
        assert(fallbackItem.matchType === "CITY_FALLBACK", "6.3 Match type recorded as CITY_FALLBACK");
        assert(fallbackItem.distanceKm === null, "6.4 distanceKm is null (does not invent precision)");
        assert(fallbackItem.scoreBreakdown.distanceScore === 20, "6.5 Neutral 20/40 distance score awarded for city fallback");
        assert(fallbackItem.explanations.location.includes("Exact distance unavailable"), "6.6 Location explanation mentions coordinates unavailable");

        // =====================================================================
        // TEST 7: Cold-Start vs Historical Response Reliability
        // =====================================================================
        console.log("\n--- Test 7: Cold-Start Donors & Historical Response Scoring ---");

        // Helper requests for historical broadcast records
        const histReqs: any[] = [];
        for (let r = 0; r < 4; r++) {
            const hr = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: hospAUser.userid,
                    hospitalid: hospA.hospitalid,
                    patientname: `Hist Patient ${r} ${testTag}`,
                    patientage: 30 + r,
                    patientgender: "MALE",
                    patientcontact: "9876543210",
                    bloodgroup: blood_group.A_POSITIVE,
                    bloodcomponent: blood_component.RBC,
                    unitsrequired: 1,
                    urgencylevel: "HIGH",
                    requiredby: new Date(Date.now() + 24 * 3600 * 1000),
                },
            });
            histReqs.push(hr);
        }

        // A. Cold start: 0 deliveries
        const d_ZeroDeliveries = await createTestDonor({ bloodGroup: blood_group.A_POSITIVE, lat: 18.523, lng: 73.857 });

        // B. Insufficient history: 2 deliveries (< 3)
        const d_TwoDeliveries = await createTestDonor({ bloodGroup: blood_group.A_POSITIVE, lat: 18.523, lng: 73.857 });
        for (let i = 1; i <= 2; i++) {
            const b = await prisma.emergencybroadcasts.create({
                data: {
                    requestid: histReqs[i - 1].requestid,
                    triggeredbyuserid: hospAUser.userid,
                    triggertype: "MANUAL",
                    status: "ACTIVE",
                },
            });
            await prisma.broadcastdeliveries.create({
                data: {
                    broadcastid: b.broadcastid,
                    requestid: histReqs[i - 1].requestid,
                    donorid: d_TwoDeliveries.donor.donorid,
                    donoruserid: d_TwoDeliveries.user.userid,
                    matchtype: "COORDINATES",
                    deliverystatus: "DELIVERED",
                    response: "ACCEPTED",
                },
            });
        }

        // C. Sufficient history: 4 deliveries, 4 accepted (100%)
        const d_HighReliability = await createTestDonor({ bloodGroup: blood_group.A_POSITIVE, lat: 18.523, lng: 73.857 });
        for (let i = 1; i <= 4; i++) {
            const b = await prisma.emergencybroadcasts.create({
                data: {
                    requestid: histReqs[i - 1].requestid,
                    triggeredbyuserid: hospAUser.userid,
                    triggertype: "MANUAL",
                    status: "ACTIVE",
                },
            });
            await prisma.broadcastdeliveries.create({
                data: {
                    broadcastid: b.broadcastid,
                    requestid: histReqs[i - 1].requestid,
                    donorid: d_HighReliability.donor.donorid,
                    donoruserid: d_HighReliability.user.userid,
                    matchtype: "COORDINATES",
                    deliverystatus: "DELIVERED",
                    response: "ACCEPTED",
                },
            });
        }

        // D. Sufficient history: 4 deliveries, 1 accepted (25%)
        const d_LowReliability = await createTestDonor({ bloodGroup: blood_group.A_POSITIVE, lat: 18.523, lng: 73.857 });
        for (let i = 1; i <= 4; i++) {
            const b = await prisma.emergencybroadcasts.create({
                data: {
                    requestid: histReqs[i - 1].requestid,
                    triggeredbyuserid: hospAUser.userid,
                    triggertype: "MANUAL",
                    status: "ACTIVE",
                },
            });
            await prisma.broadcastdeliveries.create({
                data: {
                    broadcastid: b.broadcastid,
                    requestid: histReqs[i - 1].requestid,
                    donorid: d_LowReliability.donor.donorid,
                    donoruserid: d_LowReliability.user.userid,
                    matchtype: "COORDINATES",
                    deliverystatus: "DELIVERED",
                    response: i === 1 ? "ACCEPTED" : "DECLINED",
                },
            });
        }

        const matchedHistory = await DonorMatchingService.getRankedEligibleDonors(req1, { limit: 100 });

        const itemZero = matchedHistory.data.find((m) => m.donorId === d_ZeroDeliveries.donor.donorid)!;
        const itemTwo = matchedHistory.data.find((m) => m.donorId === d_TwoDeliveries.donor.donorid)!;
        const itemHigh = matchedHistory.data.find((m) => m.donorId === d_HighReliability.donor.donorid)!;
        const itemLow = matchedHistory.data.find((m) => m.donorId === d_LowReliability.donor.donorid)!;

        assert(itemZero.scoreBreakdown.responseScore === 15, "7.1 Cold-start donor (0 deliveries) gets neutral 15/30 response score");
        assert(itemTwo.scoreBreakdown.responseScore === 15, "7.2 Donor with < 3 deliveries gets neutral 15/30 response score");
        assert(itemHigh.scoreBreakdown.responseScore === 30, "7.3 High-reliability donor (100% accepted, N=4) gets full 30/30 response score");
        assert(itemLow.scoreBreakdown.responseScore === 8, "7.4 Low-reliability donor (25% accepted, N=4) gets 8/30 response score", `got=${itemLow.scoreBreakdown.responseScore}`);

        assert(itemZero.explanations.responsiveness.includes("neutral baseline"), "7.5 Cold-start explanation indicates neutral score");
        assert(itemHigh.explanations.responsiveness.includes("100% acceptance"), "7.6 Reliable donor explanation indicates acceptance rate");

        // =====================================================================
        // TEST 8: Ranking Score Bounds and Score Composition
        // =====================================================================
        console.log("\n--- Test 8: Score Bounds & Breakdown Validation ---");

        let allScoresBounded = true;
        let allSumsMatch = true;
        for (const item of matchedHistory.data) {
            if (item.matchScore < 0 || item.matchScore > 100) allScoresBounded = false;
            const sum = item.scoreBreakdown.distanceScore + item.scoreBreakdown.availabilityScore + item.scoreBreakdown.responseScore;
            if (sum !== item.scoreBreakdown.totalScore || item.matchScore !== item.scoreBreakdown.totalScore) {
                allSumsMatch = false;
            }
        }
        assert(allScoresBounded, "8.1 All candidate matchScores strictly bounded within [0, 100]");
        assert(allSumsMatch, "8.2 scoreBreakdown distance + availability + response matches matchScore for every donor");

        // Verify sorting order: descending by matchScore
        let correctlySorted = true;
        for (let i = 0; i < matchedHistory.data.length - 1; i++) {
            if (matchedHistory.data[i].matchScore < matchedHistory.data[i + 1].matchScore) {
                correctlySorted = false;
                break;
            }
        }
        assert(correctlySorted, "8.3 Matched donors are strictly sorted in descending order of matchScore");

        // =====================================================================
        // TEST 9: HTTP Endpoint Authorization & Tenant Isolation
        // =====================================================================
        console.log("\n--- Test 9: HTTP API Authorization & Tenant Isolation ---");

        // 9.1 Hospital A accessing Hospital A request -> 200 OK
        const resHospA_ReqA = await reqJson("GET", `/bloodrequests/${req1.requestid}/matched-donors`, undefined, hospAToken);
        if (resHospA_ReqA.status !== 200) {
            console.error("DEBUG 9.1:", resHospA_ReqA.status, JSON.stringify(resHospA_ReqA.data));
        }
        assert(resHospA_ReqA.status === 200, "9.1 Owning hospital receives HTTP 200 OK");
        assert(resHospA_ReqA.data?.success === true, "9.1b Response format has success=true");
        assert(Array.isArray(resHospA_ReqA.data?.data), "9.1c Response contains data array");
        assert(typeof resHospA_ReqA.data?.total === "number", "9.1d Response contains total count");

        // 9.2 Hospital B accessing Hospital A request -> 403 Forbidden
        const resHospB_ReqA = await reqJson("GET", `/bloodrequests/${req1.requestid}/matched-donors`, undefined, hospBToken);
        if (resHospB_ReqA.status !== 403) {
            console.error("DEBUG 9.2:", resHospB_ReqA.status, JSON.stringify(resHospB_ReqA.data));
        }
        assert(resHospB_ReqA.status === 403, "9.2 Foreign Hospital B blocked with 403 Forbidden");

        // 9.3 Requester A creating request and accessing -> 200 OK
        const reqByRequesterA = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: reqAUser.userid,
                requesterid: reqA.requesterid,
                patientname: "Requester Patient",
                patientage: 40,
                patientgender: "MALE",
                patientcontact: "9876543212",
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsrequired: 1,
                urgencylevel: "HIGH",
                searchradius: 10,
                latitude: 18.5204,
                longitude: 73.8567,
                requiredby: new Date(Date.now() + 24 * 3600 * 1000),
            },
        });

        const resReqA_ReqA = await reqJson("GET", `/bloodrequests/${reqByRequesterA.requestid}/matched-donors`, undefined, reqAToken);
        assert(resReqA_ReqA.status === 200, "9.3 Owning Requester receives HTTP 200 OK");

        // 9.4 Requester B accessing Requester A request -> 403 Forbidden
        const resReqB_ReqA = await reqJson("GET", `/bloodrequests/${reqByRequesterA.requestid}/matched-donors`, undefined, reqBToken);
        assert(resReqB_ReqA.status === 403, "9.4 Foreign Requester B blocked with 403 Forbidden");

        // 9.5 Global Admin accessing any request -> 200 OK
        const resAdmin_ReqA = await reqJson("GET", `/bloodrequests/${req1.requestid}/matched-donors`, undefined, adminToken);
        assert(resAdmin_ReqA.status === 200, "9.5 Global Admin receives HTTP 200 OK");

        // 9.6 Donor role caller blocked -> 403 Forbidden
        const donorUserToken = generateToken(d_APos.user.userid, d_APos.user.role);
        const resDonor_ReqA = await reqJson("GET", `/bloodrequests/${req1.requestid}/matched-donors`, undefined, donorUserToken);
        assert(resDonor_ReqA.status === 403, "9.6 Donor role caller blocked with 403 Forbidden");

        // 9.7 Unauthenticated caller -> 401 Unauthorized
        const resUnauth = await reqJson("GET", `/bloodrequests/${req1.requestid}/matched-donors`);
        assert(resUnauth.status === 401, "9.7 Unauthenticated request rejected with 401 Unauthorized");

        // 9.8 Non-existent UUID -> 404 Not Found
        const res404 = await reqJson("GET", `/bloodrequests/${crypto.randomUUID()}/matched-donors`, undefined, adminToken);
        assert(res404.status === 404, "9.8 Non-existent request ID returns 404 Not Found");

        // 9.9 Pagination testing
        const resPage = await reqJson("GET", `/bloodrequests/${req1.requestid}/matched-donors?page=1&limit=2`, undefined, hospAToken);
        assert(resPage.status === 200 && resPage.data.data.length <= 2, "9.9 Pagination limits response to limit=2");
        assert(resPage.data.page === 1 && resPage.data.limit === 2, "9.9b Pagination metadata correctly returned");

    } finally {
        server.close();
        await prisma.$disconnect();
    }

    console.log("\n===============================================================================");
    console.log(`  DONOR MATCHING TEST SUMMARY: ${passedTests} passed, ${failedTests} failed (Total: ${totalTests})`);
    console.log("===============================================================================\n");

    if (failedTests > 0) {
        console.error("Failures:");
        failures.forEach((f) => console.error(`  - ${f.error}`));
        process.exit(1);
    }
}

runDonorMatchingTestSuite().catch((err) => {
    console.error("FATAL ERROR IN TEST SUITE:", err);
    process.exit(1);
});
