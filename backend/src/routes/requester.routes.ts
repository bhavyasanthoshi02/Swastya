import { Router } from "express";
import { prisma } from "../config/prisma";

const router = Router();
router.get("/", async (_req, res) => {
    try {
        const requesters = await prisma.requesters.findMany({
            include: {
                users: true,
            },
        });

        res.status(200).json(requesters);
    } catch (error) {
        console.error("Error fetching requesters:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch requesters",
        });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const requester = await prisma.requesters.findUnique({
            where: {
                requesterid: req.params.id,
            },
            include: {
                users: true,
            },
        });

        if (!requester) {
            res.status(404).json({
                success: false,
                message: "Requester not found",
            });
            return;
        }

        res.status(200).json(requester);
    } catch (error) {
        console.error("Error fetching requester:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch requester",
        });
    }
});
router.post("/", async (req, res) => {
    try {
        const requester = await prisma.requesters.create({
            data: {
                userid: req.body.userid,
                address: req.body.address,
                city: req.body.city,
                state: req.body.state,
                pincode: req.body.pincode,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
            },
        });

        res.status(201).json(requester);
    } catch (error) {
        console.error("Error creating requester:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create requester",
        });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const requester = await prisma.requesters.update({
            where: {
                requesterid: req.params.id,
            },
            data: {
                address: req.body.address,
                city: req.body.city,
                state: req.body.state,
                pincode: req.body.pincode,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
            },
        });

        res.status(200).json(requester);
    } catch (error) {
        console.error("Error updating requester:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update requester",
        });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        await prisma.requesters.delete({
            where: {
                requesterid: req.params.id,
            },
        });

        res.status(200).json({
            success: true,
            message: "Requester deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting requester:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete requester",
        });
    }
});
export default router;