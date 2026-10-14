import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { notification_type } from "../generated/prisma/enums";

const router = Router();
router.get("/", async (_req, res) => {
    try {
        const bloodRequests = await prisma.bloodrequests.findMany({
            include: {
                users: true,
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
router.get("/:id", async (req, res) => {
    try {
        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: {
                requestid: req.params.id,
            },
            include: {
                users: true,
                requesters: true,
                hospitals: true,
            },
        });

        if (!bloodRequest) {
            res.status(404).json({
                success: false,
                message: "Blood request not found",
            });
            return;
        }

        res.status(200).json(bloodRequest);
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

        // If authenticated user is a requester, resolve their canonical requester record
        if (user.role === "REQUESTER" || user.role === "PATIENT") {
            const requester = await prisma.requesters.findUnique({
                where: { userid: user.userid },
            });
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

        const bloodRequest = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: user.userid,
                requesterid: requesterId || null,
                hospitalid: hospitalId || null,

                patientname: req.body.patientname,
                patientage: typeof req.body.patientage === "number" ? req.body.patientage : parseInt(req.body.patientage, 10),
                patientgender: req.body.patientgender,

                patientcontact: req.body.patientcontact,

                bloodgroup: req.body.bloodgroup,
                bloodcomponent: req.body.bloodcomponent,

                unitsrequired: typeof req.body.unitsrequired === "number" ? req.body.unitsrequired : parseInt(req.body.unitsrequired, 10),

                urgencylevel: req.body.urgencylevel,

                isemergency: req.body.isemergency !== undefined ? Boolean(req.body.isemergency) : false,
                searchradius: req.body.searchradius ? parseInt(req.body.searchradius, 10) : 5,

                requiredby: new Date(req.body.requiredby),

                notes: req.body.notes || null,
            },
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

        const bloodRequest = await prisma.bloodrequests.update({
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

        // Get donor profile for the volunteer if applicable
        const donor = await prisma.donors.findUnique({
            where: { userid: user.userid },
            include: {
                users: {
                    select: {
                        name: true,
                        phonenumber: true,
                    },
                },
            },
        });

        const donorName = donor?.users?.name || "A voluntary donor";
        const donorBloodGroup = donor?.bloodgroup || "compatible";

        // Create notification for the creator of the request
        await prisma.notification.create({
            data: {
                userid: request.createdbyuserid,
                requestid: request.requestid,
                type: notification_type.MATCH,
                title: "Donor Volunteered for Blood Request",
                message: `${donorName} (${donorBloodGroup}) has volunteered to donate for patient ${request.patientname}.`,
                isread: false,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Donation response recorded successfully. The medical coordination team has been notified.",
            requestId: request.requestid,
            patientName: request.patientname,
        });
    } catch (error) {
        console.error("Error responding to blood request:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to record response to blood request",
        });
    }
});

export default router;