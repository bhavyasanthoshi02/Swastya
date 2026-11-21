import jwt from "jsonwebtoken";

export const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim() === "") {
        throw new Error("Configuration error: JWT_SECRET environment variable is missing.");
    }
    return secret;
};

export const DEFAULT_JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

export const generateToken = (userid: string, role: string, expiresIn?: string | number): string => {
    const secret = getJwtSecret();
    const tokenLifetime = expiresIn !== undefined ? expiresIn : (process.env.JWT_EXPIRES_IN || "24h");
    return jwt.sign(
        {
            userid,
            role,
        },
        secret,
        {
            expiresIn: tokenLifetime as any,
        }
    );
};
