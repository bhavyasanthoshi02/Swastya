import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { checkHospitalOwnership } from "../middleware/ownership.middleware";
import { getJwtSecret } from "../utils/jwt";
import { approval_status, blood_group, blood_component, notification_type, verification_status } from "../generated/prisma/enums";
import { DonorImportService, normalizeBloodGroup } from "../services/donorImport.service";
import { validateCoordinates } from "../utils/distance";

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

const formatBloodGroup = (bg: string): string => {
    const map: Record<string, string> = {
        A_POSITIVE: "A+",
        A_NEGATIVE: "A-",
        B_POSITIVE: "B+",
        B_NEGATIVE: "B-",
        AB_POSITIVE: "AB+",
        AB_NEGATIVE: "AB-",
        O_POSITIVE: "O+",
        O_NEGATIVE: "O-",
    };
    return map[bg] || bg;
};

// Helper to extract authenticated user without rejecting unauthenticated public requests
const extractOptionalUser = (req: Request): { userid: string; role: string } | null => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            if (token && token.trim() !== "") {
                const secret = getJwtSecret();
                const decoded = jwt.verify(token, secret);
                return decoded as { userid: string; role: string };
            }
        }
    } catch {
        // Token invalid or expired - treat as unauthenticated
    }
    return null;
};

/*
 * GET ALL HOSPITALS (PUBLIC DIRECTORY)
 * GET /hospitals
 * Returns public facility directory projection. Never leaks user passwords or private tokens.
 */
router.get("/", async (_req: Request, res: Response) => {
    try {
        const hospitals = await prisma.hospitals.findMany({
            select: {
                hospitalid: true,
                hospitalname: true,
                address: true,
                city: true,
                state: true,
                pincode: true,
                latitude: true,
                longitude: true,
                approvalstatus: true,
                createdat: true,
                updatedat: true,
            },
            orderBy: {
                hospitalname: "asc",
            },
        });

        return res.status(200).json(hospitals);
    } catch (error) {
        console.error("Error fetching hospitals:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch hospitals",
        });
    }
});

/*
 * GET AUTHENTICATED HOSPITAL PROFILE
 * GET /hospitals/me
 */
router.get("/me", authenticate, authorize("HOSPITAL", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const hospital = await prisma.hospitals.findUnique({
            where: {
                userid: user.userid,
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
            },
        });

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: "Hospital profile not found for this account",
            });
        }

        return res.status(200).json({
            success: true,
            hospital,
        });
    } catch (error) {
        console.error("Error fetching hospital self-profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve hospital profile",
        });
    }
});

/*
 * UPDATE AUTHENTICATED HOSPITAL PROFILE
 * PUT /hospitals/me
 * Allows editing allowed profile fields. Protects hospitalid, userid, registrationnumber, and approvalstatus.
 */
router.put("/me", authenticate, authorize("HOSPITAL", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const existingHospital = await prisma.hospitals.findUnique({
            where: {
                userid: user.userid,
            },
        });

        if (!existingHospital) {
            return res.status(404).json({
                success: false,
                message: "Hospital profile not found for this account",
            });
        }

        // Strict security: Hospital users cannot mutate their own approval status
        if (req.body.approvalstatus !== undefined && user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Modifying approval status requires administrative privileges",
            });
        }

        // Field validation
        const {
            hospitalname,
            contactpersonname,
            contactpersonphone,
            address,
            city,
            state,
            pincode,
            latitude,
            longitude,
            approvalstatus,
        } = req.body;

        if (hospitalname !== undefined && (!String(hospitalname).trim() || String(hospitalname).length > 255)) {
            return res.status(400).json({
                success: false,
                message: "Valid hospital name (1-255 characters) is required",
            });
        }

        if (contactpersonname !== undefined && (!String(contactpersonname).trim() || String(contactpersonname).length > 100)) {
            return res.status(400).json({
                success: false,
                message: "Valid contact person name (1-100 characters) is required",
            });
        }

        if (contactpersonphone !== undefined && (!String(contactpersonphone).trim() || String(contactpersonphone).length > 15)) {
            return res.status(400).json({
                success: false,
                message: "Valid contact phone number (1-15 characters) is required",
            });
        }

        if (city !== undefined && (!String(city).trim() || String(city).length > 100)) {
            return res.status(400).json({
                success: false,
                message: "Valid city is required",
            });
        }

        if (state !== undefined && (!String(state).trim() || String(state).length > 100)) {
            return res.status(400).json({
                success: false,
                message: "Valid state is required",
            });
        }

        if (pincode !== undefined && (!String(pincode).trim() || String(pincode).length > 10)) {
            return res.status(400).json({
                success: false,
                message: "Valid postal pincode is required",
            });
        }

        let parsedApproval: approval_status | undefined = undefined;
        if (user.role === "ADMIN" && approvalstatus !== undefined) {
            const validStatuses = Object.values(approval_status);
            if (!validStatuses.includes(approvalstatus)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid approval status. Must be one of: ${validStatuses.join(", ")}`,
                });
            }
            parsedApproval = approvalstatus;
        }

        const updatedHospital = await prisma.hospitals.update({
            where: {
                hospitalid: existingHospital.hospitalid,
            },
            data: {
                hospitalname: hospitalname !== undefined ? String(hospitalname).trim() : existingHospital.hospitalname,
                contactpersonname: contactpersonname !== undefined ? String(contactpersonname).trim() : existingHospital.contactpersonname,
                contactpersonphone: contactpersonphone !== undefined ? String(contactpersonphone).trim() : existingHospital.contactpersonphone,
                address: address !== undefined ? String(address).trim() : existingHospital.address,
                city: city !== undefined ? String(city).trim() : existingHospital.city,
                state: state !== undefined ? String(state).trim() : existingHospital.state,
                pincode: pincode !== undefined ? String(pincode).trim() : existingHospital.pincode,
                latitude: latitude !== undefined ? latitude : existingHospital.latitude,
                longitude: longitude !== undefined ? longitude : existingHospital.longitude,
                approvalstatus: parsedApproval !== undefined ? parsedApproval : existingHospital.approvalstatus,
                updatedat: new Date(),
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
            },
        });

        return res.status(200).json({
            success: true,
            message: "Hospital profile updated successfully",
            hospital: updatedHospital,
        });
    } catch (error) {
        console.error("Error updating hospital self-profile:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update hospital profile",
        });
    }
});

/*
 * GET AUTHENTICATED HOSPITAL DASHBOARD
 * GET /hospitals/me/dashboard
 */
router.get("/me/dashboard", authenticate, authorize("HOSPITAL", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const hospital = await prisma.hospitals.findUnique({
            where: { userid: user.userid },
        });

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: "Hospital profile not found for this account",
            });
        }

        const [totalRequests, emergencyRequests, fulfilledRequests, recentRequests] = await Promise.all([
            prisma.bloodrequests.count({
                where: { hospitalid: hospital.hospitalid },
            }),
            prisma.bloodrequests.count({
                where: {
                    hospitalid: hospital.hospitalid,
                    isemergency: true,
                },
            }),
            prisma.bloodrequests.count({
                where: {
                    hospitalid: hospital.hospitalid,
                    status: "FULFILLED",
                },
            }),
            prisma.bloodrequests.findMany({
                where: { hospitalid: hospital.hospitalid },
                orderBy: { createdat: "desc" },
                take: 5,
            }),
        ]);

        return res.status(200).json({
            success: true,
            totalRequests,
            emergencyRequests,
            fulfilledRequests,
            recentRequests,
        });
    } catch (error) {
        console.error("Error loading hospital me dashboard:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard",
        });
    }
});

/*
 * GET HOSPITAL DASHBOARD BY ID
 * GET /hospitals/:hospitalId/dashboard
 */
router.get(
    "/:hospitalId/dashboard",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    checkHospitalOwnership,
    async (req: Request, res: Response) => {
        try {
            const hospitalId = req.params.hospitalId as string;

            const [totalRequests, emergencyRequests, fulfilledRequests, recentRequests] = await Promise.all([
                prisma.bloodrequests.count({
                    where: { hospitalid: hospitalId },
                }),
                prisma.bloodrequests.count({
                    where: {
                        hospitalid: hospitalId,
                        isemergency: true,
                    },
                }),
                prisma.bloodrequests.count({
                    where: {
                        hospitalid: hospitalId,
                        status: "FULFILLED",
                    },
                }),
                prisma.bloodrequests.findMany({
                    where: { hospitalid: hospitalId },
                    orderBy: { createdat: "desc" },
                    take: 5,
                }),
            ]);

            return res.status(200).json({
                success: true,
                totalRequests,
                emergencyRequests,
                fulfilledRequests,
                recentRequests,
            });
        } catch (error) {
            console.error("Error loading dashboard by id:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to load dashboard",
            });
        }
    }
);

/*
 * GET AUTHENTICATED HOSPITAL BLOOD REQUESTS
 * GET /hospitals/me/bloodrequests
 */
router.get("/me/bloodrequests", authenticate, authorize("HOSPITAL", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const hospital = await prisma.hospitals.findUnique({
            where: { userid: user.userid },
        });

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: "Hospital profile not found for this account",
            });
        }

        const bloodRequests = await prisma.bloodrequests.findMany({
            where: {
                hospitalid: hospital.hospitalid,
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
            orderBy: {
                createdat: "desc",
            },
        });

        return res.status(200).json(bloodRequests);
    } catch (error) {
        console.error("Error fetching hospital me blood requests:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch blood requests",
        });
    }
});

/**
 * Reusable handler for creating a hospital blood request atomically
 */
async function createHospitalBloodRequestCore(hospital: any, user: any, body: any, res: Response) {
    // Validate required fields
    if (!body.patientname || !String(body.patientname).trim()) {
        return res.status(400).json({ success: false, message: "Patient name is required" });
    }
    if (String(body.patientname).trim().length > 100) {
        return res.status(400).json({ success: false, message: "Patient name cannot exceed 100 characters" });
    }

    const age = typeof body.patientage === "number" ? body.patientage : parseInt(body.patientage, 10);
    if (isNaN(age) || age <= 0 || age > 125) {
        return res.status(400).json({ success: false, message: "Valid patient age (1-125) is required" });
    }

    const gender = String(body.patientgender || "").trim().toUpperCase();
    if (!["MALE", "FEMALE", "OTHER"].includes(gender)) {
        return res.status(400).json({ success: false, message: "Patient gender must be MALE, FEMALE, or OTHER" });
    }

    const contact = String(body.patientcontact || "").trim();
    if (!contact) {
        return res.status(400).json({ success: false, message: "Patient contact number is required" });
    }
    const cleanPhone = contact.replace(/[\s-]/g, "");
    if (cleanPhone.length < 7 || cleanPhone.length > 15 || !/^[0-9+]+$/.test(cleanPhone)) {
        return res.status(400).json({ success: false, message: "Valid contact phone number is required" });
    }

    const normalizedBg = normalizeBloodGroup(body.bloodgroup);
    if (!normalizedBg) {
        return res.status(400).json({ success: false, message: "Valid blood group is required" });
    }

    const validComponents = ["WHOLE_BLOOD", "PLATELETS", "PLASMA", "RBC"];
    if (!validComponents.includes(body.bloodcomponent)) {
        return res.status(400).json({ success: false, message: "Valid blood component is required" });
    }

    const units = typeof body.unitsrequired === "number" ? body.unitsrequired : parseInt(body.unitsrequired, 10);
    if (isNaN(units) || units < 1 || units > 100) {
        return res.status(400).json({ success: false, message: "Units required must be between 1 and 100" });
    }

    const validUrgency = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    if (!validUrgency.includes(body.urgencylevel)) {
        return res.status(400).json({ success: false, message: "Valid urgency level is required" });
    }

    if (!body.requiredby) {
        return res.status(400).json({ success: false, message: "Required-by date and time is required" });
    }

    const requiredDate = new Date(body.requiredby);
    if (isNaN(requiredDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid required-by date format" });
    }

    if (requiredDate.getTime() < Date.now() - 5 * 60 * 1000) {
        return res.status(400).json({ success: false, message: "Required-by date and time cannot be in the past" });
    }

    const radius = body.searchradius ? parseInt(body.searchradius, 10) : 15;
    if (isNaN(radius) || radius < 1 || radius > 100) {
        return res.status(400).json({ success: false, message: "Valid search radius (1-100 km) is required" });
    }

    const isEmergency = body.isemergency !== undefined
        ? Boolean(body.isemergency)
        : (body.urgencylevel === "CRITICAL");

    const notes = body.notes ? String(body.notes).trim() : null;

    // Coordinate validation and safe inheritance from hospital
    let requestLatitude: number | null = null;
    let requestLongitude: number | null = null;

    if (
        (body.latitude !== undefined && body.latitude !== null && String(body.latitude).trim() !== "") ||
        (body.longitude !== undefined && body.longitude !== null && String(body.longitude).trim() !== "")
    ) {
        const coordValidation = validateCoordinates(body.latitude, body.longitude);
        if (!coordValidation.valid) {
            return res.status(400).json({ success: false, message: coordValidation.error });
        }
        requestLatitude = coordValidation.latitude!;
        requestLongitude = coordValidation.longitude!;
    } else {
        // Inherit from hospital profile
        if (hospital.latitude !== null && hospital.longitude !== null) {
            requestLatitude = Number(hospital.latitude);
            requestLongitude = Number(hospital.longitude);
        }
    }

    // Atomic transaction: Create blood request, status history, and confirmation notification
    const bloodRequest = await prisma.$transaction(async (tx) => {
        const created = await tx.bloodrequests.create({
            data: {
                createdbyuserid: user.userid,
                requesterid: null, // Hospital-created requests have no requester account
                hospitalid: hospital.hospitalid, // Securely bind to authenticated hospital

                patientname: String(body.patientname).trim(),
                patientage: age,
                patientgender: gender as any,
                patientcontact: contact,

                bloodgroup: normalizedBg,
                bloodcomponent: body.bloodcomponent,

                unitsrequired: units,
                urgencylevel: body.urgencylevel,
                isemergency: isEmergency,
                searchradius: radius,
                latitude: requestLatitude,
                longitude: requestLongitude,

                requiredby: requiredDate,
                status: "CREATED",
                notes,
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
                hospitals: {
                    select: {
                        hospitalid: true,
                        hospitalname: true,
                        registrationnumber: true,
                        contactpersonname: true,
                        contactpersonphone: true,
                        address: true,
                        city: true,
                        state: true,
                        pincode: true,
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

        await tx.requeststatushistory.create({
            data: {
                requestid: created.requestid,
                oldstatus: null,
                newstatus: "CREATED",
                changedbyuserid: user.userid,
                remarks: `Blood requisition created directly by hospital ${hospital.hospitalname}`,
            },
        });

        await tx.notification.create({
            data: {
                userid: user.userid,
                requestid: created.requestid,
                type: notification_type.REQUEST,
                title: "Hospital Blood Requisition Created",
                message: `Requisition for patient ${created.patientname} (${created.bloodgroup}, ${created.unitsrequired} unit(s)) successfully registered at ${hospital.hospitalname}.`,
                isread: false,
            },
        });

        return created;
    });

    return res.status(201).json(bloodRequest);
}

/*
 * CREATE AUTHENTICATED HOSPITAL BLOOD REQUEST
 * POST /hospitals/me/bloodrequests
 */
router.post("/me/bloodrequests", authenticate, authorize("HOSPITAL", "ADMIN"), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const hospital = await prisma.hospitals.findUnique({
            where: { userid: user.userid },
        });

        if (!hospital) {
            return res.status(403).json({
                success: false,
                message: "Hospital profile not found for this account. Requisition creation requires a linked hospital profile.",
            });
        }

        return await createHospitalBloodRequestCore(hospital, user, req.body, res);
    } catch (error) {
        console.error("Error creating hospital me blood request:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create blood request",
        });
    }
});

/*
 * GET HOSPITAL BLOOD REQUESTS BY ID
 * GET /hospitals/:hospitalId/bloodrequests
 */
router.get(
    "/:hospitalId/bloodrequests",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    checkHospitalOwnership,
    async (req: Request, res: Response) => {
        try {
            const hospitalId = req.params.hospitalId as string;

            const bloodRequests = await prisma.bloodrequests.findMany({
                where: {
                    hospitalid: hospitalId,
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
                orderBy: {
                    createdat: "desc",
                },
            });

            return res.status(200).json(bloodRequests);
        } catch (error) {
            console.error("Error fetching hospital blood requests:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch blood requests",
            });
        }
    }
);

/*
 * CREATE HOSPITAL BLOOD REQUEST BY ID
 * POST /hospitals/:hospitalId/bloodrequests
 */
router.post(
    "/:hospitalId/bloodrequests",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    checkHospitalOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const hospitalId = req.params.hospitalId as string;

            const hospital = await prisma.hospitals.findUnique({
                where: { hospitalid: hospitalId },
            });

            if (!hospital) {
                return res.status(404).json({
                    success: false,
                    message: "Hospital not found",
                });
            }

            return await createHospitalBloodRequestCore(hospital, user, req.body, res);
        } catch (error) {
            console.error("Error creating hospital blood request by id:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to create blood request",
            });
        }
    }
);

/*
 * GET HOSPITAL BY ID
 * GET /hospitals/:id
 * Prevents hospital A from inspecting hospital B's private account details.
 * Public caller receives safe facility projection. Owner/Admin receives full profile.
 */
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const hospitalId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!hospitalId || !UUID_REGEX.test(hospitalId)) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found",
            });
        }

        const hospital = await prisma.hospitals.findUnique({
            where: {
                hospitalid: hospitalId,
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
            },
        });

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found",
            });
        }

        const optionalUser = extractOptionalUser(req);

        // Security boundary: If caller is authenticated as a HOSPITAL, prevent accessing another hospital's private record
        if (optionalUser && optionalUser.role === "HOSPITAL" && hospital.userid !== optionalUser.userid) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        // If caller is the hospital owner or an administrator, return complete profile with safe user info
        const isOwnerOrAdmin = optionalUser && (hospital.userid === optionalUser.userid || optionalUser.role === "ADMIN");
        if (isOwnerOrAdmin) {
            return res.status(200).json(hospital);
        }

        // General public projection: facility info only, no contact person direct phone or internal user details
        return res.status(200).json({
            hospitalid: hospital.hospitalid,
            hospitalname: hospital.hospitalname,
            address: hospital.address,
            city: hospital.city,
            state: hospital.state,
            pincode: hospital.pincode,
            latitude: hospital.latitude,
            longitude: hospital.longitude,
            approvalstatus: hospital.approvalstatus,
            createdat: hospital.createdat,
            updatedat: hospital.updatedat,
        });
    } catch (error) {
        console.error("Error fetching hospital by id:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch hospital",
        });
    }
});

/*
 * ADMIN CREATE HOSPITAL
 * POST /hospitals
 * Raw creation restricted to ADMIN. Standard onboarding goes through /auth/register.
 */
router.post("/", authenticate, authorize("ADMIN"), async (req: Request, res: Response) => {
    try {
        const {
            userid,
            hospitalname,
            registrationnumber,
            contactpersonname,
            contactpersonphone,
            address,
            city,
            state,
            pincode,
            latitude,
            longitude,
            approvalstatus,
        } = req.body;

        if (!userid || !hospitalname || !registrationnumber || !contactpersonname || !contactpersonphone || !address || !city || !state || !pincode) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields for hospital creation",
            });
        }

        const hospital = await prisma.hospitals.create({
            data: {
                userid,
                hospitalname: String(hospitalname).trim(),
                registrationnumber: String(registrationnumber).trim(),
                contactpersonname: String(contactpersonname).trim(),
                contactpersonphone: String(contactpersonphone).trim(),
                address: String(address).trim(),
                city: String(city).trim(),
                state: String(state).trim(),
                pincode: String(pincode).trim(),
                latitude: latitude !== undefined ? latitude : null,
                longitude: longitude !== undefined ? longitude : null,
                approvalstatus: approvalstatus || approval_status.PENDING,
            },
        });

        return res.status(201).json(hospital);
    } catch (error) {
        console.error("Error creating hospital:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create hospital",
        });
    }
});

/*
 * UPDATE HOSPITAL BY ID
 * PUT /hospitals/:id
 * Protected by authentication, role authorization, and ownership.
 * Non-admins cannot alter approvalstatus or registrationnumber.
 */
router.put(
    "/:id",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    checkHospitalOwnership,
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const hospitalId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

            if (req.body.approvalstatus !== undefined && user.role !== "ADMIN") {
                return res.status(403).json({
                    success: false,
                    message: "Modifying approval status requires administrative privileges",
                });
            }

            const existing = await prisma.hospitals.findUnique({
                where: { hospitalid: hospitalId },
            });

            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: "Hospital not found",
                });
            }

            const {
                hospitalname,
                contactpersonname,
                contactpersonphone,
                address,
                city,
                state,
                pincode,
                latitude,
                longitude,
                approvalstatus,
            } = req.body;

            const hospital = await prisma.hospitals.update({
                where: {
                    hospitalid: hospitalId,
                },
                data: {
                    hospitalname: hospitalname !== undefined ? String(hospitalname).trim() : existing.hospitalname,
                    contactpersonname: contactpersonname !== undefined ? String(contactpersonname).trim() : existing.contactpersonname,
                    contactpersonphone: contactpersonphone !== undefined ? String(contactpersonphone).trim() : existing.contactpersonphone,
                    address: address !== undefined ? String(address).trim() : existing.address,
                    city: city !== undefined ? String(city).trim() : existing.city,
                    state: state !== undefined ? String(state).trim() : existing.state,
                    pincode: pincode !== undefined ? String(pincode).trim() : existing.pincode,
                    latitude: latitude !== undefined ? latitude : existing.latitude,
                    longitude: longitude !== undefined ? longitude : existing.longitude,
                    approvalstatus: user.role === "ADMIN" && approvalstatus !== undefined ? approvalstatus : existing.approvalstatus,
                    updatedat: new Date(),
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
                },
            });

            return res.status(200).json(hospital);
        } catch (error) {
            console.error("Error updating hospital:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update hospital",
            });
        }
    }
);

/*
 * DOWNLOAD DONOR IMPORT TEMPLATE
 * GET /hospitals/me/donors/import/template
 */
router.get(
    "/me/donors/import/template",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const format = (req.query.format as string)?.toLowerCase() === "xlsx" ? "xlsx" : "csv";
            const template = DonorImportService.generateTemplate(format);

            if (format === "xlsx") {
                res.setHeader(
                    "Content-Type",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                );
                res.setHeader("Content-Disposition", 'attachment; filename="Swastya_Donor_Import_Template.xlsx"');
                return res.send(template);
            }

            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", 'attachment; filename="Swastya_Donor_Import_Template.csv"');
            return res.send(template);
        } catch (error) {
            console.error("Error generating import template:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to generate donor import template",
            });
        }
    }
);

/*
 * PREVIEW DONOR BULK IMPORT (STEP 1)
 * POST /hospitals/me/donors/import/preview
 */
router.post(
    "/me/donors/import/preview",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    upload.single("file"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Only registered hospital accounts can access this hospital registry.",
                });
            }

            let fileBuffer: Buffer | null = null;
            let originalName = "";

            if (req.file) {
                fileBuffer = req.file.buffer;
                originalName = req.file.originalname || "donors.csv";
            } else if (req.body.fileData) {
                fileBuffer = Buffer.from(req.body.fileData, "base64");
                originalName = req.body.fileName || "donors.xlsx";
            } else if (req.body.csvContent) {
                fileBuffer = Buffer.from(req.body.csvContent, "utf-8");
                originalName = req.body.fileName || "donors.csv";
            }

            if (!fileBuffer || fileBuffer.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No file content provided for import.",
                });
            }

            // Check file size (5MB max)
            if (fileBuffer.length > 5 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    message: "File exceeds maximum permitted size of 5MB.",
                });
            }

            // Check file extension
            const lowerName = originalName.toLowerCase();
            const isExcel = lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");
            const isCsv = lowerName.endsWith(".csv");

            if (!isExcel && !isCsv) {
                return res.status(400).json({
                    success: false,
                    message: "Unsupported file type. Only Excel (.xlsx, .xls) and CSV (.csv) spreadsheets are permitted.",
                });
            }

            // Parse file
            const parsed = DonorImportService.parseFile(fileBuffer, originalName);
            if (parsed.donors.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "The uploaded file does not contain any valid donor rows.",
                });
            }

            // Validate and generate preview
            const preview = await DonorImportService.validateAndPreview(hospital.hospitalid, parsed);

            return res.status(200).json({
                success: true,
                message: "File successfully parsed and validated for preview.",
                ...preview,
            });
        } catch (error: any) {
            console.error("Import preview error:", error);
            return res.status(400).json({
                success: false,
                message: error.message || "Failed to parse and preview import file.",
            });
        }
    }
);

/*
 * COMMIT DONOR BULK IMPORT (STEP 2)
 * POST /hospitals/me/donors/import/commit
 */
router.post(
    "/me/donors/import/commit",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    upload.single("file"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Only registered hospital accounts can commit registry imports.",
                });
            }

            let toCreate = req.body.toCreate;
            let toLink = req.body.toLink;
            let validDonations = req.body.validDonations || [];

            // If client re-sent the raw file with direct confirmation
            if ((!toCreate || !Array.isArray(toCreate)) && (req.file || req.body.fileData || req.body.csvContent)) {
                let fileBuffer: Buffer | null = null;
                let originalName = "";

                if (req.file) {
                    fileBuffer = req.file.buffer;
                    originalName = req.file.originalname || "donors.csv";
                } else if (req.body.fileData) {
                    fileBuffer = Buffer.from(req.body.fileData, "base64");
                    originalName = req.body.fileName || "donors.xlsx";
                } else if (req.body.csvContent) {
                    fileBuffer = Buffer.from(req.body.csvContent, "utf-8");
                    originalName = req.body.fileName || "donors.csv";
                }

                if (fileBuffer) {
                    const parsed = DonorImportService.parseFile(fileBuffer, originalName);
                    const preview = await DonorImportService.validateAndPreview(hospital.hospitalid, parsed);
                    toCreate = preview.toCreate;
                    toLink = preview.toLink;
                    validDonations = preview.validDonations;
                }
            }

            if (!Array.isArray(toCreate)) toCreate = [];
            if (!Array.isArray(toLink)) toLink = [];
            if (!Array.isArray(validDonations)) validDonations = [];

            if (toCreate.length === 0 && toLink.length === 0 && validDonations.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No valid donor or donation records were approved for commit.",
                });
            }

            const result = await DonorImportService.commitImport(
                hospital.hospitalid,
                hospital.hospitalname,
                { toCreate, toLink, validDonations }
            );

            return res.status(200).json({
                success: true,
                message: "Donor import committed successfully.",
                ...result,
            });
        } catch (error: any) {
            console.error("Import commit error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to commit donor import.",
            });
        }
    }
);

/*
 * GET HOSPITAL DONOR REGISTRY
 * GET /hospitals/me/donors
 */
router.get(
    "/me/donors",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Only registered hospital accounts can view this donor registry.",
                });
            }

            const search = (req.query.search as string)?.trim();
            const bloodGroupParam = (req.query.bloodGroup as string)?.trim();
            const accountStatus = (req.query.accountStatus as string)?.trim();
            const verificationStatusParam = (req.query.verificationStatus as string)?.trim();

            const page = Math.max(1, parseInt(req.query.page as string) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
            const skip = (page - 1) * limit;

            // Build where filter with strict hospital tenant isolation
            const whereClause: any = {
                hospitalid: hospital.hospitalid,
            };

            if (bloodGroupParam) {
                const bg = normalizeBloodGroup(bloodGroupParam);
                if (bg) {
                    whereClause.donors = {
                        ...(whereClause.donors || {}),
                        bloodgroup: bg,
                    };
                }
            }

            if (accountStatus) {
                const isActive = accountStatus.toUpperCase() === "ACTIVATED";
                whereClause.donors = {
                    ...(whereClause.donors || {}),
                    users: {
                        ...(whereClause.donors?.users || {}),
                        isactive: isActive,
                    },
                };
            }

            if (verificationStatusParam) {
                const vStatus = verificationStatusParam.toUpperCase() as verification_status;
                if (Object.values(verification_status).includes(vStatus)) {
                    whereClause.donors = {
                        ...(whereClause.donors || {}),
                        donationhistory: {
                            some: {
                                hospitalid: hospital.hospitalid,
                                verificationstatus: vStatus,
                            },
                        },
                    };
                }
            }

            if (search) {
                whereClause.OR = [
                    { donors: { users: { name: { contains: search, mode: "insensitive" } } } },
                    { donors: { users: { email: { contains: search, mode: "insensitive" } } } },
                    { donors: { users: { phonenumber: { contains: search } } } },
                    { sourceidentifier: { contains: search, mode: "insensitive" } },
                ];
            }

            const [records, total] = await Promise.all([
                prisma.hospitaldonors.findMany({
                    where: whereClause,
                    include: {
                        donors: {
                            include: {
                                users: {
                                    select: {
                                        userid: true,
                                        name: true,
                                        email: true,
                                        phonenumber: true,
                                        isactive: true,
                                        createdat: true,
                                    },
                                },
                                donationhistory: {
                                    where: { hospitalid: hospital.hospitalid },
                                    select: {
                                        donationhistoryid: true,
                                        donationdate: true,
                                        unitsdonated: true,
                                        isimported: true,
                                        verificationstatus: true,
                                    },
                                    orderBy: { donationdate: "desc" },
                                },
                            },
                        },
                    },
                    orderBy: { createdat: "desc" },
                    skip,
                    take: limit,
                }),
                prisma.hospitaldonors.count({ where: whereClause }),
            ]);

            const donors = records.map((r) => {
                const d = r.donors;
                const u = d.users;
                const hospitalDonations = d.donationhistory || [];
                const latestDonation = hospitalDonations[0] || null;

                // Determine verification status summary for this donor at this hospital
                let histStatus: string = "NONE";
                if (hospitalDonations.length > 0) {
                    const hasPending = hospitalDonations.some((dh) => dh.verificationstatus === "PENDING");
                    const hasRejected = hospitalDonations.some((dh) => dh.verificationstatus === "REJECTED");
                    const hasVerified = hospitalDonations.some((dh) => dh.verificationstatus === "VERIFIED");

                    if (hasPending) histStatus = "PENDING";
                    else if (hasVerified) histStatus = "VERIFIED";
                    else if (hasRejected) histStatus = "REJECTED";
                }

                return {
                    registryId: r.id,
                    donorId: d.donorid,
                    userId: u.userid,
                    name: u.name,
                    email: u.email,
                    phoneNumber: u.phonenumber,
                    bloodGroup: formatBloodGroup(d.bloodgroup),
                    gender: d.gender,
                    city: d.city,
                    state: d.state,
                    accountStatus: u.isactive ? "ACTIVATED" : "PENDING_ACTIVATION",
                    isEligible: d.iseligible ?? true,
                    donationCount: hospitalDonations.length,
                    lastDonationDate: latestDonation?.donationdate || null,
                    historicalVerificationStatus: histStatus,
                    sourceIdentifier: r.sourceidentifier,
                    registryStatus: r.status,
                    createdAt: r.createdat,
                };
            });

            return res.status(200).json({
                success: true,
                page,
                limit,
                total,
                donors,
            });
        } catch (error) {
            console.error("Error fetching hospital donor registry:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch hospital donor registry",
            });
        }
    }
);

/*
 * GET SINGLE DONOR FROM HOSPITAL REGISTRY
 * GET /hospitals/me/donors/:donorId
 */
router.get(
    "/me/donors/:donorId",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Only registered hospital accounts can view donor registry details.",
                });
            }

            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;

            if (!donorId || !UUID_REGEX.test(donorId)) {
                return res.status(404).json({
                    success: false,
                    message: "Donor not found in your hospital registry.",
                });
            }

            // Verify donor belongs to authenticated hospital's registry (Tenant Isolation)
            const link = await prisma.hospitaldonors.findFirst({
                where: {
                    hospitalid: hospital.hospitalid,
                    donorid: donorId,
                },
                include: {
                    donors: {
                        include: {
                            users: {
                                select: {
                                    userid: true,
                                    name: true,
                                    email: true,
                                    phonenumber: true,
                                    isactive: true,
                                    createdat: true,
                                },
                            },
                            donationhistory: {
                                where: { hospitalid: hospital.hospitalid },
                                orderBy: { donationdate: "desc" },
                            },
                        },
                    },
                },
            });

            if (!link) {
                return res.status(404).json({
                    success: false,
                    message: "Donor not found in your hospital registry.",
                });
            }

            const d = link.donors;
            const u = d.users;
            const donations = d.donationhistory.map((dh) => ({
                donationHistoryId: dh.donationhistoryid,
                donationDate: dh.donationdate,
                unitsDonated: dh.unitsdonated,
                bloodComponent: dh.bloodcomponent || "WHOLE_BLOOD",
                isImported: dh.isimported ?? false,
                verificationStatus: dh.verificationstatus ?? (dh.isimported ? "PENDING" : "VERIFIED"),
                sourceRecordId: dh.sourcerecordid,
                remarks: dh.remarks,
                createdAt: dh.createdat,
            }));

            return res.status(200).json({
                success: true,
                donor: {
                    registryId: link.id,
                    donorId: d.donorid,
                    userId: u.userid,
                    name: u.name,
                    email: u.email,
                    phoneNumber: u.phonenumber,
                    bloodGroup: formatBloodGroup(d.bloodgroup),
                    gender: d.gender,
                    city: d.city,
                    state: d.state,
                    pincode: d.pincode,
                    address: d.address,
                    accountStatus: u.isactive ? "ACTIVATED" : "PENDING_ACTIVATION",
                    isEligible: d.iseligible ?? true,
                    sourceIdentifier: link.sourceidentifier,
                    registryStatus: link.status,
                    registeredAt: link.createdat,
                    donations,
                },
            });
        } catch (error) {
            console.error("Error fetching donor detail:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch donor registry details",
            });
        }
    }
);

/*
 * UPDATE HISTORICAL DONATION RECORD VERIFICATION STATUS
 * PATCH /hospitals/me/donors/:donorId/history/:historyId
 */
router.patch(
    "/me/donors/:donorId/history/:historyId",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const hospital = await prisma.hospitals.findUnique({
                where: { userid: user.userid },
            });

            if (!hospital) {
                return res.status(403).json({
                    success: false,
                    message: "Only registered hospital accounts can verify donation records.",
                });
            }

            const donorId = (Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId) as string;
            const historyId = (Array.isArray(req.params.historyId) ? req.params.historyId[0] : req.params.historyId) as string;

            if (!UUID_REGEX.test(donorId) || !UUID_REGEX.test(historyId)) {
                return res.status(404).json({
                    success: false,
                    message: "Donation record not found.",
                });
            }

            const { status, remarks } = req.body;
            const validStatus = status?.toUpperCase() as verification_status;

            if (!validStatus || !Object.values(verification_status).includes(validStatus)) {
                return res.status(400).json({
                    success: false,
                    message: "Status must be one of: PENDING, VERIFIED, REJECTED.",
                });
            }

            // Ensure the record belongs to this hospital and donor
            const record = await prisma.donationhistory.findFirst({
                where: {
                    donationhistoryid: historyId,
                    donorid: donorId,
                    hospitalid: hospital.hospitalid,
                },
            });

            if (!record) {
                return res.status(404).json({
                    success: false,
                    message: "Donation record not found in your hospital records.",
                });
            }

            const updated = await prisma.donationhistory.update({
                where: { donationhistoryid: historyId },
                data: {
                    verificationstatus: validStatus,
                    remarks: remarks ? `${record.remarks || ""} [Verified: ${validStatus} - ${remarks}]` : record.remarks,
                },
            });

            return res.status(200).json({
                success: true,
                message: `Donation record verification status updated to ${validStatus}.`,
                record: updated,
            });
        } catch (error) {
            console.error("Error updating verification status:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update donation verification status",
            });
        }
    }
);

/*
 * DELETE HOSPITAL BY ID
 * DELETE /hospitals/:id
 * Restricted exclusively to ADMIN accounts.
 */
router.delete("/:id", authenticate, authorize("ADMIN"), async (req: Request, res: Response) => {
    try {
        const hospitalId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

        if (!hospitalId || !UUID_REGEX.test(hospitalId)) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found",
            });
        }

        const existing = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalId },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found",
            });
        }

        await prisma.hospitals.delete({
            where: {
                hospitalid: hospitalId,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Hospital deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting hospital:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete hospital",
        });
    }
});

export default router;