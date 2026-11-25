import dotenv from "dotenv";
import path from "path";

// Load development environment
dotenv.config({ path: path.resolve(__dirname, "../.env.development"), override: true });

import { TwilioProvider } from "../backend/src/services/sms/twilio.provider";
import { SmsService } from "../backend/src/services/sms/sms.service";
import { MockSmsProvider } from "../backend/src/services/sms/mockSms.provider";

interface CheckItem {
  id: string;
  description: string;
  passed: boolean;
  notes?: string;
}

const checks: CheckItem[] = [];

function check(id: string, description: string, passed: boolean, notes?: string) {
  checks.push({ id, description, passed, notes });
  const status = passed ? "[PASS]" : "[FAIL]";
  console.log(`${status} ${id}: ${description}${notes ? ` (${notes})` : ""}`);
}

async function runVerification() {
  console.log("===============================================================================");
  console.log(" SWASTYA: TWILIO INTEGRATION CONFIGURATION & SAFETY VERIFICATION");
  console.log("===============================================================================\n");

  console.log("--- 1. Environment Variable Validation (Zero Secret Leakage) ---");
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
  const mockMode = process.env.TWILIO_MOCK_MODE || "";

  check(
    "1.1",
    "TWILIO_ACCOUNT_SID is configured and non-empty",
    accountSid.length > 0,
    `Length: ${accountSid.length} chars`
  );

  check(
    "1.2",
    "TWILIO_ACCOUNT_SID format matches Twilio specification (starts with AC, 34 chars)",
    accountSid.startsWith("AC") && accountSid.length === 34,
    `Prefix: AC, Valid: ${accountSid.startsWith("AC") && accountSid.length === 34}`
  );

  check(
    "1.3",
    "TWILIO_AUTH_TOKEN is configured and non-empty",
    authToken.length > 0,
    `Length: ${authToken.length} chars (Masked)`
  );

  check(
    "1.4",
    "TWILIO_AUTH_TOKEN format matches standard 32-character hexadecimal token",
    /^[a-f0-9]{32}$/i.test(authToken),
    "Format valid"
  );

  check(
    "1.5",
    "TWILIO_MESSAGING_SERVICE_SID is configured and non-empty",
    messagingServiceSid.length > 0,
    `Length: ${messagingServiceSid.length} chars`
  );

  check(
    "1.6",
    "TWILIO_MESSAGING_SERVICE_SID format matches Twilio specification (starts with MG, 34 chars)",
    messagingServiceSid.startsWith("MG") && messagingServiceSid.length === 34,
    `Prefix: MG, Valid: ${messagingServiceSid.startsWith("MG") && messagingServiceSid.length === 34}`
  );

  check(
    "1.7",
    "TWILIO_MOCK_MODE is strictly set to 'true'",
    mockMode.toLowerCase() === "true",
    `Current: ${mockMode}`
  );

  console.log("\n--- 2. Twilio Provider & Messaging Service API Verification ---");
  const provider = new TwilioProvider();

  check(
    "2.1",
    "TwilioProvider instantiates successfully with configured environment",
    provider !== null && provider !== undefined
  );

  check(
    "2.2",
    "TwilioProvider.isConfigured() reports true (credentials present)",
    provider.isConfigured() === true
  );

  check(
    "2.3",
    "TwilioProvider uses Messaging Service SID as sender identity (No purchased phone number required)",
    provider.getMessagingServiceSid()?.startsWith("MG") === true
  );

  check(
    "2.4",
    "E.164 normalization correctly formats 10-digit Indian numbers to +91XXXXXXXXXX",
    TwilioProvider.normalizeE164("9876543210") === "+919876543210"
  );

  check(
    "2.5",
    "E.164 normalization preserves international E.164 formats",
    TwilioProvider.normalizeE164("+14155552671") === "+14155552671"
  );

  console.log("\n--- 3. Mock Mode Safety Invariants (Zero Paid API Calls) ---");
  const activeSmsProvider = SmsService.getProvider();

  check(
    "3.1",
    "SmsService.getProvider() resolves to MockSmsProvider when mock mode is enabled",
    activeSmsProvider.providerName === "MOCK"
  );

  MockSmsProvider.clear();
  const mockResult = await activeSmsProvider.send("+919876543210", "Swastya verification message");

  check(
    "3.2",
    "Mock dispatch succeeds without external API calls",
    mockResult.success === true && mockResult.mock === true
  );

  check(
    "3.3",
    "Mock dispatch generates simulated Twilio message SID (SMmock_...)",
    mockResult.messageSid.startsWith("SMmock_")
  );

  check(
    "3.4",
    "In-memory mock provider captures dispatched message for audit inspection",
    MockSmsProvider.getDispatchedMessages().length === 1 &&
    MockSmsProvider.getLastDispatchedMessage()?.to === "+919876543210"
  );

  console.log("\n--- 4. Provider Error Handling & Boundary Defense ---");
  const unconfiguredProvider = new TwilioProvider({ accountSid: "", authToken: "" });
  const unconfiguredResult = await unconfiguredProvider.send("9876543210", "Test missing credentials");

  check(
    "4.1",
    "TwilioProvider safely intercepts missing credentials without throwing an unhandled exception",
    unconfiguredResult.success === false && unconfiguredResult.errorCode === "MISSING_TWILIO_CREDENTIALS"
  );

  const invalidSidProvider = new TwilioProvider({
    accountSid: process.env.TWILIO_ACCOUNT_SID || "AC00000000000000000000000000000000",
    authToken: process.env.TWILIO_AUTH_TOKEN || "00000000000000000000000000000000",
    messagingServiceSid: "INVALID_PREFIX_SID",
  });
  const invalidSidResult = await invalidSidProvider.send("9876543210", "Test invalid SID prefix");

  check(
    "4.2",
    "TwilioProvider validates Messaging Service SID prefix (rejects non-MG prefix with clear code)",
    invalidSidResult.success === false && invalidSidResult.errorCode === "INVALID_MESSAGING_SERVICE_SID"
  );

  console.log("\n================ VERIFICATION SUMMARY ================");
  const allPassed = checks.every((c) => c.passed);
  const total = checks.length;
  const passedCount = checks.filter((c) => c.passed).length;
  console.log(`TOTAL CHECKS: ${total} | PASSED: ${passedCount} | FAILED: ${total - passedCount}`);

  if (!allPassed) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(1);
});
