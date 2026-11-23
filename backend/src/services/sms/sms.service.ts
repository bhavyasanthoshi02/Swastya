/**
 * Reusable SMS Service
 * Orchestrates template rendering, provider selection, and transactional outbox queuing.
 */

import { EventEmitter } from "events";
import { prisma } from "../../config/prisma";
import { SmsSendOptions, SmsProviderInterface, SmsDispatchResult } from "./sms.types";
import { renderSmsTemplate } from "./smsTemplates";
import { MockSmsProvider } from "./mockSms.provider";
import { TwilioProvider } from "./twilio.provider";

// Event emitter to trigger instant processing for low-latency dispatch
export const smsEventEmitter = new EventEmitter();
export const SMS_ENQUEUED_EVENT = "SMS_ENQUEUED";

export class SmsService {
    private static cachedProvider: SmsProviderInterface | null = null;

    /**
     * Get configured SMS Provider.
     * Guaranteed to return MockSmsProvider when TWILIO_MOCK_MODE is "true" (default)
     * or when TWILIO_MOCK_MODE is unset.
     */
    public static getProvider(): SmsProviderInterface {
        const isMockMode = (process.env.TWILIO_MOCK_MODE || "true").toLowerCase() === "true";

        if (this.cachedProvider) {
            const isCurrentlyMock = this.cachedProvider.providerName === "MOCK";
            if (isCurrentlyMock === isMockMode) {
                return this.cachedProvider;
            }
        }

        if (isMockMode) {
            this.cachedProvider = new MockSmsProvider();
            console.log(`[SmsService] Active provider: MOCK (TWILIO_MOCK_MODE=true). Network SMS disabled.`);
        } else {
            this.cachedProvider = new TwilioProvider();
            console.log(`[SmsService] Active provider: TWILIO (TWILIO_MOCK_MODE=false). Real Twilio REST API active.`);
        }

        return this.cachedProvider;
    }

    /**
     * Override provider (primarily for tests)
     */
    public static setProvider(provider: SmsProviderInterface | null): void {
        this.cachedProvider = provider;
    }

    /**
     * Queue an SMS into the Transactional Outbox (Atomically inside existing Prisma transaction if provided)
     */
    public static async queueSms(
        options: SmsSendOptions,
        prismaTx?: any
    ): Promise<{
        queued: boolean;
        outboxId?: string;
        isDuplicate?: boolean;
        messageBody: string;
        recipientPhone: string;
    }> {
        const normalizedPhone = TwilioProvider.normalizeE164(options.to);
        if (!normalizedPhone) {
            throw new Error(`Invalid recipient phone number: ${options.to}`);
        }

        // Render template with variables
        const messageBody = renderSmsTemplate(options.template, options.variables);

        const db = prismaTx || prisma;

        // Idempotency check if key provided
        if (options.idempotencyKey) {
            const existing = await db.smsoutbox.findUnique({
                where: { idempotencykey: options.idempotencyKey },
            });
            if (existing) {
                return {
                    queued: false,
                    outboxId: existing.outboxid,
                    isDuplicate: true,
                    messageBody: existing.messagebody,
                    recipientPhone: existing.phonenumber,
                };
            }
        }

        const outboxRecord = await db.smsoutbox.create({
            data: {
                userid: options.userId || null,
                phonenumber: normalizedPhone,
                templatename: options.template,
                messagebody: messageBody,
                actionurl: options.actionUrl || null,
                payload: options.metadata ? (options.metadata as any) : undefined,
                idempotencykey: options.idempotencyKey || null,
                status: "PENDING",
                attempts: 0,
                maxattempts: options.maxAttempts || 3,
                nextattemptat: new Date(),
            },
        });

        // Notify in-process background worker
        smsEventEmitter.emit(SMS_ENQUEUED_EVENT, outboxRecord.outboxid);

        return {
            queued: true,
            outboxId: outboxRecord.outboxid,
            isDuplicate: false,
            messageBody,
            recipientPhone: normalizedPhone,
        };
    }

    /**
     * Send direct SMS immediately using the active provider and log results
     */
    public static async sendDirect(
        options: SmsSendOptions
    ): Promise<SmsDispatchResult> {
        const normalizedPhone = TwilioProvider.normalizeE164(options.to);
        const messageBody = renderSmsTemplate(options.template, options.variables);
        const provider = this.getProvider();

        const result = await provider.send(normalizedPhone, messageBody);

        // Record in outbox/log table
        try {
            await prisma.smsoutbox.create({
                data: {
                    userid: options.userId || null,
                    phonenumber: normalizedPhone,
                    templatename: options.template,
                    messagebody: messageBody,
                    actionurl: options.actionUrl || null,
                    idempotencykey: options.idempotencyKey || null,
                    status: result.success ? "SENT" : "FAILED",
                    attempts: 1,
                    messagesid: result.messageSid || null,
                    dispatchconfirmedat: result.success ? new Date() : null,
                    errorcode: result.errorCode || null,
                    errormessage: result.errorMessage || null,
                },
            });
        } catch (dbErr) {
            console.error("[SmsService] Failed to save direct send log:", dbErr);
        }

        return result;
    }
}
