import { Router, Request, Response } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/role.middleware";
import {
    BloodBankCommunicationService,
    HospitalBloodBankCommunicationService,
} from "../../services/peerCommunication.service";

const router = Router();

// Enforce authentication and BLOOD_BANK role restriction
router.use(authenticate);
router.use(authorize("BLOOD_BANK"));

/**
 * GET /bloodbanks/me/messages/hospitals
 * List approved hospitals for blood bank cross-communication
 */
router.get("/hospitals", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const hospitals = await HospitalBloodBankCommunicationService.listHospitalsForBloodBank(userId);
        return res.status(200).json({
            success: true,
            data: hospitals,
        });
    } catch (err: any) {
        console.error("[BloodBankCommunication] Error listing hospitals for blood bank:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to list hospitals",
        });
    }
});

/**
 * GET /bloodbanks/me/messages/hospitals/:hospitalId
 * Get conversation history between blood bank and hospital
 */
router.get("/hospitals/:hospitalId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const hospitalId = String(req.params.hospitalId);
        const conversation = await HospitalBloodBankCommunicationService.getBloodBankConversation(userId, hospitalId);
        return res.status(200).json({
            success: true,
            data: conversation,
        });
    } catch (err: any) {
        console.error("[BloodBankCommunication] Error fetching hospital conversation:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to fetch hospital conversation",
        });
    }
});

/**
 * POST /bloodbanks/me/messages/hospitals/:hospitalId
 * Send in-app message from blood bank to hospital
 */
router.post("/hospitals/:hospitalId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const hospitalId = String(req.params.hospitalId);
        const { content } = req.body;

        const message = await HospitalBloodBankCommunicationService.sendBloodBankMessage(userId, hospitalId, content);
        return res.status(201).json({
            success: true,
            data: message,
            message: "Message sent successfully",
        });
    } catch (err: any) {
        console.error("[BloodBankCommunication] Error sending message to hospital:", err);
        const status = err.message.includes("not exist") || err.message.includes("not found")
            ? 404
            : err.message.includes("empty") || err.message.includes("exceeds")
            ? 400
            : 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to send message to hospital",
        });
    }
});

/**
 * GET /bloodbanks/me/messages/peers
 * List all other registered approved blood banks for in-app messaging
 */
router.get("/peers", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const peers = await BloodBankCommunicationService.listPeerBloodBanks(userId);
        return res.status(200).json({
            success: true,
            data: peers,
        });
    } catch (err: any) {
        console.error("[BloodBankCommunication] Error listing peer blood banks:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to list peer blood banks",
        });
    }
});

/**
 * GET /bloodbanks/me/messages/:bloodBankId
 * Get conversation history with specific peer blood bank
 */
router.get("/:bloodBankId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const bloodBankId = String(req.params.bloodBankId);
        const conversation = await BloodBankCommunicationService.getConversation(userId, bloodBankId);
        return res.status(200).json({
            success: true,
            data: conversation,
        });
    } catch (err: any) {
        console.error("[BloodBankCommunication] Error fetching conversation:", err);
        return res.status(err.message.includes("not found") ? 404 : 500).json({
            success: false,
            message: err.message || "Failed to fetch conversation",
        });
    }
});

/**
 * POST /bloodbanks/me/messages/:bloodBankId
 * Send in-app message to specific peer blood bank
 * (Strictly in-app only, NO SMS)
 */
router.post("/:bloodBankId", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const bloodBankId = String(req.params.bloodBankId);
        const { content } = req.body;

        const message = await BloodBankCommunicationService.sendMessage(userId, bloodBankId, content);
        return res.status(201).json({
            success: true,
            data: message,
            message: "Message sent successfully",
        });
    } catch (err: any) {
        console.error("[BloodBankCommunication] Error sending message:", err);
        const status = err.message.includes("not exist")
            ? 404
            : err.message.includes("own blood bank") || err.message.includes("empty") || err.message.includes("exceeds")
            ? 400
            : 500;
        return res.status(status).json({
            success: false,
            message: err.message || "Failed to send message",
        });
    }
});

/**
 * PATCH /bloodbanks/me/messages/:bloodBankId/read
 * Mark incoming messages from specific blood bank as read
 */
router.patch("/:bloodBankId/read", async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userid;
        const bloodBankId = String(req.params.bloodBankId);
        const result = await BloodBankCommunicationService.markAsRead(userId, bloodBankId);
        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err: any) {
        console.error("[BloodBankCommunication] Error marking messages read:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Failed to mark messages read",
        });
    }
});

export default router;
