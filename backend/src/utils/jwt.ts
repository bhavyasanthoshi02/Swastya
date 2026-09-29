import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "swastya-secret";

export const generateToken = (userid: string, role: string) => {
    return jwt.sign(
        {
            userid,
            role,
        },
        JWT_SECRET,
        {
            expiresIn: "7d",
        }
    );
};