import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { checkDonorOwnership } from "../middleware/ownership.middleware";
import { blood_group, gender_type, availability_status, request_status, notification_type } from "../generated/prisma/enums";
import { validateCoordinates, evaluateLocationDistance } from "../utils/distance";
import { isDonorCompatibleWithRecipient } from "../utils/bloodCompatibility";
import { CampService } from "../services/camp.service";
import { CampNotificationService } from "../services/campNotification.service";

// Helper: sanitize blood request for donor feeds (protect patient privacy)
function sanitizeRequestForDonor(req: any, hasResponded: boolean = false, isAccepted: boolean = false) {
    const { patientcontact, patientphone, ...safe } = req;
    return {
        ...safe,
        patientcontact: null, // Patient contact protected for privacy on donor feeds
        patientname: isAccepted ? req.patientname : null, // Patient name hidden until donor offer is ACCEPTED
        hasResponded,
    };
}

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

        // Optional coordinate updates (rejects invalid, never overwrites valid with null)
        if (
            (req.body.latitude !== undefined && req.body.latitude !== null && String(req.body.latitude).trim() !== "") ||
            (req.body.longitude !== undefined && req.body.longitude !== null && String(req.body.longitude).trim() !== "")
        ) {
            const coordValidation = validateCoordinates(req.body.latitude, req.body.longitude);
            if (!coordValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: coordValidation.error,
                });
            }
            updateData.latitude = coordValidation.latitude;
            updateData.longitude = coordValidation.longitude;
        }

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
        const canMatch = donor.availabilitystatus === availability_status.AVAILABLE && eligibility.isEligible;

        // 2. Parallel queries for dashboard components
        const [
            donationHistory,
            candidateRequests,
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

            // Active requests (filtered by component-aware compatibility & eligibility below)
            canMatch
                ? prisma.bloodrequests.findMany({
                    where: {
                        status: { in: ACTIVE_REQUEST_STATUSES },
                    },
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
                                latitude: true,
                                longitude: true,
                            },
                        },
                        requesters: {
                            select: {
                                requesterid: true,
                                city: true,
                                state: true,
                                latitude: true,
                                longitude: true,
                            },
                        },
                        prescription: {
                            select: {
                                status: true,
                                hospitalname: true,
                            },
                        },
                    },
                    orderBy: [
                        { isemergency: "desc" },
                        { urgencylevel: "desc" },
                        { createdat: "desc" },
                    ],
                    take: 50,
                })
                : Promise.resolve([]),

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

        const compatibleCandidates = candidateRequests.filter((r) =>
            isDonorCompatibleWithRecipient(donor.bloodgroup, r.bloodgroup, r.bloodcomponent)
        );
        const matchingRequests = compatibleCandidates.slice(0, 5);
        const activeMatchesCount = compatibleCandidates.length;

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
                description: n.message.replace(/<!--META:[\s\S]*?-->/g, "").trim(),
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

        // Check which matching requests the donor has already volunteered for (from durable broadcastdeliveries and legacy notifications)
        const matchingIds = matchingRequests.map((r) => r.requestid);
        const [myDeliveries, myVolunteeredNotifications, myAllDeliveries] = await Promise.all([
            prisma.broadcastdeliveries.findMany({
                where: {
                    donoruserid: user.userid,
                    requestid: { in: matchingIds },
                    response: "ACCEPTED",
                },
                select: {
                    requestid: true,
                    deliveryid: true,
                    acceptancestatus: true,
                    acceptedat: true,
                    rejectedat: true,
                    transitstatus: true,
                    startedat: true,
                    reachedat: true,
                    completedat: true,
                    receiptconfirmedat: true,
                },
            }),
            prisma.notification.findMany({
                where: {
                    userid: user.userid,
                    type: notification_type.MATCH,
                    title: "Volunteer Response Confirmed",
                    requestid: { in: matchingIds },
                },
                select: { requestid: true },
            }),
            prisma.broadcastdeliveries.findMany({
                where: {
                    donoruserid: user.userid,
                    response: "ACCEPTED",
                },
                orderBy: { respondedat: "desc" },
                take: 25,
                include: {
                    bloodrequests: {
                        include: {
                            hospitals: {
                                select: {
                                    hospitalid: true,
                                    hospitalname: true,
                                    address: true,
                                    city: true,
                                    state: true,
                                    pincode: true,
                                    contactpersonname: true,
                                    contactpersonphone: true,
                                    latitude: true,
                                    longitude: true,
                                },
                            },
                            requesters: {
                                select: {
                                    requesterid: true,
                                    city: true,
                                    state: true,
                                    pincode: true,
                                    latitude: true,
                                    longitude: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);
        const myDeliveryByRequest = new Map(myDeliveries.map((d) => [d.requestid, d]));
        const myRespondedSet = new Set([
            ...myDeliveries.map((d) => d.requestid),
            ...myVolunteeredNotifications.map((v) => v.requestid),
        ]);

        const donorLat = donor.latitude != null ? Number(donor.latitude) : null;
        const donorLng = donor.longitude != null ? Number(donor.longitude) : null;

        const sanitizedMatchingRequests = matchingRequests.map((r) => {
            const delivery = myDeliveryByRequest.get(r.requestid);
            const sanitized = sanitizeRequestForDonor(
                r,
                myRespondedSet.has(r.requestid),
                delivery?.acceptancestatus === "ACCEPTED"
            );
            const reqLat = r.latitude != null
                ? Number(r.latitude)
                : (r.hospitals?.latitude != null
                    ? Number(r.hospitals.latitude)
                    : (r.requesters?.latitude != null ? Number(r.requesters.latitude) : null));
            const reqLng = r.longitude != null
                ? Number(r.longitude)
                : (r.hospitals?.longitude != null
                    ? Number(r.hospitals.longitude)
                    : (r.requesters?.longitude != null ? Number(r.requesters.longitude) : null));

            let distanceKm: number | null = null;
            let distanceDisplay = "Distance unavailable";
            let locationMatch: "COORDINATES" | "CITY_FALLBACK" | "NONE" = "NONE";

            if (donorLat !== null && donorLng !== null && reqLat !== null && reqLng !== null) {
                const locEval = evaluateLocationDistance(donorLat, donorLng, reqLat, reqLng, r.searchradius || 15);
                distanceKm = locEval.distanceKm;
                distanceDisplay = locEval.distanceDisplay;
                locationMatch = "COORDINATES";
            } else if (donor.city && (r.hospitals?.city || r.requesters?.city)) {
                const reqCity = (r.hospitals?.city || r.requesters?.city || "").trim();
                if (donor.city.trim().toLowerCase() === reqCity.toLowerCase()) {
                    distanceDisplay = "Distance unavailable - City match";
                    locationMatch = "CITY_FALLBACK";
                }
            }

            delete (sanitized as any).latitude;
            delete (sanitized as any).longitude;
            if (sanitized.hospitals) {
                delete (sanitized.hospitals as any).latitude;
                delete (sanitized.hospitals as any).longitude;
            }
            if (sanitized.requesters) {
                delete (sanitized.requesters as any).latitude;
                delete (sanitized.requesters as any).longitude;
            }

            const existingDelivery = myDeliveryByRequest.get(r.requestid);
            return {
                ...sanitized,
                distanceKm,
                distanceDisplay,
                locationMatch,
                myCommitment: existingDelivery
                    ? {
                        deliveryId: existingDelivery.deliveryid,
                        acceptanceStatus: existingDelivery.acceptancestatus || "PENDING",
                        acceptedAt: existingDelivery.acceptedat,
                        rejectedAt: existingDelivery.rejectedat,
                        transitStatus: existingDelivery.transitstatus || "DONOR_FOUND",
                        startedAt: existingDelivery.startedat,
                        reachedAt: existingDelivery.reachedat,
                        completedAt: existingDelivery.completedat,
                        receiptConfirmedAt: existingDelivery.receiptconfirmedat,
                    }
                    : null,
            };
        });

        const myCommitments = myAllDeliveries
            .filter((d) => Boolean(d.bloodrequests))
            .map((d) => {
                const reqObj = d.bloodrequests;
                const sanitized = sanitizeRequestForDonor(reqObj, true, d.acceptancestatus === "ACCEPTED");
                delete (sanitized as any).latitude;
                delete (sanitized as any).longitude;
                if (sanitized.hospitals) {
                    delete (sanitized.hospitals as any).latitude;
                    delete (sanitized.hospitals as any).longitude;
                }
                if (sanitized.requesters) {
                    delete (sanitized.requesters as any).latitude;
                    delete (sanitized.requesters as any).longitude;
                }
                return {
                    ...sanitized,
                    myCommitment: {
                        deliveryId: d.deliveryid,
                        acceptanceStatus: d.acceptancestatus || "PENDING",
                        acceptedAt: d.acceptedat,
                        rejectedAt: d.rejectedat,
                        transitStatus: d.transitstatus || "DONOR_FOUND",
                        startedAt: d.startedat,
                        reachedAt: d.reachedat,
                        completedAt: d.completedat,
                        receiptConfirmedAt: d.receiptconfirmedat,
                        respondedAt: d.respondedat,
                    },
                };
            });

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
            matchingRequests: sanitizedMatchingRequests,
            myCommitments,
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
/*
 * MATCHING BLOOD REQUESTS FOR CURRENT DONOR (LOCATION-AWARE)
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

        const donorLat = donor.latitude != null ? Number(donor.latitude) : null;
        const donorLng = donor.longitude != null ? Number(donor.longitude) : null;
        const donorCity = donor.city ? donor.city.trim() : "";

        // Check availability status and donation cooldown
        const isAvailable = donor.availabilitystatus === availability_status.AVAILABLE;
        const latestDonation = await prisma.donationhistory.findFirst({
            where: { donorid: donor.donorid },
            orderBy: { donationdate: "desc" },
            select: { donationdate: true },
        });
        const effectiveLastDonation = donor.lastdonationdate || latestDonation?.donationdate || null;
        const eligibility = computeEligibility({
            iseligible: donor.iseligible,
            lastdonationdate: effectiveLastDonation,
        });

        if (!isAvailable || !eligibility.isEligible) {
            return res.status(200).json({
                success: true,
                donorBloodGroup: donor.bloodgroup,
                compatibleGroups: [donor.bloodgroup],
                donorLocation: {
                    hasCoordinates: donorLat !== null && donorLng !== null,
                    city: donor.city && donor.city.trim() ? donor.city.trim() : null,
                    state: donor.state && donor.state.trim() ? donor.state.trim() : null,
                },
                availabilityStatus: donor.availabilitystatus,
                eligibility,
                total: 0,
                page: 1,
                limit: 10,
                requests: [],
            });
        }

        const exactOnly = req.query.exactOnly === "true";
        const urgency = req.query.urgency ? (req.query.urgency as string).toUpperCase() : undefined;
        const cityFilter = req.query.city ? (req.query.city as string).trim() : undefined;
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
        const skip = (page - 1) * limit;

        interface EvaluatedRequest {
            request: any;
            distanceKm: number | null;
            distanceDisplay: string;
            locationMatch: "COORDINATES" | "CITY_FALLBACK" | "NONE";
            delivery?: any;
        }

        const matchedList: EvaluatedRequest[] = [];
        const seenRequestIds = new Set<string>();

        // 1. PRIMARY SOURCE: Targeted requests specifically broadcast to this authenticated donor
        const myBroadcastDeliveries = await prisma.broadcastdeliveries.findMany({
            where: {
                OR: [
                    { donoruserid: user.userid },
                    { donorid: donor.donorid },
                ],
                bloodrequests: {
                    status: { notIn: ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"] },
                },
            },
            include: {
                bloodrequests: {
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
                                latitude: true,
                                longitude: true,
                            },
                        },
                        requesters: {
                            select: {
                                requesterid: true,
                                city: true,
                                state: true,
                                latitude: true,
                                longitude: true,
                            },
                        },
                        prescription: {
                            select: {
                                status: true,
                                hospitalname: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdat: "desc" },
        });

        for (const delivery of myBroadcastDeliveries) {
            const bReq = delivery.bloodrequests;
            if (!bReq) continue;
            if (seenRequestIds.has(bReq.requestid)) continue;

            // ABO/Rh component compatibility check for donor safety
            if (!exactOnly && !isDonorCompatibleWithRecipient(donor.bloodgroup, bReq.bloodgroup, bReq.bloodcomponent)) {
                continue;
            }

            if (urgency && bReq.urgencylevel !== urgency) {
                continue;
            }

            const reqLat = bReq.latitude != null
                ? Number(bReq.latitude)
                : (bReq.hospitals?.latitude != null
                    ? Number(bReq.hospitals.latitude)
                    : (bReq.requesters?.latitude != null ? Number(bReq.requesters.latitude) : null));

            const reqLng = bReq.longitude != null
                ? Number(bReq.longitude)
                : (bReq.hospitals?.longitude != null
                    ? Number(bReq.hospitals.longitude)
                    : (bReq.requesters?.longitude != null ? Number(bReq.requesters.longitude) : null));

            const locEval = evaluateLocationDistance(donorLat, donorLng, reqLat, reqLng, bReq.searchradius || 25);
            const distKm = delivery.distancekm != null ? Number(delivery.distancekm) : locEval.distanceKm;
            const distDisplay = distKm != null
                ? `${distKm.toFixed(1)} km away`
                : (bReq.hospitals?.city ? `City Match (${bReq.hospitals.city})` : "Direct Broadcast");

            matchedList.push({
                request: bReq,
                distanceKm: distKm,
                distanceDisplay: distDisplay,
                locationMatch: locEval.hasCoordinates ? "COORDINATES" : "CITY_FALLBACK",
                delivery,
            });
            seenRequestIds.add(bReq.requestid);
        }

        // 2. SECONDARY SOURCE: General open active requests that have NOT been targeted via emergency broadcasts
        // (Broadcast privacy: requests broadcast to specific donors are only visible to their intended recipients)
        const whereClause: any = {
            status: { in: ACTIVE_REQUEST_STATUSES },
            requestid: { notIn: Array.from(seenRequestIds) },
            emergencybroadcasts: {
                none: {},
            },
            ...(exactOnly ? { bloodgroup: donor.bloodgroup } : {}),
        };

        if (urgency) {
            whereClause.urgencylevel = urgency;
        }

        // Fetch candidate active requests with location metadata
        const rawCandidates = await prisma.bloodrequests.findMany({
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
                        latitude: true,
                        longitude: true,
                    },
                },
                requesters: {
                    select: {
                        requesterid: true,
                        city: true,
                        state: true,
                        latitude: true,
                        longitude: true,
                    },
                },
                prescription: {
                    select: {
                        status: true,
                        hospitalname: true,
                    },
                },
            },
        });

        for (const candidate of rawCandidates) {
            if (seenRequestIds.has(candidate.requestid)) continue;
            if (!exactOnly && !isDonorCompatibleWithRecipient(donor.bloodgroup, candidate.bloodgroup, candidate.bloodcomponent)) {
                continue;
            }
            // Resolve request coordinate points (explicit request coords -> hospital coords -> requester coords)
            const reqLat = candidate.latitude != null
                ? Number(candidate.latitude)
                : (candidate.hospitals?.latitude != null
                    ? Number(candidate.hospitals.latitude)
                    : (candidate.requesters?.latitude != null ? Number(candidate.requesters.latitude) : null));

            const reqLng = candidate.longitude != null
                ? Number(candidate.longitude)
                : (candidate.hospitals?.longitude != null
                    ? Number(candidate.hospitals.longitude)
                    : (candidate.requesters?.longitude != null ? Number(candidate.requesters.longitude) : null));

            const radiusKm = candidate.searchradius || 5;
            const locEval = evaluateLocationDistance(donorLat, donorLng, reqLat, reqLng, radiusKm);

            if (locEval.hasCoordinates) {
                // Both points have coordinates: apply strictly accurate Haversine radius filtering
                if (locEval.isWithinRadius) {
                    matchedList.push({
                        request: candidate,
                        distanceKm: locEval.distanceKm,
                        distanceDisplay: locEval.distanceDisplay,
                        locationMatch: "COORDINATES",
                    });
                    seenRequestIds.add(candidate.requestid);
                }
            } else {
                // Missing coordinates on donor or request: safely fallback to city/state matching
                const reqCity = (candidate.hospitals?.city || candidate.requesters?.city || "").trim();

                let isCityMatch = false;
                if (cityFilter) {
                    isCityMatch = reqCity.toLowerCase().includes(cityFilter.toLowerCase());
                } else if (donorCity && reqCity) {
                    isCityMatch =
                        donorCity.toLowerCase() === reqCity.toLowerCase() ||
                        donorCity.toLowerCase().includes(reqCity.toLowerCase()) ||
                        reqCity.toLowerCase().includes(donorCity.toLowerCase());
                } else {
                    isCityMatch = false;
                }

                if (isCityMatch) {
                    matchedList.push({
                        request: candidate,
                        distanceKm: null,
                        distanceDisplay: "Distance unavailable - City match",
                        locationMatch: "CITY_FALLBACK",
                    });
                    seenRequestIds.add(candidate.requestid);
                }
            }
        }

        // Sorting: 1. Emergency first -> 2. Urgency rank -> 3. Distance (closer first) -> 4. Newest
        const URGENCY_RANK: Record<string, number> = {
            CRITICAL: 4,
            HIGH: 3,
            MEDIUM: 2,
            LOW: 1,
        };

        matchedList.sort((a, b) => {
            const emA = a.request.isemergency ? 1 : 0;
            const emB = b.request.isemergency ? 1 : 0;
            if (emB !== emA) return emB - emA;

            const urgA = URGENCY_RANK[a.request.urgencylevel] || 0;
            const urgB = URGENCY_RANK[b.request.urgencylevel] || 0;
            if (urgB !== urgA) return urgB - urgA;

            // Distance sorting: known distances ascending, then city fallbacks
            if (a.distanceKm !== null && b.distanceKm !== null) {
                if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
            } else if (a.distanceKm !== null && b.distanceKm === null) {
                return -1;
            } else if (a.distanceKm === null && b.distanceKm !== null) {
                return 1;
            }

            return new Date(b.request.createdat || 0).getTime() - new Date(a.request.createdat || 0).getTime();
        });

        const total = matchedList.length;
        const paginated = matchedList.slice(skip, skip + limit);

        // Check which requests the current donor has deliveries or responses for
        const requestIds = paginated.map((item) => item.request.requestid);
        const [myDeliveries, myVolunteeredNotifications, myAllDeliveries] = await Promise.all([
            prisma.broadcastdeliveries.findMany({
                where: {
                    OR: [
                        { donoruserid: user.userid },
                        { donorid: donor.donorid },
                    ],
                    requestid: { in: requestIds },
                },
                select: {
                    requestid: true,
                    deliveryid: true,
                    response: true,
                    deliverystatus: true,
                    acceptancestatus: true,
                    acceptedat: true,
                    rejectedat: true,
                    transitstatus: true,
                    startedat: true,
                    reachedat: true,
                    completedat: true,
                    receiptconfirmedat: true,
                    respondedat: true,
                    transitnotes: true,
                },
            }),
            prisma.notification.findMany({
                where: {
                    userid: user.userid,
                    type: notification_type.MATCH,
                    title: "Volunteer Response Confirmed",
                    requestid: { in: requestIds },
                },
                select: { requestid: true },
            }),
            prisma.broadcastdeliveries.findMany({
                where: {
                    OR: [
                        { donoruserid: user.userid },
                        { donorid: donor.donorid },
                    ],
                    response: "ACCEPTED",
                },
                orderBy: { respondedat: "desc" },
                take: 50,
                include: {
                    bloodrequests: {
                        include: {
                            hospitals: {
                                select: {
                                    hospitalid: true,
                                    hospitalname: true,
                                    address: true,
                                    city: true,
                                    state: true,
                                    pincode: true,
                                    contactpersonname: true,
                                    contactpersonphone: true,
                                },
                            },
                            requesters: {
                                select: {
                                    requesterid: true,
                                    city: true,
                                    state: true,
                                    pincode: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);
        const myDeliveryByRequest = new Map(myDeliveries.map((d) => [d.requestid, d]));
        const myRespondedSet = new Set([
            ...myDeliveries.filter((d) => d.response === "ACCEPTED").map((d) => d.requestid),
            ...myVolunteeredNotifications.map((v) => v.requestid),
        ]);

        // Format and sanitize output (strip patient contact and exact raw coordinates)
        const sanitizedRequests = paginated.map((item) => {
            const delivery = item.delivery || myDeliveryByRequest.get(item.request.requestid);
            const isAccepted = delivery?.response === "ACCEPTED" || delivery?.acceptancestatus === "ACCEPTED";
            const isDeclined = delivery?.response === "DECLINED" || delivery?.acceptancestatus === "DECLINED";
            const hasResponded = Boolean(isAccepted || myRespondedSet.has(item.request.requestid));

            const sanitized = sanitizeRequestForDonor(
                item.request,
                hasResponded,
                isAccepted
            );
            // Remove raw coordinate numbers from payload to protect patient and facility precise geolocation
            delete (sanitized as any).latitude;
            delete (sanitized as any).longitude;
            if (sanitized.hospitals) {
                delete (sanitized.hospitals as any).latitude;
                delete (sanitized.hospitals as any).longitude;
            }
            if (sanitized.requesters) {
                delete (sanitized.requesters as any).latitude;
                delete (sanitized.requesters as any).longitude;
            }

            return {
                ...sanitized,
                distanceKm: item.distanceKm,
                distanceDisplay: item.distanceDisplay,
                locationMatch: item.locationMatch,
                searchradius: item.request.searchradius || 5,
                hasResponded,
                isDeclined,
                myCommitment: delivery
                    ? {
                        deliveryId: delivery.deliveryid,
                        acceptanceStatus: delivery.acceptancestatus || (isDeclined ? "DECLINED" : "PENDING"),
                        response: delivery.response || "PENDING",
                        acceptedAt: delivery.acceptedat,
                        rejectedAt: delivery.rejectedat,
                        transitStatus: delivery.transitstatus || "DONOR_FOUND",
                        startedAt: delivery.startedat,
                        reachedAt: delivery.reachedat,
                        completedAt: delivery.completedat,
                        receiptConfirmedAt: delivery.receiptconfirmedat,
                        respondedAt: delivery.respondedat,
                    }
                    : null,
            };
        });

        const myCommitments = myAllDeliveries
            .filter((d) => Boolean(d.bloodrequests))
            .map((d) => {
                const sanitized = sanitizeRequestForDonor(d.bloodrequests, true, d.acceptancestatus === "ACCEPTED");
                delete (sanitized as any).latitude;
                delete (sanitized as any).longitude;
                if (sanitized.hospitals) {
                    delete (sanitized.hospitals as any).latitude;
                    delete (sanitized.hospitals as any).longitude;
                }
                if (sanitized.requesters) {
                    delete (sanitized.requesters as any).latitude;
                    delete (sanitized.requesters as any).longitude;
                }
                return {
                    ...sanitized,
                    myCommitment: {
                        deliveryId: d.deliveryid,
                        acceptanceStatus: d.acceptancestatus || "PENDING",
                        acceptedAt: d.acceptedat,
                        rejectedAt: d.rejectedat,
                        transitStatus: d.transitstatus || "DONOR_FOUND",
                        startedAt: d.startedat,
                        reachedAt: d.reachedat,
                        completedAt: d.completedat,
                        receiptConfirmedAt: d.receiptconfirmedat,
                        respondedAt: d.respondedat,
                    },
                };
            });

        return res.status(200).json({
            success: true,
            donorBloodGroup: donor.bloodgroup,
            compatibleGroups: exactOnly
                ? [donor.bloodgroup]
                : (RECIPIENT_COMPATIBILITY_MAP[donor.bloodgroup] || [donor.bloodgroup]),
            donorLocation: {
                hasCoordinates: donorLat !== null && donorLng !== null,
                city: donor.city && donor.city.trim() ? donor.city.trim() : null,
                state: donor.state && donor.state.trim() ? donor.state.trim() : null,
            },
            total,
            page,
            limit,
            requests: sanitizedRequests,
            myCommitments,
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

        const formattedHistory = history.map((h) => ({
            ...h,
            isImported: h.isimported ?? false,
            verificationStatus: h.verificationstatus ?? (h.isimported ? "PENDING" : "VERIFIED"),
            bloodComponent: h.bloodcomponent || h.bloodrequests?.bloodcomponent || "WHOLE_BLOOD",
            sourceHospital: h.hospitals?.hospitalname || (h.isimported ? "Historical Import" : null),
            sourceRecordId: h.sourcerecordid,
        }));

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
            history: formattedHistory,
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
                        hospitals: { select: { hospitalid: true, hospitalname: true, city: true, state: true } },
                        bloodbanks: { select: { bloodbankid: true, bloodbankname: true, city: true, state: true } },
                        bloodrequests: { select: { requestid: true, patientname: true, bloodgroup: true, bloodcomponent: true, unitsrequired: true } },
                    },
                    orderBy: { donationdate: "desc" },
                    take: 5,
                }),
                donor.availabilitystatus === "AVAILABLE" && donor.iseligible !== false && eligibility.isEligible
                    ? prisma.bloodrequests.findMany({
                        where: {
                            bloodgroup: { in: compatibleGroups },
                            status: { in: ACTIVE_REQUEST_STATUSES },
                        },
                        include: {
                            hospitals: { select: { hospitalid: true, hospitalname: true, address: true, city: true, state: true, pincode: true } },
                            requesters: { select: { requesterid: true, city: true, state: true } },
                        },
                        orderBy: [
                            { isemergency: "desc" },
                            { urgencylevel: "desc" },
                        ],
                        take: 5,
                    })
                    : Promise.resolve([]),
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
                matchingRequests: matchingRequests.map((r) => {
                    const sanitized = sanitizeRequestForDonor(r, false);
                    delete (sanitized as any).latitude;
                    delete (sanitized as any).longitude;
                    return sanitized;
                }),
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
            const eligibility = computeEligibility(donor);
            const canMatch = donor.availabilitystatus === "AVAILABLE" && donor.iseligible !== false && eligibility.isEligible;

            const requests = canMatch
                ? await prisma.bloodrequests.findMany({
                    where: {
                        bloodgroup: { in: targetGroups },
                        status: { in: ACTIVE_REQUEST_STATUSES },
                    },
                    include: {
                        hospitals: { select: { hospitalid: true, hospitalname: true, address: true, city: true, state: true, pincode: true } },
                        requesters: { select: { requesterid: true, city: true, state: true } },
                    },
                    orderBy: [
                        { isemergency: "desc" },
                        { urgencylevel: "desc" },
                    ],
                    take: 25,
                })
                : [];

            return res.status(200).json({
                success: true,
                donorBloodGroup: donor.bloodgroup,
                compatibleGroups: targetGroups,
                total: requests.length,
                requests: requests.map((r) => {
                    const sanitized = sanitizeRequestForDonor(r, false);
                    delete (sanitized as any).latitude;
                    delete (sanitized as any).longitude;
                    return sanitized;
                }),
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
                    hospitals: { select: { hospitalid: true, hospitalname: true, city: true, state: true } },
                    bloodbanks: { select: { bloodbankid: true, bloodbankname: true, city: true, state: true } },
                    bloodrequests: { select: { requestid: true, patientname: true, bloodgroup: true, bloodcomponent: true, unitsrequired: true } },
                },
                orderBy: { donationdate: "desc" },
            });

            const totalUnits = history.reduce((sum, h) => sum + (h.unitsdonated || 1), 0);

            const formattedHistory = history.map((h) => ({
                ...h,
                isImported: h.isimported ?? false,
                verificationStatus: h.verificationstatus ?? (h.isimported ? "PENDING" : "VERIFIED"),
                bloodComponent: h.bloodcomponent || h.bloodrequests?.bloodcomponent || "WHOLE_BLOOD",
                sourceHospital: h.hospitals?.hospitalname || (h.isimported ? "Historical Import" : null),
                sourceRecordId: h.sourcerecordid,
            }));

            return res.status(200).json({
                success: true,
                stats: {
                    totalDonations: history.length,
                    totalUnitsDonated: totalUnits,
                    estimatedLivesSaved: totalUnits * 3,
                },
                total: history.length,
                history: formattedHistory,
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
                        hospitals: { select: { hospitalid: true, hospitalname: true, city: true, state: true } },
                        bloodbanks: { select: { bloodbankid: true, bloodbankname: true, city: true, state: true } },
                        bloodrequests: { select: { requestid: true, patientname: true, bloodgroup: true, bloodcomponent: true, unitsrequired: true } },
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
 * GET ALL DONORS (Admin Only)
 * GET /donors
 */
router.get("/", authenticate, authorize("ADMIN"), async (_req: Request, res: Response) => {
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
 * GET DONOR BY ID (Owner or Admin Only)
 * GET /donors/:donorId
 */
router.get(
    "/:donorId",
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
                const currentUser = (req as any).user;
                if (currentUser?.role !== "ADMIN") {
                    return res.status(403).json({
                        success: false,
                        message: "Only administrators or clinical processes can modify donor eligibility",
                    });
                }
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
 * GET DONOR CAMP REGISTRATIONS
 * GET /donors/me/camp-registrations
 */
router.get(
    "/me/camp-registrations",
    authenticate,
    authorize("DONOR"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const registrations = await CampService.getDonorRegistrations(user.userid);
            return res.status(200).json({ success: true, data: registrations });
        } catch (error: any) {
            console.error("Error fetching donor camp registrations:", error);
            const status = error.message.includes("required") ? 404 : 500;
            return res.status(status).json({ success: false, message: error.message || "Failed to fetch camp registrations" });
        }
    }
);

/*
 * GET DONOR NOTIFICATION PREFERENCES
 * GET /donors/me/notification-preferences
 */
router.get(
    "/me/notification-preferences",
    authenticate,
    authorize("DONOR"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const prefs = await CampNotificationService.getDonorPreferences(user.userid);
            return res.status(200).json({ success: true, data: prefs });
        } catch (error: any) {
            console.error("Error fetching donor notification preferences:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch notification preferences",
            });
        }
    }
);

/*
 * UPDATE DONOR NOTIFICATION PREFERENCES
 * PUT /donors/me/notification-preferences
 */
router.put(
    "/me/notification-preferences",
    authenticate,
    authorize("DONOR"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const updated = await CampNotificationService.updateDonorPreferences(user.userid, req.body || {});
            return res.status(200).json({
                success: true,
                data: updated,
                message: "Notification preferences updated successfully",
            });
        } catch (error: any) {
            console.error("Error updating donor notification preferences:", error);
            const status = error.message.includes("required") ? 404 : 400;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to update notification preferences",
            });
        }
    }
);

/*
 * CANCEL DONOR CAMP REGISTRATION
 * POST /donors/me/camp-registrations/:id/cancel and PATCH /donors/me/camp-registrations/:id/cancel
 */
const handleCancelCampRegistration = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const reason = req.body?.reason;
        const cancelled = await CampService.cancelDonorRegistration(user.userid, String(req.params.id), reason);
        return res.status(200).json({ success: true, data: cancelled, message: "Camp registration cancelled successfully" });
    } catch (error: any) {
        console.error("Error cancelling donor camp registration:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to cancel camp registration" });
    }
};

router.patch(
    "/me/camp-registrations/:id/cancel",
    authenticate,
    authorize("DONOR"),
    handleCancelCampRegistration
);

router.post(
    "/me/camp-registrations/:id/cancel",
    authenticate,
    authorize("DONOR"),
    handleCancelCampRegistration
);

/*
 * DELETE DONOR PROFILE BY ID
 * DELETE /donors/:donorId
 */
router.delete(
    "/:donorId",
    authenticate,
    authorize("ADMIN"),
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