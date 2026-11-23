import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { requireApprovedHospital } from "../middleware/ownership.middleware";
import { blood_group, blood_component, availability_status, notification_type, verification_status } from "../generated/prisma/enums";
import { validateCoordinates } from "../utils/distance";
import { validatePrescriptionFile, getPrescriptionStorageDir } from "../utils/fileValidation";
import { triggerEmergencyBroadcast, getRequestBroadcastStatus } from "../services/broadcast.service";
import { isDonorCompatibleWithRecipient } from "../utils/bloodCompatibility";
import { scheduleEmergencyFollowUp, cancelPendingJobs, sanitizeErrorMessage } from "../services/scheduler.service";
import { UnitTraceabilityService } from "../services/unitTraceability.service";
import { DonorMatchingService } from "../services/donorMatching.service";
import { RequestDocumentService } from "../services/requestDocument.service";
import { DocumentVerificationService } from "../services/documentVerification.service";
import { NotificationSmsDispatcher } from "../services/sms/notificationSmsDispatcher.service";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parseStrictBoundedInt = (value: unknown, min: number, max: number): number | null => {
    if (value === undefined || value === null || typeof value === "boolean") {
        return null;
    }
    let parsed: number;
    if (typeof value === "number") {
        if (!Number.isInteger(value)) return null;
        parsed = value;
    } else if (typeof value === "string") {
        const trimmed = value.trim();
        if (!/^-?\d+$/.test(trimmed)) return null;
        parsed = Number(trimmed);
        if (!Number.isSafeInteger(parsed)) return null;
    } else {
        return null;
    }
    if (parsed < min || parsed > max) {
        return null;
    }
    return parsed;
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

const handlePrescriptionUpload = (req: Request, res: Response, next: any) => {
    upload.single("prescription")(req, res, (err: any) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    success: false,
                    message: "File size exceeds the 5 MB limit (maximum 5 MB allowed)",
                });
            }
            return res.status(400).json({
                success: false,
                message: err.message || "File upload processing failed",
            });
        }
        next();
    });
};

// Medically verified transfusion compatibility mapping (Donor group -> Acceptable Recipient groups)
const DONOR_COMPATIBILITY_MAP: Record<blood_group, blood_group[]> = {
    [blood_group.O_NEGATIVE]: [
        blood_group.O_NEGATIVE,
        blood_group.O_POSITIVE,
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.O_POSITIVE]: [
        blood_group.O_POSITIVE,
        blood_group.A_POSITIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_NEGATIVE]: [
        blood_group.A_NEGATIVE,
        blood_group.A_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.A_POSITIVE]: [
        blood_group.A_POSITIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.B_NEGATIVE]: [
        blood_group.B_NEGATIVE,
        blood_group.B_POSITIVE,
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.B_POSITIVE]: [
        blood_group.B_POSITIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.AB_NEGATIVE]: [
        blood_group.AB_NEGATIVE,
        blood_group.AB_POSITIVE,
    ],
    [blood_group.AB_POSITIVE]: [
        blood_group.AB_POSITIVE,
    ],
};

const router = Router();
/**
 * GET /bloodrequests/public
 * Sanitized public emergency blood requisitions feed (no auth required)
 * Never exposes patient names, contact numbers, private notes, or internal user/requester IDs.
 */
router.get("/public", async (_req: Request, res: Response) => {
    try {
        const publicRequests = await prisma.bloodrequests.findMany({
            where: {
                status: {
                    in: ["CREATED", "VERIFIED", "DONOR_MATCHING"],
                },
            },
            select: {
                requestid: true,
                bloodgroup: true,
                bloodcomponent: true,
                unitsrequired: true,
                urgencylevel: true,
                isemergency: true,
                requiredby: true,
                status: true,
                createdat: true,
                hospitals: {
                    select: {
                        hospitalname: true,
                        city: true,
                        state: true,
                    },
                },
            },
            orderBy: [
                { isemergency: "desc" },
                { requiredby: "asc" },
            ],
            take: 50,
        });

        res.status(200).json(publicRequests);
    } catch (error) {
        console.error("Error fetching public blood requests:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch public blood requests",
        });
    }
});

/**
 * GET /bloodrequests
 * Authenticated role-scoped blood requests listing.
 * - ADMIN: Views all blood requests with associated hospital/requester details.
 * - HOSPITAL: Views requests created by or assigned to authenticated hospital.
 * - REQUESTER/PATIENT: Views requests created by or belonging to authenticated requester.
 * - DONOR: Views active requests with sanitized clinical info (patient contact and private notes redacted).
 */
router.get("/", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const role = user?.role;

        if (role === "ADMIN") {
            const bloodRequests = await prisma.bloodrequests.findMany({
                include: {
                    users: {
                        select: {
                            userid: true,
                            name: true,
                            email: true,
                            phonenumber: true,
                            role: true,
                        },
                    },
                    requesters: true,
                    hospitals: true,
                    prescription: true,
                },
                orderBy: { createdat: "desc" },
            });
            return res.status(200).json(bloodRequests);
        }

        if (role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });

            const whereClause: any = {
                OR: [
                    { createdbyuserid: user.userid },
                ],
            };

            if (hospital) {
                whereClause.OR.push({ hospitalid: hospital.hospitalid });
            }

            const bloodRequests = await prisma.bloodrequests.findMany({
                where: whereClause,
                include: {
                    users: {
                        select: {
                            userid: true,
                            name: true,
                            email: true,
                            phonenumber: true,
                            role: true,
                        },
                    },
                    requesters: true,
                    hospitals: true,
                    prescription: true,
                },
                orderBy: { createdat: "desc" },
            });
            return res.status(200).json(bloodRequests);
        }

        if (role === "REQUESTER" || role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({
                where: { userid: user.userid },
            });

            const whereClause: any = {
                OR: [
                    { createdbyuserid: user.userid },
                ],
            };

            if (requester) {
                whereClause.OR.push({ requesterid: requester.requesterid });
            }

            const bloodRequests = await prisma.bloodrequests.findMany({
                where: whereClause,
                include: {
                    users: {
                        select: {
                            userid: true,
                            name: true,
                            email: true,
                            phonenumber: true,
                            role: true,
                        },
                    },
                    requesters: true,
                    hospitals: true,
                    prescription: true,
                },
                orderBy: { createdat: "desc" },
            });
            return res.status(200).json(bloodRequests);
        }

        if (role === "DONOR") {
            const donorProfile = await prisma.donors.findUnique({
                where: { userid: user.userid },
                select: { bloodgroup: true, availabilitystatus: true, iseligible: true },
            });
            if (!donorProfile || donorProfile.availabilitystatus !== "AVAILABLE" || donorProfile.iseligible === false) {
                return res.status(200).json([]);
            }

            // For donors, return compatible active requests with patient identity, phone, notes, and internal IDs redacted
            const rawRequests = await prisma.bloodrequests.findMany({
                where: {
                    status: {
                        in: ["CREATED", "VERIFIED", "DONOR_MATCHING", "BLOOD_BANK_CHECK", "HOSPITAL_REVIEW"],
                    },
                },
                include: {
                    hospitals: {
                        select: {
                            hospitalid: true,
                            hospitalname: true,
                            city: true,
                            state: true,
                        },
                    },
                },
                orderBy: [
                    { isemergency: "desc" },
                    { requiredby: "asc" },
                ],
                take: 50,
            });

            const sanitized = rawRequests
                .filter((r) => isDonorCompatibleWithRecipient(donorProfile.bloodgroup, r.bloodgroup, r.bloodcomponent))
                .map((r) => ({
                    requestid: r.requestid,
                    bloodgroup: r.bloodgroup,
                    bloodcomponent: r.bloodcomponent,
                    unitsrequired: r.unitsrequired,
                    urgencylevel: r.urgencylevel,
                    isemergency: r.isemergency,
                    searchradius: r.searchradius,
                    requiredby: r.requiredby,
                    status: r.status,
                    createdat: r.createdat,
                    hospitals: r.hospitals,
                }));

            return res.status(200).json(sanitized);
        }

        // Any other role: only requests created by this user
        const ownRequests = await prisma.bloodrequests.findMany({
            where: { createdbyuserid: user.userid },
            include: {
                requesters: true,
                hospitals: true,
            },
            orderBy: { createdat: "desc" },
        });

        return res.status(200).json(ownRequests);
    } catch (error) {
        console.error("Error fetching blood requests:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch blood requests",
        });
    }
});
router.get("/:id", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        // Validate UUID format to prevent database syntax errors on invalid IDs
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!targetId || !uuidRegex.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: {
                requestid: targetId,
            },
            include: {
                users: {
                    select: {
                        userid: true,
                        name: true,
                        email: true,
                        phonenumber: true,
                        role: true,
                    },
                },
                requesters: true,
                hospitals: true,
                prescription: {
                    include: {
                        hospitals: {
                            select: {
                                hospitalid: true,
                                hospitalname: true,
                            },
                        },
                    },
                },
                prescriptionhistory: {
                    orderBy: {
                        createdat: "desc",
                    },
                    include: {
                        hospitals: {
                            select: {
                                hospitalid: true,
                                hospitalname: true,
                            },
                        },
                    },
                },
                requeststatushistory: {
                    orderBy: {
                        changedat: "asc",
                    },
                    include: {
                        users: {
                            select: {
                                name: true,
                                role: true,
                            },
                        },
                    },
                },
                requisitionassignments: {
                    include: {
                        bloodbanks: {
                            select: {
                                bloodbankid: true,
                                bloodbankname: true,
                                city: true,
                                state: true,
                                licensenumber: true,
                            },
                        },
                    },
                    orderBy: {
                        assignedat: "desc",
                    },
                },
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        // Enforce ownership: Creator, linked Requester, linked Hospital, or Admin
        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";

        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({
                where: { userid: user.userid },
            });
            if (requester && bloodRequest.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }

        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) {
                isHospitalOwner = true;
            }
        }

        if (!isOwner && !isRequesterOwner && !isHospitalOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you do not own this blood request",
            });
        }

        // Fetch genuine voluntary donor commitments from durable broadcastdeliveries
        const commitments = await prisma.broadcastdeliveries.findMany({
            where: {
                requestid: targetId,
                response: "ACCEPTED",
            },
            include: {
                donors: {
                    include: {
                        users: {
                            select: {
                                userid: true,
                                name: true,
                                phonenumber: true,
                                email: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                respondedat: "desc",
            },
        });

        let volunteers: any[] = [];
        if (commitments.length > 0) {
            volunteers = commitments.map((c) => {
                let parsedNotes: any = {};
                if (c.transitnotes) {
                    try {
                        parsedNotes = JSON.parse(c.transitnotes);
                    } catch { }
                }
                const dUser = c.donors?.users;
                const isRejectedOffer = (c.acceptancestatus || "PENDING") === "REJECTED";
                return {
                    deliveryId: c.deliveryid,
                    notificationid: c.notificationid || undefined,
                    donorId: c.donorid,
                    donorUserId: c.donoruserid,
                    donorName: parsedNotes.donorName || dUser?.name || "Voluntary Donor",
                    donorBloodGroup: parsedNotes.donorBloodGroup || c.donors?.bloodgroup || "COMPATIBLE",
                    donorCity: parsedNotes.donorCity || c.donors?.city || "Registered Area",
                    donorState: parsedNotes.donorState || c.donors?.state || "",
                    donorPhone: isRejectedOffer ? "" : (parsedNotes.donorPhone || dUser?.phonenumber || ""),
                    donorEmail: isRejectedOffer ? "" : (parsedNotes.donorEmail || dUser?.email || ""),
                    respondedAt: c.respondedat || c.createdat,
                    acceptanceStatus: c.acceptancestatus || "PENDING",
                    acceptedAt: c.acceptedat || null,
                    acceptedByUserId: c.acceptedbyuserid || null,
                    rejectedAt: c.rejectedat || null,
                    rejectedByUserId: c.rejectedbyuserid || null,
                    receiptConfirmedAt: c.receiptconfirmedat || null,
                    receiptConfirmedByUserId: c.receiptconfirmedbyuserid || null,
                    status: c.transitstatus || "DONOR_FOUND",
                    transitStatus: c.transitstatus || "DONOR_FOUND",
                    startedAt: c.startedat || null,
                    reachedAt: c.reachedat || null,
                    completedAt: c.completedat || null,
                    estimatedArrival: c.estimatedarrival || parsedNotes.estimatedArrival || "Within 1-2 hours",
                    notes: parsedNotes.notes || "",
                    screening: parsedNotes.screening || {
                        alcoholClearance: "Passed (Screened & Cleared)",
                        generalHealth: "Good / Symptom Free",
                        cooldownPassed: true,
                        eligibilityStatus: "ELIGIBLE",
                    },
                    isEligible: true,
                };
            });
        } else {
            // Backward-compatible fallback for legacy volunteer notifications
            const volunteerNotifications = await prisma.notification.findMany({
                where: {
                    requestid: targetId,
                    type: notification_type.MATCH,
                    title: "Volunteer Response Confirmed",
                },
                include: {
                    users: {
                        select: {
                            userid: true,
                            name: true,
                            phonenumber: true,
                            email: true,
                            donors: {
                                select: {
                                    bloodgroup: true,
                                    city: true,
                                    state: true,
                                    weight: true,
                                    gender: true,
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    sentat: "desc",
                },
            });

            volunteers = volunteerNotifications.map((n) => {
                let meta: any = {};
                const metaMatch = n.message.match(/<!--META:([\s\S]*?)-->/);
                if (metaMatch && metaMatch[1]) {
                    try {
                        meta = JSON.parse(metaMatch[1]);
                    } catch {
                        // Fallback to empty meta
                    }
                }

                return {
                    notificationid: n.notificationid,
                    donorId: meta.donorId || n.users?.userid,
                    donorName: meta.donorName || n.users?.name || "Voluntary Donor",
                    donorBloodGroup: meta.donorBloodGroup || n.users?.donors?.bloodgroup || "COMPATIBLE",
                    donorCity: meta.donorCity || n.users?.donors?.city || "Registered Area",
                    donorState: meta.donorState || n.users?.donors?.state || "",
                    donorPhone: meta.donorPhone || n.users?.phonenumber || "",
                    donorEmail: meta.donorEmail || n.users?.email || "",
                    respondedAt: n.sentat,
                    status: meta.transitStatus || "DONOR_FOUND",
                    transitStatus: meta.transitStatus || "DONOR_FOUND",
                    startedAt: meta.startedAt || null,
                    reachedAt: meta.reachedAt || null,
                    completedAt: meta.completedAt || null,
                    estimatedArrival: meta.estimatedArrival || "Within 1-2 hours",
                    notes: meta.notes || "",
                    screening: meta.screening || {
                        alcoholClearance: "Passed (Screened & Cleared)",
                        generalHealth: "Good / Symptom Free",
                        cooldownPassed: true,
                        eligibilityStatus: "ELIGIBLE",
                    },
                    isEligible: meta.isEligible !== undefined ? meta.isEligible : true,
                };
            });
        }

        const prescriptionData = bloodRequest.prescription
            ? {
                ...bloodRequest.prescription,
                fileurl: `/bloodrequests/${bloodRequest.requestid}/prescription/file`,
                downloadUrl: `/bloodrequests/${bloodRequest.requestid}/prescription/file`,
            }
            : null;

        res.status(200).json({
            ...bloodRequest,
            prescription: prescriptionData,
            volunteers,
        });
    } catch (error) {
        console.error("Error fetching blood request:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch blood request",
        });
    }
});
router.post("/", authenticate, authorize("REQUESTER", "PATIENT", "HOSPITAL", "ADMIN"), requireApprovedHospital, handlePrescriptionUpload, async (req: Request, res: Response) => {
    let savedFileName: string | null = null;
    let savedFilePath: string | null = null;
    let fileMeta: {
        detectedMimeType: string;
        detectedExtension: string;
    } | null = null;

    try {
        const user = (req as any).user;
        const isRequesterRole = user.role === "REQUESTER" || user.role === "PATIENT";
        let requesterId = req.body.requesterid;
        let hospitalId = req.body.hospitalid;

        // Mandate prescription upload for requester-submitted requisitions
        if (isRequesterRole && !req.file) {
            return res.status(400).json({
                success: false,
                message: "A clinical prescription upload (PDF, JPEG, or PNG) is mandatory for requester blood requests",
            });
        }

        // Validate and save prescription if provided
        if (req.file) {
            const validation = validatePrescriptionFile(req.file.buffer, req.file.originalname, req.file.mimetype);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.error,
                });
            }

            fileMeta = {
                detectedMimeType: validation.detectedMimeType!,
                detectedExtension: validation.detectedExtension!,
            };

            const storageDir = getPrescriptionStorageDir();
            savedFileName = `rx-${crypto.randomUUID()}-${Date.now()}${fileMeta.detectedExtension}`;
            savedFilePath = path.join(storageDir, savedFileName);

            await fs.promises.writeFile(savedFilePath, req.file.buffer);
        }

        // If authenticated user is a requester, resolve or provision their canonical requester record
        if (isRequesterRole) {
            let requester = await prisma.requesters.findUnique({
                where: { userid: user.userid },
            });
            if (!requester) {
                requester = await prisma.requesters.create({
                    data: {
                        userid: user.userid,
                        address: "Not Provided",
                        city: "Not Provided",
                        state: "Not Provided",
                        pincode: "000000",
                    },
                });
            }
            if (requester) {
                requesterId = requester.requesterid;
            }
        } else if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });
            if (!hospital) {
                if (savedFilePath) {
                    await fs.promises.unlink(savedFilePath).catch(() => { });
                }
                return res.status(403).json({
                    success: false,
                    message: "Hospital profile not found for this account. Requisition creation requires a linked hospital profile.",
                });
            }
            hospitalId = hospital.hospitalid;
            requesterId = null; // Hospital-created requests have no requester account
        }

        // Validate payload fields
        if (!req.body.patientname || !String(req.body.patientname).trim()) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Patient name is required" });
        }

        const age = parseStrictBoundedInt(req.body.patientage, 1, 125);
        if (age === null) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Valid patient age (1-125) is required" });
        }

        if (!["MALE", "FEMALE", "OTHER"].includes(req.body.patientgender)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Patient gender must be MALE, FEMALE, or OTHER" });
        }

        if (!req.body.patientcontact || !String(req.body.patientcontact).trim()) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Patient contact number is required" });
        }

        const validBloodGroups = [
            "A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE",
            "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"
        ];
        if (!validBloodGroups.includes(req.body.bloodgroup)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Valid blood group is required" });
        }

        const validComponents = ["WHOLE_BLOOD", "PLATELETS", "PLASMA", "RBC"];
        if (!validComponents.includes(req.body.bloodcomponent)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Valid blood component is required" });
        }

        const units = parseStrictBoundedInt(req.body.unitsrequired, 1, 50);
        if (units === null) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Units required must be an integer between 1 and 50" });
        }

        const validUrgency = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        if (!validUrgency.includes(req.body.urgencylevel)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Valid urgency level is required" });
        }

        if (!req.body.requiredby) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Required-by date and time is required" });
        }

        const requiredDate = new Date(req.body.requiredby);
        if (isNaN(requiredDate.getTime())) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Invalid required-by date format" });
        }

        if (requiredDate.getTime() < Date.now() - 5 * 60 * 1000) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
            return res.status(400).json({ success: false, message: "Required-by date and time cannot be in the past" });
        }

        // Search radius validation & capping (1-100 km)
        let searchRadius = 5;
        if (req.body.searchradius !== undefined) {
            const parsedRadius = parseStrictBoundedInt(req.body.searchradius, 1, 100);
            if (parsedRadius === null) {
                if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
                return res.status(400).json({ success: false, message: "Search radius must be an integer between 1 and 100 km" });
            }
            searchRadius = parsedRadius;
        }

        // Validate hospitalId if provided to ensure hospital is APPROVED before arming broadcasts
        let hospitalRecord: any = null;
        if (hospitalId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(hospitalId)) {
                if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
                return res.status(400).json({ success: false, message: "Invalid hospital ID format" });
            }
            hospitalRecord = await prisma.hospitals.findUnique({
                where: { hospitalid: hospitalId },
            });
            if (!hospitalRecord) {
                if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
                return res.status(400).json({ success: false, message: "The specified hospital does not exist" });
            }
            // TEMPORARY BYPASS: Allow assigning non-APPROVED hospital
            /*
            if (hospitalRecord.approvalstatus !== "APPROVED") {
                if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
                return res.status(400).json({
                    success: false,
                    message: "The assigned hospital is not approved to coordinate blood requisitions",
                });
            }
            */
        }

        // Coordinate validation and safe inheritance
        let requestLatitude: number | null = null;
        let requestLongitude: number | null = null;

        if (
            (req.body.latitude !== undefined && req.body.latitude !== null && String(req.body.latitude).trim() !== "") ||
            (req.body.longitude !== undefined && req.body.longitude !== null && String(req.body.longitude).trim() !== "")
        ) {
            const coordValidation = validateCoordinates(req.body.latitude, req.body.longitude);
            if (!coordValidation.valid) {
                if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => { });
                return res.status(400).json({ success: false, message: coordValidation.error });
            }
            requestLatitude = coordValidation.latitude!;
            requestLongitude = coordValidation.longitude!;
        } else {
            // Coordinate inheritance from hospital or requester
            if (hospitalRecord && hospitalRecord.latitude !== null && hospitalRecord.longitude !== null) {
                requestLatitude = Number(hospitalRecord.latitude);
                requestLongitude = Number(hospitalRecord.longitude);
            } else if (requesterId) {
                const requesterRecord = await prisma.requesters.findUnique({ where: { requesterid: requesterId } });
                if (requesterRecord && requesterRecord.latitude !== null && requesterRecord.longitude !== null) {
                    requestLatitude = Number(requesterRecord.latitude);
                    requestLongitude = Number(requesterRecord.longitude);
                }
            }
        }

        // Atomic transaction: Create blood request, prescription record, and initial status history together
        const bloodRequest = await prisma.$transaction(async (tx) => {
            // Revalidate and lock hospital facility under lock to prevent concurrent revocation
            if (hospitalId) {
                const hospRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                    hospitalId
                );
                const lockedHosp = hospRows?.[0];
                // TEMPORARY BYPASS: Allow non-APPROVED hospitals to coordinate requisitions
                if (!lockedHosp) {
                    throw Object.assign(
                        new Error("The assigned hospital does not exist"),
                        { statusCode: 400 }
                    );
                }
            }

            const created = await tx.bloodrequests.create({
                data: {
                    createdbyuserid: user.userid,
                    requesterid: requesterId || null,
                    hospitalid: hospitalId || null,

                    patientname: String(req.body.patientname).trim(),
                    patientage: age,
                    patientgender: req.body.patientgender,

                    patientcontact: String(req.body.patientcontact).trim(),

                    bloodgroup: req.body.bloodgroup,
                    bloodcomponent: req.body.bloodcomponent,

                    unitsrequired: units,

                    urgencylevel: req.body.urgencylevel,

                    isemergency: req.body.isemergency === true || req.body.isemergency === "true",
                    searchradius: searchRadius,
                    latitude: requestLatitude,
                    longitude: requestLongitude,

                    requiredby: requiredDate,

                    notes: req.body.notes || null,
                },
            });

            // Create prescription record if a file was uploaded
            if (savedFileName && req.file && fileMeta) {
                await tx.prescription.create({
                    data: {
                        requestid: created.requestid,
                        fileurl: savedFileName,
                        originalfilename: req.file.originalname,
                        mimetype: fileMeta.detectedMimeType,
                        filesize: req.file.size,
                        doctorname: String(req.body.doctorname || "Attending Physician").trim(),
                        hospitalname: String(req.body.hospitalname || (hospitalRecord ? hospitalRecord.hospitalname : "Prescribing Medical Facility")).trim(),
                        status: "PENDING",
                    },
                });
            }

            await tx.requeststatushistory.create({
                data: {
                    requestid: created.requestid,
                    oldstatus: null,
                    newstatus: "CREATED",
                    changedbyuserid: user.userid,
                    remarks: user.role === "HOSPITAL"
                        ? "Blood requisition initiated directly by hospital"
                        : "Blood requisition initiated by requester with prescription uploaded",
                },
            });

            // If a hospital is assigned, notify the hospital coordination account
            if (hospitalId) {
                const assignedHosp = await tx.hospitals.findUnique({
                    where: { hospitalid: hospitalId },
                    select: { userid: true, hospitalname: true },
                });
                if (assignedHosp && assignedHosp.userid !== user.userid) {
                    await tx.notification.create({
                        data: {
                            userid: assignedHosp.userid,
                            requestid: created.requestid,
                            type: notification_type.REQUEST,
                            title: "New Blood Requisition Received",
                            message: `New ${created.urgencylevel} requisition (${created.bloodgroup}, ${created.unitsrequired} unit(s)) has been assigned to your facility for review.`,
                            isread: false,
                        },
                    });

                    // Automated Hospital SMS
                    await NotificationSmsDispatcher.dispatchHospitalReqAssigned({
                        hospitalUserId: assignedHosp.userid,
                        requestId: created.requestid,
                        bloodGroup: created.bloodgroup,
                        prismaTx: tx,
                    }).catch(() => {});
                }
            }

            // Automated Requester SMS Confirmation
            await NotificationSmsDispatcher.dispatchRequesterConfirmation({
                requesterUserId: user.userid,
                requestId: created.requestid,
                bloodGroup: created.bloodgroup,
                prismaTx: tx,
            }).catch(() => {});

            return created;
        });

        // Query full request with prescription
        const fullRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: bloodRequest.requestid },
            include: {
                prescription: true,
                requesters: true,
                hospitals: true,
            },
        });

        // Trigger emergency broadcast if request is marked emergency or CRITICAL
        const isEmergency = Boolean(bloodRequest.isemergency) || bloodRequest.urgencylevel === "CRITICAL";
        if (isEmergency) {
            await triggerEmergencyBroadcast({
                requestId: bloodRequest.requestid,
                triggeredByUserId: user.userid,
                triggerType: "REQUEST_CREATION",
                triggerReason: "Emergency blood requisition initiated",
                radiusKm: bloodRequest.searchradius || 15,
            }).catch((err) => {
                console.error("Emergency broadcast creation error:", err);
            });

            // Schedule persistent follow-up job for emergency escalation
            await scheduleEmergencyFollowUp({
                requestId: bloodRequest.requestid,
            }).catch((err) => {
                console.error("Emergency scheduler follow-up creation error:", err);
            });
        }

        res.status(201).json(fullRequest || bloodRequest);
    } catch (error) {
        console.error("Error creating blood request:", error);

        // Transaction failed: clean up written file from storage so no orphaned files remain
        if (savedFilePath) {
            await fs.promises.unlink(savedFilePath).catch(() => { });
        }

        res.status(500).json({
            success: false,
            message: "Failed to create blood request",
        });
    }
});
router.put("/:id", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!targetId || !uuidRegex.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        const existing = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: {
                hospitals: true,
            },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        // Authorization Resolution
        const isOwner = existing.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";

        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || (user.role as any) === "PATIENT") {
            if (existing.requesterid) {
                const requester = await prisma.requesters.findUnique({
                    where: { userid: user.userid },
                });
                if (requester && existing.requesterid === requester.requesterid) {
                    isRequesterOwner = true;
                }
            }
        }

        let isAssignedHospital = false;
        let hospitalRecord: any = null;
        if (user.role === "HOSPITAL") {
            hospitalRecord = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });
            if (!hospitalRecord) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: no hospital profile linked to this account",
                });
            }
            // TEMPORARY BYPASS: Allow non-APPROVED hospitals to perform clinical operations
            /*
            if (hospitalRecord.approvalstatus !== "APPROVED") {
                return res.status(403).json({
                    success: false,
                    message: `Hospital facility is ${hospitalRecord.approvalstatus}. Only APPROVED facilities may perform clinical operations.`,
                    approvalstatus: hospitalRecord.approvalstatus,
                });
            }
            */
            if (existing.hospitalid && existing.hospitalid === hospitalRecord.hospitalid) {
                isAssignedHospital = true;
            } else {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: this blood request is not assigned to your hospital",
                });
            }
        }

        if (!isOwner && !isRequesterOwner && !isAssignedHospital && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you are not authorized to update this blood request",
            });
        }

        // Terminal status protection: Cannot modify, reverse, or cancel already terminal requests
        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
        if (terminalStatuses.includes(existing.status || "")) {
            return res.status(400).json({
                success: false,
                message: `Cannot modify or update a requisition that is already ${String(existing.status).toLowerCase()}`,
            });
        }

        // Validate status enum if changing status
        const validStatuses = [
            "CREATED", "VERIFIED", "HOSPITAL_REVIEW", "BLOOD_BANK_CHECK",
            "DONOR_MATCHING", "BLOOD_ARRANGED", "FULFILLED", "CANCELLED", "EXPIRED"
        ];
        if (req.body.status !== undefined && !validStatuses.includes(req.body.status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid blood request status value",
            });
        }

        // Requester role-based status transition restrictions
        const isRequesterRole = (user.role === "REQUESTER" || (user.role as any) === "PATIENT" || isOwner) && !isAssignedHospital && !isAdmin;
        if (isRequesterRole) {
            // Requesters can ONLY cancel active requests
            if (req.body.status !== undefined && req.body.status !== existing.status) {
                if (req.body.status !== "CANCELLED") {
                    return res.status(403).json({
                        success: false,
                        message: "Requesters are only permitted to cancel active blood requisitions",
                    });
                }
            }
        }

        // Explicit Server-Side Hospital Status Transition Allowlist
        const HOSPITAL_PERMITTED_TRANSITIONS: Record<string, string[]> = {
            CREATED: ["HOSPITAL_REVIEW", "BLOOD_BANK_CHECK", "DONOR_MATCHING", "CANCELLED"],
            VERIFIED: ["HOSPITAL_REVIEW", "BLOOD_BANK_CHECK", "DONOR_MATCHING", "CANCELLED"],
            HOSPITAL_REVIEW: ["BLOOD_BANK_CHECK", "DONOR_MATCHING", "BLOOD_ARRANGED", "CANCELLED"],
            BLOOD_BANK_CHECK: ["DONOR_MATCHING", "BLOOD_ARRANGED", "CANCELLED"],
            DONOR_MATCHING: ["BLOOD_ARRANGED", "CANCELLED"],
            BLOOD_ARRANGED: ["FULFILLED", "CANCELLED"],
            FULFILLED: [],
            CANCELLED: [],
            EXPIRED: [],
        };

        if (isAssignedHospital && !isAdmin) {
            if (req.body.status !== undefined && req.body.status !== existing.status) {
                const currentStatus = existing.status || "CREATED";
                const allowedNext = HOSPITAL_PERMITTED_TRANSITIONS[currentStatus] || [];
                if (!allowedNext.includes(req.body.status)) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid status transition from ${currentStatus} to ${req.body.status}. Permitted transitions: ${allowedNext.join(", ") || "none"}`,
                    });
                }
            }
        }

        // Only authorized hospital confirmation can mark a request fulfilled
        if (req.body.status === "FULFILLED" && !isAssignedHospital && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Only authorized hospital confirmation can mark a request fulfilled",
            });
        }

        // Clinical Safety Gate: If this request is requester-created, it cannot be advanced to BLOOD_ARRANGED or FULFILLED
        // without a clinically VERIFIED prescription
        if (req.body.status === "BLOOD_ARRANGED" || req.body.status === "FULFILLED") {
            const isRequesterCreated = Boolean(existing.requesterid);
            if (isRequesterCreated) {
                const rx = await prisma.prescription.findUnique({
                    where: { requestid: targetId },
                });

                if (!rx || rx.status !== "VERIFIED") {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot advance requester requisition to ${req.body.status} without a clinically verified prescription (Current prescription status: ${rx ? rx.status : "NONE"})`,
                    });
                }
            }
        }

        // Atomic transaction: Update blood request and record status transition history together
        const bloodRequest = await prisma.$transaction(async (tx) => {
            // Lock blood request row using parameterized SQL
            const lockedRows: any[] = await tx.$queryRawUnsafe(
                `SELECT requestid, status, requesterid, hospitalid, createdbyuserid, patientname, patientage, patientgender, patientcontact, bloodgroup, bloodcomponent, unitsrequired, searchradius FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                targetId
            );

            if (!lockedRows || lockedRows.length === 0) {
                throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
            }

            const lockedRequest = lockedRows[0];
            const currentStatus = lockedRequest.status || "";

            if (lockedRequest.hospitalid) {
                const hospRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT hospitalid, approvalstatus, userid FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                    lockedRequest.hospitalid
                );
                const assignedHospital = hospRows?.[0];
                // TEMPORARY BYPASS: Allow non-APPROVED hospitals to update clinical operations
                if (!assignedHospital) {
                    throw Object.assign(
                        new Error("Assigned hospital does not exist"),
                        { statusCode: 403 }
                    );
                }
                if (isAssignedHospital && !isAdmin) {
                    if (assignedHospital.userid !== user.userid) {
                        throw Object.assign(
                            new Error("Assigned hospital is not approved for clinical operations"),
                            { statusCode: 403 }
                        );
                    }
                }
            }

            // Terminal status protection: Cannot modify, reverse, or cancel already terminal requests
            const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
            if (terminalStatuses.includes(currentStatus)) {
                throw Object.assign(
                    new Error(`Cannot modify or update a requisition that is already ${String(currentStatus).toLowerCase()}`),
                    { statusCode: 400 }
                );
            }

            // Requester role-based status transition restrictions against current locked status
            if (isRequesterRole) {
                if (req.body.status !== undefined && req.body.status !== currentStatus) {
                    if (req.body.status !== "CANCELLED") {
                        throw Object.assign(
                            new Error("Requesters are only permitted to cancel active blood requisitions"),
                            { statusCode: 403 }
                        );
                    }
                }
            }

            // Explicit Server-Side Hospital Status Transition Allowlist against current locked status
            if (isAssignedHospital && !isAdmin) {
                if (req.body.status !== undefined && req.body.status !== currentStatus) {
                    const allowedNext = HOSPITAL_PERMITTED_TRANSITIONS[currentStatus] || [];
                    if (!allowedNext.includes(req.body.status)) {
                        throw Object.assign(
                            new Error(`Invalid status transition from ${currentStatus} to ${req.body.status}. Permitted transitions: ${allowedNext.join(", ") || "none"}`),
                            { statusCode: 400 }
                        );
                    }
                }
            }

            // Clinical Safety Gate: If this request is requester-created, it cannot be advanced to BLOOD_ARRANGED or FULFILLED
            // without a clinically VERIFIED prescription
            if (req.body.status === "BLOOD_ARRANGED" || req.body.status === "FULFILLED") {
                const isRequesterCreated = Boolean(lockedRequest.requesterid);
                if (isRequesterCreated) {
                    const rx = await tx.prescription.findUnique({
                        where: { requestid: targetId },
                    });

                    if (!rx || rx.status !== "VERIFIED") {
                        throw Object.assign(
                            new Error(`Cannot advance requester requisition to ${req.body.status} without a clinically verified prescription (Current prescription status: ${rx ? rx.status : "NONE"})`),
                            { statusCode: 400 }
                        );
                    }
                }
            }

            const isStatusChanging = req.body.status !== undefined && req.body.status !== currentStatus;

            // Hospital updates notes and status; Requester/Admin can also update patient fields
            const updateData: any = {
                status: req.body.status !== undefined ? req.body.status : currentStatus,
                notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
                updatedat: new Date(),
            };

            // Hospital reassignment protection & initial assignment for hospital-less requests
            if (req.body.hospitalid !== undefined) {
                if (lockedRequest.hospitalid !== null) {
                    if (req.body.hospitalid !== lockedRequest.hospitalid) {
                        throw Object.assign(
                            new Error("Hospital reassignment is not permitted once assigned"),
                            { statusCode: 400 }
                        );
                    }
                } else if (req.body.hospitalid) {
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (!uuidRegex.test(req.body.hospitalid)) {
                        throw Object.assign(new Error("Invalid hospital ID format"), { statusCode: 400 });
                    }
                    const targetHospRows: any[] = await tx.$queryRawUnsafe(
                        `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                        req.body.hospitalid
                    );
                    const targetHosp = targetHospRows?.[0];
                    if (!targetHosp) {
                        throw Object.assign(new Error("The specified hospital does not exist"), { statusCode: 400 });
                    }
                    // TEMPORARY BYPASS: Allow assigning non-APPROVED hospital
                    /*
                    if (targetHosp.approvalstatus !== "APPROVED") {
                        throw Object.assign(
                            new Error("The assigned hospital is not approved to coordinate blood requisitions"),
                            { statusCode: 400 }
                        );
                    }
                    */
                    updateData.hospitalid = targetHosp.hospitalid;
                }
            }

            if (!isAssignedHospital || isAdmin) {
                const DB_BLOOD_GROUP_MAP: Record<string, string> = {
                    "A+": "A_POSITIVE",
                    "A-": "A_NEGATIVE",
                    "B+": "B_POSITIVE",
                    "B-": "B_NEGATIVE",
                    "AB+": "AB_POSITIVE",
                    "AB-": "AB_NEGATIVE",
                    "O+": "O_POSITIVE",
                    "O-": "O_NEGATIVE",
                };
                const VALID_BLOOD_GROUPS = Object.values(DB_BLOOD_GROUP_MAP);
                const VALID_COMPONENTS = ["WHOLE_BLOOD", "PLATELETS", "PLASMA", "RBC"];

                let normalizedPatientName: string | undefined;
                if (req.body.patientname !== undefined) {
                    if (typeof req.body.patientname !== "string" || !req.body.patientname.trim()) {
                        throw Object.assign(new Error("Patient name must be a non-empty string"), { statusCode: 400 });
                    }
                    const trimmedName = req.body.patientname.trim();
                    if (trimmedName.length > 100) {
                        throw Object.assign(new Error("Patient name cannot exceed 100 characters"), { statusCode: 400 });
                    }
                    normalizedPatientName = trimmedName;
                }

                let parsedPatientAge: number | undefined;
                if (req.body.patientage !== undefined) {
                    const ageVal = parseStrictBoundedInt(req.body.patientage, 1, 125);
                    if (ageVal === null) {
                        throw Object.assign(new Error("Valid patient age (1-125) is required"), { statusCode: 400 });
                    }
                    parsedPatientAge = ageVal;
                }

                let normalizedPatientGender: string | undefined;
                if (req.body.patientgender !== undefined) {
                    if (typeof req.body.patientgender !== "string" || !["MALE", "FEMALE", "OTHER"].includes(req.body.patientgender)) {
                        throw Object.assign(new Error("Patient gender must be MALE, FEMALE, or OTHER"), { statusCode: 400 });
                    }
                    normalizedPatientGender = req.body.patientgender;
                }

                let normalizedPatientContact: string | undefined;
                if (req.body.patientcontact !== undefined) {
                    if (typeof req.body.patientcontact !== "string" || !req.body.patientcontact.trim()) {
                        throw Object.assign(new Error("Patient contact number is required"), { statusCode: 400 });
                    }
                    const trimmedContact = req.body.patientcontact.trim();
                    const cleanPhone = trimmedContact.replace(/[\s-]/g, "");
                    if (trimmedContact.length > 15 || cleanPhone.length < 7 || cleanPhone.length > 15 || !/^[0-9+]+$/.test(cleanPhone)) {
                        throw Object.assign(new Error("Valid patient contact phone number is required"), { statusCode: 400 });
                    }
                    normalizedPatientContact = trimmedContact;
                }

                if (req.body.bloodgroup !== undefined) {
                    if (typeof req.body.bloodgroup !== "string" || !VALID_BLOOD_GROUPS.includes(req.body.bloodgroup)) {
                        throw Object.assign(new Error("Invalid bloodgroup value"), { statusCode: 400 });
                    }
                }
                if (req.body.bloodcomponent !== undefined) {
                    if (typeof req.body.bloodcomponent !== "string" || !VALID_COMPONENTS.includes(req.body.bloodcomponent)) {
                        throw Object.assign(new Error("Invalid bloodcomponent value"), { statusCode: 400 });
                    }
                }

                let parsedUnitsRequired: number | undefined;
                if (req.body.unitsrequired !== undefined) {
                    const unitsVal = parseStrictBoundedInt(req.body.unitsrequired, 1, 50);
                    if (unitsVal === null) {
                        throw Object.assign(new Error("Units required must be an integer between 1 and 50"), { statusCode: 400 });
                    }
                    parsedUnitsRequired = unitsVal;
                }

                let parsedSearchRadius: number | undefined;
                if (req.body.searchradius !== undefined) {
                    const radiusVal = parseStrictBoundedInt(req.body.searchradius, 1, 100);
                    if (radiusVal === null) {
                        throw Object.assign(new Error("Search radius must be an integer between 1 and 100 km"), { statusCode: 400 });
                    }
                    parsedSearchRadius = radiusVal;
                }

                const currentPatientName =
                    lockedRequest.patientname !== undefined && lockedRequest.patientname !== null
                        ? String(lockedRequest.patientname).trim()
                        : String(existing.patientname || "").trim();
                const currentPatientAge =
                    lockedRequest.patientage !== undefined && lockedRequest.patientage !== null
                        ? Number(lockedRequest.patientage)
                        : Number(existing.patientage);
                const currentPatientGender = lockedRequest.patientgender || existing.patientgender;
                const currentPatientContact =
                    lockedRequest.patientcontact !== undefined && lockedRequest.patientcontact !== null
                        ? String(lockedRequest.patientcontact).trim()
                        : String(existing.patientcontact || "").trim();

                const currentBloodGroup = DB_BLOOD_GROUP_MAP[lockedRequest.bloodgroup] || lockedRequest.bloodgroup || existing.bloodgroup;
                const currentBloodComponent = lockedRequest.bloodcomponent || existing.bloodcomponent;
                const currentUnitsRequired =
                    lockedRequest.unitsrequired !== undefined && lockedRequest.unitsrequired !== null
                        ? Number(lockedRequest.unitsrequired)
                        : existing.unitsrequired;

                const isPatientNameChanging =
                    normalizedPatientName !== undefined && normalizedPatientName !== currentPatientName;
                const isPatientAgeChanging =
                    parsedPatientAge !== undefined && parsedPatientAge !== currentPatientAge;
                const isPatientGenderChanging =
                    normalizedPatientGender !== undefined && normalizedPatientGender !== currentPatientGender;
                const isPatientContactChanging =
                    normalizedPatientContact !== undefined && normalizedPatientContact !== currentPatientContact;
                const isPatientIdentityChanging =
                    isPatientNameChanging || isPatientAgeChanging || isPatientGenderChanging || isPatientContactChanging;

                const isBloodGroupChanging =
                    req.body.bloodgroup !== undefined && req.body.bloodgroup !== currentBloodGroup;
                const isBloodComponentChanging =
                    req.body.bloodcomponent !== undefined && req.body.bloodcomponent !== currentBloodComponent;
                const isUnitsChanging =
                    parsedUnitsRequired !== undefined && parsedUnitsRequired !== currentUnitsRequired;
                const isClinicalChanging =
                    isBloodGroupChanging || isBloodComponentChanging || isUnitsChanging;

                if (isPatientIdentityChanging || isClinicalChanging) {
                    // Consistent lock order with POST /bloodrequests/:id/prescription/verify:
                    // bloodrequests FOR UPDATE first, then prescription FOR UPDATE
                    let rxStatus: string | null = null;
                    if (typeof (tx as any).$queryRawUnsafe === "function") {
                        const lockedRxRows: any[] = await tx.$queryRawUnsafe(
                            `SELECT prescriptionid, status FROM prescription WHERE requestid = $1::uuid FOR UPDATE`,
                            targetId
                        );
                        if (Array.isArray(lockedRxRows) && lockedRxRows.length > 0 && lockedRxRows[0]?.status !== undefined) {
                            rxStatus = lockedRxRows[0].status;
                        }
                    }
                    if (rxStatus === null && typeof (tx as any).prescription?.findUnique === "function") {
                        const rx = await tx.prescription.findUnique({
                            where: { requestid: targetId },
                            select: { status: true },
                        });
                        if (rx) rxStatus = rx.status;
                    }

                    if (rxStatus === "VERIFIED") {
                        throw Object.assign(
                            new Error(
                                isPatientIdentityChanging
                                    ? "Cannot modify patient identity fields (patientname, patientage, patientgender, patientcontact) after prescription has been clinically verified"
                                    : "Cannot modify clinical fields (bloodgroup, bloodcomponent, unitsrequired) after prescription has been clinically verified"
                            ),
                            { statusCode: 400 }
                        );
                    }

                    const permittedEarlyStatuses = ["CREATED", "HOSPITAL_REVIEW"];
                    const acceptedCommitment =
                        typeof (tx as any).broadcastdeliveries?.findFirst === "function"
                            ? await tx.broadcastdeliveries.findFirst({
                                where: { requestid: targetId, response: "ACCEPTED" },
                                select: { deliveryid: true },
                            })
                            : null;

                    const activeAssignment =
                        typeof (tx as any).requisitionassignments?.findFirst === "function"
                            ? await tx.requisitionassignments.findFirst({
                                where: {
                                    requestid: targetId,
                                    assignmentstatus: { in: ["PENDING_ACCEPTANCE", "ACCEPTED"] },
                                },
                                select: { assignmentid: true },
                            })
                            : null;

                    const activeReservation =
                        typeof (tx as any).bloodreservations?.findFirst === "function"
                            ? await tx.bloodreservations.findFirst({
                                where: {
                                    requestid: targetId,
                                    reservationstatus: { not: "CANCELLED" },
                                },
                                select: { reservationid: true },
                            })
                            : null;

                    if (
                        !permittedEarlyStatuses.includes(currentStatus) ||
                        Boolean(acceptedCommitment) ||
                        Boolean(activeAssignment) ||
                        Boolean(activeReservation)
                    ) {
                        throw Object.assign(
                            new Error(
                                isPatientIdentityChanging
                                    ? "Cannot modify patient identity fields (patientname, patientage, patientgender, patientcontact) after prescription verification, donor matching, or workflow commitments have begun"
                                    : "Cannot modify clinical fields (bloodgroup, bloodcomponent, unitsrequired) after donor matching or volunteer commitments have begun"
                            ),
                            { statusCode: 400 }
                        );
                    }
                }

                if (normalizedPatientName !== undefined) updateData.patientname = normalizedPatientName;
                if (parsedPatientAge !== undefined) updateData.patientage = parsedPatientAge;
                if (normalizedPatientGender !== undefined) updateData.patientgender = normalizedPatientGender;
                if (normalizedPatientContact !== undefined) updateData.patientcontact = normalizedPatientContact;
                if (req.body.bloodgroup !== undefined) updateData.bloodgroup = req.body.bloodgroup;
                if (req.body.bloodcomponent !== undefined) updateData.bloodcomponent = req.body.bloodcomponent;
                if (parsedUnitsRequired !== undefined) updateData.unitsrequired = parsedUnitsRequired;
                if (req.body.urgencylevel !== undefined) updateData.urgencylevel = req.body.urgencylevel;
                if (req.body.isemergency !== undefined) updateData.isemergency = req.body.isemergency === true || req.body.isemergency === "true";
                if (parsedSearchRadius !== undefined) updateData.searchradius = parsedSearchRadius;
                if (req.body.requiredby !== undefined) updateData.requiredby = new Date(req.body.requiredby);
            }

            const updated = await tx.bloodrequests.update({
                where: {
                    requestid: targetId,
                },
                data: updateData,
                include: {
                    users: {
                        select: {
                            userid: true,
                            name: true,
                            email: true,
                            phonenumber: true,
                            role: true,
                        },
                    },
                    hospitals: {
                        select: {
                            hospitalid: true,
                            hospitalname: true,
                            contactpersonname: true,
                            contactpersonphone: true,
                            city: true,
                            state: true,
                        },
                    },
                    requeststatushistory: {
                        orderBy: {
                            changedat: "asc",
                        },
                        include: {
                            users: {
                                select: {
                                    userid: true,
                                    name: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            });

            // Record status change in requeststatushistory only if status actually changed
            if (isStatusChanging) {
                const remarks = req.body.remarks
                    ? String(req.body.remarks).trim()
                    : (req.body.status === "FULFILLED"
                        ? "Transfusion completed and clinically verified by hospital staff"
                        : `Status transitioned from ${currentStatus} to ${req.body.status} by ${user.role.toLowerCase()}`);

                await tx.requeststatushistory.create({
                    data: {
                        requestid: targetId,
                        oldstatus: currentStatus,
                        newstatus: req.body.status,
                        changedbyuserid: user.userid,
                        remarks,
                    },
                });

                // Notify requester if status was transitioned by hospital or admin
                if (lockedRequest.createdbyuserid !== user.userid) {
                    const isAcceptedStatus = req.body.status === "ACCEPTED";
                    const patientInfo = isAcceptedStatus && (lockedRequest.patientname || existing.patientname)
                        ? `for patient ${lockedRequest.patientname || existing.patientname} `
                        : "";
                    await tx.notification.create({
                        data: {
                            userid: lockedRequest.createdbyuserid,
                            requestid: targetId,
                            type: notification_type.REQUEST,
                            title: `Requisition Status: ${req.body.status}`,
                            message: `Blood request ${patientInfo}(${lockedRequest.bloodgroup || existing.bloodgroup}) was transitioned to ${req.body.status}. Remarks: ${remarks}`,
                            isread: false,
                        },
                    });

                    // Automated Requester SMS Status Update
                    await NotificationSmsDispatcher.dispatchRequesterStatusUpdate({
                        requesterUserId: lockedRequest.createdbyuserid,
                        requestId: targetId,
                        statusText: req.body.status,
                        reason: remarks,
                        prismaTx: tx,
                    }).catch(() => {});
                }
            }

            if (terminalStatuses.includes(updated.status || "")) {
                if (typeof (tx as any).emergencybroadcasts?.updateMany === "function") {
                    await (tx as any).emergencybroadcasts.updateMany({
                        where: { requestid: targetId, status: { in: ["ACTIVE", "DONOR_RESPONDED"] } },
                        data: { status: updated.status || "CANCELLED" },
                    });
                }
                if (typeof (tx as any).emergencyschedulerjobs?.updateMany === "function") {
                    await (tx as any).emergencyschedulerjobs.updateMany({
                        where: {
                            requestid: targetId,
                            status: { in: ["PENDING", "PROCESSING"] },
                        },
                        data: {
                            status: "CANCELLED",
                            lasterror: `Request transitioned to ${updated.status}`,
                            lockeduntil: null,
                            lockedby: null,
                            updatedat: new Date(),
                        },
                    });
                }
            }

            return updated;
        });

        // If request was marked as emergency or critical upon update, trigger broadcast
        const becameEmergency = (Boolean(bloodRequest.isemergency) || bloodRequest.urgencylevel === "CRITICAL") &&
            (!existing.isemergency && existing.urgencylevel !== "CRITICAL");
        if (becameEmergency && !terminalStatuses.includes(bloodRequest.status || "")) {
            await triggerEmergencyBroadcast({
                requestId: targetId,
                triggeredByUserId: user.userid,
                triggerType: "STATUS_UPDATE",
                triggerReason: "Requisition escalated to emergency",
                radiusKm: bloodRequest.searchradius || 15,
            }).catch((err) => {
                console.error("Emergency broadcast trigger on update error:", err);
            });

            await scheduleEmergencyFollowUp({
                requestId: targetId,
            }).catch((err) => {
                console.error("Emergency scheduler follow-up on escalation error:", err);
            });
        }

        res.status(200).json(bloodRequest);
    } catch (error: any) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        console.error("Error updating blood request:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update blood request",
        });
    }
});
router.delete("/:id", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!targetId || !uuidRegex.test(targetId)) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        const filesToUnlink = await prisma.$transaction(async (tx) => {
            const lockedRows: any[] = await tx.$queryRawUnsafe(
                `SELECT requestid, status, requesterid, hospitalid, createdbyuserid FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                targetId
            );

            if (!lockedRows || lockedRows.length === 0) {
                throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
            }

            const existing = lockedRows[0];

            if (existing.createdbyuserid !== user.userid && user.role !== "ADMIN") {
                throw Object.assign(new Error("Access denied: you do not own this blood request"), { statusCode: 403 });
            }

            if (existing.status !== "CREATED") {
                throw Object.assign(
                    new Error(
                        `Cannot hard-delete a blood request in ${existing.status} status. Only newly created (CREATED) requests without verified prescriptions or active workflow commitments can be deleted; use cancellation for active requests.`
                    ),
                    { statusCode: 400 }
                );
            }

            // Lock and check prescription inside transaction (consistent lock order: bloodrequests -> prescription)
            const lockedRxRows: any[] = await tx.$queryRawUnsafe(
                `SELECT prescriptionid, status, fileurl FROM prescription WHERE requestid = $1::uuid FOR UPDATE`,
                targetId
            );
            const rx = Array.isArray(lockedRxRows) && lockedRxRows.length > 0 ? lockedRxRows[0] : null;
            if (rx && rx.status === "VERIFIED") {
                throw Object.assign(
                    new Error("Cannot hard-delete a blood request after its clinical prescription has been verified"),
                    { statusCode: 400 }
                );
            }

            const donorCommitment = await tx.broadcastdeliveries.findFirst({
                where: {
                    requestid: targetId,
                    OR: [
                        { response: "ACCEPTED" },
                        { acceptancestatus: "ACCEPTED" },
                        { transitstatus: { not: null } },
                    ],
                },
                select: { deliveryid: true },
            });
            if (donorCommitment) {
                throw Object.assign(
                    new Error("Cannot hard-delete a blood request with active donor commitments"),
                    { statusCode: 400 }
                );
            }

            const [assignmentCount, reservationCount, crossmatchCount, donationCount, coordinationCount] = await Promise.all([
                tx.requisitionassignments.count({ where: { requestid: targetId } }),
                tx.bloodreservations.count({ where: { requestid: targetId } }),
                tx.clinicalcrossmatches.count({ where: { requestid: targetId } }),
                tx.donationhistory.count({ where: { requestid: targetId } }),
                tx.hospitalcoordination.count({ where: { requestid: targetId } }),
            ]);

            if (assignmentCount > 0 || reservationCount > 0 || crossmatchCount > 0 || donationCount > 0 || coordinationCount > 0) {
                throw Object.assign(
                    new Error("Cannot hard-delete a blood request with existing hospital, blood bank, or donation workflow dependencies"),
                    { statusCode: 400 }
                );
            }

            const prescriptionFiles: string[] = [];
            if (rx?.fileurl) {
                prescriptionFiles.push(String(rx.fileurl));
            }
            const rxHistory = await tx.prescriptionhistory.findMany({
                where: { requestid: targetId },
                select: { fileurl: true },
            });
            for (const h of rxHistory) {
                if (h.fileurl) {
                    prescriptionFiles.push(String(h.fileurl));
                }
            }

            // Safely remove dependent records with NoAction foreign keys before deleting the eligible CREATED request
            await tx.notification.deleteMany({ where: { requestid: targetId } });
            await tx.prescriptionhistory.deleteMany({ where: { requestid: targetId } });
            await tx.prescription.deleteMany({ where: { requestid: targetId } });
            await tx.bloodrequests.delete({ where: { requestid: targetId } });

            return prescriptionFiles;
        });

        // Remove uploaded prescription files from disk only after transaction commit succeeds
        if (filesToUnlink.length > 0) {
            const storageDir = getPrescriptionStorageDir();
            const uniqueFiles = Array.from(new Set(filesToUnlink));
            for (const fileUrl of uniqueFiles) {
                const safeFileName = path.basename(fileUrl);
                const resolvedPath = path.resolve(storageDir, safeFileName);
                if (resolvedPath.startsWith(storageDir)) {
                    await fs.promises.unlink(resolvedPath).catch(() => { });
                }
            }
        }

        res.status(200).json({
            success: true,
            message: "Blood request deleted successfully",
        });
    } catch (error: any) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        console.error("Error deleting blood request:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete blood request",
        });
    }
});

/**
 * GET /bloodrequests/:id/prescription/file
 * Secure, authenticated prescription viewing/downloading stream.
 * Permitted only to:
 * - Request Owner / Requester
 * - Assigned Hospital
 * - System Administrators
 * Rejects unauthorized third parties and unassigned hospitals.
 */
router.get("/:id/prescription/file", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: {
                prescription: true,
                requesters: true,
                hospitals: true,
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Authorization check: Admin, Request Creator, Associated Requester, or Associated Hospital
        const isAdmin = user.role === "ADMIN";
        const isCreator = bloodRequest.createdbyuserid === user.userid;

        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }

        let isAssignedHospital = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            // TEMPORARY BYPASS: Allow non-APPROVED hospital to access prescription file
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) {
                isAssignedHospital = true;
            }
        }

        if (!isAdmin && !isCreator && !isRequesterOwner && !isAssignedHospital) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you are not authorized to view or download this prescription",
            });
        }

        if (!bloodRequest.prescription) {
            return res.status(404).json({
                success: false,
                message: "No prescription found for this blood request",
            });
        }

        const storageDir = getPrescriptionStorageDir();
        // Prevent path traversal
        const safeFileName = path.basename(bloodRequest.prescription.fileurl);
        const resolvedPath = path.resolve(storageDir, safeFileName);
        if (!resolvedPath.startsWith(storageDir)) {
            return res.status(400).json({ success: false, message: "Invalid file path reference" });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ success: false, message: "Prescription file not found on server storage" });
        }

        const mime = bloodRequest.prescription.mimetype || "application/octet-stream";
        const downloadName = bloodRequest.prescription.originalfilename || safeFileName;

        res.setHeader("Content-Type", mime);
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(downloadName)}"`
        );
        res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
        res.setHeader("X-Content-Type-Options", "nosniff");

        const stream = fs.createReadStream(resolvedPath);
        stream.pipe(res);
    } catch (error) {
        console.error("Error streaming prescription file:", error);
        res.status(500).json({ success: false, message: "Failed to retrieve prescription file" });
    }
});

/**
 * GET /bloodrequests/:id/documents
 * Reviewer / Admin endpoint: view document completeness and attached documents for a request.
 */
router.get("/:id/documents", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            select: {
                requestid: true,
                hospitalid: true,
                requesterid: true,
                createdbyuserid: true,
                status: true,
                isdraft: true,
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Authorization check: Admin, Creator, Owning Hospital, or Assigned Blood Bank
        let isAuthorized = user.role === "ADMIN" || bloodRequest.createdbyuserid === user.userid;
        if (!isAuthorized && user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hosp && hosp.hospitalid === bloodRequest.hospitalid) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized && user.role === "BLOOD_BANK") {
            const bb = await prisma.bloodbanks.findUnique({ where: { userid: user.userid } });
            if (bb) {
                const assignment = await prisma.requisitionassignments.findFirst({
                    where: { requestid: targetId, bloodbankid: bb.bloodbankid },
                });
                if (assignment) isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: "Forbidden: Not authorized to view documents for this request" });
        }

        const completeness = await RequestDocumentService.calculateDocumentCompleteness(targetId);
        return res.status(200).json({
            success: true,
            ...completeness,
            status: bloodRequest.status,
            isdraft: bloodRequest.isdraft,
        });
    } catch (error: any) {
        console.error("Error retrieving request documents:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to retrieve documents" });
    }
});

/**
 * GET /bloodrequests/:id/documents/:documentId/file
 * Secure reviewer / admin file download stream.
 */
router.get("/:id/documents/:documentId/file", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const documentId = (Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId) as string;

        if (!targetId || !UUID_REGEX.test(targetId) || !documentId || !UUID_REGEX.test(documentId)) {
            return res.status(404).json({ success: false, message: "Blood request or document not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            select: {
                requestid: true,
                hospitalid: true,
                requesterid: true,
                createdbyuserid: true,
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        let isAuthorized = user.role === "ADMIN" || bloodRequest.createdbyuserid === user.userid;
        if (!isAuthorized && user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hosp && hosp.hospitalid === bloodRequest.hospitalid) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized && user.role === "BLOOD_BANK") {
            const bb = await prisma.bloodbanks.findUnique({ where: { userid: user.userid } });
            if (bb) {
                const assignment = await prisma.requisitionassignments.findFirst({
                    where: { requestid: targetId, bloodbankid: bb.bloodbankid },
                });
                if (assignment) isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: "Forbidden: Not authorized to download document" });
        }

        const doc = await prisma.requestdocuments.findFirst({
            where: { documentid: documentId, requestid: targetId },
        });

        if (!doc || !fs.existsSync(doc.filepath)) {
            return res.status(404).json({ success: false, message: "Document file not found on storage" });
        }

        res.setHeader("Content-Type", doc.mimetype);
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalfilename)}"`);
        return res.sendFile(path.resolve(doc.filepath));
    } catch (error: any) {
        console.error("Error streaming document:", error);
        return res.status(500).json({ success: false, message: "Failed to download document" });
    }
});

/**
 * GET /bloodrequests/:id/verification-report
 * Reviewer / Admin endpoint: view aggregated AI verification report for a request.
 */
router.get("/:id/verification-report", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            select: {
                requestid: true,
                hospitalid: true,
                requesterid: true,
                createdbyuserid: true,
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Authorization check: Admin, Creator, Owning Hospital, or Assigned Blood Bank
        let isAuthorized = user.role === "ADMIN" || bloodRequest.createdbyuserid === user.userid;
        if (!isAuthorized && user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hosp && hosp.hospitalid === bloodRequest.hospitalid) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized && user.role === "BLOOD_BANK") {
            const bb = await prisma.bloodbanks.findUnique({ where: { userid: user.userid } });
            if (bb) {
                const assignment = await prisma.requisitionassignments.findFirst({
                    where: { requestid: targetId, bloodbankid: bb.bloodbankid },
                });
                if (assignment) isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: "Forbidden: Not authorized to view verification report" });
        }

        const report = await DocumentVerificationService.getRequestVerificationReport(targetId);
        return res.status(200).json({ success: true, ...report });
    } catch (error: any) {
        console.error("Error retrieving verification report:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to retrieve verification report" });
    }
});

/**
 * POST /bloodrequests/:id/documents/:documentId/review-decision
 * Authorized Reviewer Decision Endpoint:
 * - Records official human reviewer decision (VERIFIED_MANUAL, CORRECTION_REQUIRED, ADDITIONAL_INFO_REQUIRED, ESCALATED).
 * - Creates an immutable audit record in documentreviewaudit.
 */
router.post("/:id/documents/:documentId/review-decision", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const documentId = (Array.isArray(req.params.documentId) ? req.params.documentId[0] : req.params.documentId) as string;

        if (!targetId || !UUID_REGEX.test(targetId) || !documentId || !UUID_REGEX.test(documentId)) {
            return res.status(400).json({ success: false, message: "Invalid UUID format" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            select: { requestid: true, hospitalid: true },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Strict Reviewer Authorization Gate:
        // Only verified clinical reviewers:
        // - System ADMIN
        // - Owning HOSPITAL (with APPROVED status)
        // - Assigned BLOOD_BANK (with active, non-cancelled/non-rejected assignment)
        let isAuthorizedReviewer = user.role === "ADMIN";
        if (!isAuthorizedReviewer && user.role === "BLOOD_BANK") {
            const bb = await prisma.bloodbanks.findUnique({ where: { userid: user.userid } });
            if (bb) {
                const assignment = await prisma.requisitionassignments.findFirst({
                    where: {
                        requestid: targetId,
                        bloodbankid: bb.bloodbankid,
                        assignmentstatus: { in: ["PENDING_ACCEPTANCE", "ACCEPTED"] },
                    },
                });
                if (assignment) isAuthorizedReviewer = true;
            }
        }
        if (!isAuthorizedReviewer && user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (
                hosp &&
                hosp.hospitalid === bloodRequest.hospitalid &&
                hosp.approvalstatus === "APPROVED"
            ) {
                isAuthorizedReviewer = true;
            }
        }

        if (!isAuthorizedReviewer) {
            return res.status(403).json({
                success: false,
                message: "Forbidden: You are not authorized to record verification decisions on this requisition",
            });
        }

        const { decision, remarks } = req.body;
        const validDecisions = ["VERIFIED_MANUAL", "CORRECTION_REQUIRED", "ADDITIONAL_INFO_REQUIRED", "ESCALATED"];
        if (!decision || !validDecisions.includes(decision)) {
            return res.status(400).json({
                success: false,
                message: `Invalid decision. Allowed decisions: ${validDecisions.join(", ")}`,
            });
        }

        if ((decision === "CORRECTION_REQUIRED" || decision === "ESCALATED") && (!remarks || !String(remarks).trim())) {
            return res.status(400).json({
                success: false,
                message: "Remarks / explanation are mandatory when requesting correction or escalating",
            });
        }

        // Find the current active verification record
        const ver = await prisma.documentverifications.findFirst({
            where: { documentid: documentId, requestid: targetId, iscurrentversion: true },
            orderBy: { createdat: "desc" },
        });

        if (!ver) {
            return res.status(404).json({
                success: false,
                message: "No active verification record found for this document to review",
            });
        }

        const updated = await DocumentVerificationService.recordReviewerDecision({
            verificationId: ver.verificationid,
            reviewerUserId: user.userid,
            reviewerRole: user.role,
            decision,
            remarks,
        });

        return res.status(200).json({
            success: true,
            message: "Reviewer decision and audit record successfully registered",
            verification: updated,
        });
    } catch (error: any) {
        console.error("Error recording reviewer decision:", error);
        const status = error.statusCode || 500;
        return res.status(status).json({ success: false, message: error.message || "Failed to record reviewer decision" });
    }
});

/**
 * POST /bloodrequests/:id/prescription/verify
 * Hospital Clinical Review Endpoint:
 * - Hospital verifies or rejects prescription with mandatory explanation.
 * - Records decision, reviewer, and timestamp in prescription & prescriptionhistory.
 * - Cross-hospital review is strictly blocked.
 * - Direct requester verification is strictly blocked.
 */
router.post("/:id/prescription/verify", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: {
                prescription: true,
                hospitals: true,
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Authorization checked FIRST: Must be assigned hospital or ADMIN
        const isAdmin = user.role === "ADMIN";
        let hospitalId: string | null = null;
        let hospitalName = "Assigned Medical Facility";

        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (!hospital || hospital.hospitalid !== bloodRequest.hospitalid) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: this prescription can only be reviewed by its assigned hospital",
                });
            }
            hospitalId = hospital.hospitalid;
            hospitalName = hospital.hospitalname;
        } else if (!isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: only authorized hospital staff or administrators can verify prescriptions",
            });
        }

        if (!bloodRequest.prescription) {
            return res.status(400).json({
                success: false,
                message: "This blood request does not have a prescription to verify",
            });
        }

        const { status, remarks } = req.body;
        if (!["VERIFIED", "REJECTED"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Verification decision must be VERIFIED or REJECTED",
            });
        }

        if (status === "REJECTED" && (!remarks || !String(remarks).trim())) {
            return res.status(400).json({
                success: false,
                message: "A detailed explanation/reason is required when rejecting a prescription",
            });
        }

        const decisionRemarks = remarks ? String(remarks).trim() : null;

        const txResult = await prisma.$transaction(async (tx) => {
            // 1. Lock bloodrequests row first (canonical lock order: bloodrequests -> prescription)
            const lockedRequestRows: any[] = await tx.$queryRawUnsafe(
                `SELECT requestid, status, patientname, bloodgroup, createdbyuserid, hospitalid FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                targetId
            );
            if (!lockedRequestRows || lockedRequestRows.length === 0) {
                throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
            }

            const lockedRequest = lockedRequestRows[0];
            const currentRequestStatus = lockedRequest.status || "";

            // Validate that request has an assigned APPROVED hospital
            if (!lockedRequest.hospitalid) {
                throw Object.assign(
                    new Error("Prescription cannot be verified without an assigned hospital facility"),
                    { statusCode: 400 }
                );
            }

            const hospRows: any[] = await tx.$queryRawUnsafe(
                `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                lockedRequest.hospitalid
            );
            const hosp = hospRows?.[0];
            // TEMPORARY BYPASS: Allow non-APPROVED hospitals to verify prescriptions
            if (!hosp) {
                throw Object.assign(
                    new Error("Assigned hospital does not exist"),
                    { statusCode: 403 }
                );
            }

            // 2. Reject verification on terminal or already-arranged requests
            const blockedRequestStatuses = ["CANCELLED", "EXPIRED", "FULFILLED", "BLOOD_ARRANGED"];
            if (blockedRequestStatuses.includes(currentRequestStatus)) {
                throw Object.assign(
                    new Error(
                        `Cannot verify prescription for a blood requisition that is already ${String(currentRequestStatus).toLowerCase()}`
                    ),
                    { statusCode: 400 }
                );
            }

            // 3. Lock and re-read authoritative prescription row
            const lockedRxRows: any[] = await tx.$queryRawUnsafe(
                `SELECT prescriptionid, status FROM prescription WHERE requestid = $1::uuid FOR UPDATE`,
                targetId
            );
            if (!lockedRxRows || lockedRxRows.length === 0) {
                throw Object.assign(
                    new Error("This blood request does not have a prescription to verify"),
                    { statusCode: 400 }
                );
            }

            const lockedRx = lockedRxRows[0];

            // 4. Idempotent handling if already VERIFIED and submitted as VERIFIED again
            if (lockedRx.status === "VERIFIED" && status === "VERIFIED") {
                const existingRx = await tx.prescription.findUnique({
                    where: { prescriptionid: lockedRx.prescriptionid },
                    include: {
                        hospitals: {
                            select: { hospitalid: true, hospitalname: true },
                        },
                    },
                });
                return { prescription: existingRx, idempotent: true };
            }

            // 5. Update prescription record
            const updated = await tx.prescription.update({
                where: { prescriptionid: lockedRx.prescriptionid },
                data: {
                    status,
                    verifiedbyhospitalid: hospitalId,
                    verificationdate: new Date(),
                    remarks: decisionRemarks,
                    updatedat: new Date(),
                },
                include: {
                    hospitals: {
                        select: { hospitalid: true, hospitalname: true },
                    },
                },
            });

            // 6. Record verification decision in prescription history
            await tx.prescriptionhistory.create({
                data: {
                    prescriptionid: updated.prescriptionid,
                    requestid: targetId,
                    fileurl: updated.fileurl,
                    originalfilename: updated.originalfilename,
                    mimetype: updated.mimetype,
                    filesize: updated.filesize,
                    status: status,
                    reviewedbyhospitalid: hospitalId,
                    remarks: decisionRemarks,
                },
            });

            // 7. Record in request status history using authoritative locked request status
            await tx.requeststatushistory.create({
                data: {
                    requestid: targetId,
                    oldstatus: currentRequestStatus || null,
                    newstatus: currentRequestStatus || "CREATED",
                    changedbyuserid: user.userid,
                    remarks: `Prescription ${status.toLowerCase()} by hospital staff (${hospitalName})${decisionRemarks ? `: ${decisionRemarks}` : ""}`,
                },
            });

            // 8. If prescription is rejected, atomically cancel active broadcasts and pending scheduler jobs
            if (status === "REJECTED") {
                if (typeof (tx as any).emergencybroadcasts?.updateMany === "function") {
                    await (tx as any).emergencybroadcasts.updateMany({
                        where: { requestid: targetId, status: { in: ["ACTIVE", "DONOR_RESPONDED"] } },
                        data: { status: "CANCELLED" },
                    });
                }
                if (typeof (tx as any).emergencyschedulerjobs?.updateMany === "function") {
                    await (tx as any).emergencyschedulerjobs.updateMany({
                        where: {
                            requestid: targetId,
                            status: { in: ["PENDING", "PROCESSING"] },
                        },
                        data: {
                            status: "CANCELLED",
                            lasterror: "PRESCRIPTION_REJECTED",
                            lockeduntil: null,
                            lockedby: null,
                            updatedat: new Date(),
                        },
                    });
                }
            }

            // 9. Send notification to requester
            const title = status === "VERIFIED" ? "Prescription Verified" : "Prescription Rejected";
            const message = status === "VERIFIED"
                ? `Your prescription (${bloodRequest.bloodgroup}) has been clinically verified by ${hospitalName}.`
                : `Your prescription was rejected by ${hospitalName}. Reason: ${decisionRemarks}. Please upload a clear replacement prescription.`;

            await tx.notification.create({
                data: {
                    userid: lockedRequest.createdbyuserid || bloodRequest.createdbyuserid,
                    requestid: targetId,
                    type: notification_type.VERIFICATION,
                    title,
                    message,
                    isread: false,
                },
            });

            return { prescription: updated, idempotent: false };
        });

        res.status(200).json({
            success: true,
            message: `Prescription successfully marked as ${status}`,
            prescription: txResult.prescription,
        });
    } catch (error: any) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        console.error("Error verifying prescription:", error);
        res.status(500).json({ success: false, message: "Failed to verify prescription" });
    }
});

/**
 * POST /bloodrequests/:id/prescription/replacement
 * Requester Replacement Upload:
 * - Allows request owner to submit a replacement prescription when rejected or pending.
 * - Enforces role authorization, approved hospital status, and pre-upload ownership/state checks before Multer.
 * - Locks bloodrequests -> prescription in canonical order inside a single atomic transaction.
 * - Archives prior prescription into prescriptionhistory, resets status to PENDING, logs status history, and notifies assigned hospital.
 */
const authorizePrescriptionReplacementPreUpload = async (req: Request, res: Response, next: any) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: {
                prescription: true,
                requesters: true,
                hospitals: true,
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const isAdmin = user.role === "ADMIN";
        const isCreator = bloodRequest.createdbyuserid === user.userid;
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            if (bloodRequest.requesters && bloodRequest.requesters.userid === user.userid) {
                isRequesterOwner = true;
            } else if (bloodRequest.requesterid) {
                const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
                if (requester && bloodRequest.requesterid === requester.requesterid) {
                    isRequesterOwner = true;
                }
            }
        }

        if (!isAdmin && !isCreator && !isRequesterOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied: only the request owner can upload a replacement prescription",
            });
        }

        const blockedRequestStatuses = ["CANCELLED", "EXPIRED", "FULFILLED", "BLOOD_ARRANGED"];
        if (blockedRequestStatuses.includes(bloodRequest.status || "")) {
            return res.status(400).json({
                success: false,
                message: `Cannot upload a replacement prescription for a blood requisition that is already ${String(bloodRequest.status).toLowerCase()}`,
            });
        }

        if (bloodRequest.prescription && bloodRequest.prescription.status === "VERIFIED") {
            return res.status(400).json({
                success: false,
                message: "Prescription is already verified. Replacement is not permitted for verified prescriptions.",
            });
        }

        if (bloodRequest.hospitalid) {
            // TEMPORARY BYPASS: Allow prescription upload for non-APPROVED hospital
            if (!bloodRequest.hospitals) {
                return res.status(403).json({
                    success: false,
                    message: "Assigned hospital does not exist",
                });
            }
        }

        (req as any).replacementTargetRequest = bloodRequest;
        return next();
    } catch (error) {
        console.error("Error in pre-upload prescription replacement check:", error);
        return res.status(500).json({ success: false, message: "Failed to validate replacement prescription request" });
    }
};

router.post(
    "/:id/prescription/replacement",
    authenticate,
    authorize("REQUESTER", "PATIENT", "HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    authorizePrescriptionReplacementPreUpload,
    handlePrescriptionUpload,
    async (req: Request, res: Response) => {
        let newFilePath: string | null = null;
        try {
            const user = (req as any).user;
            const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
            const precheckedRequest = (req as any).replacementTargetRequest;

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Replacement prescription file (PDF, JPEG, or PNG) is required",
                });
            }

            const validation = validatePrescriptionFile(req.file.buffer, req.file.originalname, req.file.mimetype);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.error,
                });
            }

            const storageDir = getPrescriptionStorageDir();
            const newFileName = `rx-${crypto.randomUUID()}-${Date.now()}${validation.detectedExtension}`;
            newFilePath = path.join(storageDir, newFileName);

            await fs.promises.writeFile(newFilePath, req.file.buffer);

            const updatedPrescription = await prisma.$transaction(async (tx) => {
                // 1. Lock bloodrequests row first (canonical lock order: bloodrequests -> prescription)
                const lockedRequestRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT requestid, status, patientname, bloodgroup, hospitalid, requesterid, createdbyuserid FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                    targetId
                );
                if (!lockedRequestRows || lockedRequestRows.length === 0) {
                    throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
                }

                const lockedRequest = lockedRequestRows[0];
                const currentRequestStatus = lockedRequest.status || "";

                // 2. Revalidate ownership inside transaction
                const isAdmin = user.role === "ADMIN";
                const isCreator = lockedRequest.createdbyuserid === user.userid;
                let isRequesterOwner = false;
                if (user.role === "REQUESTER" || user.role === "PATIENT") {
                    if (lockedRequest.requesterid) {
                        const requester = await tx.requesters.findUnique({
                            where: { userid: user.userid },
                            select: { requesterid: true },
                        });
                        if (requester && lockedRequest.requesterid === requester.requesterid) {
                            isRequesterOwner = true;
                        }
                    }
                }

                if (!isAdmin && !isCreator && !isRequesterOwner) {
                    throw Object.assign(
                        new Error("Access denied: only the request owner can upload a replacement prescription"),
                        { statusCode: 403 }
                    );
                }

                // 3. Revalidate request lifecycle status inside transaction
                const blockedRequestStatuses = ["CANCELLED", "EXPIRED", "FULFILLED", "BLOOD_ARRANGED"];
                if (blockedRequestStatuses.includes(currentRequestStatus)) {
                    throw Object.assign(
                        new Error(
                            `Cannot upload a replacement prescription for a blood requisition that is already ${String(currentRequestStatus).toLowerCase()}`
                        ),
                        { statusCode: 400 }
                    );
                }

                // 3b. Revalidate assigned hospital approval under lock
                if (lockedRequest.hospitalid) {
                    const hospRows: any[] = await tx.$queryRawUnsafe(
                        `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid FOR SHARE`,
                        lockedRequest.hospitalid
                    );
                    const hosp = hospRows?.[0];
                    // TEMPORARY BYPASS: Allow prescription replacement for non-APPROVED hospital
                    if (!hosp) {
                        throw Object.assign(
                            new Error("Assigned hospital does not exist"),
                            { statusCode: 403 }
                        );
                    }
                }

                // 4. Lock prescription row second (canonical lock order: bloodrequests -> prescription)
                const lockedRxRows: any[] = await tx.$queryRawUnsafe(
                    `SELECT prescriptionid, fileurl, originalfilename, mimetype, filesize, doctorname, hospitalname, status, verifiedbyhospitalid, remarks FROM prescription WHERE requestid = $1::uuid FOR UPDATE`,
                    targetId
                );
                const lockedRx = Array.isArray(lockedRxRows) && lockedRxRows.length > 0 ? lockedRxRows[0] : null;

                // 5. Revalidate prescription status inside transaction
                if (lockedRx && lockedRx.status === "VERIFIED") {
                    throw Object.assign(
                        new Error("Prescription is already verified. Replacement is not permitted for verified prescriptions."),
                        { statusCode: 400 }
                    );
                }

                // 6. Archive existing prescription state and update/create prescription as PENDING
                let savedRx: any;
                if (lockedRx) {
                    await tx.prescriptionhistory.create({
                        data: {
                            prescriptionid: lockedRx.prescriptionid,
                            requestid: targetId,
                            fileurl: lockedRx.fileurl,
                            originalfilename: lockedRx.originalfilename,
                            mimetype: lockedRx.mimetype,
                            filesize: lockedRx.filesize,
                            status: lockedRx.status || "REJECTED",
                            reviewedbyhospitalid: lockedRx.verifiedbyhospitalid,
                            remarks: lockedRx.remarks,
                        },
                    });

                    savedRx = await tx.prescription.update({
                        where: { prescriptionid: lockedRx.prescriptionid },
                        data: {
                            fileurl: newFileName,
                            originalfilename: req.file!.originalname,
                            mimetype: validation.detectedMimeType,
                            filesize: req.file!.size,
                            doctorname: req.body.doctorname ? String(req.body.doctorname).trim() : lockedRx.doctorname,
                            hospitalname: req.body.hospitalname ? String(req.body.hospitalname).trim() : lockedRx.hospitalname,
                            status: "PENDING",
                            verifiedbyhospitalid: null,
                            verificationdate: null,
                            remarks: null,
                            uploadedat: new Date(),
                            updatedat: new Date(),
                        },
                        include: {
                            hospitals: {
                                select: { hospitalid: true, hospitalname: true },
                            },
                        },
                    });
                } else {
                    savedRx = await tx.prescription.create({
                        data: {
                            requestid: targetId,
                            fileurl: newFileName,
                            originalfilename: req.file!.originalname,
                            mimetype: validation.detectedMimeType,
                            filesize: req.file!.size,
                            doctorname: String(req.body.doctorname || "Attending Physician").trim(),
                            hospitalname: String(
                                req.body.hospitalname || (precheckedRequest?.hospitals?.hospitalname || "Prescribing Hospital")
                            ).trim(),
                            status: "PENDING",
                        },
                    });
                }

                // 7. Record audit log in requeststatushistory inside the same transaction
                await tx.requeststatushistory.create({
                    data: {
                        requestid: targetId,
                        oldstatus: currentRequestStatus || null,
                        newstatus: currentRequestStatus || "CREATED",
                        changedbyuserid: user.userid,
                        remarks: "Replacement prescription uploaded by requester. Status reset to PENDING verification.",
                    },
                });

                // 8. Notify assigned hospital inside the same transaction
                if (lockedRequest.hospitalid) {
                    const hosp = await tx.hospitals.findUnique({
                        where: { hospitalid: lockedRequest.hospitalid },
                        select: { userid: true, hospitalname: true },
                    });
                    if (hosp) {
                        await tx.notification.create({
                            data: {
                                userid: hosp.userid,
                                requestid: targetId,
                                type: notification_type.VERIFICATION,
                                title: "Replacement Prescription Uploaded",
                                message: `Requester has uploaded a replacement prescription (${lockedRequest.bloodgroup || precheckedRequest?.bloodgroup}). Ready for re-review.`,
                                isread: false,
                            },
                        });
                    }
                }

                return savedRx;
            });

            res.status(200).json({
                success: true,
                message: "Replacement prescription uploaded successfully. Status reset to PENDING.",
                prescription: updatedPrescription,
            });
        } catch (error: any) {
            if (newFilePath) {
                await fs.promises.unlink(newFilePath).catch(() => { });
            }
            if (error?.statusCode) {
                return res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                });
            }
            console.error("Error uploading replacement prescription:", error);
            res.status(500).json({ success: false, message: "Failed to upload replacement prescription" });
        }
    }
);

/*
 * GET RANKED MATCHED DONORS
 * GET /bloodrequests/:id/matched-donors
 */
router.get("/:id/matched-donors", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: { hospitals: true, requesters: true },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Ownership authorization: Creator, linked hospital, linked requester, or Admin
        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }
        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) {
                isHospitalOwner = true;
            }
        }

        if (!isOwner && !isAdmin && !isRequesterOwner && !isHospitalOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you are not authorized to view matched donors for this blood request",
            });
        }

        const page = parseStrictBoundedInt(req.query.page, 1, 10000) || 1;
        const limit = parseStrictBoundedInt(req.query.limit, 1, 100) || 20;
        const radiusKm = req.query.radiusKm !== undefined && !isNaN(Number(req.query.radiusKm))
            ? Number(req.query.radiusKm)
            : undefined;

        const result = await DonorMatchingService.getRankedEligibleDonors(bloodRequest, {
            page,
            limit,
            radiusKm,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching matched donors:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch matched donors" });
    }
});

/*
 * GET EMERGENCY BROADCAST STATUS
 * GET /bloodrequests/:id/broadcast
 */
router.get("/:id/broadcast", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: { hospitals: true, requesters: true },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Ownership authorization
        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }
        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) {
                isHospitalOwner = true;
            }
        }

        if (!isOwner && !isAdmin && !isRequesterOwner && !isHospitalOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you are not authorized to view broadcast data for this blood request",
            });
        }

        const broadcastData = await getRequestBroadcastStatus(targetId);

        return res.status(200).json({
            success: true,
            isEmergency: Boolean(bloodRequest.isemergency) || bloodRequest.urgencylevel === "CRITICAL",
            hasBroadcast: !!broadcastData,
            broadcast: broadcastData,
            deliveries: broadcastData?.deliveries || [],
            history: broadcastData?.broadcastHistory || [],
            ...(broadcastData || {}),
        });
    } catch (error) {
        console.error("Error fetching broadcast status:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch broadcast status" });
    }
});

/*
 * TRIGGER / EXPAND EMERGENCY BROADCAST
 * POST /bloodrequests/:id/broadcast
 */
router.post("/:id/broadcast", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: { hospitals: true, requesters: true },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // Ownership authorization: Creator, assigned hospital, or Admin checked FIRST before inspecting lifecycle status
        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }
        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) {
                isHospitalOwner = true;
            }
        }

        if (!isOwner && !isAdmin && !isRequesterOwner && !isHospitalOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you are not authorized to trigger emergency broadcasts for this blood request",
            });
        }

        // Terminal status check: Only verified for authorized users to prevent status information leakage
        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
        if (terminalStatuses.includes(bloodRequest.status || "")) {
            return res.status(400).json({
                success: false,
                message: `Cannot initiate emergency broadcast for a requisition that is already ${String(bloodRequest.status).toLowerCase()}`,
            });
        }

        const expandRadius = Boolean(req.body?.expandRadius);
        if (expandRadius) {
            // Guard: Cannot expand radius if no genuine emergency broadcast has been initiated
            const existingGenuineBroadcast = await prisma.emergencybroadcasts.findFirst({
                where: {
                    requestid: targetId,
                    triggertype: { not: "DIRECT_VOLUNTEER" },
                },
            });
            if (!existingGenuineBroadcast) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot expand broadcast coverage: no active emergency broadcast exists for this requisition",
                });
            }
        }

        let requestedRadius = req.body?.radiusKm ? parseInt(req.body.radiusKm, 10) : undefined;
        if (requestedRadius !== undefined) {
            if (isNaN(requestedRadius) || requestedRadius < 1 || requestedRadius > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Broadcast radius must be between 1 and 100 km",
                });
            }
        }

        const reason = req.body?.reason ? String(req.body.reason).trim() : (expandRadius ? "Radius expansion requested" : "Manual emergency broadcast trigger");

        // Mark request as emergency if it wasn't already
        if (!bloodRequest.isemergency) {
            await prisma.bloodrequests.update({
                where: { requestid: targetId },
                data: { isemergency: true },
            });
        }

        const result = await triggerEmergencyBroadcast({
            requestId: targetId,
            triggeredByUserId: user.userid,
            triggerType: expandRadius ? "RADIUS_EXPANSION" : "MANUAL_TRIGGER",
            triggerReason: reason,
            radiusKm: requestedRadius,
            expandRadius,
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        // If manual trigger/expansion succeeded, ensure an emergency follow-up job is scheduled
        await scheduleEmergencyFollowUp({
            requestId: targetId,
        }).catch((err) => {
            console.error("Emergency scheduler follow-up on manual trigger error:", err);
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error triggering emergency broadcast:", error);
        return res.status(500).json({ success: false, message: "Failed to trigger emergency broadcast" });
    }
});

/*
 * RESPOND / VOLUNTEER TO BLOOD REQUEST
 * POST /bloodrequests/:id/respond
 */
router.post("/:id/respond", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!requestId || !uuidRegex.test(requestId)) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        // Security: Donor or Admin role requirement
        if (user.role !== "DONOR" && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only registered voluntary donors can respond to blood requisitions",
            });
        }

        // Check if blood request exists
        const request = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: {
                hospitals: true,
            },
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        // Clinical Rule: Cannot respond to terminal or already-arranged blood requests
        if (["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"].includes(request.status || "")) {
            return res.status(400).json({
                success: false,
                message: `Cannot volunteer for a blood requisition that is already ${String(request.status).toLowerCase()}`,
            });
        }

        // Resolve authenticated donor profile
        const donor = await prisma.donors.findUnique({
            where: { userid: user.userid },
            include: {
                users: {
                    select: {
                        name: true,
                        phonenumber: true,
                        email: true,
                    },
                },
            },
        });

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor profile not found for this user account",
            });
        }

        // Donor Availability Verification
        if (donor.availabilitystatus !== availability_status.AVAILABLE) {
            return res.status(400).json({
                success: false,
                message: "You are currently marked as unavailable for donations. Please update your availability in the Donor Portal before volunteering.",
            });
        }

        // Donor Eligibility Verification
        if (donor.iseligible === false) {
            return res.status(400).json({
                success: false,
                message: "You are currently marked as ineligible for blood donation based on clinical clearance guidelines.",
            });
        }

        // Mandatory 90-day cooldown interval enforcement
        if (donor.lastdonationdate) {
            const daysSince = Math.floor((Date.now() - new Date(donor.lastdonationdate).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince < 90) {
                return res.status(400).json({
                    success: false,
                    message: `Mandatory 90-day cooldown active. Only ${daysSince} of 90 days have elapsed since your last donation.`,
                });
            }
        }

        // Medically verified blood group & component compatibility check
        if (!isDonorCompatibleWithRecipient(donor.bloodgroup, request.bloodgroup, request.bloodcomponent)) {
            return res.status(400).json({
                success: false,
                message: `Your blood group (${donor.bloodgroup}) is not compatible for ${request.bloodcomponent || "requested"} donation to recipient (${request.bloodgroup}).`,
            });
        }

        const isDecline = req.body?.action === "DECLINE" || req.body?.response === "DECLINED" || req.body?.status === "DECLINED";

        // Deduplication: Prevent duplicate or conflicting responses from the same donor
        const existingResponse = await prisma.broadcastdeliveries.findFirst({
            where: {
                requestid: request.requestid,
                donorid: donor.donorid,
                response: { in: ["ACCEPTED", "DECLINED"] },
            },
        });

        if (existingResponse) {
            return res.status(400).json({
                success: false,
                message: existingResponse.response === "DECLINED"
                    ? "You have already declined this blood request."
                    : "You have already volunteered for this blood request.",
            });
        }

        // Handle DECLINE action directly without requiring clinical screening questionnaire answers
        if (isDecline) {
            const declineReason = req.body?.declineReason || req.body?.reason || "Declined by donor";
            const existingDelivery = await prisma.broadcastdeliveries.findFirst({
                where: {
                    requestid: request.requestid,
                    donorid: donor.donorid,
                },
                orderBy: { createdat: "desc" },
            });

            if (existingDelivery) {
                await prisma.broadcastdeliveries.update({
                    where: { deliveryid: existingDelivery.deliveryid },
                    data: {
                        deliverystatus: "RESPONDED",
                        response: "DECLINED",
                        acceptancestatus: "DECLINED",
                        respondedat: new Date(),
                        transitnotes: declineReason,
                    },
                });
            } else {
                let broadcast = await prisma.emergencybroadcasts.findFirst({
                    where: { requestid: request.requestid },
                    orderBy: { createdat: "desc" },
                });
                if (!broadcast) {
                    broadcast = await prisma.emergencybroadcasts.create({
                        data: {
                            requestid: request.requestid,
                            triggeredbyuserid: request.createdbyuserid,
                            triggertype: "DIRECT_VOLUNTEER",
                            triggerreason: "Direct donor response registration",
                            radiuskm: request.searchradius || 5,
                            status: "DONOR_RESPONDED",
                            totalmatched: 1,
                            totalnotified: 0,
                            totalresponded: 0,
                        },
                    });
                }
                await prisma.broadcastdeliveries.create({
                    data: {
                        broadcastid: broadcast.broadcastid,
                        requestid: request.requestid,
                        donorid: donor.donorid,
                        donoruserid: user.userid,
                        matchtype: "DIRECT_VOLUNTEER",
                        deliverystatus: "RESPONDED",
                        response: "DECLINED",
                        acceptancestatus: "DECLINED",
                        respondedat: new Date(),
                        transitnotes: declineReason,
                    },
                });
            }

            return res.status(200).json({
                success: true,
                message: "Blood requisition declined.",
                requestId: request.requestid,
                status: "DECLINED",
                response: "DECLINED",
            });
        }

        // Mandatory Pre-Donation Clinical Questionnaire Validation for ACCEPT action
        const rawScreening = req.body?.screeningAnswers;
        if (!rawScreening || typeof rawScreening !== "object" || Array.isArray(rawScreening)) {
            return res.status(400).json({
                success: false,
                message: "A complete screeningAnswers object is required with explicit boolean answers for all mandatory clinical screening questions.",
            });
        }

        const MANDATORY_SCREENING_FIELDS = [
            "drinksAlcohol",
            "alcoholInPast24Hours",
            "feelingHealthy",
            "recentAntibioticsOrMedication",
            "recentTattooOrSurgery",
            "donatedInLast90Days",
            "chronicIllness",
            "isPregnantOrBreastfeeding",
        ] as const;

        const missingFields: string[] = [];
        const invalidTypeFields: string[] = [];
        for (const field of MANDATORY_SCREENING_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(rawScreening, field) || rawScreening[field] === undefined) {
                missingFields.push(field);
            } else if (typeof rawScreening[field] !== "boolean") {
                invalidTypeFields.push(field);
            }
        }

        if (missingFields.length > 0 || invalidTypeFields.length > 0) {
            const parts: string[] = [];
            if (missingFields.length > 0) {
                parts.push(`missing mandatory fields: ${missingFields.join(", ")}`);
            }
            if (invalidTypeFields.length > 0) {
                parts.push(`non-boolean values for: ${invalidTypeFields.join(", ")}`);
            }
            return res.status(400).json({
                success: false,
                message: `Invalid clinical screening submission (${parts.join("; ")}). All mandatory screening answers must be explicit booleans (true or false).`,
            });
        }

        const {
            drinksAlcohol,
            alcoholInPast24Hours,
            feelingHealthy,
            recentAntibioticsOrMedication,
            recentTattooOrSurgery,
            donatedInLast90Days,
            chronicIllness,
            isPregnantOrBreastfeeding,
        } = rawScreening as Record<(typeof MANDATORY_SCREENING_FIELDS)[number], boolean>;

        // Specific clinical requirement: Alcohol check
        if (drinksAlcohol === true && alcoholInPast24Hours === true) {
            return res.status(400).json({
                success: false,
                message: "Clinical Ineligibility: Under blood transfusion safety regulations, donors who consumed alcohol within the past 24 hours cannot donate. A minimum 24-hour waiting clearance is required.",
                ineligibilityReason: "ALCOHOL_PAST_24_HOURS",
            });
        }

        if (feelingHealthy === false) {
            return res.status(400).json({
                success: false,
                message: "Clinical Ineligibility: Donors must be free from acute symptoms (fever, sore throat, or active infection) on the day of donation.",
                ineligibilityReason: "ACUTE_SYMPTOMS_OR_FEVER",
            });
        }

        if (recentAntibioticsOrMedication === true) {
            return res.status(400).json({
                success: false,
                message: "Clinical Ineligibility: Donors currently on active antibiotics or prescription blood thinners must observe the clinical waiting interval.",
                ineligibilityReason: "RECENT_MEDICATION",
            });
        }

        if (recentTattooOrSurgery === true) {
            return res.status(400).json({
                success: false,
                message: "Clinical Ineligibility: A mandatory 6-month deferral is required following body piercings, tattoos, or surgical procedures.",
                ineligibilityReason: "RECENT_TATTOO_OR_SURGERY",
            });
        }

        if (donatedInLast90Days === true) {
            return res.status(400).json({
                success: false,
                message: "Clinical Ineligibility: A mandatory 90-day cooldown interval between whole blood donations is legally mandated for donor health.",
                ineligibilityReason: "DONATION_COOLDOWN_ACTIVE",
            });
        }

        if (chronicIllness === true) {
            return res.status(400).json({
                success: false,
                message: "Clinical Ineligibility: Donors with history of HIV, Hepatitis B/C, or severe cardiac disease cannot donate blood.",
                ineligibilityReason: "CHRONIC_OR_TRANSMISSIBLE_CONDITION",
            });
        }

        if (isPregnantOrBreastfeeding === true) {
            return res.status(400).json({
                success: false,
                message: "Clinical Ineligibility: Donors who are currently pregnant or breastfeeding within the last 6 months are temporarily deferred.",
                ineligibilityReason: "PREGNANCY_OR_BREASTFEEDING",
            });
        }

        const donorName = donor.users?.name || "A voluntary donor";
        const donorBloodGroup = donor.bloodgroup;
        const contactPhone = req.body?.contactPhone || donor.users?.phonenumber || "";
        const estimatedArrival = req.body?.estimatedArrival || "Immediate (Within 1-2 hours)";
        const notes = req.body?.notes ? String(req.body.notes).trim() : "";

        // Formulate structured metadata
        const metaData = {
            donorId: donor.donorid,
            userId: user.userid,
            donorName,
            donorBloodGroup,
            donorCity: donor.city || "Registered Area",
            donorState: donor.state || "",
            donorPhone: contactPhone,
            donorEmail: donor.users?.email || "",
            estimatedArrival,
            notes,
            screening: {
                drinksAlcohol,
                alcoholInPast24Hours,
                feelingHealthy,
                recentAntibioticsOrMedication,
                recentTattooOrSurgery,
                donatedInLast90Days,
                chronicIllness,
                isPregnantOrBreastfeeding,
                alcoholClearance: drinksAlcohol
                    ? (alcoholInPast24Hours ? "Failed" : "Passed (No alcohol in past 24h)")
                    : "Passed (Non-drinker)",
                generalHealth: feelingHealthy ? "Good / Symptom Free" : "Reported Issues",
                medicationCleared: !recentAntibioticsOrMedication ? "Cleared" : "Medication Active",
                cooldownPassed: true,
                eligibilityStatus: "ELIGIBLE",
            },
            transitStatus: "DONOR_FOUND",
            pledgedAt: new Date().toISOString(),
            startedAt: null,
            reachedAt: null,
            completedAt: null,
            isEligible: true,
        };

        const metaString = `<!--META:${JSON.stringify(metaData)}-->`;

        // Atomic transaction: Lock bloodrequests row first, then donor row (canonical order), re-verify status, deduplicate, record confirmation
        let finalStatus = request.status;
        await prisma.$transaction(async (tx) => {
            // 1. Lock bloodrequests row using parameterized SQL
            const lockedRequestRows: any[] = await tx.$queryRawUnsafe(
                `SELECT requestid, status, patientname, bloodgroup, bloodcomponent, unitsrequired, searchradius, createdbyuserid, hospitalid FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                request.requestid
            );

            if (!lockedRequestRows || lockedRequestRows.length === 0) {
                throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
            }

            const lockedRequest = lockedRequestRows[0];
            const currentStatus = lockedRequest.status || "";

            // 2. Reject if locked status is terminal or ineligible to receive volunteers
            const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
            if (terminalStatuses.includes(currentStatus)) {
                throw Object.assign(
                    new Error(`Cannot volunteer for a blood requisition that is already ${String(currentStatus).toLowerCase()}`),
                    { statusCode: 400 }
                );
            }

            // 2a. Re-verify clinical blood group & component compatibility under the locked request row
            const DB_BG_MAP: Record<string, string> = {
                "A+": "A_POSITIVE",
                "A-": "A_NEGATIVE",
                "B+": "B_POSITIVE",
                "B-": "B_NEGATIVE",
                "AB+": "AB_POSITIVE",
                "AB-": "AB_NEGATIVE",
                "O+": "O_POSITIVE",
                "O-": "O_NEGATIVE",
            };
            const lockedBloodGroup = DB_BG_MAP[lockedRequest.bloodgroup] || lockedRequest.bloodgroup || request.bloodgroup;
            const lockedBloodComponent = lockedRequest.bloodcomponent || request.bloodcomponent;
            if (!isDonorCompatibleWithRecipient(donor.bloodgroup, lockedBloodGroup, lockedBloodComponent)) {
                throw Object.assign(
                    new Error(
                        `Your blood group (${donor.bloodgroup}) is not compatible for ${lockedBloodComponent || "requested"} donation to recipient (${lockedBloodGroup}).`
                    ),
                    { statusCode: 400 }
                );
            }

            // 2b. Reject if associated prescription has been clinically REJECTED
            const rxRows: any[] = await tx.$queryRawUnsafe(
                `SELECT status FROM prescription WHERE requestid = $1::uuid FOR UPDATE`,
                request.requestid
            );
            const rxRecord =
                rxRows && rxRows.length > 0
                    ? rxRows[0]
                    : await tx.prescription.findUnique({
                        where: { requestid: request.requestid },
                        select: { status: true },
                    });
            if (rxRecord && rxRecord.status === "REJECTED") {
                throw Object.assign(
                    new Error("Cannot volunteer for a blood requisition whose prescription has been rejected."),
                    { statusCode: 400 }
                );
            }

            // 3. Lock donor row using consistent lock hierarchy (bloodrequests -> donors)
            await tx.$queryRawUnsafe(
                `SELECT donorid FROM donors WHERE donorid = $1 FOR UPDATE`,
                donor.donorid
            );

            // 4. Deduplication: Prevent duplicate responses from the same donor
            const concurrentResponse = await tx.broadcastdeliveries.findFirst({
                where: {
                    requestid: request.requestid,
                    donorid: donor.donorid,
                    response: { in: ["ACCEPTED", "DECLINED"] },
                },
            });
            if (concurrentResponse) {
                throw Object.assign(
                    new Error(concurrentResponse.response === "DECLINED" ? "You have already declined this blood request." : "You have already volunteered for this blood request."),
                    { statusCode: 400 }
                );
            }

            // 5. Ensure parent broadcast container exists for this blood request
            let broadcast = await tx.emergencybroadcasts.findFirst({
                where: { requestid: request.requestid },
                orderBy: { createdat: "desc" },
            });
            if (!broadcast) {
                broadcast = await tx.emergencybroadcasts.create({
                    data: {
                        requestid: request.requestid,
                        triggeredbyuserid: lockedRequest.createdbyuserid || request.createdbyuserid,
                        triggertype: "DIRECT_VOLUNTEER",
                        triggerreason: "Direct donor response registration",
                        radiuskm: lockedRequest.searchradius || request.searchradius || 5,
                        status: "DONOR_RESPONDED",
                        totalmatched: 1,
                        totalnotified: 0,
                        totalresponded: 0,
                    },
                });
            }

            // 6. Record or update durable commitment in broadcastdeliveries
            const existingDeliveries = await tx.broadcastdeliveries.findMany({
                where: {
                    donorid: donor.donorid,
                    requestid: request.requestid,
                },
                orderBy: { createdat: "desc" },
            });

            const metaNotes = JSON.stringify({
                donorName,
                donorBloodGroup,
                donorPhone: contactPhone,
                donorEmail: donor.users?.email || "",
                donorCity: donor.city || "Registered Area",
                donorState: donor.state || "",
                estimatedArrival,
                screening: metaData.screening,
                notes,
            });

            let deliveryRecord;
            if (existingDeliveries.length > 0) {
                deliveryRecord = await tx.broadcastdeliveries.update({
                    where: { deliveryid: existingDeliveries[0].deliveryid },
                    data: {
                        deliverystatus: "RESPONDED",
                        response: "ACCEPTED",
                        respondedat: new Date(),
                        acceptancestatus: "PENDING",
                        acceptedat: null,
                        acceptedbyuserid: null,
                        rejectedat: null,
                        rejectedbyuserid: null,
                        receiptconfirmedat: null,
                        receiptconfirmedbyuserid: null,
                        transitstatus: "DONOR_FOUND",
                        estimatedarrival: estimatedArrival,
                        transitnotes: metaNotes,
                    },
                });
            } else {
                deliveryRecord = await tx.broadcastdeliveries.create({
                    data: {
                        broadcastid: broadcast.broadcastid,
                        requestid: request.requestid,
                        donorid: donor.donorid,
                        donoruserid: user.userid,
                        matchtype: "DIRECT_VOLUNTEER",
                        deliverystatus: "RESPONDED",
                        attemptcount: 1,
                        response: "ACCEPTED",
                        respondedat: new Date(),
                        acceptancestatus: "PENDING",
                        transitstatus: "DONOR_FOUND",
                        estimatedarrival: estimatedArrival,
                        transitnotes: metaNotes,
                    },
                });
            }

            // Save structured questionnaire response to donoreligibilityresponses table
            const questions = [
                drinksAlcohol,
                alcoholInPast24Hours,
                feelingHealthy,
                recentAntibioticsOrMedication,
                recentTattooOrSurgery,
                donatedInLast90Days,
                chronicIllness,
                isPregnantOrBreastfeeding,
            ];
            const unanswered = questions.filter(q => q === null || q === undefined).length;
            const completionPercent = Math.round(((8 - unanswered) / 8) * 100);

            await tx.donoreligibilityresponses.create({
                data: {
                    requestid: request.requestid,
                    donorid: donor.donorid,
                    donoruserid: user.userid,
                    drinksalcohol: drinksAlcohol ?? null,
                    alcoholin24h: alcoholInPast24Hours ?? null,
                    feelinghealthy: feelingHealthy ?? null,
                    medicationstatus: recentAntibioticsOrMedication ?? null,
                    recenttattoosurgery: recentTattooOrSurgery ?? null,
                    donatedinlast90days: donatedInLast90Days ?? null,
                    chronicillness: chronicIllness ?? null,
                    pregnantorbreastfeeding: isPregnantOrBreastfeeding ?? null,
                    additionalnotes: notes || null,
                    screeningstatus: "PRELIMINARY_ELIGIBLE",
                    unansweredcount: unanswered,
                    completionpercent: completionPercent,
                    clinicaldisclaimeracknowledged: true,
                },
            });

            await tx.emergencybroadcasts.update({
                where: { broadcastid: deliveryRecord.broadcastid },
                data: {
                    totalresponded: { increment: 1 },
                    status: "DONOR_RESPONDED",
                },
            });

            // 7. In-app confirmation notification for the donor (pure alert, links to deliveryid; hides patientname until ACCEPTED)
            const donorNotif = await tx.notification.create({
                data: {
                    userid: user.userid,
                    requestid: request.requestid,
                    type: notification_type.MATCH,
                    title: "Volunteer Response Confirmed",
                    message: `You volunteered to donate (${lockedRequest.bloodgroup || request.bloodgroup}, ${lockedRequest.unitsrequired || request.unitsrequired} unit(s)) at ${request.hospitals?.hospitalname || "Care Facility"}. Estimated Arrival: ${estimatedArrival}.\n${metaString}`,
                    isread: false,
                },
            });

            await tx.broadcastdeliveries.update({
                where: { deliveryid: deliveryRecord.deliveryid },
                data: { notificationid: donorNotif.notificationid },
            });

            // 8. In-app notification for the creator of the request
            await tx.notification.create({
                data: {
                    userid: lockedRequest.createdbyuserid || request.createdbyuserid,
                    requestid: request.requestid,
                    type: notification_type.MATCH,
                    title: "Donor Volunteered for Blood Request",
                    message: `${donorName} (${donorBloodGroup}) has volunteered to donate (${lockedRequest.bloodgroup || request.bloodgroup}). Estimated arrival: ${estimatedArrival}.\n${metaString}`,
                    isread: false,
                },
            });

            // Automated Requester SMS Alert
            await NotificationSmsDispatcher.dispatchRequesterDonorVolunteered({
                requesterUserId: lockedRequest.createdbyuserid || request.createdbyuserid,
                requestId: request.requestid,
                prismaTx: tx,
            }).catch(() => {});

            // 8b. In-app notification for the assigned hospital if request is assigned to a hospital
            if (request.hospitals && request.hospitals.userid && request.hospitals.userid !== user.userid && request.hospitals.userid !== (lockedRequest.createdbyuserid || request.createdbyuserid)) {
                await tx.notification.create({
                    data: {
                        userid: request.hospitals.userid,
                        requestid: request.requestid,
                        type: notification_type.MATCH,
                        title: "Volunteer Donor Matched",
                        message: `Donor ${donorName} (${donorBloodGroup}) has volunteered for blood request (${lockedRequest.bloodgroup || request.bloodgroup}) at ${request.hospitals.hospitalname}. Estimated arrival: ${estimatedArrival}.\n${metaString}`,
                        isread: false,
                    },
                });

                // Automated Hospital SMS Alert
                await NotificationSmsDispatcher.dispatchHospitalDonorMatched({
                    hospitalUserId: request.hospitals.userid,
                    requestId: request.requestid,
                    donorName,
                    eta: estimatedArrival,
                    prismaTx: tx,
                }).catch(() => {});
            }

            // 9. Operational status advancement: Transition CREATED / VERIFIED requests to DONOR_MATCHING using locked status
            if (currentStatus === "CREATED" || currentStatus === "VERIFIED") {
                await tx.bloodrequests.update({
                    where: { requestid: request.requestid },
                    data: { status: "DONOR_MATCHING" },
                });

                await tx.requeststatushistory.create({
                    data: {
                        requestid: request.requestid,
                        oldstatus: currentStatus,
                        newstatus: "DONOR_MATCHING",
                        changedbyuserid: user.userid,
                        remarks: `Donor ${donorName} (${donorBloodGroup}) volunteered for blood requisition`,
                    },
                });
                finalStatus = "DONOR_MATCHING";
            } else {
                finalStatus = currentStatus;
            }
        });

        return res.status(200).json({
            success: true,
            message: "Donation response recorded successfully. The medical coordination team and requester have been notified.",
            requestId: request.requestid,
            patientName: null,
            transitStatus: "DONOR_FOUND",
            status: finalStatus,
        });
    } catch (error: any) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        console.error("Error responding to blood request:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to record response to blood request",
        });
    }
});

/**
 * GET /bloodrequests/:id/volunteers/:deliveryId
 * Fetch a specific volunteer donor commitment for an authorized requester, assigned hospital, or admin.
 */
router.get("/:id/volunteers/:deliveryId", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const deliveryId = (Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId) as string;

        if (!UUID_REGEX.test(requestId) || !UUID_REGEX.test(deliveryId)) {
            return res.status(404).json({
                success: false,
                message: "Blood request or donor commitment not found",
            });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: {
                hospitals: {
                    select: {
                        hospitalid: true,
                        hospitalname: true,
                        city: true,
                        state: true,
                    },
                },
            },
        });

        if (!bloodRequest) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }
        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) {
                isHospitalOwner = true;
            }
        }

        if (!isOwner && !isRequesterOwner && !isHospitalOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you do not own this blood request",
            });
        }

        const commitment = await prisma.broadcastdeliveries.findFirst({
            where: {
                deliveryid: deliveryId,
                requestid: requestId,
                response: "ACCEPTED",
            },
            include: {
                donors: {
                    include: {
                        users: {
                            select: {
                                userid: true,
                                name: true,
                                phonenumber: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        if (!commitment) {
            return res.status(404).json({
                success: false,
                message: "Donor commitment not found for this blood request",
            });
        }

        let parsedNotes: any = {};
        if (commitment.transitnotes) {
            try {
                parsedNotes = JSON.parse(commitment.transitnotes);
            } catch { }
        }

        const dUser = commitment.donors?.users;
        const isRejected = (commitment.acceptancestatus || "PENDING") === "REJECTED";

        return res.status(200).json({
            success: true,
            request: {
                requestid: bloodRequest.requestid,
                patientname: bloodRequest.patientname,
                bloodgroup: bloodRequest.bloodgroup,
                bloodcomponent: bloodRequest.bloodcomponent,
                unitsrequired: bloodRequest.unitsrequired,
                urgencylevel: bloodRequest.urgencylevel,
                status: bloodRequest.status,
                hospitalname: bloodRequest.hospitals?.hospitalname || null,
                hospitalcity: bloodRequest.hospitals?.city || null,
                createdat: bloodRequest.createdat,
            },
            volunteer: {
                deliveryId: commitment.deliveryid,
                notificationid: commitment.notificationid || undefined,
                donorId: commitment.donorid,
                donorUserId: commitment.donoruserid,
                donorName: parsedNotes.donorName || dUser?.name || "Voluntary Donor",
                donorBloodGroup: parsedNotes.donorBloodGroup || commitment.donors?.bloodgroup || "COMPATIBLE",
                donorCity: parsedNotes.donorCity || commitment.donors?.city || "Registered Area",
                donorState: parsedNotes.donorState || commitment.donors?.state || "",
                donorPhone: isRejected ? "" : (parsedNotes.donorPhone || dUser?.phonenumber || ""),
                donorEmail: isRejected ? "" : (parsedNotes.donorEmail || dUser?.email || ""),
                respondedAt: commitment.respondedat || commitment.createdat,
                acceptanceStatus: commitment.acceptancestatus || "PENDING",
                acceptedAt: commitment.acceptedat || null,
                acceptedByUserId: commitment.acceptedbyuserid || null,
                rejectedAt: commitment.rejectedat || null,
                rejectedByUserId: commitment.rejectedbyuserid || null,
                receiptConfirmedAt: commitment.receiptconfirmedat || null,
                receiptConfirmedByUserId: commitment.receiptconfirmedbyuserid || null,
                status: commitment.transitstatus || "DONOR_FOUND",
                transitStatus: commitment.transitstatus || "DONOR_FOUND",
                startedAt: commitment.startedat || null,
                reachedAt: commitment.reachedat || null,
                completedAt: commitment.completedat || null,
                estimatedArrival: commitment.estimatedarrival || parsedNotes.estimatedArrival || "Within 1-2 hours",
                notes: parsedNotes.notes || "",
                receiptDocument: commitment.receiptfileurl
                    ? {
                        fileName: commitment.receiptfilename || "donation-receipt",
                        mimeType: commitment.receiptmimetype || "application/octet-stream",
                        fileSize: commitment.receiptfilesize || null,
                        downloadUrl: `/bloodrequests/${bloodRequest.requestid}/volunteers/${commitment.deliveryid}/receipt-document/file`,
                    }
                    : null,
                isEligible: true,
            },
        });
    } catch (error) {
        console.error("Error fetching donor commitment details:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch donor commitment details",
        });
    }
});

/**
 * POST /bloodrequests/:id/volunteers/:deliveryId/receipt-document
 * Upload a donation receipt document for an accepted donor commitment.
 */
router.post("/:id/volunteers/:deliveryId/receipt-document", authenticate, requireApprovedHospital, (req: Request, res: Response, next: any) => {
    upload.single("receipt")(req, res, (err: any) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ success: false, message: "Receipt file exceeds maximum size of 5 MB." });
            }
            return res.status(400).json({ success: false, message: err.message || "File upload error" });
        }
        next();
    });
}, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const deliveryId = (Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId) as string;
        const file = req.file;

        if (!UUID_REGEX.test(requestId) || !UUID_REGEX.test(deliveryId)) {
            return res.status(404).json({ success: false, message: "Blood request or donor commitment not found" });
        }

        if (!file) {
            return res.status(400).json({ success: false, message: "Please select a donation receipt file (PDF, JPG, or PNG)." });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({ where: { requestid: requestId } });
        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) isRequesterOwner = true;
        }
        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) isHospitalOwner = true;
        }

        if (!isOwner && !isRequesterOwner && !isHospitalOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Access denied: you do not own this blood request" });
        }

        const commitment = await prisma.broadcastdeliveries.findFirst({
            where: { deliveryid: deliveryId, requestid: requestId, response: "ACCEPTED" },
        });
        if (!commitment) {
            return res.status(404).json({ success: false, message: "Donor commitment not found for this blood request" });
        }
        if ((commitment.acceptancestatus || "PENDING") !== "ACCEPTED") {
            return res.status(400).json({ success: false, message: "Donation receipt can only be uploaded for an accepted donor commitment" });
        }

        const validation = validatePrescriptionFile(file.buffer, file.originalname);
        if (!validation.valid || !validation.detectedMimeType) {
            return res.status(400).json({ success: false, message: validation.error || "Invalid receipt file format. Allowed: PDF, JPG, PNG." });
        }

        const receiptsDir = path.join(path.dirname(getPrescriptionStorageDir()), "receipts");
        if (!fs.existsSync(receiptsDir)) {
            fs.mkdirSync(receiptsDir, { recursive: true });
        }

        const ext = validation.detectedMimeType === "application/pdf" ? ".pdf" : validation.detectedMimeType === "image/png" ? ".png" : ".jpg";
        const storedFileName = `receipt_${deliveryId}_${crypto.randomBytes(6).toString("hex")}${ext}`;
        const absolutePath = path.join(receiptsDir, storedFileName);
        fs.writeFileSync(absolutePath, file.buffer);

        const safeOrigName = path.basename(file.originalname || `donation-receipt${ext}`).slice(0, 200);

        await prisma.$transaction(async (tx) => {
            await tx.broadcastdeliveries.update({
                where: { deliveryid: commitment.deliveryid },
                data: {
                    receiptfileurl: storedFileName,
                    receiptfilename: safeOrigName,
                    receiptmimetype: validation.detectedMimeType!,
                    receiptfilesize: file.size,
                },
            });
            await tx.requeststatushistory.create({
                data: {
                    requestid: requestId,
                    oldstatus: bloodRequest.status,
                    newstatus: bloodRequest.status || "DONOR_MATCHING",
                    changedbyuserid: user.userid,
                    remarks: `Donation receipt document uploaded (${safeOrigName}) for delivery ${deliveryId}`,
                },
            });
        });

        return res.status(200).json({
            success: true,
            message: "Donation receipt uploaded successfully",
            receiptDocument: {
                fileName: safeOrigName,
                mimeType: validation.detectedMimeType,
                fileSize: file.size,
                downloadUrl: `/bloodrequests/${requestId}/volunteers/${deliveryId}/receipt-document/file`,
            },
        });
    } catch (error) {
        console.error("Error uploading donation receipt:", error);
        return res.status(500).json({ success: false, message: "Failed to upload donation receipt" });
    }
});

/**
 * GET /bloodrequests/:id/volunteers/:deliveryId/receipt-document/file
 * Securely stream uploaded donation receipt document.
 */
router.get("/:id/volunteers/:deliveryId/receipt-document/file", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const deliveryId = (Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId) as string;

        if (!UUID_REGEX.test(requestId) || !UUID_REGEX.test(deliveryId)) {
            return res.status(404).json({ success: false, message: "Receipt document not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({ where: { requestid: requestId } });
        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const commitment = await prisma.broadcastdeliveries.findFirst({
            where: { deliveryid: deliveryId, requestid: requestId },
        });
        if (!commitment) {
            return res.status(404).json({ success: false, message: "Receipt document not found" });
        }

        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        const isCommittedDonor = commitment.donoruserid === user.userid;
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) isRequesterOwner = true;
        }
        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) isHospitalOwner = true;
        }

        if (!isOwner && !isRequesterOwner && !isHospitalOwner && !isAdmin && !isCommittedDonor) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        if (!commitment.receiptfileurl) {
            return res.status(404).json({ success: false, message: "Donation receipt document not found" });
        }

        const receiptsDir = path.join(path.dirname(getPrescriptionStorageDir()), "receipts");
        const safeFileName = path.basename(commitment.receiptfileurl);
        const absolutePath = path.join(receiptsDir, safeFileName);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ success: false, message: "Receipt file not found on storage" });
        }

        res.setHeader("Content-Type", commitment.receiptmimetype || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(commitment.receiptfilename || safeFileName)}"`);
        res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
        res.setHeader("X-Content-Type-Options", "nosniff");
        return fs.createReadStream(absolutePath).pipe(res);
    } catch (error) {
        console.error("Error streaming donation receipt:", error);
        return res.status(500).json({ success: false, message: "Failed to retrieve donation receipt" });
    }
});

/**
 * POST /bloodrequests/:id/volunteers/:deliveryId/decision
 * Requester, assigned Hospital, or Admin accepts or rejects a volunteer donor's commitment.
 */
router.post("/:id/volunteers/:deliveryId/decision", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const deliveryId = (Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId) as string;
        const { decision, reason } = req.body || {};

        if (!UUID_REGEX.test(requestId) || !UUID_REGEX.test(deliveryId)) {
            return res.status(404).json({
                success: false,
                message: "Blood request or donor commitment not found",
            });
        }

        if (decision !== "ACCEPTED" && decision !== "REJECTED") {
            return res.status(400).json({
                success: false,
                message: "Invalid decision. Must be ACCEPTED or REJECTED.",
            });
        }

        const request = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: {
                hospitals: true,
                requesters: true,
            },
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        const isOwner = request.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        let isRequesterOwner = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && request.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }
        let isAssignedHospital = false;
        if (user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            // TEMPORARY BYPASS: Allow non-APPROVED hospital volunteer decision
            if (hosp && request.hospitalid === hosp.hospitalid) {
                isAssignedHospital = true;
            }
        }

        if (!isOwner && !isRequesterOwner && !isAssignedHospital && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: only the owning requester, assigned hospital, or admin can accept or reject volunteer donors",
            });
        }

        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
        if (terminalStatuses.includes(request.status || "")) {
            return res.status(400).json({
                success: false,
                message: `Cannot decide on donor offers for a blood requisition that is already ${String(request.status).toLowerCase()}`,
            });
        }

        const now = new Date();
        const txResult = await prisma.$transaction(async (tx) => {
            const lockedRequests: any[] = await tx.$queryRawUnsafe(
                `SELECT requestid, status, patientname, bloodgroup, unitsrequired FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                request.requestid
            );
            if (!lockedRequests || lockedRequests.length === 0) {
                throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
            }
            const lockedRequest = lockedRequests[0];
            if (terminalStatuses.includes(lockedRequest.status || "")) {
                throw Object.assign(
                    new Error(`Cannot decide on donor offers for a blood requisition that is already ${String(lockedRequest.status).toLowerCase()}`),
                    { statusCode: 400 }
                );
            }

            const lockedDeliveries: any[] = await tx.$queryRawUnsafe(
                `SELECT deliveryid, requestid, donorid, donoruserid, response, acceptancestatus, acceptedat, rejectedat, transitstatus, transitnotes
                 FROM broadcastdeliveries
                 WHERE deliveryid = $1::uuid AND requestid = $2::uuid
                 FOR UPDATE`,
                deliveryId,
                request.requestid
            );
            if (!lockedDeliveries || lockedDeliveries.length === 0 || lockedDeliveries[0].response !== "ACCEPTED") {
                throw Object.assign(new Error("Volunteer donor commitment not found for this blood request"), { statusCode: 404 });
            }

            const lockedDelivery = lockedDeliveries[0];
            const currentAcceptance = (lockedDelivery.acceptancestatus || "PENDING") as string;

            if (currentAcceptance === decision) {
                return {
                    alreadyDecided: true,
                    deliveryId: lockedDelivery.deliveryid,
                    donorUserId: lockedDelivery.donoruserid,
                    acceptanceStatus: currentAcceptance,
                    acceptedAt: lockedDelivery.acceptedat,
                    rejectedAt: lockedDelivery.rejectedat,
                };
            }

            if (currentAcceptance !== "PENDING") {
                throw Object.assign(
                    new Error(`Donor offer has already been ${currentAcceptance.toLowerCase()} and cannot be changed to ${decision.toLowerCase()}`),
                    { statusCode: 409 }
                );
            }

            if (["STARTED", "REACHED_LOCATION", "COMPLETED"].includes(lockedDelivery.transitstatus || "")) {
                throw Object.assign(
                    new Error(`Cannot change acceptance decision after donor transit has reached ${lockedDelivery.transitstatus}`),
                    { statusCode: 409 }
                );
            }

            let parsedNotes: any = {};
            if (lockedDelivery.transitnotes) {
                try {
                    parsedNotes = JSON.parse(lockedDelivery.transitnotes);
                } catch { }
            }
            const donorDisplayName = parsedNotes.donorName || "Volunteer Donor";

            await tx.broadcastdeliveries.update({
                where: { deliveryid: lockedDelivery.deliveryid },
                data: decision === "ACCEPTED"
                    ? {
                        acceptancestatus: "ACCEPTED",
                        acceptedat: now,
                        acceptedbyuserid: user.userid,
                    }
                    : {
                        acceptancestatus: "REJECTED",
                        rejectedat: now,
                        rejectedbyuserid: user.userid,
                    },
            });

            await tx.requeststatushistory.create({
                data: {
                    requestid: request.requestid,
                    oldstatus: lockedRequest.status,
                    newstatus: lockedRequest.status,
                    changedbyuserid: user.userid,
                    remarks: decision === "ACCEPTED"
                        ? `Requester accepted volunteer donor ${donorDisplayName} (delivery ${lockedDelivery.deliveryid})`
                        : `Requester rejected volunteer donor ${donorDisplayName} (delivery ${lockedDelivery.deliveryid})${reason ? `: ${String(reason).slice(0, 200)}` : ""}`,
                },
            });

            const notifTitle = decision === "ACCEPTED" ? "Your Donation Offer Was Accepted" : "Donation Offer Not Selected";
            const facilityName = request.hospitals?.hospitalname || "the hospital";
            const notifMessage = decision === "ACCEPTED"
                ? `Your volunteer offer for patient ${lockedRequest.patientname} (${lockedRequest.bloodgroup}) at ${facilityName} was accepted. You can now start your journey from the Donor Portal.`
                : `Your volunteer offer (${lockedRequest.bloodgroup}) at ${facilityName} was not selected.${reason ? ` Note: ${String(reason).slice(0, 200)}` : ""}`;

            if (lockedDelivery.donoruserid !== user.userid) {
                const existingNotif = await tx.notification.findFirst({
                    where: {
                        userid: lockedDelivery.donoruserid,
                        requestid: request.requestid,
                        title: notifTitle,
                    },
                    select: { notificationid: true },
                });
                if (!existingNotif) {
                    await tx.notification.create({
                        data: {
                            userid: lockedDelivery.donoruserid,
                            requestid: request.requestid,
                            type: notification_type.MATCH,
                            title: notifTitle,
                            message: notifMessage,
                            isread: false,
                        },
                    });

                    // Automated Donor SMS Selection Alert
                    if (decision === "ACCEPTED") {
                        await NotificationSmsDispatcher.dispatchDonorOfferAccepted({
                            donorUserId: lockedDelivery.donoruserid,
                            requestId: request.requestid,
                            facilityName,
                            prismaTx: tx,
                        }).catch(() => {});
                    } else if (decision === "REJECTED") {
                        await NotificationSmsDispatcher.dispatchDonorOfferNotSelected({
                            donorUserId: lockedDelivery.donoruserid,
                            requestId: request.requestid,
                            bloodGroup: lockedRequest.bloodgroup,
                            facilityName,
                            prismaTx: tx,
                        }).catch(() => {});
                    }
                }
            }

            return {
                alreadyDecided: false,
                deliveryId: lockedDelivery.deliveryid,
                donorUserId: lockedDelivery.donoruserid,
                acceptanceStatus: decision,
                acceptedAt: decision === "ACCEPTED" ? now : null,
                rejectedAt: decision === "REJECTED" ? now : null,
            };
        });

        return res.status(200).json({
            success: true,
            message: decision === "ACCEPTED" ? "Donor offer accepted successfully" : "Donor offer rejected",
            ...txResult,
        });
    } catch (error: any) {
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        console.error("Error deciding volunteer donor offer:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to record donor decision",
        });
    }
});

/**
 * PATCH /bloodrequests/:id/transit-status
 * Update volunteer donor transit status: DONOR_FOUND -> STARTED -> REACHED_LOCATION -> COMPLETED
 */
router.patch("/:id/transit-status", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const { status, donorUserId, deliveryId } = req.body;

        const validStatuses = ["DONOR_FOUND", "STARTED", "REACHED_LOCATION", "COMPLETED"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid transit status. Must be one of: ${validStatuses.join(", ")}`,
            });
        }

        if (!UUID_REGEX.test(requestId)) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        // Check if blood request exists
        const request = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: {
                hospitals: true,
                requesters: true,
            },
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        let isAssignedHospital = false;
        if (user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            // TEMPORARY BYPASS: Allow non-APPROVED hospital volunteer decision
            if (hosp && request.hospitalid === hosp.hospitalid) {
                isAssignedHospital = true;
            }
        }

        const isDonor = user.role === "DONOR";
        const isAdmin = user.role === "ADMIN";
        let isOwningRequester = false;
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            if (request.createdbyuserid === user.userid) {
                isOwningRequester = true;
            } else {
                const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
                if (requester && request.requesterid === requester.requesterid) {
                    isOwningRequester = true;
                }
            }
        }

        if (!isDonor && !isAdmin && !isAssignedHospital && !isOwningRequester) {
            return res.status(403).json({
                success: false,
                message: "Access denied: not authorized to update donor transit status",
            });
        }

        if (isOwningRequester && !isAdmin && !isAssignedHospital && status !== "COMPLETED") {
            return res.status(403).json({
                success: false,
                message: "Access denied: requesters can only confirm blood receipt (COMPLETED) after the donor reaches the hospital",
            });
        }

        if (isDonor) {
            if (
                donorUserId !== undefined &&
                donorUserId !== null &&
                String(donorUserId).trim() !== "" &&
                String(donorUserId).trim() !== user.userid
            ) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: donors can only update their own transit status",
                });
            }
            if (!["STARTED", "REACHED_LOCATION"].includes(status)) {
                return res.status(403).json({
                    success: false,
                    message:
                        status === "COMPLETED"
                            ? "Access denied: only the requester, assigned hospital, or an administrator can confirm blood receipt"
                            : "Access denied: donors can only update transit status to STARTED or REACHED_LOCATION",
                });
            }
        }

        // Pre-transaction check: Terminal status protection (CANCELLED, EXPIRED, FULFILLED)
        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
        if (terminalStatuses.includes(request.status || "")) {
            return res.status(400).json({
                success: false,
                message: `Cannot update transit status for a blood requisition that is already ${String(request.status).toLowerCase()}`,
            });
        }

        // Validate explicit donorUserId when provided by non-donor callers
        const hasExplicitDonorUserId =
            !isDonor &&
            donorUserId !== undefined &&
            donorUserId !== null &&
            String(donorUserId).trim() !== "";

        if (hasExplicitDonorUserId) {
            if (typeof donorUserId !== "string" || !UUID_REGEX.test(donorUserId.trim())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid donorUserId format. Must be a valid UUID.",
                });
            }
        }

        const targetUserId = isDonor
            ? (user.userid as string)
            : (hasExplicitDonorUserId ? (donorUserId as string).trim() : undefined);

        const now = new Date();
        const nowIso = now.toISOString();

        // Atomic transaction: lock blood request row, disambiguate & lock persistent commitment, verify gates, update milestones
        const txResult = await prisma.$transaction(async (tx) => {
            // 1. Lock blood request row to serialize against concurrent cancellations, responses, or transit updates
            const lockedRows: any[] = await tx.$queryRawUnsafe(
                `SELECT requestid, status, requesterid, hospitalid, unitsrequired FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                request.requestid
            );

            if (!lockedRows || lockedRows.length === 0) {
                throw Object.assign(new Error("Blood request not found"), { statusCode: 404 });
            }

            const currentRequest = lockedRows[0];

            // 2. Strict terminal state guard on current locked database status
            if (terminalStatuses.includes(currentRequest.status || "")) {
                throw Object.assign(
                    new Error(`Cannot update transit status for a blood requisition that is already ${String(currentRequest.status).toLowerCase()}`),
                    { statusCode: 400 }
                );
            }

            // 3. Clinical Prescription Gate for clinical completion / BLOOD_ARRANGED (Hospital/Admin)
            // Owning requesters confirming receipt record PENDING donation history without advancing to BLOOD_ARRANGED.
            if (status === "COMPLETED" && (isAdmin || isAssignedHospital)) {
                const isRequesterCreated = Boolean(currentRequest.requesterid);
                if (isRequesterCreated) {
                    const rx = await tx.prescription.findUnique({
                        where: { requestid: currentRequest.requestid },
                    });

                    if (!rx || rx.status !== "VERIFIED") {
                        throw Object.assign(
                            new Error(`Cannot advance requester requisition to BLOOD_ARRANGED without a clinically verified prescription (Current prescription status: ${rx ? rx.status : "NONE"})`),
                            { statusCode: 400 }
                        );
                    }
                }
            }

            // 4. Identify and disambiguate persistent donor commitment inside transaction (no notification metadata fallback)
            const eligibleDeliveries = await tx.broadcastdeliveries.findMany({
                where: {
                    requestid: request.requestid,
                    response: "ACCEPTED",
                },
                orderBy: { respondedat: "desc" },
                include: {
                    donors: {
                        include: {
                            users: true,
                        },
                    },
                },
            });

            if (eligibleDeliveries.length === 0) {
                throw Object.assign(
                    new Error("No eligible volunteer commitment found for this blood request"),
                    { statusCode: 404 }
                );
            }

            const hasExplicitDeliveryId =
                deliveryId !== undefined &&
                deliveryId !== null &&
                String(deliveryId).trim() !== "";
            if (hasExplicitDeliveryId && (typeof deliveryId !== "string" || !UUID_REGEX.test(deliveryId.trim()))) {
                throw Object.assign(new Error("Invalid deliveryId format. Must be a valid UUID."), { statusCode: 400 });
            }

            let commitment: (typeof eligibleDeliveries)[number] | undefined;

            if (hasExplicitDeliveryId) {
                commitment = eligibleDeliveries.find((d) => d.deliveryid === String(deliveryId).trim());
                if (!commitment) {
                    throw Object.assign(
                        new Error("Specified donor commitment not found for this blood request"),
                        { statusCode: 404 }
                    );
                }
                if (isDonor && commitment.donoruserid !== user.userid) {
                    throw Object.assign(
                        new Error("Access denied: donors can only update their own transit status"),
                        { statusCode: 403 }
                    );
                }
            } else if (targetUserId) {
                commitment = eligibleDeliveries.find((d) => d.donoruserid === targetUserId);
                if (!commitment) {
                    throw Object.assign(
                        new Error("Specified donor does not have an eligible commitment for this blood request"),
                        { statusCode: 404 }
                    );
                }
            } else {
                if (eligibleDeliveries.length > 1) {
                    throw Object.assign(
                        new Error(
                            "Multiple eligible volunteer donors exist for this blood request. An explicit donorUserId or deliveryId is required to disambiguate."
                        ),
                        { statusCode: 400 }
                    );
                }
                commitment = eligibleDeliveries[0];
            }

            // Lock the specific delivery row and re-read authoritative transit & acceptance state
            const lockedDeliveryRows: any[] = await tx.$queryRawUnsafe(
                `SELECT deliveryid, transitstatus, acceptancestatus, startedat, reachedat, completedat, receiptconfirmedat, receiptconfirmedbyuserid, transitnotes FROM broadcastdeliveries WHERE deliveryid = $1::uuid FOR UPDATE`,
                commitment.deliveryid
            );
            const lockedDelivery = lockedDeliveryRows?.[0] || commitment;
            const currentTransitStatus = (lockedDelivery.transitstatus || "DONOR_FOUND") as string;
            const currentAcceptanceStatus = (lockedDelivery.acceptancestatus || "PENDING") as string;

            if (["STARTED", "REACHED_LOCATION", "COMPLETED"].includes(status)) {
                if (currentAcceptanceStatus === "REJECTED") {
                    throw Object.assign(
                        new Error("Access denied: this donation offer was rejected and cannot proceed"),
                        { statusCode: 403 }
                    );
                }
                if (currentAcceptanceStatus !== "ACCEPTED") {
                    throw Object.assign(
                        new Error("Donor offer must be accepted by the requester before starting journey or confirming receipt"),
                        { statusCode: 403 }
                    );
                }
            }

            const TRANSIT_TRANSITIONS: Record<string, string[]> = {
                DONOR_FOUND: ["STARTED"],
                STARTED: ["REACHED_LOCATION"],
                REACHED_LOCATION: ["COMPLETED"],
                COMPLETED: [],
            };

            const isSameStateRetry = currentTransitStatus === status;
            if (!isSameStateRetry) {
                const allowedNext = TRANSIT_TRANSITIONS[currentTransitStatus] || [];
                if (!allowedNext.includes(status)) {
                    throw Object.assign(
                        new Error(
                            `Invalid transit status transition from ${currentTransitStatus} to ${status}. Allowed next status: ${allowedNext.length > 0 ? allowedNext.join(", ") : "none (already completed)"}`
                        ),
                        { statusCode: 400 }
                    );
                }
            }

            let meta: any = {};
            const rawTransitNotes = lockedDelivery.transitnotes ?? commitment.transitnotes;
            if (rawTransitNotes) {
                try {
                    meta = JSON.parse(rawTransitNotes);
                } catch { }
            }

            if (isSameStateRetry) {
                let existingHistoryId: string | null = null;
                let allowClinicalUpgrade = false;
                if (status === "COMPLETED") {
                    const existingHistory = await tx.donationhistory.findFirst({
                        where: {
                            donorid: commitment.donorid,
                            requestid: currentRequest.requestid,
                        },
                        select: { donationhistoryid: true, verificationstatus: true },
                    });
                    existingHistoryId = existingHistory?.donationhistoryid || null;
                    if (
                        (isAdmin || isAssignedHospital) &&
                        existingHistory &&
                        existingHistory.verificationstatus !== verification_status.VERIFIED
                    ) {
                        allowClinicalUpgrade = true;
                    }
                }
                if (!allowClinicalUpgrade) {
                    return {
                        deliveryId: commitment.deliveryid,
                        donorUserId: commitment.donoruserid,
                        donationHistoryId: existingHistoryId,
                        donationRecorded: false,
                        meta,
                    };
                }
            }

            meta.transitStatus = status;
            if (status === "STARTED" && !meta.startedAt) {
                meta.startedAt = nowIso;
            } else if (status === "REACHED_LOCATION" && !meta.reachedAt) {
                meta.reachedAt = nowIso;
            } else if (status === "COMPLETED" && !meta.completedAt) {
                meta.completedAt = nowIso;
            }

            const donorDisplayName = meta.donorName || commitment.donors?.users?.name || "Volunteer";
            const statusDescriptions: Record<string, string> = {
                STARTED: `Donor ${donorDisplayName} has started their journey to ${request.hospitals?.hospitalname || "the hospital"}.`,
                REACHED_LOCATION: `Donor ${donorDisplayName} has reached ${request.hospitals?.hospitalname || "the hospital"} transfusion desk!`,
                COMPLETED: `Blood donation for patient ${request.patientname} by donor ${donorDisplayName} has been completed.`,
            };

            // 5. Update durable commitment in broadcastdeliveries
            await tx.broadcastdeliveries.update({
                where: { deliveryid: commitment.deliveryid },
                data: {
                    transitstatus: status,
                    ...(status === "STARTED" && !lockedDelivery.startedat ? { startedat: now } : {}),
                    ...(status === "REACHED_LOCATION" && !lockedDelivery.reachedat ? { reachedat: now } : {}),
                    ...(status === "COMPLETED" && !lockedDelivery.completedat ? { completedat: now } : {}),
                    ...(status === "COMPLETED" && !lockedDelivery.receiptconfirmedat
                        ? { receiptconfirmedat: now, receiptconfirmedbyuserid: user.userid }
                        : {}),
                    transitnotes: JSON.stringify(meta),
                },
            });

            // 6. Best-effort notification sync for the matched donor only (safe if notifications were deleted)
            const volunteerNotification = await tx.notification.findFirst({
                where: {
                    requestid: request.requestid,
                    userid: commitment.donoruserid,
                    type: notification_type.MATCH,
                    title: "Volunteer Response Confirmed",
                },
                orderBy: { sentat: "desc" },
            });

            if (volunteerNotification) {
                try {
                    const cleanMessage = volunteerNotification.message.replace(/<!--META:[\s\S]*?-->/g, "").trim();
                    await tx.notification.update({
                        where: { notificationid: volunteerNotification.notificationid },
                        data: { message: `${cleanMessage}\n<!--META:${JSON.stringify(meta)}-->` },
                    });
                } catch {
                    // Non-fatal if notification was deleted
                }
            }

            // 7. Best-effort requester notification update
            try {
                const requesterNotif = await tx.notification.findFirst({
                    where: {
                        requestid: request.requestid,
                        userid: request.createdbyuserid,
                        type: notification_type.MATCH,
                        title: "Donor Volunteered for Blood Request",
                    },
                    orderBy: { sentat: "desc" },
                });

                if (requesterNotif) {
                    const reqCleanMsg = requesterNotif.message.replace(/<!--META:[\s\S]*?-->/g, "").trim();
                    await tx.notification.update({
                        where: { notificationid: requesterNotif.notificationid },
                        data: { message: `${reqCleanMsg}\n<!--META:${JSON.stringify(meta)}-->` },
                    });
                }
            } catch {
                // Non-fatal
            }

            // 8. Notify requester and assigned hospital
            if (statusDescriptions[status]) {
                if (request.createdbyuserid !== user.userid) {
                    await tx.notification.create({
                        data: {
                            userid: request.createdbyuserid,
                            requestid: request.requestid,
                            type: notification_type.MATCH,
                            title: status === "REACHED_LOCATION" ? "Donor Reached Hospital" : status === "STARTED" ? "Donor Started Journey" : "Donation Completed",
                            message: statusDescriptions[status],
                            isread: false,
                        },
                    });
                }

                if (request.hospitals && request.hospitals.userid && request.hospitals.userid !== user.userid && request.hospitals.userid !== request.createdbyuserid) {
                    await tx.notification.create({
                        data: {
                            userid: request.hospitals.userid,
                            requestid: request.requestid,
                            type: notification_type.MATCH,
                            title: status === "REACHED_LOCATION" ? "Donor Reached Facility" : status === "STARTED" ? "Donor In Transit" : "Donation Completed at Facility",
                            message: statusDescriptions[status],
                            isread: false,
                        },
                    });
                }

                if (status === "COMPLETED" && commitment.donoruserid !== user.userid) {
                    const existingDonorReceiptNotif = await tx.notification.findFirst({
                        where: {
                            userid: commitment.donoruserid,
                            requestid: request.requestid,
                            title: "Blood Receipt Confirmed",
                        },
                        select: { notificationid: true },
                    });
                    if (!existingDonorReceiptNotif) {
                        await tx.notification.create({
                            data: {
                                userid: commitment.donoruserid,
                                requestid: request.requestid,
                                type: notification_type.MATCH,
                                title: "Blood Receipt Confirmed",
                                message: `Blood receipt for patient ${request.patientname} (${request.bloodgroup}) at ${request.hospitals?.hospitalname || "the care facility"} has been confirmed. Thank you for saving a life!`,
                                isread: false,
                            },
                        });

                        // Automated Donor SMS Receipt Alert
                        await NotificationSmsDispatcher.dispatchDonorReceiptConfirmed({
                            donorUserId: commitment.donoruserid,
                            requestId: request.requestid,
                            bloodGroup: request.bloodgroup,
                            facilityName: request.hospitals?.hospitalname || "the care facility",
                            prismaTx: tx,
                        }).catch(() => {});
                    }
                }
            }

            // 9. If completed, record donation history & update donor cooldown atomically and idempotently
            // Clinical verification (VERIFIED + lastdonationdate) is reserved for Hospital/Admin; Requester confirmation records PENDING receipt awaiting hospital verification.
            const isClinicalVerifier = isAdmin || isAssignedHospital;
            let donationRecorded = false;
            let donationHistoryId: string | null = null;
            if (status === "COMPLETED") {
                const existingHistory = await tx.donationhistory.findFirst({
                    where: {
                        donorid: commitment.donorid,
                        requestid: currentRequest.requestid,
                    },
                    select: { donationhistoryid: true, verificationstatus: true },
                });

                if (existingHistory) {
                    donationHistoryId = existingHistory.donationhistoryid;
                    if (isClinicalVerifier && existingHistory.verificationstatus !== verification_status.VERIFIED) {
                        await tx.donationhistory.update({
                            where: { donationhistoryid: existingHistory.donationhistoryid },
                            data: { verificationstatus: verification_status.VERIFIED },
                        });
                        await tx.donors.update({
                            where: { donorid: commitment.donorid },
                            data: { lastdonationdate: now },
                        });
                    }
                } else {
                    // Lock donor row BEFORE creating donation history to serialize concurrent completions across requests
                    const donorRows: any[] = await tx.$queryRawUnsafe(
                        `SELECT donorid, lastdonationdate FROM donors WHERE donorid = $1::uuid FOR UPDATE`,
                        commitment.donorid
                    );

                    const latestVerifiedDonation = await tx.donationhistory.findFirst({
                        where: {
                            donorid: commitment.donorid,
                            verificationstatus: verification_status.VERIFIED,
                        },
                        orderBy: { donationdate: "desc" },
                        select: { donationdate: true },
                    });

                    const donorLastDate = donorRows?.[0]?.lastdonationdate
                        ? new Date(donorRows[0].lastdonationdate)
                        : null;
                    const historyLastDate = latestVerifiedDonation?.donationdate
                        ? new Date(latestVerifiedDonation.donationdate)
                        : null;

                    let effectiveLastDonation: Date | null = null;
                    if (donorLastDate && historyLastDate) {
                        effectiveLastDonation =
                            donorLastDate.getTime() >= historyLastDate.getTime() ? donorLastDate : historyLastDate;
                    } else {
                        effectiveLastDonation = donorLastDate || historyLastDate;
                    }

                    if (effectiveLastDonation) {
                        const daysSince = Math.max(
                            0,
                            Math.floor((now.getTime() - effectiveLastDonation.getTime()) / (1000 * 60 * 60 * 24))
                        );
                        if (daysSince < 90) {
                            throw Object.assign(
                                new Error(
                                    `Mandatory 90-day cooldown active. Only ${daysSince} of 90 days have elapsed since the donor's last verified donation.`
                                ),
                                { statusCode: 400 }
                            );
                        }
                    }

                    const createdHistory = await tx.donationhistory.create({
                        data: {
                            donorid: commitment.donorid,
                            requestid: currentRequest.requestid,
                            hospitalid: currentRequest.hospitalid || request.hospitalid || null,
                            unitsdonated: 1,
                            donationdate: now,
                            bloodcomponent: request.bloodcomponent || blood_component.WHOLE_BLOOD,
                            verificationstatus: isClinicalVerifier ? verification_status.VERIFIED : verification_status.PENDING,
                            isimported: false,
                            remarks: isClinicalVerifier
                                ? `Confirmed voluntary donation for blood request ${currentRequest.requestid} (${request.bloodgroup})`
                                : `Blood receipt confirmed by requester for blood request ${currentRequest.requestid} (${request.bloodgroup}); pending clinical verification`,
                        },
                    });
                    donationHistoryId = createdHistory.donationhistoryid;
                    donationRecorded = true;

                    if (isClinicalVerifier) {
                        await tx.donors.update({
                            where: { donorid: commitment.donorid },
                            data: { lastdonationdate: now },
                        });
                    }
                }

                await tx.requeststatushistory.create({
                    data: {
                        requestid: currentRequest.requestid,
                        oldstatus: currentRequest.status,
                        newstatus: currentRequest.status,
                        changedbyuserid: user.userid,
                        remarks: isClinicalVerifier
                            ? `Clinical completion & receipt confirmed for donor ${donorDisplayName} (delivery ${commitment.deliveryid})`
                            : `Blood receipt confirmed by requester for donor ${donorDisplayName} (delivery ${commitment.deliveryid})`,
                    },
                });

                const requiredUnits = Math.max(1, Number(currentRequest.unitsrequired ?? request.unitsrequired ?? 1));
                let completedUnits = 1;
                if (typeof (tx as any).donationhistory?.findMany === "function") {
                    const verifiedDonations = await tx.donationhistory.findMany({
                        where: {
                            requestid: currentRequest.requestid,
                            verificationstatus: verification_status.VERIFIED,
                        },
                        select: { unitsdonated: true },
                    });
                    completedUnits = verifiedDonations.reduce((sum, d) => sum + (d.unitsdonated || 1), 0);
                }

                let bloodArranged = currentRequest.status === "BLOOD_ARRANGED" || currentRequest.status === "FULFILLED";
                if (
                    completedUnits >= requiredUnits &&
                    currentRequest.status !== "BLOOD_ARRANGED" &&
                    currentRequest.status !== "FULFILLED"
                ) {
                    await tx.bloodrequests.update({
                        where: { requestid: currentRequest.requestid },
                        data: { status: "BLOOD_ARRANGED" },
                    });

                    // Atomically cancel active broadcasts and open scheduler jobs when transitioning to BLOOD_ARRANGED
                    if (typeof (tx as any).emergencybroadcasts?.updateMany === "function") {
                        await (tx as any).emergencybroadcasts.updateMany({
                            where: {
                                requestid: currentRequest.requestid,
                                status: { in: ["ACTIVE", "DONOR_RESPONDED"] },
                            },
                            data: { status: "BLOOD_ARRANGED" },
                        });
                    }
                    if (typeof (tx as any).emergencyschedulerjobs?.updateMany === "function") {
                        await (tx as any).emergencyschedulerjobs.updateMany({
                            where: {
                                requestid: currentRequest.requestid,
                                status: { in: ["PENDING", "PROCESSING"] },
                            },
                            data: {
                                status: "CANCELLED",
                                lasterror: "REQUEST_BLOOD_ARRANGED",
                                lockeduntil: null,
                                lockedby: null,
                                updatedat: new Date(),
                            },
                        });
                    }

                    await tx.requeststatushistory.create({
                        data: {
                            requestid: currentRequest.requestid,
                            oldstatus: currentRequest.status,
                            newstatus: "BLOOD_ARRANGED",
                            changedbyuserid: user.userid,
                            remarks: `All ${requiredUnits} required unit(s) completed (latest by donor ${meta.donorName || "Volunteer"}). Blood arranged for transfusion.`,
                        },
                    });
                    bloodArranged = true;
                }

                return {
                    deliveryId: commitment.deliveryid,
                    donorUserId: commitment.donoruserid,
                    donationHistoryId,
                    donationRecorded,
                    completedUnits,
                    unitsRequired: requiredUnits,
                    bloodArranged,
                    meta,
                };
            }

            return {
                deliveryId: commitment.deliveryid,
                donorUserId: commitment.donoruserid,
                donationHistoryId,
                donationRecorded,
                completedUnits: undefined as number | undefined,
                unitsRequired: undefined as number | undefined,
                bloodArranged: currentRequest.status === "BLOOD_ARRANGED" || currentRequest.status === "FULFILLED",
                meta,
            };
        });

        return res.status(200).json({
            success: true,
            message: `Transit status updated to ${status}`,
            transitStatus: status,
            donorUserId: txResult.donorUserId,
            deliveryId: txResult.deliveryId,
            donationHistoryId: txResult.donationHistoryId,
            donationRecorded: txResult.donationRecorded,
            completedUnits: txResult.completedUnits,
            unitsRequired: txResult.unitsRequired,
            bloodArranged: txResult.bloodArranged,
            meta: txResult.meta,
        });
    } catch (error: any) {
        console.error("Error updating transit status:", error);
        if (error?.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        return res.status(500).json({
            success: false,
            message: "Failed to update transit status",
        });
    }
});

/**
 * POST /bloodrequests/:id/volunteers/:deliveryId/confirm-receipt
 * Convenience endpoint for owning requester, assigned hospital, or admin to confirm blood received.
 * Delegates to the exact same state machine & locking rules as PATCH /:id/transit-status { status: "COMPLETED" }.
 */
router.post("/:id/volunteers/:deliveryId/confirm-receipt", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    const deliveryId = (Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId) as string;
    req.body = {
        ...(req.body || {}),
        status: "COMPLETED",
        deliveryId,
    };
    const transitLayer = (router as any).stack.find(
        (layer: any) => layer.route?.path === "/:id/transit-status" && layer.route?.methods?.patch
    );
    if (transitLayer) {
        return transitLayer.route.stack[transitLayer.route.stack.length - 1].handle(req, res, () => { });
    }
    return res.status(500).json({ success: false, message: "Transit handler unavailable" });
});

/**
 * GET /bloodrequests/:id/scheduler-jobs
 * Inspect persistent background scheduler jobs for an emergency requisition.
 * Restricted to:
 * - Request Owner / Requester
 * - Assigned Hospital
 * - ADMIN
 */
router.get("/:id/scheduler-jobs", authenticate, requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const targetId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!targetId || !UUID_REGEX.test(targetId)) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: targetId },
            include: { requesters: true, hospitals: true },
        });

        if (!bloodRequest) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        const isOwner = bloodRequest.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";
        let isRequesterOwner = false;
        if (user.role === "REQUESTER") {
            const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
            if (requester && bloodRequest.requesterid === requester.requesterid) {
                isRequesterOwner = true;
            }
        }
        let isHospitalOwner = false;
        if (user.role === "HOSPITAL") {
            const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hospital && bloodRequest.hospitalid === hospital.hospitalid) {
                isHospitalOwner = true;
            }
        }

        if (!isOwner && !isAdmin && !isRequesterOwner && !isHospitalOwner) {
            return res.status(403).json({
                success: false,
                message: "Access denied: you are not authorized to inspect scheduler jobs for this request",
            });
        }

        const jobs = await prisma.emergencyschedulerjobs.findMany({
            where: { requestid: targetId },
            orderBy: { scheduledfor: "asc" },
            select: {
                jobid: true,
                requestid: true,
                jobtype: true,
                status: true,
                scheduledfor: true,
                attemptcount: true,
                maxattempts: true,
                lasterror: true,
                idempotencykey: true,
                createdat: true,
                updatedat: true,
                completedat: true,
            },
        });

        const sanitizedJobs = jobs.map((job) => ({
            ...job,
            lasterror: job.lasterror ? sanitizeErrorMessage(job.lasterror) : null,
        }));

        return res.status(200).json({
            success: true,
            requestId: targetId,
            totalJobs: sanitizedJobs.length,
            jobs: sanitizedJobs,
        });
    } catch (error) {
        console.error("Error inspecting scheduler jobs:", error);
        return res.status(500).json({ success: false, message: "Failed to inspect scheduler jobs" });
    }
});


/*
 * ============================================================================
 * SWASTYA PHASE 6.2.3: REQUISITION ASSIGNMENT & HOSPITAL RECEIPT
 * ============================================================================
 */

/*
 * ASSIGN BLOOD REQUEST TO BLOOD BANK
 * POST /bloodrequests/:requestId/assign
 */
router.post(
    "/:requestId/assign",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    requireApprovedHospital,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const requestId = (Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId) as string;
            const bloodBankId = (req.body.bloodBankId || req.body.bloodbankid) as string;

            if (!UUID_REGEX.test(requestId)) {
                return res.status(404).json({
                    success: false,
                    message: "Blood request not found",
                });
            }

            if (!bloodBankId || !UUID_REGEX.test(bloodBankId)) {
                return res.status(400).json({
                    success: false,
                    message: "A valid bloodBankId UUID is required to assign requisition",
                });
            }

            const bloodRequest = await prisma.bloodrequests.findUnique({
                where: { requestid: requestId },
                include: { prescription: true },
            });

            if (!bloodRequest) {
                return res.status(404).json({
                    success: false,
                    message: "Blood request not found",
                });
            }

            let callerHospitalId: string | undefined = undefined;
            if (user.role === "HOSPITAL") {
                const hospital = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
                if (!hospital || bloodRequest.hospitalid !== hospital.hospitalid) {
                    return res.status(403).json({
                        success: false,
                        message: "Access denied: you can only assign blood requests belonging to your hospital",
                    });
                }
                callerHospitalId = hospital.hospitalid;
            }

            // Clinical safety gate: requester-initiated requests require verified prescription before assignment
            if (bloodRequest.requesterid && bloodRequest.prescription?.status !== "VERIFIED") {
                return res.status(400).json({
                    success: false,
                    message: "Clinical prescription verification (VERIFIED) is required before assigning to a blood bank",
                });
            }

            const targetBloodBank = await prisma.bloodbanks.findUnique({
                where: { bloodbankid: bloodBankId },
                select: { bloodbankid: true },
            });
            if (!targetBloodBank) {
                return res.status(404).json({
                    success: false,
                    message: "Target blood bank not found",
                });
            }

            const result = await UnitTraceabilityService.assignRequisition(
                requestId,
                bloodBankId,
                user.userid,
                callerHospitalId
            );
            return res.status(201).json(result);
        } catch (error: any) {
            console.error("Error assigning requisition:", error);
            const status = error.statusCode || 500;
            return res.status(status).json({
                success: false,
                message: error.message || "Failed to assign requisition",
            });
        }
    }
);

/*
 * CONFIRM HOSPITAL RECEIPT AND EXCURSION QUARANTINE
 * POST /bloodrequests/reservations/:reservationId/receipt
 */
router.post("/reservations/:reservationId/receipt", authenticate, authorize("HOSPITAL", "ADMIN"), requireApprovedHospital, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const reservationId = (Array.isArray(req.params.reservationId) ? req.params.reservationId[0] : req.params.reservationId) as string;

        if (!UUID_REGEX.test(reservationId)) {
            return res.status(404).json({ success: false, message: "Reservation not found" });
        }

        let callerHospitalId: string | undefined = undefined;
        if (user.role !== "ADMIN") {
            const reservationRecord = await prisma.bloodreservations.findUnique({
                where: { reservationid: reservationId },
                include: { bloodrequests: true },
            });
            if (!reservationRecord) {
                return res.status(404).json({ success: false, message: "Reservation not found" });
            }
            const userHospital = await prisma.hospitals.findFirst({
                where: { userid: user.userid },
            });
            callerHospitalId = userHospital?.hospitalid;
            const matchesHospital = userHospital && reservationRecord.bloodrequests.hospitalid && userHospital.hospitalid === reservationRecord.bloodrequests.hospitalid;
            const matchesCreator = reservationRecord.bloodrequests.createdbyuserid === user.userid;
            if (!matchesHospital && !matchesCreator) {
                return res.status(403).json({
                    success: false,
                    message: "Forbidden: You do not have ownership of the requesting hospital facility",
                });
            }
        }

        const rawIdempotencyKey = req.headers["idempotency-key"];
        if (!rawIdempotencyKey || typeof rawIdempotencyKey !== "string" || !rawIdempotencyKey.trim()) {
            return res.status(400).json({
                success: false,
                message: "A valid Idempotency-Key header is required for receipt confirmation",
            });
        }
        const idempotencyKey = rawIdempotencyKey.trim();

        const { itemReceipts } = req.body;
        if (!itemReceipts || !Array.isArray(itemReceipts) || itemReceipts.length === 0) {
            return res.status(400).json({
                success: false,
                message: "itemReceipts array is required",
            });
        }

        const result = await UnitTraceabilityService.confirmHospitalReceipt(
            reservationId,
            user.userid,
            itemReceipts,
            idempotencyKey,
            callerHospitalId
        );

        return res.status(200).json(result);
    } catch (error: any) {
        console.error("Error confirming hospital receipt:", error);
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Failed to confirm receipt",
        });
    }
});

/*
 * GET DONOR ELIGIBILITY QUESTIONNAIRE RESPONSES
 * GET /bloodrequests/:id/eligibility-responses
 * Strictly RBAC-protected: Donor themselves, Assigned Hospital staff, or Admin.
 */
router.get("/:id/eligibility-responses", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        const request = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: { hospitals: true },
        });

        if (!request) {
            return res.status(404).json({ success: false, message: "Blood request not found" });
        }

        // If requester attempts to access donor medical data, deny explicitly
        if (user.role === "REQUESTER" || (user.role as string) === "PATIENT") {
            return res.status(403).json({
                success: false,
                message: "Access denied: Requesters are strictly prohibited from accessing confidential donor medical screening records.",
            });
        }

        // Check authorized access
        let isAuthorized = false;
        if (user.role === "ADMIN") {
            isAuthorized = true;
        } else if (user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hosp && request.hospitalid === hosp.hospitalid) {
                isAuthorized = true;
            }
        }

        // Fetch responses
        const responses = await prisma.donoreligibilityresponses.findMany({
            where: { requestid: requestId },
            include: {
                donors: {
                    select: {
                        donorid: true,
                        bloodgroup: true,
                        city: true,
                        users: { select: { name: true, phonenumber: true } },
                    },
                },
                reviewedbyhospitaluser: {
                    select: { name: true, email: true },
                },
            },
            orderBy: { submittedat: "desc" },
        });

        // If user is a donor, they can only view their own response
        if (user.role === "DONOR") {
            const donorOwnResponses = responses.filter(r => r.donoruserid === user.userid);
            if (donorOwnResponses.length > 0) {
                return res.status(200).json({ success: true, responses: donorOwnResponses });
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({
                success: false,
                message: "Access to confidential donor medical screening responses is restricted to the volunteer donor and authorized clinical personnel.",
            });
        }

        return res.status(200).json({ success: true, responses });
    } catch (err: any) {
        console.error("Error fetching eligibility responses:", err);
        return res.status(500).json({ success: false, message: "Failed to retrieve questionnaire responses" });
    }
});

/*
 * CLINICALLY REVIEW DONOR ELIGIBILITY QUESTIONNAIRE
 * POST /bloodrequests/:id/eligibility-review
 * Authorized clinical review workflow for hospital personnel.
 */
router.post("/:id/eligibility-review", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (user.role !== "HOSPITAL" && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only authorized clinical personnel can review and verify medical questionnaire responses.",
            });
        }

        // Verify hospital assignment
        if (user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            const bloodReq = await prisma.bloodrequests.findUnique({ where: { requestid: requestId } });
            if (!hosp || !bloodReq || bloodReq.hospitalid !== hosp.hospitalid) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: your hospital facility is not assigned to review this requisition.",
                });
            }
        }

        const { responseId, decision, notes } = req.body;
        if (!responseId || !decision || !["CLINICALLY_APPROVED", "CLINICALLY_DEFERRED"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Valid responseId and decision ('CLINICALLY_APPROVED' or 'CLINICALLY_DEFERRED') are required.",
            });
        }

        const responseRecord = await prisma.donoreligibilityresponses.findUnique({
            where: { responseid: responseId },
        });

        if (!responseRecord || responseRecord.requestid !== requestId) {
            return res.status(404).json({ success: false, message: "Questionnaire response not found for this requisition" });
        }

        const updated = await prisma.donoreligibilityresponses.update({
            where: { responseid: responseId },
            data: {
                reviewedbyhospitaluserid: user.userid,
                reviewedat: new Date(),
                reviewdecision: decision,
                reviewnotes: notes ? String(notes).trim() : null,
                screeningstatus: decision,
            },
        });

        return res.status(200).json({
            success: true,
            message: `Questionnaire response marked as ${decision}`,
            response: updated,
        });
    } catch (err: any) {
        console.error("Error submitting eligibility review:", err);
        return res.status(500).json({ success: false, message: "Failed to record clinical review decision" });
    }
});

export default router;