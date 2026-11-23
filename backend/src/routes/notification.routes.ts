import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

/**
 * AUD-12: Sanitizes notification payloads to enforce patient privacy.
 * Patient-identifying information is NEVER exposed before the request/delivery
 * reaches an explicit ACCEPTED state.
 * Even after ACCEPTED, only explicitly permitted fields (patientname, bloodgroup, urgencylevel, status)
 * are exposed; patientcontact, registration identifiers, and prescription URLs remain hidden.
 */
export function sanitizeNotificationForResponse(n: any, callerUserId?: string) {
    const title = n.title || "";

    // Explicitly accepted notification titles
    const isAcceptedTitle = title === "Your Donation Offer Was Accepted" ||
                            title === "Blood Receipt Confirmed" ||
                            title === "Donation Completed";

    // Titles representing pre-acceptance states (broadcasts, pending reviews, offers, search expansion)
    const isPreAcceptanceTitle = title.includes("EMERGENCY:") ||
                                 title.includes("Broadcast") ||
                                 title.includes("Requisition Received") ||
                                 title.includes("Volunteer Response Confirmed") ||
                                 title.includes("Volunteer Donor Matched") ||
                                 title.includes("Donor Volunteered") ||
                                 title.includes("Radius") ||
                                 title.includes("Expired") ||
                                 title.includes("Prescription") ||
                                 title.includes("Not Selected") ||
                                 title.includes("Pending");

    const reqStatus = n.bloodrequests?.status;
    const isAcceptedRequestStatus = reqStatus === "ACCEPTED" ||
                                   reqStatus === "BLOOD_ARRANGED" ||
                                   reqStatus === "FULFILLED";

    const isAccepted = (isAcceptedTitle || isAcceptedRequestStatus) && !isPreAcceptanceTitle;

    let cleanMessage = (n.message || "").replace(/<!--META:[\s\S]*?-->/g, "").trim();

    if (!isAccepted) {
        // Redact any patient name references from pre-acceptance or unaccepted notification messages
        cleanMessage = cleanMessage
            .replace(/\bfor patient\s+[^,()]+(?=\s*[(,]|\s+has|\s+was|\s+at|\s+by|\.|$)/gi, "")
            .replace(/\bpatient\s+[^,()]+(?=\s*[(,]|\s+has|\s+was|\s+at|\s+by|\.|$)/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();
    }

    // Always strip URLs and sensitive contacts from notification messages to prevent leaks
    cleanMessage = cleanMessage.replace(/https?:\/\/[^\s]+/gi, "[REDACTED_URL]");

    let sanitizedRequest = undefined;
    if (n.bloodrequests) {
        sanitizedRequest = {
            requestid: n.bloodrequests.requestid,
            bloodgroup: n.bloodrequests.bloodgroup,
            urgencylevel: n.bloodrequests.urgencylevel,
            status: n.bloodrequests.status,
            // patientname is ONLY included when explicitly in an ACCEPTED state
            patientname: isAccepted ? (n.bloodrequests.patientname || null) : null,
        };
    }

    let sanitizedCamp = undefined;
    if (n.camp) {
        sanitizedCamp = {
            campid: n.camp.campid,
            campname: n.camp.campname,
            campdate: n.camp.campdate,
            starttime: typeof n.camp.starttime === "string" ? n.camp.starttime : (n.camp.starttime instanceof Date ? n.camp.starttime.toTimeString().slice(0, 5) : String(n.camp.starttime || "")),
            endtime: typeof n.camp.endtime === "string" ? n.camp.endtime : (n.camp.endtime instanceof Date ? n.camp.endtime.toTimeString().slice(0, 5) : String(n.camp.endtime || "")),
            venuename: n.camp.venuename,
            city: n.camp.city,
            status: n.camp.status,
        };
    }

    const { bloodrequests, camp, ...rest } = n;

    return {
        ...rest,
        message: cleanMessage,
        createdat: n.sentat,
        ...(sanitizedRequest ? { bloodrequests: sanitizedRequest } : {}),
        ...(sanitizedCamp ? { camp: sanitizedCamp } : {}),
    };
}

/*
 * GET NOTIFICATIONS
 * GET /notifications
 * Query params: unreadOnly (boolean), limit (number), page (number)
 */
router.get("/", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const unreadOnly = req.query.unreadOnly === "true";
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
        const skip = (page - 1) * limit;

        const whereClause: any = {
            userid: user.userid,
        };

        if (unreadOnly) {
            whereClause.isread = false;
        }

        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: whereClause,
                orderBy: {
                    sentat: "desc",
                },
                skip,
                take: limit,
                include: {
                    bloodrequests: {
                        select: {
                            requestid: true,
                            patientname: true,
                            bloodgroup: true,
                            urgencylevel: true,
                            status: true,
                        },
                    },
                    camp: {
                        select: {
                            campid: true,
                            campname: true,
                            campdate: true,
                            starttime: true,
                            endtime: true,
                            venuename: true,
                            city: true,
                            status: true,
                        },
                    },
                },
            }),
            prisma.notification.count({ where: whereClause }),
            prisma.notification.count({
                where: {
                    userid: user.userid,
                    isread: false,
                },
            }),
        ]);

        return res.status(200).json({
            success: true,
            total,
            unreadCount,
            page,
            limit,
            notifications: notifications.map((n) => sanitizeNotificationForResponse(n, user.userid)),
        });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch notifications",
        });
    }
});

/*
 * MARK NOTIFICATION AS READ
 * PATCH /notifications/:id/read
 */
router.patch("/:id/read", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const notificationId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!notificationId || !UUID_REGEX.test(notificationId)) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        const notification = await prisma.notification.findUnique({
            where: {
                notificationid: notificationId,
            },
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        if (notification.userid !== user.userid && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        const updated = await prisma.notification.update({
            where: {
                notificationid: notificationId,
            },
            data: {
                isread: true,
                readat: new Date(),
            },
        });

        return res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification: sanitizeNotificationForResponse(updated, user.userid),
        });
    } catch (error) {
        console.error("Error updating notification:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update notification",
        });
    }
});

/*
 * MARK ALL NOTIFICATIONS AS READ
 * PATCH /notifications/mark-all-read
 */
router.patch("/mark-all-read", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const result = await prisma.notification.updateMany({
            where: {
                userid: user.userid,
                isread: false,
            },
            data: {
                isread: true,
                readat: new Date(),
            },
        });

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read",
            updatedCount: result.count,
        });
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to mark all notifications as read",
        });
    }
});

/*
 * DELETE NOTIFICATION
 * DELETE /notifications/:id
 */
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const notificationId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!notificationId || !UUID_REGEX.test(notificationId)) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        const notification = await prisma.notification.findUnique({
            where: {
                notificationid: notificationId,
            },
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        if (notification.userid !== user.userid && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        await prisma.notification.delete({
            where: {
                notificationid: notificationId,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting notification:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete notification",
        });
    }
});

export default router;
