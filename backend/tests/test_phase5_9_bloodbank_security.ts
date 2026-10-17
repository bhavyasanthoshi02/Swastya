/**
 * Phase 5.9 - Blood Bank API Security Remediation Test Suite
 *
 * Validates:
 * 1. Unauthenticated requests to POST /, PUT /:id, and DELETE /:id are rejected (401).
 * 2. Authenticated users with unauthorized roles (DONOR, REQUESTER, HOSPITAL) cannot mutate blood bank records (403).
 * 3. Authorized users (BLOOD_BANK, ADMIN) can perform permitted operations.
 * 4. Non-admins cannot modify privileged fields (approvalstatus, userid) on creation or update (403).
 * 5. Cross-tenant ownership: users cannot modify another owner's record (403).
 * 6. Malformed and non-existent IDs return 404.
 * 7. Invalid input (missing required fields, duplicate license) is rejected with 400 / 409.
 * 8. Public listing GET / and detail GET /:id continue working and DO NOT leak password hashes.
 * 9. Dependent records protection: deletion of blood bank with clinical/inventory history is soft-deactivated (REJECTED).
 * 10. Clean blood bank with no dependent records can be deleted by ADMIN.
 */

import http from "node:http";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { generateToken } from "../src/utils/jwt";
import bcrypt from "bcrypt";
import { approval_status, blood_group, blood_component, user_role } from "../src/generated/prisma/enums";

let API_BASE = "http://127.0.0.1:5000";
let server: http.Server | null = null;

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

async function runTests() {
    console.log("===============================================================================");
    console.log("  SWASTYA PHASE 5.9: BLOOD BANK API SECURITY REMEDIATION TEST SUITE            ");
    console.log("===============================================================================\n");

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as any;
    API_BASE = `http://127.0.0.1:${addr.port}`;
    console.log(`Ephemeral test HTTP server listening on ${API_BASE}\n`);

    const timestamp = Date.now();
    const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

    // Track IDs to clean up in finally block
    const createdUserIds: string[] = [];
    const createdBloodBankIds: string[] = [];
    const createdInventoryIds: string[] = [];

    try {
        // --- Setup Test Users ---
        console.log("--- 1. Setting up Isolated Test Role Accounts ---");

        // 1. Blood Bank User A
        const userA = await prisma.users.create({
            data: {
                name: `BB Admin Alpha ${timestamp}`,
                email: `phase59_bba_${timestamp}@example.com`,
                phonenumber: "+919876500001",
                password: hashedPassword,
                role: user_role.BLOOD_BANK,
            },
        });
        createdUserIds.push(userA.userid);
        const tokenBBA = generateToken(userA.userid, userA.role);

        // 2. Blood Bank User B
        const userB = await prisma.users.create({
            data: {
                name: `BB Admin Beta ${timestamp}`,
                email: `phase59_bbb_${timestamp}@example.com`,
                phonenumber: "+919876500002",
                password: hashedPassword,
                role: user_role.BLOOD_BANK,
            },
        });
        createdUserIds.push(userB.userid);
        const tokenBBB = generateToken(userB.userid, userB.role);

        // 3. Admin User
        const userAdmin = await prisma.users.create({
            data: {
                name: `System Admin ${timestamp}`,
                email: `phase59_admin_${timestamp}@example.com`,
                phonenumber: "+919876500003",
                password: hashedPassword,
                role: user_role.ADMIN,
            },
        });
        createdUserIds.push(userAdmin.userid);
        const tokenAdmin = generateToken(userAdmin.userid, userAdmin.role);

        // 4. Hospital User (Unauthorized role)
        const userHospital = await prisma.users.create({
            data: {
                name: `Hospital Coordinator ${timestamp}`,
                email: `phase59_hosp_${timestamp}@example.com`,
                phonenumber: "+919876500004",
                password: hashedPassword,
                role: user_role.HOSPITAL,
            },
        });
        createdUserIds.push(userHospital.userid);
        const tokenHospital = generateToken(userHospital.userid, userHospital.role);

        // 5. Donor User (Unauthorized role)
        const userDonor = await prisma.users.create({
            data: {
                name: `Voluntary Donor ${timestamp}`,
                email: `phase59_donor_${timestamp}@example.com`,
                phonenumber: "+919876500005",
                password: hashedPassword,
                role: user_role.DONOR,
            },
        });
        createdUserIds.push(userDonor.userid);
        const tokenDonor = generateToken(userDonor.userid, userDonor.role);

        assert(Boolean(tokenBBA && tokenBBB && tokenAdmin && tokenHospital && tokenDonor), "Test users and JWT tokens generated successfully");

        // --- GROUP 1: Unauthenticated Request Rejection (401) ---
        console.log("\n--- 2. Testing Unauthenticated Request Rejection ---");

        const unauthPost = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bloodbankname: "Hacker Blood Bank" }),
        });
        assert(unauthPost.status === 401, "POST /bloodbanks without token returns 401 Unauthorized");

        const unauthPut = await fetch(`${API_BASE}/bloodbanks/00000000-0000-0000-0000-000000000000`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bloodbankname: "Modified Name" }),
        });
        assert(unauthPut.status === 401, "PUT /bloodbanks/:id without token returns 401 Unauthorized");

        const unauthDelete = await fetch(`${API_BASE}/bloodbanks/00000000-0000-0000-0000-000000000000`, {
            method: "DELETE",
        });
        assert(unauthDelete.status === 401, "DELETE /bloodbanks/:id without token returns 401 Unauthorized");

        // --- GROUP 2: Role Authorization Enforcement (403) ---
        console.log("\n--- 3. Testing Role Authorization Restrictions (DONOR / HOSPITAL) ---");

        const donorPost = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenDonor}`,
            },
            body: JSON.stringify({ bloodbankname: "Donor Fake BB" }),
        });
        assert(donorPost.status === 403, "POST /bloodbanks with DONOR role returns 403 Forbidden");

        const hospitalPost = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenHospital}`,
            },
            body: JSON.stringify({ bloodbankname: "Hospital Fake BB" }),
        });
        assert(hospitalPost.status === 403, "POST /bloodbanks with HOSPITAL role returns 403 Forbidden");

        const donorDelete = await fetch(`${API_BASE}/bloodbanks/00000000-0000-0000-0000-000000000000`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenDonor}` },
        });
        assert(donorDelete.status === 403, "DELETE /bloodbanks/:id with DONOR role returns 403 Forbidden");

        const hospitalDelete = await fetch(`${API_BASE}/bloodbanks/00000000-0000-0000-0000-000000000000`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenHospital}` },
        });
        assert(hospitalDelete.status === 403, "DELETE /bloodbanks/:id with HOSPITAL role returns 403 Forbidden");

        // --- GROUP 3: Creation Input Validation & Privileged Fields ---
        console.log("\n--- 4. Testing Blood Bank Creation & Privileged Fields ---");

        // Missing required fields
        const missingFieldsRes = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBA}`,
            },
            body: JSON.stringify({ bloodbankname: "Incomplete BB" }),
        });
        assert(missingFieldsRes.status === 400, "POST /bloodbanks with missing required fields returns 400 Bad Request");

        // Non-admin attempting to set approvalstatus
        const bbLicenseA = `LIC-BB-A-${timestamp}`;
        const privilegedPost = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBA}`,
            },
            body: JSON.stringify({
                bloodbankname: "City Central Blood Bank",
                licensenumber: bbLicenseA,
                contactpersonname: "Dr. Ramanathan",
                contactpersonphone: "+919876543210",
                address: "42 Medical Enclave",
                city: "Chennai",
                state: "Tamil Nadu",
                pincode: "600001",
                approvalstatus: "APPROVED", // Privileged field!
            }),
        });
        assert(privilegedPost.status === 403, "Non-admin attempting to set approvalstatus on creation returns 403 Forbidden");

        // Valid creation by BLOOD_BANK user A
        const validPostA = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBA}`,
            },
            body: JSON.stringify({
                bloodbankname: "City Central Blood Bank",
                licensenumber: bbLicenseA,
                contactpersonname: "Dr. Ramanathan",
                contactpersonphone: "+919876543210",
                address: "42 Medical Enclave",
                city: "Chennai",
                state: "Tamil Nadu",
                pincode: "600001",
            }),
        });
        const createdBBA = await validPostA.json();
        assert(validPostA.status === 201, "BLOOD_BANK user successfully creates blood bank profile (201)");
        assert(createdBBA.approvalstatus === "PENDING", "Created blood bank defaults to PENDING approval status");
        assert(createdBBA.userid === userA.userid, "Created blood bank links automatically to authenticated user ID");
        createdBloodBankIds.push(createdBBA.bloodbankid);

        // Duplicate profile creation attempt by same user
        const duplicateProfilePost = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBA}`,
            },
            body: JSON.stringify({
                bloodbankname: "Second BB Attempt",
                licensenumber: `LIC-BB-A2-${timestamp}`,
                contactpersonname: "Dr. Ramanathan",
                contactpersonphone: "+919876543210",
                address: "42 Medical Enclave",
                city: "Chennai",
                state: "Tamil Nadu",
                pincode: "600001",
            }),
        });
        assert(duplicateProfilePost.status === 409, "User cannot create a second blood bank profile (409 Conflict)");

        // Valid creation of Blood Bank B by user B
        const bbLicenseB = `LIC-BB-B-${timestamp}`;
        const validPostB = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBB}`,
            },
            body: JSON.stringify({
                bloodbankname: "Southern Regional Blood Bank",
                licensenumber: bbLicenseB,
                contactpersonname: "Dr. Kavitha",
                contactpersonphone: "+919876543211",
                address: "108 Health Hub",
                city: "Coimbatore",
                state: "Tamil Nadu",
                pincode: "641001",
            }),
        });
        const createdBBB = await validPostB.json();
        assert(validPostB.status === 201, "Second BLOOD_BANK user creates their blood bank profile (201)");
        createdBloodBankIds.push(createdBBB.bloodbankid);

        // Duplicate license number check
        const dupLicensePost = await fetch(`${API_BASE}/bloodbanks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenAdmin}`,
            },
            body: JSON.stringify({
                bloodbankname: "Duplicate License BB",
                licensenumber: bbLicenseA, // Already taken by BB A!
                contactpersonname: "Admin",
                contactpersonphone: "+919876543212",
                address: "100 Admin Way",
                city: "Chennai",
                state: "Tamil Nadu",
                pincode: "600002",
            }),
        });
        assert(dupLicensePost.status === 409, "Duplicate license number on creation returns 409 Conflict");

        // --- GROUP 4: Ownership Verification & Update Protections (PUT /:id) ---
        console.log("\n--- 5. Testing Ownership Controls & Update Protections ---");

        // Cross-owner update attempt: User B trying to update Blood Bank A
        const crossOwnerPut = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBB}`,
            },
            body: JSON.stringify({ bloodbankname: "Hacked by User B" }),
        });
        assert(crossOwnerPut.status === 403, "User B cannot update Blood Bank A (403 Forbidden)");

        // Owner trying to alter approvalstatus
        const ownerPrivilegedPut = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBA}`,
            },
            body: JSON.stringify({ approvalstatus: "APPROVED" }),
        });
        assert(ownerPrivilegedPut.status === 403, "Owner cannot self-approve their blood bank (403 Forbidden)");

        // Owner trying to transfer ownership (userid)
        const ownerTransferPut = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBA}`,
            },
            body: JSON.stringify({ userid: userB.userid }),
        });
        assert(ownerTransferPut.status === 403, "Owner cannot transfer blood bank ownership (403 Forbidden)");

        // Authorized owner update of permitted fields
        const validOwnerPut = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenBBA}`,
            },
            body: JSON.stringify({
                contactpersonname: "Dr. Ramanathan Senior",
                address: "42 Medical Enclave, Phase 2",
            }),
        });
        const updatedBBA = await validOwnerPut.json();
        assert(validOwnerPut.status === 200, "Owner successfully updates permitted profile fields (200)");
        assert(updatedBBA.contactpersonname === "Dr. Ramanathan Senior", "Updated contact person matches");
        assert(updatedBBA.address === "42 Medical Enclave, Phase 2", "Updated address matches");

        // Admin can update approval status
        const adminApprovalPut = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenAdmin}`,
            },
            body: JSON.stringify({ approvalstatus: "APPROVED" }),
        });
        const approvedBBA = await adminApprovalPut.json();
        assert(adminApprovalPut.status === 200, "Admin can approve blood bank (200)");
        assert(approvedBBA.approvalstatus === "APPROVED", "Blood bank status successfully set to APPROVED by admin");

        // --- GROUP 5: Deletion Restrictions & Audit Trail Retention ---
        console.log("\n--- 6. Testing Deletion Restrictions & Soft-Deactivation ---");

        // Owner cannot delete blood bank
        const ownerDelete = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenBBA}` },
        });
        assert(ownerDelete.status === 403, "Owner cannot delete blood bank record (403 Forbidden: ADMIN required)");

        // Add a dependent inventory record to Blood Bank A to test clinical retention
        const inv = await prisma.inventory.create({
            data: {
                bloodbankid: createdBBA.bloodbankid,
                bloodgroup: blood_group.O_POSITIVE,
                bloodcomponent: blood_component.WHOLE_BLOOD,
                unitsavailable: 10,
                unitsreserved: 0,
                expirydate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });
        createdInventoryIds.push(inv.inventoryid);

        // Admin attempts delete on Blood Bank A (has dependent inventory)
        const adminDeleteWithHistory = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenAdmin}` },
        });
        const deleteWithHistoryRes = await adminDeleteWithHistory.json();
        assert(adminDeleteWithHistory.status === 200, "DELETE on blood bank with dependent records returns 200");
        assert(deleteWithHistoryRes.deactivated === true, "Blood bank with inventory is soft-deactivated (deactivated: true)");

        // Verify Blood Bank A record still exists in DB but is marked REJECTED
        const archivedBB = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: createdBBA.bloodbankid },
        });
        assert(archivedBB !== null, "Archived blood bank record is retained in database");
        assert(archivedBB?.approvalstatus === "REJECTED", "Archived blood bank status is marked REJECTED");

        // Clean deletion: Blood Bank B has no dependent records -> Admin delete hard-deletes cleanly
        const adminDeleteClean = await fetch(`${API_BASE}/bloodbanks/${createdBBB.bloodbankid}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenAdmin}` },
        });
        const deleteCleanRes = await adminDeleteClean.json();
        assert(adminDeleteClean.status === 200, "Admin deletes unencumbered blood bank (200)");
        assert(deleteCleanRes.deleted === true, "Blood bank with no dependent records is hard-deleted (deleted: true)");

        const deletedCheck = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: createdBBB.bloodbankid },
        });
        assert(deletedCheck === null, "Hard-deleted blood bank is purged from database");

        // --- GROUP 6: Public Endpoints & Data Sanitization ---
        console.log("\n--- 7. Testing Public Directory & Password Leak Prevention ---");

        // Public list
        const publicList = await fetch(`${API_BASE}/bloodbanks`);
        assert(publicList.status === 200, "GET /bloodbanks is publicly accessible (200)");
        const listData = await publicList.json();
        assert(Array.isArray(listData), "GET /bloodbanks returns array of blood banks");

        // Detail endpoint without password hash leak
        const detailRes = await fetch(`${API_BASE}/bloodbanks/${createdBBA.bloodbankid}`);
        assert(detailRes.status === 200, "GET /bloodbanks/:id returns 200");
        const detailData = await detailRes.json();
        assert(detailData.users !== undefined, "Blood bank includes associated user profile");
        assert(detailData.users.password === undefined, "CRITICAL: users.password hash is NOT exposed in response");
        assert(detailData.users.email !== undefined, "users.email is safely projected");

        // Malformed UUIDs
        const malformedGet = await fetch(`${API_BASE}/bloodbanks/not-a-valid-uuid`);
        assert(malformedGet.status === 404, "GET with malformed UUID returns 404");

        const malformedPut = await fetch(`${API_BASE}/bloodbanks/not-a-valid-uuid`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenAdmin}`,
            },
            body: JSON.stringify({ bloodbankname: "Test" }),
        });
        assert(malformedPut.status === 404, "PUT with malformed UUID returns 404");

        const malformedDelete = await fetch(`${API_BASE}/bloodbanks/not-a-valid-uuid`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokenAdmin}` },
        });
        assert(malformedDelete.status === 404, "DELETE with malformed UUID returns 404");

        console.log("\n===============================================================================");
        console.log(`  PHASE 5.9 SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED        `);
        console.log("===============================================================================\n");
    } finally {
        // Cleanup test data
        console.log("Cleaning up test records...");
        if (createdInventoryIds.length > 0) {
            await prisma.inventory.deleteMany({
                where: { inventoryid: { in: createdInventoryIds } },
            }).catch(() => {});
        }
        if (createdBloodBankIds.length > 0) {
            await prisma.bloodbanks.deleteMany({
                where: { bloodbankid: { in: createdBloodBankIds } },
            }).catch(() => {});
        }
        if (createdUserIds.length > 0) {
            await prisma.users.deleteMany({
                where: { userid: { in: createdUserIds } },
            }).catch(() => {});
        }

        if (server) {
            await new Promise<void>((resolve) => server!.close(() => resolve()));
            console.log("Ephemeral test server closed.\n");
        }
    }
}

runTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
