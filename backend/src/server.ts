import app from "./app";
import { startEmergencySchedulerWorker, stopEmergencySchedulerWorker } from "./services/scheduler.service";
import { startCampReminderWorker, stopCampReminderWorker } from "./services/campNotification.service";

const PORT = 5000;

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start durable emergency scheduler background worker
    startEmergencySchedulerWorker();
    // Start durable camp reminder background worker
    startCampReminderWorker();
});

const gracefulShutdown = () => {
    console.log("Shutting down server and emergency scheduler worker...");
    stopEmergencySchedulerWorker();
    stopCampReminderWorker();
    server.close(() => {
        console.log("Server stopped.");
        process.exit(0);
    });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);