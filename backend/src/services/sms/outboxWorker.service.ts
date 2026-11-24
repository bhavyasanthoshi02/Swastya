/**
 * Transactional Outbox Background Worker
 * Crash-resilient processor for asynchronous, reliable SMS dispatch.
 */

import { prisma } from "../../config/prisma";
import { SmsService, smsEventEmitter, SMS_ENQUEUED_EVENT } from "./sms.service";

export interface OutboxWorkerConfig {
    pollIntervalMs?: number;
    batchSize?: number;
    lockDurationSeconds?: number;
    workerId?: string;
}

export class OutboxWorkerService {
    private isRunning = false;
    private isProcessing = false;
    private timer: NodeJS.Timeout | null = null;
    private config: Required<OutboxWorkerConfig>;

    constructor(config?: OutboxWorkerConfig) {
        this.config = {
            pollIntervalMs: config?.pollIntervalMs || 5000,
            batchSize: config?.batchSize || 10,
            lockDurationSeconds: config?.lockDurationSeconds || 120, // 2 minutes lease
            workerId: config?.workerId || `worker_${process.pid}_${Math.random().toString(36).slice(2, 8)}`,
        };
    }

    /**
     * Start the background outbox processor
     */
    public start(): void {
        if (this.isRunning) return;
        this.isRunning = true;

        // Listen for instant dispatch events
        smsEventEmitter.on(SMS_ENQUEUED_EVENT, () => {
            if (this.isRunning && !this.isProcessing) {
                this.processBatch().catch(err => {
                    console.error("[OutboxWorker] Event trigger error:", err);
                });
            }
        });

        // Start periodic interval loop
        this.timer = setInterval(() => {
            if (this.isRunning && !this.isProcessing) {
                this.processBatch().catch(err => {
                    console.error("[OutboxWorker] Scheduled poll error:", err);
                });
            }
        }, this.config.pollIntervalMs);

        console.log(`[OutboxWorker] Started (id: ${this.config.workerId}, poll: ${this.config.pollIntervalMs}ms)`);
    }

    /**
     * Stop the worker gracefully
     */
    public stop(): void {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log("[OutboxWorker] Stopped.");
    }

    /**
     * Release stale locks from crashed worker processes
     */
    public async recoverStaleLocks(): Promise<number> {
        try {
            const now = new Date();
            // Stale items: status=PROCESSING and lockeduntil < now
            const staleItems = await prisma.smsoutbox.findMany({
                where: {
                    status: "PROCESSING",
                    lockeduntil: { lt: now },
                },
                take: 50,
            });

            if (staleItems.length === 0) return 0;

            for (const item of staleItems) {
                // If it already has a messagesid, it was actually dispatched before crash!
                if (item.messagesid) {
                    const isMock = item.messagesid.startsWith("SMmock_");
                    await prisma.smsoutbox.update({
                        where: { outboxid: item.outboxid },
                        data: {
                            status: isMock ? "MOCK_SENT" : "ACCEPTED_BY_TWILIO",
                            lockeduntil: null,
                            lockedby: null,
                            dispatchconfirmedat: item.dispatchconfirmedat || now,
                        },
                    });
                } else {
                    // Revert to PENDING with exponential backoff
                    const nextAttempt = new Date(Date.now() + 10000);
                    await prisma.smsoutbox.update({
                        where: { outboxid: item.outboxid },
                        data: {
                            status: "PENDING",
                            lockeduntil: null,
                            lockedby: null,
                            nextattemptat: nextAttempt,
                        },
                    });
                }
            }

            return staleItems.length;
        } catch (err) {
            console.error("[OutboxWorker] Stale lock recovery error:", err);
            return 0;
        }
    }

    /**
     * Process next pending batch with concurrency locks
     */
    public async processBatch(): Promise<{ processed: number; sent: number; failed: number }> {
        if (this.isProcessing) {
            return { processed: 0, sent: 0, failed: 0 };
        }

        this.isProcessing = true;
        let processed = 0;
        let sent = 0;
        let failed = 0;

        try {
            // First check and recover any stale locks
            await this.recoverStaleLocks();

            const now = new Date();
            const lockUntil = new Date(now.getTime() + this.config.lockDurationSeconds * 1000);

            // Fetch pending items eligible for dispatch
            // Status PENDING and nextattemptat <= now
            const candidates = await prisma.smsoutbox.findMany({
                where: {
                    status: "PENDING",
                    nextattemptat: { lte: now },
                },
                orderBy: { createdat: "asc" },
                take: this.config.batchSize,
            });

            if (candidates.length === 0) {
                return { processed: 0, sent: 0, failed: 0 };
            }

            const provider = SmsService.getProvider();

            for (const candidate of candidates) {
                // Atomic claim using optimistic lock version to prevent race conditions across parallel workers
                const claimed = await prisma.smsoutbox.updateMany({
                    where: {
                        outboxid: candidate.outboxid,
                        status: "PENDING",
                        lockversion: candidate.lockversion,
                    },
                    data: {
                        status: "PROCESSING",
                        lockedby: this.config.workerId,
                        lockeduntil: lockUntil,
                        lockversion: candidate.lockversion + 1,
                        lastattemptat: now,
                    },
                });

                if (claimed.count === 0) {
                    // Another worker grabbed this message, skip
                    continue;
                }

                processed++;

                try {
                    // Safe dispatch through provider
                    console.log(`[OutboxWorker] Dispatching record ${candidate.outboxid}: provider=${provider.providerName}`);
                    const result = await provider.send(candidate.phonenumber, candidate.messagebody);

                    if (result.success) {
                        sent++;
                        const resolvedStatus = result.mock ? "MOCK_SENT" : "ACCEPTED_BY_TWILIO";
                        console.log(`[OutboxWorker] Record ${candidate.outboxid} marked as ${resolvedStatus} (SID: ${result.messageSid})`);
                        await prisma.smsoutbox.update({
                            where: { outboxid: candidate.outboxid },
                            data: {
                                status: resolvedStatus,
                                messagesid: result.messageSid,
                                dispatchconfirmedat: new Date(),
                                lockeduntil: null,
                                lockedby: null,
                                errorcode: null,
                                errormessage: null,
                            },
                        });
                    } else {
                        failed++;
                        const nextAttempts = candidate.attempts + 1;
                        const isDeadLetter = nextAttempts >= candidate.maxattempts;

                        // Exponential backoff: 30s * 2^(attempts)
                        const backoffSeconds = Math.min(30 * Math.pow(2, candidate.attempts), 3600);
                        const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

                        await prisma.smsoutbox.update({
                            where: { outboxid: candidate.outboxid },
                            data: {
                                status: isDeadLetter ? "DEAD_LETTER" : "PENDING",
                                attempts: nextAttempts,
                                nextattemptat: nextAttemptAt,
                                lockeduntil: null,
                                lockedby: null,
                                errorcode: result.errorCode || "DISPATCH_FAILED",
                                errormessage: result.errorMessage || "Provider dispatch failed",
                            },
                        });
                    }
                } catch (itemErr: any) {
                    failed++;
                    const nextAttempts = candidate.attempts + 1;
                    const isDeadLetter = nextAttempts >= candidate.maxattempts;
                    const backoffSeconds = Math.min(30 * Math.pow(2, candidate.attempts), 3600);

                    await prisma.smsoutbox.update({
                        where: { outboxid: candidate.outboxid },
                        data: {
                            status: isDeadLetter ? "DEAD_LETTER" : "PENDING",
                            attempts: nextAttempts,
                            nextattemptat: new Date(Date.now() + backoffSeconds * 1000),
                            lockeduntil: null,
                            lockedby: null,
                            errorcode: "UNEXPECTED_WORKER_ERROR",
                            errormessage: itemErr.message || String(itemErr),
                        },
                    });
                }
            }
        } finally {
            this.isProcessing = false;
        }

        return { processed, sent, failed };
    }
}

let defaultWorker: OutboxWorkerService | null = null;

export function startSmsOutboxWorker(config?: OutboxWorkerConfig): OutboxWorkerService {
    if (!defaultWorker) {
        defaultWorker = new OutboxWorkerService(config);
    }
    defaultWorker.start();
    return defaultWorker;
}

export function stopSmsOutboxWorker(): void {
    if (defaultWorker) {
        defaultWorker.stop();
        defaultWorker = null;
    }
}

export function getSmsOutboxWorkerStatus(): { status: string; isRunning: boolean; workerId?: string; pollIntervalMs?: number } {
    if (!defaultWorker || !(defaultWorker as any).isRunning) {
        return { status: "stopped", isRunning: false };
    }
    return {
        status: "connected and polling successfully",
        isRunning: true,
        workerId: (defaultWorker as any).config.workerId,
        pollIntervalMs: (defaultWorker as any).config.pollIntervalMs,
    };
}
