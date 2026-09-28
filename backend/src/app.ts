import express from "express";
import healthRoutes from "./routes/health.routes";
import testRoutes from "./routes/test.routes";
import userRoutes from "./routes/user.routes";
import donorRoutes from "./routes/donor.routes";
import requesterRoutes from "./routes/requester.routes";
import hospitalRoutes from "./routes/hospital.routes";
const app = express();

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/test", testRoutes);
app.use("/users", userRoutes);
app.use("/donors", donorRoutes);
app.use("/requesters", requesterRoutes);
app.use("/hospitals", hospitalRoutes);
export default app;