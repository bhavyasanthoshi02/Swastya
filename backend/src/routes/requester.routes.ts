import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { checkRequesterOwnership } from "../middleware/ownership.middleware";

const router = Router();

// Helper: resolve or safely auto-provision requester profile for authenticated user
async function resolveOrCreateRequester(user: { userid: string; name?: string; phonenumber?: string | null }) {
    let requester = await prisma.requesters.findUnique({
        where: { userid: user.userid },
        include: {
            users: {
                select: {
                    userid: true,
                    name: true,
                    email: true,
                    phonenumber: true,
                    role: true,
                    isactive: true,
                },
            },
        },
    });

    if (!requester) {
        // Safe fallback to prevent broken sessions for legacy accounts
        requester = await prisma.requesters.create({
            data: {
                userid: user.userid,
                address: "Not Provided",
                city: "Not Provided",
                state: "Not Provided",
                pincode: "000000",
            },
            include: {
                users: {
                    select: {
                        userid: true,
                        name: true,
                        email: true,
                        phonenumber: true,
                        role: true,
                        isactive: true,
                    },
                },
            },
        });
    }

    return requester;
}

/* =========================================================================
   1. AUTHENTICATED CURRENT-REQUESTER (/requesters/me/...) ENDPOINTS
   Must precede parameterized routes (/:id, /:requesterId) to prevent path collision
   ========================================================================= */

/*
 * GET CURRENT REQUESTER PROFILE
 * GET /requesters/me
 */
router.get("/me", authenticate, authorize("REQUESTER", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requester = await resolveOrCreateRequester(user);

        return res.status(200).json({
            success: true,
            requester,
        });
    } catch (error) {
        console.error("Error fetching current requester profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch requester profile",
        });
    }
});

/*
 * GET CURRENT REQUESTER DASHBOARD OVERVIEW
 * GET /requesters/me/dashboard
 */
router.get("/me/dashboard", authenticate, authorize("REQUESTER", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requester = await resolveOrCreateRequester(user);

        const [totalRequests, activeRequests, completedRequests, recentRequests] = await Promise.all([
            prisma.bloodrequests.count({
                where: {
                    requesterid: requester.requesterid,
                },
            }),
            prisma.bloodrequests.count({
                where: {
                    requesterid: requester.requesterid,
                    status: {
                        notIn: ["FULFILLED", "CANCELLED", "EXPIRED"],
                    },
                },
            }),
            prisma.bloodrequests.count({
                where: {
                    requesterid: requester.requesterid,
                    status: "FULFILLED",
                },
            }),
            prisma.bloodrequests.findMany({
                where: {
                    requesterid: requester.requesterid,
                },
                orderBy: {
                    createdat: "desc",
                },
                take: 10,
            }),
        ]);

        return res.status(200).json({
            success: true,
            requester,
            totalRequests,
            activeRequests,
            completedRequests,
            recentRequests,
        });
    } catch (error) {
        console.error("Error loading current requester dashboard:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load requester dashboard",
        });
    }
});

/*
 * GET CURRENT REQUESTER BLOOD REQUESTS
 * GET /requesters/me/bloodrequests
 */
router.get("/me/bloodrequests", authenticate, authorize("REQUESTER", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requester = await resolveOrCreateRequester(user);

        const bloodRequests = await prisma.bloodrequests.findMany({
            where: {
                requesterid: requester.requesterid,
            },
            orderBy: {
                createdat: "desc",
            },
        });

        return res.status(200).json({
            success: true,
            bloodRequests,
        });
    } catch (error) {
        console.error("Error fetching current requester blood requests:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch blood requests",
        });
    }
});

/*
 * UPDATE CURRENT REQUESTER PROFILE
 * PUT /requesters/me
 */
router.put("/me", authenticate, authorize("REQUESTER", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requester = await resolveOrCreateRequester(user);

        const updated = await prisma.requesters.update({
            where: {
                requesterid: requester.requesterid,
            },
            data: {
                address: req.body.address !== undefined ? req.body.address : requester.address,
                city: req.body.city !== undefined ? req.body.city : requester.city,
                state: req.body.state !== undefined ? req.body.state : requester.state,
                pincode: req.body.pincode !== undefined ? req.body.pincode : requester.pincode,
                latitude: req.body.latitude !== undefined ? req.body.latitude : requester.latitude,
                longitude: req.body.longitude !== undefined ? req.body.longitude : requester.longitude,
            },
            include: {
                users: {
                    select: {
                        userid: true,
                        name: true,
                        email: true,
                        phonenumber: true,
                        role: true,
                    },
                },
            },
        });

        return res.status(200).json({
            success: true,
            message: "Requester profile updated successfully",
            requester: updated,
        });
    } catch (error) {
        console.error("Error updating current requester profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update requester profile",
        });
    }
});

/* =========================================================================
   2. PARAMETRIC & GENERAL REQUESTER ENDPOINTS
   ========================================================================= */

router.get("/", async (_req, res) => {
    try {
        const requesters = await prisma.requesters.findMany({
            include: {
                users: true,
            },
        });

        res.status(200).json(requesters);
    } catch (error) {
        console.error("Error fetching requesters:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch requesters",
        });
    }
});

router.get(
    "/:requesterId/dashboard",
    authenticate,
    authorize("REQUESTER", "ADMIN"),
    checkRequesterOwnership,
    async (req, res) => {
        try {
            const requesterId = req.params.requesterId as string;

            const totalRequests = await prisma.bloodrequests.count({
                where: {
                    requesterid: requesterId,
                },
            });

            const activeRequests = await prisma.bloodrequests.count({
                where: {
                    requesterid: requesterId,
                    status: {
                        notIn: ["FULFILLED", "CANCELLED", "EXPIRED"],
                    },
                },
            });

            const completedRequests = await prisma.bloodrequests.count({
                where: {
                    requesterid: requesterId,
                    status: "FULFILLED",
                },
            });

            const recentRequests = await prisma.bloodrequests.findMany({
                where: {
                    requesterid: requesterId,
                },
                orderBy: {
                    createdat: "desc",
                },
                take: 10,
            });

            res.status(200).json({
                success: true,
                totalRequests,
                activeRequests,
                completedRequests,
                recentRequests,
            });
        } catch (error) {
            console.error("Error loading requester dashboard:", error);

            res.status(500).json({
                success: false,
                message: "Failed to load dashboard",
            });
        }
    }
);

router.get(
    "/:requesterId/bloodrequests",
    authenticate,
    authorize("REQUESTER", "ADMIN"),
    checkRequesterOwnership,
    async (req, res) => {
        try {
            const requesterId = req.params.requesterId as string;

            const bloodRequests = await prisma.bloodrequests.findMany({
                where: {
                    requesterid: requesterId,
                },
                orderBy: {
                    createdat: "desc",
                },
            });

            res.status(200).json(bloodRequests);
        } catch (error) {
            console.error("Error fetching requester blood requests:", error);

            res.status(500).json({
                success: false,
                message: "Failed to fetch blood requests",
            });
        }
    }
);

router.get("/:id", async (req, res) => {
    try {
        const requester = await prisma.requesters.findUnique({
            where: {
                requesterid: req.params.id,
            },
            include: {
                users: true,
            },
        });

        if (!requester) {
            res.status(404).json({
                success: false,
                message: "Requester not found",
            });
            return;
        }

        res.status(200).json(requester);
    } catch (error) {
        console.error("Error fetching requester:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch requester",
        });
    }
});

router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
    try {
        const requester = await prisma.requesters.create({
            data: {
                userid: req.body.userid,
                address: req.body.address,
                city: req.body.city,
                state: req.body.state,
                pincode: req.body.pincode,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
            },
        });

        res.status(201).json(requester);
    } catch (error) {
        console.error("Error creating requester:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create requester",
        });
    }
});

router.put(
    "/:id",
    authenticate,
    authorize("REQUESTER", "ADMIN"),
    checkRequesterOwnership,
    async (req, res) => {
        try {
            const requesterId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
            const requester = await prisma.requesters.update({
                where: {
                    requesterid: requesterId,
                },
                data: {
                    address: req.body.address,
                    city: req.body.city,
                    state: req.body.state,
                    pincode: req.body.pincode,
                    latitude: req.body.latitude,
                    longitude: req.body.longitude,
                },
            });

            res.status(200).json(requester);
        } catch (error) {
            console.error("Error updating requester:", error);

            res.status(500).json({
                success: false,
                message: "Failed to update requester",
            });
        }
    }
);

router.delete(
    "/:id",
    authenticate,
    authorize("ADMIN"),
    async (req, res) => {
        try {
            const requesterId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
            await prisma.requesters.delete({
                where: {
                    requesterid: requesterId,
                },
            });

            res.status(200).json({
                success: true,
                message: "Requester deleted successfully",
            });
        } catch (error) {
            console.error("Error deleting requester:", error);

            res.status(500).json({
                success: false,
                message: "Failed to delete requester",
            });
        }
    }
);

export default router;