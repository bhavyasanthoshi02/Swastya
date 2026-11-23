import { prisma } from "../src/config/prisma";

async function run() {
    const cols = await prisma.$queryRawUnsafe("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;");
    console.log(cols);
}

run().catch(console.error);
