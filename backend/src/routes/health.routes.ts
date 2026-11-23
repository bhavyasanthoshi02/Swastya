import { Router } from "express";
import { prisma } from "../config/prisma";

const router = Router();

router.get("/", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Swastya API is running",
    });
});

router.get("/db", async (_req, res) => {
    try {
        const select1: any[] = await prisma.$queryRawUnsafe("SELECT 1 AS ok");
        const dbInfo: any[] = await prisma.$queryRawUnsafe("SELECT current_database() as db, version() as ver");
        const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "unknown";

        // Query application tables on Neon
        const [usersCount, bloodbanksCount, hospitalsCount, bloodrequestsCount] = await Promise.all([
            prisma.users.count(),
            prisma.bloodbanks.count(),
            prisma.hospitals.count(),
            prisma.bloodrequests.count(),
        ]);

        res.status(200).json({
            success: true,
            status: "connected",
            queryOk: select1[0]?.ok === 1,
            database: dbInfo[0]?.db,
            version: dbInfo[0]?.ver?.split(" on ")[0],
            host: host,
            isNeon: host.includes("neon.tech"),
            targetMode: process.env.SWASTYA_DB_TARGET || "neon",
            counts: {
                users: usersCount,
                bloodbanks: bloodbanksCount,
                hospitals: hospitalsCount,
                bloodrequests: bloodrequestsCount,
            },
        });
    } catch (err: any) {
        res.status(500).json({
            success: false,
            status: "disconnected",
            error: err.message,
        });
    }
});

export default router;
