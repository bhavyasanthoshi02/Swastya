import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import {
    SmartCampPlannerService,
    CampPlannerHorizon,
} from "../services/smartCampPlanner.service";

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the blood bank ID for the current user and enforces strict tenant isolation.
 */
async function resolveBloodBankId(req: Request): Promise<{ bloodBankId: string } | { error: string; status: number }> {
    const user = (req as any).user;
    if (!user || !user.userid) {
        return { error: "Authentication required", status: 401 };
    }

    const requestedId = (req.params.bloodBankId || req.query.bloodBankId) as string | undefined;

    if (user.role === "BLOOD_BANK") {
        const bb = await prisma.bloodbanks.findUnique({
            where: { userid: user.userid },
            select: { bloodbankid: true },
        });

        if (!bb) {
            return { error: "Blood bank profile not found for this user account", status: 404 };
        }

        if (requestedId && requestedId !== "me" && requestedId !== bb.bloodbankid) {
            return { error: "Access denied: cannot access camp planner intelligence for another facility", status: 403 };
        }

        return { bloodBankId: bb.bloodbankid };
    }

    if (user.role === "ADMIN") {
        if (requestedId && requestedId !== "me") {
            if (!UUID_REGEX.test(requestedId)) {
                return { error: "Invalid bloodBankId UUID format", status: 400 };
            }
            return { bloodBankId: requestedId };
        }

        const bb = await prisma.bloodbanks.findFirst({
            select: { bloodbankid: true },
        });
        if (!bb) {
            return { error: "No blood bank facilities found in the system", status: 404 };
        }
        return { bloodBankId: bb.bloodbankid };
    }

    return { error: "Unauthorized access: Blood Bank or Admin credentials required", status: 403 };
}

// Middleware: Authenticate & Authorize BLOOD_BANK or ADMIN
router.use(authenticate);
router.use(authorize("BLOOD_BANK", "ADMIN"));

/**
 * GET /bloodbanks/me/camp-planner
 * Complete unified Smart Camp Planner intelligence payload
 */
router.get("/", async (req: Request, res: Response) => {
    try {
        const resolution = await resolveBloodBankId(req);
        if ("error" in resolution) {
            return res.status(resolution.status).json({ success: false, message: resolution.error });
        }

        const horizonQuery = req.query.horizon || req.query.period;
        let horizonDays: CampPlannerHorizon = 14;
        if (horizonQuery === "7") horizonDays = 7;
        if (horizonQuery === "30") horizonDays = 30;

        const data = await SmartCampPlannerService.getPlannerIntelligence({
            bloodBankId: resolution.bloodBankId,
            horizonDays,
        });

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error: any) {
        console.error("Error generating camp planner intelligence:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate camp planner intelligence",
        });
    }
});

/**
 * GET /bloodbanks/me/camp-planner/overview
 */
router.get("/overview", async (req: Request, res: Response) => {
    try {
        const resolution = await resolveBloodBankId(req);
        if ("error" in resolution) {
            return res.status(resolution.status).json({ success: false, message: resolution.error });
        }

        const data = await SmartCampPlannerService.getPlannerIntelligence({
            bloodBankId: resolution.bloodBankId,
        });

        return res.status(200).json({
            success: true,
            data: data.overview,
        });
    } catch (error: any) {
        console.error("Error fetching camp planner overview:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch camp planner overview",
        });
    }
});

/**
 * GET /bloodbanks/me/camp-planner/locations
 */
router.get("/locations", async (req: Request, res: Response) => {
    try {
        const resolution = await resolveBloodBankId(req);
        if ("error" in resolution) {
            return res.status(resolution.status).json({ success: false, message: resolution.error });
        }

        const horizonQuery = req.query.horizon;
        let horizonDays: CampPlannerHorizon = 14;
        if (horizonQuery === "7") horizonDays = 7;
        if (horizonQuery === "30") horizonDays = 30;

        const data = await SmartCampPlannerService.getPlannerIntelligence({
            bloodBankId: resolution.bloodBankId,
            horizonDays,
        });

        return res.status(200).json({
            success: true,
            data: data.locations,
        });
    } catch (error: any) {
        console.error("Error fetching location recommendations:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch location recommendations",
        });
    }
});

/**
 * GET /bloodbanks/me/camp-planner/dates
 */
router.get("/dates", async (req: Request, res: Response) => {
    try {
        const resolution = await resolveBloodBankId(req);
        if ("error" in resolution) {
            return res.status(resolution.status).json({ success: false, message: resolution.error });
        }

        const data = await SmartCampPlannerService.getPlannerIntelligence({
            bloodBankId: resolution.bloodBankId,
        });

        return res.status(200).json({
            success: true,
            data: data.dates,
        });
    } catch (error: any) {
        console.error("Error fetching date recommendations:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch date recommendations",
        });
    }
});

/**
 * GET /bloodbanks/me/camp-planner/insights
 */
router.get("/insights", async (req: Request, res: Response) => {
    try {
        const resolution = await resolveBloodBankId(req);
        if ("error" in resolution) {
            return res.status(resolution.status).json({ success: false, message: resolution.error });
        }

        const data = await SmartCampPlannerService.getPlannerIntelligence({
            bloodBankId: resolution.bloodBankId,
        });

        return res.status(200).json({
            success: true,
            data: data.insights,
        });
    } catch (error: any) {
        console.error("Error fetching camp planner insights:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch camp planner insights",
        });
    }
});

export default router;
