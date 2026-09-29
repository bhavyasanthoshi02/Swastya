import { Router } from "express";
import { prisma } from "../config/prisma";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { checkHospitalOwnership } from "../middleware/ownership.middleware";

const router = Router();
router.get("/", async (_req, res) => {
    try {
        const hospitals = await prisma.hospitals.findMany({
            include: {
                users: true,
            },
        });

        res.status(200).json(hospitals);
    } catch (error) {
        console.error("Error fetching hospitals:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch hospitals",
        });
    }
});
router.get(
    "/:hospitalId/dashboard",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    checkHospitalOwnership,
    async (req, res) => {
        try {
            const hospitalId = req.params.hospitalId as string;

            const totalRequests = await prisma.bloodrequests.count({
                where: {
                    hospitalid: hospitalId,
                },
            });

            const emergencyRequests = await prisma.bloodrequests.count({
                where: {
                    hospitalid: hospitalId,
                    isemergency: true,
                },
            });

            const fulfilledRequests = await prisma.bloodrequests.count({
                where: {
                    hospitalid: hospitalId,
                    status: "FULFILLED" as any,
                },
            });

            const recentRequests = await prisma.bloodrequests.findMany({
                where: {
                    hospitalid: hospitalId,
                },
                orderBy: {
                    createdat: "desc",
                },
                take: 5,
            });

            res.status(200).json({
                totalRequests,
                emergencyRequests,
                fulfilledRequests,
                recentRequests,
            });
        } catch (error) {
            console.error("Error loading dashboard:", error);

            res.status(500).json({
                success: false,
                message: "Failed to load dashboard",
            });
        }
    }
);
router.get(
    "/:hospitalId/bloodrequests",
    authenticate,
    authorize("HOSPITAL", "ADMIN"),
    checkHospitalOwnership,
    async (req, res) => {
        try {
            const hospitalId = req.params.hospitalId as string;

            const bloodRequests = await prisma.bloodrequests.findMany({
                where: {
                    hospitalid: hospitalId,
                },
                orderBy: {
                    createdat: "desc",
                },
            });

            res.status(200).json(bloodRequests);
        } catch (error) {
            console.error("Error fetching hospital blood requests:", error);

            res.status(500).json({
                success: false,
                message: "Failed to fetch blood requests",
            });
        }
    });
router.get("/:id", async (req, res) => {
    try {
        const hospital = await prisma.hospitals.findUnique({
            where: {
                hospitalid: req.params.id,
            },
            include: {
                users: true,
            },
        });

        if (!hospital) {
            res.status(404).json({
                success: false,
                message: "Hospital not found",
            });
            return;
        }

        res.status(200).json(hospital);
    } catch (error) {
        console.error("Error fetching hospital:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch hospital",
        });
    }
});
router.post("/", async (req, res) => {
    try {
        const hospital = await prisma.hospitals.create({
            data: {
                userid: req.body.userid,
                hospitalname: req.body.hospitalname,
                registrationnumber: req.body.registrationnumber,
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

        res.status(201).json(hospital);
    } catch (error) {
        console.error("Error creating hospital:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create hospital",
        });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const hospital = await prisma.hospitals.update({
            where: {
                hospitalid: req.params.id,
            },
            data: {
                hospitalname: req.body.hospitalname,
                registrationnumber: req.body.registrationnumber,
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

        res.status(200).json(hospital);
    } catch (error) {
        console.error("Error updating hospital:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update hospital",
        });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        await prisma.hospitals.delete({
            where: {
                hospitalid: req.params.id,
            },
        });

        res.status(200).json({
            success: true,
            message: "Hospital deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting hospital:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete hospital",
        });
    }
});
export default router;