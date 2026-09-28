import { Router } from "express";
import { prisma } from "../config/prisma";

const router = Router();

/*
 * GET ALL USERS
 * GET /users
 */
router.get("/", async (_req, res) => {
    try {
        const users = await prisma.users.findMany();

        res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching users:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch users",
        });
    }
});

/*
 * GET USER BY ID
 * GET /users/:id
 */
router.get("/:id", async (req, res) => {
    try {
        const user = await prisma.users.findUnique({
            where: {
                userid: req.params.id,
            },
        });

        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }

        res.status(200).json(user);
    } catch (error) {
        console.error("Error fetching user:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch user",
        });
    }
});
/*
 * CREATE USER
 * POST /users
 */
router.post("/", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const user = await prisma.users.create({
            data: {
                name,
                email,
                password,
                role,
            },
        });

        res.status(201).json(user);
    } catch (error) {
        console.error("Error creating user:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create user",
        });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const { name, email, phonenumber } = req.body;

        const user = await prisma.users.update({
            where: {
                userid: req.params.id,
            },
            data: {
                name,
                email,
                phonenumber,
            },
        });

        res.status(200).json(user);
    } catch (error) {
        console.error("Error updating user:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update user",
        });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        await prisma.users.delete({
            where: {
                userid: req.params.id,
            },
        });

        res.status(200).json({
            success: true,
            message: "User deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting user:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete user",
        });
    }
});
export default router;