import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { CampService } from "../services/camp.service";
import { camp_status, camp_registration_availability, camp_attendance_status, camp_registration_status } from "../generated/prisma/enums";

const router = Router();

// Middleware: Authenticate & Authorize BLOOD_BANK or ADMIN
router.use(authenticate);
router.use(authorize("BLOOD_BANK", "ADMIN"));

/**
 * Resolves the authenticated user's blood bank ID
 */
async function resolveBloodBankId(req: Request): Promise<string | null> {
    const user = (req as any).user;
    if (!user) return null;

    if (user.role === "ADMIN" && req.query.bloodBankId && typeof req.query.bloodBankId === "string") {
        return req.query.bloodBankId;
    }

    const bloodBank = await prisma.bloodbanks.findUnique({
        where: { userid: user.userid },
        select: { bloodbankid: true },
    });

    return bloodBank ? bloodBank.bloodbankid : null;
}

/**
 * GET /bloodbanks/me/camps/summary
 * Dashboard overview metrics for blood donation camps
 */
router.get("/summary", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const summary = await CampService.getCampSummary(bloodBankId);
        return res.status(200).json({ success: true, data: summary });
    } catch (error: any) {
        console.error("Error fetching camp summary:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to fetch camp summary" });
    }
});

/**
 * GET /bloodbanks/me/camps
 * List camps belonging to this blood bank with search, status, and date filters
 */
router.get("/", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const { status, registrationstatus, city, district, state, search, fromDate, toDate, page, limit } = req.query;

        const filters: any = {};
        if (status && Object.values(camp_status).includes(status as camp_status)) {
            filters.status = status as camp_status;
        }
        if (registrationstatus && Object.values(camp_registration_availability).includes(registrationstatus as camp_registration_availability)) {
            filters.registrationstatus = registrationstatus as camp_registration_availability;
        }
        if (city && typeof city === "string") filters.city = city;
        if (district && typeof district === "string") filters.district = district;
        if (state && typeof state === "string") filters.state = state;
        if (search && typeof search === "string") filters.search = search;
        if (fromDate) {
            const p = new Date(fromDate as string);
            if (!isNaN(p.getTime())) filters.fromDate = p;
        }
        if (toDate) {
            const p = new Date(toDate as string);
            if (!isNaN(p.getTime())) filters.toDate = p;
        }
        if (page) filters.page = Number(page);
        if (limit) filters.limit = Number(limit);

        const result = await CampService.listCamps(bloodBankId, filters);
        return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        console.error("Error listing camps:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to list camps" });
    }
});

/**
 * POST /bloodbanks/me/camps
 * Create a new blood donation camp
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const camp = await CampService.createCamp(bloodBankId, user.userid, req.body);
        return res.status(201).json({ success: true, data: camp, message: "Blood donation camp created successfully" });
    } catch (error: any) {
        console.error("Error creating camp:", error);
        return res.status(400).json({ success: false, message: error.message || "Failed to create blood donation camp" });
    }
});

/**
 * GET /bloodbanks/me/camps/:id
 * Retrieve details of a specific camp belonging to this blood bank
 */
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const camp = await CampService.getCampById(String(req.params.id), bloodBankId);
        return res.status(200).json({ success: true, data: camp });
    } catch (error: any) {
        console.error("Error fetching camp details:", error);
        const status = error.message.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message || "Failed to retrieve camp details" });
    }
});

/**
 * PUT /bloodbanks/me/camps/:id
 * Edit camp details
 */
router.put("/:id", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const updated = await CampService.updateCamp(String(req.params.id), bloodBankId, user.userid, req.body);
        return res.status(200).json({ success: true, data: updated, message: "Camp updated successfully" });
    } catch (error: any) {
        console.error("Error updating camp:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to update camp" });
    }
});

/**
 * PATCH /bloodbanks/me/camps/:id/publish
 * Publish a DRAFT camp
 */
router.patch("/:id/publish", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const updated = await CampService.publishCamp(String(req.params.id), bloodBankId, user.userid);
        return res.status(200).json({ success: true, data: updated, message: "Camp published successfully" });
    } catch (error: any) {
        console.error("Error publishing camp:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to publish camp" });
    }
});

/**
 * PATCH /bloodbanks/me/camps/:id/registration-status
 * Toggle registration status (OPEN / CLOSED) independently of camp lifecycle
 */
router.patch("/:id/registration-status", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const { status: regStatus, reason } = req.body;
        if (!regStatus || !Object.values(camp_registration_availability).includes(regStatus)) {
            return res.status(400).json({ success: false, message: "Valid registration status ('OPEN' or 'CLOSED') is required" });
        }

        const updated = await CampService.toggleRegistrationStatus(String(req.params.id), bloodBankId, user.userid, regStatus, reason);
        return res.status(200).json({ success: true, data: updated, message: `Registration status updated to ${regStatus}` });
    } catch (error: any) {
        console.error("Error toggling registration status:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to update registration status" });
    }
});

/**
 * PATCH /bloodbanks/me/camps/:id/complete
 * Mark camp as COMPLETED
 */
router.patch("/:id/complete", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const notes = req.body?.notes;
        const updated = await CampService.completeCamp(String(req.params.id), bloodBankId, user.userid, notes);
        return res.status(200).json({ success: true, data: updated, message: "Camp marked as COMPLETED" });
    } catch (error: any) {
        console.error("Error completing camp:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to complete camp" });
    }
});

/**
 * PATCH /bloodbanks/me/camps/:id/cancel
 * Cancel camp with mandatory reason and notify registered donors
 */
router.patch("/:id/cancel", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const reason = req.body?.reason;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: "A cancellation reason is mandatory" });
        }

        const updated = await CampService.cancelCamp(String(req.params.id), bloodBankId, user.userid, reason);
        return res.status(200).json({ success: true, data: updated, message: "Camp cancelled and notifications dispatched" });
    } catch (error: any) {
        console.error("Error cancelling camp:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to cancel camp" });
    }
});

/**
 * GET /bloodbanks/me/camps/:id/registrations
 * Retrieve registrations for a camp
 */
router.get("/:id/registrations", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const { status, attendance, search, page, limit } = req.query;
        const filters: any = {};
        if (status && Object.values(camp_registration_status).includes(status as camp_registration_status)) {
            filters.status = status as camp_registration_status;
        }
        if (attendance && Object.values(camp_attendance_status).includes(attendance as camp_attendance_status)) {
            filters.attendance = attendance as camp_attendance_status;
        }
        if (search && typeof search === "string") filters.search = search;
        if (page) filters.page = Number(page);
        if (limit) filters.limit = Number(limit);

        const result = await CampService.listCampRegistrations(String(req.params.id), bloodBankId, filters);
        return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        console.error("Error listing registrations:", error);
        const status = error.message.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message || "Failed to list camp registrations" });
    }
});

/**
 * PATCH /bloodbanks/me/camps/:id/registrations/:regId/attendance
 * Update donor attendance and optional units donated
 */
router.patch("/:id/registrations/:regId/attendance", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const { attendancestatus, unitsdonated, attendancenotes } = req.body;
        if (!attendancestatus || !Object.values(camp_attendance_status).includes(attendancestatus)) {
            return res.status(400).json({ success: false, message: "Valid attendance status ('ATTENDED' or 'NOT_ATTENDED') is required" });
        }

        const updated = await CampService.updateAttendance(
            String(req.params.id),
            bloodBankId,
            user.userid,
            String(req.params.regId),
            { attendancestatus, unitsdonated, attendancenotes }
        );

        return res.status(200).json({ success: true, data: updated, message: "Attendance updated successfully" });
    } catch (error: any) {
        console.error("Error updating attendance:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to update attendance" });
    }
});

/**
 * PATCH /bloodbanks/me/camps/:id/registrations/:regId/cancel
 * Organizer cancels a registration
 */
router.patch("/:id/registrations/:regId/cancel", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(404).json({ success: false, message: "Blood bank facility profile not found" });
        }

        const user = (req as any).user;
        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: "Cancellation reason is required" });
        }

        const updated = await CampService.cancelRegistrationByOrganizer(
            String(req.params.id),
            bloodBankId,
            user.userid,
            String(req.params.regId),
            reason
        );

        return res.status(200).json({ success: true, data: updated, message: "Registration cancelled successfully" });
    } catch (error: any) {
        console.error("Error cancelling registration:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Failed to cancel registration" });
    }
});

export default router;
