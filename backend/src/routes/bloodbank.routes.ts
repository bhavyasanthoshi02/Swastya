import { Router } from "express";
import { prisma } from "../config/prisma";

const router = Router();
router.get("/", async (_req, res) => {
    try {
        const bloodbanks = await prisma.bloodbanks.findMany({
            include: {
                users: true,
            },
        });

        res.status(200).json(bloodbanks);
    } catch (error) {
        console.error("Error fetching blood banks:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch blood banks",
        });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const bloodbank = await prisma.bloodbanks.findUnique({
            where: {
                bloodbankid: req.params.id,
            },
            include: {
                users: true,
            },
        });

        if (!bloodbank) {
            res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
            return;
        }

        res.status(200).json(bloodbank);
    } catch (error) {
        console.error("Error fetching blood bank:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch blood bank",
        });
    }
});
router.post("/", async (req, res) => {
    try {
        const bloodbank = await prisma.bloodbanks.create({
            data: {
                userid: req.body.userid,
                bloodbankname: req.body.bloodbankname,
                licensenumber: req.body.licensenumber,
                contactpersonname: req.body.contactpersonname,
                contactpersonphone: req.body.contactpersonphone,
                address: req.body.address,
                city: req.body.city,
                state: req.body.state,
                pincode: req.body.pincode,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
            },
        });

        res.status(201).json(bloodbank);
    } catch (error) {
        console.error("Error creating blood bank:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create blood bank",
        });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const bloodbank = await prisma.bloodbanks.update({
            where: {
                bloodbankid: req.params.id,
            },
            data: {
                bloodbankname: req.body.bloodbankname,
                licensenumber: req.body.licensenumber,
                contactpersonname: req.body.contactpersonname,
                contactpersonphone: req.body.contactpersonphone,
                address: req.body.address,
                city: req.body.city,
                state: req.body.state,
                pincode: req.body.pincode,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
                approvalstatus: req.body.approvalstatus,
            },
        });

        res.status(200).json(bloodbank);
    } catch (error) {
        console.error("Error updating blood bank:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update blood bank",
        });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        await prisma.bloodbanks.delete({
            where: {
                bloodbankid: req.params.id,
            },
        });

        res.status(200).json({
            success: true,
            message: "Blood bank deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting blood bank:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete blood bank",
        });
    }
});
export default router;