import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { user_role } from "../generated/prisma/enums";

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SALT_ROUNDS = 10;

// Standard safe fields selection for user queries - strictly excludes password
const SAFE_USER_SELECT = {
    userid: true,
    name: true,
    email: true,
    phonenumber: true,
    role: true,
    isactive: true,
    emailverified: true,
    createdat: true,
    updatedat: true,
} as const;

/**
 * GET CURRENT AUTHENTICATED USER PROFILE
 * GET /users/me
 */
router.get("/me", authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as any).user;
        if (!authUser?.userid) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const user = await prisma.users.findUnique({
            where: { userid: authUser.userid },
            select: {
                ...SAFE_USER_SELECT,
                donors: true,
                requesters: true,
                hospitals: true,
                bloodbanks: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error("Error fetching authenticated user profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch user profile",
        });
    }
});

/**
 * GET ALL USERS (ADMIN ONLY)
 * GET /users
 */
router.get("/", authenticate, authorize("ADMIN"), async (_req: Request, res: Response) => {
    try {
        const users = await prisma.users.findMany({
            select: SAFE_USER_SELECT,
            orderBy: { createdat: "desc" },
        });

        return res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch users",
        });
    }
});

/**
 * GET USER BY ID
 * GET /users/:id
 * Only the owner or an ADMIN can view specific user details. Never exposes password hash.
 */
router.get("/:id", authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Ownership & role check: only owner or ADMIN
        if (authUser.userid !== targetId && authUser.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Access denied: cannot view another user's profile",
            });
        }

        const user = await prisma.users.findUnique({
            where: { userid: targetId },
            select: {
                ...SAFE_USER_SELECT,
                donors: true,
                requesters: true,
                hospitals: true,
                bloodbanks: true,
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json(user);
    } catch (error) {
        console.error("Error fetching user:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch user",
        });
    }
});

/**
 * CREATE USER (ADMINISTRATIVE ONLY)
 * POST /users
 * Dedicated to admin user provisioning. Passwords must be hashed and role validated.
 */
router.post("/", authenticate, authorize("ADMIN"), async (req: Request, res: Response) => {
    try {
        const { name, email, password, role, phonenumber } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Name is required",
            });
        }

        if (!email || !String(email).trim()) {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(email).trim())) {
            return res.status(400).json({
                success: false,
                message: "Valid email address is required",
            });
        }

        if (!password || String(password).length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long",
            });
        }

        const validRoles = Object.values(user_role);
        if (!role || !validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `Valid user role is required. Allowed roles: ${validRoles.join(", ")}`,
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existing = await prisma.users.findUnique({
            where: { email: normalizedEmail },
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists",
            });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const newUser = await prisma.users.create({
            data: {
                name: String(name).trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role,
                phonenumber: phonenumber ? String(phonenumber).trim() : null,
                isactive: true,
                emailverified: true,
            },
            select: SAFE_USER_SELECT,
        });

        return res.status(201).json(newUser);
    } catch (error) {
        console.error("Error creating user:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create user",
        });
    }
});

/**
 * UPDATE USER
 * PUT /users/:id
 * Only the account owner or an ADMIN may update. Non-admins cannot update role, isactive, emailverified.
 */
router.put("/:id", authenticate, async (req: Request, res: Response) => {
    try {
        const authUser = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const isAdmin = authUser.role === "ADMIN";
        const isOwner = authUser.userid === targetId;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: cannot modify another user's account",
            });
        }

        const existingUser = await prisma.users.findUnique({
            where: { userid: targetId },
        });

        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Prevent privilege escalation: Non-admin users cannot alter role, isactive, emailverified
        if (!isAdmin) {
            if (req.body.role !== undefined && req.body.role !== existingUser.role) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: cannot modify user role",
                });
            }
            if (req.body.isactive !== undefined && req.body.isactive !== existingUser.isactive) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: cannot modify user activation status",
                });
            }
            if (req.body.emailverified !== undefined && req.body.emailverified !== existingUser.emailverified) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: cannot modify email verification status",
                });
            }
        }

        const updateData: any = {};

        if (req.body.name !== undefined) {
            const trimmedName = String(req.body.name).trim();
            if (!trimmedName) {
                return res.status(400).json({
                    success: false,
                    message: "Name cannot be empty",
                });
            }
            updateData.name = trimmedName;
        }

        if (req.body.phonenumber !== undefined) {
            updateData.phonenumber = req.body.phonenumber ? String(req.body.phonenumber).trim() : null;
        }

        if (req.body.email !== undefined) {
            const normalizedEmail = String(req.body.email).trim().toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(normalizedEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid email address is required",
                });
            }

            if (normalizedEmail !== existingUser.email) {
                const duplicate = await prisma.users.findUnique({
                    where: { email: normalizedEmail },
                });
                if (duplicate) {
                    return res.status(409).json({
                        success: false,
                        message: "Email is already taken by another account",
                    });
                }
                updateData.email = normalizedEmail;
            }
        }

        // Privileged fields (admin only)
        if (isAdmin) {
            if (req.body.role !== undefined) {
                const validRoles = Object.values(user_role);
                if (!validRoles.includes(req.body.role)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid role. Allowed roles: ${validRoles.join(", ")}`,
                    });
                }
                updateData.role = req.body.role;
            }
            if (req.body.isactive !== undefined) {
                updateData.isactive = Boolean(req.body.isactive);
            }
            if (req.body.emailverified !== undefined) {
                updateData.emailverified = Boolean(req.body.emailverified);
            }
        }

        const updatedUser = await prisma.users.update({
            where: { userid: targetId },
            data: updateData,
            select: SAFE_USER_SELECT,
        });

        return res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Error updating user:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update user",
        });
    }
});

/**
 * DELETE USER (ADMINISTRATIVE ONLY)
 * DELETE /users/:id
 * Only administrators can delete or deactivate user accounts.
 * If user has clinical history records, performs safe deactivation to preserve audit trails.
 */
router.delete("/:id", authenticate, authorize("ADMIN"), async (req: Request, res: Response) => {
    try {
        const authUser = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Prevent administrator from deleting themselves
        if (authUser.userid === targetId) {
            return res.status(400).json({
                success: false,
                message: "Administrators cannot delete their own active account",
            });
        }

        const targetUser = await prisma.users.findUnique({
            where: { userid: targetId },
        });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Check for clinical relationships that must be preserved
        const [requestCount, historyCount] = await Promise.all([
            prisma.bloodrequests.count({ where: { createdbyuserid: targetId } }),
            prisma.requeststatushistory.count({ where: { changedbyuserid: targetId } }),
        ]);

        if (requestCount > 0 || historyCount > 0) {
            // Relational and clinical data retention: deactivate account rather than destructive hard-delete
            await prisma.users.update({
                where: { userid: targetId },
                data: { isactive: false },
            });

            return res.status(200).json({
                success: true,
                message: "User account deactivated to preserve clinical audit trails and requisition history",
                deactivated: true,
            });
        }

        // Safe hard delete for accounts without clinical audit ties
        await prisma.users.delete({
            where: { userid: targetId },
        });

        return res.status(200).json({
            success: true,
            message: "User deleted successfully",
            deleted: true,
        });
    } catch (error) {
        console.error("Error deleting user:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete user",
        });
    }
});

export default router;