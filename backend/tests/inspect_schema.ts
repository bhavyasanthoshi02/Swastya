import { prisma } from "../src/config/prisma";

async function main() {
    const cols: any = await prisma.$queryRawUnsafe(
        "SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'prescription' ORDER BY ordinal_position;"
    );
    console.log("prescription columns:\n", cols);
}

main().catch(console.error).finally(() => prisma.$disconnect());
