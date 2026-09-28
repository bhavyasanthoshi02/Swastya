import express from "express";
import healthRoutes from "./routes/health.routes";
import testRoutes from "./routes/test.routes";
import userRoutes from "./routes/user.routes";
const app = express();

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/test", testRoutes);
app.use("/users", userRoutes);
export default app;