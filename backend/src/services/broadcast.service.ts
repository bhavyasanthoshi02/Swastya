import { prisma } from "../config/prisma";
import { blood_group, blood_component, notification_type } from "../generated/prisma/client";
import { evaluateLocationDistance, calculateHaversineDistanceKm } from "../utils/distance";
import { getCompatibleDonorBloodGroups as resolveCompatibleDonorGroups } from "../utils/bloodCompatibility";

// Re-export for backward-compatibility with existing callers
export function getCompatibleDonorBloodGroups(
    recipientGroup: blood_group,
    component?: blood_component | string | null
): blood_group[] {
    return resolveCompatibleDonorGroups(recipientGroup, component);
}

export interface TriggerBroadcastOptions {
    requestId: string;
    triggeredByUserId: string;
    triggerType: "REQUEST_CREATION" | "MANUAL_TRIGGER" | "RADIUS_EXPANSION" | "STATUS_UPDATE";
    triggerReason?: string;
    radiusKm?: number;
    expandRadius?: boolean;
}

export interface BroadcastResult {
    success: boolean;
    message: string;
    broadcastId?: string;
    radiusKm?: number;
    totalMatched: number;
    totalNotified: number;
    alreadyActive?: boolean;
    isExisting?: boolean;
}

/**
 * Executes or resumes an emergency broadcast for a blood request
 */
export async function triggerEmergencyBroadcast(options: TriggerBroadcastOptions): Promise<BroadcastResult> {
    const { requestId, triggeredByUserId, triggerType, triggerReason, radiusKm, expandRadius } = options;

    // 1. Fetch request details
    const request = await prisma.bloodrequests.findUnique({
        where: { requestid: requestId },
        include: {
            hospitals: true,
            requesters: true,
        },
    });

    if (!request) {
        return { success: false, message: "Blood request not found", totalMatched: 0, totalNotified: 0 };
    }

    // Clinical Safety Rule: Do not broadcast inactive, terminal, or arranged requests
    const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED"];
    if (terminalStatuses.includes(request.status || "")) {
        return {
            success: false,
            message: `Cannot broadcast a blood requisition that is already ${String(request.status).toLowerCase()}`,
            totalMatched: 0,
            totalNotified: 0,
        };
    }

    // Non-emergency check on creation: skip if not marked emergency or critical
    const isEmergency = Boolean(request.isemergency) || request.urgencylevel === "CRITICAL";
    if (!isEmergency && triggerType === "REQUEST_CREATION") {
        return {
            success: false,
            message: "Request is not marked as emergency or critical. Ordinary requests do not trigger emergency broadcast.",
            totalMatched: 0,
            totalNotified: 0,
        };
    }

    // Resolve search radius (capped between 1 and 100 km)
    let effectiveRadius = radiusKm ?? (request.searchradius || 15);
    effectiveRadius = Math.max(1, Math.min(100, effectiveRadius));

    // 2. Concurrency & Deduplication check:
    // If not expanding radius, check if an ACTIVE broadcast was created recently (within last 10 minutes)
    if (!expandRadius) {
        const recentActiveBroadcast = await prisma.emergencybroadcasts.findFirst({
            where: {
                requestid: requestId,
                status: "ACTIVE",
                createdat: {
                    gte: new Date(Date.now() - 10 * 60 * 1000),
                },
            },
            orderBy: { createdat: "desc" },
        });

        if (recentActiveBroadcast) {
            return {
                success: true,
                message: "An active emergency broadcast is already ongoing for this requisition.",
                broadcastId: recentActiveBroadcast.broadcastid,
                radiusKm: recentActiveBroadcast.radiuskm,
                totalMatched: recentActiveBroadcast.totalmatched,
                totalNotified: recentActiveBroadcast.totalnotified,
                alreadyActive: true,
                isExisting: true,
            };
        }
    }

    // 3. Find compatible and eligible donors using Component-Aware Compatibility rules
    const compatibleDonorGroups = resolveCompatibleDonorGroups(request.bloodgroup, request.bloodcomponent);

    if (compatibleDonorGroups.length === 0) {
        return {
            success: false,
            message: `Unsupported or invalid blood component: ${request.bloodcomponent}`,
            totalMatched: 0,
            totalNotified: 0,
        };
    }

    // Resolve request coordinates and location
    const reqLat = request.latitude ? Number(request.latitude) : null;
    const reqLng = request.longitude ? Number(request.longitude) : null;
    const requestCity = (request.hospitals?.city || request.requesters?.city || "").trim().toLowerCase();
    const hospitalName = request.hospitals?.hospitalname || "Emergency Medical Center";

    // Query all active donors matching component-aware ABO/Rh groups
    const candidateDonors = await prisma.donors.findMany({
        where: {
            bloodgroup: { in: compatibleDonorGroups },
            availabilitystatus: "AVAILABLE",
            iseligible: true,
            users: {
                isactive: true,
            },
        },
        include: {
            users: {
                select: {
                    userid: true,
                    name: true,
                    email: true,
                    phonenumber: true,
                },
            },
        },
    });

    // Existing successfully notified donor IDs for this request across ALL previous broadcasts
    // Note: Donors whose delivery failed previously are eligible for retry in this broadcast
    const previouslyNotifiedDeliveries = await prisma.broadcastdeliveries.findMany({
        where: {
            requestid: requestId,
            deliverystatus: { in: ["DELIVERED", "RESPONDED"] },
        },
        select: { donorid: true },
    });
    const previouslyNotifiedDonorIds = new Set(previouslyNotifiedDeliveries.map((d) => d.donorid));

    // Filter by cooldown (90 days) and location
    const matchedDonors: Array<{
        donor: typeof candidateDonors[0];
        matchType: "COORDINATES" | "CITY_FALLBACK";
        distanceKm: number | null;
        distanceDisplay: string;
    }> = [];

    const now = Date.now();
    for (const d of candidateDonors) {
        // Cooldown interval check
        if (d.lastdonationdate) {
            const daysSince = Math.floor((now - new Date(d.lastdonationdate).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince < 90) {
                continue; // In 90-day cooldown
            }
        }

        // Location evaluation
        const donorLat = d.latitude ? Number(d.latitude) : null;
        const donorLng = d.longitude ? Number(d.longitude) : null;

        const locEval = evaluateLocationDistance(donorLat, donorLng, reqLat, reqLng, effectiveRadius);

        if (locEval.hasCoordinates && locEval.locationMatch === "COORDINATES") {
            if (locEval.isWithinRadius) {
                matchedDonors.push({
                    donor: d,
                    matchType: "COORDINATES",
                    distanceKm: locEval.distanceKm,
                    distanceDisplay: locEval.distanceDisplay,
                });
            }
        } else {
            // Coordinate fallback: City match
            const donorCity = (d.city || "").trim().toLowerCase();
            if (donorCity && requestCity && donorCity === requestCity) {
                matchedDonors.push({
                    donor: d,
                    matchType: "CITY_FALLBACK",
                    distanceKm: null,
                    distanceDisplay: `City Match (${d.city})`,
                });
            }
        }
    }

    // Filter out donors who were already successfully delivered or responded
    const newDonorsToNotify = matchedDonors.filter((m) => !previouslyNotifiedDonorIds.has(m.donor.donorid));

    // 4. Create Durable Broadcast Record
    const broadcast = await prisma.emergencybroadcasts.create({
        data: {
            requestid: requestId,
            triggeredbyuserid: triggeredByUserId,
            triggertype: triggerType,
            triggerreason: triggerReason || `Emergency broadcast (${effectiveRadius} km search radius)`,
            radiuskm: effectiveRadius,
            status: "ACTIVE",
            totalmatched: matchedDonors.length,
            totalnotified: 0,
            totalresponded: 0,
        },
    });

    let notifiedCount = 0;

    // 5. Deliver Notifications with Transaction Isolation & Durable Failure Logging
    for (const item of newDonorsToNotify) {
        const donor = item.donor;
        try {
            // Formulate secure in-app notification without sensitive patient or raw coordinate data
            const distanceText =
                item.matchType === "COORDINATES" && item.distanceKm !== null
                    ? `~${item.distanceKm.toFixed(1)} km away`
                    : `City Match: ${donor.city || "Local area"}`;

            const requiredByFormatted = request.requiredby
                ? new Date(request.requiredby).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                  })
                : "Immediate";

            const notificationMessage = `EMERGENCY ALERT: Urgent need for ${request.bloodgroup} (${request.bloodcomponent || "Whole Blood"}), ${request.unitsrequired} unit(s). Urgency: ${request.urgencylevel}.\nFacility: ${hospitalName} (${distanceText}). Required by: ${requiredByFormatted}.\nPlease respond immediately if available to donate.`;

            // Atomic unit: in-app notification creation + DELIVERED broadcast delivery record
            await prisma.$transaction(async (tx) => {
                const notif = await tx.notification.create({
                    data: {
                        userid: donor.userid,
                        requestid: requestId,
                        type: notification_type.REQUEST,
                        title: "EMERGENCY: Urgent Blood Requisition",
                        message: notificationMessage,
                        isread: false,
                    },
                });

                await tx.broadcastdeliveries.create({
                    data: {
                        broadcastid: broadcast.broadcastid,
                        requestid: requestId,
                        donorid: donor.donorid,
                        donoruserid: donor.userid,
                        matchtype: item.matchType,
                        distancekm: item.distanceKm !== null ? item.distanceKm : undefined,
                        deliverystatus: "DELIVERED",
                        notificationid: notif.notificationid,
                        attemptcount: 1,
                    },
                });
            });

            notifiedCount++;
        } catch (deliverError: any) {
            console.error(`Failed to deliver notification to donor ${donor.donorid}:`, deliverError);

            // Per-donor transaction aborted cleanly and rolled back.
            // Persist failed delivery record in an independent query so PostgreSQL error 25P02 is completely avoided.
            try {
                await prisma.broadcastdeliveries.create({
                    data: {
                        broadcastid: broadcast.broadcastid,
                        requestid: requestId,
                        donorid: donor.donorid,
                        donoruserid: donor.userid,
                        matchtype: item.matchType,
                        distancekm: item.distanceKm !== null ? item.distanceKm : undefined,
                        deliverystatus: "FAILED",
                        failuremessage: deliverError?.message || "In-app notification delivery error",
                        attemptcount: 1,
                    },
                });
            } catch (recordError: any) {
                console.error(`Failed to record delivery failure for donor ${donor.donorid}:`, recordError);
            }
        }
    }

    // 6. Update total notified on the broadcast record
    const updatedBroadcast = await prisma.emergencybroadcasts.update({
        where: { broadcastid: broadcast.broadcastid },
        data: {
            totalnotified: notifiedCount,
        },
    });

    return {
        success: true,
        message: `Emergency broadcast initiated successfully. ${updatedBroadcast.totalnotified} donor(s) notified.`,
        broadcastId: updatedBroadcast.broadcastid,
        radiusKm: updatedBroadcast.radiuskm,
        totalMatched: updatedBroadcast.totalmatched,
        totalNotified: updatedBroadcast.totalnotified,
    };
}

/**
 * Resolves current emergency broadcast status, cumulative request-level metrics,
 * and authorized delivery records for a blood requisition.
 */
export async function getRequestBroadcastStatus(requestId: string) {
    const broadcasts = await prisma.emergencybroadcasts.findMany({
        where: { requestid: requestId },
        orderBy: { createdat: "desc" },
        include: {
            users: {
                select: {
                    name: true,
                    role: true,
                },
            },
        },
    });

    if (broadcasts.length === 0) {
        return null;
    }

    const latest = broadcasts[0];

    // Fetch delivery records across ALL broadcasts for this request to calculate true cumulative metrics
    const allDeliveries = await prisma.broadcastdeliveries.findMany({
        where: { requestid: requestId },
        orderBy: { createdat: "desc" },
        include: {
            donors: {
                select: {
                    donorid: true,
                    bloodgroup: true,
                    city: true,
                    state: true,
                },
            },
        },
    });

    // Cumulative unique notified donors (delivered or responded)
    const uniqueNotifiedDonorIds = new Set(
        allDeliveries
            .filter((d) => d.deliverystatus === "DELIVERED" || d.deliverystatus === "RESPONDED")
            .map((d) => d.donorid)
    );

    // Cumulative unique responding donors
    const uniqueRespondedDonorIds = new Set(
        allDeliveries
            .filter((d) => d.deliverystatus === "RESPONDED" || d.respondedat !== null)
            .map((d) => d.donorid)
    );

    const totalDeliveryAttempts = allDeliveries.length;
    const failedDeliveryAttempts = allDeliveries.filter((d) => d.deliverystatus === "FAILED").length;
    const successfulDeliveries = uniqueNotifiedDonorIds.size;

    // Largest matched pool across all broadcast iterations (e.g. radius expansion stages)
    const cumulativeMatched = Math.max(...broadcasts.map((b) => b.totalmatched || 0), 0);

    // Delivery records sanitized to scrub sensitive coordinates and donor phone/email
    const sanitizedDeliveries = allDeliveries.map((d) => ({
        deliveryid: d.deliveryid,
        broadcastid: d.broadcastid,
        donorid: d.donorid,
        bloodgroup: d.donors.bloodgroup,
        city: d.donors.city,
        matchtype: d.matchtype,
        distancekm: d.distancekm ? Number(d.distancekm) : null,
        deliverystatus: d.deliverystatus,
        attemptcount: d.attemptcount,
        failuremessage: d.failuremessage || null,
        response: d.response,
        respondedat: d.respondedat,
        transitstatus: d.transitstatus,
        estimatedarrival: d.estimatedarrival,
        createdat: d.createdat,
    }));

    return {
        broadcastid: latest.broadcastid,
        requestid: latest.requestid,
        triggertype: latest.triggertype,
        triggerreason: latest.triggerreason,
        radiuskm: latest.radiuskm,
        status: latest.status,
        // Request-level cumulative totals (displayed on Requester & Hospital cards):
        totalmatched: cumulativeMatched,
        totalnotified: uniqueNotifiedDonorIds.size,
        totalresponded: uniqueRespondedDonorIds.size,
        createdat: latest.createdat,
        updatedat: latest.updatedat,
        triggeredby: latest.users?.name || "System",
        // Granular request-level audit metrics:
        requestMetrics: {
            uniqueMatchedDonors: cumulativeMatched,
            uniqueNotifiedDonors: uniqueNotifiedDonorIds.size,
            uniqueRespondedDonors: uniqueRespondedDonorIds.size,
            totalDeliveryAttempts,
            successfulDeliveries,
            failedDeliveries: failedDeliveryAttempts,
        },
        // Latest broadcast specific metrics (per-broadcast metrics for audit):
        latestBroadcastMetrics: {
            broadcastid: latest.broadcastid,
            totalmatched: latest.totalmatched,
            totalnotified: latest.totalnotified,
            totalresponded: latest.totalresponded,
            radiuskm: latest.radiuskm,
        },
        deliveries: sanitizedDeliveries,
        // Per-broadcast audit history
        broadcastHistory: broadcasts.map((b) => ({
            broadcastid: b.broadcastid,
            triggertype: b.triggertype,
            triggerreason: b.triggerreason,
            radiuskm: b.radiuskm,
            totalmatched: b.totalmatched,
            totalnotified: b.totalnotified,
            totalresponded: b.totalresponded,
            status: b.status,
            createdat: b.createdat,
        })),
    };
}
