import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import {
    equipment_operational_status,
    equipment_calibration_status,
    equipment_maintenance_status,
    calibration_result,
    calibration_verification_status,
    maintenance_type,
    maintenance_record_status,
    breakdown_severity,
    breakdown_status,
} from "../generated/prisma/enums";
import {
    validateDocumentFile,
    getEquipmentDocumentStorageDir,
} from "../utils/fileValidation";

export interface CreateEquipmentDTO {
    assetNumber: string;
    equipmentName: string;
    category: string;
    manufacturer?: string;
    modelNumber?: string;
    serialNumber?: string;
    installationDate?: string;
    warrantyExpiryDate?: string;
    location?: string;
    department?: string;
    responsiblePerson?: string;
    operationalStatus?: equipment_operational_status;
    isCalibrationRequired?: boolean;
    calibrationIntervalDays?: number;
    lastCalibrationDate?: string;
    nextCalibrationDate?: string;
    isMaintenanceRequired?: boolean;
    maintenanceIntervalDays?: number;
    lastMaintenanceDate?: string;
    nextMaintenanceDate?: string;
    notes?: string;
}

export interface UpdateEquipmentDTO {
    assetNumber?: string;
    equipmentName?: string;
    category?: string;
    manufacturer?: string;
    modelNumber?: string;
    serialNumber?: string;
    installationDate?: string | null;
    warrantyExpiryDate?: string | null;
    location?: string;
    department?: string;
    responsiblePerson?: string;
    isCalibrationRequired?: boolean;
    calibrationIntervalDays?: number | null;
    lastCalibrationDate?: string | null;
    nextCalibrationDate?: string | null;
    isMaintenanceRequired?: boolean;
    maintenanceIntervalDays?: number | null;
    lastMaintenanceDate?: string | null;
    nextMaintenanceDate?: string | null;
    notes?: string;
}

export interface LogCalibrationDTO {
    scheduledDate?: string;
    performedDate: string;
    nextDueDate?: string;
    performedBy: string;
    serviceProvider?: string;
    result: calibration_result;
    standardsUsed?: string;
    readings?: string;
    remarks?: string;
    requiresVerification?: boolean;
}

export interface ScheduleMaintenanceDTO {
    maintenanceType: maintenance_type;
    status?: maintenance_record_status;
    scheduledDate: string;
    completedDate?: string;
    assignedTo?: string;
    serviceProvider?: string;
    workDetails?: string;
    partsReplaced?: string;
    downtimeHours?: number;
    cost?: number;
}

export interface ReportBreakdownDTO {
    issue: string;
    description?: string;
    severity?: breakdown_severity;
    impactOnStorage?: boolean;
    sopActionTaken?: string;
}

export interface ResolveBreakdownDTO {
    resolutionDetails: string;
    partsReplaced?: string;
    downtimeHours?: number;
    restoreOperational?: boolean;
}

export class EquipmentService {
    /**
     * Compute calibration status based on date difference.
     * Default threshold: 30 days window for DUE_SOON (configurable per facility/equipment).
     */
    public static calculateCalibrationStatus(
        isCalibrationRequired: boolean,
        nextCalibrationDate?: Date | null,
        pendingVerification: boolean = false,
        dueSoonWindowDays: number = 30
    ): equipment_calibration_status {
        if (!isCalibrationRequired || !nextCalibrationDate) {
            return equipment_calibration_status.NOT_APPLICABLE;
        }

        if (pendingVerification) {
            return equipment_calibration_status.PENDING_VERIFICATION;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDate = new Date(nextCalibrationDate);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return equipment_calibration_status.OVERDUE;
        } else if (diffDays <= dueSoonWindowDays) {
            return equipment_calibration_status.DUE_SOON;
        }
        return equipment_calibration_status.UP_TO_DATE;
    }

    /**
     * Compute maintenance status based on next maintenance date.
     * Default threshold: 30 days window for DUE_SOON (configurable).
     */
    public static calculateMaintenanceStatus(
        isMaintenanceRequired: boolean,
        nextMaintenanceDate?: Date | null,
        dueSoonWindowDays: number = 30
    ): equipment_maintenance_status {
        if (!isMaintenanceRequired || !nextMaintenanceDate) {
            return equipment_maintenance_status.NOT_APPLICABLE;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDate = new Date(nextMaintenanceDate);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return equipment_maintenance_status.OVERDUE;
        } else if (diffDays <= dueSoonWindowDays) {
            return equipment_maintenance_status.DUE_SOON;
        }
        return equipment_maintenance_status.UP_TO_DATE;
    }

    /**
     * Register a new equipment asset for a blood bank.
     */
    public static async createEquipment(
        bloodBankId: string,
        userId: string,
        dto: CreateEquipmentDTO
    ) {
        // Enforce unique asset number within this blood bank facility
        const existing = await prisma.equipment.findFirst({
            where: {
                bloodbankid: bloodBankId,
                assetnumber: { equals: dto.assetNumber.trim(), mode: "insensitive" },
            },
        });

        if (existing) {
            throw new Error(`An equipment record with Asset ID "${dto.assetNumber}" already exists in this facility.`);
        }

        const isCalRequired = dto.isCalibrationRequired ?? true;
        const calInterval = dto.calibrationIntervalDays ?? (isCalRequired ? 90 : null);
        let lastCalDate = dto.lastCalibrationDate ? new Date(dto.lastCalibrationDate) : null;
        let nextCalDate = dto.nextCalibrationDate ? new Date(dto.nextCalibrationDate) : null;

        if (isCalRequired && !nextCalDate) {
            if (lastCalDate && calInterval) {
                nextCalDate = new Date(lastCalDate);
                nextCalDate.setDate(nextCalDate.getDate() + calInterval);
            } else if (dto.installationDate && calInterval) {
                nextCalDate = new Date(dto.installationDate);
                nextCalDate.setDate(nextCalDate.getDate() + calInterval);
            }
        }

        const calStatus = this.calculateCalibrationStatus(isCalRequired, nextCalDate);

        const isMaintRequired = dto.isMaintenanceRequired ?? true;
        const maintInterval = dto.maintenanceIntervalDays ?? (isMaintRequired ? 90 : null);
        let lastMaintDate = dto.lastMaintenanceDate ? new Date(dto.lastMaintenanceDate) : null;
        let nextMaintDate = dto.nextMaintenanceDate ? new Date(dto.nextMaintenanceDate) : null;

        if (isMaintRequired && !nextMaintDate) {
            if (lastMaintDate && maintInterval) {
                nextMaintDate = new Date(lastMaintDate);
                nextMaintDate.setDate(nextMaintDate.getDate() + maintInterval);
            } else if (dto.installationDate && maintInterval) {
                nextMaintDate = new Date(dto.installationDate);
                nextMaintDate.setDate(nextMaintDate.getDate() + maintInterval);
            }
        }

        const maintStatus = this.calculateMaintenanceStatus(isMaintRequired, nextMaintDate);

        const opStatus = dto.operationalStatus || equipment_operational_status.OPERATIONAL;

        const equipment = await prisma.$transaction(async (tx) => {
            const created = await tx.equipment.create({
                data: {
                    bloodbankid: bloodBankId,
                    assetnumber: dto.assetNumber.trim(),
                    equipmentname: dto.equipmentName.trim(),
                    category: dto.category.trim(),
                    manufacturer: dto.manufacturer?.trim() || null,
                    modelnumber: dto.modelNumber?.trim() || null,
                    serialnumber: dto.serialNumber?.trim() || null,
                    installationdate: dto.installationDate ? new Date(dto.installationDate) : null,
                    warrantyexpirydate: dto.warrantyExpiryDate ? new Date(dto.warrantyExpiryDate) : null,
                    location: dto.location?.trim() || null,
                    department: dto.department?.trim() || null,
                    responsibleperson: dto.responsiblePerson?.trim() || null,
                    operationalstatus: opStatus,
                    iscalibrationrequired: isCalRequired,
                    calibrationintervaldays: calInterval,
                    lastcalibrationdate: lastCalDate,
                    nextcalibrationdate: nextCalDate,
                    calibrationstatus: calStatus,
                    ismaintenancerequired: isMaintRequired,
                    maintenanceintervaldays: maintInterval,
                    lastmaintenancedate: lastMaintDate,
                    nextmaintenancedate: nextMaintDate,
                    maintenancestatus: maintStatus,
                    notes: dto.notes?.trim() || null,
                    createdbyuserid: userId,
                },
            });

            // Initial audit log entry
            await tx.equipmentstatushistory.create({
                data: {
                    equipmentid: created.equipmentid,
                    bloodbankid: bloodBankId,
                    previousstatus: "NEW_REGISTRATION",
                    newstatus: opStatus,
                    reason: "Initial equipment registry entry created",
                    changedbyuserid: userId,
                },
            });

            return created;
        });

        return equipment;
    }

    /**
     * Get paginated & filterable list of equipment for a blood bank.
     */
    public static async getEquipmentList(
        bloodBankId: string,
        params: {
            category?: string;
            operationalStatus?: equipment_operational_status;
            calibrationStatus?: equipment_calibration_status;
            maintenanceStatus?: equipment_maintenance_status;
            search?: string;
            page?: number;
            limit?: number;
        }
    ) {
        const page = Math.max(1, params.page || 1);
        const limit = Math.min(100, Math.max(1, params.limit || 20));
        const skip = (page - 1) * limit;

        const where: any = {
            bloodbankid: bloodBankId,
        };

        if (params.category && params.category !== "ALL") {
            where.category = params.category;
        }

        if (params.operationalStatus) {
            where.operationalstatus = params.operationalStatus;
        }

        if (params.calibrationStatus) {
            where.calibrationstatus = params.calibrationStatus;
        }

        if (params.maintenanceStatus) {
            where.maintenancestatus = params.maintenanceStatus;
        }

        if (params.search && params.search.trim()) {
            const query = params.search.trim();
            where.OR = [
                { assetnumber: { contains: query, mode: "insensitive" } },
                { equipmentname: { contains: query, mode: "insensitive" } },
                { manufacturer: { contains: query, mode: "insensitive" } },
                { modelnumber: { contains: query, mode: "insensitive" } },
                { serialnumber: { contains: query, mode: "insensitive" } },
                { location: { contains: query, mode: "insensitive" } },
            ];
        }

        const [total, items] = await Promise.all([
            prisma.equipment.count({ where }),
            prisma.equipment.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdat: "desc" },
                include: {
                    _count: {
                        select: {
                            calibrations: true,
                            maintenance: true,
                            breakdowns: true,
                        },
                    },
                },
            }),
        ]);

        return {
            items,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get single equipment details with complete timeline.
     */
    public static async getEquipmentById(bloodBankId: string, equipmentId: string) {
        const equipment = await prisma.equipment.findFirst({
            where: {
                equipmentid: equipmentId,
                bloodbankid: bloodBankId,
            },
            include: {
                calibrations: {
                    orderBy: { performeddate: "desc" },
                    include: {
                        createdbyuser: { select: { userid: true, name: true, role: true } },
                        verifiedbyuser: { select: { userid: true, name: true, role: true } },
                    },
                },
                maintenance: {
                    orderBy: { scheduleddate: "desc" },
                    include: {
                        createdbyuser: { select: { userid: true, name: true, role: true } },
                    },
                },
                breakdowns: {
                    orderBy: { reportedat: "desc" },
                    include: {
                        reportedbyuser: { select: { userid: true, name: true, role: true } },
                        resolvedbyuser: { select: { userid: true, name: true, role: true } },
                    },
                },
                statushistory: {
                    orderBy: { createdat: "desc" },
                    include: {
                        changedbyuser: { select: { userid: true, name: true, role: true } },
                    },
                },
                createdbyuser: { select: { userid: true, name: true, role: true } },
            },
        });

        if (!equipment) {
            throw new Error("Equipment record not found or unauthorized access");
        }

        return equipment;
    }

    /**
     * Update equipment metadata.
     */
    public static async updateEquipment(
        bloodBankId: string,
        equipmentId: string,
        userId: string,
        dto: UpdateEquipmentDTO
    ) {
        const existing = await prisma.equipment.findFirst({
            where: { equipmentid: equipmentId, bloodbankid: bloodBankId },
        });

        if (!existing) {
            throw new Error("Equipment record not found");
        }

        if (dto.assetNumber && dto.assetNumber.trim() !== existing.assetnumber) {
            const conflict = await prisma.equipment.findFirst({
                where: {
                    bloodbankid: bloodBankId,
                    assetnumber: { equals: dto.assetNumber.trim(), mode: "insensitive" },
                    equipmentid: { not: equipmentId },
                },
            });
            if (conflict) {
                throw new Error(`Asset ID "${dto.assetNumber}" is already in use by another piece of equipment.`);
            }
        }

        const isCalRequired = dto.isCalibrationRequired ?? existing.iscalibrationrequired;
        const calInterval = dto.calibrationIntervalDays !== undefined ? dto.calibrationIntervalDays : existing.calibrationintervaldays;
        let nextCalDate = dto.nextCalibrationDate !== undefined
            ? (dto.nextCalibrationDate ? new Date(dto.nextCalibrationDate) : null)
            : existing.nextcalibrationdate;

        const calStatus = this.calculateCalibrationStatus(isCalRequired, nextCalDate);

        const isMaintRequired = dto.isMaintenanceRequired ?? existing.ismaintenancerequired;
        const maintInterval = dto.maintenanceIntervalDays !== undefined ? dto.maintenanceIntervalDays : existing.maintenanceintervaldays;
        let nextMaintDate = dto.nextMaintenanceDate !== undefined
            ? (dto.nextMaintenanceDate ? new Date(dto.nextMaintenanceDate) : null)
            : existing.nextmaintenancedate;

        const maintStatus = this.calculateMaintenanceStatus(isMaintRequired, nextMaintDate);

        const updated = await prisma.$transaction(async (tx) => {
            const eq = await tx.equipment.update({
                where: { equipmentid: equipmentId },
                data: {
                    assetnumber: dto.assetNumber ? dto.assetNumber.trim() : undefined,
                    equipmentname: dto.equipmentName ? dto.equipmentName.trim() : undefined,
                    category: dto.category ? dto.category.trim() : undefined,
                    manufacturer: dto.manufacturer !== undefined ? (dto.manufacturer?.trim() || null) : undefined,
                    modelnumber: dto.modelNumber !== undefined ? (dto.modelNumber?.trim() || null) : undefined,
                    serialnumber: dto.serialNumber !== undefined ? (dto.serialNumber?.trim() || null) : undefined,
                    installationdate: dto.installationDate !== undefined ? (dto.installationDate ? new Date(dto.installationDate) : null) : undefined,
                    warrantyexpirydate: dto.warrantyExpiryDate !== undefined ? (dto.warrantyExpiryDate ? new Date(dto.warrantyExpiryDate) : null) : undefined,
                    location: dto.location !== undefined ? (dto.location?.trim() || null) : undefined,
                    department: dto.department !== undefined ? (dto.department?.trim() || null) : undefined,
                    responsibleperson: dto.responsiblePerson !== undefined ? (dto.responsiblePerson?.trim() || null) : undefined,
                    iscalibrationrequired: isCalRequired,
                    calibrationintervaldays: calInterval,
                    nextcalibrationdate: nextCalDate,
                    calibrationstatus: calStatus,
                    ismaintenancerequired: isMaintRequired,
                    maintenanceintervaldays: maintInterval,
                    nextmaintenancedate: nextMaintDate,
                    maintenancestatus: maintStatus,
                    notes: dto.notes !== undefined ? (dto.notes?.trim() || null) : undefined,
                    updatedat: new Date(),
                },
            });

            await tx.equipmentstatushistory.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    previousstatus: existing.operationalstatus,
                    newstatus: existing.operationalstatus,
                    reason: "Equipment metadata and schedule configuration updated.",
                    changedbyuserid: userId,
                },
            });

            return eq;
        });

        return updated;
    }

    /**
     * Change operational status with mandatory reason and immutable audit log.
     */
    public static async updateOperationalStatus(
        bloodBankId: string,
        equipmentId: string,
        userId: string,
        newStatus: equipment_operational_status,
        reason: string
    ) {
        if (!reason || reason.trim().length < 5) {
            throw new Error("A detailed reason (minimum 5 characters) is required to modify operational status.");
        }

        const existing = await prisma.equipment.findFirst({
            where: { equipmentid: equipmentId, bloodbankid: bloodBankId },
        });

        if (!existing) {
            throw new Error("Equipment not found");
        }

        if (existing.operationalstatus === newStatus) {
            return {
                equipment: existing,
                clinicalAdvisory: null,
            };
        }

        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.equipment.update({
                where: { equipmentid: equipmentId },
                data: {
                    operationalstatus: newStatus,
                    updatedat: new Date(),
                },
            });

            await tx.equipmentstatushistory.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    previousstatus: existing.operationalstatus,
                    newstatus: newStatus,
                    reason: reason.trim(),
                    changedbyuserid: userId,
                },
            });

            return updated;
        });

        // Clinical Safety Advisory: If status changed away from OPERATIONAL, issue clinical advisory
        let clinicalAdvisory: string | null = null;
        if (newStatus === equipment_operational_status.UNDER_MAINTENANCE || newStatus === equipment_operational_status.OUT_OF_SERVICE) {
            clinicalAdvisory = `Clinical Advisory: Equipment "${existing.equipmentname}" (${existing.assetnumber}) status transitioned to ${newStatus}. Authorized blood bank personnel must evaluate any stored blood components or active processing batches according to facility Standard Operating Procedures (SOP). Units are not automatically modified.`;
        }

        return {
            equipment: result,
            clinicalAdvisory,
        };
    }

    /**
     * Record a completed or scheduled calibration event, optionally uploading certificate.
     */
    public static async logCalibration(
        bloodBankId: string,
        equipmentId: string,
        userId: string,
        dto: LogCalibrationDTO,
        file?: { buffer: Buffer; originalname: string; mimetype?: string }
    ) {
        const equipment = await prisma.equipment.findFirst({
            where: { equipmentid: equipmentId, bloodbankid: bloodBankId },
        });

        if (!equipment) {
            throw new Error("Equipment not found");
        }

        let certificateFilePath: string | null = null;
        let certificateFileName: string | null = null;

        if (file && file.buffer.length > 0) {
            const validation = validateDocumentFile(file.buffer, file.originalname, file.mimetype);
            if (!validation.valid) {
                throw new Error(validation.error || "Invalid calibration certificate file");
            }

            const storageDir = getEquipmentDocumentStorageDir();
            const safeExtension = validation.detectedExtension || path.extname(file.originalname);
            const randomToken = crypto.randomBytes(16).toString("hex");
            const storedName = `cal_${equipmentId}_${Date.now()}_${randomToken}${safeExtension}`;
            const targetPath = path.join(storageDir, storedName);

            fs.writeFileSync(targetPath, file.buffer);
            certificateFilePath = targetPath;
            certificateFileName = file.originalname;
        }

        const performedDate = new Date(dto.performedDate);
        let nextDueDate: Date | null = null;

        if (dto.nextDueDate) {
            nextDueDate = new Date(dto.nextDueDate);
        } else if (equipment.calibrationintervaldays) {
            nextDueDate = new Date(performedDate);
            nextDueDate.setDate(nextDueDate.getDate() + equipment.calibrationintervaldays);
        }

        // All newly recorded calibrations strictly default to PENDING until authorized independent reviewer sign-off
        const verificationStatus = calibration_verification_status.PENDING;

        const calResult = await prisma.$transaction(async (tx) => {
            const calibration = await tx.equipmentcalibrations.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    scheduleddate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
                    performeddate: performedDate,
                    nextduedate: nextDueDate,
                    performedby: dto.performedBy.trim(),
                    serviceprovider: dto.serviceProvider?.trim() || null,
                    certificatefilepath: certificateFilePath,
                    certificatefilename: certificateFileName,
                    result: dto.result,
                    standardsused: dto.standardsUsed?.trim() || null,
                    readings: dto.readings?.trim() || null,
                    remarks: dto.remarks?.trim() || null,
                    verificationstatus: verificationStatus,
                    verifiedbyuserid: null,
                    verifiedat: null,
                    createdbyuserid: userId,
                },
            });

            // Equipment calibration status enters PENDING_VERIFICATION until independent reviewer sign-off
            await tx.equipment.update({
                where: { equipmentid: equipmentId },
                data: {
                    calibrationstatus: equipment_calibration_status.PENDING_VERIFICATION,
                    updatedat: new Date(),
                },
            });

            // Append audit history
            await tx.equipmentstatushistory.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    previousstatus: equipment.operationalstatus,
                    newstatus: equipment.operationalstatus,
                    reason: `Calibration cycle logged [Result: ${dto.result}] by ${dto.performedBy.trim()}. Status set to PENDING_VERIFICATION.`,
                    changedbyuserid: userId,
                },
            });

            return calibration;
        });

        let clinicalAdvisory: string | null = null;
        if (dto.result === calibration_result.FAILED) {
            clinicalAdvisory = `Clinical Notice: Calibration for "${equipment.equipmentname}" FAILED. In accordance with clinical standards, consider placing this equipment OUT_OF_SERVICE until recalibrated.`;
        }

        return {
            calibration: calResult,
            clinicalAdvisory,
        };
    }

    /**
     * Authorize reviewer to verify or reject a calibration record.
     * Enforces independent review (segregation of duties).
     */
    public static async verifyCalibration(
        bloodBankId: string,
        equipmentId: string,
        calibrationId: string,
        reviewerUserId: string,
        decision: "VERIFIED" | "REJECTED",
        remarks?: string
    ) {
        const cal = await prisma.equipmentcalibrations.findFirst({
            where: {
                calibrationid: calibrationId,
                equipmentid: equipmentId,
                bloodbankid: bloodBankId,
            },
            include: { equipment: true },
        });

        if (!cal) {
            throw new Error("Calibration record not found or unauthorized access");
        }

        // Segregation of Duties: The user who recorded the calibration cannot self-verify
        if (cal.createdbyuserid === reviewerUserId) {
            throw new Error("Independent verification required: the user who recorded the calibration cannot approve their own record.");
        }

        const newVerificationStatus =
            decision === "VERIFIED"
                ? calibration_verification_status.VERIFIED
                : calibration_verification_status.REJECTED;

        const updated = await prisma.$transaction(async (tx) => {
            const rec = await tx.equipmentcalibrations.update({
                where: { calibrationid: calibrationId },
                data: {
                    verificationstatus: newVerificationStatus,
                    verifiedbyuserid: reviewerUserId,
                    verifiedat: new Date(),
                    remarks: remarks ? `${cal.remarks || ""}\n[Reviewer decision (${decision}): ${remarks.trim()}]` : cal.remarks,
                },
            });

            // Re-evaluate equipment status based on reviewer decision
            if (newVerificationStatus === calibration_verification_status.VERIFIED) {
                if (cal.result === calibration_result.PASSED || cal.result === calibration_result.PASSED_WITH_CONDITIONS) {
                    const calStatus = EquipmentService.calculateCalibrationStatus(
                        cal.equipment.iscalibrationrequired,
                        cal.nextduedate,
                        false
                    );
                    await tx.equipment.update({
                        where: { equipmentid: equipmentId },
                        data: {
                            lastcalibrationdate: cal.performeddate,
                            nextcalibrationdate: cal.nextduedate,
                            calibrationstatus: calStatus,
                            updatedat: new Date(),
                        },
                    });
                } else {
                    // Failed calibration verified as failed
                    await tx.equipment.update({
                        where: { equipmentid: equipmentId },
                        data: {
                            lastcalibrationdate: cal.performeddate,
                            calibrationstatus: equipment_calibration_status.OVERDUE,
                            updatedat: new Date(),
                        },
                    });
                }
            } else {
                // Rejected calibration - equipment is NOT marked compliant
                await tx.equipment.update({
                    where: { equipmentid: equipmentId },
                    data: {
                        calibrationstatus: equipment_calibration_status.OVERDUE,
                        updatedat: new Date(),
                    },
                });
            }

            // Append audit history
            await tx.equipmentstatushistory.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    previousstatus: cal.equipment.operationalstatus,
                    newstatus: cal.equipment.operationalstatus,
                    reason: `Calibration verification [${decision}] by Reviewer. ${remarks ? `Remarks: ${remarks.trim()}` : ""}`,
                    changedbyuserid: reviewerUserId,
                },
            });

            return rec;
        });

        return updated;
    }

    /**
     * Schedule or log maintenance activity (Preventive or Corrective).
     */
    public static async scheduleMaintenance(
        bloodBankId: string,
        equipmentId: string,
        userId: string,
        dto: ScheduleMaintenanceDTO,
        file?: { buffer: Buffer; originalname: string; mimetype?: string }
    ) {
        const equipment = await prisma.equipment.findFirst({
            where: { equipmentid: equipmentId, bloodbankid: bloodBankId },
        });

        if (!equipment) {
            throw new Error("Equipment not found");
        }

        let reportFilePath: string | null = null;
        let reportFileName: string | null = null;

        if (file && file.buffer.length > 0) {
            const validation = validateDocumentFile(file.buffer, file.originalname, file.mimetype);
            if (!validation.valid) {
                throw new Error(validation.error || "Invalid maintenance report file");
            }

            const storageDir = getEquipmentDocumentStorageDir();
            const safeExtension = validation.detectedExtension || path.extname(file.originalname);
            const randomToken = crypto.randomBytes(16).toString("hex");
            const storedName = `maint_${equipmentId}_${Date.now()}_${randomToken}${safeExtension}`;
            const targetPath = path.join(storageDir, storedName);

            fs.writeFileSync(targetPath, file.buffer);
            reportFilePath = targetPath;
            reportFileName = file.originalname;
        }

        const scheduledDate = new Date(dto.scheduledDate);
        const completedDate = dto.completedDate ? new Date(dto.completedDate) : null;
        const status = dto.status || (completedDate ? maintenance_record_status.COMPLETED : maintenance_record_status.SCHEDULED);

        const maintRecord = await prisma.$transaction(async (tx) => {
            const rec = await tx.equipmentmaintenance.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    maintenancetype: dto.maintenanceType,
                    status,
                    scheduleddate: scheduledDate,
                    completeddate: completedDate,
                    assignedto: dto.assignedTo?.trim() || null,
                    serviceprovider: dto.serviceProvider?.trim() || null,
                    workdetails: dto.workDetails?.trim() || null,
                    partsreplaced: dto.partsReplaced?.trim() || null,
                    downtimehours: dto.downtimeHours !== undefined ? dto.downtimeHours : null,
                    cost: dto.cost !== undefined ? dto.cost : null,
                    reportfilepath: reportFilePath,
                    reportfilename: reportFileName,
                    createdbyuserid: userId,
                },
            });

            // If completed, update next maintenance date
            if (status === maintenance_record_status.COMPLETED && completedDate) {
                let nextMaintDate: Date | null = null;
                if (equipment.maintenanceintervaldays) {
                    nextMaintDate = new Date(completedDate);
                    nextMaintDate.setDate(nextMaintDate.getDate() + equipment.maintenanceintervaldays);
                }

                const maintStatus = EquipmentService.calculateMaintenanceStatus(
                    equipment.ismaintenancerequired,
                    nextMaintDate
                );

                await tx.equipment.update({
                    where: { equipmentid: equipmentId },
                    data: {
                        lastmaintenancedate: completedDate,
                        nextmaintenancedate: nextMaintDate,
                        maintenancestatus: maintStatus,
                        updatedat: new Date(),
                    },
                });
            }

            // Append audit history
            await tx.equipmentstatushistory.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    previousstatus: equipment.operationalstatus,
                    newstatus: equipment.operationalstatus,
                    reason: `Maintenance event [${dto.maintenanceType} - ${status}] recorded. ${dto.workDetails ? `Work: ${dto.workDetails.trim().substring(0, 100)}` : ""}`,
                    changedbyuserid: userId,
                },
            });

            return rec;
        });

        return maintRecord;
    }

    /**
     * Report an unexpected breakdown (Corrective incident).
     */
    public static async reportBreakdown(
        bloodBankId: string,
        equipmentId: string,
        userId: string,
        dto: ReportBreakdownDTO
    ) {
        const equipment = await prisma.equipment.findFirst({
            where: { equipmentid: equipmentId, bloodbankid: bloodBankId },
        });

        if (!equipment) {
            throw new Error("Equipment not found");
        }

        const severity = dto.severity || breakdown_severity.MAJOR;
        const impactOnStorage = dto.impactOnStorage ?? false;

        const breakdown = await prisma.$transaction(async (tx) => {
            const record = await tx.equipmentbreakdowns.create({
                data: {
                    equipmentid: equipmentId,
                    bloodbankid: bloodBankId,
                    reportedbyuserid: userId,
                    issue: dto.issue.trim(),
                    description: dto.description?.trim() || null,
                    severity,
                    status: breakdown_status.REPORTED,
                    impactonstorage: impactOnStorage,
                    sopactiontaken: dto.sopActionTaken?.trim() || null,
                },
            });

            // If critical severity or impact on storage, automatically flag equipment as UNDER_MAINTENANCE
            if (severity === breakdown_severity.CRITICAL || impactOnStorage) {
                await tx.equipment.update({
                    where: { equipmentid: equipmentId },
                    data: {
                        operationalstatus: equipment_operational_status.UNDER_MAINTENANCE,
                        updatedat: new Date(),
                    },
                });

                await tx.equipmentstatushistory.create({
                    data: {
                        equipmentid: equipmentId,
                        bloodbankid: bloodBankId,
                        previousstatus: equipment.operationalstatus,
                        newstatus: equipment_operational_status.UNDER_MAINTENANCE,
                        reason: `Automated status update due to breakdown report [${severity}]: ${dto.issue.trim()}`,
                        changedbyuserid: userId,
                    },
                });
            } else {
                await tx.equipmentstatushistory.create({
                    data: {
                        equipmentid: equipmentId,
                        bloodbankid: bloodBankId,
                        previousstatus: equipment.operationalstatus,
                        newstatus: equipment.operationalstatus,
                        reason: `Breakdown incident reported [${severity}]: ${dto.issue.trim()}`,
                        changedbyuserid: userId,
                    },
                });
            }

            return record;
        });

        let clinicalAdvisory: string | null = null;
        if (impactOnStorage) {
            clinicalAdvisory = `CRITICAL STORAGE SAFETY ADVISORY: Reported breakdown involves storage-impacting equipment "${equipment.equipmentname}". Immediate contingency transfer of stored units to validated backup storage is required per Standard Operating Procedure. Blood inventory records are preserved and NEVER automatically discarded or mutated.`;
        }

        return {
            breakdown,
            clinicalAdvisory,
        };
    }

    /**
     * Resolve a reported breakdown.
     */
    public static async resolveBreakdown(
        bloodBankId: string,
        equipmentId: string,
        breakdownId: string,
        userId: string,
        dto: ResolveBreakdownDTO
    ) {
        const breakdown = await prisma.equipmentbreakdowns.findFirst({
            where: {
                breakdownid: breakdownId,
                equipmentid: equipmentId,
                bloodbankid: bloodBankId,
            },
            include: { equipment: true },
        });

        if (!breakdown) {
            throw new Error("Breakdown record not found");
        }

        const resolved = await prisma.$transaction(async (tx) => {
            const updated = await tx.equipmentbreakdowns.update({
                where: { breakdownid: breakdownId },
                data: {
                    status: breakdown_status.RESOLVED,
                    resolutiondetails: dto.resolutionDetails.trim(),
                    resolvedat: new Date(),
                    resolvedbyuserid: userId,
                },
            });

            if (dto.restoreOperational && breakdown.equipment.operationalstatus !== equipment_operational_status.OPERATIONAL) {
                await tx.equipment.update({
                    where: { equipmentid: equipmentId },
                    data: {
                        operationalstatus: equipment_operational_status.OPERATIONAL,
                        updatedat: new Date(),
                    },
                });

                await tx.equipmentstatushistory.create({
                    data: {
                        equipmentid: equipmentId,
                        bloodbankid: bloodBankId,
                        previousstatus: breakdown.equipment.operationalstatus,
                        newstatus: equipment_operational_status.OPERATIONAL,
                        reason: `Breakdown resolved: ${dto.resolutionDetails.trim().substring(0, 100)}. Restored to OPERATIONAL.`,
                        changedbyuserid: userId,
                    },
                });
            } else {
                await tx.equipmentstatushistory.create({
                    data: {
                        equipmentid: equipmentId,
                        bloodbankid: bloodBankId,
                        previousstatus: breakdown.equipment.operationalstatus,
                        newstatus: breakdown.equipment.operationalstatus,
                        reason: `Breakdown resolved: ${dto.resolutionDetails.trim().substring(0, 100)}`,
                        changedbyuserid: userId,
                    },
                });
            }

            return updated;
        });

        return resolved;
    }

    /**
     * Get dashboard metrics and actionable alerts for Blood Bank Facility.
     */
    public static async getDashboardMetrics(bloodBankId: string) {
        const [
            totalEquipment,
            operational,
            underMaintenance,
            outOfService,
            retired,
            calUpToDate,
            calDueSoon,
            calOverdue,
            maintOverdue,
            activeBreakdowns,
        ] = await Promise.all([
            prisma.equipment.count({ where: { bloodbankid: bloodBankId } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, operationalstatus: equipment_operational_status.OPERATIONAL } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, operationalstatus: equipment_operational_status.UNDER_MAINTENANCE } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, operationalstatus: equipment_operational_status.OUT_OF_SERVICE } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, operationalstatus: equipment_operational_status.RETIRED } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, calibrationstatus: equipment_calibration_status.UP_TO_DATE } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, calibrationstatus: equipment_calibration_status.DUE_SOON } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, calibrationstatus: equipment_calibration_status.OVERDUE } }),
            prisma.equipment.count({ where: { bloodbankid: bloodBankId, maintenancestatus: equipment_maintenance_status.OVERDUE } }),
            prisma.equipmentbreakdowns.findMany({
                where: {
                    bloodbankid: bloodBankId,
                    status: { not: breakdown_status.RESOLVED },
                },
                include: {
                    equipment: { select: { assetnumber: true, equipmentname: true, location: true } },
                },
                orderBy: { reportedat: "desc" },
                take: 10,
            }),
        ]);

        // Fetch urgent upcoming/overdue calibrations
        const upcomingCalibrations = await prisma.equipment.findMany({
            where: {
                bloodbankid: bloodBankId,
                calibrationstatus: { in: [equipment_calibration_status.OVERDUE, equipment_calibration_status.DUE_SOON] },
            },
            select: {
                equipmentid: true,
                assetnumber: true,
                equipmentname: true,
                category: true,
                location: true,
                nextcalibrationdate: true,
                calibrationstatus: true,
            },
            orderBy: { nextcalibrationdate: "asc" },
            take: 10,
        });

        return {
            totalEquipment,
            operational,
            underMaintenance,
            outOfService,
            retired,
            calibration: {
                upToDate: calUpToDate,
                dueSoon: calDueSoon,
                overdue: calOverdue,
            },
            maintenance: {
                overdue: maintOverdue,
            },
            activeBreakdownsCount: activeBreakdowns.length,
            activeBreakdowns,
            upcomingCalibrations,
        };
    }

    /**
     * Get system-wide and facility-specific categories.
     */
    public static async getCategories(bloodBankId: string) {
        const categories = await prisma.equipmentcategories.findMany({
            where: {
                OR: [
                    { bloodbankid: null },
                    { bloodbankid: bloodBankId },
                ],
                isactive: true,
            },
            orderBy: { categoryname: "asc" },
        });

        return categories;
    }

    /**
     * Generate structured audit and compliance report.
     */
    public static async generateReport(bloodBankId: string) {
        const equipment = await prisma.equipment.findMany({
            where: { bloodbankid: bloodBankId },
            include: {
                _count: {
                    select: {
                        calibrations: true,
                        maintenance: true,
                        breakdowns: true,
                    },
                },
            },
            orderBy: { assetnumber: "asc" },
        });

        return {
            generatedAt: new Date().toISOString(),
            bloodBankId,
            totalCount: equipment.length,
            equipment: equipment.map((eq) => ({
                assetNumber: eq.assetnumber,
                equipmentName: eq.equipmentname,
                category: eq.category,
                manufacturer: eq.manufacturer || "N/A",
                modelNumber: eq.modelnumber || "N/A",
                location: eq.location || "N/A",
                operationalStatus: eq.operationalstatus,
                calibrationStatus: eq.calibrationstatus,
                nextCalibrationDate: eq.nextcalibrationdate?.toISOString() || "N/A",
                maintenanceStatus: eq.maintenancestatus,
                nextMaintenanceDate: eq.nextmaintenancedate?.toISOString() || "N/A",
                totalCalibrations: eq._count.calibrations,
                totalMaintenance: eq._count.maintenance,
                totalBreakdowns: eq._count.breakdowns,
            })),
        };
    }
}
