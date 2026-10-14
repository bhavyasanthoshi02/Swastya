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
router.post("/", async (req, res) => {
    try {
        const bloodRequest = await prisma.bloodrequests.create({
            data: {
                createdbyuserid: req.body.createdbyuserid,
                requesterid: req.body.requesterid,
                hospitalid: req.body.hospitalid,

                patientname: req.body.patientname,
                patientage: req.body.patientage,
                patientgender: req.body.patientgender,

                patientcontact: req.body.patientcontact,

                bloodgroup: req.body.bloodgroup,
                bloodcomponent: req.body.bloodcomponent,

                unitsrequired: req.body.unitsrequired,

                urgencylevel: req.body.urgencylevel,

                isemergency: req.body.isemergency,
                searchradius: req.body.searchradius,

                requiredby: req.body.requiredby,

                notes: req.body.notes,
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
router.put("/:id", async (req, res) => {
    try {
        const bloodRequest = await prisma.bloodrequests.update({
            where: {
                requestid: req.params.id,
            },
            data: {
                patientname: req.body.patientname,
                patientage: req.body.patientage,
                patientgender: req.body.patientgender,
                patientcontact: req.body.patientcontact,

                bloodgroup: req.body.bloodgroup,
                bloodcomponent: req.body.bloodcomponent,

                unitsrequired: req.body.unitsrequired,
                urgencylevel: req.body.urgencylevel,

                isemergency: req.body.isemergency,
                searchradius: req.body.searchradius,

                requiredby: req.body.requiredby,

                status: req.body.status,

                notes: req.body.notes,
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
router.delete("/:id", async (req, res) => {
    try {
        await prisma.bloodrequests.delete({
            where: {
                requestid: req.params.id,
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