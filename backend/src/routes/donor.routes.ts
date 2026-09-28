import { Router } from "express";
import { prisma } from "../config/prisma";

const router = Router();

router.get("/", async (_req, res) => {
    try {
        const donors = await prisma.donors.findMany({
            include: {
                users: true,
            },
        });

        res.status(200).json(donors);
    } catch (error) {
        console.error("Error fetching donors:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch donors",
        });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const donor = await prisma.donors.findUnique({
            where: {
                donorid: req.params.id,
            },
            include: {
                users: true,
            },
        });

        if (!donor) {
            res.status(404).json({
                success: false,
                message: "Donor not found",
            });
            return;
        }

        res.status(200).json(donor);
    } catch (error) {
        console.error("Error fetching donor:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch donor",
        });
    }
});
router.post("/", async (req, res) => {
    try {
        const donor = await prisma.donors.create({
            data: {
                userid: req.body.userid,
                bloodgroup: req.body.bloodgroup,
                dateofbirth: new Date(req.body.dateofbirth),
                gender: req.body.gender,
                weight: req.body.weight,
                city: req.body.city,
                state: req.body.state,
                pincode: req.body.pincode,
            },
        });

        res.status(201).json(donor);
    } catch (error) {
        console.error("Error creating donor:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create donor",
        });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const donor = await prisma.donors.update({
            where: {
                donorid: req.params.id,
            },
            data: {
                bloodgroup: req.body.bloodgroup,
                weight: req.body.weight,
                city: req.body.city,
                state: req.body.state,
                pincode: req.body.pincode,
                availabilitystatus: req.body.availabilitystatus,
            },
        });

        res.status(200).json(donor);
    } catch (error) {
        console.error("Error updating donor:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update donor",
        });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        await prisma.donors.delete({
            where: {
                donorid: req.params.id,
            },
        });

        res.status(200).json({
            success: true,
            message: "Donor deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting donor:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete donor",
        });
    }
});
export default router;