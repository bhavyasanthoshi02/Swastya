import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../utils/jwt";
import { prisma } from "../config/prisma";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Token missing",
            });
        }

        const token = authHeader.split(" ")[1];

        if (!token || token.trim() === "") {
            return res.status(401).json({
                success: false,
                message: "Token missing",
            });
        }

        let secret: string;
        try {
            secret = getJwtSecret();
        } catch (configError) {
            console.error("JWT Configuration Error:", (configError as Error).message);
            return res.status(500).json({
                success: false,
                message: "Authentication server configuration error",
            });
        }

        const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as {
            userid?: string;
            role?: string;
        };

        if (!decoded?.userid || !UUID_REGEX.test(decoded.userid)) {
            return res.status(401).json({
                success: false,
                message: "Invalid token",
            });
        }

        const dbUser = await prisma.users.findUnique({
            where: { userid: decoded.userid },
            select: { userid: true, role: true, isactive: true },
        });

        if (!dbUser) {
            return res.status(401).json({
                success: false,
                message: "Invalid token: account no longer exists",
            });
        }

        if (!dbUser.isactive) {
            return res.status(403).json({
                success: false,
                message: "Account is deactivated or pending activation",
            });
        }

        (req as any).user = {
            userid: dbUser.userid,
            role: dbUser.role,
        };

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token",
        });
    }
};