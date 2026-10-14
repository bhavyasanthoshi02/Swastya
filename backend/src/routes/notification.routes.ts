import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

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
            notifications,
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
            notification: updated,
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
