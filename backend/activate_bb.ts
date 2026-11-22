import { prisma } from "./src/config/prisma";

async function activateExistingBloodbanks() {
    try {
        const result = await prisma.bloodbanks.updateMany({
            where: { approvalstatus: "PENDING" },
            data: { approvalstatus: "APPROVED" }
        });
        console.log(`Updated ${result.count} blood bank(s) from PENDING to APPROVED.`);
        const allBb = await prisma.bloodbanks.findMany({
            select: { bloodbankname: true, licensenumber: true, approvalstatus: true }
        });
        console.log("Current Blood Banks in DB:", allBb);
        await prisma.$disconnect();
    } catch (err: any) {
        console.error("Error activating blood banks:", err.message);
        await prisma.$disconnect();
    }
}

activateExistingBloodbanks();
