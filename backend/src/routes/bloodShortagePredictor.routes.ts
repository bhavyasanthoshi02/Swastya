import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import {
    BloodShortagePredictorService,
    ForecastPeriod,
} from "../services/bloodShortagePredictor.service";

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the blood bank ID for the current user and enforces tenant isolation.
 */
async function resolveBloodBankId(req: Request): Promise<{ bloodBankId: string } | { error: string; status: number }> {
    const user = (req as any).user;
    if (!user || !user.userid) {
        return { error: "Authentication required", status: 401 };
    }

    // Explicit path param or query param if provided
    const requestedId = (req.params.bloodBankId || req.query.bloodBankId) as string | undefined;

    if (user.role === "BLOOD_BANK") {
        const bb = await prisma.bloodbanks.findUnique({
            where: { userid: user.userid },
            select: { bloodbankid: true, approvalstatus: true },
        });

        if (!bb) {
            return { error: "Blood bank profile not found for this user account", status: 404 };
        }

        // If a specific ID was passed, verify it matches the user's blood bank ID
        if (requestedId && requestedId !== "me" && requestedId !== bb.bloodbankid) {
            return { error: "Access denied: cannot access predictive analytics for another facility", status: 403 };
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

        // If admin didn't specify an ID, check if they own a bloodbank or pick the first one
        const bb = await prisma.bloodbanks.findFirst({
            select: { bloodbankid: true },
        });
        if (!bb) {
            return { error: "No blood bank facilities found in the system", status: 404 };
        }
        return { bloodBankId: bb.bloodbankid };
    }

    return { error: "Insufficient permissions to access blood shortage predictive analytics", status: 403 };
}

function parsePeriod(val: any): ForecastPeriod {
    const parsed = parseInt(String(val), 10);
    if (parsed === 14) return 14;
    if (parsed === 30) return 30;
    return 7;
}

function parseComponent(val: any): string {
    const c = String(val || "").toUpperCase().trim();
    if (["WHOLE_BLOOD", "RBC", "PLATELETS", "PLASMA"].includes(c)) {
        return c;
    }
    return "ALL";
}

/**
 * GET /
 * Complete shortage predictions payload
 */
router.get("/", authenticate, authorize("BLOOD_BANK", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const resolved = await resolveBloodBankId(req);
        if ("error" in resolved) {
            return res.status(resolved.status).json({ success: false, message: resolved.error });
        }

        const period = parsePeriod(req.query.period);
        const component = parseComponent(req.query.component);

        const data = await BloodShortagePredictorService.calculatePredictions({
            bloodBankId: resolved.bloodBankId,
            forecastDays: period,
            component,
        });

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error: any) {
        console.error("[BloodShortagePredictor] Error generating predictions:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate blood shortage predictions",
            error: error?.message,
        });
    }
});

/**
 * GET /overview
 * Overview KPI metrics only
 */
router.get("/overview", authenticate, authorize("BLOOD_BANK", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const resolved = await resolveBloodBankId(req);
        if ("error" in resolved) {
            return res.status(resolved.status).json({ success: false, message: resolved.error });
        }

        const period = parsePeriod(req.query.period);
        const component = parseComponent(req.query.component);

        const data = await BloodShortagePredictorService.calculatePredictions({
            bloodBankId: resolved.bloodBankId,
            forecastDays: period,
            component,
        });

        return res.status(200).json({
            success: true,
            data: data.overview,
        });
    } catch (error: any) {
        console.error("[BloodShortagePredictor] Error generating overview:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate overview metrics",
            error: error?.message,
        });
    }
});

/**
 * GET /shortages
 * Blood group-wise shortage breakdown
 */
router.get("/shortages", authenticate, authorize("BLOOD_BANK", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const resolved = await resolveBloodBankId(req);
        if ("error" in resolved) {
            return res.status(resolved.status).json({ success: false, message: resolved.error });
        }

        const period = parsePeriod(req.query.period);
        const component = parseComponent(req.query.component);

        const data = await BloodShortagePredictorService.calculatePredictions({
            bloodBankId: resolved.bloodBankId,
            forecastDays: period,
            component,
        });

        return res.status(200).json({
            success: true,
            data: {
                forecastPeriodDays: data.overview.forecastPeriodDays,
                selectedComponent: data.overview.selectedComponent,
                predictions: data.predictions,
            },
        });
    } catch (error: any) {
        console.error("[BloodShortagePredictor] Error generating shortages:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate blood group shortages",
            error: error?.message,
        });
    }
});

/**
 * GET /trends
 * Trend timeline for demand vs balance
 */
router.get("/trends", authenticate, authorize("BLOOD_BANK", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const resolved = await resolveBloodBankId(req);
        if ("error" in resolved) {
            return res.status(resolved.status).json({ success: false, message: resolved.error });
        }

        const period = parsePeriod(req.query.period);
        const component = parseComponent(req.query.component);

        const data = await BloodShortagePredictorService.calculatePredictions({
            bloodBankId: resolved.bloodBankId,
            forecastDays: period,
            component,
        });

        return res.status(200).json({
            success: true,
            data: {
                forecastPeriodDays: data.overview.forecastPeriodDays,
                trends: data.trends,
            },
        });
    } catch (error: any) {
        console.error("[BloodShortagePredictor] Error generating trends:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate prediction trends",
            error: error?.message,
        });
    }
});

/**
 * GET /insights
 * AI insights & actionable operational recommendations
 */
router.get("/insights", authenticate, authorize("BLOOD_BANK", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const resolved = await resolveBloodBankId(req);
        if ("error" in resolved) {
            return res.status(resolved.status).json({ success: false, message: resolved.error });
        }

        const period = parsePeriod(req.query.period);
        const component = parseComponent(req.query.component);

        const data = await BloodShortagePredictorService.calculatePredictions({
            bloodBankId: resolved.bloodBankId,
            forecastDays: period,
            component,
        });

        return res.status(200).json({
            success: true,
            data: {
                forecastPeriodDays: data.overview.forecastPeriodDays,
                insights: data.insights,
                recommendations: data.recommendations,
            },
        });
    } catch (error: any) {
        console.error("[BloodShortagePredictor] Error generating insights:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to generate AI insights and recommendations",
            error: error?.message,
        });
    }
});

export default router;
