/**
 * Mock SMS Provider for Local Development and Testing
 * Simulates Twilio SMS dispatch without network calls or credit consumption.
 */

import crypto from "crypto";
import { SmsProviderInterface, SmsDispatchResult } from "./sms.types";

export interface MockDispatchedMessage {
    messageSid: string;
    to: string;
    messageBody: string;
    dispatchedAt: Date;
    status: "SENT" | "DELIVERED";
}

export class MockSmsProvider implements SmsProviderInterface {
    public readonly providerName = "MOCK";
    private static dispatchedMessages: MockDispatchedMessage[] = [];

    /**
     * Send simulated SMS
     */
    public async send(
        to: string,
        messageBody: string,
        options?: { messageSid?: string }
    ): Promise<SmsDispatchResult> {
        const messageSid = options?.messageSid || `SMmock_${crypto.randomBytes(16).toString("hex")}`;
        const dispatchedAt = new Date();

        const record: MockDispatchedMessage = {
            messageSid,
            to,
            messageBody,
            dispatchedAt,
            status: "SENT",
        };

        MockSmsProvider.dispatchedMessages.push(record);

        // Pretty console output for localhost developers
        if (process.env.NODE_ENV !== "test") {
            console.log("\n==================== [LOCAL MOCK SMS DISPATCH] ====================");
            console.log(`To:         ${to}`);
            console.log(`SID:        ${messageSid}`);
            console.log(`Timestamp:  ${dispatchedAt.toISOString()}`);
            console.log(`Body:       ${messageBody}`);
            console.log("===================================================================\n");
        }

        return {
            success: true,
            messageSid,
            status: "SENT",
            recipientPhone: to,
            renderedMessage: messageBody,
            mock: true,
            dispatchedAt,
        };
    }

    /**
     * Helper methods for tests
     */
    public static getDispatchedMessages(): MockDispatchedMessage[] {
        return [...this.dispatchedMessages];
    }

    public static getLastDispatchedMessage(): MockDispatchedMessage | undefined {
        return this.dispatchedMessages[this.dispatchedMessages.length - 1];
    }

    public static clear(): void {
        this.dispatchedMessages = [];
    }
}
