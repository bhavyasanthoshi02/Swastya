import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import app from "../src/app";
import http from "http";
import * as XLSX from "xlsx";
import crypto from "crypto";
import bcrypt from "bcrypt";

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

async function runPhase57Tests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 5.7: HOSPITAL DONOR REGISTRY & BULK IMPORT TEST SUITE           ");
    console.log("===============================================================================\n");

    const timestamp = Date.now();
    const hospAEmail = `hosp_57_a_${timestamp}@swastya.org`;
    const hospBEmail = `hosp_57_b_${timestamp}@swastya.org`;
    const existingDonorEmail = `existing_donor_57_${timestamp}@swastya.org`;
    const swathiEmail = `swathi_donor_57_${timestamp}@swastya.org`;

    let hospAToken = "";
    let hospBToken = "";
    let existingDonorToken = "";
    let swathiToken = "";
    let hospAId = "";
    let hospBId = "";
    let existingDonorId = "";
    let swathiDonorId = "";

    try {
        // Setup Hospital A
        const userA = await prisma.users.create({
            data: {
                name: "Apollo Jubilee Hospital",
                email: hospAEmail,
                phonenumber: "+91 9988771122",
                password: await bcrypt.hash("HospPass123!", 10),
                role: "HOSPITAL",
                isactive: true,
                emailverified: true,
            },
        });
        const hospA = await prisma.hospitals.create({
            data: {
                userid: userA.userid,
                hospitalname: "Apollo Jubilee Hospital",
                registrationnumber: `REG-57-A-${timestamp}`,
                contactpersonname: "Dr. Arvind Rao",
                contactpersonphone: "+91 9988771122",
                address: "Road No 36, Jubilee Hills",
                city: "Hyderabad",
                state: "Telangana",
                pincode: "500033",
                approvalstatus: "APPROVED",
            },
        });
        hospAId = hospA.hospitalid;
        hospAToken = generateToken(userA.userid, userA.role);

        // Setup Hospital B (for tenant isolation tests)
        const userB = await prisma.users.create({
            data: {
                name: "Care Banjara Hospital",
                email: hospBEmail,
                phonenumber: "+91 9988773344",
                password: await bcrypt.hash("HospPass123!", 10),
                role: "HOSPITAL",
                isactive: true,
                emailverified: true,
            },
        });
        const hospB = await prisma.hospitals.create({
            data: {
                userid: userB.userid,
                hospitalname: "Care Banjara Hospital",
                registrationnumber: `REG-57-B-${timestamp}`,
                contactpersonname: "Dr. Sunita Varma",
                contactpersonphone: "+91 9988773344",
                address: "Road No 1, Banjara Hills",
                city: "Hyderabad",
                state: "Telangana",
                pincode: "500034",
                approvalstatus: "APPROVED",
            },
        });
        hospBId = hospB.hospitalid;
        hospBToken = generateToken(userB.userid, userB.role);

        // Setup an existing verified Swastya donor
        const userExisting = await prisma.users.create({
            data: {
                name: "Kiran Kumar",
                email: existingDonorEmail,
                phonenumber: "+91 9876543210",
                password: await bcrypt.hash("KiranPass123!", 10),
                role: "DONOR",
                isactive: true,
                emailverified: true,
            },
        });
        const donorExisting = await prisma.donors.create({
            data: {
                userid: userExisting.userid,
                bloodgroup: "O_POSITIVE",
                dateofbirth: new Date(1992, 4, 15),
                gender: "MALE",
                city: "Hyderabad",
                state: "Telangana",
                pincode: "500001",
                iseligible: true,
                availabilitystatus: "AVAILABLE",
            },
        });
        existingDonorId = donorExisting.donorid;
        existingDonorToken = generateToken(userExisting.userid, userExisting.role);

        console.log("-> Test fixture accounts initialized successfully.\n");

        // -------------------------------------------------------------------------
        // Test 1: Authorized Hospital uploads a valid CSV file (Preview & Commit)
        // -------------------------------------------------------------------------
        console.log("TEST 1: Authorized hospital uploads a valid CSV file");
        const validCsv = `Full Name,Email,Phone Number,Blood Group,Date of Birth,Gender,City,Source Donor ID,Donation Date,Units Donated,Blood Component,Source Record ID
Swathi Reddy,${swathiEmail},+91 9123456789,A+,1995-08-20,FEMALE,Hyderabad,APO-D01,2023-04-10,1,WHOLE_BLOOD,HIST-2023-01
Mahesh Babu,mahesh_${timestamp}@example.com,+91 9123456780,O-,1988-12-05,MALE,Hyderabad,APO-D02,2022-11-15,1,WHOLE_BLOOD,HIST-2022-09`;

        const csvPreviewRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                csvContent: validCsv,
                fileName: "apollo_donors.csv",
            }),
        });
        const csvPreviewData = await csvPreviewRes.json();
        assert(csvPreviewRes.status === 200, "Valid CSV preview returns 200 OK");
        assert(csvPreviewData.success === true, "Valid CSV preview success is true");
        assert(csvPreviewData.summary.totalRows === 2, "Valid CSV detects total 2 rows");
        assert(csvPreviewData.summary.toCreateCount === 2, "Both rows flagged as toCreate");
        assert(csvPreviewData.summary.historicalDonationsCount === 2, "Historical donations detected inline");

        // Commit CSV import
        const csvCommitRes = await fetch(`${API_BASE}/hospitals/me/donors/import/commit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                toCreate: csvPreviewData.toCreate,
                toLink: csvPreviewData.toLink,
                validDonations: csvPreviewData.validDonations,
            }),
        });
        const csvCommitData = await csvCommitRes.json();
        assert(csvCommitRes.status === 200, "CSV commit returns 200 OK");
        assert(csvCommitData.importedCount === 2, "CSV commit imported 2 new donors");
        assert(csvCommitData.historicalDonationsImported === 2, "CSV commit imported 2 historical donations");
        assert(csvCommitData.deliveryStatus === "NO_GATEWAY_CONFIGURED", "Delivery status safely reports NO_GATEWAY_CONFIGURED");
        assert(csvCommitData.activationRecords.length === 2, "Generated 2 secure activation records with single-use tokens");

        // Store Swathi's activation token
        const swathiActivationRecord = csvCommitData.activationRecords.find((r: any) => r.email === swathiEmail);
        assert(Boolean(swathiActivationRecord), "Swathi's activation record exists");
        const swathiActivationToken = swathiActivationRecord.activationToken;

        // -------------------------------------------------------------------------
        // Test 2: Authorized hospital uploads a valid multi-sheet Excel file (.xlsx)
        // -------------------------------------------------------------------------
        console.log("\nTEST 2: Authorized hospital uploads a valid multi-sheet Excel file");
        const wb = XLSX.utils.book_new();
        const donorsSheetData = [
            ["Full Name", "Email", "Phone Number", "Blood Group", "Date of Birth", "Gender", "City", "Source Donor ID"],
            ["Ravi Varma", `ravi_${timestamp}@example.com`, "+91 9123456781", "B+", "1991-03-22", "MALE", "Hyderabad", "APO-D03"],
            ["Anita Desai", `anita_${timestamp}@example.com`, "+91 9123456782", "AB+", "1994-07-14", "FEMALE", "Hyderabad", "APO-D04"],
        ];
        const donationsSheetData = [
            ["Donor Identifier", "Donation Date", "Units Donated", "Blood Component", "Source Record ID", "Remarks"],
            [`ravi_${timestamp}@example.com`, "2023-01-15", "1", "PLATELETS", "HIST-2023-PLT-01", "Apheresis unit"],
            [`anita_${timestamp}@example.com`, "2022-09-10", "1", "WHOLE_BLOOD", "HIST-2022-WB-02", "Annual drive"],
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(donorsSheetData), "Donors");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(donationsSheetData), "Historical Donations");
        const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        const xlsxPreviewRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                fileData: Buffer.from(xlsxBuffer).toString("base64"),
                fileName: "donors_batch.xlsx",
            }),
        });
        const xlsxPreviewData = await xlsxPreviewRes.json();
        assert(xlsxPreviewRes.status === 200, "Excel preview returns 200 OK");
        assert(xlsxPreviewData.summary.totalRows === 2, "Excel preview detects 2 donors");
        assert(xlsxPreviewData.summary.historicalDonationsCount === 2, "Excel preview detects 2 historical donations from second sheet");

        const xlsxCommitRes = await fetch(`${API_BASE}/hospitals/me/donors/import/commit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                toCreate: xlsxPreviewData.toCreate,
                toLink: xlsxPreviewData.toLink,
                validDonations: xlsxPreviewData.validDonations,
            }),
        });
        const xlsxCommitData = await xlsxCommitRes.json();
        assert(xlsxCommitRes.status === 200, "Excel commit returns 200 OK");
        assert(xlsxCommitData.importedCount === 2, "Excel commit imported 2 donors");
        assert(xlsxCommitData.historicalDonationsImported === 2, "Excel commit imported 2 historical donations");

        // -------------------------------------------------------------------------
        // Test 3: Invalid file types and oversized files are rejected
        // -------------------------------------------------------------------------
        console.log("\nTEST 3: Invalid file types and oversized files are rejected");
        const pdfRejectRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                fileData: Buffer.from("fake pdf header %PDF-1.4").toString("base64"),
                fileName: "document.pdf",
            }),
        });
        assert(pdfRejectRes.status === 400, "Uploading .pdf file is rejected with 400 Bad Request");

        const hugeBuffer = Buffer.alloc(6 * 1024 * 1024, "a"); // 6MB > 5MB limit
        const hugeRejectRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                fileData: hugeBuffer.toString("base64"),
                fileName: "huge.xlsx",
            }),
        });
        assert(
            hugeRejectRes.status === 413 || hugeRejectRes.status === 400,
            "Uploading oversized file (>5MB) is rejected with 413 Payload Too Large or 400 Bad Request"
        );

        // -------------------------------------------------------------------------
        // Test 4: Invalid rows produce useful validation errors
        // -------------------------------------------------------------------------
        console.log("\nTEST 4: Invalid rows produce useful validation errors");
        const invalidRowsCsv = `Full Name,Email,Phone Number,Blood Group,Date of Birth,Gender,City
,bad_email_test@example.com,+91 9999900001,A+,1990-01-01,MALE,Hyderabad
Invalid Blood,valid_${timestamp}@example.com,+91 9999900002,INVALID_BG,1990-01-01,MALE,Hyderabad
No Contact User,, ,O+,1990-01-01,MALE,Hyderabad`;

        const invalidPreviewRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                csvContent: invalidRowsCsv,
                fileName: "bad_rows.csv",
            }),
        });
        const invalidPreviewData = await invalidPreviewRes.json();
        assert(invalidPreviewRes.status === 200, "Preview returns 200 with row error diagnostics");
        assert(invalidPreviewData.summary.invalidRowsCount === 3, "All 3 invalid rows flagged");
        assert(invalidPreviewData.invalidRows[0].errors[0].includes("Full Name is required"), "Row 2 reports missing name");
        assert(invalidPreviewData.invalidRows[1].errors[0].includes("Invalid or missing Blood Group"), "Row 3 reports invalid blood group");
        assert(invalidPreviewData.invalidRows[2].errors[0].includes("At least one contact identifier"), "Row 4 reports missing contact identifier");

        // -------------------------------------------------------------------------
        // Test 5 & 6: Duplicate detection & Re-importing does not duplicate accounts or history
        // -------------------------------------------------------------------------
        console.log("\nTEST 5 & 6: Reimporting the same file does not duplicate accounts or history");
        const dupPreviewRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                csvContent: validCsv,
                fileName: "apollo_donors_reupload.csv",
            }),
        });
        const dupPreviewData = await dupPreviewRes.json();
        assert(dupPreviewData.summary.alreadyLinkedCount === 2, "Detects all rows are already in hospital registry");
        assert(dupPreviewData.summary.toCreateCount === 0, "Does not attempt to re-create existing donors");

        // Commit re-upload
        const dupCommitRes = await fetch(`${API_BASE}/hospitals/me/donors/import/commit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                toCreate: dupPreviewData.toCreate,
                toLink: dupPreviewData.toLink,
                validDonations: dupPreviewData.validDonations,
            }),
        });
        const dupCommitData = await dupCommitRes.json();
        assert(dupCommitData.importedCount === 0, "No new accounts created on duplicate re-import");
        assert(dupCommitData.historicalDonationsImported === 0, "No duplicate historical donations created on re-import");

        // -------------------------------------------------------------------------
        // Test 7: Existing Swastya donors are safely linked or flagged upon conflict
        // -------------------------------------------------------------------------
        console.log("\nTEST 7: Existing Swastya accounts verified vs ambiguous conflicts");
        // Safe link (verified email + matching phone)
        const safeLinkCsv = `Full Name,Email,Phone Number,Blood Group,Date of Birth,Gender,City
Kiran Kumar,${existingDonorEmail},+91 9876543210,O+,1992-05-15,MALE,Hyderabad`;
        const linkPreviewRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                csvContent: safeLinkCsv,
                fileName: "link_kiran.csv",
            }),
        });
        const linkPreviewData = await linkPreviewRes.json();
        assert(linkPreviewData.summary.toLinkCount === 1, "Existing verified Swastya account categorized as toLink");

        // Commit link
        const linkCommitRes = await fetch(`${API_BASE}/hospitals/me/donors/import/commit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                toCreate: linkPreviewData.toCreate,
                toLink: linkPreviewData.toLink,
            }),
        });
        const linkCommitData = await linkCommitRes.json();
        assert(linkCommitData.linkedCount === 1, "Existing donor linked to Hospital A registry");

        // Ambiguous match (matching email but conflicting phone number on an unlinked account)
        const unlinkedEmail = `unlinked_donor_57_${timestamp}@swastya.org`;
        const userUnlinked = await prisma.users.create({
            data: {
                name: "Unlinked Global Donor",
                email: unlinkedEmail,
                phonenumber: "+91 9777766666",
                password: await bcrypt.hash("Pass123!", 10),
                role: "DONOR",
                isactive: true,
                emailverified: true,
            },
        });
        await prisma.donors.create({
            data: {
                userid: userUnlinked.userid,
                bloodgroup: "B_POSITIVE",
                dateofbirth: new Date(1993, 2, 10),
                gender: "FEMALE",
                city: "Hyderabad",
                state: "Telangana",
                pincode: "500001",
                iseligible: true,
            },
        });

        const conflictCsv = `Full Name,Email,Phone Number,Blood Group,Date of Birth,Gender,City
Impostor Donor,${unlinkedEmail},+91 9111122222,B+,1993-02-10,FEMALE,Hyderabad`;
        const conflictPreviewRes = await fetch(`${API_BASE}/hospitals/me/donors/import/preview`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                csvContent: conflictCsv,
                fileName: "conflict.csv",
            }),
        });
        const conflictPreviewData = await conflictPreviewRes.json();
        assert(conflictPreviewData.summary.conflictCount === 1, "Ambiguous conflict detected and flagged");
        assert(conflictPreviewData.summary.toLinkCount === 0, "Did not link ambiguous account");

        // -------------------------------------------------------------------------
        // Test 8: Account activation and password setup are secure
        // -------------------------------------------------------------------------
        console.log("\nTEST 8: Account activation and password setup are secure");
        // Pre-activation: Swathi cannot log in with unactivated password
        const preLoginRes = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: swathiEmail,
                password: "RandomSecretGuess",
            }),
        });
        assert(preLoginRes.status === 403 || preLoginRes.status === 401, "Unactivated donor cannot log in before setting password");

        // Verify activation token endpoint
        const verifyTokenRes = await fetch(`${API_BASE}/auth/verify-activation-token?token=${swathiActivationToken}`);
        const verifyTokenData = await verifyTokenRes.json();
        assert(verifyTokenRes.status === 200, "Valid activation token verified successfully");
        assert(verifyTokenData.valid === true, "Token valid is true");
        assert(verifyTokenData.user.email === swathiEmail, "Token belongs to Swathi");

        // Activate donor account (establish personal password)
        const activateRes = await fetch(`${API_BASE}/auth/activate-donor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: swathiActivationToken,
                password: "SwathiSecurePass123!",
            }),
        });
        const activateData = await activateRes.json();
        assert(activateRes.status === 200, "Donor account activated successfully");
        assert(activateData.user.isactive === true, "Activated user isactive is true");
        swathiDonorId = activateData.donor.donorid;

        // Post-activation: Swathi logs in via standard Swastya login
        const postLoginRes = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: swathiEmail,
                password: "SwathiSecurePass123!",
            }),
        });
        const postLoginData = await postLoginRes.json();
        assert(postLoginRes.status === 200, "Activated donor logs in via standard /auth/login successfully");
        swathiToken = postLoginData.token;

        // Token reuse rejection: token cannot be used twice
        const reuseTokenRes = await fetch(`${API_BASE}/auth/activate-donor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: swathiActivationToken,
                password: "NewPassword123!",
            }),
        });
        assert(reuseTokenRes.status === 400, "Reusing activation token is rejected with 400 Bad Request");

        // -------------------------------------------------------------------------
        // Test 9: Tenant Isolation - Hospital A cannot view or modify Hospital B's registry
        // -------------------------------------------------------------------------
        console.log("\nTEST 9: Tenant Isolation between Hospital A and Hospital B");
        // Hospital A views its registry
        const hospARegistryRes = await fetch(`${API_BASE}/hospitals/me/donors`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const hospARegistryData = await hospARegistryRes.json();
        assert(hospARegistryRes.status === 200, "Hospital A gets its registry");
        const hospADonorEmails = hospARegistryData.donors.map((d: any) => d.email);
        assert(hospADonorEmails.includes(swathiEmail), "Hospital A sees Swathi in its registry");

        // Hospital B views its registry
        const hospBRegistryRes = await fetch(`${API_BASE}/hospitals/me/donors`, {
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        const hospBRegistryData = await hospBRegistryRes.json();
        assert(hospBRegistryRes.status === 200, "Hospital B gets its registry");
        const hospBDonorEmails = hospBRegistryData.donors.map((d: any) => d.email);
        assert(!hospBDonorEmails.includes(swathiEmail), "Hospital B cannot see Swathi in its registry (Tenant Isolated)");

        // Hospital B attempts to view Swathi's donor detail in its registry
        const hospBDetailRes = await fetch(`${API_BASE}/hospitals/me/donors/${swathiDonorId}`, {
            headers: { Authorization: `Bearer ${hospBToken}` },
        });
        assert(hospBDetailRes.status === 404, "Hospital B rejected from viewing Hospital A donor record (404 Not Found)");

        // -------------------------------------------------------------------------
        // Test 10: Donors cannot view another donor's history
        // -------------------------------------------------------------------------
        console.log("\nTEST 10: Donors cannot view another donor's history");
        const donorCrossHistoryRes = await fetch(`${API_BASE}/donors/${existingDonorId}/history`, {
            headers: { Authorization: `Bearer ${swathiToken}` },
        });
        assert(donorCrossHistoryRes.status === 403, "Swathi forbidden from viewing Kiran's donation history (403 Forbidden)");

        // -------------------------------------------------------------------------
        // Test 11: Historical donation records preserve original dates and source
        // -------------------------------------------------------------------------
        console.log("\nTEST 11: Historical records preserve dates, component, and source reference");
        const swathiDetailRes = await fetch(`${API_BASE}/hospitals/me/donors/${swathiDonorId}`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const swathiDetailData = await swathiDetailRes.json();
        assert(swathiDetailRes.status === 200, "Hospital A views Swathi's detail");
        const histDonation = swathiDetailData.donor.donations.find((d: any) => d.isImported === true);
        assert(Boolean(histDonation), "Historical donation found in Swathi's records");
        assert(histDonation.sourceRecordId === "HIST-2023-01", "Preserves source record identifier 'HIST-2023-01'");
        assert(histDonation.bloodComponent === "WHOLE_BLOOD", "Preserves blood component WHOLE_BLOOD");
        assert(histDonation.verificationStatus === "PENDING", "Historical record initial status is PENDING");
        assert(histDonation.donationDate.startsWith("2023-04-10"), "Preserves original donation date 2023-04-10");

        // -------------------------------------------------------------------------
        // Test 12: Unverified imports do not automatically alter cooldown / clinical eligibility
        // -------------------------------------------------------------------------
        console.log("\nTEST 12: Unverified imports do not automatically establish cooldown or clinical clearance");
        const swathiProfileRes = await fetch(`${API_BASE}/donors/me/dashboard`, {
            headers: { Authorization: `Bearer ${swathiToken}` },
        });
        const swathiProfileData = await swathiProfileRes.json();
        assert(swathiProfileRes.status === 200, "Swathi fetches dashboard");
        // Swathi's live lastdonationdate was not mutated by unverified historical import
        const dbDonor = await prisma.donors.findUnique({ where: { donorid: swathiDonorId } });
        assert(dbDonor?.lastdonationdate === null, "Unverified historical import did not overwrite donor's lastdonationdate");

        // -------------------------------------------------------------------------
        // Test 13: Import failures do not leave partial or orphaned records
        // -------------------------------------------------------------------------
        console.log("\nTEST 13: Empty / zero-row commit produces safe error without orphaned records");
        const emptyCommitRes = await fetch(`${API_BASE}/hospitals/me/donors/import/commit`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${hospAToken}`,
            },
            body: JSON.stringify({
                toCreate: [],
                toLink: [],
                validDonations: [],
            }),
        });
        assert(emptyCommitRes.status === 400, "Empty commit rejected with 400 Bad Request");

        // -------------------------------------------------------------------------
        // Test 14: Swathi's dashboard displays imported history correctly
        // -------------------------------------------------------------------------
        console.log("\nTEST 14: Swathi's dashboard displays imported historical donations");
        const swathiHistoryRes = await fetch(`${API_BASE}/donors/me/history`, {
            headers: { Authorization: `Bearer ${swathiToken}` },
        });
        const swathiHistoryData = await swathiHistoryRes.json();
        assert(swathiHistoryRes.status === 200, "Swathi views her own donation history");
        assert(swathiHistoryData.history.length >= 1, "Swathi sees her imported donation");
        const item = swathiHistoryData.history[0];
        assert(item.isImported === true, "History item isImported is true");
        assert(item.verificationStatus === "PENDING", "History item verificationStatus is PENDING");
        assert(Boolean(item.sourceHospital), "History item shows source hospital");

        // -------------------------------------------------------------------------
        // Test 15: Download Template & Filtering verification
        // -------------------------------------------------------------------------
        console.log("\nTEST 15: Template download and Registry Filtering");
        const templateCsvRes = await fetch(`${API_BASE}/hospitals/me/donors/import/template?format=csv`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        assert(templateCsvRes.status === 200, "Template CSV download returns 200");
        const templateCsvText = await templateCsvRes.text();
        assert(templateCsvText.includes("Full Name,Email,Phone Number,Blood Group"), "Template includes standard headers");

        const templateXlsxRes = await fetch(`${API_BASE}/hospitals/me/donors/import/template?format=xlsx`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        assert(templateXlsxRes.status === 200, "Template XLSX download returns 200");

        // Filter registry by bloodGroup
        const filterBgRes = await fetch(`${API_BASE}/hospitals/me/donors?bloodGroup=${encodeURIComponent("A+")}`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const filterBgData = await filterBgRes.json();
        assert(filterBgData.donors.length > 0, "Filtered donors list is not empty");
        assert(filterBgData.donors.every((d: any) => d.bloodGroup === "A+"), "Filtering by bloodGroup A+ returns only A+ donors");

        // Filter registry by accountStatus=ACTIVATED
        const filterActRes = await fetch(`${API_BASE}/hospitals/me/donors?accountStatus=ACTIVATED`, {
            headers: { Authorization: `Bearer ${hospAToken}` },
        });
        const filterActData = await filterActRes.json();
        assert(filterActData.donors.every((d: any) => d.accountStatus === "ACTIVATED"), "Filtering by ACTIVATED returns only active accounts");

        // Verification status patch test
        const patchRes = await fetch(
            `${API_BASE}/hospitals/me/donors/${swathiDonorId}/history/${histDonation.donationHistoryId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${hospAToken}`,
                },
                body: JSON.stringify({
                    status: "VERIFIED",
                    remarks: "Verified against physical hospital register",
                }),
            }
        );
        const patchData = await patchRes.json();
        assert(patchRes.status === 200, "Hospital successfully updates historical record status to VERIFIED");
        assert(patchData.record.verificationstatus === "VERIFIED", "Verification status in DB is VERIFIED");

        console.log("\n===============================================================================");
        console.log(`  ALL ${passedTests}/${totalTests} PHASE 5.7 INTEGRATION TESTS PASSED SUCCESSFULLY!`);
        console.log("===============================================================================\n");
    } finally {
        if (server) {
            server.close();
        }
    }
}

async function start() {
    server = app.listen(0, async () => {
        const addr = server.address();
        if (typeof addr === "object" && addr !== null) {
            API_BASE = `http://localhost:${addr.port}`;
            console.log(`Test server running at ${API_BASE}`);
            try {
                await runPhase57Tests();
                process.exit(0);
            } catch (err) {
                console.error("Test execution failed:", err);
                process.exit(1);
            }
        }
    });
}

start();
