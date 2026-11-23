process.env.NODE_ENV = "development";

async function main() {
    const { prisma } = await import("../src/config/prisma");
    const users = await prisma.users.findMany({
        where: { isactive: true },
        select: { userid: true, email: true, name: true, role: true, phonenumber: true },
        take: 30,
    });
    console.log("ACTIVE USERS IN DEV DATABASE:");
    console.table(users);
}

main().catch(console.error);
