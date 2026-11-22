import { prisma } from "../src/config/prisma";

async function main() {
    try {
        console.log("Attempting minimal read-only query using Prisma runtime adapter...");
        const result: any = await prisma.$queryRawUnsafe("SELECT current_database(), current_user, version();");
        console.log("SUCCESS! Query result:");
        if (Array.isArray(result) && result[0]) {
            console.log("Current Database:", result[0].current_database);
            console.log("Current User:", result[0].current_user);
            console.log("Version:", result[0].version ? result[0].version.split(",")[0] : "unknown");
        }
        await prisma.$disconnect();
        process.exit(0);
    } catch (err: any) {
        console.error("Connectivity check failed:");
        console.error("Error Name:", err.name);
        console.error("Error Message:", err.message);
        if (err.code) console.error("Error Code:", err.code);
        await prisma.$disconnect();
        process.exit(1);
    }
}

main();
