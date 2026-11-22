import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

import http from "http";
import crypto from "crypto";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { Msg91Service, getPhoneVariants } from "../src/services/msg91.service";
import { user_role } from "../src/generated/prisma/enums";

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

async function runMsg91OtpTestSuite() {
    console.log("===============================================================================");
    console.log("  SWASTYA: MSG91 OTP AUTHENTICATION & ACCESS TOKEN VERIFICATION TEST SUITE");
    console.log("===============================================================================\n");

    const originalFetch = global.fetch;

    // Spin up local HTTP server for API endpoint testing
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}`;

    const cleanupUserIds: string[] = [];
    const suffix = crypto.randomBytes(4).toString("hex");

    try {
        console.log("--- TEST GROUP 1: Unit Verification & Replay Protection ---");

        // Test 1.1: Phone variants generator
        const variants = getPhoneVariants("9876543210");
        assert(
            variants.includes("9876543210") && variants.includes("+919876543210") && variants.includes("919876543210"),
            "1.1: getPhoneVariants generates 10-digit, 91, and +91 variants correctly"
        );

        const variantsWith91 = getPhoneVariants("919876543210");
        assert(
            variantsWith91.includes("9876543210") && variantsWith91.includes("+919876543210"),
            "1.2: getPhoneVariants normalizes 12-digit Indian number with country code"
        );

        // Test 1.3: Empty token handling
        const emptyResult = await Msg91Service.verifyAccessToken("");
        assert(
            emptyResult.success === false && Boolean(emptyResult.message?.includes("Access token is required")),
            "1.3: Msg91Service rejects empty token gracefully"
        );

        // Mock MSG91 verifyAccessToken endpoint selectively
        global.fetch = async (url: any, opts: any) => {
            const urlStr = String(url);
            // Only intercept MSG91 verify URL
            if (urlStr.includes("control.msg91.com") || urlStr.includes("verifyAccessToken")) {
                const bodyStr = opts?.body ? String(opts.body) : "";
                const parsedBody = bodyStr ? JSON.parse(bodyStr) : {};

                if (parsedBody["access-token"] === "invalid_test_token") {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            type: "error",
                            message: "Invalid Access Token",
                        }),
                    } as any;
                }

                if (parsedBody["access-token"] === "expired_test_token") {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            type: "error",
                            message: "Access Token Expired",
                        }),
                    } as any;
                }

                if (parsedBody["access-token"] === "provider_down_token") {
                    return {
                        ok: false,
                        status: 503,
                        json: async () => ({
                            type: "error",
                            message: "Service Unavailable",
                        }),
                    } as any;
                }

                if (parsedBody["access-token"] === "network_error_token") {
                    throw new Error("Connection reset by peer");
                }

                if (parsedBody["access-token"]?.startsWith("valid_test_token_")) {
                    const phoneNum = parsedBody["access-token"].replace("valid_test_token_", "");
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            type: "success",
                            message: phoneNum,
                        }),
                    } as any;
                }
            }

            // Fallback to original fetch for all local API calls
            return originalFetch(url, opts);
        };

        // Test 1.4: Invalid token handling
        const invalidResult = await Msg91Service.verifyAccessToken("invalid_test_token");
        assert(
            invalidResult.success === false && invalidResult.message === "Invalid Access Token",
            "1.4: Msg91Service correctly handles invalid access token from MSG91"
        );

        // Test 1.5: Expired token handling
        const expiredResult = await Msg91Service.verifyAccessToken("expired_test_token");
        assert(
            expiredResult.success === false && Boolean(expiredResult.message),
            "1.5: Msg91Service correctly handles expired access token"
        );

        // Test 1.6: Third-party provider failure (503 status)
        const providerFailResult = await Msg91Service.verifyAccessToken("provider_down_token");
        assert(
            providerFailResult.success === false && Boolean(providerFailResult.message),
            "1.6: Msg91Service handles third-party HTTP provider failures gracefully"
        );

        // Test 1.7: Network exception handling
        const networkFailResult = await Msg91Service.verifyAccessToken("network_error_token");
        assert(
            networkFailResult.success === false && Boolean(networkFailResult.message?.includes("Unable to reach OTP verification service")),
            "1.7: Msg91Service catches network exceptions and returns user-friendly error without leaking authkey"
        );

        // Test 1.8: Successful token verification
        const validResult = await Msg91Service.verifyAccessToken("valid_test_token_919876543210");
        assert(
            validResult.success === true &&
            validResult.identifier === "919876543210" &&
            validResult.normalizedPhone === "9876543210",
            "1.8: Msg91Service extracts verified mobile number and normalizes national format"
        );

        // Test 1.9: Replay attack / duplicate verification prevention
        const replayResult = await Msg91Service.verifyAccessToken("valid_test_token_919876543210");
        assert(
            replayResult.success === false && Boolean(replayResult.message?.includes("already been used or expired")),
            "1.9: Msg91Service prevents replay attacks and rejects duplicate token submissions"
        );

        console.log("\n--- TEST GROUP 2: API Endpoints (verify-otp & login-otp) ---");

        // Test 2.1: POST /auth/verify-otp with missing token
        const resMissing = await fetch(`${baseUrl}/auth/verify-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        const dataMissing = await resMissing.json();
        assert(
            resMissing.status === 400 && dataMissing.success === false,
            "2.1: POST /auth/verify-otp returns 400 on missing token"
        );

        // Test 2.2: POST /auth/verify-otp with invalid token
        const resInvalid = await fetch(`${baseUrl}/auth/verify-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: "invalid_test_token" }),
        });
        const dataInvalid = await resInvalid.json();
        assert(
            resInvalid.status === 400 && dataInvalid.success === false,
            "2.2: POST /auth/verify-otp returns 400 on invalid token"
        );

        // Test 2.3: POST /auth/verify-otp with valid token
        const validVerifyToken = `valid_test_token_91998877${suffix.slice(0, 4)}`;
        const resValid = await fetch(`${baseUrl}/auth/verify-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: validVerifyToken }),
        });
        const dataValid = await resValid.json();
        assert(
            resValid.status === 200 &&
            dataValid.success === true &&
            dataValid.verifiedPhone === `91998877${suffix.slice(0, 4)}`,
            "2.3: POST /auth/verify-otp returns 200 with verifiedPhone for valid token"
        );

        console.log("\n--- TEST GROUP 3: OTP Login & User Matching ---");

        const randDigits = Math.floor(10000 + Math.random() * 90000).toString();
        const nonExistentPhone = `90901${randDigits}`;
        const nonExistentToken = `valid_test_token_91${nonExistentPhone}`;
        const resNonExistent = await fetch(`${baseUrl}/auth/login-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: nonExistentToken }),
        });
        const dataNonExistent: any = await resNonExistent.json();
        assert(
            resNonExistent.status === 404 &&
            dataNonExistent.code === "USER_NOT_FOUND" &&
            dataNonExistent.verifiedPhone === `91${nonExistentPhone}`,
            "3.1: POST /auth/login-otp returns 404 with USER_NOT_FOUND code when user is not registered"
        );

        // Seed an active Donor user with phone number
        const donorPhone = `98765${randDigits}`;
        const seededUser = await prisma.users.create({
            data: {
                name: `Test OTP Donor ${suffix}`,
                email: `otp_donor_${suffix}@swastya.org`,
                phonenumber: donorPhone,
                password: "HashedPassword$123",
                role: user_role.DONOR,
                isactive: true,
            },
        });
        cleanupUserIds.push(seededUser.userid);

        const seededDonor = await prisma.donors.create({
            data: {
                userid: seededUser.userid,
                bloodgroup: "O_POSITIVE" as any,
                dateofbirth: new Date("1995-05-15"),
                gender: "MALE" as any,
                city: "Bhubaneswar",
                state: "Odisha",
                pincode: "751024",
                availabilitystatus: "AVAILABLE" as any,
                iseligible: true,
            },
        });

        // Test 3.2: OTP login for existing user with 91 prefix matches 10-digit DB phonenumber
        const validLoginToken = `valid_test_token_91${donorPhone}`;
        const resLogin = await fetch(`${baseUrl}/auth/login-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: validLoginToken }),
        });
        const dataLogin: any = await resLogin.json();
        assert(
            resLogin.status === 200 &&
            dataLogin.success === true &&
            Boolean(dataLogin.token) &&
            dataLogin.user?.email === seededUser.email &&
            dataLogin.donor?.donorid === seededDonor.donorid,
            "3.2: POST /auth/login-otp successfully matches phone variants and issues valid JWT and donor profile"
        );

        // Test 3.3: POST /auth/login standard endpoint accepts { accessToken } directly
        const validLoginToken2 = `valid_test_token_${donorPhone}`;
        const resStandardLogin = await fetch(`${baseUrl}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: validLoginToken2 }),
        });
        const dataStandardLogin: any = await resStandardLogin.json();
        assert(
            resStandardLogin.status === 200 &&
            dataStandardLogin.success === true &&
            Boolean(dataStandardLogin.token),
            "3.3: POST /auth/login transparently supports { accessToken } for OTP logins"
        );

        // Test 3.4: Deactivated user check during OTP login
        const deactRand = Math.floor(10000 + Math.random() * 90000).toString();
        const deactPhone = `98111${deactRand}`;
        const deactUser = await prisma.users.create({
            data: {
                name: `Deactivated User ${suffix}`,
                email: `deact_${suffix}@swastya.org`,
                phonenumber: deactPhone,
                password: "HashedPassword$123",
                role: user_role.REQUESTER,
                isactive: false,
                emailverified: false,
            },
        });
        cleanupUserIds.push(deactUser.userid);

        const deactLoginToken = `valid_test_token_${deactPhone}`;
        const resDeact = await fetch(`${baseUrl}/auth/login-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken: deactLoginToken }),
        });
        const dataDeact: any = await resDeact.json();
        assert(
            resDeact.status === 403 && dataDeact.success === false,
            "3.4: POST /auth/login-otp denies access (403) to deactivated accounts"
        );

        console.log("\n--- TEST GROUP 4: Registration with MSG91 OTP Verification ---");

        // Test 4.1: Register with invalid OTP token returns 400
        const resRegInvalid = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Test Registration User",
                email: `reg_invalid_${suffix}@swastya.org`,
                password: "Password@123",
                role: "DONOR",
                bloodGroup: "A+",
                dob: "1992-04-10",
                gender: "FEMALE",
                city: "Bhubaneswar",
                state: "Odisha",
                pincode: "751024",
                phone: "9870000000",
                accessToken: "invalid_test_token",
            }),
        });
        const dataRegInvalid = await resRegInvalid.json();
        assert(
            resRegInvalid.status === 400 && dataRegInvalid.message === "Invalid Access Token",
            "4.1: POST /auth/register rejects registration with invalid OTP token"
        );

        // Test 4.2: Register with valid OTP token - verifies trusted phone number from MSG91 overrides client phone
        const verifiedRegistrationPhone = `9198755${suffix.slice(0, 5)}`;
        const validRegToken = `valid_test_token_${verifiedRegistrationPhone}`;

        const resRegValid = await fetch(`${baseUrl}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Verified OTP Donor",
                email: `reg_valid_${suffix}@swastya.org`,
                password: "Password@123",
                role: "DONOR",
                bloodGroup: "B+",
                dob: "1990-08-20",
                gender: "MALE",
                city: "Bhubaneswar",
                state: "Odisha",
                pincode: "751024",
                phone: "0000000000", // Spoofed untrusted phone from client
                accessToken: validRegToken,
            }),
        });
        const dataRegValid = await resRegValid.json();

        assert(
            resRegValid.status === 201 &&
            dataRegValid.success === true &&
            Boolean(dataRegValid.token) &&
            dataRegValid.user?.phonenumber === verifiedRegistrationPhone,
            "4.2: POST /auth/register enforces trusted phone number directly from MSG91 verification response"
        );

        if (dataRegValid.user?.userid) {
            cleanupUserIds.push(dataRegValid.user.userid);
        }

    } finally {
        global.fetch = originalFetch;

        // Cleanup test database records
        console.log("\nCleaning up seeded test users...");
        for (const uid of cleanupUserIds) {
            try {
                await prisma.donors.deleteMany({ where: { userid: uid } });
                await prisma.requesters.deleteMany({ where: { userid: uid } });
                await prisma.users.deleteMany({ where: { userid: uid } });
            } catch (err) {
                // Ignore cleanup errors
            }
        }

        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    }

    console.log("\n===============================================================================");
    console.log(`  MSG91 OTP TEST RESULTS: ${passedTests} PASSED / ${totalTests} TOTAL (${failedTests} FAILED)`);
    console.log("===============================================================================\n");

    if (failedTests > 0) {
        process.exit(1);
    }
}

runMsg91OtpTestSuite()
    .catch((err) => {
        console.error("FATAL ERROR in test suite:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
