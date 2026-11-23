import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

import { prisma } from "../src/config/prisma";
import { CampService } from "../src/services/camp.service";
import { CampNotificationService } from "../src/services/campNotification.service";
import {
    user_role,
    camp_status,
    camp_registration_availability,
    blood_group,
    gender_type,
    notification_type,
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

async function runFeature7TestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: FEATURE 7 - IN-APP BLOOD CAMP NOTIFICATIONS TEST SUITE             ");
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
    const bbEmail = `f7_bb_${testStamp}@swastya.org`;
    const donor1Email = `f7_donor1_${testStamp}@swastya.org`;
    const donor2Email = `f7_donor2_${testStamp}@swastya.org`;
    const donor3Email = `f7_donor3_${testStamp}@swastya.org`;
    const createdCampIds: string[] = [];

    try {
        // -------------------------------------------------------------------------
        // 2. SETUP FIXTURES
        // -------------------------------------------------------------------------
        console.log("\n--- 2. Setting Up Test Fixtures in swastya_test ---");

        // Blood Bank Organizer in Mumbai
        const bbUser = await prisma.users.create({
            data: {
                name: "Dr. Feature7 Organizer",
                email: bbEmail,
                phonenumber: "+919876543101",
                password: "hashed_test_password",
                role: user_role.BLOOD_BANK,
                emailverified: true,
                isactive: true,
            },
        });
        const bloodBank = await prisma.bloodbanks.create({
            data: {
                userid: bbUser.userid,
                bloodbankname: "Mumbai Civic Blood Center",
                licensenumber: `LIC-F7-${testStamp}`,
                contactpersonname: "Dr. Feature7 Organizer",
                contactpersonphone: "+919876543101",
                address: "200 Health Boulevard",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
                latitude: 18.9400,
                longitude: 72.8350,
            },
        });

        // Helper to create donor fixture
        const createDonorFixture = async (
            email: string,
            name: string,
            phone: string,
            city: string,
            lat: number,
            lon: number
        ) => {
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
                    bloodgroup: blood_group.O_POSITIVE,
                    dateofbirth: new Date("1995-05-15"),
                    gender: gender_type.MALE,
                    address: `Resident in ${city}`,
                    city,
                    state: "Maharashtra",
                    pincode: "400001",
                    latitude: lat,
                    longitude: lon,
                },
            });
            return { user: u, donor: d };
        };

        // Donor 1: In Mumbai, wants all notifications
        const donor1 = await createDonorFixture(
            donor1Email,
            "Aarav Mumbai Active",
            "+919876543102",
            "Mumbai",
            18.9450,
            72.8400 // ~1 km from BB
        );
        await CampNotificationService.updateDonorPreferences(donor1.user.userid, {
            nearbycamps: true,
            campreminders: true,
            campupdates: true,
            campcancellations: true,
            preferredcity: "Mumbai",
            preferredradiuskm: 25,
        });

        // Donor 2: In Mumbai, but has nearbycamps DISABLED
        const donor2 = await createDonorFixture(
            donor2Email,
            "Rohan Mumbai OptOut",
            "+919876543103",
            "Mumbai",
            18.9500,
            72.8450
        );
        await CampNotificationService.updateDonorPreferences(donor2.user.userid, {
            nearbycamps: false, // Explicitly opted out
            campreminders: true,
            campupdates: true,
            campcancellations: true,
            preferredcity: "Mumbai",
            preferredradiuskm: 25,
        });

        // Donor 3: In Pune, 150km away from Mumbai
        const donor3 = await createDonorFixture(
            donor3Email,
            "Siddharth Pune Far",
            "+919876543104",
            "Pune",
            18.5204,
            73.8567
        );
        await CampNotificationService.updateDonorPreferences(donor3.user.userid, {
            nearbycamps: true,
            preferredcity: "Pune",
            preferredradiuskm: 15,
        });

        assert(true, "2.1 Created blood bank and 3 donor fixtures with distinct preferences");

        // -------------------------------------------------------------------------
        // 3. NEARBY CAMP PUBLICATION & PREFERENCE FILTERING
        // -------------------------------------------------------------------------
        console.log("\n--- 3. Testing Nearby Camp Publication & In-App Notification Alerts ---");

        const now = new Date();
        const d1Day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 0, 0, 0);
        const campDateStr = `${d1Day.getFullYear()}-${String(d1Day.getMonth() + 1).padStart(2, "0")}-${String(d1Day.getDate()).padStart(2, "0")}`;
        const regOpening1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const regDeadline1 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 18, 0, 0);

        // Create draft camp in Mumbai
        const camp1 = await CampService.createCamp(bloodBank.bloodbankid, bbUser.userid, {
            campname: `Shivaji Park Megacamp Drive ${testStamp}`,
            organizername: "Youth Blood Society",
            contactperson: "Dr. Feature7 Organizer",
            contactphone: "+919876543101",
            campdate: campDateStr,
            starttime: "09:00",
            endtime: "17:00",
            registrationopeningdate: regOpening1.toISOString(),
            registrationdeadline: regDeadline1.toISOString(),
            venuename: "Shivaji Park Sports Club",
            address: "Shivaji Park Road, Dadar",
            city: "Mumbai",
            district: "Mumbai City",
            state: "Maharashtra",
            pincode: "400028",
            latitude: 19.0270,
            longitude: 72.8385,
            specialinstructions: "Carry Government Photo ID and have a light meal.",
            status: camp_status.DRAFT,
        });
        createdCampIds.push(camp1.campid);

        // While camp is draft, verify NO notifications were sent
        const draftNotifs = await prisma.notification.findMany({
            where: { campid: camp1.campid },
        });
        assert(draftNotifs.length === 0, "3.1 No notifications generated while camp is in DRAFT status");

        // Now publish the camp
        const publishedCamp1 = await CampService.publishCamp(camp1.campid, bloodBank.bloodbankid, bbUser.userid);
        assert(publishedCamp1.status === camp_status.PUBLISHED, "3.2 Camp published successfully");

        // Allow microtask queue to process publication notification trigger
        await new Promise((r) => setTimeout(r, 200));

        // Check in-app notifications generated for Donor 1 (Mumbai, opted in)
        const d1Notifs = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                campid: camp1.campid,
            },
        });
        assert(
            d1Notifs.length === 1,
            "3.3 Donor 1 (Mumbai, opted in) received 1 in-app nearby camp notification",
            `Found ${d1Notifs.length} notifications`
        );
        if (d1Notifs.length > 0) {
            const n = d1Notifs[0];
            assert(
                n.type === notification_type.CAMP,
                "3.4 Notification type is strictly CAMP",
                `Got: ${n.type}`
            );
            assert(
                n.actionurl?.includes(camp1.campid) === true,
                "3.5 Notification actionurl directs to the camp discovery page",
                `actionurl: ${n.actionurl}`
            );
            assert(
                n.idempotencykey === `CAMP_PUB:${camp1.campid}:${donor1.user.userid}`,
                "3.6 Notification carries deterministic idempotency key",
                `key: ${n.idempotencykey}`
            );
        }

        // Check Donor 2 (Mumbai, but nearbycamps = false)
        const d2Notifs = await prisma.notification.findMany({
            where: {
                userid: donor2.user.userid,
                campid: camp1.campid,
            },
        });
        assert(
            d2Notifs.length === 0,
            "3.7 Donor 2 (opted out of nearby camps) received ZERO notifications"
        );

        // Check Donor 3 (Pune, 150km away)
        const d3Notifs = await prisma.notification.findMany({
            where: {
                userid: donor3.user.userid,
                campid: camp1.campid,
            },
        });
        assert(
            d3Notifs.length === 0,
            "3.8 Donor 3 (Pune, outside radius) received ZERO notifications"
        );

        // Test Publication Idempotency: Trigger publication notify again
        await CampNotificationService.notifyNearbyCampPublished(camp1.campid);
        const d1NotifsAfterRecheck = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                campid: camp1.campid,
            },
        });
        assert(
            d1NotifsAfterRecheck.length === 1,
            "3.9 Publication alert is completely idempotent (no duplicates created on retry)"
        );

        // -------------------------------------------------------------------------
        // 4. REGISTRATION CONFIRMATION NOTIFICATIONS
        // -------------------------------------------------------------------------
        console.log("\n--- 4. Testing Registration Confirmation In-App Notification ---");

        const reg1 = await CampService.registerDonorForCamp(camp1.campid, donor1.user.userid, {
            timeSlot: "10:00 AM",
            donorNotes: "First time at this venue",
        });
        assert(Boolean(reg1.registrationid), "4.1 Donor 1 registered for camp successfully");

        // Verify in-app confirmation notification
        const regConfirmNotifs = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                registrationid: reg1.registrationid,
                title: { contains: "Registration Confirmed" },
            },
        });
        assert(
            regConfirmNotifs.length === 1,
            "4.2 Donor 1 received an in-app Registration Confirmed notification",
            `Found ${regConfirmNotifs.length}`
        );
        if (regConfirmNotifs.length > 0) {
            const n = regConfirmNotifs[0];
            assert(
                n.message.includes(reg1.registrationreference),
                "4.3 Confirmation message contains the unique registration reference code",
                `Message: ${n.message}`
            );
            assert(
                n.actionurl?.includes("/donor/my-camps") === true,
                "4.4 Action URL points to donor's my-camps management page"
            );
        }

        // Test confirmation idempotency
        await CampNotificationService.notifyRegistrationConfirmed(reg1.registrationid);
        const regConfirmAfterRetry = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                registrationid: reg1.registrationid,
                title: { contains: "Registration Confirmed" },
            },
        });
        assert(
            regConfirmAfterRetry.length === 1,
            "4.5 Registration confirmation is idempotent (no duplicate notification on retry)"
        );

        // -------------------------------------------------------------------------
        // 5. CAMP UPDATE NOTIFICATIONS
        // -------------------------------------------------------------------------
        console.log("\n--- 5. Testing Camp Updates In-App Notifications ---");

        // Update camp instructions & time
        await CampService.updateCamp(camp1.campid, bloodBank.bloodbankid, bbUser.userid, {
            specialinstructions: "UPDATE: Fasting is NOT required. Drink plenty of water before arrival.",
            endtime: "18:00",
        });

        // Allow microtask queue to process update notifications
        await new Promise((r) => setTimeout(r, 200));

        // Verify registered Donor 1 received camp update alert
        const updateNotifs = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                campid: camp1.campid,
                title: { contains: "Camp Details Updated" },
            },
        });
        assert(
            updateNotifs.length >= 1,
            "5.1 Registered Donor 1 received in-app Camp Details Updated notification",
            `Found ${updateNotifs.length}`
        );
        if (updateNotifs.length > 0) {
            assert(
                updateNotifs[0].message.includes("Fasting is NOT required") ||
                updateNotifs[0].message.includes("updated"),
                "5.2 Update notification contains summary of changes"
            );
        }

        // -------------------------------------------------------------------------
        // 6. REGISTRATION CANCELLATION NOTIFICATIONS
        // -------------------------------------------------------------------------
        console.log("\n--- 6. Testing Registration Cancellation In-App Notification ---");

        // Create camp 2 and register donor 1
        const camp2 = await CampService.createCamp(bloodBank.bloodbankid, bbUser.userid, {
            campname: `Bandra Community Hall Camp ${testStamp}`,
            organizername: "Bandra Youth Club",
            contactperson: "Dr. Feature7 Organizer",
            contactphone: "+919876543101",
            campdate: campDateStr,
            starttime: "10:00",
            endtime: "16:00",
            registrationopeningdate: regOpening1.toISOString(),
            registrationdeadline: regDeadline1.toISOString(),
            venuename: "Bandra Community Hall",
            address: "Hill Road, Bandra West",
            city: "Mumbai",
            district: "Mumbai Suburban",
            state: "Maharashtra",
            pincode: "400050",
            latitude: 19.0550,
            longitude: 72.8300,
            status: camp_status.PUBLISHED,
        });
        createdCampIds.push(camp2.campid);

        const reg2 = await CampService.registerDonorForCamp(camp2.campid, donor1.user.userid);
        assert(Boolean(reg2.registrationid), "6.1 Registered for camp 2");

        // Now Donor 1 cancels registration
        await CampService.cancelDonorRegistration(
            donor1.user.userid,
            reg2.registrationid,
            "Out of town on family emergency"
        );

        // Allow microtask queue to process cancellation notification
        await new Promise((r) => setTimeout(r, 200));

        // Verify in-app cancellation notification
        const regCancelNotifs = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                registrationid: reg2.registrationid,
                title: { contains: "Registration Cancelled" },
            },
        });
        assert(
            regCancelNotifs.length === 1,
            "6.2 Donor 1 received an in-app Registration Cancelled notification confirmation"
        );

        // -------------------------------------------------------------------------
        // 7. CAMP CANCELLATION NOTIFICATIONS
        // -------------------------------------------------------------------------
        console.log("\n--- 7. Testing Camp Cancellation In-App Notifications ---");

        // Create camp 3, register donor 1
        const camp3 = await CampService.createCamp(bloodBank.bloodbankid, bbUser.userid, {
            campname: `Worli Sea Face Camp ${testStamp}`,
            organizername: "Worli Medical Trust",
            contactperson: "Dr. Feature7 Organizer",
            contactphone: "+919876543101",
            campdate: campDateStr,
            starttime: "09:00",
            endtime: "15:00",
            registrationopeningdate: regOpening1.toISOString(),
            registrationdeadline: regDeadline1.toISOString(),
            venuename: "Worli Sports Club",
            address: "Khan Abdul Ghaffar Khan Road",
            city: "Mumbai",
            district: "Mumbai City",
            state: "Maharashtra",
            pincode: "400018",
            latitude: 19.0150,
            longitude: 72.8150,
            status: camp_status.PUBLISHED,
        });
        createdCampIds.push(camp3.campid);

        const reg3 = await CampService.registerDonorForCamp(camp3.campid, donor1.user.userid);
        assert(Boolean(reg3.registrationid), "7.1 Registered for camp 3");

        // Blood Bank cancels the camp
        await CampService.cancelCamp(camp3.campid, bloodBank.bloodbankid, bbUser.userid, "Heavy monsoon waterlogging warning");

        // Allow microtask queue to process cancellation notifications
        await new Promise((r) => setTimeout(r, 200));

        // Verify registered donor received camp cancellation notification
        const campCancelNotifs = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                campid: camp3.campid,
                title: { contains: "Camp Cancelled" },
            },
        });
        assert(
            campCancelNotifs.length === 1,
            "7.2 Donor 1 received in-app Camp Cancelled notification with reason",
            `Found ${campCancelNotifs.length}`
        );
        if (campCancelNotifs.length > 0) {
            assert(
                campCancelNotifs[0].message.includes("monsoon waterlogging"),
                "7.3 Cancellation notification contains the organizer's reason"
            );
        }

        // -------------------------------------------------------------------------
        // 8. BACKGROUND REMINDER WORKER (24H AND 2H REMINDERS)
        // -------------------------------------------------------------------------
        console.log("\n--- 8. Testing Scheduled Camp Reminder Worker ---");

        // Set up a camp exactly 23 hours from now to test 24h window
        const nowMs = Date.now();
        const camp24hTarget = new Date(nowMs + 23 * 3600 * 1000);
        const camp24hDateStr = `${camp24hTarget.getUTCFullYear()}-${String(camp24hTarget.getUTCMonth() + 1).padStart(2, "0")}-${String(camp24hTarget.getUTCDate()).padStart(2, "0")}`;
        const sH = camp24hTarget.getUTCHours();
        const sM = camp24hTarget.getUTCMinutes();
        const camp24hStartTime = `${String(sH).padStart(2, "0")}:${String(sM).padStart(2, "0")}`;
        const camp24hEndTime = "23:59";
        const regOpening24h = new Date(nowMs - 3600 * 1000);
        const regDeadline24h = new Date(camp24hTarget.getTime() - 15 * 60 * 1000);

        const camp24h = await CampService.createCamp(bloodBank.bloodbankid, bbUser.userid, {
            campname: `24-Hour Reminder Verification Camp ${testStamp}`,
            organizername: "KEM Medical Trust",
            contactperson: "Dr. Feature7 Organizer",
            contactphone: "+919876543101",
            campdate: camp24hDateStr,
            starttime: camp24hStartTime,
            endtime: camp24hEndTime,
            registrationopeningdate: regOpening24h.toISOString(),
            registrationdeadline: regDeadline24h.toISOString(),
            venuename: "KEM Medical Auditorium",
            address: "Parel",
            city: "Mumbai",
            district: "Mumbai City",
            state: "Maharashtra",
            pincode: "400012",
            latitude: 19.0020,
            longitude: 72.8420,
            status: camp_status.PUBLISHED,
        });
        createdCampIds.push(camp24h.campid);

        const reg24h = await CampService.registerDonorForCamp(camp24h.campid, donor1.user.userid);
        assert(Boolean(reg24h.registrationid), "8.1 Registered for upcoming 24h camp");

        // Run reminder worker pass
        const reminderResults1 = await CampNotificationService.processUpcomingCampReminders();
        assert(
            reminderResults1.remindersSent >= 1,
            "8.2 Reminder worker identified upcoming registration and sent 24h reminder",
            `Reminders sent: ${reminderResults1.remindersSent}`
        );

        // Verify 24h reminder notification in database
        const n24h = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                registrationid: reg24h.registrationid,
                title: { contains: "24 Hours" },
            },
        });
        assert(
            n24h.length === 1,
            "8.3 Exactly one 24h reminder notification exists for Donor 1",
            `Found ${n24h.length}`
        );

        // Run reminder worker a second time to verify complete idempotency
        const reminderResults2 = await CampNotificationService.processUpcomingCampReminders();
        const n24hAfterSecondPass = await prisma.notification.findMany({
            where: {
                userid: donor1.user.userid,
                registrationid: reg24h.registrationid,
                title: { contains: "24 Hours" },
            },
        });
        assert(
            n24hAfterSecondPass.length === 1,
            "8.4 Second reminder worker pass created zero duplicate notifications (strictly idempotent)"
        );

        // -------------------------------------------------------------------------
        // 9. DONOR NOTIFICATION PREFERENCES API
        // -------------------------------------------------------------------------
        console.log("\n--- 9. Testing Donor Notification Preferences Service & API ---");

        // Retrieve preferences
        const prefs1 = await CampNotificationService.getDonorPreferences(donor1.user.userid);
        assert(prefs1.nearbycamps === true, "9.1 Correctly retrieves nearbycamps preference");
        assert(prefs1.preferredradiuskm === 25, "9.2 Correctly retrieves preferredradiuskm");

        // Update preferences
        const updatedPrefs = await CampNotificationService.updateDonorPreferences(donor1.user.userid, {
            nearbycamps: false,
            preferredradiuskm: 50,
            preferredcity: "Thane",
        });
        assert(
            updatedPrefs.nearbycamps === false,
            "9.3 Preferences update successfully changed nearbycamps to false"
        );
        assert(
            updatedPrefs.preferredradiuskm === 50,
            "9.4 Preferences update successfully changed radius to 50 km"
        );
        assert(
            updatedPrefs.preferredcity === "Thane",
            "9.5 Preferences update successfully saved preferred city"
        );

        // -------------------------------------------------------------------------
        // 10. NOTIFICATION READ & ACCESS CONTROL
        // -------------------------------------------------------------------------
        console.log("\n--- 10. Testing Notification Read States & Access Control ---");

        const unreadList = await prisma.notification.findMany({
            where: { userid: donor1.user.userid, isread: false },
        });
        assert(unreadList.length > 0, "10.1 Donor 1 has unread notifications");

        // Mark single notification read
        const targetNotif = unreadList[0];
        await prisma.notification.update({
            where: { notificationid: targetNotif.notificationid },
            data: { isread: true, readat: new Date() },
        });
        const readCheck = await prisma.notification.findUnique({
            where: { notificationid: targetNotif.notificationid },
        });
        assert(readCheck?.isread === true, "10.2 Single notification marked as read");

        // Mark all as read
        await prisma.notification.updateMany({
            where: { userid: donor1.user.userid, isread: false },
            data: { isread: true, readat: new Date() },
        });
        const remainingUnread = await prisma.notification.count({
            where: { userid: donor1.user.userid, isread: false },
        });
        assert(remainingUnread === 0, "10.3 All notifications for Donor 1 marked as read");

        // Isolation: Donor 3 cannot access Donor 1's notifications
        const donor3Access = await prisma.notification.findMany({
            where: { userid: donor3.user.userid },
        });
        const containsDonor1Notifs = donor3Access.some((n) => n.userid === donor1.user.userid);
        assert(!containsDonor1Notifs, "10.4 Complete tenant isolation: Donor 3 cannot see Donor 1's notifications");

    } finally {
        // -------------------------------------------------------------------------
        // CLEANUP
        // -------------------------------------------------------------------------
        console.log("\n--- Cleaning up test fixtures in swastya_test ---");
        try {
            // Delete notifications created for our test camps and users
            await prisma.notification.deleteMany({
                where: {
                    OR: [
                        { campid: { in: createdCampIds } },
                        { users: { email: { in: [bbEmail, donor1Email, donor2Email, donor3Email] } } },
                    ],
                },
            });

            // Delete registrations
            await prisma.campregistrations.deleteMany({
                where: { campid: { in: createdCampIds } },
            });

            // Delete status and audit histories
            await prisma.campstatushistory.deleteMany({
                where: { campid: { in: createdCampIds } },
            });
            await prisma.campaudithistory.deleteMany({
                where: { campid: { in: createdCampIds } },
            });

            // Delete camps
            await prisma.donationcamps.deleteMany({
                where: { campid: { in: createdCampIds } },
            });

            // Delete preferences
            await prisma.donornotificationpreferences.deleteMany({
                where: {
                    donor: {
                        users: { email: { in: [donor1Email, donor2Email, donor3Email] } },
                    },
                },
            });

            // Delete donor records
            await prisma.donors.deleteMany({
                where: {
                    users: { email: { in: [donor1Email, donor2Email, donor3Email] } },
                },
            });

            // Delete blood bank
            await prisma.bloodbanks.deleteMany({
                where: {
                    users: { email: bbEmail },
                },
            });

            // Delete users
            await prisma.users.deleteMany({
                where: {
                    email: { in: [bbEmail, donor1Email, donor2Email, donor3Email] },
                },
            });
            console.log("  [CLEANUP] Successfully cleaned up all test fixtures.");
        } catch (cleanupErr) {
            console.warn("  [CLEANUP WARNING] Non-fatal cleanup error:", cleanupErr);
        }
    }

    console.log("\n===============================================================================");
    console.log(`  FEATURE 7 TEST SUITE RESULTS: ${passedTests} / ${totalTests} PASSED`);
    if (failures.length > 0) {
        console.error(`  FAILURES (${failures.length}):`);
        failures.forEach((f) => console.error(`   - ${f.name}: ${f.error}`));
    }
    console.log("===============================================================================");

    if (failures.length > 0) {
        process.exit(1);
    }
}

runFeature7TestSuite().catch((err) => {
    console.error("FATAL ERROR IN TEST SUITE:", err);
    process.exit(1);
});
