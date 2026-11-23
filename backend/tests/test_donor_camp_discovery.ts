import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

import { prisma } from "../src/config/prisma";
import { CampService } from "../src/services/camp.service";
import {
    user_role,
    camp_status,
    camp_registration_availability,
    camp_registration_status,
    camp_attendance_status,
    blood_group,
    gender_type,
} from "../src/generated/prisma/enums";

let totalTests = 0;
let passedTests = 0;
const failures: Array<{ name: string; error: any }> = [];

function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [PASS] ${testName}`);
    } else {
        failures.push({ name: testName, error: detail || "Assertion failed" });
        console.error(`  [FAIL] ${testName} - ${detail || "Condition not met"}`);
    }
}

async function runFeature6TestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: FEATURE 6 - NEARBY BLOOD CAMP DISCOVERY & DONOR REGISTRATION       ");
    console.log("===============================================================================");

    // -------------------------------------------------------------------------
    // 1. SAFETY & ISOLATION GUARDS
    // -------------------------------------------------------------------------
    console.log("\n--- 1. Safety Guards & Database Protection ---");
    const dbUrl = process.env.DATABASE_URL || "";
    assert(
        !dbUrl.includes("neon.tech") && !dbUrl.includes("prod"),
        "1.1 Tests strictly avoid remote production Neon database",
        `Target DB URL: ${dbUrl}`
    );
    assert(
        dbUrl.includes("swastya_test"),
        "1.2 Target database is strictly swastya_test",
        `Expected swastya_test in URL, got ${dbUrl}`
    );

    const testStamp = Date.now();
    const bbEmail = `f6_bb_${testStamp}@swastya.org`;
    const donor1Email = `f6_donor_1_${testStamp}@swastya.org`;
    const donor2Email = `f6_donor_2_${testStamp}@swastya.org`;
    const donor3Email = `f6_donor_3_${testStamp}@swastya.org`;
    const testCampIds: string[] = [];

    // -------------------------------------------------------------------------
    // SETUP FIXTURES
    // -------------------------------------------------------------------------
    console.log("\n--- Setting up test fixtures in swastya_test ---");

    // Blood Bank
    const bbUser = await prisma.users.create({
        data: {
            name: "Dr. Feature6 Organizer",
            email: bbEmail,
            phonenumber: "+919876543200",
            password: "hashed_test_password",
            role: user_role.BLOOD_BANK,
            emailverified: true,
            isactive: true,
        },
    });
    const bloodBank = await prisma.bloodbanks.create({
        data: {
            userid: bbUser.userid,
            bloodbankname: "Metro Central Regional Blood Center",
            licensenumber: `LIC-F6-${testStamp}`,
            contactpersonname: "Dr. Feature6 Organizer",
            contactpersonphone: "+919876543200",
            address: "100 Medical College Avenue",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9400,
            longitude: 72.8350,
        },
    });

    // Donors
    const createDonorFixture = async (email: string, name: string, phone: string, bg: blood_group) => {
        const u = await prisma.users.create({
            data: {
                name,
                email,
                phonenumber: phone,
                password: "hashed_test_password",
                role: user_role.DONOR,
                emailverified: true,
                isactive: true,
            },
        });
        const d = await prisma.donors.create({
            data: {
                userid: u.userid,
                dateofbirth: new Date("1996-05-15"),
                gender: gender_type.MALE,
                bloodgroup: bg,
                address: "Flat 402, Sea Green Apts",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400002",
                latitude: 18.9450,
                longitude: 72.8380,
                iseligible: true,
            },
        });
        return { user: u, donor: d };
    };

    const d1 = await createDonorFixture(donor1Email, "Aarav Sharma", "+919876543201", blood_group.O_POSITIVE);
    const d2 = await createDonorFixture(donor2Email, "Neha Verma", "+919876543202", blood_group.A_POSITIVE);
    const d3 = await createDonorFixture(donor3Email, "Rohan Kulkarni", "+919876543203", blood_group.B_POSITIVE);

    console.log("Fixtures created successfully.");

    try {
        // -------------------------------------------------------------------------
        // 2. DISCOVERY & FILTERING OF CAMPS
        // -------------------------------------------------------------------------
        console.log("\n--- 2. Camp Discovery & Visibility Rules ---");

        const now = new Date();
        const d1Day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 0, 0, 0);
        const campDate1Str = `${d1Day.getFullYear()}-${String(d1Day.getMonth() + 1).padStart(2, "0")}-${String(d1Day.getDate()).padStart(2, "0")}`;
        const regOpening1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const regDeadline1 = new Date(d1Day.getFullYear(), d1Day.getMonth(), d1Day.getDate(), 8, 0, 0);

        const d2Day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 12, 0, 0, 0);
        const campDate2Str = `${d2Day.getFullYear()}-${String(d2Day.getMonth() + 1).padStart(2, "0")}-${String(d2Day.getDate()).padStart(2, "0")}`;
        const regOpening2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const regDeadline2 = new Date(d2Day.getFullYear(), d2Day.getMonth(), d2Day.getDate(), 8, 0, 0);

        // Published Camp 1 (Mumbai South - Fort, Registration Required, Capacity 2)
        const campPub1 = await CampService.createCamp(bloodBank.bloodbankid, bbUser.userid, {
            campname: `Mumbai Youth Blood Drive ${testStamp}`,
            organizername: "Youth Red Cross Mumbai",
            contactperson: "Amit Joshi",
            contactphone: "+919876543299",
            campdate: campDate1Str,
            starttime: "09:00",
            endtime: "17:00",
            registrationopeningdate: regOpening1.toISOString(),
            registrationdeadline: regDeadline1.toISOString(),
            venuename: "Fort Community Hall",
            address: "12 Mahatma Gandhi Road, Fort",
            city: "Mumbai",
            district: "Mumbai City",
            state: "Maharashtra",
            pincode: "400001",
            latitude: 18.9320,
            longitude: 72.8320,
            isregistrationrequired: true,
            maxcapacity: 2, // low capacity for limit testing
            status: camp_status.PUBLISHED,
        });
        testCampIds.push(campPub1.campid);

        // Published Camp 2 (Pune - Walk-in, Advance Registration NOT required)
        const campPub2 = await CampService.createCamp(bloodBank.bloodbankid, bbUser.userid, {
            campname: `Pune Corporate Mega Camp ${testStamp}`,
            organizername: "Tech Park CSR Guild",
            contactperson: "Sunita Rane",
            contactphone: "+919876543288",
            campdate: campDate2Str,
            starttime: "10:00",
            endtime: "16:00",
            registrationopeningdate: regOpening2.toISOString(),
            registrationdeadline: regDeadline2.toISOString(),
            venuename: "Hinjewadi Tech Center",
            address: "Phase 1 Hinjewadi",
            city: "Pune",
            district: "Pune",
            state: "Maharashtra",
            pincode: "411057",
            latitude: 18.5913,
            longitude: 73.7389,
            isregistrationrequired: false, // WALK-IN
            status: camp_status.PUBLISHED,
        });
        testCampIds.push(campPub2.campid);

        // Draft Camp (Should NEVER be visible in discovery)
        const campDraft = await CampService.createCamp(bloodBank.bloodbankid, bbUser.userid, {
            campname: `Draft Secret Drive ${testStamp}`,
            organizername: "Private Guild",
            contactperson: "S. K.",
            campdate: campDate1Str,
            starttime: "09:00",
            endtime: "15:00",
            registrationopeningdate: regOpening1.toISOString(),
            registrationdeadline: regDeadline1.toISOString(),
            venuename: "Private Club",
            address: "Private Lane",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            isregistrationrequired: true,
            status: camp_status.DRAFT,
        });
        testCampIds.push(campDraft.campid);

        // Test 2.1: Discover only published camps
        const discoveryAll = await CampService.discoverCamps({ search: `${testStamp}` });
        assert(
            discoveryAll.total === 2,
            "2.1 Discover returns only PUBLISHED camps matching test stamp",
            `Expected 2 published camps, found ${discoveryAll.total}`
        );
        const hasDraft = discoveryAll.camps.some((c) => c.campid === campDraft.campid);
        assert(!hasDraft, "2.2 DRAFT camps are strictly excluded from public discovery");

        // Test 2.2: City filter
        const discoveryCity = await CampService.discoverCamps({ city: "Pune", search: `${testStamp}` });
        assert(
            discoveryCity.total === 1 && discoveryCity.camps[0].campid === campPub2.campid,
            "2.3 Discovery accurately filters by city (Pune)",
            `Returned ${discoveryCity.total} camps`
        );

        // Test 2.3: Date range filter
        const fromDateStr = campDate1Str;
        const toDateStr = campDate1Str;
        const discoveryDate = await CampService.discoverCamps({
            dateFrom: fromDateStr,
            dateTo: toDateStr,
            search: `${testStamp}`,
        });
        assert(
            discoveryDate.total === 1 && discoveryDate.camps[0].campid === campPub1.campid,
            "2.4 Discovery accurately filters by dateFrom and dateTo range",
            `Returned ${discoveryDate.total} camps`
        );

        // Test 2.4: Keyword search by venue and organizer
        const searchByVenue = await CampService.discoverCamps({ search: "Fort Community Hall" });
        assert(
            searchByVenue.camps.some((c) => c.campid === campPub1.campid),
            "2.5 Search finds camp by venue name"
        );

        // -------------------------------------------------------------------------
        // 3. GEOLOCATION & HAVERSINE DISTANCE COMPUTATION
        // -------------------------------------------------------------------------
        console.log("\n--- 3. Geolocation & Distance Calculation ---");

        // Query near Mumbai coordinates (18.9400, 72.8350)
        const geoDiscovery = await CampService.discoverCamps({
            latitude: 18.9400,
            longitude: 72.8350,
            radiusKm: 25,
            search: `${testStamp}`,
        });

        assert(
            geoDiscovery.total === 1 && geoDiscovery.camps[0].campid === campPub1.campid,
            "3.1 25km radius filter includes Mumbai camp and excludes Pune (~120km away)",
            `Found ${geoDiscovery.total} camps within 25km`
        );

        const mumbaiCampDistance = geoDiscovery.camps[0].distancekm;
        assert(
            mumbaiCampDistance !== null && mumbaiCampDistance !== undefined && mumbaiCampDistance < 2.0,
            "3.2 Computed distance in km is accurate for nearby camp (< 2.0 km)",
            `Distance: ${mumbaiCampDistance} km`
        );

        // Wide radius 200km should return both ordered by distance
        const wideRadius = await CampService.discoverCamps({
            latitude: 18.9400,
            longitude: 72.8350,
            radiusKm: 200,
            search: `${testStamp}`,
        });
        assert(
            wideRadius.total === 2,
            "3.3 200km radius includes both camps",
            `Found ${wideRadius.total} camps`
        );
        assert(
            (wideRadius.camps[0].distancekm ?? 0) <= (wideRadius.camps[1].distancekm ?? 0),
            "3.4 Camps sorted ascending by distance from donor coordinates"
        );

        // -------------------------------------------------------------------------
        // 4. PUBLIC DETAIL & ZERO PII EXPOSURE
        // -------------------------------------------------------------------------
        console.log("\n--- 4. Public Camp Details & PII Protection ---");

        const pubDetail = await CampService.getPublicCampById(campPub1.campid);
        assert(
            pubDetail.campid === campPub1.campid && pubDetail.campname === campPub1.campname,
            "4.1 Public camp detail endpoint returns full camp information"
        );
        assert(
            pubDetail.isregistrationopen === true,
            "4.2 Public detail reflects registration is open"
        );
        assert(
            pubDetail.remainingcapacity === 2 && pubDetail.registeredcount === 0,
            "4.3 Public detail reports initial capacity: 2 remaining, 0 registered"
        );
        assert(
            (pubDetail as any).registrations === undefined && (pubDetail as any).donorname === undefined,
            "4.4 Zero donor PII exposed in public camp detail response"
        );

        // -------------------------------------------------------------------------
        // 5. DONOR REGISTRATION WORKFLOW & CAPACITY ENFORCEMENT
        // -------------------------------------------------------------------------
        console.log("\n--- 5. Donor Registration Flow & Capacity Enforcement ---");

        // 5.1 Donor 1 registers
        const reg1 = await CampService.registerDonorForCamp(campPub1.campid, d1.user.userid);
        assert(
            reg1.registrationid !== undefined && reg1.registrationreference.startsWith("CAMP-"),
            "5.1 Donor 1 registers successfully with reference CAMP-YYYYMMDD-XXXXXXXX",
            `Ref: ${reg1.registrationreference}`
        );

        // Check persistent notification
        const donorNotification = await prisma.notification.findFirst({
            where: { userid: d1.user.userid, message: { contains: reg1.registrationreference } },
        });
        assert(
            donorNotification !== null,
            "5.2 Confirmation notification persisted for registered donor"
        );

        // Check audit log
        const auditLog1 = await prisma.campaudithistory.findFirst({
            where: { campid: campPub1.campid, action: "DONOR_REGISTERED" },
        });
        assert(
            auditLog1 !== null && auditLog1.changedbyuserid === d1.user.userid,
            "5.3 Registration logged in camp audit history"
        );

        // 5.2 Duplicate registration attempt by Donor 1
        let dupError: any = null;
        try {
            await CampService.registerDonorForCamp(campPub1.campid, d1.user.userid);
        } catch (e: any) {
            dupError = e;
        }
        assert(
            dupError !== null && dupError.message.includes("already registered"),
            "5.4 Duplicate registration rejected gracefully",
            `Error message: ${dupError?.message}`
        );

        // 5.3 Donor 2 registers (fills slot 2 of 2)
        const reg2 = await CampService.registerDonorForCamp(campPub1.campid, d2.user.userid);
        assert(
            reg2.registrationid !== undefined && reg2.registrationreference !== reg1.registrationreference,
            "5.5 Donor 2 registers successfully with distinct unique reference"
        );

        // Check public detail capacity status
        const pubDetailFull = await CampService.getPublicCampById(campPub1.campid);
        assert(
            pubDetailFull.remainingcapacity === 0 && pubDetailFull.registeredcount === 2,
            "5.6 Registered count reached 2 and remaining capacity is 0"
        );
        assert(
            pubDetailFull.isregistrationopen === false,
            "5.7 Camp public detail reports isregistrationopen = false once capacity is filled"
        );

        // 5.4 Donor 3 attempts to register when capacity is full
        let capError: any = null;
        try {
            await CampService.registerDonorForCamp(campPub1.campid, d3.user.userid);
        } catch (e: any) {
            capError = e;
        }
        assert(
            capError !== null && capError.message.includes("capacity has been reached"),
            "5.8 Registration rejected when maximum capacity is reached",
            `Error message: ${capError?.message}`
        );

        // -------------------------------------------------------------------------
        // 6. WALK-IN CAMPS (Advance Registration Not Required)
        // -------------------------------------------------------------------------
        console.log("\n--- 6. Walk-in Camp Handling ---");

        let walkinError: any = null;
        try {
            await CampService.registerDonorForCamp(campPub2.campid, d1.user.userid);
        } catch (e: any) {
            walkinError = e;
        }
        assert(
            walkinError !== null && walkinError.message.includes("Walk-in donors are welcome"),
            "6.1 Advance registration rejected for walk-in camp (isregistrationrequired = false)",
            `Error message: ${walkinError?.message}`
        );

        // -------------------------------------------------------------------------
        // 7. DONOR SELF-CANCELLATION & SLOT LIBERATION
        // -------------------------------------------------------------------------
        console.log("\n--- 7. Donor Self-Cancellation & Slot Freeing ---");

        const cancelledReg1 = await CampService.cancelDonorRegistration(
            d1.user.userid,
            reg1.registrationid,
            "Personal schedule conflict"
        );
        assert(
            cancelledReg1.registrationstatus === camp_registration_status.CANCELLED &&
            cancelledReg1.cancellationreason === "Personal schedule conflict",
            "7.1 Donor 1 cancels registration with reason and timestamp",
            `Status: ${cancelledReg1.registrationstatus}`
        );

        // Confirm slot freed immediately in public details
        const pubDetailFreed = await CampService.getPublicCampById(campPub1.campid);
        assert(
            pubDetailFreed.remainingcapacity === 1 && pubDetailFreed.registeredcount === 1,
            "7.2 Cancelling immediately frees slot (1 remaining, 1 registered)"
        );
        assert(
            pubDetailFreed.isregistrationopen === true,
            "7.3 Registration automatically re-opens once a slot is freed"
        );

        // Check cancellation audit log
        const cancelAudit = await prisma.campaudithistory.findFirst({
            where: { campid: campPub1.campid, action: "DONOR_CANCELLED_SELF" },
        });
        assert(
            cancelAudit !== null,
            "7.4 Donor cancellation recorded in camp audit trail"
        );

        // -------------------------------------------------------------------------
        // 8. SAFE RE-REGISTRATION AFTER CANCELLATION
        // -------------------------------------------------------------------------
        console.log("\n--- 8. Safe Re-registration Flow ---");

        // Donor 1 re-registers for campPub1
        const reregistered1 = await CampService.registerDonorForCamp(campPub1.campid, d1.user.userid);
        assert(
            reregistered1.registrationid === reg1.registrationid,
            "8.1 Re-registration reactivates the same registration entity without creating duplicate rows"
        );
        assert(
            reregistered1.registrationstatus === camp_registration_status.REGISTERED,
            "8.2 Re-registered record status is updated back to REGISTERED"
        );
        assert(
            reregistered1.registrationreference === reg1.registrationreference,
            "8.3 Original registration reference is preserved across cancellation and re-registration"
        );
        assert(
            (reregistered1 as any).previouscancellationreason === "Personal schedule conflict",
            "8.4 Historical cancellation reason is retained in previouscancellationreason"
        );

        // Re-registration audit log
        const reregAudit = await prisma.campaudithistory.findFirst({
            where: { campid: campPub1.campid, action: "DONOR_REREGISTERED" },
        });
        assert(
            reregAudit !== null,
            "8.5 Re-registration recorded in camp audit trail"
        );

        // -------------------------------------------------------------------------
        // 9. ATTENDANCE & TERMINAL STATUS GUARDS
        // -------------------------------------------------------------------------
        console.log("\n--- 9. Attendance Protection & Terminal Cancellation Guards ---");

        // Blood bank records attendance for Donor 2
        await CampService.updateAttendance(campPub1.campid, bloodBank.bloodbankid, bbUser.userid, reg2.registrationid, {
            attendancestatus: camp_attendance_status.ATTENDED,
            unitsdonated: 1,
            attendancenotes: "Whole blood 450ml collected successfully",
        });

        // Donor 2 attempts to self-cancel after attendance
        let attendedCancelError: any = null;
        try {
            await CampService.cancelDonorRegistration(d2.user.userid, reg2.registrationid, "Trying to cancel");
        } catch (e: any) {
            attendedCancelError = e;
        }
        assert(
            attendedCancelError !== null && attendedCancelError.message.includes("after attendance has been recorded"),
            "9.1 Donor self-cancellation strictly rejected once attendance is recorded (ATTENDED)",
            `Error message: ${attendedCancelError?.message}`
        );

        // -------------------------------------------------------------------------
        // 10. DONOR REGISTRATION HISTORY (GET /donors/me/camp-registrations)
        // -------------------------------------------------------------------------
        console.log("\n--- 10. Donor Registrations History Listing ---");

        const d1History = await CampService.getDonorRegistrations(d1.user.userid);
        assert(
            d1History.length >= 1 && d1History[0].registrationreference === reg1.registrationreference,
            "10.1 Donor 1 retrieves their camp registrations history with camp details"
        );
        assert(
            d1History[0].camp.campname === campPub1.campname,
            "10.2 Registration history contains embedded camp metadata (name, venue, date, time)"
        );

        const d2History = await CampService.getDonorRegistrations(d2.user.userid);
        assert(
            d2History.length >= 1 && d2History[0].attendancestatus === camp_attendance_status.ATTENDED,
            "10.3 Donor 2 history displays attended status and donated units (1 Unit)"
        );

    } finally {
        // -------------------------------------------------------------------------
        // CLEANUP FIXTURES
        // -------------------------------------------------------------------------
        console.log("\n--- Cleaning up test fixtures in swastya_test ---");
        try {
            for (const cId of testCampIds) {
                await prisma.notification.deleteMany({
                    where: { message: { contains: cId } },
                });
                await prisma.campaudithistory.deleteMany({ where: { campid: cId } });
                await prisma.campstatushistory.deleteMany({ where: { campid: cId } });
                await prisma.campregistrations.deleteMany({ where: { campid: cId } });
                await prisma.donationcamps.deleteMany({ where: { campid: cId } });
            }

            // Delete donor notifications
            await prisma.notification.deleteMany({
                where: { userid: { in: [d1.user.userid, d2.user.userid, d3.user.userid] } },
            });

            // Delete donors and users
            await prisma.donors.deleteMany({
                where: { userid: { in: [d1.user.userid, d2.user.userid, d3.user.userid] } },
            });
            await prisma.bloodbanks.deleteMany({ where: { bloodbankid: bloodBank.bloodbankid } });
            await prisma.users.deleteMany({
                where: { userid: { in: [bbUser.userid, d1.user.userid, d2.user.userid, d3.user.userid] } },
            });
            console.log("Cleanup completed.");
        } catch (cleanupErr) {
            console.warn("Cleanup warning:", cleanupErr);
        }
    }

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n===============================================================================");
    console.log(`  FEATURE 6 TEST SUMMARY: ${passedTests} / ${totalTests} PASSED`);
    console.log("===============================================================================");

    if (failures.length > 0) {
        console.error(`\nFAILED TESTS (${failures.length}):`);
        failures.forEach((f) => console.error(`  - ${f.name}: ${f.error}`));
        process.exit(1);
    } else {
        console.log("  ALL TESTS PASSED!\n");
        process.exit(0);
    }
}

runFeature6TestSuite().catch((err) => {
    console.error("Test execution threw an uncaught error:", err);
    process.exit(1);
});
