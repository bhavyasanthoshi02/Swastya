import dotenv from "dotenv";
import path from "path";
import http from "http";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function runE2EAuthTest() {
  console.log("=== COMPREHENSIVE END-TO-END AUTHENTICATION TEST (ALL 4 ROLES) ON NEON ===");

  const appModule = await import("../src/app");
  const app = appModule.default;
  const { prisma } = await import("../src/config/prisma");

  // Spin up an ephemeral HTTP server on a random free port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral Express server listening on ${baseUrl}`);

  const timestamp = Date.now();
  const testUsers = [
    {
      role: "DONOR",
      expectedPortal: "/donor/dashboard",
      payload: {
        name: `Auto Test Donor ${timestamp}`,
        email: `autotest_donor_${timestamp}@swastya.org`,
        phoneNumber: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: "DonorPassword123!",
        role: "DONOR",
        bloodGroup: "O+",
        dateOfBirth: "1994-08-20",
        gender: "MALE",
        weight: "72",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
      }
    },
    {
      role: "REQUESTER",
      expectedPortal: "/requester/dashboard",
      payload: {
        name: `Auto Test Requester ${timestamp}`,
        email: `autotest_requester_${timestamp}@swastya.org`,
        phoneNumber: `97${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: "RequesterPassword123!",
        role: "REQUESTER",
        address: "7th Main Road, Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560038",
      }
    },
    {
      role: "HOSPITAL",
      expectedPortal: "/hospital/dashboard",
      payload: {
        name: `Auto Test Hospital Rep ${timestamp}`,
        email: `autotest_hospital_${timestamp}@swastya.org`,
        phoneNumber: `96${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: "HospitalPassword123!",
        role: "HOSPITAL",
        hospitalName: `Apollo Care Hospital ${timestamp}`,
        registrationNumber: `HOSP-REG-${timestamp}`,
        contactPersonName: "Dr. Sandeep Rao",
        contactPersonPhone: "9600000001",
        address: "Bannerghatta Main Road",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560076",
      }
    },
    {
      role: "BLOOD_BANK",
      expectedPortal: "/bloodbank/dashboard",
      payload: {
        name: `Auto Test Blood Bank Admin ${timestamp}`,
        email: `autotest_bloodbank_${timestamp}@swastya.org`,
        phoneNumber: `95${Math.floor(10000000 + Math.random() * 90000000)}`,
        password: "BloodBankPassword123!",
        role: "BLOOD_BANK",
        bloodBankName: `Rotary Regional Blood Bank ${timestamp}`,
        licenseNumber: `BB-LIC-${timestamp}`,
        contactPersonName: "Kavita Nair",
        contactPersonPhone: "9500000002",
        address: "HAL 2nd Stage, Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560008",
      }
    }
  ];

  const results: any[] = [];
  const createdUserIds: string[] = [];

  for (const item of testUsers) {
    console.log(`\n========================================================`);
    console.log(`>>> TESTING ROLE: ${item.role}`);
    console.log(`========================================================`);

    // 1. SIGNUP TEST
    console.log(`1. Sending POST /auth/register for ${item.role}...`);
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.payload),
    });
    const regBody = await regRes.json() as any;

    console.log(`   Status: ${regRes.status}`);
    if (regRes.status !== 201) {
      console.error(`   Registration FAILED!`, regBody);
      results.push({ role: item.role, stage: "SIGNUP", status: "FAILED", details: regBody });
      continue;
    }

    const { token, user } = regBody;
    createdUserIds.push(user.userid);
    console.log(`   -> SUCCESS! User ID: ${user.userid}, Role: ${user.role}`);
    console.log(`   -> JWT Token generated? ${Boolean(token)}`);

    // 2. VERIFY PASSWORD HASHING IN DB
    const dbUser = await prisma.users.findUnique({
      where: { userid: user.userid }
    });
    const isHashed = dbUser?.password.startsWith("$2b$") && dbUser?.password !== item.payload.password;
    const bcryptVerifies = await bcrypt.compare(item.payload.password, dbUser?.password || "");
    console.log(`2. Password hashing check: stored="${dbUser?.password.substring(0, 10)}...", validBcrypt=${bcryptVerifies}`);

    // 3. VERIFY ROLE-SPECIFIC PROFILE CREATION IN NEON
    let profileCreated = false;
    if (item.role === "DONOR") {
      const p = await prisma.donors.findUnique({ where: { userid: user.userid } });
      profileCreated = Boolean(p && p.bloodgroup === "O_POSITIVE");
      console.log(`3. Verified Neon 'donors' record: donorid=${p?.donorid}, bloodgroup=${p?.bloodgroup}`);
    } else if (item.role === "REQUESTER") {
      const p = await prisma.requesters.findUnique({ where: { userid: user.userid } });
      profileCreated = Boolean(p && p.city === "Bengaluru");
      console.log(`3. Verified Neon 'requesters' record: requesterid=${p?.requesterid}, city=${p?.city}`);
    } else if (item.role === "HOSPITAL") {
      const p = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
      profileCreated = Boolean(p && p.hospitalname === item.payload.hospitalName);
      console.log(`3. Verified Neon 'hospitals' record: hospitalid=${p?.hospitalid}, name=${p?.hospitalname}`);
    } else if (item.role === "BLOOD_BANK") {
      const p = await prisma.bloodbanks.findUnique({ where: { userid: user.userid } });
      profileCreated = Boolean(p && p.bloodbankname === item.payload.bloodBankName);
      console.log(`3. Verified Neon 'bloodbanks' record: bloodbankid=${p?.bloodbankid}, name=${p?.bloodbankname}`);
    }

    // 4. SIGNIN TEST
    console.log(`4. Sending POST /auth/login for ${item.role}...`);
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: item.payload.email,
        password: item.payload.password
      }),
    });
    const loginBody = await loginRes.json() as any;

    console.log(`   Status: ${loginRes.status}`);
    if (loginRes.status !== 200) {
      console.error(`   Login FAILED!`, loginBody);
      results.push({ role: item.role, stage: "SIGNIN", status: "FAILED", details: loginBody });
      continue;
    }

    const loginToken = loginBody.token;
    console.log(`   -> SUCCESS! Login successful. Token received: ${loginToken.substring(0, 20)}...`);

    // 5. JWT DECODE & VERIFICATION
    const decoded: any = jwt.decode(loginToken);
    const jwtValid = decoded && decoded.userid === user.userid && decoded.role === item.role;
    console.log(`5. JWT payload verification: userid=${decoded?.userid}, role=${decoded?.role}, valid=${jwtValid}`);

    // 6. /auth/me WITH BEARER TOKEN
    console.log(`6. Sending GET /auth/me with Bearer token...`);
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${loginToken}`,
      },
    });
    const meBody = await meRes.json() as any;

    console.log(`   Status: ${meRes.status}`);
    const meValid = meRes.status === 200 && meBody.success && meBody.user.email === item.payload.email.toLowerCase();
    console.log(`   -> SUCCESS! /auth/me returned correct authenticated user: ${meBody.user?.email}`);

    // 7. PORTAL REDIRECT DETERMINATION
    const roleToPortal: Record<string, string> = {
      DONOR: "/donor/dashboard",
      REQUESTER: "/requester/dashboard",
      HOSPITAL: "/hospital/dashboard",
      BLOOD_BANK: "/bloodbank/dashboard"
    };
    const redirectUrl = roleToPortal[meBody.user.role];
    const redirectCorrect = redirectUrl === item.expectedPortal;
    console.log(`7. Portal redirect mapping: targetRole=${meBody.user.role} -> ${redirectUrl} (Expected: ${item.expectedPortal}) -> ${redirectCorrect ? "MATCH" : "MISMATCH"}`);

    results.push({
      role: item.role,
      signup: "PASSED",
      passwordHash: isHashed && bcryptVerifies ? "PASSED" : "FAILED",
      profileCreation: profileCreated ? "PASSED" : "FAILED",
      signin: "PASSED",
      jwtGeneration: jwtValid ? "PASSED" : "FAILED",
      authMe: meValid ? "PASSED" : "FAILED",
      portalRedirect: redirectCorrect ? "PASSED" : "FAILED",
      targetPortal: redirectUrl
    });
  }

  // 8. CLEANUP CREATED TEST USERS (Keep Neon clean!)
  console.log("\nCleaning up created test records from Neon...");
  for (const uid of createdUserIds) {
    try {
      await prisma.donors.deleteMany({ where: { userid: uid } });
      await prisma.requesters.deleteMany({ where: { userid: uid } });
      await prisma.hospitals.deleteMany({ where: { userid: uid } });
      await prisma.bloodbanks.deleteMany({ where: { userid: uid } });
      await prisma.users.delete({ where: { userid: uid } });
    } catch (e: any) {
      console.warn(`Cleanup notice for user ${uid}:`, e.message);
    }
  }
  console.log("Cleanup completed. Neon test records safely removed.");

  console.log("\n========================================================");
  console.log("FINAL AUTHENTICATION VERIFICATION MATRIX");
  console.log("========================================================");
  console.table(results);

  const allPassed = results.every(r =>
    r.signup === "PASSED" &&
    r.passwordHash === "PASSED" &&
    r.profileCreation === "PASSED" &&
    r.signin === "PASSED" &&
    r.jwtGeneration === "PASSED" &&
    r.authMe === "PASSED" &&
    r.portalRedirect === "PASSED"
  );

  if (allPassed) {
    console.log("\n>>> ALL 4 ROLES PASSED END-TO-END SIGNUP, SIGNIN, AND /AUTH/ME! <<<");
  } else {
    throw new Error("One or more role verification stages failed!");
  }

  server.close();
  await prisma.$disconnect();
}

runE2EAuthTest().catch((err) => {
  console.error("FATAL E2E Auth Test Error:", err);
  process.exit(1);
});
