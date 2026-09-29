import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";

export const checkHospitalOwnership = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;

        // Admin can access everything
        if (user.role === "ADMIN") {
            return next();
        }

        const hospital = await prisma.hospitals.findUnique({
            where: {
                hospitalid: req.params.hospitalId as string,
            },
        });

        if (!hospital) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found",
            });
        }

        if (hospital.userid !== user.userid) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        next();
    } catch (error) {
        console.error("Ownership Check Error:", error);

        res.status(500).json({
            success: false,
            message: "Ownership check failed",
        });
    }
};
export const checkDonorOwnership = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;

        if (user.role === "ADMIN") {
            return next();
        }

        const donor = await prisma.donors.findUnique({
            where: {
                donorid: req.params.donorId as string,
            },
        });

        if (!donor) {
            return res.status(404).json({
                success: false,
                message: "Donor not found",
            });
        }

        if (donor.userid !== user.userid) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        next();
    } catch (error) {
        console.error("Donor Ownership Error:", error);

        res.status(500).json({
            success: false,
            message: "Ownership check failed",
        });
    }
};
export const checkRequesterOwnership = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;

        if (user.role === "ADMIN") {
            return next();
        }

        const requester = await prisma.requesters.findUnique({
            where: {
                requesterid: req.params.requesterId as string,
            },
        });

        if (!requester) {
            return res.status(404).json({
                success: false,
                message: "Requester not found",
            });
        }

        if (requester.userid !== user.userid) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        next();
    } catch (error) {
        console.error("Requester ownership error:", error);

        res.status(500).json({
            success: false,
            message: "Ownership check failed",
        });
    }
};
export const checkBloodBankOwnership = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;

        // Admin can access everything
        if (user.role === "ADMIN") {
            return next();
        }

        const bloodBank = await prisma.bloodbanks.findUnique({
            where: {
                bloodbankid: req.params.bloodBankId as string,
            },
        });

        if (!bloodBank) {
            return res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
        }

        if (bloodBank.userid !== user.userid) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        next();
    } catch (error) {
        console.error("Blood Bank Ownership Error:", error);

        return res.status(500).json({
            success: false,
            message: "Ownership check failed",
        });
    }
};