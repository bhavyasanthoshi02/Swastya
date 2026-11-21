import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";

export const checkHospitalOwnership = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const hospitalId = (req.params.hospitalId || req.params.id) as string;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!hospitalId || !uuidRegex.test(hospitalId)) {
            return res.status(404).json({
                success: false,
                message: "Hospital not found",
            });
        }

        // Admin can access everything
        if (user.role === "ADMIN") {
            return next();
        }

        const hospital = await prisma.hospitals.findUnique({
            where: {
                hospitalid: hospitalId,
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
        if (!user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        if (user.role === "ADMIN") {
            return next();
        }

        const donorId = (req.params.donorId || req.params.id) as string;
        if (!donorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(donorId)) {
            return res.status(404).json({
                success: false,
                message: "Donor not found",
            });
        }

        const donor = await prisma.donors.findUnique({
            where: {
                donorid: donorId,
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
        if (!user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        if (user.role === "ADMIN") {
            return next();
        }

        const requesterId = (req.params.requesterId || req.params.id) as string;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!requesterId || !uuidRegex.test(requesterId)) {
            return res.status(404).json({
                success: false,
                message: "Requester not found",
            });
        }

        const requester = await prisma.requesters.findUnique({
            where: {
                requesterid: requesterId,
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
        if (!user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        const bloodBankId = (req.params.bloodBankId || req.params.id) as string;

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!bloodBankId || !uuidRegex.test(bloodBankId)) {
            return res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
        }

        const bloodBank = await prisma.bloodbanks.findUnique({
            where: {
                bloodbankid: bloodBankId,
            },
        });

        if (!bloodBank) {
            return res.status(404).json({
                success: false,
                message: "Blood bank not found",
            });
        }

        // Admin can access everything
        if (user.role === "ADMIN") {
            (req as any).bloodBank = bloodBank;
            return next();
        }

        if (bloodBank.userid !== user.userid) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        (req as any).bloodBank = bloodBank;
        next();
    } catch (error) {
        console.error("Blood Bank Ownership Error:", error);

        return res.status(500).json({
            success: false,
            message: "Ownership check failed",
        });
    }
};

export const requireApprovedHospital = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        if (user.role === "ADMIN" || user.role !== "HOSPITAL") {
            return next();
        }

        const hospital = await prisma.hospitals.findUnique({
            where: { userid: user.userid },
            select: { hospitalid: true, approvalstatus: true },
        });

        if (!hospital) {
            return res.status(403).json({
                success: false,
                message: "Registered hospital profile required for clinical operations",
            });
        }

        if (hospital.approvalstatus !== "APPROVED") {
            return res.status(403).json({
                success: false,
                message: `Hospital facility is ${hospital.approvalstatus}. Only APPROVED facilities may perform clinical operations.`,
                approvalstatus: hospital.approvalstatus,
            });
        }

        (req as any).hospital = hospital;
        return next();
    } catch (error) {
        console.error("Hospital Approval Check Error:", error);
        return res.status(500).json({
            success: false,
            message: "Hospital approval check failed",
        });
    }
};

export const requireApprovedBloodBank = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        if (user.role !== "BLOOD_BANK" && user.role !== "ADMIN") {
            return next();
        }

        const targetBloodBankId = (req.params?.bloodBankId || req.params?.id) as string | undefined;
        let bloodBank = (req as any).bloodBank;
        if (
            !bloodBank &&
            targetBloodBankId &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetBloodBankId)
        ) {
            bloodBank = await prisma.bloodbanks.findUnique({
                where: { bloodbankid: targetBloodBankId },
                select: { bloodbankid: true, approvalstatus: true, userid: true },
            });
        }
        if (!bloodBank && user.role === "BLOOD_BANK") {
            bloodBank = await prisma.bloodbanks.findUnique({
                where: { userid: user.userid },
                select: { bloodbankid: true, approvalstatus: true, userid: true },
            });
        }

        if (!bloodBank) {
            if (user.role === "ADMIN") {
                return next();
            }
            return res.status(403).json({
                success: false,
                message: "Registered blood bank profile required for clinical operations",
            });
        }

        if (bloodBank.approvalstatus !== "APPROVED") {
            return res.status(403).json({
                success: false,
                message: `Blood bank facility is ${bloodBank.approvalstatus}. Only APPROVED facilities may perform clinical operations.`,
                approvalstatus: bloodBank.approvalstatus,
            });
        }

        return next();
    } catch (error) {
        console.error("Blood Bank Approval Check Error:", error);
        return res.status(500).json({
            success: false,
            message: "Blood bank approval check failed",
        });
    }
};