import { prisma } from "../config/prisma";
import { triggerEmergencyBroadcast } from "./broadcast.service";
import { notification_type } from "../generated/prisma/enums";

// Configurable settings with sensible defaults
export const DEFAULT_FOLLOWUP_DELAY_MINUTES = parseInt(process.env.EMERGENCY_FOLLOWUP_DELAY_MINUTES || "15", 10);
export const DEFAULT_RADIUS_INCREMENT_KM = parseInt(process.env.EMERGENCY_RADIUS_INCREMENT_KM || "5", 10);
export const MAX_RADIUS_KM = 100;
export const MIN_RADIUS_KM = 1;
export const MAX_JOB_ATTEMPTS = 5;
export const LOCK_TIMEOUT_MINUTES = 5;
export const DEFAULT_POLL_INTERVAL_MS = 10000;

export interface ScheduleJobOptions {
    requestId: string;
    delayMinutes?: number;
    scheduledFor?: Date;
    idempotencyKey?: string;
    jobType?: string;
    maxAttempts?: number;
}

export interface ClaimedSchedulerJob {
    jobid: string;
    requestid: string;
    jobtype: string;
    status: string;
    scheduledfor: Date;
    lockeduntil: Date | null;
    lockedby: string | null;
    attemptcount: number;
    maxattempts: number;
    lasterror: string | null;
    idempotencykey: string | null;
    createdat: Date | null;
    updatedat: Date | null;
    completedat: Date | null;
}

/**
 * Sanitizes error messages to prevent leaking passwords, tokens, or database/Prisma internals into DB or logs.
 */
export function sanitizeErrorMessage(msg: string | null | undefined): string {
    if (!msg) return "UNKNOWN_ERROR";
    const lower = String(msg).toLowerCase();
    if (
        lower.includes("prisma") ||
        lower.includes("postgres") ||
        lower.includes("select") ||
        lower.includes("update") ||
        lower.includes("insert") ||
        lower.includes("delete") ||
        lower.includes("relation") ||
        lower.includes("table") ||
        lower.includes("column") ||
        lower.includes("database") ||
        lower.includes("syntax error") ||
        lower.includes("constraint") ||
        lower.includes("uuid") ||
        lower.includes("foreign key") ||
        lower.includes("eacces") ||
        lower.includes("econnrefused")
    ) {
        return "DATABASE_OPERATION_FAILED";
    }
    if (lower.includes("password") || lower.includes("bearer") || lower.includes("secret") || lower.includes("token")) {
        return "AUTHENTICATION_FAILED";
    }
    return String(msg)
        .replace(/postgres(?:ql)?:\/\/[^\s@]+@[^\s/]+/gi, "postgresql://[REDACTED]")
        .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, "Bearer [REDACTED]")
        .replace(/password\s*=\s*[^\s;]+/gi, "password=[REDACTED]")
        .slice(0, 500);
}

/**
 * Safely creates an in-app notification without throwing unhandled exceptions.
 */
async function createNotificationSafely(data: {
    userId: string;
    requestId?: string;
    type: notification_type;
    title: string;
    message: string;
}) {
    try {
        await prisma.notification.create({
            data: {
                userid: data.userId,
                requestid: data.requestId,
                type: data.type,
                title: data.title,
                message: data.message,
                isread: false,
            },
        });
    } catch (err: any) {
        console.error("Failed to create in-app notification:", sanitizeErrorMessage(err?.message));
    }
}

async function updateJobIfProcessing(jobId: string, data: Record<string, any>): Promise<boolean> {
    try {
        if (typeof (prisma.emergencyschedulerjobs as any).updateMany === "function") {
            const res = await prisma.emergencyschedulerjobs.updateMany({
                where: { jobid: jobId, status: "PROCESSING" },
                data,
            });
            return (res?.count ?? 0) > 0;
        }
        await prisma.emergencyschedulerjobs.update({
            where: { jobid: jobId },
            data,
        });
        return true;
    } catch (err: any) {
        console.error("[EmergencyScheduler] Failed to update job state:", sanitizeErrorMessage(err?.message));
        return false;
    }
}

async function isJobStillProcessing(jobId: string): Promise<boolean> {
    if (typeof (prisma.emergencyschedulerjobs as any).findUnique === "function") {
        const current = await prisma.emergencyschedulerjobs.findUnique({
            where: { jobid: jobId },
            select: { status: true },
        });
        if (current && current.status !== "PROCESSING") {
            return false;
        }
    }
    return true;
}

/**
 * Schedules a persistent follow-up job in PostgreSQL.
 * Idempotent: If a job with the same idempotency key already exists and is PENDING or PROCESSING, it is returned.
 * Never schedules jobs for terminal or arranged requests.
 */
export async function scheduleEmergencyFollowUp(options: ScheduleJobOptions) {
    const {
        requestId,
        delayMinutes = DEFAULT_FOLLOWUP_DELAY_MINUTES,
        scheduledFor,
        idempotencyKey,
        jobType = "FOLLOW_UP_ESCALATION",
        maxAttempts = MAX_JOB_ATTEMPTS,
    } = options;

    if (typeof prisma.bloodrequests?.findUnique === "function") {
        const req = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            select: { status: true },
        });
        if (!req || ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"].includes(req.status || "")) {
            return null;
        }
    }

    // 1. Enforce at most one open follow-up job per request: return existing if PENDING or PROCESSING
    const existingOpenJob = await prisma.emergencyschedulerjobs.findFirst({
        where: {
            requestid: requestId,
            status: { in: ["PENDING", "PROCESSING"] },
        },
        orderBy: { scheduledfor: "asc" },
    });
    if (existingOpenJob) {
        if (scheduledFor && scheduledFor.getTime() < existingOpenJob.scheduledfor.getTime()) {
            const updated = await prisma.emergencyschedulerjobs.update({
                where: { jobid: existingOpenJob.jobid },
                data: {
                    scheduledfor: scheduledFor,
                    idempotencykey: idempotencyKey || existingOpenJob.idempotencykey,
                },
            });
            return updated;
        }
        return existingOpenJob;
    }

    const dueTime = scheduledFor ?? new Date(Date.now() + delayMinutes * 60 * 1000);
    // Stable per-request follow-up key
    const key = idempotencyKey || `followup_${requestId}`;

    // Check for existing pending or processing job with the same idempotency key
    const existing = await prisma.emergencyschedulerjobs.findFirst({
        where: {
            idempotencykey: key,
            status: { in: ["PENDING", "PROCESSING", "COMPLETED"] },
        },
    });

    if (existing) {
        return existing;
    }

    try {
        const job = await prisma.emergencyschedulerjobs.create({
            data: {
                requestid: requestId,
                jobtype: jobType,
                status: "PENDING",
                scheduledfor: dueTime,
                attemptcount: 0,
                maxattempts: maxAttempts,
                idempotencykey: key,
            },
        });
        return job;
    } catch (err: any) {
        // Handle race-condition duplicate key or partial unique index (uq_open_scheduler_job_per_request) conflict gracefully
        if (
            err?.code === "P2002" ||
            err?.message?.includes("idempotencykey") ||
            err?.message?.includes("uq_open_scheduler_job_per_request")
        ) {
            const conflictOpen = await prisma.emergencyschedulerjobs.findFirst({
                where: {
                    requestid: requestId,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (conflictOpen) return conflictOpen;

            const conflictExisting = await prisma.emergencyschedulerjobs.findUnique({
                where: { idempotencykey: key },
            });
            if (conflictExisting) return conflictExisting;
        }
        throw err;
    }
}

/**
 * Recovers jobs that were left in PROCESSING state when a worker crashed.
 * If lockeduntil has expired, resets them to PENDING so they can be retried.
 */
export async function recoverAbandonedJobs(): Promise<number> {
    const now = new Date();
    await prisma.$executeRawUnsafe(`
        UPDATE emergencyschedulerjobs
        SET status = 'FAILED',
            lockeduntil = NULL,
            lockedby = NULL,
            lasterror = COALESCE(lasterror, 'Abandoned processing job exceeded max attempts'),
            updatedat = $1
        WHERE status = 'PROCESSING'
          AND lockeduntil < $1
          AND attemptcount >= maxattempts;
    `, now);

    const result = await prisma.$executeRawUnsafe(`
        UPDATE emergencyschedulerjobs
        SET status = 'PENDING',
            lockeduntil = NULL,
            lockedby = NULL,
            updatedat = $1
        WHERE status = 'PROCESSING'
          AND lockeduntil < $1
          AND attemptcount < maxattempts;
    `, now);
    if (result > 0) {
        console.log(`[EmergencyScheduler] Recovered ${result} abandoned processing job(s).`);
    }
    return result;
}

/**
 * Atomically claims the next due job using PostgreSQL FOR UPDATE SKIP LOCKED.
 * Guarantees that concurrent workers will never claim or execute the same job.
 */
export async function claimNextDueJob(workerId: string): Promise<ClaimedSchedulerJob | null> {
    const now = new Date();
    const lockUntil = new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000);

    const claimed: ClaimedSchedulerJob[] = await prisma.$queryRawUnsafe(`
        WITH next_job AS (
            SELECT jobid
            FROM emergencyschedulerjobs
            WHERE status = 'PENDING'
              AND scheduledfor <= $1
              AND attemptcount < maxattempts
              AND (lockeduntil IS NULL OR lockeduntil < $1)
            ORDER BY scheduledfor ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE emergencyschedulerjobs
        SET status = 'PROCESSING',
            lockeduntil = $2,
            lockedby = $3,
            attemptcount = attemptcount + 1,
            updatedat = $1
        FROM next_job
        WHERE emergencyschedulerjobs.jobid = next_job.jobid
        RETURNING 
            emergencyschedulerjobs.jobid,
            emergencyschedulerjobs.requestid,
            emergencyschedulerjobs.jobtype,
            emergencyschedulerjobs.status,
            emergencyschedulerjobs.scheduledfor,
            emergencyschedulerjobs.lockeduntil,
            emergencyschedulerjobs.lockedby,
            emergencyschedulerjobs.attemptcount,
            emergencyschedulerjobs.maxattempts,
            emergencyschedulerjobs.lasterror,
            emergencyschedulerjobs.idempotencykey,
            emergencyschedulerjobs.createdat,
            emergencyschedulerjobs.updatedat,
            emergencyschedulerjobs.completedat;
    `, now, lockUntil, workerId);

    if (claimed && claimed.length > 0) {
        return claimed[0];
    }
    return null;
}

/**
 * Cancels all pending or processing jobs for a given blood request.
 * Called when a request enters a terminal state (FULFILLED, CANCELLED, EXPIRED) or is deleted.
 */
export async function cancelPendingJobs(requestId: string, reason?: string) {
    return await prisma.emergencyschedulerjobs.updateMany({
        where: {
            requestid: requestId,
            status: { in: ["PENDING", "PROCESSING"] },
        },
        data: {
            status: "CANCELLED",
            lasterror: reason || "Cancelled due to request entering terminal state",
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        },
    });
}

/**
 * Executes a claimed follow-up escalation job.
 * Handles response adequacy evaluation, controlled radius expansion, expiry check, and next job scheduling.
 */
export async function executeFollowUpJob(job: ClaimedSchedulerJob): Promise<{
    status: "COMPLETED" | "CANCELLED" | "EXPANDED" | "MAX_RADIUS_REACHED" | "EXPIRED";
    details: string;
}> {
    if (!(await isJobStillProcessing(job.jobid))) {
        return { status: "CANCELLED", details: "Job was cancelled before execution" };
    }

    const request = await prisma.bloodrequests.findUnique({
        where: { requestid: job.requestid },
        include: {
            hospitals: true,
            requesters: true,
            broadcastdeliveries: true,
            emergencybroadcasts: {
                orderBy: { createdat: "desc" },
            },
        },
    });

    // 1. Check if request exists
    if (!request) {
        await updateJobIfProcessing(job.jobid, {
            status: "FAILED",
            lasterror: "Blood request record not found",
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });
        return { status: "CANCELLED", details: "Blood request record not found" };
    }

    // 2. Terminal state check
    const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
    if (terminalStatuses.includes(request.status || "")) {
        await updateJobIfProcessing(job.jobid, {
            status: "CANCELLED",
            lasterror: `Request is in terminal state: ${request.status}`,
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });
        return { status: "CANCELLED", details: `Request is in terminal state: ${request.status}` };
    }

    // 3. Emergency eligibility check
    const isEmergency = Boolean(request.isemergency) || request.urgencylevel === "CRITICAL";
    if (!isEmergency) {
        await updateJobIfProcessing(job.jobid, {
            status: "CANCELLED",
            lasterror: "Request is no longer marked emergency or critical",
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });
        return { status: "CANCELLED", details: "Request is no longer marked emergency or critical" };
    }

    // 3a. Recheck prescription status: block follow-up execution for REJECTED prescriptions
    const rx = await prisma.prescription.findUnique({
        where: { requestid: job.requestid },
        select: { status: true },
    });
    if (rx?.status === "REJECTED") {
        await updateJobIfProcessing(job.jobid, {
            status: "CANCELLED",
            lasterror: "PRESCRIPTION_REJECTED",
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });
        return { status: "CANCELLED", details: "Prescription rejected by hospital; follow-up escalation cancelled." };
    }

    // 3b. Validate assigned hospital: if hospital is missing, cancel follow-up execution
    // TEMPORARY BYPASS: Allow non-APPROVED hospitals to execute follow-up scheduler jobs
    if (request.hospitalid) {
        const hosp = await prisma.hospitals.findUnique({
            where: { hospitalid: request.hospitalid },
            select: { approvalstatus: true },
        });
        if (!hosp) {
            await updateJobIfProcessing(job.jobid, {
                status: "CANCELLED",
                lasterror: "HOSPITAL_NOT_FOUND",
                lockeduntil: null,
                lockedby: null,
                updatedat: new Date(),
            });
            return {
                status: "CANCELLED",
                details: "Assigned hospital not found; follow-up escalation cancelled.",
            };
        }
    }

    // 4. Clinical Expiration check based on requiredby deadline
    // Only evaluate expiry if request is not already arranged or terminal
    const nonExpirablePrecheck = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
    if (
        !nonExpirablePrecheck.includes(request.status || "") &&
        request.requiredby &&
        new Date(request.requiredby).getTime() <= Date.now()
    ) {
        // Atomic transaction: lock row with SELECT ... FOR UPDATE, re-read status & requiredby, and conditionally expire
        const expiryOutcome = await prisma.$transaction(async (tx) => {
            const lockedRows: any[] = await tx.$queryRawUnsafe(
                `SELECT requestid, status, requiredby, patientname, createdbyuserid FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
                request.requestid
            );

            if (!lockedRows || lockedRows.length === 0) {
                return { expired: false, reason: "NOT_FOUND", currentStatus: null, lockedReq: null };
            }

            const lockedReq = lockedRows[0];
            const currentStatus = lockedReq.status || "";
            const currentRequiredBy = lockedReq.requiredby ? new Date(lockedReq.requiredby).getTime() : null;

            // Never overwrite terminal or blood-arranged statuses
            const nonExpirableStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
            if (nonExpirableStatuses.includes(currentStatus)) {
                return { expired: false, reason: "INELIGIBLE_STATUS", currentStatus, lockedReq };
            }

            // Ensure the deadline has genuinely passed
            if (!currentRequiredBy || currentRequiredBy > Date.now()) {
                return { expired: false, reason: "DEADLINE_EXTENDED", currentStatus, lockedReq };
            }

            // Request is genuinely eligible for expiration
            await tx.bloodrequests.update({
                where: { requestid: request.requestid },
                data: { status: "EXPIRED" },
            });

            await tx.requeststatushistory.create({
                data: {
                    requestid: request.requestid,
                    oldstatus: currentStatus,
                    newstatus: "EXPIRED",
                    remarks: "Request automatically expired: requiredBy deadline passed with unfulfilled status",
                },
            });

            await tx.emergencybroadcasts.updateMany({
                where: { requestid: request.requestid, status: "ACTIVE" },
                data: { status: "EXPIRED" },
            });

            return { expired: true, reason: "EXPIRED", currentStatus, lockedReq };
        });

        if (expiryOutcome.expired) {
            const notifiedUserId = expiryOutcome.lockedReq?.createdbyuserid || request.createdbyuserid;
            const bloodGroup = expiryOutcome.lockedReq?.bloodgroup || request.bloodgroup;
            const bloodComponent = expiryOutcome.lockedReq?.bloodcomponent || request.bloodcomponent || "Whole Blood";

            await createNotificationSafely({
                userId: notifiedUserId,
                requestId: request.requestid,
                type: notification_type.REQUEST,
                title: "Blood Requisition Expired",
                message: `Blood requisition for ${bloodGroup} (${bloodComponent}) has expired based on requiredBy deadline.`,
            });

            await updateJobIfProcessing(job.jobid, {
                status: "CANCELLED",
                lasterror: "Request expired based on requiredBy timestamp",
                lockeduntil: null,
                lockedby: null,
                updatedat: new Date(),
            });

            return { status: "EXPIRED", details: "Request expired based on requiredBy timestamp" };
        } else {
            // Locked row was not eligible for expiry - handle safely without sending expiry notification
            const curStatus = expiryOutcome.currentStatus || "";
            if (["FULFILLED", "CANCELLED", "EXPIRED"].includes(curStatus)) {
                await updateJobIfProcessing(job.jobid, {
                    status: "CANCELLED",
                    lasterror: `Request is in terminal state: ${curStatus}`,
                    lockeduntil: null,
                    lockedby: null,
                    updatedat: new Date(),
                });
                return { status: "CANCELLED", details: `Request is in terminal state: ${curStatus}` };
            }

            if (curStatus === "BLOOD_ARRANGED") {
                const marked = await updateJobIfProcessing(job.jobid, {
                    status: "COMPLETED",
                    completedat: new Date(),
                    lasterror: null,
                    lockeduntil: null,
                    lockedby: null,
                    updatedat: new Date(),
                });
                return {
                    status: marked ? "COMPLETED" : "CANCELLED",
                    details: marked
                        ? "Blood has already been arranged for this requisition. No radius expansion needed."
                        : "Job was cancelled concurrently.",
                };
            }

            if (curStatus) {
                request.status = curStatus as any;
            }
        }
    }

    // 5. Response Adequacy check
    // Configurable policy: count confirmed pledges / active transit / accepted responses
    const confirmedDeliveries = request.broadcastdeliveries.filter(
        (d) =>
            (d.acceptancestatus || "PENDING") !== "REJECTED" &&
            (d.response === "ACCEPTED" || ["STARTED", "REACHED_LOCATION", "COMPLETED"].includes(d.transitstatus || ""))
    );
    const requiredUnits = request.unitsrequired || 1;

    // If confirmed pledges meet or exceed units required, or status is already BLOOD_ARRANGED / FULFILLED
    if (confirmedDeliveries.length >= requiredUnits || ["BLOOD_ARRANGED", "FULFILLED"].includes(request.status || "")) {
        const marked = await updateJobIfProcessing(job.jobid, {
            status: "COMPLETED",
            completedat: new Date(),
            lasterror: null,
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });

        return {
            status: marked ? "COMPLETED" : "CANCELLED",
            details: marked
                ? `Adequate donor response received (${confirmedDeliveries.length} confirmed pledges for ${requiredUnits} unit(s)). No radius expansion needed.`
                : "Job was cancelled concurrently.",
        };
    }

    // 6. Responses are INSUFFICIENT -> Evaluate Radius Expansion
    // Re-check current search radius from database to avoid evaluating against stale state
    const currentRequestState = await prisma.bloodrequests.findUnique({
        where: { requestid: request.requestid },
        select: { searchradius: true },
    });
    const currentRadius = currentRequestState?.searchradius || request.searchradius || 15;

    if (currentRadius >= MAX_RADIUS_KM) {
        // Re-verify request status and conditionally mark job COMPLETED before dispatching notifications
        const latestReq = await prisma.bloodrequests.findUnique({
            where: { requestid: request.requestid },
            select: { status: true },
        });
        if (!latestReq || ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"].includes(latestReq.status || "")) {
            await updateJobIfProcessing(job.jobid, {
                status: "CANCELLED",
                lasterror: `Request transitioned to ${latestReq?.status || "MISSING"}`,
                lockeduntil: null,
                lockedby: null,
                updatedat: new Date(),
            });
            return {
                status: "CANCELLED",
                details: `Request is no longer eligible (${latestReq?.status || "MISSING"}).`,
            };
        }

        const markedCompleted = await updateJobIfProcessing(job.jobid, {
            status: "COMPLETED",
            completedat: new Date(),
            lasterror: "Maximum search radius (100 km) reached without sufficient responses",
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });

        if (!markedCompleted) {
            return {
                status: "CANCELLED",
                details: "Job was cancelled before max-radius notification dispatch.",
            };
        }

        await createNotificationSafely({
            userId: request.createdbyuserid,
            requestId: request.requestid,
            type: notification_type.REQUEST,
            title: "Maximum Search Radius Reached",
            message: `Emergency blood search for ${request.bloodgroup} (${request.bloodcomponent || "Whole Blood"}) has reached the maximum 100 km radius. Insufficient responses received (${confirmedDeliveries.length}/${requiredUnits} confirmed pledges). Direct coordination with regional blood banks is recommended.`,
        });

        if (request.hospitals?.userid && request.hospitals.userid !== request.createdbyuserid) {
            await createNotificationSafely({
                userId: request.hospitals.userid,
                requestId: request.requestid,
                type: notification_type.REQUEST,
                title: "Maximum Search Radius Reached",
                message: `Emergency blood search for ${request.bloodgroup} (${request.bloodcomponent || "Whole Blood"}) has reached the maximum 100 km radius with insufficient responses.`,
            });
        }

        return {
            status: "MAX_RADIUS_REACHED",
            details: `Maximum search radius of ${MAX_RADIUS_KM} km reached. Insufficient responses received.`,
        };
    }

    // Calculate next radius, respecting MAX_RADIUS_KM
    const nextRadius = Math.min(MAX_RADIUS_KM, currentRadius + DEFAULT_RADIUS_INCREMENT_KM);

    // Execute controlled radius expansion reusing existing broadcast service (locks bloodrequests FOR UPDATE)
    const broadcastResult = await triggerEmergencyBroadcast({
        requestId: request.requestid,
        triggeredByUserId: request.createdbyuserid,
        triggerType: "RADIUS_EXPANSION",
        triggerReason: `Automatic follow-up escalation: search radius expanded from ${currentRadius} km to ${nextRadius} km`,
        radiusKm: nextRadius,
        expandRadius: true,
        isWorkerEscalation: true,
    });

    if (!broadcastResult.success) {
        if (
            broadcastResult.terminal ||
            /already (cancelled|fulfilled|expired)/i.test(broadcastResult.message || "")
        ) {
            await updateJobIfProcessing(job.jobid, {
                status: "CANCELLED",
                lasterror: broadcastResult.message,
                lockeduntil: null,
                lockedby: null,
                updatedat: new Date(),
            });
            return {
                status: "CANCELLED",
                details: broadcastResult.message || "Request entered terminal state.",
            };
        }
        // Transient broadcast failure: do NOT advance radius, do NOT notify user, do NOT mark job COMPLETED.
        throw new Error(broadcastResult.message || `Radius expansion broadcast failed for request ${request.requestid}`);
    }

    // If this radius band was already active, complete idempotently without duplicate alerts
    if (broadcastResult.alreadyActive) {
        const marked = await updateJobIfProcessing(job.jobid, {
            status: "COMPLETED",
            completedat: new Date(),
            lasterror: null,
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });

        return {
            status: marked ? "COMPLETED" : "CANCELLED",
            details: marked
                ? `Active emergency broadcast already ongoing for ${broadcastResult.radiusKm} km radius. No redundant expansion created.`
                : "Job was cancelled concurrently.",
        };
    }

    // Re-check request status and conditionally mark current job COMPLETED BEFORE sending notifications or scheduling next job
    const postBroadcastReq = await prisma.bloodrequests.findUnique({
        where: { requestid: request.requestid },
        select: { status: true },
    });
    if (!postBroadcastReq || ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"].includes(postBroadcastReq.status || "")) {
        await updateJobIfProcessing(job.jobid, {
            status: "CANCELLED",
            lasterror: `Request transitioned to ${postBroadcastReq?.status || "MISSING"} during broadcast`,
            lockeduntil: null,
            lockedby: null,
            updatedat: new Date(),
        });
        return {
            status: "CANCELLED",
            details: `Request transitioned to ${postBroadcastReq?.status || "MISSING"}; notifications skipped.`,
        };
    }

    const markedCompleted = await updateJobIfProcessing(job.jobid, {
        status: "COMPLETED",
        completedat: new Date(),
        lasterror: null,
        lockeduntil: null,
        lockedby: null,
        updatedat: new Date(),
    });

    if (!markedCompleted) {
        return {
            status: "CANCELLED",
            details: "Job was cancelled concurrently; notifications and follow-up scheduling skipped.",
        };
    }

    // Send in-app notifications only after job completion is committed and request is confirmed active
    await createNotificationSafely({
        userId: request.createdbyuserid,
        requestId: request.requestid,
        type: notification_type.REQUEST,
        title: "Emergency Radius Expanded",
        message: `Search radius for ${request.bloodgroup} (${request.bloodcomponent || "Whole Blood"}) was automatically expanded from ${currentRadius} km to ${nextRadius} km (${broadcastResult.totalNotified} new donor(s) notified).`,
    });

    if (request.hospitals?.userid && request.hospitals.userid !== request.createdbyuserid) {
        await createNotificationSafely({
            userId: request.hospitals.userid,
            requestId: request.requestid,
            type: notification_type.REQUEST,
            title: "Emergency Radius Expanded",
            message: `Search radius for ${request.bloodgroup} (${request.bloodcomponent || "Whole Blood"}) was automatically expanded to ${nextRadius} km.`,
        });
    }

    // Schedule NEXT follow-up if still below max radius or for one final check at 100km
    const nextDueTime = new Date(Date.now() + DEFAULT_FOLLOWUP_DELAY_MINUTES * 60 * 1000);
    const deadline = request.requiredby ? new Date(request.requiredby).getTime() : Infinity;

    if (nextDueTime.getTime() < deadline) {
        const nextIdempotencyKey = `followup_${request.requestid}_rad${nextRadius}`;
        await scheduleEmergencyFollowUp({
            requestId: request.requestid,
            delayMinutes: DEFAULT_FOLLOWUP_DELAY_MINUTES,
            idempotencyKey: nextIdempotencyKey,
        }).catch((err) => {
            console.error("Failed to schedule subsequent follow-up job:", sanitizeErrorMessage(err?.message));
        });
    }

    return {
        status: "EXPANDED",
        details: `Radius expanded to ${nextRadius} km. Notified ${broadcastResult.totalNotified} newly eligible donor(s).`,
    };
}

/**
 * Processes a claimed job with error handling and bounded exponential backoff retries.
 */
export async function processJob(job: ClaimedSchedulerJob) {
    try {
        const result = await executeFollowUpJob(job);
        console.log(`[EmergencyScheduler] Job ${job.jobid} (${job.requestid}) outcome: ${result.status} - ${result.details}`);
        return result;
    } catch (err: any) {
        const errorMsg = sanitizeErrorMessage(err?.message || "Execution error");
        console.error(`[EmergencyScheduler] Error processing job ${job.jobid}:`, errorMsg);

        const currentAttempts = job.attemptcount || 1;
        const maxAttempts = job.maxattempts || MAX_JOB_ATTEMPTS;

        const latestReq = typeof prisma.bloodrequests?.findUnique === "function"
            ? await prisma.bloodrequests.findUnique({
                where: { requestid: job.requestid },
                select: { status: true },
            })
            : null;

        if (latestReq && ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"].includes(latestReq.status || "")) {
            await updateJobIfProcessing(job.jobid, {
                status: "CANCELLED",
                lockeduntil: null,
                lockedby: null,
                lasterror: `Request transitioned to ${latestReq.status}; retry skipped`,
                updatedat: new Date(),
            });
        } else if (currentAttempts < maxAttempts) {
            // Exponential backoff: min(300s, 2^attempt * 15s)
            const delaySeconds = Math.min(300, Math.pow(2, currentAttempts) * 15);
            const nextRetry = new Date(Date.now() + delaySeconds * 1000);

            await updateJobIfProcessing(job.jobid, {
                status: "PENDING",
                scheduledfor: nextRetry,
                lockeduntil: null,
                lockedby: null,
                lasterror: `Attempt ${currentAttempts} failed: ${errorMsg}. Retrying in ${delaySeconds}s`,
                updatedat: new Date(),
            });
        } else {
            // Retries exhausted
            await updateJobIfProcessing(job.jobid, {
                status: "FAILED",
                lockeduntil: null,
                lockedby: null,
                lasterror: `Exhausted ${maxAttempts} attempts. Final error: ${errorMsg}`,
                updatedat: new Date(),
            });
        }
        throw err;
    }
}

/**
 * Scans for due jobs and processes them in order.
 * Recovers abandoned jobs before claiming.
 */
export async function processDueJobs(workerId = `worker_${process.pid}_${Math.random().toString(36).slice(2, 7)}`, maxJobs = 10): Promise<number> {
    // 1. Recover abandoned jobs from previous crashes
    await recoverAbandonedJobs().catch((err) => {
        console.error("[EmergencyScheduler] Error recovering abandoned jobs:", sanitizeErrorMessage(err?.message));
    });

    let processedCount = 0;
    while (processedCount < maxJobs) {
        const job = await claimNextDueJob(workerId);
        if (!job) {
            break; // No more due jobs available to claim
        }

        try {
            await processJob(job);
            processedCount++;
        } catch {
            // Error recorded and backoff scheduled in processJob
            processedCount++;
        }
    }

    return processedCount;
}

// Background Worker state
let workerIntervalHandle: NodeJS.Timeout | null = null;
let isWorkerRunning = false;
let isSweepRunning = false;

/**
 * Starts the background emergency scheduler worker.
 * Runs locally or in production as part of server startup or standalone background process.
 */
export function startEmergencySchedulerWorker(pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, workerId = `worker_${process.pid}`) {
    if (isWorkerRunning) {
        console.log("[EmergencyScheduler] Worker already running.");
        return;
    }

    isWorkerRunning = true;
    console.log(`[EmergencyScheduler] Starting background worker [${workerId}], polling every ${pollIntervalMs}ms...`);

    const runSweep = () => {
        if (isSweepRunning) return;
        isSweepRunning = true;
        processDueJobs(workerId)
            .catch((err) => {
                console.error("[EmergencyScheduler] Error during scheduled job processing:", sanitizeErrorMessage(err?.message));
            })
            .finally(() => {
                isSweepRunning = false;
            });
    };

    // Run an initial sweep immediately
    runSweep();

    workerIntervalHandle = setInterval(runSweep, pollIntervalMs);

    // Ensure interval doesn't hold open test runners if unref'd
    if (workerIntervalHandle.unref) {
        workerIntervalHandle.unref();
    }
}

/**
 * Gracefully stops the background worker.
 */
export function stopEmergencySchedulerWorker() {
    if (workerIntervalHandle) {
        clearInterval(workerIntervalHandle);
        workerIntervalHandle = null;
    }
    isWorkerRunning = false;
    console.log("[EmergencyScheduler] Worker stopped.");
}
