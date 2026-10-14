import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { checkRequesterOwnership } from "../middleware/ownership.middleware";
import { notification_type } from "../generated/prisma/enums";

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
router.get("/me", authenticate, authorize("REQUESTER", "PATIENT", "ADMIN"), async (req: Request, res: Response) => {
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
router.get("/me/dashboard", authenticate, authorize("REQUESTER", "PATIENT", "ADMIN"), async (req: Request, res: Response) => {
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
router.get("/me/bloodrequests", authenticate, authorize("REQUESTER", "PATIENT", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requester = await resolveOrCreateRequester(user);

        const bloodRequests = await prisma.bloodrequests.findMany({
            where: {
                requesterid: requester.requesterid,
            },
            include: {
                hospitals: true,
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
 * GET AVAILABLE DONORS FOR CURRENT REQUESTER
 * GET /requesters/me/available-donors
 * Query params: requestId (optional)
 */
router.get("/me/available-donors", authenticate, authorize("REQUESTER", "PATIENT", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requester = await resolveOrCreateRequester(user);
        const filterRequestId = req.query.requestId as string | undefined;

        // 1. Find all blood requests belonging to this requester
        const requestWhere: any = {
            OR: [
                { requesterid: requester.requesterid },
                { createdbyuserid: user.userid },
            ],
        };

        if (filterRequestId) {
            requestWhere.requestid = filterRequestId;
        }

        const requesterRequests = await prisma.bloodrequests.findMany({
            where: requestWhere,
            include: {
                hospitals: true,
            },
            orderBy: {
                createdat: "desc",
            },
        });

        const requestIds = requesterRequests.map((r) => r.requestid);
        const requestMap = new Map(requesterRequests.map((r) => [r.requestid, r]));

        if (requestIds.length === 0) {
            return res.status(200).json({
                success: true,
                count: 0,
                availableDonors: [],
            });
        }

        // 2. Fetch volunteer confirmations
        const volunteerNotifications = await prisma.notification.findMany({
            where: {
                requestid: { in: requestIds },
                type: notification_type.MATCH,
                title: "Volunteer Response Confirmed",
            },
            include: {
                users: {
                    select: {
                        userid: true,
                        name: true,
                        phonenumber: true,
                        email: true,
                        donors: {
                            select: {
                                donorid: true,
                                bloodgroup: true,
                                city: true,
                                state: true,
                                weight: true,
                                gender: true,
                                lastdonationdate: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                sentat: "desc",
            },
        });

        // 3. Map to rich donor profiles with clinical screening status
        const availableDonors = volunteerNotifications.map((n) => {
            let meta: any = {};
            const metaMatch = n.message.match(/<!--META:([\s\S]*?)-->/);
            if (metaMatch && metaMatch[1]) {
                try {
                    meta = JSON.parse(metaMatch[1]);
                } catch {
                    // Fallback
                }
            }

            const linkedReq = n.requestid ? requestMap.get(n.requestid) : null;

            return {
                notificationId: n.notificationid,
                donorId: meta.donorId || n.users?.donors?.donorid || n.users?.userid,
                donorUserId: n.users?.userid,
                donorName: meta.donorName || n.users?.name || "Voluntary Hero Donor",
                donorBloodGroup: meta.donorBloodGroup || n.users?.donors?.bloodgroup || "COMPATIBLE",
                donorCity: meta.donorCity || n.users?.donors?.city || "Registered Area",
                donorState: meta.donorState || n.users?.donors?.state || "",
                donorPhone: meta.donorPhone || n.users?.phonenumber || "",
                donorEmail: meta.donorEmail || n.users?.email || "",
                donorGender: n.users?.donors?.gender || "OTHER",
                donorWeight: n.users?.donors?.weight ? Number(n.users?.donors?.weight) : null,
                lastDonationDate: n.users?.donors?.lastdonationdate || null,
                respondedAt: n.sentat,
                status: meta.transitStatus || "DONOR_FOUND",
                transitStatus: meta.transitStatus || "DONOR_FOUND",
                startedAt: meta.startedAt || null,
                reachedAt: meta.reachedAt || null,
                completedAt: meta.completedAt || null,
                estimatedArrival: meta.estimatedArrival || "Within 1-2 hours",
                notes: meta.notes || "",
                screening: meta.screening || {
                    drinksAlcohol: false,
                    alcoholInPast24Hours: false,
                    feelingHealthy: true,
                    recentAntibioticsOrMedication: false,
                    recentTattooOrSurgery: false,
                    donatedInLast90Days: false,
                    chronicIllness: false,
                    alcoholClearance: "Passed (Screened & Cleared)",
                    generalHealth: "Good / Symptom Free",
                    cooldownPassed: true,
                    eligibilityStatus: "ELIGIBLE",
                },
                isEligible: meta.isEligible !== undefined ? meta.isEligible : true,
                requestId: n.requestid,
                patientName: linkedReq?.patientname || "Emergency Patient",
                requiredBloodGroup: linkedReq?.bloodgroup || "UNKNOWN",
                unitsRequired: linkedReq?.unitsrequired || 1,
                bloodComponent: linkedReq?.bloodcomponent || "WHOLE_BLOOD",
                urgencyLevel: linkedReq?.urgencylevel || "HIGH",
                hospitalName: linkedReq?.hospitals?.hospitalname || "Care Facility",
                hospitalAddress: linkedReq?.hospitals?.address || "",
                hospitalCity: linkedReq?.hospitals?.city || "",
                requestStatus: linkedReq?.status || "DONOR_MATCHING",
            };
        });

        return res.status(200).json({
            success: true,
            count: availableDonors.length,
            availableDonors,
        });
    } catch (error) {
        console.error("Error fetching current requester available donors:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch available donors",
        });
    }
});

/*
 * UPDATE CURRENT REQUESTER PROFILE
 * PUT /requesters/me
 */
router.put("/me", authenticate, authorize("REQUESTER", "PATIENT", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requester = await resolveOrCreateRequester(user);

        // 1. Validate fields if present
        if (req.body.name !== undefined) {
            const name = String(req.body.name).trim();
            if (name.length < 2 || name.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Full name must be between 2 and 100 characters",
                });
            }
        }

        if (req.body.phonenumber !== undefined && req.body.phonenumber !== null && String(req.body.phonenumber).trim() !== "") {
            const phone = String(req.body.phonenumber).trim();
            const phoneRegex = /^[0-9+\-\s()]{7,15}$/;
            if (!phoneRegex.test(phone)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid phone number format. Please provide a valid 10-digit mobile number.",
                });
            }
        }

        if (req.body.pincode !== undefined) {
            const pin = String(req.body.pincode).trim();
            if (pin && !/^\d{6}$/.test(pin)) {
                return res.status(400).json({
                    success: false,
                    message: "Postal PIN code must be a 6-digit number",
                });
            }
        }

        if (req.body.latitude !== undefined && req.body.latitude !== null) {
            const lat = parseFloat(req.body.latitude);
            if (isNaN(lat) || lat < -90 || lat > 90) {
                return res.status(400).json({
                    success: false,
                    message: "Latitude must be a valid number between -90 and 90",
                });
            }
        }

        if (req.body.longitude !== undefined && req.body.longitude !== null) {
            const lng = parseFloat(req.body.longitude);
            if (isNaN(lng) || lng < -180 || lng > 180) {
                return res.status(400).json({
                    success: false,
                    message: "Longitude must be a valid number between -180 and 180",
                });
            }
        }

        // 2. Update user name & phonenumber in users table if provided
        const userUpdateData: any = {};
        if (req.body.name !== undefined) {
            userUpdateData.name = String(req.body.name).trim();
        }
        if (req.body.phonenumber !== undefined) {
            userUpdateData.phonenumber = req.body.phonenumber ? String(req.body.phonenumber).trim() : null;
        }

        if (Object.keys(userUpdateData).length > 0) {
            userUpdateData.updatedat = new Date();
            await prisma.users.update({
                where: { userid: user.userid },
                data: userUpdateData,
            });
        }

        // 3. Update requester location & address fields
        const requesterUpdateData: any = {};
        if (req.body.address !== undefined) requesterUpdateData.address = String(req.body.address).trim();
        if (req.body.city !== undefined) requesterUpdateData.city = String(req.body.city).trim();
        if (req.body.state !== undefined) requesterUpdateData.state = String(req.body.state).trim();
        if (req.body.pincode !== undefined) requesterUpdateData.pincode = String(req.body.pincode).trim();
        if (req.body.latitude !== undefined) requesterUpdateData.latitude = req.body.latitude !== null ? parseFloat(req.body.latitude) : null;
        if (req.body.longitude !== undefined) requesterUpdateData.longitude = req.body.longitude !== null ? parseFloat(req.body.longitude) : null;
        requesterUpdateData.updatedat = new Date();

        const updated = await prisma.requesters.update({
            where: {
                requesterid: requester.requesterid,
            },
            data: requesterUpdateData,
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
    authorize("REQUESTER", "PATIENT", "ADMIN"),
    checkRequesterOwnership,
    async (req, res) => {
        try {
            const requesterId = req.params.requesterId as string;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!requesterId || !uuidRegex.test(requesterId)) {
                return res.status(404).json({
                    success: false,
                    message: "Requester not found",
                });
            }

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
    authorize("REQUESTER", "PATIENT", "ADMIN"),
    checkRequesterOwnership,
    async (req, res) => {
        try {
            const requesterId = req.params.requesterId as string;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!requesterId || !uuidRegex.test(requesterId)) {
                return res.status(404).json({
                    success: false,
                    message: "Requester not found",
                });
            }

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

router.get("/:id", authenticate, authorize("REQUESTER", "PATIENT", "ADMIN"), checkRequesterOwnership, async (req, res) => {
    try {
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!targetId || !uuidRegex.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "Requester not found",
            });
        }

        const requester = await prisma.requesters.findUnique({
            where: {
                requesterid: targetId,
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