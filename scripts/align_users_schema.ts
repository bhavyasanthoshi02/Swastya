import { prisma } from "../backend/src/config/prisma";

async function run() {
    console.log("Adding missing columns to dev-sms-feature users table...");
    await prisma.$executeRawUnsafe("ALTER TABLE users ADD COLUMN IF NOT EXISTS isclinicalreviewer BOOLEAN DEFAULT FALSE;");
    await prisma.$executeRawUnsafe("ALTER TABLE users ADD COLUMN IF NOT EXISTS medicalcouncilregno VARCHAR(100);");
    console.log("Successfully aligned users table with schema.prisma!");
}

run().catch(console.error);
