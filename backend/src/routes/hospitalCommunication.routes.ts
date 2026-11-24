import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import {
    HospitalCommunicationService,
    HospitalBloodBankCommunicationService,
} from "../services/peerCommunication.service";

const router = Router();

// Enforce authentication and HOSPITAL role restriction
router.use(authenticate);
router.use(authorize("HOSPITAL"));

/**
 * GET /hospitals/me/messages/bloodbanks
 * List approved blood banks for hospital cross-communication
 */
router.get("/bloodbanks", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const bloodBanks = await HospitalBloodBankCommunicationService.listBloodBanksForHospital(userId);
        return res.status(200).json({
            success: true,
            data: bloodBanks,
        });
    } catch (err: any) {
        console.error("[HospitalCommunication] Error listing blood banks for hospital:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to list blood banks",
        });
    }
});

/**
 * GET /hospitals/me/messages/bloodbanks/:bloodbankId
 * Get conversation history between hospital and blood bank
 */
router.get("/bloodbanks/:bloodbankId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const bloodbankId = String(req.params.bloodbankId);
        const conversation = await HospitalBloodBankCommunicationService.getHospitalConversation(userId, bloodbankId);
        return res.status(200).json({
            success: true,
            data: conversation,
        });
    } catch (err: any) {
        console.error("[HospitalCommunication] Error fetching blood bank conversation:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to fetch blood bank conversation",
        });
    }
});

/**
 * POST /hospitals/me/messages/bloodbanks/:bloodbankId
 * Send in-app message from hospital to blood bank
 */
router.post("/bloodbanks/:bloodbankId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const bloodbankId = String(req.params.bloodbankId);
        const { content } = req.body;

        const message = await HospitalBloodBankCommunicationService.sendHospitalMessage(userId, bloodbankId, content);
        return res.status(201).json({
            success: true,
            data: message,
            message: "Message sent successfully",
        });
    } catch (err: any) {
        console.error("[HospitalCommunication] Error sending message to blood bank:", err);
        const status = err.message.includes("not exist") || err.message.includes("not found")
            ? 404
            : err.message.includes("empty") || err.message.includes("exceeds")
            ? 400
            : 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to send message to blood bank",
        });
    }
});

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
