import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { CampService } from "../services/camp.service";

const router = Router();

/**
 * GET /camps/discover and GET /camps
 * Public / Donor camp discovery. Excludes all donor personal info.
 */
const handleDiscover = async (req: Request, res: Response) => {
    try {
        const { city, district, state, search, dateFrom, dateTo, latitude, longitude, radiusKm, page, limit } = req.query;

        const filters: any = {};
        if (city && typeof city === "string") filters.city = city;
        if (district && typeof district === "string") filters.district = district;
        if (state && typeof state === "string") filters.state = state;
        if (search && typeof search === "string") filters.search = search;
        if (dateFrom && typeof dateFrom === "string") filters.dateFrom = dateFrom;
        if (dateTo && typeof dateTo === "string") filters.dateTo = dateTo;
        if (latitude !== undefined && longitude !== undefined) {
            const lat = Number(latitude);
            const lng = Number(longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
                filters.latitude = lat;
                filters.longitude = lng;
            }
        }
        if (radiusKm) filters.radiusKm = Number(radiusKm);
        if (page) filters.page = Number(page);
        if (limit) filters.limit = Number(limit);

        const result = await CampService.discoverCamps(filters);
        return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        console.error("Error discovering camps:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to discover blood camps" });
    }
};

router.get("/discover", handleDiscover);
router.get("/", handleDiscover);

/**
 * GET /camps/:id/public and GET /camps/:id
 * Public camp details view. Excludes donor PII.
 */
const handleGetPublic = async (req: Request, res: Response) => {
    try {
        const camp = await CampService.getPublicCampById(String(req.params.id));
        return res.status(200).json({ success: true, data: camp });
    } catch (error: any) {
        console.error("Error fetching public camp:", error);
        const status = error.message.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message || "Failed to fetch camp details" });
    }
};

router.get("/:id/public", handleGetPublic);
router.get("/:id", handleGetPublic);

/**
 * POST /camps/:id/register
 * Donor self-registration with capacity checks and concurrency locks
 */
router.post("/:id/register", authenticate, authorize("DONOR"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const registration = await CampService.registerDonorForCamp(String(req.params.id), user.userid);
        return res.status(201).json({
            success: true,
            data: registration,
            message: "Registration for blood donation camp confirmed successfully",
        });
    } catch (error: any) {
        console.error("Error registering donor for camp:", error);
        const status = error.message.includes("not found") ? 404 : error.message.includes("capacity") ? 409 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to register for camp" });
    }
});

export default router;
