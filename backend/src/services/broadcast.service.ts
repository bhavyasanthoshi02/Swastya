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
    isWorkerEscalation?: boolean;
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
    terminal?: boolean;
    currentStatus?: string;
}

/**
 * Executes or resumes an emergency broadcast for a blood request
 */
export async function triggerEmergencyBroadcast(options: TriggerBroadcastOptions): Promise<BroadcastResult> {
    const { requestId, triggeredByUserId, triggerType, triggerReason, radiusKm, expandRadius } = options;

    return await prisma.$transaction(async (tx) => {
        // 1. Lock bloodrequests row using parameterized SQL to serialize concurrent broadcast triggers per request
        const lockedRows: any[] = await tx.$queryRawUnsafe(
            `SELECT requestid, status, isemergency, urgencylevel, bloodgroup, bloodcomponent, searchradius, latitude, longitude, requiredby, unitsrequired, hospitalid, requesterid FROM bloodrequests WHERE requestid = $1::uuid FOR UPDATE`,
            requestId
        );

        if (!lockedRows || lockedRows.length === 0) {
            return { success: false, message: "Blood request not found", totalMatched: 0, totalNotified: 0 };
        }

        const request = lockedRows[0];

        // Clinical Safety Rule: Do not broadcast inactive, terminal, or arranged requests
        const terminalStatuses = ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"];
        if (terminalStatuses.includes(request.status || "")) {
            return {
                success: false,
                message: `Cannot broadcast a blood requisition that is already ${String(request.status).toLowerCase()}`,
                totalMatched: 0,
                totalNotified: 0,
                terminal: true,
                currentStatus: request.status,
            };
        }

        // A clinically rejected prescription makes all emergency broadcasting unsafe.
        // Lock and recheck prescription status inside the broadcast transaction.
        const lockedRxRows: any[] = await tx.$queryRawUnsafe(
            `SELECT prescriptionid, status FROM prescription WHERE requestid = $1::uuid FOR UPDATE`,
            requestId
        );
        if (lockedRxRows && lockedRxRows.length > 0) {
            const rx = lockedRxRows[0];
            if (rx.status === "REJECTED") {
                return {
                    success: false,
                    message: "Cannot broadcast a blood requisition whose prescription has been rejected.",
                    totalMatched: 0,
                    totalNotified: 0,
                };
            }
        }

        // Clinical Governance: If request has an assigned hospital, require approvalstatus APPROVED
        if (request.hospitalid) {
            const hospRows: any[] = await tx.$queryRawUnsafe(
                `SELECT hospitalid, approvalstatus FROM hospitals WHERE hospitalid = $1::uuid`,
                request.hospitalid
            );
            if (!hospRows || hospRows.length === 0 || hospRows[0].approvalstatus !== "APPROVED") {
                return {
                    success: false,
                    message: "Assigned hospital is not approved to coordinate blood requisitions.",
                    totalMatched: 0,
                    totalNotified: 0,
                };
            }
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

        // 2. Concurrency & Deduplication check under the lock:
        // Prevent repeated manual radius increases from creating duplicate broadcasts during active cooldown (10 minutes)
        // Automatic follow-up worker controls progressive radius expansion
        const isWorker = Boolean(options.isWorkerEscalation) || String(triggerReason || "").startsWith("Automatic follow-up escalation");
        const recentActiveBroadcast = await tx.emergencybroadcasts.findFirst({
            where: {
                requestid: requestId,
                status: { in: ["ACTIVE", "DONOR_RESPONDED"] },
                triggertype: { not: "DIRECT_VOLUNTEER" },
                ...(expandRadius && isWorker ? { radiuskm: { gte: effectiveRadius } } : {}),
                createdat: {
                    gte: new Date(Date.now() - 10 * 60 * 1000),
                },
            },
            orderBy: { createdat: "desc" },
        });

        if (recentActiveBroadcast) {
            // If manual expansion is attempted while cooldown is active, prevent duplicate broadcast
            if (!isWorker || recentActiveBroadcast.radiuskm >= effectiveRadius) {
                if ((request.searchradius || 0) < recentActiveBroadcast.radiuskm) {
                    await tx.bloodrequests.update({
                        where: { requestid: requestId },
                        data: { searchradius: recentActiveBroadcast.radiuskm },
                    });
                }
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

        // Atomically cancel prior active broadcasts before creating an expanded broadcast
        await tx.emergencybroadcasts.updateMany({
            where: {
                requestid: requestId,
                status: { in: ["ACTIVE", "DONOR_RESPONDED"] },
            },
            data: { status: "CANCELLED" },
        });

        // Fetch hospital and requester details for location & notification rendering
        const fullRequest = await tx.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: {
                hospitals: true,
                requesters: true,
            },
        });

        const reqHospital = fullRequest?.hospitals;
        const reqRequester = fullRequest?.requesters;

        // 3. Find compatible and eligible donors using Component-Aware Compatibility rules
        const DB_BLOOD_GROUP_MAP: Record<string, string> = {
            "A+": "A_POSITIVE",
            "A-": "A_NEGATIVE",
            "B+": "B_POSITIVE",
            "B-": "B_NEGATIVE",
            "AB+": "AB_POSITIVE",
            "AB-": "AB_NEGATIVE",
            "O+": "O_POSITIVE",
            "O-": "O_NEGATIVE",
        };
        const normalizedBloodGroup = DB_BLOOD_GROUP_MAP[request.bloodgroup] || request.bloodgroup;
        const compatibleDonorGroups = resolveCompatibleDonorGroups(normalizedBloodGroup, request.bloodcomponent);

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
        const requestCity = (reqHospital?.city || reqRequester?.city || "").trim().toLowerCase();
        const hospitalName = reqHospital?.hospitalname || "Emergency Medical Center";

        // Query all active donors matching component-aware ABO/Rh groups
        const candidateDonors = await tx.donors.findMany({
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
        const previouslyNotifiedDeliveries = await tx.broadcastdeliveries.findMany({
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
        const broadcast = await tx.emergencybroadcasts.create({
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
        const supportsSavepoints = typeof (tx as any).$executeRawUnsafe === "function";

        // 5. Deliver Notifications with PostgreSQL SAVEPOINT Isolation & Durable Failure Logging
        for (let idx = 0; idx < newDonorsToNotify.length; idx++) {
            const item = newDonorsToNotify[idx];
            const donor = item.donor;
            const savepointName = `sp_donor_delivery_${idx}`;

            if (supportsSavepoints) {
                await (tx as any).$executeRawUnsafe(`SAVEPOINT ${savepointName}`);
            }

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

                if (supportsSavepoints) {
                    await (tx as any).$executeRawUnsafe(`RELEASE SAVEPOINT ${savepointName}`);
                }

                notifiedCount++;
            } catch (deliverError: any) {
                console.error(`Failed to deliver notification to donor ${donor.donorid}:`, deliverError);

                if (supportsSavepoints) {
                    // Roll back only this donor's failed sub-operation so PostgreSQL exits 25P02 aborted state
                    await (tx as any).$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                    await (tx as any).$executeRawUnsafe(`RELEASE SAVEPOINT ${savepointName}`);
                }

                const failSavepoint = `${savepointName}_fail`;
                if (supportsSavepoints) {
                    await (tx as any).$executeRawUnsafe(`SAVEPOINT ${failSavepoint}`);
                }
                try {
                    await tx.broadcastdeliveries.create({
                        data: {
                            broadcastid: broadcast.broadcastid,
                            requestid: requestId,
                            donorid: donor.donorid,
                            donoruserid: donor.userid,
                            matchtype: item.matchType,
                            distancekm: item.distanceKm !== null ? item.distanceKm : undefined,
                            deliverystatus: "FAILED",
                            failuremessage: "NOTIFICATION_DELIVERY_FAILED",
                            attemptcount: 1,
                        },
                    });
                    if (supportsSavepoints) {
                        await (tx as any).$executeRawUnsafe(`RELEASE SAVEPOINT ${failSavepoint}`);
                    }
                } catch (recordError: any) {
                    if (supportsSavepoints) {
                        await (tx as any).$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${failSavepoint}`);
                        await (tx as any).$executeRawUnsafe(`RELEASE SAVEPOINT ${failSavepoint}`);
                    }
                    console.error(`Failed to record delivery failure for donor ${donor.donorid}:`, recordError);
                }
            }
        }

        // 6. Update total notified on the broadcast record
        const updatedBroadcast = await tx.emergencybroadcasts.update({
            where: { broadcastid: broadcast.broadcastid },
            data: {
                totalnotified: notifiedCount,
            },
        });

        // 7. Persist the new search radius on the request row ONLY after broadcast succeeds, inside the transaction
        if (expandRadius || effectiveRadius > (request.searchradius || 0)) {
            await tx.bloodrequests.update({
                where: { requestid: requestId },
                data: { searchradius: effectiveRadius },
            });
        }

        return {
            success: true,
            message: `Emergency broadcast initiated successfully. ${updatedBroadcast.totalnotified} donor(s) notified.`,
            broadcastId: updatedBroadcast.broadcastid,
            radiusKm: updatedBroadcast.radiuskm,
            totalMatched: updatedBroadcast.totalmatched,
            totalNotified: updatedBroadcast.totalnotified,
        };
    });
}

/**
 * Resolves current emergency broadcast status, cumulative request-level metrics,
 * and authorized delivery records for a blood requisition.
 */
export async function getRequestBroadcastStatus(requestId: string) {
    // Only query genuine emergency broadcasts (exclude internal direct-volunteer containers)
    const broadcasts = await prisma.emergencybroadcasts.findMany({
        where: {
            requestid: requestId,
            triggertype: { not: "DIRECT_VOLUNTEER" },
        },
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
    const genuineBroadcastIds = broadcasts.map((b) => b.broadcastid);

    // Fetch delivery records across genuine broadcasts for this request to calculate true cumulative metrics
    const allDeliveries = await prisma.broadcastdeliveries.findMany({
        where: {
            requestid: requestId,
            broadcastid: { in: genuineBroadcastIds },
        },
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
        failuremessage: d.failuremessage ? (["NOTIFICATION_DELIVERY_FAILED", "RETRY_EXHAUSTED"].includes(d.failuremessage) ? d.failuremessage : "NOTIFICATION_DELIVERY_FAILED") : null,
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
