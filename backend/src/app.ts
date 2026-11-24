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
import surgeryPlannerRoutes from "./routes/surgeryPlanner.routes";
import campRoutes from "./routes/camp.routes";
import campPublicRoutes from "./routes/campPublic.routes";
import equipmentRoutes from "./routes/equipment.routes";
import actionRedirectRoutes from "./routes/actionRedirect.routes";
import customSmsRoutes from "./routes/customSms.routes";
import bloodShortagePredictorRoutes from "./routes/bloodShortagePredictor.routes";
import smartCampPlannerRoutes from "./routes/smartCampPlanner.routes";
import emergencyDonorMatchingRoutes from "./routes/emergencyDonorMatching.routes";
import hospitalCommunicationRoutes from "./routes/hospitalCommunication.routes";
import bloodbankCommunicationRoutes from "./routes/bloodbankCommunication.routes";

const app = express();
app.disable("x-powered-by");

// F1 — Configure Express proxy trust only for explicitly configured trusted proxies
const configuredTrustProxy = process.env.TRUST_PROXY;
if (configuredTrustProxy !== undefined && configuredTrustProxy.trim() !== "") {
    const trimmed = configuredTrustProxy.trim();
    if (trimmed.toLowerCase() === "true") {
        app.set("trust proxy", true);
    } else if (trimmed.toLowerCase() === "false") {
        app.set("trust proxy", false);
    } else if (!isNaN(Number(trimmed))) {
        app.set("trust proxy", Number(trimmed));
    } else {
        app.set("trust proxy", trimmed);
    }
} else {
    // Unconditional trust proxy disabled: do not blindly trust client-supplied forwarded headers
    app.set("trust proxy", false);
}

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

// F2 — Bounded in-memory sliding-window rate limiter with automatic expired entry pruning
export interface RateLimiterOptions {
    windowMs: number;
    maxRequests: number;
    label: string;
    maxEntries?: number;
}

export function createRateLimiter(
    windowMsOrOptions: number | RateLimiterOptions,
    maxRequestsParam?: number,
    labelParam?: string
) {
    const options: RateLimiterOptions =
        typeof windowMsOrOptions === "number"
            ? {
                  windowMs: windowMsOrOptions,
                  maxRequests: maxRequestsParam || 100,
                  label: labelParam || "default",
                  maxEntries: 10000,
              }
            : { maxEntries: 10000, ...windowMsOrOptions };

    const { windowMs, maxRequests, label, maxEntries = 10000 } = options;
    const hits = new Map<string, { count: number; resetAt: number }>();

    // Bounded cleanup helper: purge expired entries
    const pruneExpired = (now: number) => {
        for (const [k, v] of hits.entries()) {
            if (v.resetAt <= now) {
                hits.delete(k);
            }
        }
    };

    // Periodic sweep that does not block Node process exit
    const sweepTimer = setInterval(() => {
        pruneExpired(Date.now());
    }, Math.min(windowMs, 60000));
    if (sweepTimer.unref) {
        sweepTimer.unref();
    }

    const limiter = (req: Request, res: Response, next: NextFunction) => {
        if (process.env.DISABLE_RATE_LIMIT === "true") {
            return next();
        }

        const ip = req.ip || req.socket?.remoteAddress || "unknown";
        const key = `${label}:${ip}`;
        const now = Date.now();

        // Enforce maximum capacity bounds to prevent memory exhaustion
        if (!hits.has(key) && hits.size >= maxEntries) {
            pruneExpired(now);
            // If still full after pruning expired, evict oldest entry (FIFO)
            if (hits.size >= maxEntries) {
                const oldestKey = hits.keys().next().value;
                if (oldestKey) {
                    hits.delete(oldestKey);
                }
            }
        }

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

    (limiter as any).hits = hits;
    (limiter as any).pruneExpired = pruneExpired;
    (limiter as any).destroy = () => clearInterval(sweepTimer);

    return limiter;
}

const authRateLimiter = createRateLimiter(15 * 60 * 1000, 100, "auth");
const uploadRateLimiter = createRateLimiter(15 * 60 * 1000, 60, "upload");

// F3 — Production CORS: exclude localhost in production, allow explicitly configured frontend origins only
export function getAllowedOrigins(): string[] {
    const isProduction = process.env.NODE_ENV === "production";
    const configuredOrigin = process.env.FRONTEND_URL || process.env.ALLOWED_ORIGINS;
    const prodOrigins = configuredOrigin
        ? configuredOrigin.split(",").map((o) => o.trim()).filter(Boolean)
        : [];

    if (isProduction) {
        return prodOrigins;
    }

    return [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        ...prodOrigins,
    ];
}

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow server-to-server or tools with no origin (e.g. mobile/curl/Postman)
            if (!origin) {
                return callback(null, true);
            }
            const allowed = getAllowedOrigins();
            if (allowed.includes(origin)) {
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
app.use("/hospitals/me/surgeries", surgeryPlannerRoutes);
app.use("/hospitals/me/emergency-matching", emergencyDonorMatchingRoutes);
app.use("/api/hospital/emergency-matching", emergencyDonorMatchingRoutes);
app.use("/donors/me/emergency-requests", emergencyDonorMatchingRoutes);
app.use("/api/donor/emergency-matching", emergencyDonorMatchingRoutes);
app.use("/hospitals/me/messages", hospitalCommunicationRoutes);
app.use("/hospitals", hospitalRoutes);
app.use("/bloodbanks/me/camps", campRoutes);
app.use("/bloodbanks/me/camp-planner", smartCampPlannerRoutes);
app.use("/bloodbanks/:bloodBankId/camp-planner", smartCampPlannerRoutes);
app.use("/api/blood-bank/camp-planner", smartCampPlannerRoutes);
app.use("/bloodbanks/me/predictions", bloodShortagePredictorRoutes);
app.use("/bloodbanks/:bloodBankId/predictions", bloodShortagePredictorRoutes);
app.use("/api/blood-bank/predictions", bloodShortagePredictorRoutes);
app.use("/bloodbanks/me/messages", bloodbankCommunicationRoutes);
app.use("/bloodbanks", bloodbankRoutes);
app.use("/camps", campPublicRoutes);
app.use("/equipment", equipmentRoutes);
app.use("/bloodbanks/equipment", equipmentRoutes);
app.use("/bloodrequests", (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "POST") {
        return uploadRateLimiter(req, res, next);
    }
    return next();
}, bloodrequestRoutes);
app.use("/auth", authRateLimiter, authRoutes);
app.use("/notifications", notificationRoutes);
app.use("/action-redirect", actionRedirectRoutes);
app.use("/r", actionRedirectRoutes);
app.use("/custom-sms", customSmsRoutes);

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