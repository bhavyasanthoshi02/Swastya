import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { checkDonorOwnership } from "../middleware/ownership.middleware";
import { blood_group, gender_type, availability_status, request_status } from "../generated/prisma/enums";

const router = Router();

// Normalization Helpers
const normalizeBloodGroup = (bg?: string): blood_group | null => {
    if (!bg) return null;
    const clean = bg.trim().toUpperCase();
    const map: Record<string, blood_group> = {
        "A+": blood_group.A_POSITIVE,
        "A-": blood_group.A_NEGATIVE,
        "B+": blood_group.B_POSITIVE,
        "B-": blood_group.B_NEGATIVE,
        "AB+": blood_group.AB_POSITIVE,
        "AB-": blood_group.AB_NEGATIVE,
        "O+": blood_group.O_POSITIVE,
        "O-": blood_group.O_NEGATIVE,
        "A_POSITIVE": blood_group.A_POSITIVE,
        "A_NEGATIVE": blood_group.A_NEGATIVE,
        "B_POSITIVE": blood_group.B_POSITIVE,
        "B_NEGATIVE": blood_group.B_NEGATIVE,
        "AB_POSITIVE": blood_group.AB_POSITIVE,
        "AB_NEGATIVE": blood_group.AB_NEGATIVE,
        "O_POSITIVE": blood_group.O_POSITIVE,
        "O_NEGATIVE": blood_group.O_NEGATIVE,
    };
    return map[clean] || null;
};

const normalizeGender = (g?: string): gender_type | null => {
    if (!g) return null;
    const clean = g.trim().toUpperCase();
    const map: Record<string, gender_type> = {
        "MALE": gender_type.MALE,
        "FEMALE": gender_type.FEMALE,
        "OTHER": gender_type.OTHER,
    };
    return map[clean] || null;
};

const normalizeAvailability = (status?: string): availability_status | null => {
    if (!status) return null;
    const clean = status.trim().toUpperCase();
    const map: Record<string, availability_status> = {
        "AVAILABLE": availability_status.AVAILABLE,
        "TEMPORARILY_UNAVAILABLE": availability_status.TEMPORARILY_UNAVAILABLE,
        "PERMANENTLY_UNAVAILABLE": availability_status.PERMANENTLY_UNAVAILABLE,
        "PAUSED": availability_status.TEMPORARILY_UNAVAILABLE,
    };
    return map[clean] || null;
};

// Medically verified transfusion compatibility mapping
const RECIPIENT_COMPATIBILITY_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.O_NEGATIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.O_POSITIVE]: [
        blood_group.O_POSITIVE,
        blood_group.A_POSITIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_NEGATIVE]: [
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_POSITIVE]: [
        blood_group.A_POSITIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.B_NEGATIVE]: [
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.B_POSITIVE]: [
        blood_group.B_POSITIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.AB_NEGATIVE]: [
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.AB_POSITIVE]: [
        blood_group.AB_POSITIVE,
    ],
};

// Eligibility evaluation using standard 90-day cooldown and DB flag
function computeEligibility(donor: { iseligible: boolean | null; lastdonationdate: Date | null }) {
    const isDbEligible = donor.iseligible ?? true;
    if (!isDbEligible) {
        return {
            isEligible: false,
            status: "Review Required",
            lastDonationDate: donor.lastdonationdate,
            daysSinceLastDonation: null,
            cooldownDaysRemaining: 0,
            ruleApplied: "Database isEligible flag is false (clinical review required).",
        };
    }

    if (!donor.lastdonationdate) {
        return {
            isEligible: true,
            status: "Eligible",
            lastDonationDate: null,
            daysSinceLastDonation: null,
            cooldownDaysRemaining: 0,
            ruleApplied: "No prior donation recorded; donor is clinically eligible.",
        };
    }

    const lastDate = new Date(donor.lastdonationdate);
    const diffMs = Date.now() - lastDate.getTime();
    const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const WHOLE_BLOOD_COOLDOWN_DAYS = 90;

    if (daysSince < WHOLE_BLOOD_COOLDOWN_DAYS) {
        return {
            isEligible: false,
            status: "Cooldown",
            lastDonationDate: donor.lastdonationdate,
            daysSinceLastDonation: daysSince,
            cooldownDaysRemaining: WHOLE_BLOOD_COOLDOWN_DAYS - daysSince,
            ruleApplied: `Standard 90-day whole blood cooldown interval (${daysSince} of 90 days elapsed).`,
        };
    }

    return {
        isEligible: true,
        status: "Eligible",
        lastDonationDate: donor.lastdonationdate,
        daysSinceLastDonation: daysSince,
        cooldownDaysRemaining: 0,
        ruleApplied: `90-day cooldown interval satisfied (${daysSince} days since last donation).`,
    };
}

// Active request statuses eligible for donor matching
const ACTIVE_REQUEST_STATUSES = [
    request_status.CREATED,
    request_status.VERIFIED,
    request_status.HOSPITAL_REVIEW,
    request_status.BLOOD_BANK_CHECK,
    request_status.DONOR_MATCHING,
];

// Helper: resolve donor from req.user
async function resolveCurrentDonor(userid: string) {
    return prisma.donors.findUnique({
        where: { userid },
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

/* =========================================================================
   1. AUTHENTICATED CURRENT-DONOR (/donors/me/...) ENDPOINTS
   ========================================================================= */

/*
 * GET CURRENT DONOR PROFILE
 * GET /donors/me
 */
router.get("/me", authenticate, authorize("DONOR", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const donor = await resolveCurrentDonor(user.userid);

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account.",
            });
        }

        const eligibility = computeEligibility(donor);

        return res.status(200).json({
            success: true,
            donor,
            eligibility,
        });
    } catch (error) {
        console.error("Error fetching current donor:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch donor profile",
        });
    }
});

/*
 * UPDATE CURRENT DONOR PROFILE
 * PUT /donors/me
 */
router.put("/me", authenticate, authorize("DONOR", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const donor = await resolveCurrentDonor(user.userid);

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account.",
            });
        }

        const updateData: any = {};

        if (req.body.bloodgroup || req.body.bloodGroup) {
            const bg = normalizeBloodGroup(req.body.bloodgroup || req.body.bloodGroup);
            if (!bg) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid blood group",
                });
            }
            updateData.bloodgroup = bg;
        }

        if (req.body.weight !== undefined) {
            const w = parseFloat(req.body.weight);
            if (isNaN(w) || w <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid weight value",
                });
            }
            updateData.weight = w;
        }

        if (req.body.city !== undefined) updateData.city = req.body.city.trim();
        if (req.body.state !== undefined) updateData.state = req.body.state.trim();
        if (req.body.pincode !== undefined) updateData.pincode = req.body.pincode.trim();
        if (req.body.address !== undefined) updateData.address = req.body.address.trim();

        if (req.body.availabilitystatus || req.body.availability) {
            const status = normalizeAvailability(req.body.availabilitystatus || req.body.availability);
            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid availability status",
                });
            }
            updateData.availabilitystatus = status;
        }

        updateData.updatedat = new Date();

        const updated = await prisma.donors.update({
            where: { donorid: donor.donorid },
            data: updateData,
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
            message: "Donor profile updated successfully",
            donor: updated,
            eligibility: computeEligibility(updated),
        });
    } catch (error) {
        console.error("Error updating current donor:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update donor profile",
        });
    }
});

/*
 * TOGGLE / UPDATE DONOR AVAILABILITY
 * PATCH /donors/me/availability
 */
router.patch("/me/availability", authenticate, authorize("DONOR", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const donor = await resolveCurrentDonor(user.userid);

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account.",
            });
        }

        const requestedStatus = req.body.availabilitystatus || req.body.availability;
        let newStatus: availability_status;

        if (requestedStatus) {
            const parsed = normalizeAvailability(requestedStatus);
            if (!parsed) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid availability status. Valid values: AVAILABLE, TEMPORARILY_UNAVAILABLE, PERMANENTLY_UNAVAILABLE",
                });
            }
            newStatus = parsed;
        } else {
            // Toggle between AVAILABLE and TEMPORARILY_UNAVAILABLE
            newStatus = donor.availabilitystatus === availability_status.AVAILABLE
                ? availability_status.TEMPORARILY_UNAVAILABLE
                : availability_status.AVAILABLE;
        }

        const updated = await prisma.donors.update({
            where: { donorid: donor.donorid },
            data: {
                availabilitystatus: newStatus,
                updatedat: new Date(),
            },
        });

        return res.status(200).json({
            success: true,
            message: `Availability updated to ${newStatus}`,
            availabilitystatus: updated.availabilitystatus,
            donor: updated,
        });
    } catch (error) {
        console.error("Error updating availability:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update availability status",
        });
    }
});

/*
 * AUTHENTICATED DONOR DASHBOARD OVERVIEW
 * GET /donors/me/dashboard
 */
router.get("/me/dashboard", authenticate, authorize("DONOR", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const donor = await resolveCurrentDonor(user.userid);

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account.",
            });
        }

        // 1. Eligibility computation
        const eligibility = computeEligibility(donor);

        // 2. Transfusion-compatible blood groups for this donor
        const compatibleGroups = RECIPIENT_COMPATIBILITY_MAP[donor.bloodgroup] || [donor.bloodgroup];

        // 3. Parallel queries for dashboard components
        const [
            donationHistory,
            matchingRequests,
            activeMatchesCount,
            unreadNotificationsCount,
            recentNotifications,
        ] = await Promise.all([
            // Recent donations
            prisma.donationhistory.findMany({
                where: { donorid: donor.donorid },
                include: {
                    hospitals: {
                        select: {
                            hospitalid: true,
                            hospitalname: true,
                            city: true,
                            address: true,
                        },
                    },
                    bloodbanks: {
                        select: {
                            bloodbankid: true,
                            bloodbankname: true,
                            city: true,
                            address: true,
                        },
                    },
                    bloodrequests: {
                        select: {
                            requestid: true,
                            patientname: true,
                            bloodgroup: true,
                            bloodcomponent: true,
                        },
                    },
                },
                orderBy: { donationdate: "desc" },
                take: 5,
            }),

            // Top matching active requests
            prisma.bloodrequests.findMany({
                where: {
                    bloodgroup: { in: compatibleGroups },
                    status: { in: ACTIVE_REQUEST_STATUSES },
                },
                include: {
                    hospitals: {
                        select: {
                            hospitalid: true,
                            hospitalname: true,
                            city: true,
                            address: true,
                            contactpersonname: true,
                            contactpersonphone: true,
                        },
                    },
                    requesters: {
                        select: {
                            requesterid: true,
                            city: true,
                            state: true,
                        },
                    },
                },
                orderBy: [
                    { isemergency: "desc" },
                    { urgencylevel: "desc" },
                    { createdat: "desc" },
                ],
                take: 5,
            }),

            // Total matching requests count
            prisma.bloodrequests.count({
                where: {
                    bloodgroup: { in: compatibleGroups },
                    status: { in: ACTIVE_REQUEST_STATUSES },
                },
            }),

            // Unread notifications count
            prisma.notification.count({
                where: {
                    userid: user.userid,
                    isread: false,
                },
            }),

            // Recent notifications for activity feed
            prisma.notification.findMany({
                where: { userid: user.userid },
                orderBy: { sentat: "desc" },
                take: 5,
            }),
        ]);

        // Calculate donation stats
        const totalDonations = donationHistory.length;
        const totalUnitsDonated = donationHistory.reduce((sum, h) => sum + (h.unitsdonated || 1), 0);
        const estimatedLivesSaved = totalUnitsDonated * 3;

        // Last donation record
        const lastDonation = donationHistory[0] || null;

        // Build recent activities feed from real notifications and donation events
        const recentActivities = [
            ...recentNotifications.map((n) => ({
                id: n.notificationid,
                title: n.title,
                description: n.message,
                timestamp: n.sentat || new Date(),
                type: n.type.toLowerCase(),
            })),
            ...donationHistory.map((d) => ({
                id: d.donationhistoryid,
                title: "Completed Voluntary Donation",
                description: `Donated ${d.unitsdonated} unit(s) at ${d.hospitals?.hospitalname || d.bloodbanks?.bloodbankname || "Authorized Blood Center"}.`,
                timestamp: d.donationdate,
                type: "donation",
            })),
        ].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()).slice(0, 5);

        return res.status(200).json({
            success: true,
            donor,
            stats: {
                totalDonations,
                totalUnitsDonated,
                estimatedLivesSaved,
                activeMatchesCount,
                unreadNotificationsCount,
            },
            eligibility,
            matchingRequests,
            lastDonation,
            recentActivities,
        });
    } catch (error) {
        console.error("Error loading donor dashboard:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load donor dashboard",
        });
    }
});

/*
 * MATCHING BLOOD REQUESTS FOR CURRENT DONOR
 * GET /donors/me/matching-requests
 * Query params: exactOnly (boolean), urgency (string), city (string), limit (number), page (number)
 */
router.get("/me/matching-requests", authenticate, authorize("DONOR", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const donor = await resolveCurrentDonor(user.userid);

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account.",
            });
        }

        const exactOnly = req.query.exactOnly === "true";
        const urgency = req.query.urgency ? (req.query.urgency as string).toUpperCase() : undefined;
        const cityFilter = req.query.city ? (req.query.city as string).trim() : undefined;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
        const skip = (page - 1) * limit;

        const targetGroups = exactOnly
            ? [donor.bloodgroup]
            : (RECIPIENT_COMPATIBILITY_MAP[donor.bloodgroup] || [donor.bloodgroup]);

        const whereClause: any = {
            bloodgroup: { in: targetGroups },
            status: { in: ACTIVE_REQUEST_STATUSES },
        };

        if (urgency) {
            whereClause.urgencylevel = urgency;
        }

        if (cityFilter) {
            whereClause.OR = [
                { hospitals: { city: { contains: cityFilter, mode: "insensitive" } } },
                { requesters: { city: { contains: cityFilter, mode: "insensitive" } } },
            ];
        }

        const [requests, total] = await Promise.all([
            prisma.bloodrequests.findMany({
                where: whereClause,
                include: {
                    hospitals: {
                        select: {
                            hospitalid: true,
                            hospitalname: true,
                            city: true,
                            state: true,
                            address: true,
                            contactpersonname: true,
                            contactpersonphone: true,
                        },
                    },
                    requesters: {
                        select: {
                            requesterid: true,
                            city: true,
                            state: true,
                        },
                    },
                },
                orderBy: [
                    { isemergency: "desc" },
                    { urgencylevel: "desc" },
                    { createdat: "desc" },
                ],
                skip,
                take: limit,
            }),
            prisma.bloodrequests.count({ where: whereClause }),
        ]);

        return res.status(200).json({
            success: true,
            donorBloodGroup: donor.bloodgroup,
            compatibleGroups: targetGroups,
            total,
            page,
            limit,
            requests,
        });
    } catch (error) {
        console.error("Error fetching matching blood requests:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch matching blood requests",
        });
    }
});

/*
 * DONATION HISTORY FOR CURRENT DONOR
 * GET /donors/me/history
 */
router.get("/me/history", authenticate, authorize("DONOR", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const donor = await resolveCurrentDonor(user.userid);

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account.",
            });
        }

        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
        const skip = (page - 1) * limit;

        const [history, total] = await Promise.all([
            prisma.donationhistory.findMany({
                where: { donorid: donor.donorid },
                include: {
                    hospitals: {
                        select: {
                            hospitalid: true,
                            hospitalname: true,
                            city: true,
                            address: true,
                        },
                    },
                    bloodbanks: {
                        select: {
                            bloodbankid: true,
                            bloodbankname: true,
                            city: true,
                            address: true,
                        },
                    },
                    bloodrequests: {
                        select: {
                            requestid: true,
                            patientname: true,
                            bloodgroup: true,
                            bloodcomponent: true,
                            unitsrequired: true,
                        },
                    },
                },
                orderBy: { donationdate: "desc" },
                skip,
                take: limit,
            }),
            prisma.donationhistory.count({ where: { donorid: donor.donorid } }),
        ]);

        const totalUnitsDonated = history.reduce((sum, h) => sum + (h.unitsdonated || 1), 0);
        const estimatedLivesSaved = totalUnitsDonated * 3;

        return res.status(200).json({
            success: true,
            stats: {
                totalDonations: total,
                totalUnitsDonated,
                estimatedLivesSaved,
            },
            page,
            limit,
            total,
            history,
        });
    } catch (error) {
        console.error("Error fetching donation history:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch donation history",
        });
    }
});

/*
 * LAST DONATION RECORD FOR CURRENT DONOR
 * GET /donors/me/last-donation
 */
router.get("/me/last-donation", authenticate, authorize("DONOR", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const donor = await resolveCurrentDonor(user.userid);

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account.",
            });
        }

        const lastDonation = await prisma.donationhistory.findFirst({
            where: { donorid: donor.donorid },
            include: {
                hospitals: {
                    select: {
                        hospitalid: true,
                        hospitalname: true,
                        city: true,
                        address: true,
                    },
                },
                bloodbanks: {
                    select: {
                        bloodbankid: true,
                        bloodbankname: true,
                        city: true,
                        address: true,
                    },
                },
                bloodrequests: {
                    select: {
                        requestid: true,
                        patientname: true,
                        bloodgroup: true,
                        bloodcomponent: true,
                    },
                },
            },
            orderBy: { donationdate: "desc" },
        });

        const eligibility = computeEligibility(donor);

        return res.status(200).json({
            success: true,
            lastDonation,
            eligibility,
        });
    } catch (error) {
        console.error("Error fetching last donation:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch last donation record",
        });
    }
});

/* =========================================================================
   2. PARAMETERIZED /donors/:donorId/... ENDPOINTS (WITH OWNERSHIP CHECK)
   ========================================================================= */

/*
 * GET DONOR DASHBOARD BY ID
 * GET /donors/:donorId/dashboard
 */
router.get(
    "/:donorId/dashboard",
    authenticate,
    authorize("DONOR", "ADMIN"),
    checkDonorOwnership,
    async (req: Request, res: Response) => {
        try {
            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;

            const donor = await prisma.donors.findUnique({
                where: { donorid: donorId },
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

            if (!donor) {
                return res.status(404).json({
                    success: false,
                    message: "Donor not found",
                });
            }

            const eligibility = computeEligibility(donor);
            const compatibleGroups = RECIPIENT_COMPATIBILITY_MAP[donor.bloodgroup] || [donor.bloodgroup];

            const [
                donationHistory,
                matchingRequests,
                activeMatchesCount,
                unreadNotificationsCount,
            ] = await Promise.all([
                prisma.donationhistory.findMany({
                    where: { donorid: donor.donorid },
                    include: {
                        hospitals: true,
                        bloodbanks: true,
                        bloodrequests: true,
                    },
                    orderBy: { donationdate: "desc" },
                    take: 5,
                }),
                prisma.bloodrequests.findMany({
                    where: {
                        bloodgroup: { in: compatibleGroups },
                        status: { in: ACTIVE_REQUEST_STATUSES },
                    },
                    include: {
                        hospitals: true,
                        requesters: true,
                    },
                    orderBy: [
                        { isemergency: "desc" },
                        { urgencylevel: "desc" },
                    ],
                    take: 5,
                }),
                prisma.bloodrequests.count({
                    where: {
                        bloodgroup: { in: compatibleGroups },
                        status: { in: ACTIVE_REQUEST_STATUSES },
                    },
                }),
                prisma.notification.count({
                    where: {
                        userid: donor.userid,
                        isread: false,
                    },
                }),
            ]);

            const totalDonations = donationHistory.length;
            const totalUnitsDonated = donationHistory.reduce((sum, h) => sum + (h.unitsdonated || 1), 0);

            return res.status(200).json({
                success: true,
                donor,
                stats: {
                    totalDonations,
                    totalUnitsDonated,
                    estimatedLivesSaved: totalUnitsDonated * 3,
                    activeMatchesCount,
                    unreadNotificationsCount,
                },
                eligibility,
                matchingRequests,
                lastDonation: donationHistory[0] || null,
            });
        } catch (error) {
            console.error("Error loading donor dashboard:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to load dashboard",
            });
        }
    }
);

/*
 * GET MATCHING REQUESTS BY DONOR ID
 * GET /donors/:donorId/matching-requests
 */
router.get(
    "/:donorId/matching-requests",
    authenticate,
    authorize("DONOR", "ADMIN"),
    checkDonorOwnership,
    async (req: Request, res: Response) => {
        try {
            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;

            const donor = await prisma.donors.findUnique({
                where: { donorid: donorId },
            });

            if (!donor) {
                return res.status(404).json({
                    success: false,
                    message: "Donor not found",
                });
            }

            const targetGroups = RECIPIENT_COMPATIBILITY_MAP[donor.bloodgroup] || [donor.bloodgroup];

            const requests = await prisma.bloodrequests.findMany({
                where: {
                    bloodgroup: { in: targetGroups },
                    status: { in: ACTIVE_REQUEST_STATUSES },
                },
                include: {
                    hospitals: true,
                    requesters: true,
                },
                orderBy: [
                    { isemergency: "desc" },
                    { urgencylevel: "desc" },
                ],
            });

            return res.status(200).json({
                success: true,
                donorBloodGroup: donor.bloodgroup,
                compatibleGroups: targetGroups,
                total: requests.length,
                requests,
            });
        } catch (error) {
            console.error("Error fetching matching requests:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch matching requests",
            });
        }
    }
);

/*
 * GET DONATION HISTORY BY DONOR ID
 * GET /donors/:donorId/history
 */
router.get(
    "/:donorId/history",
    authenticate,
    authorize("DONOR", "ADMIN"),
    checkDonorOwnership,
    async (req: Request, res: Response) => {
        try {
            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;

            const history = await prisma.donationhistory.findMany({
                where: { donorid: donorId },
                include: {
                    hospitals: true,
                    bloodbanks: true,
                    bloodrequests: true,
                },
                orderBy: { donationdate: "desc" },
            });

            const totalUnits = history.reduce((sum, h) => sum + (h.unitsdonated || 1), 0);

            return res.status(200).json({
                success: true,
                stats: {
                    totalDonations: history.length,
                    totalUnitsDonated: totalUnits,
                    estimatedLivesSaved: totalUnits * 3,
                },
                total: history.length,
                history,
            });
        } catch (error) {
            console.error("Error fetching donation history:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch donation history",
            });
        }
    }
);

/*
 * GET LAST DONATION BY DONOR ID
 * GET /donors/:donorId/last-donation
 */
router.get(
    "/:donorId/last-donation",
    authenticate,
    authorize("DONOR", "ADMIN"),
    checkDonorOwnership,
    async (req: Request, res: Response) => {
        try {
            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;

            const [donor, lastDonation] = await Promise.all([
                prisma.donors.findUnique({ where: { donorid: donorId } }),
                prisma.donationhistory.findFirst({
                    where: { donorid: donorId },
                    include: {
                        hospitals: true,
                        bloodbanks: true,
                        bloodrequests: true,
                    },
                    orderBy: { donationdate: "desc" },
                }),
            ]);

            if (!donor) {
                return res.status(404).json({
                    success: false,
                    message: "Donor not found",
                });
            }

            return res.status(200).json({
                success: true,
                lastDonation,
                eligibility: computeEligibility(donor),
            });
        } catch (error) {
            console.error("Error fetching last donation:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch last donation record",
            });
        }
    }
);

/* =========================================================================
   3. STANDARD DONOR CRUD ENDPOINTS
   ========================================================================= */

/*
 * GET ALL DONORS
 * GET /donors
 */
router.get("/", async (_req: Request, res: Response) => {
    try {
        const donors = await prisma.donors.findMany({
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

        return res.status(200).json(donors);
    } catch (error) {
        console.error("Error fetching donors:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch donors",
        });
    }
});

/*
 * GET DONOR BY ID
 * GET /donors/:donorId
 */
router.get("/:donorId", async (req: Request, res: Response) => {
    try {
        const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;

        const donor = await prisma.donors.findUnique({
            where: { donorid: donorId },
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

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor not found",
            });
        }

        return res.status(200).json(donor);
    } catch (error) {
        console.error("Error fetching donor:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch donor",
        });
    }
});

/*
 * CREATE DONOR PROFILE
 * POST /donors
 */
router.post(
    "/",
    authenticate,
    authorize("DONOR", "ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const currentUser = (req as any).user;
            const targetUserId = currentUser.role === "ADMIN" && req.body.userid
                ? req.body.userid
                : currentUser.userid;

            const existingDonor = await prisma.donors.findUnique({
                where: { userid: targetUserId },
            });

            if (existingDonor) {
                return res.status(409).json({
                    success: false,
                    message: "Donor profile already exists for this user",
                });
            }

            const {
                bloodgroup,
                bloodGroup,
                dateofbirth,
                dateOfBirth,
                dob,
                gender,
                weight,
                city,
                state,
                pincode,
                address,
                availabilitystatus,
            } = req.body;

            const rawBloodGroup = bloodgroup || bloodGroup;
            const rawDob = dateofbirth || dateOfBirth || dob;
            const rawGender = gender;

            const missingFields: string[] = [];
            if (!rawBloodGroup) missingFields.push("bloodgroup");
            if (!rawDob) missingFields.push("dateofbirth");
            if (!rawGender) missingFields.push("gender");
            if (!city) missingFields.push("city");
            if (!state) missingFields.push("state");
            if (!pincode) missingFields.push("pincode");

            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required donor fields: ${missingFields.join(", ")}`,
                    missingFields,
                });
            }

            const validBloodGroup = normalizeBloodGroup(rawBloodGroup);
            if (!validBloodGroup) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid blood group",
                });
            }

            const parsedDob = new Date(rawDob);
            if (isNaN(parsedDob.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date of birth",
                });
            }

            const validGender = normalizeGender(rawGender);
            if (!validGender) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid gender. Valid values: MALE, FEMALE, OTHER",
                });
            }

            let parsedWeight: number | null = null;
            if (weight !== undefined && weight !== null && weight !== "") {
                const w = parseFloat(weight);
                if (isNaN(w) || w <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid weight value",
                    });
                }
                parsedWeight = w;
            }

            const donor = await prisma.donors.create({
                data: {
                    userid: targetUserId,
                    bloodgroup: validBloodGroup,
                    dateofbirth: parsedDob,
                    gender: validGender,
                    weight: parsedWeight,
                    city: city.trim(),
                    state: state.trim(),
                    pincode: pincode.trim(),
                    address: address ? address.trim() : null,
                    availabilitystatus: normalizeAvailability(availabilitystatus) || availability_status.AVAILABLE,
                    iseligible: true,
                },
            });

            return res.status(201).json(donor);
        } catch (error) {
            console.error("Error creating donor:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to create donor",
            });
        }
    }
);

/*
 * UPDATE DONOR PROFILE BY ID
 * PUT /donors/:donorId
 */
router.put(
    "/:donorId",
    authenticate,
    authorize("DONOR", "ADMIN"),
    checkDonorOwnership,
    async (req: Request, res: Response) => {
        try {
            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;
            const updateData: any = {};

            if (req.body.bloodgroup || req.body.bloodGroup) {
                const bg = normalizeBloodGroup(req.body.bloodgroup || req.body.bloodGroup);
                if (!bg) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid blood group",
                    });
                }
                updateData.bloodgroup = bg;
            }

            if (req.body.weight !== undefined) {
                const w = parseFloat(req.body.weight);
                if (isNaN(w) || w <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid weight value",
                    });
                }
                updateData.weight = w;
            }

            if (req.body.city !== undefined) updateData.city = req.body.city.trim();
            if (req.body.state !== undefined) updateData.state = req.body.state.trim();
            if (req.body.pincode !== undefined) updateData.pincode = req.body.pincode.trim();
            if (req.body.address !== undefined) updateData.address = req.body.address.trim();

            if (req.body.availabilitystatus || req.body.availability) {
                const status = normalizeAvailability(req.body.availabilitystatus || req.body.availability);
                if (!status) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid availability status",
                    });
                }
                updateData.availabilitystatus = status;
            }

            if (req.body.iseligible !== undefined) {
                updateData.iseligible = Boolean(req.body.iseligible);
            }

            updateData.updatedat = new Date();

            const donor = await prisma.donors.update({
                where: { donorid: donorId },
                data: updateData,
            });

            return res.status(200).json(donor);
        } catch (error) {
            console.error("Error updating donor:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update donor",
            });
        }
    }
);

/*
 * DELETE DONOR PROFILE BY ID
 * DELETE /donors/:donorId
 */
router.delete(
    "/:donorId",
    authenticate,
    authorize("DONOR", "ADMIN"),
    checkDonorOwnership,
    async (req: Request, res: Response) => {
        try {
            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;

            await prisma.donors.delete({
                where: { donorid: donorId },
            });

            return res.status(200).json({
                success: true,
                message: "Donor deleted successfully",
            });
        } catch (error) {
            console.error("Error deleting donor:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to delete donor",
            });
        }
    }
);

export default router;