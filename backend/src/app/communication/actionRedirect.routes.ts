/**
 * Swastya: Action Token Redirection Gateway
 * Validates, authenticates, and routes users from SMS action links (/r/:token).
 */

import { Router, Request, Response } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { ActionTokenService } from "../../services/sms/actionToken.service";

const router = Router();

/**
 * GET /action-redirect/:token
 * Public resolution endpoint: inspects token validity without consuming it.
 * Used by frontend gateway to check destination and determine if login is needed.
 */
router.get("/:token", async (req: Request, res: Response) => {
    try {
        const token = (Array.isArray(req.params.token) ? req.params.token[0] : req.params.token) as string;
        if (!token || typeof token !== "string" || token.length < 16) {
            return res.status(404).json({
                success: false,
                code: "INVALID_TOKEN",
                message: "This SMS link is invalid or malformed.",
            });
        }

        const peeked = await ActionTokenService.peekToken(token);
        if (!peeked) {
            return res.status(404).json({
                success: false,
                code: "NOT_FOUND",
                message: "This SMS link was not found or has been revoked.",
            });
        }

        if (new Date() > peeked.expiresAt) {
            return res.status(410).json({
                success: false,
                code: "EXPIRED",
                message: "This SMS link has expired for security reasons. Please request an updated notification.",
                expiresAt: peeked.expiresAt,
            });
        }

        if (peeked.usedAt !== null) {
            return res.status(409).json({
                success: false,
                code: "ALREADY_USED",
                message: "This SMS action link has already been used and cannot be reused.",
                usedAt: peeked.usedAt,
            });
        }

        return res.status(200).json({
            success: true,
            valid: true,
            purpose: peeked.purpose,
            targetId: peeked.targetId,
            redirectUrl: peeked.redirectUrl,
            intendedUserId: peeked.userId,
            expiresAt: peeked.expiresAt,
            requiresAuth: true,
        });
    } catch (err: any) {
        console.error("[ActionRedirect] Resolution error:", err);
        return res.status(500).json({
            success: false,
            code: "SERVER_ERROR",
            message: "Failed to resolve SMS action link.",
        });
    }
});

/**
 * POST /action-redirect/:token/consume
 * Authenticated consumption endpoint: verifies intended user identity, consumes token,
 * and returns verified destination URL.
 */
router.post("/:token/consume", authenticate, async (req: Request, res: Response) => {
    try {
        const token = (Array.isArray(req.params.token) ? req.params.token[0] : req.params.token) as string;
        const authUser = (req as any).user;

        if (!token) {
            return res.status(400).json({
                success: false,
                code: "INVALID_TOKEN",
                message: "Token is required.",
            });
        }

        const peeked = await ActionTokenService.peekToken(token);
        if (!peeked) {
            return res.status(404).json({
                success: false,
                code: "NOT_FOUND",
                message: "This SMS link is invalid or was revoked.",
            });
        }

        // Verify that current authenticated user matches intended token user
        if (peeked.userId !== authUser.userid && authUser.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                code: "USER_MISMATCH",
                message: "This action link was issued to a different user account. Please sign in with the recipient account.",
            });
        }

        // Consume token atomically
        const validation = await ActionTokenService.validateAndConsumeToken(token, {
            expectedUserId: authUser.role === "ADMIN" ? undefined : authUser.userid,
            consume: true,
        });

        if (!validation.valid) {
            if (validation.reason === "EXPIRED") {
                return res.status(410).json({
                    success: false,
                    code: "EXPIRED",
                    message: "This SMS link has expired.",
                });
            }
            if (validation.reason === "ALREADY_USED") {
                return res.status(409).json({
                    success: false,
                    code: "ALREADY_USED",
                    message: "This link has already been used.",
                });
            }
            return res.status(400).json({
                success: false,
                code: validation.reason || "INVALID",
                message: "Unable to authorize action token.",
            });
        }

        return res.status(200).json({
            success: true,
            redirectUrl: validation.token?.redirectUrl || "/",
            purpose: validation.token?.purpose,
        });
    } catch (err: any) {
        console.error("[ActionRedirect] Consumption error:", err);
        return res.status(500).json({
            success: false,
            code: "SERVER_ERROR",
            message: "Failed to authorize and consume action link.",
        });
    }
});

export default router;
