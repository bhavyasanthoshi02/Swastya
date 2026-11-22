import { prisma } from "./src/config/prisma";

async function main() {
    try {
        const result: any = await prisma.$queryRawUnsafe("SELECT current_database(), current_user, version();");
        console.log("STATUS: SUCCESS");
        console.log("DATABASE:", result[0]?.current_database);
        console.log("USER:", result[0]?.current_user);
        console.log("VERSION:", result[0]?.version);
        await prisma.$disconnect();
        process.exit(0);
    } catch (err: any) {
        console.log("STATUS: FAILED");
        console.log("Error Name:", err.name);
        console.log("Error Message:", err.message);
        if (err.code) console.log("Error Code:", err.code);
        await prisma.$disconnect().catch(() => {});
        process.exit(1);
    }
}

main();
