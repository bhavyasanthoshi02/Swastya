import { Router, Request, Response } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/role.middleware";
import { requireApprovedHospital } from "../../middleware/ownership.middleware";
import { EmergencyDonorMatchingService } from "../../services/emergencyDonorMatching.service";

const router = Router();

/* =========================================================================
   HOSPITAL MATCHING ENDPOINTS
   ========================================================================= */

/**
 * GET /hospitals/me/emergency-matching/overview
 * Overview statistics and matching KPI cards for hospital.
 */
router.get(
    "/overview",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const overview = await EmergencyDonorMatchingService.getHospitalOverview(user.userid);
            return res.status(200).json({ success: true, overview });
        } catch (error: any) {
            console.error("Error fetching matching overview:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to load matching overview metrics.",
            });
        }
    }
);

/**
 * GET /hospitals/me/emergency-matching/requisitions
 * List active hospital blood requests available for emergency donor matching.
 */
router.get(
    "/requisitions",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const requisitions = await EmergencyDonorMatchingService.getHospitalRequisitions(user.userid);
            return res.status(200).json({ success: true, requisitions });
        } catch (error: any) {
            console.error("Error fetching requisitions for matching:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch requisitions.",
            });
        }
    }
);

/**
 * GET /hospitals/me/emergency-matching/candidates
 * Run intelligent donor matching algorithm for a requisition.
 * Query params: ?requestId=UUID&radiusKm=25
 */
router.get(
    "/candidates",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const requestId = (req.query.requestId as string) || "";
            const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : undefined;

            if (!requestId) {
                return res.status(400).json({
                    success: false,
                    message: "requestId query parameter is required.",
                });
            }

            const result = await EmergencyDonorMatchingService.findMatchingCandidates(
                user.userid,
                requestId,
                { radiusKm }
            );

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error running intelligent donor matching:", error);
            const status = error.message?.includes("Access denied") ? 403 : error.message?.includes("not found") ? 404 : 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to find matching donor candidates.",
            });
        }
    }
);

/**
 * POST /hospitals/me/emergency-matching/notify
 * Dispatch emergency matching notifications to selected candidates.
 * Body: { requestId: string, donorIds: string[], notes?: string }
 */
router.post(
    "/notify",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const { requestId, donorIds, notes } = req.body;

            if (!requestId) {
                return res.status(400).json({
                    success: false,
                    message: "requestId is required.",
                });
            }

            if (!Array.isArray(donorIds) || donorIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "At least one donorId must be selected.",
                });
            }

            const result = await EmergencyDonorMatchingService.notifySelectedDonors(
                user.userid,
                requestId,
                donorIds,
                notes
            );

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error dispatching emergency match notifications:", error);
            const status = error.message?.includes("Access denied") ? 403 : 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to notify selected donors.",
            });
        }
    }
);

/**
 * GET /hospitals/me/emergency-matching/responses
 * Track responses and delivery statuses for a requisition.
 * Query params: ?requestId=UUID
 */
router.get(
    "/responses",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const requestId = (req.query.requestId as string) || "";

            if (!requestId) {
                return res.status(400).json({
                    success: false,
                    message: "requestId query parameter is required.",
                });
            }

            const responses = await EmergencyDonorMatchingService.getRequestResponses(
                user.userid,
                requestId
            );

            return res.status(200).json({ success: true, responses });
        } catch (error: any) {
            console.error("Error tracking donor responses:", error);
            const status = error.message?.includes("Access denied") ? 403 : 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to load donor responses.",
            });
        }
    }
);

/**
 * PATCH /hospitals/me/emergency-matching/deliveries/:deliveryId/transit
 * Update donor transit status.
 * Body: { transitStatus: string, notes?: string }
 */
router.patch(
    "/deliveries/:deliveryId/transit",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const deliveryId = req.params.deliveryId as string;
            const { transitStatus, notes } = req.body;

            if (!transitStatus) {
                return res.status(400).json({
                    success: false,
                    message: "transitStatus is required.",
                });
            }

            const result = await EmergencyDonorMatchingService.updateTransitStatus(
                user.userid,
                deliveryId,
                transitStatus,
                notes
            );

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error updating transit status:", error);
            const status = error.message?.includes("Access denied") ? 403 : 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to update transit status.",
            });
        }
    }
);

/* =========================================================================
   DONOR EMERGENCY REQUEST ENDPOINTS
   ========================================================================= */

const handleGetDonorRequests = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requests = await EmergencyDonorMatchingService.getDonorEmergencyRequests(user.userid);
        return res.status(200).json({ success: true, requests });
    } catch (error: any) {
        console.error("Error fetching donor emergency requests:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch emergency requests.",
        });
    }
};

const handleDonorRespond = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const deliveryId = req.params.deliveryId as string;
        const { response, notes } = req.body;

        if (!response || (response !== "ACCEPTED" && response !== "DECLINED")) {
            return res.status(400).json({
                success: false,
                message: "Response must be either 'ACCEPTED' or 'DECLINED'.",
            });
        }

        const result = await EmergencyDonorMatchingService.respondToEmergencyRequest(
            user.userid,
            deliveryId,
            response,
            notes
        );

        return res.status(200).json(result);
    } catch (error: any) {
        console.error("Error submitting donor response:", error);
        const status = error.message?.includes("Access denied") ? 403 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to submit response.",
        });
    }
};

/**
 * Endpoints for donors to view and respond to incoming emergency matching requests
 */
router.get("/donor/requests", authenticate, authorize("DONOR", "ADMIN"), handleGetDonorRequests);
router.get("/donor-requests", authenticate, authorize("DONOR", "ADMIN"), handleGetDonorRequests);
router.get("/my-requests", authenticate, authorize("DONOR", "ADMIN"), handleGetDonorRequests);
router.post("/donor/requests/:deliveryId/respond", authenticate, authorize("DONOR", "ADMIN"), handleDonorRespond);
router.post("/:deliveryId/respond", authenticate, authorize("DONOR", "ADMIN"), handleDonorRespond);

export default router;
