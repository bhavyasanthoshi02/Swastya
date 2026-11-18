import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes";
import testRoutes from "./routes/test.routes";
import userRoutes from "./routes/user.routes";
import donorRoutes from "./routes/donor.routes";
import requesterRoutes from "./routes/requester.routes";
import hospitalRoutes from "./routes/hospital.routes";
import bloodbankRoutes from "./routes/bloodbank.routes";
import bloodrequestRoutes from "./routes/bloodrequest.routes";
import authRoutes from "./routes/auth.routes";
import notificationRoutes from "./routes/notification.routes";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Security headers (Helmet-equivalent baseline)
app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-XSS-Protection", "0");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    next();
});

// Lightweight in-memory sliding-window rate limiter for auth & upload endpoints
function createRateLimiter(windowMs: number, maxRequests: number, label: string) {
    const hits = new Map<string, { count: number; resetAt: number }>();
    return (req: Request, res: Response, next: NextFunction) => {
        if (process.env.DISABLE_RATE_LIMIT === "true") {
            return next();
        }
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        const key = `${label}:${ip}`;
        const now = Date.now();
        const entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            hits.set(key, { count: 1, resetAt: now + windowMs });
            res.setHeader("X-RateLimit-Limit", String(maxRequests));
            res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - 1)));
            return next();
        }
        if (entry.count >= maxRequests) {
            const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
            res.setHeader("Retry-After", String(retryAfterSec));
            res.setHeader("X-RateLimit-Limit", String(maxRequests));
            res.setHeader("X-RateLimit-Remaining", "0");
            return res.status(429).json({
                success: false,
                message: "Too many requests. Please try again later.",
            });
        }
        entry.count += 1;
        res.setHeader("X-RateLimit-Limit", String(maxRequests));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
        return next();
    };
}

const authRateLimiter = createRateLimiter(15 * 60 * 1000, 100, "auth");
const uploadRateLimiter = createRateLimiter(15 * 60 * 1000, 60, "upload");

// Allowed origins: default development Next.js app + optional FRONTEND_URL env
const configuredOrigin = process.env.FRONTEND_URL;
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    ...(configuredOrigin ? configuredOrigin.split(",").map((o) => o.trim()) : [])
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow server-to-server or tools with no origin (e.g. mobile/curl/Postman)
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("CORS policy violation: Origin not allowed"));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
        credentials: false,
    })
);

app.use(express.json({ limit: "2mb" }));

app.use("/health", healthRoutes);
if (process.env.NODE_ENV !== "production") {
    app.use("/test", testRoutes);
}
app.use("/users", userRoutes);
app.use("/donors", donorRoutes);
app.use("/requesters", requesterRoutes);
app.use("/hospitals/me/donors/import", uploadRateLimiter);
app.use("/hospitals", hospitalRoutes);
app.use("/bloodbanks", bloodbankRoutes);
app.use("/bloodrequests", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST") {
        return uploadRateLimiter(req, res, next);
    }
    return next();
}, bloodrequestRoutes);
app.use("/auth", authRateLimiter, authRoutes);
app.use("/notifications", notificationRoutes);

// Safe global error handler (prevents leaking stack traces or DB internals)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.message === "CORS policy violation: Origin not allowed") {
        return res.status(403).json({
            success: false,
            message: err.message,
        });
    }
    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({
            success: false,
            message: "Invalid JSON payload",
        });
    }
    console.error("Unhandled Application Error:", err?.message || err);
    return res.status(err?.status || 500).json({
        success: false,
        message: "Internal server error",
    });
});

export default app;