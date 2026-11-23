process.env.SWASTYA_DB_TARGET = "test";
import { prisma } from "../src/config/prisma";

async function main() {
  console.log("Cleaning up fake camp data from swastya_test...");

  // 1. Delete notifications linked to camps
  const notifs = await prisma.notification.deleteMany({
    where: {
      OR: [
        { campid: { not: null } },
        { registrationid: { not: null } }
      ]
    }
  });
  console.log(`Deleted ${notifs.count} camp notifications.`);

  // 2. Delete camp audit history
  const audits = await prisma.campaudithistory.deleteMany({});
  console.log(`Deleted ${audits.count} camp audit records.`);

  // 3. Delete camp status history
  const statusHist = await prisma.campstatushistory.deleteMany({});
  console.log(`Deleted ${statusHist.count} camp status history records.`);

  // 4. Delete camp registrations
  const regs = await prisma.campregistrations.deleteMany({});
  console.log(`Deleted ${regs.count} camp registrations.`);

  // 5. Delete donation camps
  const camps = await prisma.donationcamps.deleteMany({});
  console.log(`Deleted ${camps.count} donation camps.`);

  console.log("Fake camp data successfully removed.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
