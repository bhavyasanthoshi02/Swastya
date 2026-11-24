import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { HospitalCommunicationService } from "../services/peerCommunication.service";

const router = Router();

// Enforce authentication and HOSPITAL role restriction
router.use(authenticate);
router.use(authorize("HOSPITAL"));

/**
 * GET /hospitals/me/messages/peers
 * List all other registered approved hospitals for in-app messaging
 */
router.get("/peers", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const peers = await HospitalCommunicationService.listPeerHospitals(userId);
        return res.status(200).json({
            success: true,
            data: peers,
        });
    } catch (err: any) {
        console.error("[HospitalCommunication] Error listing peer hospitals:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to list peer hospitals",
        });
    }
});

/**
 * GET /hospitals/me/messages/:hospitalId
 * Get conversation history with specific peer hospital
 */
router.get("/:hospitalId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const hospitalId = String(req.params.hospitalId);
        const conversation = await HospitalCommunicationService.getConversation(userId, hospitalId);
        return res.status(200).json({
            success: true,
            data: conversation,
        });
    } catch (err: any) {
        console.error("[HospitalCommunication] Error fetching conversation:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to fetch conversation",
        });
    }
});

/**
 * POST /hospitals/me/messages/:hospitalId
 * Send in-app message to specific peer hospital
 * (Strictly in-app only, NO SMS)
 */
router.post("/:hospitalId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const hospitalId = String(req.params.hospitalId);
        const { content } = req.body;

        const message = await HospitalCommunicationService.sendMessage(userId, hospitalId, content);
        return res.status(201).json({
            success: true,
            data: message,
            message: "Message sent successfully",
        });
    } catch (err: any) {
        console.error("[HospitalCommunication] Error sending message:", err);
        const status = err.message.includes("not exist")
            ? 404
            : err.message.includes("own hospital") || err.message.includes("empty") || err.message.includes("exceeds")
            ? 400
            : 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to send message",
        });
    }
});

/**
 * PATCH /hospitals/me/messages/:hospitalId/read
 * Mark incoming messages from specific hospital as read
 */
router.patch("/:hospitalId/read", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const hospitalId = String(req.params.hospitalId);
        const result = await HospitalCommunicationService.markAsRead(userId, hospitalId);
        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err: any) {
        console.error("[HospitalCommunication] Error marking messages read:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to mark messages read",
        });
    }
});

export default router;
