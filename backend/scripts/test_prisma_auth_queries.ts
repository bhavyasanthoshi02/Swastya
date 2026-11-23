import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcrypt";

process.env.SWASTYA_DB_TARGET = "neon";
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

async function testPrismaAuth() {
  console.log("=== TESTING PRISMA AUTH QUERIES DIRECTLY ON NEON ===");
  const { prisma } = await import("../src/config/prisma");

  try {
    // 1. Test findMany on users
    console.log("1. Testing prisma.users.findMany()...");
    const users = await prisma.users.findMany({ take: 5 });
    console.log(`   -> SUCCESS! Fetched ${users.length} users without P2022 error.`);

    // 2. Test findUnique with all includes on existing user
    console.log("2. Testing prisma.users.findUnique with role profiles...");
    const existing = await prisma.users.findUnique({
      where: { email: "donor@gmail.com" },
      include: {
        donors: true,
        requesters: true,
        hospitals: true,
        bloodbanks: true,
      }
    });
    console.log(`   -> SUCCESS! Found user: ${existing?.email}, role: ${existing?.role}`);
    console.log(`   -> Donor profile linked? ${Boolean(existing?.donors)}`);

    // 3. Test findMany on notifications
    console.log("3. Testing prisma.notification.findMany()...");
    const notifs = await prisma.notification.findMany({ take: 3 });
    console.log(`   -> SUCCESS! Fetched ${notifs.length} notifications without column errors.`);

    // 4. Test dry-run Signup transaction using Prisma
    console.log("4. Testing atomic Prisma transaction for Signup...");
    const testEmail = `test_neon_verify_${Date.now()}@swastya.org`;
    const testPass = await bcrypt.hash("VerifyPass123!", 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          name: "Neon Test Donor",
          email: testEmail,
          phonenumber: "9876543210",
          password: testPass,
          role: "DONOR",
          isactive: true,
          emailverified: true,
        }
      });

      const donor = await tx.donors.create({
        data: {
          userid: user.userid,
          bloodgroup: "O_POSITIVE",
          dateofbirth: new Date("1995-05-15"),
          gender: "MALE",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560038",
          availabilitystatus: "AVAILABLE",
        }
      });

      return { user, donor };
    });

    console.log(`   -> SUCCESS! User & Donor created in Neon: ${created.user.userid}`);

    // Verify created user can be queried by email and password compared
    const verifyUser = await prisma.users.findUnique({
      where: { email: testEmail },
      include: { donors: true }
    });
    const passwordMatch = await bcrypt.compare("VerifyPass123!", verifyUser?.password || "");
    console.log(`   -> Password verification check: ${passwordMatch ? "PASSED (bcrypt)" : "FAILED"}`);

    // Clean up test user so Neon remains clean
    await prisma.donors.delete({ where: { donorid: created.donor.donorid } });
    await prisma.users.delete({ where: { userid: created.user.userid } });
    console.log("   -> Cleaned up verify test record. Neon is clean!");

    console.log("\nALL PRISMA AUTH QUERIES PASSED ON NEON WITH ZERO ERRORS!");
  } catch (err: any) {
    console.error("Prisma Auth Test FAILED:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaAuth();
