import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { SurgeryPlannerService } from "../services/surgeryPlanner.service";
import { surgery_status, blood_component } from "../generated/prisma/enums";

const router = Router();

// Middleware: Authenticate & Authorize HOSPITAL or ADMIN
router.use(authenticate);
router.use(authorize("HOSPITAL", "ADMIN"));

/**
 * Helper to resolve hospital ID from authenticated user.
 * Supports ADMIN passing query param ?hospitalId=<uuid> if needed.
 */
async function resolveHospitalId(req: Request): Promise<string | null> {
    const user = (req as any).user;
    if (!user) return null;

    if (user.role === "ADMIN" && req.query.hospitalId && typeof req.query.hospitalId === "string") {
        return req.query.hospitalId;
    }

    const hospital = await prisma.hospitals.findUnique({
        where: { userid: user.userid },
        select: { hospitalid: true },
    });

    return hospital ? hospital.hospitalid : null;
}

/**
 * GET /hospitals/me/surgeries/configs
 * List procedure guidelines and MSBOS configurations visible to this hospital
 */
router.get("/configs", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const configs = await SurgeryPlannerService.getProcedureConfigs(hospitalId);
        return res.status(200).json({ success: true, data: configs });
    } catch (error: any) {
        console.error("Error fetching procedure configs:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to fetch procedure configs" });
    }
});

/**
 * POST /hospitals/me/surgeries/configs
 * Create/override hospital-specific procedure configuration
 */
router.post("/configs", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const config = await SurgeryPlannerService.saveProcedureConfig(hospitalId, req.body);
        return res.status(201).json({ success: true, data: config, message: "Procedure configuration saved successfully" });
    } catch (error: any) {
        console.error("Error saving procedure config:", error);
        return res.status(400).json({ success: false, message: error.message || "Failed to save procedure config" });
    }
});

/**
 * GET /hospitals/me/surgeries/estimate
 * Get clinical requirement estimate for a procedure
 */
router.get("/estimate", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const procedureName = req.query.procedureName as string;
        if (!procedureName) {
            return res.status(400).json({ success: false, message: "Procedure name is required" });
        }

        const estimate = await SurgeryPlannerService.estimateRequirements(procedureName, hospitalId);
        return res.status(200).json({ success: true, data: estimate });
    } catch (error: any) {
        console.error("Error getting estimate:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to calculate estimate" });
    }
});

/**
 * GET /hospitals/me/surgeries/summary
 * Summary metrics for the hospital surgery blood planner dashboard
 */
router.get("/summary", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const summary = await SurgeryPlannerService.getSurgeryPlanSummary(hospitalId);
        return res.status(200).json({ success: true, data: summary });
    } catch (error: any) {
        console.error("Error getting surgery planner summary:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to fetch summary" });
    }
});

/**
 * GET /hospitals/me/surgeries
 * List surgery plans with optional filters
 */
router.get("/", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const { status, fromDate, toDate, search } = req.query;

        const filters: any = {};
        if (status && Object.values(surgery_status).includes(status as surgery_status)) {
            filters.status = status as surgery_status;
        }
        if (fromDate) {
            const parsed = new Date(fromDate as string);
            if (!isNaN(parsed.getTime())) filters.fromDate = parsed;
        }
        if (toDate) {
            const parsed = new Date(toDate as string);
            if (!isNaN(parsed.getTime())) filters.toDate = parsed;
        }
        if (search && typeof search === "string") {
            filters.search = search;
        }

        const plans = await SurgeryPlannerService.listSurgeryPlans(hospitalId, filters);
        return res.status(200).json({ success: true, data: plans });
    } catch (error: any) {
        console.error("Error listing surgery plans:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to list surgery plans" });
    }
});

/**
 * POST /hospitals/me/surgeries
 * Schedule / plan a new surgery with baseline blood requirement
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const user = (req as any).user;
        const plan = await SurgeryPlannerService.createSurgeryPlan(hospitalId, user.userid, req.body);
        return res.status(201).json({ success: true, data: plan, message: "Surgery plan created successfully" });
    } catch (error: any) {
        console.error("Error creating surgery plan:", error);
        return res.status(400).json({ success: false, message: error.message || "Failed to create surgery plan" });
    }
});

/**
 * GET /hospitals/me/surgeries/:id
 * Retrieve details of a surgery plan
 */
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const surgeryId = String(req.params.id);
        const surgery = await SurgeryPlannerService.getSurgeryPlanById(surgeryId, hospitalId);
        return res.status(200).json({ success: true, data: surgery });
    } catch (error: any) {
        console.error("Error fetching surgery plan:", error);
        const status = error.message.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message || "Failed to fetch surgery plan" });
    }
});

/**
 * PUT /hospitals/me/surgeries/:id/review
 * Clinical signoff and requirement approval by authorized medical personnel
 */
router.put("/:id/review", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const user = (req as any).user;
        const surgeryId = String(req.params.id);
        const updated = await SurgeryPlannerService.reviewAndApprovePlan(
            surgeryId,
            hospitalId,
            { userid: user.userid, role: user.role, name: user.name || "Clinician" },
            req.body
        );

        return res.status(200).json({
            success: true,
            data: updated,
            message: "Clinical review and requirement approval completed successfully",
        });
    } catch (error: any) {
        console.error("Error in clinical review:", error);
        const status = error.message.includes("Unauthorized") ? 403 : error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to complete clinical review" });
    }
});

/**
 * POST /hospitals/me/surgeries/:id/check-availability
 * Perform live inventory compatibility and availability check across blood banks
 */
router.post("/:id/check-availability", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const surgeryId = String(req.params.id);
        const result = await SurgeryPlannerService.checkAvailability(surgeryId, hospitalId);
        return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        console.error("Error checking availability:", error);
        const status = error.message.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message || "Failed to check inventory availability" });
    }
});

/**
 * POST /hospitals/me/surgeries/:id/create-request
 * Secure requisition handoff: create linked blood request for shortage
 */
router.post("/:id/create-request", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const user = (req as any).user;
        const surgeryId = String(req.params.id);
        const result = await SurgeryPlannerService.createRequisitionForShortage(surgeryId, hospitalId, user.userid);
        return res.status(201).json(result);
    } catch (error: any) {
        console.error("Error creating requisition for shortage:", error);
        return res.status(400).json({ success: false, message: error.message || "Failed to create blood requisition" });
    }
});

/**
 * POST /hospitals/me/surgeries/:id/confirm-readiness
 * Preparation confirmation to transition surgery to READY_FOR_SURGERY
 */
router.post("/:id/confirm-readiness", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const user = (req as any).user;
        const surgeryId = String(req.params.id);
        const notes = req.body?.notes || "Pre-operative preparation verified and ready.";
        const result = await SurgeryPlannerService.confirmSurgeryReadiness(surgeryId, hospitalId, user.userid, notes);
        return res.status(200).json({ success: true, data: result, message: "Surgery readiness confirmed successfully" });
    } catch (error: any) {
        console.error("Error confirming surgery readiness:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to confirm surgery readiness" });
    }
});

/**
 * POST /hospitals/me/surgeries/:id/cancel
 * Non-destructive cancellation with reason
 */
router.post("/:id/cancel", async (req: Request, res: Response) => {
    try {
        const hospitalId = await resolveHospitalId(req);
        if (!hospitalId) {
            return res.status(404).json({ success: false, message: "Hospital profile not found" });
        }

        const user = (req as any).user;
        const reason = req.body?.reason || "Cancelled by hospital staff";
        const surgeryId = String(req.params.id);
        const result = await SurgeryPlannerService.cancelSurgeryPlan(surgeryId, hospitalId, user.userid, reason);
        return res.status(200).json({ success: true, data: result, message: "Surgery plan cancelled successfully" });
    } catch (error: any) {
        console.error("Error cancelling surgery plan:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to cancel surgery plan" });
    }
});

export default router;
