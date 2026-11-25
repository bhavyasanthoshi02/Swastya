/**
 * Custom SMS Routes
 * Endpoints for permitted recipient selection, custom SMS composition,
 * dispatch tracking, history audit, and safe retry.
 */

import { Router, Request, Response } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { CustomSmsService } from "../../services/sms/customSms.service";
import { prisma } from "../../config/prisma";

const router = Router();

/**
 * GET /custom-sms/recipients
 * Retrieve permitted recipients for the authenticated user based on active operational relationships.
 */
router.get("/recipients", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        // Role-based authorization: Donor and Requester cannot initiate custom SMS
        if (user.role === "DONOR" || user.role === "REQUESTER" || user.role === "PATIENT") {
            return res.status(403).json({
                success: false,
                code: "FORBIDDEN_ROLE",
                message: "Access denied: Donor and Requester accounts do not have custom SMS composition privileges.",
            });
        }

        const recipients = await CustomSmsService.getPermittedRecipients(user.userid, user.role);

        return res.status(200).json({
            success: true,
            count: recipients.length,
            recipients,
        });
    } catch (err: any) {
        console.error("Error retrieving permitted recipients:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve permitted recipients",
        });
    }
});

/**
 * POST /custom-sms/send
 * Compose and dispatch an authorized custom SMS through the transactional outbox.
 */
router.post("/send", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { recipientUserId, message, contextRequestId, actionUrl, idempotencyKey } = req.body;

        if (!recipientUserId) {
            return res.status(400).json({
                success: false,
                message: "recipientUserId is required.",
            });
        }

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Message content cannot be empty.",
            });
        }

        const result = await CustomSmsService.sendCustomSms({
            senderUserId: user.userid,
            senderRole: user.role,
            recipientUserId,
            messageText: message,
            contextRequestId,
            actionUrl,
            idempotencyKey,
        });

        return res.status(201).json({
            success: true,
            message: "Custom SMS queued for delivery.",
            data: result,
        });
    } catch (err: any) {
        if (err?.statusCode) {
            return res.status(err.statusCode).json({
                success: false,
                code: err.code || "REQUEST_FAILED",
                message: err.message,
            });
        }
        console.error("Error sending custom SMS:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to process custom SMS.",
        });
    }
});

/**
 * GET /custom-sms/history
 * Retrieve authorized custom SMS history for the current sender.
 */
router.get("/history", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

        if (user.role === "DONOR" || user.role === "REQUESTER" || user.role === "PATIENT") {
            return res.status(403).json({
                success: false,
                message: "Access denied to SMS history.",
            });
        }

        const history = await CustomSmsService.getSenderHistory(user.userid, user.role, limit);

        return res.status(200).json({
            success: true,
            count: history.length,
            history,
        });
    } catch (err: any) {
        console.error("Error retrieving SMS history:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve SMS history.",
        });
    }
});

/**
 * GET /custom-sms/status/:outboxId
 * Check live status of an enqueued custom SMS.
 */
router.get("/status/:outboxId", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const outboxId = (Array.isArray(req.params.outboxId) ? req.params.outboxId[0] : req.params.outboxId) as string;

        const record = await prisma.smsoutbox.findUnique({
            where: { outboxid: outboxId },
        });

        if (!record) {
            return res.status(404).json({ success: false, message: "Custom SMS not found." });
        }

        const payload = (record.payload as any) || {};
        if (payload.senderUserId !== user.userid && user.role !== "ADMIN") {
            return res.status(403).json({ success: false, message: "Unauthorized to inspect this SMS status." });
        }

        return res.status(200).json({
            success: true,
            outboxId: record.outboxid,
            status: record.status,
            attempts: record.attempts,
            messageSid: record.messagesid,
            dispatchedAt: record.dispatchconfirmedat,
            createdAt: record.createdat,
            errorCode: record.errorcode,
            errorMessage: record.errormessage,
        });
    } catch (err: any) {
        console.error("Error inspecting SMS status:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to check SMS delivery status.",
        });
    }
});

/**
 * POST /custom-sms/retry/:outboxId
 * Retry an eligible failed custom SMS.
 */
router.post("/retry/:outboxId", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const outboxId = (Array.isArray(req.params.outboxId) ? req.params.outboxId[0] : req.params.outboxId) as string;

        const result = await CustomSmsService.retryCustomSms(outboxId, user.userid, user.role);

        return res.status(200).json({
            success: true,
            message: "Custom SMS re-queued for delivery.",
            data: result,
        });
    } catch (err: any) {
        if (err?.statusCode) {
            return res.status(err.statusCode).json({
                success: false,
                message: err.message,
            });
        }
        console.error("Error retrying custom SMS:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to retry custom SMS.",
        });
    }
});

export default router;
