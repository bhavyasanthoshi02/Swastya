import path from "path";
import dotenv from "dotenv";

console.log("=== RUNTIME ENVIRONMENT & PROVIDER RESOLUTION AUDIT ===");

// Step 1: Initial state
console.log("1. Initial process.env.TWILIO_MOCK_MODE:", process.env.TWILIO_MOCK_MODE);
console.log("   Initial process.env.NODE_ENV:", process.env.NODE_ENV);

// Step 2: Simulate server.ts line 8
process.env.NODE_ENV = "development";
const devEnvPath = path.resolve(__dirname, "../.env.development");
dotenv.config({ path: devEnvPath, override: true });
console.log("2. After server.ts loads .env.development:");
console.log("   process.env.TWILIO_MOCK_MODE:", process.env.TWILIO_MOCK_MODE);

// Step 3: Simulate prisma.ts line 31
const neonEnvPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: neonEnvPath, override: true });
console.log("3. After prisma.ts loads .env:");
console.log("   process.env.TWILIO_MOCK_MODE:", process.env.TWILIO_MOCK_MODE);

// Step 4: Now check what SmsService.getProvider() resolves to!
import { SmsService } from "../src/services/sms/sms.service";
const provider = SmsService.getProvider();
console.log("4. SmsService.getProvider() instance:", provider.constructor.name);
console.log("   Provider providerName:", provider.providerName);
console.log("   Provider isMock:", provider.constructor.name === "MockSmsProvider");
