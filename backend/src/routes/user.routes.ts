import { Router } from "express";
import { prisma } from "../config/prisma";

const router = Router();

// Get all users
router.get("/", async (_req, res) => {
    try {
        const users = await prisma.users.findMany();

        res.status(200).json(users);
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error,
        });
    }
});

export default router;