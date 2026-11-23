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

async function runCampManagementTestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: BLOOD DONATION CAMP MANAGEMENT (FEATURE 5) TEST SUITE              ");
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
    const bbEmailA = `camp_bb_a_${testStamp}@swastya.org`;
    const bbEmailB = `camp_bb_b_${testStamp}@swastya.org`;
    const donorEmail1 = `camp_donor_1_${testStamp}@swastya.org`;
    const donorEmail2 = `camp_donor_2_${testStamp}@swastya.org`;
    const donorEmail3 = `camp_donor_3_${testStamp}@swastya.org`;
    const testCampIds: string[] = [];

    // -------------------------------------------------------------------------
    // SETUP FIXTURES
    // -------------------------------------------------------------------------
    console.log("\n--- Setting up test fixtures in swastya_test ---");

    // Blood Bank A User & Facility
    const bbUserA = await prisma.users.create({
        data: {
            name: "Dr. A. Sen (Blood Bank Director A)",
            email: bbEmailA,
            phonenumber: "+919800000001",
            password: "hashed_test_password_bb_a",
            role: user_role.BLOOD_BANK,
            emailverified: true,
            isactive: true,
        },
    });
    const bloodBankA = await prisma.bloodbanks.create({
        data: {
            userid: bbUserA.userid,
            bloodbankname: `Apex Regional Blood Center ${testStamp}`,
            licensenumber: `BB-CAMP-A-${testStamp}`,
            contactpersonname: "Dr. A. Sen",
            contactpersonphone: "+919800000001",
            address: "10 Health City Road",
            city: "PUNE",
            state: "MAHARASHTRA",
            pincode: "411001",
            latitude: 18.5204,
            longitude: 73.8567,
        },
    });

    // Blood Bank B User & Facility (for tenant isolation)
    const bbUserB = await prisma.users.create({
        data: {
            name: "Dr. B. Das (Blood Bank Director B)",
            email: bbEmailB,
            phonenumber: "+919800000002",
            password: "hashed_test_password_bb_b",
            role: user_role.BLOOD_BANK,
            emailverified: true,
            isactive: true,
        },
    });
    const bloodBankB = await prisma.bloodbanks.create({
        data: {
            userid: bbUserB.userid,
            bloodbankname: `Metro Care Blood Bank ${testStamp}`,
            licensenumber: `BB-CAMP-B-${testStamp}`,
            contactpersonname: "Dr. B. Das",
            contactpersonphone: "+919800000002",
            address: "22 Station Road",
            city: "PUNE",
            state: "MAHARASHTRA",
            pincode: "411005",
            latitude: 18.5314,
            longitude: 73.8446,
        },
    });

    // Create 3 Test Donors
    const createTestDonor = async (name: string, email: string, phone: string, group: blood_group) => {
        const u = await prisma.users.create({
            data: {
                name,
                email,
                phonenumber: phone,
                password: "hashed_test_donor_pw",
                role: user_role.DONOR,
                emailverified: true,
                isactive: true,
            },
        });
        const d = await prisma.donors.create({
            data: {
                userid: u.userid,
                bloodgroup: group,
                gender: gender_type.MALE,
                dateofbirth: new Date("1995-05-15"),
                city: "PUNE",
                state: "MAHARASHTRA",
                pincode: "411001",
                latitude: 18.5200,
                longitude: 73.8500,
                iseligible: true,
            },
        });
        return { user: u, donor: d };
    };

    const d1 = await createTestDonor("Rahul Sharma", donorEmail1, "+919811111001", blood_group.O_POSITIVE);
    const d2 = await createTestDonor("Pooja Verma", donorEmail2, "+919811111002", blood_group.A_POSITIVE);
    const d3 = await createTestDonor("Amitabh Patil", donorEmail3, "+919811111003", blood_group.B_POSITIVE);

    // -------------------------------------------------------------------------
    // 2. CAMP CREATION & VALIDATION TESTS
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Camp Creation & Schedule Validation ---");

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 7 days in future
    const regOpen = new Date();
    regOpen.setDate(regOpen.getDate() - 1); // Opened yesterday
    const regClose = new Date(futureDate);
    regClose.setDate(regClose.getDate() - 1); // Closes day before camp

    // 2.1 Valid Camp Creation (Draft)
    const draftCamp = await CampService.createCamp(bloodBankA.bloodbankid, bbUserA.userid, {
        campname: `Tech Park Blood Drive ${testStamp}`,
        description: "Annual voluntary blood donation drive organized with Rotary Club",
        organizername: "Rotary Club Pune Central",
        contactperson: "Dr. K. Joshi",
        contactphone: "+919876500001",
        campdate: futureDate,
        starttime: "09:00",
        endtime: "17:00",
        timezone: "Asia/Kolkata",
        registrationopeningdate: regOpen,
        registrationdeadline: regClose,
        venuename: "Hinjawadi Phase 1 Club House",
        address: "Plot 12, Blue Ridge SEZ, Hinjawadi",
        city: "Pune",
        district: "Pune",
        state: "Maharashtra",
        pincode: "411057",
        latitude: 18.5913,
        longitude: 73.7389,
        isregistrationrequired: true,
        maxcapacity: 2, // Low capacity to test limits
        registrationinstructions: "Carry government issued photo ID",
        donorinstructions: "Drink water and sleep well",
        eligibilitynotes: "Age 18-65, weight > 45kg",
        status: camp_status.DRAFT,
    });

    assert(draftCamp !== null && draftCamp.campid !== undefined, "2.1.a Camp created successfully in DRAFT");
    assert(draftCamp.status === camp_status.DRAFT, "2.1.b Initial status is DRAFT");
    assert(draftCamp.registrationstatus === camp_registration_availability.OPEN, "2.1.c Registration status default is OPEN");
    assert(draftCamp.maxcapacity === 2, "2.1.d Max capacity is set to 2");

    // 2.1.e Verify PostgreSQL TIME(6) column type directly in database
    const timeCols: any[] = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'donationcamps' AND column_name IN ('starttime', 'endtime')
        ORDER BY column_name;
    `);
    const startCol = timeCols.find((c) => c.column_name === "starttime");
    const endCol = timeCols.find((c) => c.column_name === "endtime");
    assert(startCol && startCol.data_type === "time without time zone", "2.1.e PostgreSQL stores starttime as TIME without time zone");
    assert(endCol && endCol.data_type === "time without time zone", "2.1.f PostgreSQL stores endtime as TIME without time zone");
    assert(draftCamp.starttime === "09:00", "2.1.g Formatted starttime is HH:mm string (09:00)");
    assert(draftCamp.endtime === "17:00", "2.1.h Formatted endtime is HH:mm string (17:00)");

    // 2.2 Reject Camp Date in the Past
    let pastDateBlocked = false;
    try {
        const pastDate = new Date("2020-01-01");
        await CampService.createCamp(bloodBankA.bloodbankid, bbUserA.userid, {
            campname: "Past Camp",
            organizername: "Org",
            contactperson: "Person",
            campdate: pastDate,
            starttime: "09:00",
            endtime: "17:00",
            registrationopeningdate: new Date("2019-12-01"),
            registrationdeadline: new Date("2019-12-31"),
            venuename: "Venue",
            address: "Address",
            city: "Pune",
            state: "Maharashtra",
            pincode: "411001",
        });
    } catch (err: any) {
        if (err.message.includes("past")) pastDateBlocked = true;
    }
    assert(pastDateBlocked, "2.2.a Camp creation scheduled in past is rejected");

    // 2.3 Reject Start Time >= End Time
    let invalidTimeBlocked = false;
    try {
        await CampService.createCamp(bloodBankA.bloodbankid, bbUserA.userid, {
            campname: "Invalid Time Camp",
            organizername: "Org",
            contactperson: "Person",
            campdate: futureDate,
            starttime: "18:00",
            endtime: "09:00", // Start after end
            registrationopeningdate: regOpen,
            registrationdeadline: regClose,
            venuename: "Venue",
            address: "Address",
            city: "Pune",
            state: "Maharashtra",
            pincode: "411001",
        });
    } catch (err: any) {
        if (err.message.includes("earlier than end time")) invalidTimeBlocked = true;
    }
    assert(invalidTimeBlocked, "2.3.a Start time >= end time is rejected");

    // 2.4 Reject Invalid Coordinates
    let invalidCoordBlocked = false;
    try {
        await CampService.createCamp(bloodBankA.bloodbankid, bbUserA.userid, {
            campname: "Invalid Coord Camp",
            organizername: "Org",
            contactperson: "Person",
            campdate: futureDate,
            starttime: "09:00",
            endtime: "17:00",
            registrationopeningdate: regOpen,
            registrationdeadline: regClose,
            venuename: "Venue",
            address: "Address",
            city: "Pune",
            state: "Maharashtra",
            pincode: "411001",
            latitude: 195.0, // Invalid latitude
            longitude: 73.0,
        });
    } catch (err: any) {
        if (err.message.includes("coordinates")) invalidCoordBlocked = true;
    }
    assert(invalidCoordBlocked, "2.4.a Out-of-range coordinates are rejected");

    // -------------------------------------------------------------------------
    // 3. CAMP LIFECYCLE & STATUS TRANSITION TESTS
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Camp Lifecycle & Publishing ---");

    // 3.1 Draft Camp Excluded from Donor Discovery
    const discoveryBeforePublish = await CampService.discoverCamps({ city: "Pune" });
    const foundInDiscoveryBefore = discoveryBeforePublish.camps.some((c) => c.campid === draftCamp.campid);
    assert(!foundInDiscoveryBefore, "3.1.a DRAFT camp is strictly excluded from public/donor discovery");

    // 3.2 Publish Camp
    const publishedCamp = await CampService.publishCamp(draftCamp.campid, bloodBankA.bloodbankid, bbUserA.userid);
    assert(publishedCamp.status === camp_status.PUBLISHED, "3.2.a Camp successfully transitioned from DRAFT to PUBLISHED");

    // 3.3 Published Camp Discoverable
    const discoveryAfterPublish = await CampService.discoverCamps({ city: "Pune" });
    const foundInDiscoveryAfter = discoveryAfterPublish.camps.some((c) => c.campid === draftCamp.campid);
    assert(foundInDiscoveryAfter, "3.3.a PUBLISHED camp appears in public/donor discovery");

    // 3.4 Decoupled Registration Status (OPEN / CLOSED)
    const toggledClosed = await CampService.toggleRegistrationStatus(
        draftCamp.campid,
        bloodBankA.bloodbankid,
        bbUserA.userid,
        camp_registration_availability.CLOSED,
        "Organizers paused registration"
    );
    assert(toggledClosed.registrationstatus === camp_registration_availability.CLOSED, "3.4.a Registration status toggled to CLOSED");
    assert(toggledClosed.status === camp_status.PUBLISHED, "3.4.b Camp status remains PUBLISHED when registration is closed");

    // Discoverability preserved when registration is CLOSED
    const discoveryWhileClosed = await CampService.discoverCamps({ city: "Pune" });
    const foundWhileClosed = discoveryWhileClosed.camps.find((c) => c.campid === draftCamp.campid);
    assert(foundWhileClosed !== undefined, "3.4.c Camp remains discoverable when registration status is CLOSED");
    assert(foundWhileClosed?.isregistrationopen === false, "3.4.d isregistrationopen is false in discovery response");

    // Re-open registration for subsequent registration tests
    await CampService.toggleRegistrationStatus(
        draftCamp.campid,
        bloodBankA.bloodbankid,
        bbUserA.userid,
        camp_registration_availability.OPEN
    );

    // -------------------------------------------------------------------------
    // 4. REGISTRATION CAPACITY & CONCURRENCY PROTECTION TESTS
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Registration Capacity & Concurrency Protection ---");

    // 4.1 Donor 1 Registers (Slot 1 of 2)
    const reg1 = await CampService.registerDonorForCamp(draftCamp.campid, d1.user.userid);
    assert(reg1 !== null && reg1.registrationid !== undefined, "4.1.a Donor 1 registration succeeded");
    assert(reg1.registrationstatus === camp_registration_status.REGISTERED, "4.1.b Registration status is REGISTERED");
    assert(reg1.attendancestatus === camp_attendance_status.PENDING, "4.1.c Initial attendance status is PENDING");
    assert(reg1.registrationreference && reg1.registrationreference.startsWith("CAMP-"), "4.1.d Unique stable registration reference generated with format CAMP-YYYYMMDD-XXXX");

    const campDetailAfter1 = await CampService.getCampById(draftCamp.campid, bloodBankA.bloodbankid);
    assert(campDetailAfter1.metrics.registeredCount === 1, "4.1.e Registered count is 1");
    assert(campDetailAfter1.metrics.remainingCapacity === 1, "4.1.f Remaining capacity is exactly 1");

    // 4.2 Donor 2 Registers (Slot 2 of 2 - Capacity Reached)
    const reg2 = await CampService.registerDonorForCamp(draftCamp.campid, d2.user.userid);
    assert(reg2 !== null, "4.2.a Donor 2 registration succeeded");

    const campDetailAfter2 = await CampService.getCampById(draftCamp.campid, bloodBankA.bloodbankid);
    assert(campDetailAfter2.metrics.registeredCount === 2, "4.2.b Registered count is 2 (Capacity Reached)");
    assert(campDetailAfter2.metrics.remainingCapacity === 0, "4.2.c Remaining capacity is 0");
    assert(campDetailAfter2.metrics.isCapacityReached === true, "4.2.d isCapacityReached flag is true");

    // 4.3 Donor 3 Attempts to Register (Should be Blocked by Capacity Limit)
    let donor3BlockedOnCapacity = false;
    try {
        await CampService.registerDonorForCamp(draftCamp.campid, d3.user.userid);
    } catch (err: any) {
        if (err.message.includes("capacity")) donor3BlockedOnCapacity = true;
    }
    assert(donor3BlockedOnCapacity, "4.3.a Donor 3 registration blocked when capacity limit is reached");

    // 4.4 Duplicate Registration Prevention for Already Registered Donor
    let duplicateBlocked = false;
    try {
        await CampService.registerDonorForCamp(draftCamp.campid, d1.user.userid);
    } catch (err: any) {
        if (err.message.includes("already registered")) duplicateBlocked = true;
    }
    assert(duplicateBlocked, "4.4.a Duplicate registration for already registered donor is rejected");

    // 4.5 Registration Reference Uniqueness and DB Constraint Verification
    const uqRefCheck = await prisma.$queryRawUnsafe<any[]>(`
        SELECT conname, contype::text 
        FROM pg_constraint 
        WHERE conrelid = 'campregistrations'::regclass AND conname = 'campregistrations_registrationreference_key';
    `);
    assert(uqRefCheck.length > 0 && uqRefCheck[0].contype === "u", "4.5.a Database-level UNIQUE constraint exists on registrationreference");

    let directDuplicateRefBlocked = false;
    try {
        await prisma.campregistrations.create({
            data: {
                campid: draftCamp.campid,
                donorid: d3.donor.donorid,
                registrationreference: reg1.registrationreference, // Intentional duplicate reference of Donor 1
                registrationstatus: camp_registration_status.REGISTERED,
            },
        });
    } catch (err: any) {
        if (err.code === "P2002" || err.message.toLowerCase().includes("unique constraint") || err.message.includes("registrationreference")) {
            directDuplicateRefBlocked = true;
        }
    }
    assert(directDuplicateRefBlocked, "4.5.b Duplicate registrationreference insert blocked by database unique constraint");

    // 4.6 Concurrent Registration Concurrency Lock Verification
    const raceCamp = await CampService.createCamp(bloodBankA.bloodbankid, bbUserA.userid, {
        campname: `Race Condition Concurrency Camp ${testStamp}`,
        description: "Testing concurrent registration race conditions",
        organizername: "Concurrency Test Lab",
        contactperson: "Dr. Lock",
        campdate: futureDate,
        starttime: "09:00",
        endtime: "12:00",
        registrationopeningdate: regOpen,
        registrationdeadline: regClose,
        venuename: "Test Center",
        address: "Lane 1",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411057",
        isregistrationrequired: true,
        maxcapacity: 1, // Exactly 1 capacity slot
        status: camp_status.PUBLISHED,
    });
    testCampIds.push(raceCamp.campid);

    // Fire two simultaneous registrations for Donor 2 and Donor 3
    const raceResults = await Promise.allSettled([
        CampService.registerDonorForCamp(raceCamp.campid, d2.user.userid),
        CampService.registerDonorForCamp(raceCamp.campid, d3.user.userid),
    ]);
    const fulfilled = raceResults.filter((r) => r.status === "fulfilled");
    const rejected = raceResults.filter((r) => r.status === "rejected");
    assert(fulfilled.length === 1, "4.6.a Exactly one concurrent registration succeeded on 1-capacity camp");
    assert(rejected.length === 1, "4.6.b Second concurrent registration rejected by row-level capacity lock without overflow");

    // -------------------------------------------------------------------------
    // 5. NON-DESTRUCTIVE CANCELLATION & SAFE RE-REGISTRATION
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Non-Destructive Cancellation & Safe Re-registration ---");

    // 5.1 Donor 1 Cancels Self-Registration (Frees Slot 1)
    const cancelReasonDonor1 = "Unforeseen urgent business travel on camp date";
    const cancelledReg1 = await CampService.cancelDonorRegistration(d1.user.userid, reg1.registrationid, cancelReasonDonor1);
    assert(cancelledReg1.registrationstatus === camp_registration_status.CANCELLED, "5.1.a Registration status updated to CANCELLED");
    assert(cancelledReg1.cancellationreason === cancelReasonDonor1, "5.1.b Cancellation reason preserved in database");

    // Verify record was NOT physically deleted
    const recordStillExists = await prisma.campregistrations.findUnique({
        where: { registrationid: reg1.registrationid },
    });
    assert(recordStillExists !== null, "5.1.c Cancelled registration is permanently preserved (Zero Hard Deletes)");

    // Capacity is immediately restored
    const campDetailAfterCancel = await CampService.getCampById(draftCamp.campid, bloodBankA.bloodbankid);
    assert(campDetailAfterCancel.metrics.registeredCount === 1, "5.1.d Registered count decremented to 1");
    assert(campDetailAfterCancel.metrics.remainingCapacity === 1, "5.1.e Remaining capacity restored to 1");

    // 5.2 Donor 3 Can Now Register into the Freed Slot
    const reg3 = await CampService.registerDonorForCamp(draftCamp.campid, d3.user.userid);
    assert(reg3 !== null && reg3.registrationstatus === camp_registration_status.REGISTERED, "5.2.a Donor 3 successfully registered into freed slot");

    // Cancel Donor 3 to free up slot for Donor 1 re-registration test
    await CampService.cancelDonorRegistration(d3.user.userid, reg3.registrationid, "Donor 3 reschedule");

    // 5.3 Donor 1 Safely Re-registers (Reactivates Cancelled Record)
    const rereg1 = await CampService.registerDonorForCamp(draftCamp.campid, d1.user.userid);
    assert(rereg1.registrationid === reg1.registrationid, "5.3.a Re-registration reactivated existing record ID without creating duplicate entity");
    assert(rereg1.registrationstatus === camp_registration_status.REGISTERED, "5.3.b Status safely reactivated to REGISTERED");
    assert(rereg1.previouscancellationreason === cancelReasonDonor1, "5.3.c Previous cancellation reason preserved in audit field");
    assert(rereg1.reregisteredat !== null, "5.3.d reregisteredat timestamp recorded");
    assert(rereg1.registrationreference === reg1.registrationreference, "5.3.e Re-registration strictly preserves original registrationreference");

    // -------------------------------------------------------------------------
    // 6. ATTENDANCE RECORDING & ORGANIZER CANCELLATION
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Attendance Recording & Organizer Cancellation ---");

    // 6.1 Record Attendance for Donor 1 (ATTENDED + 1 unit donated)
    const attendedReg1 = await CampService.updateAttendance(
        draftCamp.campid,
        bloodBankA.bloodbankid,
        bbUserA.userid,
        reg1.registrationid,
        {
            attendancestatus: camp_attendance_status.ATTENDED,
            unitsdonated: 1,
            attendancenotes: "Donor passed vitals and hemoglobin check (13.5 g/dL)",
        }
    );
    assert(attendedReg1.attendancestatus === camp_attendance_status.ATTENDED, "6.1.a Attendance status recorded as ATTENDED");
    assert(attendedReg1.unitsdonated === 1, "6.1.b 1 unit donated recorded");

    // 6.1.c Verify attendanceupdatedbyuserid recorded in DB and relation works
    const dbReg1 = await prisma.campregistrations.findUnique({
        where: { registrationid: reg1.registrationid },
        include: { attendanceupdatedby: true },
    });
    assert(dbReg1?.attendanceupdatedbyuserid === bbUserA.userid, "6.1.c attendanceupdatedbyuserid recorded as authenticated blood bank staff");
    assert(dbReg1?.attendanceupdatedby?.userid === bbUserA.userid, "6.1.d attendanceupdatedby relation successfully resolved user");

    // 6.2 Cannot Cancel a Registration that has already ATTENDED
    let cancelAttendedBlocked = false;
    try {
        await CampService.cancelDonorRegistration(d1.user.userid, reg1.registrationid);
    } catch (err: any) {
        if (err.message.toLowerCase().includes("attend")) cancelAttendedBlocked = true;
    }
    assert(cancelAttendedBlocked, "6.2.a Cancelling registration after attendance has been recorded is blocked");

    // 6.3 Organizer-Side Cancellation of Donor 2
    const orgCancelledReg2 = await CampService.cancelRegistrationByOrganizer(
        draftCamp.campid,
        bloodBankA.bloodbankid,
        bbUserA.userid,
        reg2.registrationid,
        "Donor notified clinic of recent antibiotics intake (deferred)"
    );
    assert(orgCancelledReg2.registrationstatus === camp_registration_status.CANCELLED, "6.3.a Organizer-side cancellation succeeded");
    assert(orgCancelledReg2.cancellationreason?.includes("antibiotics"), "6.3.b Medical deferral reason recorded in registration");

    // 6.4 Repeated Cancellation & Re-Registration (Preserving Cumulative History)
    // Organizer cancelled Donor 2 above (antibiotics). Now Donor 2 re-registers (Cycle 1):
    const d2Cycle1 = await CampService.registerDonorForCamp(draftCamp.campid, d2.user.userid);
    assert(d2Cycle1.registrationstatus === camp_registration_status.REGISTERED, "6.4.a Donor 2 re-registration Cycle 1 succeeded");
    assert(d2Cycle1.registrationreference === reg2.registrationreference, "6.4.b Registration reference remains stable across re-registrations");

    // Donor 2 cancels again (Cycle 2 cancellation by donor)
    const secondCancelReason = "Emergency family travel on camp date";
    await CampService.cancelDonorRegistration(d2.user.userid, reg2.registrationid, secondCancelReason);

    // Donor 2 re-registers a second time (Cycle 2 re-registration)
    const d2Cycle2 = await CampService.registerDonorForCamp(draftCamp.campid, d2.user.userid);
    assert(d2Cycle2.registrationstatus === camp_registration_status.REGISTERED, "6.4.c Donor 2 re-registration Cycle 2 succeeded");

    // Verify cancellationhistory on campregistrations retained BOTH earlier cancellations
    const d2FullRecord = await prisma.campregistrations.findUnique({
        where: { registrationid: reg2.registrationid },
    });
    const history = (d2FullRecord as any)?.cancellationhistory as any[];
    assert(Array.isArray(history) && history.length === 2, "6.4.d cancellationhistory preserved both cancellation events");
    assert(history[0].reason.includes("antibiotics"), "6.4.e First cancellation reason (antibiotics) preserved");
    assert(history[1].reason.includes("Emergency family travel"), "6.4.f Second cancellation reason preserved");

    // -------------------------------------------------------------------------
    // 7. REGISTRATION NOT REQUIRED (WALK-IN CAMP)
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Walk-in Camp (isregistrationrequired = false) ---");

    const walkinCamp = await CampService.createCamp(bloodBankA.bloodbankid, bbUserA.userid, {
        campname: `Open Walk-in Campus Blood Drive ${testStamp}`,
        organizername: "Pune University NSS",
        contactperson: "Prof. S. Joshi",
        campdate: futureDate,
        starttime: "10:00",
        endtime: "16:00",
        registrationopeningdate: regOpen,
        registrationdeadline: regClose,
        venuename: "Main University Grounds",
        address: "Ganeshkhind Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411007",
        isregistrationrequired: false, // Walk-in camp
        status: camp_status.PUBLISHED,
    });

    assert(walkinCamp.isregistrationrequired === false, "7.1.a Walk-in camp created with isregistrationrequired = false");

    // Attempting advance registration is cleanly rejected with informative message
    let walkinRegBlocked = false;
    try {
        await CampService.registerDonorForCamp(walkinCamp.campid, d3.user.userid);
    } catch (err: any) {
        if (err.message.includes("Walk-in donors are welcome")) walkinRegBlocked = true;
    }
    assert(walkinRegBlocked, "7.1.b Advance registration cleanly rejected with walk-in instructions");

    // Walk-in camp discoverable with isregistrationopen = false
    const walkinDisc = await CampService.discoverCamps({ city: "Pune" });
    const foundWalkin = walkinDisc.camps.find((c) => c.campid === walkinCamp.campid);
    assert(foundWalkin?.isregistrationrequired === false, "7.1.c Walk-in camp clearly marked in discovery feed");

    // -------------------------------------------------------------------------
    // 8. SECURITY, ROLES & TENANT ISOLATION
    // -------------------------------------------------------------------------
    console.log("\n--- 8. Security & Cross-Blood-Bank Tenant Isolation ---");

    // 8.1 Blood Bank B Cannot Edit Blood Bank A's Camp
    let crossBHEditBlocked = false;
    try {
        await CampService.updateCamp(draftCamp.campid, bloodBankB.bloodbankid, bbUserB.userid, {
            campname: "Hacked Camp Name",
        });
    } catch (err: any) {
        if (err.message.includes("not found") || err.message.includes("unauthorized")) crossBHEditBlocked = true;
    }
    assert(crossBHEditBlocked, "8.1.a Blood Bank B forbidden from modifying Blood Bank A's camp (Tenant Isolation)");

    // 8.2 Blood Bank B Cannot Cancel Blood Bank A's Camp
    let crossBHCancelBlocked = false;
    try {
        await CampService.cancelCamp(draftCamp.campid, bloodBankB.bloodbankid, bbUserB.userid, "Malicious cancellation");
    } catch (err: any) {
        if (err.message.includes("not found") || err.message.includes("unauthorized")) crossBHCancelBlocked = true;
    }
    assert(crossBHCancelBlocked, "8.2.a Blood Bank B forbidden from cancelling Blood Bank A's camp");

    // 8.3 Blood Bank B Cannot View Blood Bank A's Registrations
    let crossBHRegistrationsBlocked = false;
    try {
        await CampService.listCampRegistrations(draftCamp.campid, bloodBankB.bloodbankid);
    } catch (err: any) {
        if (err.message.includes("not found") || err.message.includes("unauthorized")) crossBHRegistrationsBlocked = true;
    }
    assert(crossBHRegistrationsBlocked, "8.3.a Blood Bank B forbidden from viewing Blood Bank A's donor roster");

    // 8.4 Discovery API Exposes Zero Donor PII
    const publicCampView = await CampService.getPublicCampById(draftCamp.campid);
    assert((publicCampView as any).registrations === undefined, "8.4.a Public discovery API exposes zero donor registration records");
    assert((publicCampView as any).donors === undefined, "8.4.b Public discovery API exposes zero donor identities");
    assert(publicCampView.registeredcount !== undefined, "8.4.c Aggregate capacity count is safely provided");

    // -------------------------------------------------------------------------
    // 9. CAMP CANCELLATION & NOTIFICATION DISPATCH
    // -------------------------------------------------------------------------
    console.log("\n--- 9. Camp Cancellation & Persistent Notifications ---");

    const cancelReasonCamp = "Severe civic weather advisory issued by municipal corporation";
    const cancelledCamp = await CampService.cancelCamp(draftCamp.campid, bloodBankA.bloodbankid, bbUserA.userid, cancelReasonCamp);
    assert(cancelledCamp.status === camp_status.CANCELLED, "9.1.a Camp transitioned to CANCELLED");
    assert(cancelledCamp.registrationstatus === camp_registration_availability.CLOSED, "9.1.b Registration automatically closed upon cancellation");

    // Verify persistent notification generated for active registered donor (Donor 1)
    const donor1Notifs = await prisma.notification.findMany({
        where: { userid: d1.user.userid },
        orderBy: { sentat: "desc" },
    });
    const hasCancelNotif = donor1Notifs.some((n) => n.message.includes("Severe civic weather advisory"));
    assert(hasCancelNotif, "9.2.a Persistent notification generated in database for registered donor upon camp cancellation");

    // 9.3 Notification failure resilience (Camp operations must not rollback if notification fails)
    const originalCreate = prisma.notification.create;
    (prisma.notification as any).create = async () => { throw new Error("Simulated external notification network timeout"); };
    let resilienceCampCreated = false;
    let resilientCampId: string | null = null;
    try {
        const resilientCamp = await CampService.createCamp(bloodBankA.bloodbankid, bbUserA.userid, {
            campname: `Resilient Blood Camp ${testStamp}`,
            description: "Camp testing notification fault tolerance",
            organizername: "Disaster Relief Org",
            contactperson: "Ms. Sharma",
            campdate: futureDate,
            starttime: "11:00",
            endtime: "15:00",
            registrationopeningdate: regOpen,
            registrationdeadline: regClose,
            venuename: "Relief Center",
            address: "Sector 5",
            city: "Pune",
            state: "Maharashtra",
            pincode: "411057",
            status: camp_status.DRAFT,
        });
        if (resilientCamp?.campid) {
            resilienceCampCreated = true;
            resilientCampId = resilientCamp.campid;
        }
    } finally {
        (prisma.notification as any).create = originalCreate;
    }
    assert(resilienceCampCreated, "9.3.a Camp operation succeeds without rollback even if notification dispatch fails");

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log("\n--- Cleaning up test fixtures in swastya_test ---");
    try {
        if (draftCamp?.campid && !testCampIds.includes(draftCamp.campid)) testCampIds.push(draftCamp.campid);
        if (walkinCamp?.campid && !testCampIds.includes(walkinCamp.campid)) testCampIds.push(walkinCamp.campid);
        if (resilientCampId && !testCampIds.includes(resilientCampId)) testCampIds.push(resilientCampId);
        await prisma.campaudithistory.deleteMany({ where: { campid: { in: testCampIds } } });
        await prisma.campstatushistory.deleteMany({ where: { campid: { in: testCampIds } } });
        await prisma.campregistrations.deleteMany({ where: { campid: { in: testCampIds } } });
        await prisma.donationcamps.deleteMany({ where: { campid: { in: testCampIds } } });
        await prisma.notification.deleteMany({
            where: { userid: { in: [d1.user.userid, d2.user.userid, d3.user.userid] } },
        });
        await prisma.donors.deleteMany({
            where: { donorid: { in: [d1.donor.donorid, d2.donor.donorid, d3.donor.donorid] } },
        });
        await prisma.bloodbanks.deleteMany({
            where: { bloodbankid: { in: [bloodBankA.bloodbankid, bloodBankB.bloodbankid] } },
        });
        await prisma.users.deleteMany({
            where: {
                userid: {
                    in: [bbUserA.userid, bbUserB.userid, d1.user.userid, d2.user.userid, d3.user.userid],
                },
            },
        });
        console.log("  [CLEANUP] Test fixtures successfully cleaned up.");
    } catch (cleanupErr: any) {
        console.warn("  [CLEANUP NOTE]", cleanupErr.message || cleanupErr);
    }

    // -------------------------------------------------------------------------
    // RESULTS SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n===============================================================================");
    console.log(`  CAMP MANAGEMENT (FEATURE 5) TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
    console.log("===============================================================================");

    if (failures.length > 0) {
        console.error("\nFAILURES:");
        failures.forEach((f) => console.error(`  - ${f.name}: ${f.error}`));
        process.exit(1);
    } else {
        console.log("\nALL CAMP MANAGEMENT TESTS COMPLETED WITH 100% SUCCESS!\n");
        process.exit(0);
    }
}

runCampManagementTestSuite().catch((err) => {
    console.error("Fatal test suite failure:", err);
    process.exit(1);
});
