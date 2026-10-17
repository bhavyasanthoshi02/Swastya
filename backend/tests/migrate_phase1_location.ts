import { prisma } from "../src/config/prisma";

async function migrate() {
    console.log("Applying Phase 1 Location schema updates...");
    await prisma.$queryRawUnsafe(`
        ALTER TABLE bloodrequests
        ADD COLUMN IF NOT EXISTS latitude DECIMAL(9, 6),
        ADD COLUMN IF NOT EXISTS longitude DECIMAL(9, 6);
    `);
    console.log("-> bloodrequests.latitude and bloodrequests.longitude columns verified/added.");
}

migrate()
    .catch((err) => {
        console.error("Migration error:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
