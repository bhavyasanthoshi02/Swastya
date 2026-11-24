import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV === "test") {
    dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });
} else if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
    process.env.NODE_ENV = "development";
    dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });
} else {
    dotenv.config();
}

import app from "./app";
import { startEmergencySchedulerWorker, stopEmergencySchedulerWorker } from "./services/scheduler.service";
import { startCampReminderWorker, stopCampReminderWorker } from "./services/campNotification.service";
import { startSmsOutboxWorker, stopSmsOutboxWorker } from "./services/sms/outboxWorker.service";
import "./services/sms/bloodRequestEvents";

const PORT = 5000;

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Start durable emergency scheduler background worker
    startEmergencySchedulerWorker();
    // Start durable camp reminder background worker
    startCampReminderWorker();
    // Start durable SMS outbox background worker
    startSmsOutboxWorker();
});

const gracefulShutdown = () => {
    console.log("Shutting down server and background workers...");
    stopEmergencySchedulerWorker();
    stopCampReminderWorker();
    stopSmsOutboxWorker();
    server.close(() => {
        console.log("Server stopped.");
        process.exit(0);
    });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);