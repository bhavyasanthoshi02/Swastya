import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { blood_group, availability_status, notification_type } from "../generated/prisma/enums";

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
router.get("/", async (_req, res) => {
    try {
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
            },
        });

        res.status(200).json(bloodRequests);
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

        res.status(200).json({
            ...bloodRequest,
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
router.post("/", authenticate, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        let requesterId = req.body.requesterid;
        let hospitalId = req.body.hospitalid;

        // If authenticated user is a requester, resolve or provision their canonical requester record
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
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
            if (hospital) {
                hospitalId = hospital.hospitalid;
            }
        }

        // Validate payload fields
        if (!req.body.patientname || !String(req.body.patientname).trim()) {
            return res.status(400).json({ success: false, message: "Patient name is required" });
        }

        const age = typeof req.body.patientage === "number" ? req.body.patientage : parseInt(req.body.patientage, 10);
        if (isNaN(age) || age < 0 || age > 125) {
            return res.status(400).json({ success: false, message: "Valid patient age (0-125) is required" });
        }

        if (!["MALE", "FEMALE", "OTHER"].includes(req.body.patientgender)) {
            return res.status(400).json({ success: false, message: "Patient gender must be MALE, FEMALE, or OTHER" });
        }

        if (!req.body.patientcontact || !String(req.body.patientcontact).trim()) {
            return res.status(400).json({ success: false, message: "Patient contact number is required" });
        }

        const validBloodGroups = [
            "A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE",
            "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"
        ];
        if (!validBloodGroups.includes(req.body.bloodgroup)) {
            return res.status(400).json({ success: false, message: "Valid blood group is required" });
        }

        const validComponents = ["WHOLE_BLOOD", "PLATELETS", "PLASMA", "RBC"];
        if (!validComponents.includes(req.body.bloodcomponent)) {
            return res.status(400).json({ success: false, message: "Valid blood component is required" });
        }

        const units = typeof req.body.unitsrequired === "number" ? req.body.unitsrequired : parseInt(req.body.unitsrequired, 10);
        if (isNaN(units) || units < 1 || units > 100) {
            return res.status(400).json({ success: false, message: "Units required must be between 1 and 100" });
        }

        const validUrgency = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        if (!validUrgency.includes(req.body.urgencylevel)) {
            return res.status(400).json({ success: false, message: "Valid urgency level is required" });
        }

        if (!req.body.requiredby) {
            return res.status(400).json({ success: false, message: "Required-by date and time is required" });
        }

        const requiredDate = new Date(req.body.requiredby);
        if (isNaN(requiredDate.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid required-by date format" });
        }

        if (requiredDate.getTime() < Date.now() - 5 * 60 * 1000) {
            return res.status(400).json({ success: false, message: "Required-by date and time cannot be in the past" });
        }

        // Validate hospitalId if provided to prevent foreign key errors
        if (hospitalId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(hospitalId)) {
                hospitalId = null;
            } else {
                const hospitalExists = await prisma.hospitals.findUnique({
                    where: { hospitalid: hospitalId },
                });
                if (!hospitalExists) {
                    hospitalId = null;
                }
            }
        }

        // Atomic transaction: Create blood request and initial status history together
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

                    isemergency: req.body.isemergency !== undefined ? Boolean(req.body.isemergency) : false,
                    searchradius: req.body.searchradius ? parseInt(req.body.searchradius, 10) : 5,

                    requiredby: requiredDate,

                    notes: req.body.notes || null,
                },
            });

            await tx.requeststatushistory.create({
                data: {
                    requestid: created.requestid,
                    oldstatus: null,
                    newstatus: "CREATED",
                    changedbyuserid: user.userid,
                    remarks: "Blood requisition initiated by requester",
                },
            });

            return created;
        });

        res.status(201).json(bloodRequest);
    } catch (error) {
        console.error("Error creating blood request:", error);

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
        const isRequesterRole = user.role === "REQUESTER" || (user.role as any) === "PATIENT";
        if (isRequesterRole) {
            // Cannot modify or cancel already terminal requests
            if (["FULFILLED", "CANCELLED", "EXPIRED"].includes(existing.status || "")) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot modify or cancel a requisition that is already ${String(existing.status).toLowerCase()}`,
                });
            }

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

        // Atomic transaction: Update blood request and record status transition history together
        const bloodRequest = await prisma.$transaction(async (tx) => {
            const updated = await tx.bloodrequests.update({
                where: {
                    requestid: targetId,
                },
                data: {
                    patientname: req.body.patientname !== undefined ? req.body.patientname : existing.patientname,
                    patientage: req.body.patientage !== undefined ? parseInt(req.body.patientage, 10) : existing.patientage,
                    patientgender: req.body.patientgender !== undefined ? req.body.patientgender : existing.patientgender,
                    patientcontact: req.body.patientcontact !== undefined ? req.body.patientcontact : existing.patientcontact,

                    bloodgroup: req.body.bloodgroup !== undefined ? req.body.bloodgroup : existing.bloodgroup,
                    bloodcomponent: req.body.bloodcomponent !== undefined ? req.body.bloodcomponent : existing.bloodcomponent,

                    unitsrequired: req.body.unitsrequired !== undefined ? parseInt(req.body.unitsrequired, 10) : existing.unitsrequired,
                    urgencylevel: req.body.urgencylevel !== undefined ? req.body.urgencylevel : existing.urgencylevel,

                    isemergency: req.body.isemergency !== undefined ? Boolean(req.body.isemergency) : existing.isemergency,
                    searchradius: req.body.searchradius !== undefined ? parseInt(req.body.searchradius, 10) : existing.searchradius,

                    requiredby: req.body.requiredby !== undefined ? new Date(req.body.requiredby) : existing.requiredby,

                    status: req.body.status !== undefined ? req.body.status : existing.status,

                    notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
                },
            });

            // Record status change in requeststatushistory
            if (req.body.status !== undefined && req.body.status !== existing.status) {
                await tx.requeststatushistory.create({
                    data: {
                        requestid: targetId,
                        oldstatus: existing.status,
                        newstatus: req.body.status,
                        changedbyuserid: user.userid,
                        remarks: req.body.remarks ? String(req.body.remarks).trim() : `Status transitioned to ${req.body.status}`,
                    },
                });
            }

            return updated;
        });

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

        // Medically verified ABO blood group compatibility check
        const compatibleRecipientGroups = DONOR_COMPATIBILITY_MAP[donor.bloodgroup] || [donor.bloodgroup];
        if (!compatibleRecipientGroups.includes(request.bloodgroup as blood_group)) {
            return res.status(400).json({
                success: false,
                message: `Your blood group (${donor.bloodgroup}) is not compatible with requested group (${request.bloodgroup}).`,
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

        const isDonor = user.role === "DONOR";
        const isRequester = user.role === "REQUESTER" || user.role === "PATIENT" || request.createdbyuserid === user.userid;
        const isAdmin = user.role === "ADMIN";

        if (!isDonor && !isRequester && !isAdmin) {
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

        // Notify the requester about the status update
        const statusDescriptions: Record<string, string> = {
            STARTED: `Donor ${meta.donorName || "Volunteer"} has started their journey to ${request.hospitals?.hospitalname || "the hospital"}.`,
            REACHED_LOCATION: `Donor ${meta.donorName || "Volunteer"} has reached ${request.hospitals?.hospitalname || "the hospital"} transfusion desk!`,
            COMPLETED: `Blood donation for patient ${request.patientname} by donor ${meta.donorName || "Volunteer"} has been completed.`,
        };

        if (statusDescriptions[status] && isDonor) {
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

        // If completed, update blood request status
        if (status === "COMPLETED") {
            await prisma.bloodrequests.update({
                where: { requestid: request.requestid },
                data: { status: "BLOOD_ARRANGED" },
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