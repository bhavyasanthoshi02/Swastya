import { Router } from "express";
import bcrypt from "bcrypt";

import { prisma } from "../config/prisma";
import { generateToken } from "../utils/jwt";

const router = Router();

router.get("/test", (_req, res) => {
    res.json({
        message: "Auth route working",
    });
});
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await prisma.users.findUnique({
            where: {
                email,
            },
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already exists",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.users.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
            },
        });

        const token = generateToken(user.userid, user.role);

        res.status(201).json({
            success: true,
            token,
            user,
        });
    } catch (error) {
        console.error("Register Error:", error);

        res.status(500).json({
            success: false,
            message: "Registration failed",
        });
    }
});
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.users.findUnique({
            where: {
                email,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid password",
            });
        }

        const token = generateToken(user.userid, user.role);

        res.status(200).json({
            success: true,
            token,
            user,
        });
    } catch (error) {
        console.error("Login Error:", error);

        res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
});
export default router;