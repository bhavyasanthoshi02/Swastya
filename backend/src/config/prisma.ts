import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV === "test") {
    dotenv.config({ path: path.resolve(__dirname, "../../.env.test"), override: true });
} else {
    dotenv.config();
}

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });
