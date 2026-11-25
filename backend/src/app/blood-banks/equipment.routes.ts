import path from "path";
import fs from "fs";
import { Router, Request, Response } from "express";
import multer from "multer";
import { prisma } from "../../config/prisma";
import { authenticate } from "../../middleware/auth.middleware";
import { authorize } from "../../middleware/role.middleware";
import { requireApprovedBloodBank } from "../../middleware/ownership.middleware";
import { EquipmentService } from "../../services/equipment.service";
import { getEquipmentDocumentStorageDir } from "../../utils/fileValidation";
import {
    equipment_operational_status,
    equipment_calibration_status,
    equipment_maintenance_status,
    calibration_result,
    maintenance_type,
    maintenance_record_status,
    breakdown_severity,
} from "../../generated/prisma/enums";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

async function resolveBloodBankId(req: Request): Promise<string | null> {
    const user = (req as any).user;
    if (!user) return null;

    if ((req as any).bloodBank?.bloodbankid) {
        return (req as any).bloodBank.bloodbankid;
    }

    if (user.role === "BLOOD_BANK") {
        const bb = await prisma.bloodbanks.findUnique({
            where: { userid: user.userid },
            select: { bloodbankid: true },
        });
        return bb?.bloodbankid || null;
    }

    if (user.role === "ADMIN") {
        const queryId = (req.query.bloodBankId as string) || (req.headers["x-bloodbank-id"] as string);
        if (queryId) return queryId;
        const bb = await prisma.bloodbanks.findFirst({ select: { bloodbankid: true } });
        return bb?.bloodbankid || null;
    }

    return null;
}

// All equipment routes require authentication and BLOOD_BANK or ADMIN role
router.use(authenticate);
router.use(authorize("BLOOD_BANK", "ADMIN"));
router.use(requireApprovedBloodBank);

/**
 * GET /equipment/categories
 * Returns configurable equipment categories.
 */
router.get("/categories", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const categories = await EquipmentService.getCategories(bloodBankId);
        return res.json({ success: true, categories });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message || "Failed to load categories" });
    }
});

/**
 * GET /equipment/dashboard
 * Aggregated KPI metrics, overdue/due soon alerts, active breakdowns.
 */
router.get("/dashboard", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const metrics = await EquipmentService.getDashboardMetrics(bloodBankId);
        return res.json({ success: true, metrics });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message || "Failed to load dashboard metrics" });
    }
});

/**
 * GET /equipment/reports
 * Compliance and audit reporting summary.
 */
router.get("/reports", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const report = await EquipmentService.generateReport(bloodBankId);
        return res.json({ success: true, report });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message || "Failed to generate report" });
    }
});

/**
 * GET /equipment
 * Filterable equipment list.
 */
router.get("/", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }

        const {
            category,
            operationalStatus,
            calibrationStatus,
            maintenanceStatus,
            search,
            page,
            limit,
        } = req.query;

        const result = await EquipmentService.getEquipmentList(bloodBankId, {
            category: category as string,
            operationalStatus: operationalStatus as equipment_operational_status,
            calibrationStatus: calibrationStatus as equipment_calibration_status,
            maintenanceStatus: maintenanceStatus as equipment_maintenance_status,
            search: search as string,
            page: page ? parseInt(page as string, 10) : undefined,
            limit: limit ? parseInt(limit as string, 10) : undefined,
        });

        return res.json({ success: true, ...result });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message || "Failed to fetch equipment list" });
    }
});

/**
 * POST /equipment
 * Register new equipment.
 */
router.post("/", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;

        const {
            assetNumber,
            equipmentName,
            category,
            manufacturer,
            modelNumber,
            serialNumber,
            installationDate,
            warrantyExpiryDate,
            location,
            department,
            responsiblePerson,
            operationalStatus,
            isCalibrationRequired,
            calibrationIntervalDays,
            lastCalibrationDate,
            nextCalibrationDate,
            isMaintenanceRequired,
            maintenanceIntervalDays,
            lastMaintenanceDate,
            nextMaintenanceDate,
            notes,
        } = req.body;

        if (!assetNumber || !assetNumber.trim()) {
            return res.status(400).json({ success: false, message: "Asset ID/Number is required" });
        }
        if (!equipmentName || !equipmentName.trim()) {
            return res.status(400).json({ success: false, message: "Equipment Name is required" });
        }
        if (!category || !category.trim()) {
            return res.status(400).json({ success: false, message: "Category is required" });
        }

        const equipment = await EquipmentService.createEquipment(bloodBankId, user.userid, {
            assetNumber,
            equipmentName,
            category,
            manufacturer,
            modelNumber,
            serialNumber,
            installationDate,
            warrantyExpiryDate,
            location,
            department,
            responsiblePerson,
            operationalStatus,
            isCalibrationRequired: isCalibrationRequired !== undefined ? Boolean(isCalibrationRequired) : true,
            calibrationIntervalDays: calibrationIntervalDays ? parseInt(calibrationIntervalDays, 10) : undefined,
            lastCalibrationDate,
            nextCalibrationDate,
            isMaintenanceRequired: isMaintenanceRequired !== undefined ? Boolean(isMaintenanceRequired) : true,
            maintenanceIntervalDays: maintenanceIntervalDays ? parseInt(maintenanceIntervalDays, 10) : undefined,
            lastMaintenanceDate,
            nextMaintenanceDate,
            notes,
        });

        return res.status(201).json({ success: true, equipment });
    } catch (err: any) {
        const status = err.message?.includes("already exists") ? 409 : 400;
        return res.status(status).json({ success: false, message: err.message || "Failed to create equipment" });
    }
});

/**
 * GET /equipment/:id
 * Full equipment detail with timeline.
 */
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }

        const equipment = await EquipmentService.getEquipmentById(bloodBankId, req.params.id as string);
        return res.json({ success: true, equipment });
    } catch (err: any) {
        const status = err.message?.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: err.message || "Failed to load equipment details" });
    }
});

/**
 * PUT /equipment/:id
 * Update equipment record metadata.
 */
router.put("/:id", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;

        const updated = await EquipmentService.updateEquipment(
            bloodBankId,
            req.params.id as string,
            user.userid,
            req.body
        );

        return res.json({ success: true, equipment: updated });
    } catch (err: any) {
        const status = err.message?.includes("already in use") ? 409 : 400;
        return res.status(status).json({ success: false, message: err.message || "Failed to update equipment" });
    }
});

/**
 * PATCH /equipment/:id/status
 * Change operational status with immutable audit trail.
 */
router.patch("/:id/status", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;
        const { operationalStatus, reason } = req.body;

        if (!operationalStatus) {
            return res.status(400).json({ success: false, message: "New operationalStatus is required" });
        }
        if (!reason || reason.trim().length < 5) {
            return res.status(400).json({
                success: false,
                message: "A meaningful reason (minimum 5 characters) is required for operational status changes",
            });
        }

        const result = await EquipmentService.updateOperationalStatus(
            bloodBankId,
            req.params.id as string,
            user.userid,
            operationalStatus,
            reason
        );

        return res.json({
            success: true,
            equipment: result.equipment,
            clinicalAdvisory: result.clinicalAdvisory,
        });
    } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message || "Failed to change operational status" });
    }
});

/**
 * POST /equipment/:id/calibrations
 * Log calibration event with optional certificate upload.
 */
router.post("/:id/calibrations", upload.single("certificate"), async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;

        const {
            scheduledDate,
            performedDate,
            nextDueDate,
            performedBy,
            serviceProvider,
            result,
            standardsUsed,
            readings,
            remarks,
            requiresVerification,
        } = req.body;

        if (!performedDate) {
            return res.status(400).json({ success: false, message: "Performed Date is required" });
        }
        if (!performedBy || !performedBy.trim()) {
            return res.status(400).json({ success: false, message: "Performed By (technician/service) is required" });
        }
        if (!result) {
            return res.status(400).json({ success: false, message: "Calibration result is required (PASSED, FAILED, PASSED_WITH_CONDITIONS)" });
        }

        const file = req.file
            ? {
                  buffer: req.file.buffer,
                  originalname: req.file.originalname,
                  mimetype: req.file.mimetype,
              }
            : undefined;

        const logged = await EquipmentService.logCalibration(
            bloodBankId,
            req.params.id as string,
            user.userid,
            {
                scheduledDate,
                performedDate,
                nextDueDate,
                performedBy,
                serviceProvider,
                result: result as calibration_result,
                standardsUsed,
                readings,
                remarks,
                requiresVerification: requiresVerification === "true" || requiresVerification === true,
            },
            file
        );

        return res.status(201).json({
            success: true,
            calibration: logged.calibration,
            clinicalAdvisory: logged.clinicalAdvisory,
        });
    } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message || "Failed to log calibration" });
    }
});

/**
 * PATCH /equipment/:id/calibrations/:calId/verify
 * Reviewer sign-off on calibration.
 */
router.patch("/:id/calibrations/:calId/verify", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;
        const { decision, remarks } = req.body;

        if (!decision || (decision !== "VERIFIED" && decision !== "REJECTED")) {
            return res.status(400).json({ success: false, message: "Decision must be 'VERIFIED' or 'REJECTED'" });
        }

        const verified = await EquipmentService.verifyCalibration(
            bloodBankId,
            req.params.id as string,
            req.params.calId as string,
            user.userid,
            decision,
            remarks
        );

        return res.json({ success: true, calibration: verified });
    } catch (err: any) {
        const isAuthError = err.message?.includes("Independent verification required") || err.message?.includes("unauthorized");
        const status = isAuthError ? 403 : 400;
        return res.status(status).json({ success: false, message: err.message || "Failed to verify calibration" });
    }
});

/**
 * POST /equipment/:id/maintenance
 * Schedule or record maintenance activity.
 */
router.post("/:id/maintenance", upload.single("report"), async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;

        const {
            maintenanceType,
            status,
            scheduledDate,
            completedDate,
            assignedTo,
            serviceProvider,
            workDetails,
            partsReplaced,
            downtimeHours,
            cost,
        } = req.body;

        if (!maintenanceType) {
            return res.status(400).json({ success: false, message: "Maintenance type is required (PREVENTIVE, CORRECTIVE)" });
        }
        if (!scheduledDate) {
            return res.status(400).json({ success: false, message: "Scheduled date is required" });
        }

        const file = req.file
            ? {
                  buffer: req.file.buffer,
                  originalname: req.file.originalname,
                  mimetype: req.file.mimetype,
              }
            : undefined;

        const maint = await EquipmentService.scheduleMaintenance(
            bloodBankId,
            req.params.id as string,
            user.userid,
            {
                maintenanceType: maintenanceType as maintenance_type,
                status: status as maintenance_record_status,
                scheduledDate,
                completedDate,
                assignedTo,
                serviceProvider,
                workDetails,
                partsReplaced,
                downtimeHours: downtimeHours ? parseFloat(downtimeHours) : undefined,
                cost: cost ? parseFloat(cost) : undefined,
            },
            file
        );

        return res.status(201).json({ success: true, maintenance: maint });
    } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message || "Failed to schedule maintenance" });
    }
});

/**
 * POST /equipment/:id/breakdowns
 * Report an unexpected breakdown.
 */
router.post("/:id/breakdowns", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;

        const {
            issue,
            description,
            severity,
            impactOnStorage,
            sopActionTaken,
        } = req.body;

        if (!issue || !issue.trim()) {
            return res.status(400).json({ success: false, message: "Issue description is required" });
        }

        const result = await EquipmentService.reportBreakdown(
            bloodBankId,
            req.params.id as string,
            user.userid,
            {
                issue,
                description,
                severity: severity as breakdown_severity,
                impactOnStorage: impactOnStorage === true || impactOnStorage === "true",
                sopActionTaken,
            }
        );

        return res.status(201).json({
            success: true,
            breakdown: result.breakdown,
            clinicalAdvisory: result.clinicalAdvisory,
        });
    } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message || "Failed to report breakdown" });
    }
});

/**
 * PATCH /equipment/:id/breakdowns/:breakdownId/resolve
 * Resolve a breakdown incident.
 */
router.patch("/:id/breakdowns/:breakdownId/resolve", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }
        const user = (req as any).user;
        const { resolutionDetails, partsReplaced, downtimeHours, restoreOperational } = req.body;

        if (!resolutionDetails || !resolutionDetails.trim()) {
            return res.status(400).json({ success: false, message: "Resolution details are required" });
        }

        const resolved = await EquipmentService.resolveBreakdown(
            bloodBankId,
            req.params.id as string,
            req.params.breakdownId as string,
            user.userid,
            {
                resolutionDetails,
                partsReplaced,
                downtimeHours: downtimeHours ? parseFloat(downtimeHours) : undefined,
                restoreOperational: restoreOperational !== false && restoreOperational !== "false",
            }
        );

        return res.json({ success: true, breakdown: resolved });
    } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message || "Failed to resolve breakdown" });
    }
});

/**
 * GET /equipment/:id/calibrations/:calId/certificate
 * Download calibration certificate attachment with facility isolation & path traversal validation.
 */
router.get("/:id/calibrations/:calId/certificate", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }

        const cal = await prisma.equipmentcalibrations.findFirst({
            where: {
                calibrationid: req.params.calId as string,
                equipmentid: req.params.id as string,
                bloodbankid: bloodBankId,
            },
        });

        if (!cal || !cal.certificatefilepath) {
            return res.status(404).json({ success: false, message: "Calibration certificate not found or unauthorized access" });
        }

        const storageDir = getEquipmentDocumentStorageDir();
        const resolvedPath = path.resolve(cal.certificatefilepath);

        // Path traversal defense: resolved path must be within dedicated storage directory
        if (!resolvedPath.startsWith(storageDir)) {
            return res.status(403).json({ success: false, message: "Access denied: Invalid file path" });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ success: false, message: "Certificate file missing on storage" });
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `inline; filename="${cal.certificatefilename || path.basename(resolvedPath)}"`);
        const fileStream = fs.createReadStream(resolvedPath);
        return fileStream.pipe(res);
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message || "Failed to download certificate" });
    }
});

/**
 * GET /equipment/:id/maintenance/:maintId/report
 * Download maintenance service report attachment with facility isolation & path traversal validation.
 */
router.get("/:id/maintenance/:maintId/report", async (req: Request, res: Response) => {
    try {
        const bloodBankId = await resolveBloodBankId(req);
        if (!bloodBankId) {
            return res.status(400).json({ success: false, message: "Blood bank facility context required" });
        }

        const maint = await prisma.equipmentmaintenance.findFirst({
            where: {
                maintenanceid: req.params.maintId as string,
                equipmentid: req.params.id as string,
                bloodbankid: bloodBankId,
            },
        });

        if (!maint || !maint.reportfilepath) {
            return res.status(404).json({ success: false, message: "Maintenance report not found or unauthorized access" });
        }

        const storageDir = getEquipmentDocumentStorageDir();
        const resolvedPath = path.resolve(maint.reportfilepath);

        // Path traversal defense: resolved path must be within dedicated storage directory
        if (!resolvedPath.startsWith(storageDir)) {
            return res.status(403).json({ success: false, message: "Access denied: Invalid file path" });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ success: false, message: "Report file missing on storage" });
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `inline; filename="${maint.reportfilename || path.basename(resolvedPath)}"`);
        const fileStream = fs.createReadStream(resolvedPath);
        return fileStream.pipe(res);
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message || "Failed to download report" });
    }
});

export default router;
