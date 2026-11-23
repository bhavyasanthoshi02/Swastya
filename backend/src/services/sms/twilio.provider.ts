/**
 * Twilio SMS Provider
 * Standard REST API implementation with E.164 phone normalization,
 * timeout guards, and credential validation.
 */

import { SmsProviderInterface, SmsDispatchResult } from "./sms.types";

export interface TwilioConfig {
    accountSid?: string;
    authToken?: string;
    fromPhoneNumber?: string;
    messagingServiceSid?: string;
    statusCallbackUrl?: string;
}

export class TwilioProvider implements SmsProviderInterface {
    public readonly providerName = "TWILIO";
    private config: TwilioConfig;

    constructor(config?: TwilioConfig) {
        this.config = {
            accountSid: config?.accountSid || process.env.TWILIO_ACCOUNT_SID,
            authToken: config?.authToken || process.env.TWILIO_AUTH_TOKEN,
            fromPhoneNumber: config?.fromPhoneNumber || process.env.TWILIO_PHONE_NUMBER,
            messagingServiceSid: config?.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID,
            statusCallbackUrl: config?.statusCallbackUrl || process.env.TWILIO_STATUS_CALLBACK_URL,
        };
    }

    /**
     * Normalize Indian and International phone numbers to strict E.164 format (+91XXXXXXXXXX)
     */
    public static normalizeE164(phone: string): string {
        if (!phone) return "";
        const cleaned = phone.replace(/[^\d+]/g, "").trim();
        const digits = cleaned.replace(/\D/g, "");

        // 10 digits -> Indian domestic mobile
        if (digits.length === 10) {
            return `+91${digits}`;
        }
        // 12 digits starting with 91 -> Indian with country code
        if (digits.length === 12 && digits.startsWith("91")) {
            return `+${digits}`;
        }
        // Already formatted with +
        if (cleaned.startsWith("+")) {
            return cleaned;
        }
        return `+${digits}`;
    }

    /**
     * Dispatch SMS via Twilio REST API
     */
    public async send(
        to: string,
        messageBody: string,
        _options?: { messageSid?: string }
    ): Promise<SmsDispatchResult> {
        const normalizedPhone = TwilioProvider.normalizeE164(to);
        const dispatchedAt = new Date();

        // 1. Validate credentials
        if (!this.config.accountSid || !this.config.authToken) {
            return {
                success: false,
                messageSid: "",
                status: "FAILED",
                recipientPhone: normalizedPhone,
                renderedMessage: messageBody,
                errorCode: "MISSING_TWILIO_CREDENTIALS",
                errorMessage: "Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) are not configured.",
                mock: false,
                dispatchedAt,
            };
        }

        if (!this.config.fromPhoneNumber && !this.config.messagingServiceSid) {
            return {
                success: false,
                messageSid: "",
                status: "FAILED",
                recipientPhone: normalizedPhone,
                renderedMessage: messageBody,
                errorCode: "MISSING_SENDER_IDENTITY",
                errorMessage: "Neither TWILIO_PHONE_NUMBER nor TWILIO_MESSAGING_SERVICE_SID is configured.",
                mock: false,
                dispatchedAt,
            };
        }

        const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
        const authHeader = "Basic " + Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");

        const params = new URLSearchParams();
        params.append("To", normalizedPhone);
        params.append("Body", messageBody);

        if (this.config.messagingServiceSid) {
            params.append("MessagingServiceSid", this.config.messagingServiceSid);
        } else if (this.config.fromPhoneNumber) {
            params.append("From", this.config.fromPhoneNumber);
        }

        if (this.config.statusCallbackUrl) {
            params.append("StatusCallback", this.config.statusCallbackUrl);
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    Authorization: authHeader,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const data: any = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    messageSid: data?.sid || "",
                    status: "FAILED",
                    recipientPhone: normalizedPhone,
                    renderedMessage: messageBody,
                    errorCode: String(data?.code || response.status),
                    errorMessage: data?.message || "Twilio API rejected message dispatch.",
                    mock: false,
                    dispatchedAt,
                };
            }

            return {
                success: true,
                messageSid: data.sid,
                status: data.status === "queued" || data.status === "sent" ? "SENT" : "QUEUED",
                recipientPhone: normalizedPhone,
                renderedMessage: messageBody,
                mock: false,
                dispatchedAt,
            };
        } catch (err: any) {
            return {
                success: false,
                messageSid: "",
                status: "FAILED",
                recipientPhone: normalizedPhone,
                renderedMessage: messageBody,
                errorCode: err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
                errorMessage: err.message || "Failed to reach Twilio API.",
                mock: false,
                dispatchedAt,
            };
        }
    }
}
