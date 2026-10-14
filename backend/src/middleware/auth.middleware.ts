import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../utils/jwt";

export const authenticate = (
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

        const decoded = jwt.verify(token, secret);

        (req as any).user = decoded;

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token",
        });
    }
};