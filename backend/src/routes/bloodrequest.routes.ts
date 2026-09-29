import { Router } from "express";
import { prisma } from "../config/prisma";

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
export default router;