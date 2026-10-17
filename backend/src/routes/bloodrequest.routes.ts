import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { blood_group, availability_status, notification_type } from "../generated/prisma/enums";
import { validateCoordinates } from "../utils/distance";
import { validatePrescriptionFile, getPrescriptionStorageDir } from "../utils/fileValidation";
import { triggerEmergencyBroadcast, getRequestBroadcastStatus } from "../services/broadcast.service";
import { isDonorCompatibleWithRecipient } from "../utils/bloodCompatibility";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
router.get("/", authenticate, async (req: Request, res: Response) => {
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
            // For donors, return active requests with sensitive patient contact info redacted
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
                            contactpersonname: true,
                            contactpersonphone: true,
                        },
                    },
                },
                orderBy: [
                    { isemergency: "desc" },
                    { requiredby: "asc" },
                ],
            });

            const sanitized = rawRequests.map((r) => ({
                requestid: r.requestid,
                patientname: r.patientname,
                patientage: r.patientage,
                patientgender: r.patientgender,
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
                // Contact phone, private notes, and internal user IDs strictly withheld for donor role in collection endpoint
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
router.get("/:id", authenticate, async (req: Request, res: Response) => {
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

        // Fetch genuine voluntary donor responses associated with this request
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

        const volunteers = volunteerNotifications.map((n) => {
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
router.post("/", authenticate, handlePrescriptionUpload, async (req: Request, res: Response) => {
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
                    await fs.promises.unlink(savedFilePath).catch(() => {});
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
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Patient name is required" });
        }

        const age = typeof req.body.patientage === "number" ? req.body.patientage : parseInt(req.body.patientage, 10);
        if (isNaN(age) || age < 0 || age > 125) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Valid patient age (0-125) is required" });
        }

        if (!["MALE", "FEMALE", "OTHER"].includes(req.body.patientgender)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Patient gender must be MALE, FEMALE, or OTHER" });
        }

        if (!req.body.patientcontact || !String(req.body.patientcontact).trim()) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Patient contact number is required" });
        }

        const validBloodGroups = [
            "A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE",
            "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"
        ];
        if (!validBloodGroups.includes(req.body.bloodgroup)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Valid blood group is required" });
        }

        const validComponents = ["WHOLE_BLOOD", "PLATELETS", "PLASMA", "RBC"];
        if (!validComponents.includes(req.body.bloodcomponent)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Valid blood component is required" });
        }

        const units = typeof req.body.unitsrequired === "number" ? req.body.unitsrequired : parseInt(req.body.unitsrequired, 10);
        if (isNaN(units) || units < 1 || units > 100) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Units required must be between 1 and 100" });
        }

        const validUrgency = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        if (!validUrgency.includes(req.body.urgencylevel)) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Valid urgency level is required" });
        }

        if (!req.body.requiredby) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Required-by date and time is required" });
        }

        const requiredDate = new Date(req.body.requiredby);
        if (isNaN(requiredDate.getTime())) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Invalid required-by date format" });
        }

        if (requiredDate.getTime() < Date.now() - 5 * 60 * 1000) {
            if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
            return res.status(400).json({ success: false, message: "Required-by date and time cannot be in the past" });
        }

        // Search radius validation & capping (1-100 km)
        let searchRadius = 5;
        if (req.body.searchradius !== undefined && req.body.searchradius !== null) {
            const parsedRadius = typeof req.body.searchradius === "number" ? req.body.searchradius : parseInt(req.body.searchradius, 10);
            if (isNaN(parsedRadius) || parsedRadius < 1 || parsedRadius > 100) {
                if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
                return res.status(400).json({ success: false, message: "Search radius must be between 1 and 100 km" });
            }
            searchRadius = parsedRadius;
        }

        // Validate hospitalId if provided to prevent foreign key errors
        let hospitalRecord: any = null;
        if (hospitalId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(hospitalId)) {
                hospitalId = null;
            } else {
                hospitalRecord = await prisma.hospitals.findUnique({
                    where: { hospitalid: hospitalId },
                });
                if (!hospitalRecord) {
                    hospitalId = null;
                }
            }
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
                if (savedFilePath) await fs.promises.unlink(savedFilePath).catch(() => {});
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
                            message: `New ${created.urgencylevel} requisition for patient ${created.patientname} (${created.bloodgroup}, ${created.unitsrequired} unit(s)) has been assigned to your facility for review.`,
                            isread: false,
                        },
                    });
                }
            }

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
        }

        res.status(201).json(fullRequest || bloodRequest);
    } catch (error) {
        console.error("Error creating blood request:", error);

        // Transaction failed: clean up written file from storage so no orphaned files remain
        if (savedFilePath) {
            await fs.promises.unlink(savedFilePath).catch(() => {});
        }

        res.status(500).json({
            success: false,
            message: "Failed to create blood request",
        });
    }
});
router.put("/:id", authenticate, async (req: Request, res: Response) => {
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
        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED"];
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
            const isStatusChanging = req.body.status !== undefined && req.body.status !== existing.status;

            // Hospital updates notes and status; Requester/Admin can also update patient fields
            const updateData: any = {
                status: req.body.status !== undefined ? req.body.status : existing.status,
                notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
                updatedat: new Date(),
            };

            if (!isAssignedHospital || isAdmin) {
                if (req.body.patientname !== undefined) updateData.patientname = req.body.patientname;
                if (req.body.patientage !== undefined) updateData.patientage = parseInt(req.body.patientage, 10);
                if (req.body.patientgender !== undefined) updateData.patientgender = req.body.patientgender;
                if (req.body.patientcontact !== undefined) updateData.patientcontact = req.body.patientcontact;
                if (req.body.bloodgroup !== undefined) updateData.bloodgroup = req.body.bloodgroup;
                if (req.body.bloodcomponent !== undefined) updateData.bloodcomponent = req.body.bloodcomponent;
                if (req.body.unitsrequired !== undefined) updateData.unitsrequired = parseInt(req.body.unitsrequired, 10);
                if (req.body.urgencylevel !== undefined) updateData.urgencylevel = req.body.urgencylevel;
                if (req.body.isemergency !== undefined) updateData.isemergency = req.body.isemergency === true || req.body.isemergency === "true";
                if (req.body.searchradius !== undefined) updateData.searchradius = parseInt(req.body.searchradius, 10);
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
                        : `Status transitioned from ${existing.status} to ${req.body.status} by ${user.role.toLowerCase()}`);

                await tx.requeststatushistory.create({
                    data: {
                        requestid: targetId,
                        oldstatus: existing.status,
                        newstatus: req.body.status,
                        changedbyuserid: user.userid,
                        remarks,
                    },
                });

                // Notify requester if status was transitioned by hospital or admin
                if (existing.createdbyuserid !== user.userid) {
                    await tx.notification.create({
                        data: {
                            userid: existing.createdbyuserid,
                            requestid: targetId,
                            type: notification_type.REQUEST,
                            title: `Requisition Status: ${req.body.status}`,
                            message: `Blood request for patient ${existing.patientname} (${existing.bloodgroup}) was transitioned to ${req.body.status}. Remarks: ${remarks}`,
                            isread: false,
                        },
                    });
                }
            }

            return updated;
        });

        // If request was marked as emergency or critical upon update, trigger broadcast
        const becameEmergency = (Boolean(bloodRequest.isemergency) || bloodRequest.urgencylevel === "CRITICAL") &&
            (!existing.isemergency && existing.urgencylevel !== "CRITICAL");
        if (becameEmergency) {
            await triggerEmergencyBroadcast({
                requestId: targetId,
                triggeredByUserId: user.userid,
                triggerType: "STATUS_UPDATE",
                triggerReason: "Requisition escalated to emergency",
                radiusKm: bloodRequest.searchradius || 15,
            }).catch((err) => {
                console.error("Emergency broadcast trigger on update error:", err);
            });
        }

        // If requisition transitioned to a terminal status, complete/cancel any active broadcasts
        if (terminalStatuses.includes(bloodRequest.status || "")) {
            await prisma.emergencybroadcasts.updateMany({
                where: { requestid: targetId, status: "ACTIVE" },
                data: { status: bloodRequest.status || "CANCELLED" },
            }).catch(() => {});
        }

        res.status(200).json(bloodRequest);
    } catch (error) {
        console.error("Error updating blood request:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update blood request",
        });
    }
});
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
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
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
        }

        if (existing.createdbyuserid !== user.userid && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Access denied: you do not own this blood request",
            });
        }

        await prisma.bloodrequests.delete({
            where: {
                requestid: targetId,
            },
        });

        res.status(200).json({
            success: true,
            message: "Blood request deleted successfully",
        });
    } catch (error) {
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
router.get("/:id/prescription/file", authenticate, async (req: Request, res: Response) => {
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

        if (!bloodRequest || !bloodRequest.prescription) {
            return res.status(404).json({
                success: false,
                message: "No prescription found for this blood request",
            });
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
        const isDownload = req.query.download === "true";

        res.setHeader("Content-Type", mime);
        res.setHeader(
            "Content-Disposition",
            `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(downloadName)}"`
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
 * POST /bloodrequests/:id/prescription/verify
 * Hospital Clinical Review Endpoint:
 * - Hospital verifies or rejects prescription with mandatory explanation.
 * - Records decision, reviewer, and timestamp in prescription & prescriptionhistory.
 * - Cross-hospital review is strictly blocked.
 * - Direct requester verification is strictly blocked.
 */
router.post("/:id/prescription/verify", authenticate, async (req: Request, res: Response) => {
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

        if (!bloodRequest.prescription) {
            return res.status(400).json({
                success: false,
                message: "This blood request does not have a prescription to verify",
            });
        }

        // Authorization: Must be assigned hospital or ADMIN
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

        const updatedPrescription = await prisma.$transaction(async (tx) => {
            // Update prescription record
            const updated = await tx.prescription.update({
                where: { prescriptionid: bloodRequest.prescription!.prescriptionid },
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

            // Record verification decision in prescription history
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

            // Record in request status history for comprehensive audit
            await tx.requeststatushistory.create({
                data: {
                    requestid: targetId,
                    oldstatus: bloodRequest.status,
                    newstatus: bloodRequest.status || "CREATED",
                    changedbyuserid: user.userid,
                    remarks: `Prescription ${status.toLowerCase()} by hospital staff (${hospitalName})${decisionRemarks ? `: ${decisionRemarks}` : ""}`,
                },
            });

            // Send notification to requester
            const title = status === "VERIFIED" ? "Prescription Verified" : "Prescription Rejected";
            const message = status === "VERIFIED"
                ? `Your prescription for patient ${bloodRequest.patientname} (${bloodRequest.bloodgroup}) has been clinically verified by ${hospitalName}.`
                : `Your prescription for patient ${bloodRequest.patientname} was rejected by ${hospitalName}. Reason: ${decisionRemarks}. Please upload a clear replacement prescription.`;

            await tx.notification.create({
                data: {
                    userid: bloodRequest.createdbyuserid,
                    requestid: targetId,
                    type: notification_type.VERIFICATION,
                    title,
                    message,
                    isread: false,
                },
            });

            return updated;
        });

        res.status(200).json({
            success: true,
            message: `Prescription successfully marked as ${status}`,
            prescription: updatedPrescription,
        });
    } catch (error) {
        console.error("Error verifying prescription:", error);
        res.status(500).json({ success: false, message: "Failed to verify prescription" });
    }
});

/**
 * POST /bloodrequests/:id/prescription/replacement
 * Requester Replacement Upload:
 * - Allows request owner to submit a replacement prescription when rejected.
 * - Validates file signature, format, and size.
 * - Archives prior prescription into prescriptionhistory.
 * - Resets status to PENDING verification and notifies assigned hospital.
 */
router.post(
    "/:id/prescription/replacement",
    authenticate,
    handlePrescriptionUpload,
    async (req: Request, res: Response) => {
        let newFilePath: string | null = null;
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

            // Authorization: Requester who created or owns the request, or Admin
            const isAdmin = user.role === "ADMIN";
            const isCreator = bloodRequest.createdbyuserid === user.userid;
            let isRequesterOwner = false;
            if (user.role === "REQUESTER" || user.role === "PATIENT") {
                const requester = await prisma.requesters.findUnique({ where: { userid: user.userid } });
                if (requester && bloodRequest.requesterid === requester.requesterid) {
                    isRequesterOwner = true;
                }
            }

            if (!isAdmin && !isCreator && !isRequesterOwner) {
                return res.status(403).json({
                    success: false,
                    message: "Access denied: only the request owner can upload a replacement prescription",
                });
            }

            // Cannot replace if already verified
            if (bloodRequest.prescription && bloodRequest.prescription.status === "VERIFIED") {
                return res.status(400).json({
                    success: false,
                    message: "Prescription is already verified. Replacement is not permitted for verified prescriptions.",
                });
            }

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
                // Archive existing state if prescription exists
                if (bloodRequest.prescription) {
                    await tx.prescriptionhistory.create({
                        data: {
                            prescriptionid: bloodRequest.prescription.prescriptionid,
                            requestid: targetId,
                            fileurl: bloodRequest.prescription.fileurl,
                            originalfilename: bloodRequest.prescription.originalfilename,
                            mimetype: bloodRequest.prescription.mimetype,
                            filesize: bloodRequest.prescription.filesize,
                            status: bloodRequest.prescription.status || "REJECTED",
                            reviewedbyhospitalid: bloodRequest.prescription.verifiedbyhospitalid,
                            remarks: bloodRequest.prescription.remarks,
                        },
                    });

                    // Update current prescription back to PENDING with new file
                    return await tx.prescription.update({
                        where: { prescriptionid: bloodRequest.prescription.prescriptionid },
                        data: {
                            fileurl: newFileName,
                            originalfilename: req.file!.originalname,
                            mimetype: validation.detectedMimeType,
                            filesize: req.file!.size,
                            doctorname: req.body.doctorname ? String(req.body.doctorname).trim() : bloodRequest.prescription.doctorname,
                            hospitalname: req.body.hospitalname ? String(req.body.hospitalname).trim() : bloodRequest.prescription.hospitalname,
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
                    // Create brand new prescription if none previously existed
                    return await tx.prescription.create({
                        data: {
                            requestid: targetId,
                            fileurl: newFileName,
                            originalfilename: req.file!.originalname,
                            mimetype: validation.detectedMimeType,
                            filesize: req.file!.size,
                            doctorname: String(req.body.doctorname || "Attending Physician").trim(),
                            hospitalname: String(req.body.hospitalname || (bloodRequest.hospitals?.hospitalname || "Prescribing Hospital")).trim(),
                            status: "PENDING",
                        },
                    });
                }
            });

            // Audit log in status history
            await prisma.requeststatushistory.create({
                data: {
                    requestid: targetId,
                    oldstatus: bloodRequest.status,
                    newstatus: bloodRequest.status || "CREATED",
                    changedbyuserid: user.userid,
                    remarks: "Replacement prescription uploaded by requester. Status reset to PENDING verification.",
                },
            });

            // Notify assigned hospital if present
            if (bloodRequest.hospitalid) {
                const hosp = await prisma.hospitals.findUnique({
                    where: { hospitalid: bloodRequest.hospitalid },
                    select: { userid: true, hospitalname: true },
                });
                if (hosp) {
                    await prisma.notification.create({
                        data: {
                            userid: hosp.userid,
                            requestid: targetId,
                            type: notification_type.VERIFICATION,
                            title: "Replacement Prescription Uploaded",
                            message: `Requester has uploaded a replacement prescription for patient ${bloodRequest.patientname} (${bloodRequest.bloodgroup}). Ready for re-review.`,
                            isread: false,
                        },
                    });
                }
            }

            res.status(200).json({
                success: true,
                message: "Replacement prescription uploaded successfully. Status reset to PENDING.",
                prescription: updatedPrescription,
            });
        } catch (error) {
            console.error("Error uploading replacement prescription:", error);
            if (newFilePath) {
                await fs.promises.unlink(newFilePath).catch(() => {});
            }
            res.status(500).json({ success: false, message: "Failed to upload replacement prescription" });
        }
    }
);

/*
 * GET EMERGENCY BROADCAST STATUS
 * GET /bloodrequests/:id/broadcast
 */
router.get("/:id/broadcast", authenticate, async (req: Request, res: Response) => {
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
router.post("/:id/broadcast", authenticate, async (req: Request, res: Response) => {
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

        // Terminal status check: Cannot broadcast terminal or arranged requisitions
        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED"];
        if (terminalStatuses.includes(bloodRequest.status || "")) {
            return res.status(400).json({
                success: false,
                message: `Cannot initiate emergency broadcast for a requisition that is already ${String(bloodRequest.status).toLowerCase()}`,
            });
        }

        // Ownership authorization: Creator, assigned hospital, or Admin
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

        const expandRadius = Boolean(req.body?.expandRadius);
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

        // Clinical Rule: Cannot respond to terminal blood requests
        if (["FULFILLED", "CANCELLED", "EXPIRED"].includes(request.status || "")) {
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

        // Deduplication: Prevent duplicate responses from the same donor
        const existingResponse = await prisma.notification.findFirst({
            where: {
                userid: user.userid,
                requestid: request.requestid,
                type: notification_type.MATCH,
                title: "Volunteer Response Confirmed",
            },
        });

        if (existingResponse) {
            return res.status(400).json({
                success: false,
                message: "You have already volunteered for this blood request.",
            });
        }

        // Mandatory Pre-Donation Clinical Questionnaire Validation
        const screeningAnswers = req.body?.screeningAnswers || {};
        const {
            drinksAlcohol,
            alcoholInPast24Hours,
            feelingHealthy,
            recentAntibioticsOrMedication,
            recentTattooOrSurgery,
            donatedInLast90Days,
            chronicIllness,
            isPregnantOrBreastfeeding,
        } = screeningAnswers;

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
                drinksAlcohol: drinksAlcohol ?? false,
                alcoholInPast24Hours: alcoholInPast24Hours ?? false,
                feelingHealthy: feelingHealthy ?? true,
                recentAntibioticsOrMedication: recentAntibioticsOrMedication ?? false,
                recentTattooOrSurgery: recentTattooOrSurgery ?? false,
                donatedInLast90Days: donatedInLast90Days ?? false,
                chronicIllness: chronicIllness ?? false,
                isPregnantOrBreastfeeding: isPregnantOrBreastfeeding ?? false,
                alcoholClearance: drinksAlcohol
                    ? (alcoholInPast24Hours ? "Failed" : "Passed (No alcohol in past 24h)")
                    : "Passed (Non-drinker)",
                generalHealth: feelingHealthy !== false ? "Good / Symptom Free" : "Reported Issues",
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

        // Atomic transaction: Notify Requester, Record Donor Confirmation, Progress Status
        await prisma.$transaction(async (tx) => {
            // 1. In-app confirmation notification for the donor (serves as donor response persistence)
            await tx.notification.create({
                data: {
                    userid: user.userid,
                    requestid: request.requestid,
                    type: notification_type.MATCH,
                    title: "Volunteer Response Confirmed",
                    message: `You volunteered to donate for patient ${request.patientname} (${request.bloodgroup}, ${request.unitsrequired} unit(s)) at ${request.hospitals?.hospitalname || "Care Facility"}. Estimated Arrival: ${estimatedArrival}.\n${metaString}`,
                    isread: false,
                },
            });

            // 2. In-app notification for the creator of the request
            await tx.notification.create({
                data: {
                    userid: request.createdbyuserid,
                    requestid: request.requestid,
                    type: notification_type.MATCH,
                    title: "Donor Volunteered for Blood Request",
                    message: `${donorName} (${donorBloodGroup}) has volunteered to donate for patient ${request.patientname} (${request.bloodgroup}). Estimated arrival: ${estimatedArrival}.\n${metaString}`,
                    isread: false,
                },
            });

            // 2b. In-app notification for the assigned hospital if request is assigned to a hospital
            if (request.hospitals && request.hospitals.userid && request.hospitals.userid !== user.userid && request.hospitals.userid !== request.createdbyuserid) {
                await tx.notification.create({
                    data: {
                        userid: request.hospitals.userid,
                        requestid: request.requestid,
                        type: notification_type.MATCH,
                        title: "Volunteer Donor Matched",
                        message: `Donor ${donorName} (${donorBloodGroup}) has volunteered for blood request for patient ${request.patientname} (${request.bloodgroup}) at ${request.hospitals.hospitalname}. Estimated arrival: ${estimatedArrival}.\n${metaString}`,
                        isread: false,
                    },
                });
            }

            // 3. Operational status advancement: Transition CREATED / VERIFIED requests to DONOR_MATCHING
            // Note: Does NOT falsely transition to FULFILLED.
            if (request.status === "CREATED" || request.status === "VERIFIED") {
                await tx.bloodrequests.update({
                    where: { requestid: request.requestid },
                    data: { status: "DONOR_MATCHING" },
                });

                await tx.requeststatushistory.create({
                    data: {
                        requestid: request.requestid,
                        oldstatus: request.status,
                        newstatus: "DONOR_MATCHING",
                        changedbyuserid: user.userid,
                        remarks: `Donor ${donorName} (${donorBloodGroup}) volunteered for blood requisition`,
                    },
                });
            }

            // 4. Update or record broadcast delivery response in the relational model
            const activeDeliveries = await tx.broadcastdeliveries.findMany({
                where: {
                    donorid: donor.donorid,
                    emergencybroadcasts: {
                        requestid: request.requestid,
                    },
                },
                include: {
                    emergencybroadcasts: true,
                },
                orderBy: { createdat: "desc" },
            });

            if (activeDeliveries.length > 0) {
                const delivery = activeDeliveries[0];
                if (delivery.deliverystatus !== "RESPONDED") {
                    await tx.broadcastdeliveries.update({
                        where: { deliveryid: delivery.deliveryid },
                        data: {
                            deliverystatus: "RESPONDED",
                            response: "ACCEPTED",
                            respondedat: new Date(),
                            transitstatus: "DONOR_FOUND",
                        },
                    });

                    await tx.emergencybroadcasts.update({
                        where: { broadcastid: delivery.broadcastid },
                        data: {
                            totalresponded: { increment: 1 },
                            status: "DONOR_RESPONDED",
                        },
                    });
                }
            } else {
                // If there is an active broadcast for this request, record the response delivery
                const latestBroadcast = await tx.emergencybroadcasts.findFirst({
                    where: { requestid: request.requestid },
                    orderBy: { createdat: "desc" },
                });
                if (latestBroadcast) {
                    await tx.broadcastdeliveries.create({
                        data: {
                            broadcastid: latestBroadcast.broadcastid,
                            requestid: request.requestid,
                            donorid: donor.donorid,
                            donoruserid: user.userid,
                            matchtype: "DIRECT_VOLUNTEER",
                            deliverystatus: "RESPONDED",
                            attemptcount: 1,
                            response: "ACCEPTED",
                            respondedat: new Date(),
                            transitstatus: "DONOR_FOUND",
                        },
                    });
                    await tx.emergencybroadcasts.update({
                        where: { broadcastid: latestBroadcast.broadcastid },
                        data: {
                            totalresponded: { increment: 1 },
                            status: "DONOR_RESPONDED",
                        },
                    });
                }
            }
        });

        return res.status(200).json({
            success: true,
            message: "Donation response recorded successfully. The medical coordination team and requester have been notified.",
            requestId: request.requestid,
            patientName: request.patientname,
            transitStatus: "DONOR_FOUND",
            status: request.status === "CREATED" || request.status === "VERIFIED" ? "DONOR_MATCHING" : request.status,
        });
    } catch (error) {
        console.error("Error responding to blood request:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to record response to blood request",
        });
    }
});

/**
 * PATCH /bloodrequests/:id/transit-status
 * Update volunteer donor transit status: DONOR_FOUND -> STARTED -> REACHED_LOCATION -> COMPLETED
 */
router.patch("/:id/transit-status", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const requestId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
        const { status, donorUserId } = req.body;

        const validStatuses = ["DONOR_FOUND", "STARTED", "REACHED_LOCATION", "COMPLETED"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid transit status. Must be one of: ${validStatuses.join(", ")}`,
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

        let isAssignedHospital = false;
        if (user.role === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({ where: { userid: user.userid } });
            if (hosp && request.hospitalid === hosp.hospitalid) {
                isAssignedHospital = true;
            }
        }

        const isDonor = user.role === "DONOR";
        const isRequester = user.role === "REQUESTER" || user.role === "PATIENT" || request.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";

        if (!isDonor && !isRequester && !isAdmin && !isAssignedHospital) {
            return res.status(403).json({
                success: false,
                message: "Access denied: not authorized to update donor transit status",
            });
        }

        // Find the volunteer notification record
        const targetUserId = isDonor ? user.userid : (donorUserId || undefined);
        const whereClause: any = {
            requestid: request.requestid,
            type: notification_type.MATCH,
            title: "Volunteer Response Confirmed",
        };
        if (targetUserId) {
            whereClause.userid = targetUserId;
        }

        const volunteerNotification = await prisma.notification.findFirst({
            where: whereClause,
            orderBy: { sentat: "desc" },
            include: { users: true },
        });

        if (!volunteerNotification) {
            return res.status(404).json({
                success: false,
                message: "No volunteer record found for this request",
            });
        }

        // Parse existing meta
        let meta: any = {};
        const metaMatch = volunteerNotification.message.match(/<!--META:([\s\S]*?)-->/);
        if (metaMatch && metaMatch[1]) {
            try {
                meta = JSON.parse(metaMatch[1]);
            } catch {}
        }

        const nowIso = new Date().toISOString();
        meta.transitStatus = status;
        if (status === "STARTED" && !meta.startedAt) {
            meta.startedAt = nowIso;
        } else if (status === "REACHED_LOCATION" && !meta.reachedAt) {
            meta.reachedAt = nowIso;
        } else if (status === "COMPLETED" && !meta.completedAt) {
            meta.completedAt = nowIso;
        }

        const cleanMessage = volunteerNotification.message.replace(/<!--META:[\s\S]*?-->/g, "").trim();
        const updatedMessage = `${cleanMessage}\n<!--META:${JSON.stringify(meta)}-->`;

        // Update volunteer notification
        await prisma.notification.update({
            where: { notificationid: volunteerNotification.notificationid },
            data: { message: updatedMessage },
        });

        // Also update the requester's corresponding notification if it exists
        const requesterNotif = await prisma.notification.findFirst({
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
            await prisma.notification.update({
                where: { notificationid: requesterNotif.notificationid },
                data: { message: `${reqCleanMsg}\n<!--META:${JSON.stringify(meta)}-->` },
            });
        }

        // Relational update: synchronize transit milestones to broadcastdeliveries
        const donorUserTarget = isDonor ? user.userid : (targetUserId || volunteerNotification.userid);
        if (donorUserTarget) {
            const donorProfile = await prisma.donors.findUnique({
                where: { userid: donorUserTarget },
            });
            if (donorProfile) {
                await prisma.broadcastdeliveries.updateMany({
                    where: {
                        donorid: donorProfile.donorid,
                        emergencybroadcasts: {
                            requestid: request.requestid,
                        },
                    },
                    data: {
                        transitstatus: status,
                        ...(status === "STARTED" ? { startedat: new Date() } : {}),
                        ...(status === "REACHED_LOCATION" ? { reachedat: new Date() } : {}),
                        ...(status === "COMPLETED" ? { completedat: new Date() } : {}),
                    },
                });
            }
        }

        // Notify the requester and assigned hospital about the transit update
        const statusDescriptions: Record<string, string> = {
            STARTED: `Donor ${meta.donorName || "Volunteer"} has started their journey to ${request.hospitals?.hospitalname || "the hospital"}.`,
            REACHED_LOCATION: `Donor ${meta.donorName || "Volunteer"} has reached ${request.hospitals?.hospitalname || "the hospital"} transfusion desk!`,
            COMPLETED: `Blood donation for patient ${request.patientname} by donor ${meta.donorName || "Volunteer"} has been completed.`,
        };

        if (statusDescriptions[status]) {
            // Notify requester
            if (request.createdbyuserid !== user.userid) {
                await prisma.notification.create({
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

            // Notify assigned hospital
            if (request.hospitals && request.hospitals.userid && request.hospitals.userid !== user.userid && request.hospitals.userid !== request.createdbyuserid) {
                await prisma.notification.create({
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
        }

        // If completed, update blood request status to BLOOD_ARRANGED atomically with history
        if (status === "COMPLETED") {
            await prisma.$transaction(async (tx) => {
                if (request.status !== "BLOOD_ARRANGED" && request.status !== "FULFILLED") {
                    await tx.bloodrequests.update({
                        where: { requestid: request.requestid },
                        data: { status: "BLOOD_ARRANGED" },
                    });

                    await tx.requeststatushistory.create({
                        data: {
                            requestid: request.requestid,
                            oldstatus: request.status,
                            newstatus: "BLOOD_ARRANGED",
                            changedbyuserid: user.userid,
                            remarks: `Donation completed by donor ${meta.donorName || "Volunteer"}. Blood unit arranged for transfusion.`,
                        },
                    });
                }
            });
        }

        return res.status(200).json({
            success: true,
            message: `Transit status updated to ${status}`,
            transitStatus: status,
            meta,
        });
    } catch (error) {
        console.error("Error updating transit status:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update transit status",
        });
    }
});

export default router;