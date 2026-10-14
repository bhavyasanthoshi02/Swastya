import jwt from "jsonwebtoken";

export const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim() === "") {
        throw new Error("Configuration error: JWT_SECRET environment variable is missing.");
    }
    return secret;
};

export const generateToken = (userid: string, role: string): string => {
    const secret = getJwtSecret();
    return jwt.sign(
        {
            userid,
            role,
        },
        secret,
        {
            expiresIn: "7d",
        }
    );
};