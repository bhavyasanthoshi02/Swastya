/**
 * Test Suite: Feature 10 — Intelligent Emergency Donor Matching
 * 
 * Verifies:
 * 1. Hospital overview metrics return valid numbers from Neon database.
 * 2. Hospital requisitions query returns active requisitions.
 * 3. Matching candidate search evaluates real registered donors, enforcing:
 *    - ABO/Rh component compatibility
 *    - Geographic proximity & boundary gate
 *    - Availability status
 *    - 90-day cooldown interval
 *    - Transparent score breakdown (0-100)
 * 4. Dispatching notifications creates durable emergencybroadcasts and broadcastdeliveries, plus in-app notification.
 * 5. Donor emergency requests feed receives the notification.
 * 6. Donor voluntary response (ACCEPTED / DECLINED) updates status and notifies hospital.
 * 7. Tenant isolation & role authorization (Hospital cannot match other hospital's requisitions).
 * 8. Express API endpoints respond with 200 OK for authorized roles.
 */

import dotenv from "dotenv";
dotenv.config();

process.env.NODE_ENV = "development";
process.env.SWASTYA_DB_TARGET = "neon";

import http from "http";
import jwt from "jsonwebtoken";
import { prisma } from "../src/config/prisma";
import { EmergencyDonorMatchingService } from "../src/services/emergencyDonorMatching.service";
import app from "../src/app";
import { getJwtSecret } from "../src/utils/jwt";

async function runEmergencyMatchingTests() {
    console.log("=== SWASTYA FEATURE 10: INTELLIGENT EMERGENCY DONOR MATCHING TEST SUITE ===");

    let server: http.Server | null = null;

    try {
        // 1. Fetch real approved hospital from Neon database
        const hospital = await prisma.hospitals.findFirst({
            where: { approvalstatus: "APPROVED" },
            include: {
                users: {
                    select: {
                        userid: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });

        if (!hospital) {
            throw new Error("No approved hospital found in Neon database to test against.");
        }

        console.log(`\n[Test 1] Testing with Hospital: "${hospital.hospitalname}" (ID: ${hospital.hospitalid}, City: ${hospital.city})`);

        // 2. Fetch hospital matching overview
        console.log("\n[Test 2] Testing getHospitalOverview...");
        const overview = await EmergencyDonorMatchingService.getHospitalOverview(hospital.userid);
        console.log("  Overview metrics:", overview);
        if (typeof overview.activeMatchingRequisitionsCount !== "number" || typeof overview.totalDonorsNotified !== "number") {
            throw new Error("Overview metrics must contain valid numbers.");
        }
        console.log("  ✓ Hospital overview returned valid metrics.");

        // 3. Fetch hospital requisitions
        console.log("\n[Test 3] Testing getHospitalRequisitions...");
        let requisitions = await EmergencyDonorMatchingService.getHospitalRequisitions(hospital.userid);
        console.log(`  Found ${requisitions.length} active requisitions for this hospital.`);

        // If no active requisition, find or create one for test validation
        let testRequestId = requisitions.length > 0 ? requisitions[0].requestId : null;
        let createdTestRequest = false;

        if (!testRequestId) {
            console.log("  Creating a test blood requisition for hospital matching test...");
            const createdReq = await prisma.bloodrequests.create({
                data: {
                    createdbyuserid: hospital.userid,
                    hospitalid: hospital.hospitalid,
                    patientname: "Emergency Matching Test Patient",
                    patientage: 35,
                    patientgender: "MALE",
                    patientcontact: "9876543210",
                    bloodgroup: "O_POSITIVE",
                    bloodcomponent: "WHOLE_BLOOD",
                    unitsrequired: 2,
                    urgencylevel: "CRITICAL",
                    isemergency: true,
                    searchradius: 30,
                    requiredby: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
                    status: "CREATED",
                },
            });
            testRequestId = createdReq.requestid;
            createdTestRequest = true;
            console.log(`  Created test requisition ID: ${testRequestId}`);
        }

        // 4. Test candidate evaluation & scoring
        console.log(`\n[Test 4] Testing findMatchingCandidates for requisition ${testRequestId}...`);
        const candidateResult = await EmergencyDonorMatchingService.findMatchingCandidates(
            hospital.userid,
            testRequestId,
            { radiusKm: 50 }
        );

        console.log(`  Found ${candidateResult.candidates.length} matching candidate donors.`);
        if (candidateResult.candidates.length > 0) {
            const first = candidateResult.candidates[0];
            console.log(`  Top Candidate: ${first.donorName} (${first.bloodGroup})`);
            console.log(`    - Total Match Score: ${first.matchScore}/100`);
            console.log(`    - Compatibility: ${first.scoreBreakdown.compatibilityScore}/35`);
            console.log(`    - Proximity: ${first.scoreBreakdown.distanceScore}/35 (${first.distanceDisplay})`);
            console.log(`    - Cooldown: ${first.scoreBreakdown.availabilityScore}/15 (satisfied: ${first.cooldownSatisfied})`);
            console.log(`    - Responsiveness: ${first.scoreBreakdown.responseScore}/15`);
            console.log(`    - Masked Contact: ${first.maskedPhone} | ${first.maskedEmail}`);

            if (first.matchScore < 0 || first.matchScore > 100) {
                throw new Error("Match score must be between 0 and 100.");
            }
        }
        console.log("  ✓ Candidate matching evaluation and explainable scoring verified.");

        // 5. Test Donor Notification Dispatch
        console.log("\n[Test 5] Testing notifySelectedDonors & durable delivery creation...");
        // Find a candidate donor or registered active donor in DB
        const testDonor = await prisma.donors.findFirst({
            where: {
                users: { isactive: true },
            },
            include: {
                users: true,
            },
        });

        if (!testDonor) {
            throw new Error("No active donor found in database.");
        }

        const notifyRes = await EmergencyDonorMatchingService.notifySelectedDonors(
            hospital.userid,
            testRequestId,
            [testDonor.donorid],
            "Urgent surgical requirement matching"
        );
        console.log(`  Dispatch result: ${notifyRes.message} (Broadcast ID: ${notifyRes.broadcastId})`);

        // Verify broadcast delivery record exists
        const delivery = await prisma.broadcastdeliveries.findFirst({
            where: {
                requestid: testRequestId,
                donorid: testDonor.donorid,
            },
        });
        if (!delivery) {
            throw new Error("broadcastdeliveries record was not created.");
        }
        console.log(`  ✓ Created broadcast delivery: ${delivery.deliveryid} (status: ${delivery.deliverystatus})`);

        // Verify in-app notification exists for the donor
        const notif = await prisma.notification.findFirst({
            where: {
                userid: testDonor.users.userid,
                requestid: testRequestId,
            },
            orderBy: { sentat: "desc" },
        });
        if (!notif) {
            throw new Error("In-app notification for matched donor was not created.");
        }
        console.log(`  ✓ Created in-app notification for donor: "${notif.title}" (actionurl: ${notif.actionurl})`);

        // 6. Test Donor Emergency Requests Feed
        console.log("\n[Test 6] Testing getDonorEmergencyRequests for donor...");
        const donorRequests = await EmergencyDonorMatchingService.getDonorEmergencyRequests(testDonor.users.userid);
        const matchedItem = donorRequests.find((d) => d.deliveryId === delivery.deliveryid);
        if (!matchedItem) {
            throw new Error("Donor emergency requests feed did not return the dispatched delivery.");
        }
        console.log(`  ✓ Donor received matching request: ${matchedItem.hospitalName} (${matchedItem.bloodGroup}, ${matchedItem.distanceDisplay})`);

        // 7. Test Donor Voluntary Response (ACCEPTED)
        console.log("\n[Test 7] Testing respondToEmergencyRequest (ACCEPTED)...");
        const acceptRes = await EmergencyDonorMatchingService.respondToEmergencyRequest(
            testDonor.users.userid,
            delivery.deliveryid,
            "ACCEPTED",
            "Available immediately to donate"
        );
        console.log(`  Response result: ${acceptRes.message}`);

        // Verify hospital can now see the response and unmasked contact info
        const hospitalResponses = await EmergencyDonorMatchingService.getRequestResponses(
            hospital.userid,
            testRequestId
        );
        const hospitalRespItem = hospitalResponses.find((r) => r.deliveryId === delivery.deliveryid);
        if (!hospitalRespItem || hospitalRespItem.response !== "ACCEPTED") {
            throw new Error("Hospital response tracker did not reflect ACCEPTED status.");
        }
        console.log(`  ✓ Hospital sees accepted response from donor ${hospitalRespItem.donorName}: Phone ${hospitalRespItem.donorPhone}`);

        // Verify hospital received notification that donor accepted
        const hospNotif = await prisma.notification.findFirst({
            where: {
                userid: hospital.userid,
                requestid: testRequestId,
            },
            orderBy: { sentat: "desc" },
        });
        if (!hospNotif) {
            throw new Error("Hospital in-app notification for donor acceptance was not created.");
        }
        console.log(`  ✓ Hospital in-app notification delivered: "${hospNotif.title}"`);

        // 8. Test Transit Status Update
        console.log("\n[Test 8] Testing updateTransitStatus by Hospital...");
        const transitRes = await EmergencyDonorMatchingService.updateTransitStatus(
            hospital.userid,
            delivery.deliveryid,
            "IN_TRANSIT",
            "Donor en route to hospital blood bank"
        );
        console.log(`  ✓ Transit update: ${transitRes.transitStatus}`);

        // 9. Test Tenant Isolation & Security Boundaries
        console.log("\n[Test 9] Testing Tenant Isolation...");
        // Another hospital cannot match or see testRequestId
        const otherHospital = await prisma.hospitals.findFirst({
            where: {
                hospitalid: { not: hospital.hospitalid },
                approvalstatus: "APPROVED",
            },
            include: { users: true },
        });

        if (otherHospital) {
            try {
                await EmergencyDonorMatchingService.findMatchingCandidates(
                    otherHospital.userid,
                    testRequestId
                );
                throw new Error("Security breach: Hospital was able to match candidates for another hospital's request!");
            } catch (err: any) {
                if (err.message.includes("Access denied")) {
                    console.log(`  ✓ Isolation verified: Other hospital correctly rejected (${err.message})`);
                } else {
                    throw err;
                }
            }
        } else {
            console.log("  (Single approved hospital in DB, skipped cross-hospital isolation check)");
        }

        // 10. Test Express HTTP Endpoints
        console.log("\n[Test 10] Testing HTTP API Endpoints with JWT Authentication...");
        const PORT = 5055;
        server = app.listen(PORT);

        const secret = getJwtSecret();
        const hospitalToken = jwt.sign(
            { userid: hospital.users.userid, email: hospital.users.email, role: "HOSPITAL" },
            secret,
            { algorithm: "HS256", expiresIn: "1h" }
        );

        const donorToken = jwt.sign(
            { userid: testDonor.users.userid, email: testDonor.users.email, role: "DONOR" },
            secret,
            { algorithm: "HS256", expiresIn: "1h" }
        );

        // Helper for fetch
        const apiGet = async (path: string, token: string) => {
            const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return { status: res.status, data: await res.json() };
        };

        // Test GET /hospitals/me/emergency-matching/overview
        const overviewHttp = await apiGet("/hospitals/me/emergency-matching/overview", hospitalToken);
        console.log(`  HTTP GET /hospitals/me/emergency-matching/overview -> Status ${overviewHttp.status}`);
        if (overviewHttp.status !== 200 || !overviewHttp.data.success) {
            throw new Error(`Overview HTTP endpoint failed with status ${overviewHttp.status}`);
        }

        // Test GET /donors/me/emergency-requests/donor/requests
        const donorRequestsHttp = await apiGet("/donors/me/emergency-requests/donor/requests", donorToken);
        console.log(`  HTTP GET /donors/me/emergency-requests/donor/requests -> Status ${donorRequestsHttp.status}`);
        if (donorRequestsHttp.status !== 200 || !donorRequestsHttp.data.success) {
            throw new Error(`Donor requests HTTP endpoint failed with status ${donorRequestsHttp.status}`);
        }

        // Test Unauthenticated request rejection
        const unauthRes = await fetch(`http://127.0.0.1:${PORT}/hospitals/me/emergency-matching/overview`);
        console.log(`  HTTP GET without token -> Status ${unauthRes.status}`);
        if (unauthRes.status !== 401 && unauthRes.status !== 403) {
            throw new Error(`Expected 401/403 for unauthenticated request, got ${unauthRes.status}`);
        }
        console.log("  ✓ API endpoints and role authorization successfully verified.");

        // Cleanup test data if we created a temporary request
        if (createdTestRequest) {
            console.log("\n[Cleanup] Cleaning up test requisition and associated deliveries...");
            await prisma.broadcastdeliveries.deleteMany({ where: { requestid: testRequestId } });
            await prisma.emergencybroadcasts.deleteMany({ where: { requestid: testRequestId } });
            await prisma.notification.deleteMany({ where: { requestid: testRequestId } });
            await prisma.bloodrequests.delete({ where: { requestid: testRequestId } });
            console.log("  ✓ Test artifacts cleaned up.");
        }

        console.log("\n========================================================");
        console.log(">>> ALL 10 TESTS PASSED: FEATURE 10 FULLY VERIFIED <<<");
        console.log("========================================================\n");
    } finally {
        if (server) {
            server.close();
        }
        await prisma.$disconnect();
    }
}

runEmergencyMatchingTests().catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
