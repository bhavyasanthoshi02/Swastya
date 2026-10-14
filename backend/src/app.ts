import express from "express";
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
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: false,
    })
);

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/test", testRoutes);
app.use("/users", userRoutes);
app.use("/donors", donorRoutes);
app.use("/requesters", requesterRoutes);
app.use("/hospitals", hospitalRoutes);
app.use("/bloodbanks", bloodbankRoutes);
app.use("/bloodrequests", bloodrequestRoutes);
app.use("/auth", authRoutes);
app.use("/notifications", notificationRoutes);

export default app;