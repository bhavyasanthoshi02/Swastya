import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import app from "../src/app";
import http from "http";
import {
    calculateHaversineDistanceKm,
    validateCoordinates,
    evaluateLocationDistance
} from "../src/utils/distance";

let server: http.Server;
let API_BASE = "";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        throw new Error(message);
    }
    console.log(`[PASS] ${message}`);
    passedTests++;
}

async function runPhase1LocationTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 1: LOCATION-AWARE DONOR MATCHING INTEGRATION TEST SUITE        ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();
    const donorEmail = `loc_donor_${timestamp}@swastya.org`;
    const hospitalEmail = `loc_hosp_${timestamp}@swastya.org`;
    const requesterEmail = `loc_req_${timestamp}@swastya.org`;

    let donorUser: any = null;
    let hospitalUser: any = null;
    let requesterUser: any = null;

    let donorRecord: any = null;
    let hospitalRecord: any = null;
    let requesterRecord: any = null;

    let donorToken = "";
    let hospitalToken = "";
    let requesterToken = "";

    try {
        // Start ephemeral HTTP server
        await new Promise<void>((resolve) => {
            server = http.createServer(app);
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address() as any;
                API_BASE = `http://127.0.0.1:${addr.port}`;
                console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);
                resolve();
            });
        });

        // =========================================================================
        // SUITE 1: HAVERSINE DISTANCE AND COORDINATE VALIDATION UNIT TESTS
        // =========================================================================
        console.log("--- SUITE 1: Haversine Calculation & Coordinate Bounds Validation ---");

        // 1. Known landmark distances in Bengaluru:
        // Vidhana Soudha: 12.979119, 77.591299
        // Indiranagar Metro: 12.978370, 77.640827
        // Distance is ~5.37 km
        const dist1 = calculateHaversineDistanceKm(12.979119, 77.591299, 12.978370, 77.640827);
        assert(dist1 !== null && dist1 >= 5.3 && dist1 <= 5.5, `Haversine distance between Vidhana Soudha and Indiranagar is ~5.37 km (calculated: ${dist1} km)`);

        // Same point distance is 0
        const distZero = calculateHaversineDistanceKm(12.979119, 77.591299, 12.979119, 77.591299);
        assert(distZero === 0, `Distance between identical coordinates is strictly 0 km`);

        // Long distance: Bengaluru (12.9716, 77.5946) to New Delhi (28.6139, 77.2090) ~ 1740 km
        const distLong = calculateHaversineDistanceKm(12.9716, 77.5946, 28.6139, 77.2090);
        assert(distLong !== null && distLong >= 1730 && distLong <= 1755, `Bengaluru to Delhi distance is ~1740 km (calculated: ${distLong} km)`);

        // Coordinate bounds validation
        assert(validateCoordinates(12.9716, 77.5946).valid, `Valid coordinates (12.9716, 77.5946) are accepted`);
        assert(validateCoordinates(0, 0).valid, `Equator and prime meridian (0, 0) are accepted`);
        assert(validateCoordinates(90, 180).valid, `Extreme boundary (90, 180) is accepted`);
        assert(validateCoordinates(-90, -180).valid, `Extreme boundary (-90, -180) is accepted`);

        assert(!validateCoordinates(91, 50).valid, `Latitude 91 is rejected (> 90)`);
        assert(!validateCoordinates(-90.1, 50).valid, `Latitude -90.1 is rejected (< -90)`);
        assert(!validateCoordinates(50, 180.5).valid, `Longitude 180.5 is rejected (> 180)`);
        assert(!validateCoordinates(50, -181).valid, `Longitude -181 is rejected (< -180)`);
        assert(!validateCoordinates(NaN, 50).valid, `NaN latitude is rejected`);
        assert(!validateCoordinates(50, NaN).valid, `NaN longitude is rejected`);
        assert(!validateCoordinates(null, 50).valid, `Null latitude is rejected`);

        // Radius filtering and boundary evaluation
        // Inside radius (dist ~3.8 km vs 5 km)
        const evalInside = evaluateLocationDistance(12.9716, 77.5946, 12.9716, 77.6300, 5);
        assert(evalInside.isWithinRadius && evalInside.locationMatch === "COORDINATES" && evalInside.distanceKm !== null && evalInside.distanceKm < 5, `Location within search radius correctly matches with COORDINATES`);

        // Outside radius (dist ~10.3 km vs 5 km radius)
        const evalOutside = evaluateLocationDistance(12.9716, 77.5946, 12.9716, 77.6900, 5);
        assert(!evalOutside.isWithinRadius && evalOutside.locationMatch === "COORDINATES", `Location outside search radius is excluded (isWithinRadius === false)`);

        // Exact boundary evaluation: distance exactly <= radius
        const evalBoundary = evaluateLocationDistance(12.9716, 77.5946, 12.9716, 77.6300, 3.8);
        assert(evalBoundary.isWithinRadius, `Boundary case: distance equal or within rounded radius evaluates correctly`);

        // Fallback when donor has no coordinates
        const evalFallbackCityMatch = evaluateLocationDistance(null, null, 12.9716, 77.5946, 15);
        assert(evalFallbackCityMatch.locationMatch === "CITY_FALLBACK" && evalFallbackCityMatch.distanceKm === null, `Missing donor coordinates return CITY_FALLBACK with distanceKm null`);

        // Fallback when request has no coordinates
        const evalFallbackReqMissing = evaluateLocationDistance(12.9716, 77.5946, null, null, 15);
        assert(evalFallbackReqMissing.locationMatch === "CITY_FALLBACK" && evalFallbackReqMissing.distanceKm === null, `Missing request coordinates return CITY_FALLBACK`);

        // =========================================================================
        // SUITE 2: REPOSITORIES, SIGNUP & PERSISTENCE VALIDATION
        // =========================================================================
        console.log("\n--- SUITE 2: Signup, Profile Coordinates & Non-Destructive Persistence ---");

        // Donor signup with valid coordinates
        const signupRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Phase 1 Location Donor",
                email: donorEmail,
                password: "Password123!",
                phone: "9876543210",
                role: "DONOR",
                bloodGroup: "O+",
                dob: "1995-05-15",
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560034",
                latitude: 12.9352, // Koramangala
                longitude: 77.6245
            })
        });
        const signupData = await signupRes.json();
        assert(signupRes.status === 201 && signupData.success, `Donor registration with valid latitude & longitude succeeds`);
        donorToken = signupData.token;
        donorUser = signupData.user;

        // Verify database persistence of donor coordinates
        donorRecord = await prisma.donors.findUnique({ where: { userid: donorUser.userid || donorUser.id } });
        assert(donorRecord !== null && Number(donorRecord.latitude) === 12.9352 && Number(donorRecord.longitude) === 77.6245, `Donor coordinates saved precisely as Decimal in database`);

        // Donor signup with invalid coordinates must fail with 400
        const badSignupRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Bad Coord Donor",
                email: `bad_coord_${timestamp}@swastya.org`,
                password: "Password123!",
                phone: "9876543211",
                role: "DONOR",
                bloodGroup: "O+",
                dob: "1995-05-15",
                gender: "MALE",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560034",
                latitude: 95.0, // Invalid latitude > 90
                longitude: 77.6245
            })
        });
        assert(badSignupRes.status === 400, `Donor registration with latitude > 90 is rejected with 400 Bad Request`);

        // Donor profile update via PUT /donors/me with valid coordinates
        const updateRes = await fetch(`${API_BASE}/donors/me`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${donorToken}`
            },
            body: JSON.stringify({
                latitude: 12.9279, // Jayanagar
                longitude: 77.5830
            })
        });
        const updateData = await updateRes.json();
        assert(updateRes.status === 200 && updateData.success, `PUT /donors/me successfully updates donor coordinates`);

        // Verify update in database
        const updatedDonor = await prisma.donors.findUnique({ where: { userid: donorUser.userid || donorUser.id } });
        assert(Number(updatedDonor?.latitude) === 12.9279 && Number(updatedDonor?.longitude) === 77.5830, `Database reflects updated coordinates (12.9279, 77.5830)`);

        // Test non-destructive persistence: Updating city without coordinates must NOT overwrite existing valid coordinates
        const partialUpdateRes = await fetch(`${API_BASE}/donors/me`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${donorToken}`
            },
            body: JSON.stringify({
                city: "Bengaluru Central"
            })
        });
        assert(partialUpdateRes.status === 200, `PUT /donors/me partial update with omitted coordinates succeeds`);

        const preservedDonor = await prisma.donors.findUnique({ where: { userid: donorUser.userid || donorUser.id } });
        assert(Number(preservedDonor?.latitude) === 12.9279 && Number(preservedDonor?.longitude) === 77.5830 && preservedDonor?.city === "Bengaluru Central", `Existing valid coordinates are safely PRESERVED when coordinate fields are omitted`);

        // Restore donor coordinates back to Koramangala (12.9352, 77.6245) for distance matching tests
        await fetch(`${API_BASE}/donors/me`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${donorToken}`
            },
            body: JSON.stringify({
                city: "Bengaluru",
                latitude: 12.9352,
                longitude: 77.6245
            })
        });

        // Register hospital and requester for blood request creation
        const hospSignupRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Manipal Hospital Coordinator",
                email: hospitalEmail,
                password: "Password123!",
                phone: "9876543212",
                role: "HOSPITAL",
                hospitalname: "Manipal Hospital Old Airport Rd",
                registrationnumber: `HOSP-${timestamp}`,
                address: "98 HAL Old Airport Road",
                city: "Bengaluru",
                state: "Karnataka",
                pincode: "560017",
                latitude: 12.9592, // ~4.0 km from Koramangala
                longitude: 77.6496
            })
        });
        const hospSignupData = await hospSignupRes.json();
        assert(hospSignupRes.status === 201, `Hospital registered with latitude 12.9592, longitude 77.6496`);
        hospitalToken = hospSignupData.token;
        hospitalUser = hospSignupData.user;
        hospitalRecord = hospSignupData.hospital;

        const reqSignupRes = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Requester Patient Guardian",
                email: requesterEmail,
                password: "Password123!",
                phone: "9876543213",
                role: "PATIENT",
                city: "Bengaluru",
                state: "Karnataka"
            })
        });
        const reqSignupData = await reqSignupRes.json();
        assert(reqSignupRes.status === 201, `Requester registered`);
        requesterToken = reqSignupData.token;
        requesterUser = reqSignupData.user;
        requesterRecord = reqSignupData.requester;

        // =========================================================================
        // SUITE 3: BLOOD REQUEST CREATION WITH RADIUS AND COORDINATES
        // =========================================================================
        console.log("\n--- SUITE 3: Blood Request Creation & Search Radius Validation ---");

        // Validate search radius bounds (must be between 1 and 100 km)
        const badRadiusRes = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${requesterToken}`
            },
            body: JSON.stringify({
                patientname: "Test Patient Invalid Radius",
                patientage: 30,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                searchradius: 150, // Invalid > 100 km
                requiredby: new Date(Date.now() + 86400000).toISOString()
            })
        });
        assert(badRadiusRes.status === 400, `Blood request with search radius > 100 km is rejected with 400`);

        const validPdfBuffer = Buffer.concat([
            Buffer.from("%PDF-1.4\n%âãÏÓ\n"),
            Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")
        ]);
        const makeMultipartReq = (payload: any) => {
            const fd = new FormData();
            for (const [k, v] of Object.entries(payload)) {
                if (v !== undefined && v !== null) fd.append(k, String(v));
            }
            fd.append("prescription", new Blob([validPdfBuffer], { type: "application/pdf" }), "rx.pdf");
            return fd;
        };

        // Requester creates Request 1: Manipal Hospital (~4.0 km from donor, radius 10 km) -> Inside radius
        const req1Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${requesterToken}`
            },
            body: makeMultipartReq({
                patientname: "Patient Near",
                patientage: 35,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 2,
                urgencylevel: "HIGH",
                searchradius: 10,
                latitude: 12.9592, // Manipal Hospital (~4.0 km away)
                longitude: 77.6496,
                requiredby: new Date(Date.now() + 86400000).toISOString(),
                notes: "Close emergency blood requirement"
            })
        });
        const req1Data = await req1Res.json();
        assert(req1Res.status === 201 && (req1Data.requestid || req1Data.data?.requestid), `Requester creates blood request with coordinates and searchradius 10km`);
        const req1Id = req1Data.requestid || req1Data.data?.requestid;

        // Requester creates Request 2: Columbia Asia Hebbal (~13.6 km from donor) with radius 10 km -> Outside radius
        const req2Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${requesterToken}`
            },
            body: makeMultipartReq({
                patientname: "Patient Far Excluded",
                patientage: 42,
                patientgender: "FEMALE",
                patientcontact: "9876543210",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "HIGH",
                searchradius: 10, // Farther than 10 km!
                latitude: 13.0538, // Hebbal (~13.6 km)
                longitude: 77.5925,
                requiredby: new Date(Date.now() + 86400000).toISOString(),
                notes: "Outside 10km radius"
            })
        });
        const req2Data = await req2Res.json();
        assert(req2Res.status === 201 && (req2Data.requestid || req2Data.data?.requestid), `Requester creates blood request at Hebbal with 10km radius`);
        const req2Id = req2Data.requestid || req2Data.data?.requestid;

        // Hospital creates Request 3: Critical emergency request via hospital endpoint (inherits hospital coords, radius 25 km)
        const req3Res = await fetch(`${API_BASE}/hospitals/me/bloodrequests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${hospitalToken}`
            },
            body: JSON.stringify({
                patientname: "Critical Patient Hospital",
                patientage: 60,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 3,
                urgencylevel: "CRITICAL",
                isemergency: true,
                searchradius: 25,
                requiredby: new Date(Date.now() + 3600000).toISOString(),
                notes: "Immediate critical transfusion"
            })
        });
        const req3Data = await req3Res.json();
        assert(req3Res.status === 201 && req3Data.requestid, `Hospital creates blood request inheriting facility coordinates`);
        const req3Id = req3Data.requestid;

        // Requester creates Request 4: Request with NO coordinates in same city (Bengaluru) -> Should match via CITY_FALLBACK
        const req4Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${requesterToken}`
            },
            body: makeMultipartReq({
                patientname: "Patient City Fallback",
                patientage: 28,
                patientgender: "FEMALE",
                patientcontact: "9876543210",
                bloodgroup: "O_POSITIVE",
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "LOW",
                searchradius: 15,
                requiredby: new Date(Date.now() + 86400000).toISOString(),
                notes: "City fallback matching test"
            })
        });
        const req4Data = await req4Res.json();
        assert(req4Res.status === 201 && (req4Data.requestid || req4Data.data?.requestid), `Requester creates request with no coordinates (city fallback test)`);
        const req4Id = req4Data.requestid || req4Data.data?.requestid;

        // Requester creates Request 5: Incompatible blood group request (O- requires O- donor, our donor is O+)
        const req5Res = await fetch(`${API_BASE}/bloodrequests`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${requesterToken}`
            },
            body: makeMultipartReq({
                patientname: "Patient Incompatible Blood",
                patientage: 50,
                patientgender: "MALE",
                patientcontact: "9876543210",
                bloodgroup: "O_NEGATIVE", // Incompatible with O+ donor!
                bloodcomponent: "WHOLE_BLOOD",
                unitsrequired: 1,
                urgencylevel: "CRITICAL",
                searchradius: 50,
                latitude: 12.9592,
                longitude: 77.6496,
                requiredby: new Date(Date.now() + 86400000).toISOString(),
                notes: "Incompatible blood group check"
            })
        });
        const req5Data = await req5Res.json();
        assert(req5Res.status === 201 && (req5Data.requestid || req5Data.data?.requestid), `Created O- request to verify clinical ABO compatibility`);
        const req5Id = req5Data.requestid || req5Data.data?.requestid;

        // =========================================================================
        // SUITE 4: MATCHING FEED EVALUATION (DISTANCE, FALLBACK, PRIVACY, SORTING)
        // =========================================================================
        console.log("\n--- SUITE 4: Donor Matching Feed, Radius Filtering, Fallback & Privacy ---");

        const feedRes = await fetch(`${API_BASE}/donors/me/matching-requests?limit=50`, {
            headers: {
                "Authorization": `Bearer ${donorToken}`
            }
        });
        const feedData = await feedRes.json();
        assert(feedRes.status === 200 && feedData.success && Array.isArray(feedData.requests), `GET /donors/me/matching-requests returns success and array of requests`);

        const requestIds = feedData.requests.map((r: any) => r.requestid);

        // 1. Request 1 (4.0 km away, radius 10 km) MUST be included
        assert(requestIds.includes(req1Id), `Request 1 within radius (~4.0 km <= 10 km) is included in matching feed`);
        const matchedReq1 = feedData.requests.find((r: any) => r.requestid === req1Id);
        assert(matchedReq1.locationMatch === "COORDINATES" && typeof matchedReq1.distanceKm === "number" && matchedReq1.distanceKm <= 5.0, `Request 1 provides numeric distanceKm and locationMatch === "COORDINATES"`);

        // 2. Request 2 (13.6 km away, radius 10 km) MUST be EXCLUDED
        assert(!requestIds.includes(req2Id), `Request 2 outside radius (~13.6 km > 10 km) is strictly EXCLUDED`);

        // 3. Request 3 (Hospital critical request, 4.0 km away, radius 25 km) MUST be included
        assert(requestIds.includes(req3Id), `Hospital-created request within search radius is included`);

        // 4. Request 4 (No coordinates, same city) MUST be included under CITY_FALLBACK
        assert(requestIds.includes(req4Id), `Request 4 with missing coordinates matches under CITY_FALLBACK`);
        const matchedReq4 = feedData.requests.find((r: any) => r.requestid === req4Id);
        assert(matchedReq4.locationMatch === "CITY_FALLBACK" && matchedReq4.distanceKm === null && matchedReq4.distanceDisplay.includes("Distance unavailable"), `Missing coordinates request explicitly labelled as distance unavailable`);

        // 5. Request 5 (O- incompatible blood group) MUST be EXCLUDED by clinical compatibility
        assert(!requestIds.includes(req5Id), `Clinical ABO/Rh compatibility rules strictly preserved (O- request excluded for O+ donor)`);

        // 6. Urgency-first sorting verification:
        // Request 3 is CRITICAL, Request 1 is HIGH, Request 4 is LOW.
        // Critical must be placed before High, and High before Low regardless of distance!
        const idxReq3 = requestIds.indexOf(req3Id);
        const idxReq1 = requestIds.indexOf(req1Id);
        const idxReq4 = requestIds.indexOf(req4Id);
        assert(idxReq3 < idxReq1 && idxReq1 < idxReq4, `Requests are sorted primarily by Urgency level (CRITICAL before HIGH before LOW)`);

        // 7. Privacy audit: No raw decimal coordinates or patient contact leaked in feed
        for (const req of feedData.requests) {
            assert(req.latitude === undefined, `Raw request latitude is stripped from donor response`);
            assert(req.longitude === undefined, `Raw request longitude is stripped from donor response`);
            assert(req.patientcontact === null || req.patientcontact === undefined, `Patient phone number is stripped from donor response`);
            assert(req.patientphone === null || req.patientphone === undefined, `Patient private phone is stripped from donor response`);
        }

        // =========================================================================
        // SUITE 5: CLINICAL AVAILABILITY, COOLDOWN AND AUTHORIZATION RULES
        // =========================================================================
        console.log("\n--- SUITE 5: Donor Availability, Cooldown Rules & Authorization ---");

        // 1. Unauthenticated request to /donors/me/matching-requests must return 401
        const unauthRes = await fetch(`${API_BASE}/donors/me/matching-requests`);
        assert(unauthRes.status === 401, `Unauthenticated request to matching feed is rejected with 401 Unauthorized`);

        // 2. Non-donor role (e.g., Hospital) accessing matching feed must return 403
        const hospAccessRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { "Authorization": `Bearer ${hospitalToken}` }
        });
        assert(hospAccessRes.status === 403, `Non-donor user accessing /donors/me/matching-requests is rejected with 403 Forbidden`);

        // 3. Paused / Unavailable donor status
        // Set donor availability to TEMPORARILY_UNAVAILABLE
        const pauseRes = await fetch(`${API_BASE}/donors/me/availability`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${donorToken}`
            },
            body: JSON.stringify({ availabilitystatus: "TEMPORARILY_UNAVAILABLE" })
        });
        assert(pauseRes.status === 200, `Donor sets availability status to TEMPORARILY_UNAVAILABLE`);

        // When paused, matching feed must return empty list
        const pausedFeedRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { "Authorization": `Bearer ${donorToken}` }
        });
        const pausedFeedData = await pausedFeedRes.json();
        assert(pausedFeedData.requests.length === 0, `Paused donor receives 0 matching requests (availability rule enforced)`);

        // Restore donor availability
        await fetch(`${API_BASE}/donors/me/availability`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${donorToken}`
            },
            body: JSON.stringify({ availabilitystatus: "AVAILABLE" })
        });

        // 4. Donation cooldown: simulate a recent donation 10 days ago (within 90-day cooldown)
        const recentDonation = await prisma.donationhistory.create({
            data: {
                donorid: donorRecord.donorid,
                donationdate: new Date(Date.now() - 10 * 86400000), // 10 days ago
                unitsdonated: 1
            }
        });

        // Check matching feed under cooldown
        const cooldownFeedRes = await fetch(`${API_BASE}/donors/me/matching-requests`, {
            headers: { "Authorization": `Bearer ${donorToken}` }
        });
        const cooldownFeedData = await cooldownFeedRes.json();
        assert(cooldownFeedData.requests.length === 0, `Donor in 90-day donation cooldown receives 0 matching requests (cooldown rule enforced)`);

        // Clean up temporary cooldown record
        await prisma.donationhistory.delete({ where: { donationhistoryid: recentDonation.donationhistoryid } });

        console.log("\n===============================================================================");
        console.log(`  ALL ${passedTests}/${totalTests} PHASE 1 LOCATION-AWARE MATCHING TESTS PASSED!`);
        console.log("===============================================================================\n");

    } catch (err: any) {
        console.error(`\nTest suite aborted with error:`, err);
        throw err;
    } finally {
        if (server) {
            server.close();
        }
        await prisma.$disconnect();
    }
}

runPhase1LocationTests().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
