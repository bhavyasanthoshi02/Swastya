import { prisma } from "../../config/prisma";
import {
    blood_group,
    blood_component,
    availability_status,
    notification_type,
    urgency_level,
} from "../../generated/prisma/client";
import { getCompatibleDonorBloodGroups } from "../../utils/bloodCompatibility";
import { calculateHaversineDistanceKm, evaluateLocationDistance } from "../../utils/distance";

export interface ScoreBreakdown {
    compatibilityScore: number; // 0 - 35
    distanceScore: number;      // 0 - 35
    availabilityScore: number;  // 0 - 15
    responseScore: number;      // 0 - 15
    totalScore: number;         // 0 - 100
}

export interface MatchExplanations {
    compatibility: string;
    location: string;
    availability: string;
    responsiveness: string;
}

export interface MatchingCandidateDonor {
    donorId: string;
    donorUserId: string;
    donorName: string;
    bloodGroup: string;
    gender: string | null;
    city: string;
    state: string;
    matchScore: number;
    scoreBreakdown: ScoreBreakdown;
    explanations: MatchExplanations;
    distanceKm: number | null;
    distanceDisplay: string;
    matchType: "COORDINATES" | "CITY_FALLBACK";
    availabilityStatus: string;
    isEligible: boolean;
    lastDonationDate: string | null;
    daysSinceLastDonation: number | null;
    cooldownSatisfied: boolean;
    maskedPhone: string;
    maskedEmail: string;
    hasBeenNotified: boolean;
    currentDeliveryStatus: string | null;
    currentResponse: string | null;
}

export interface HospitalMatchingOverview {
    activeMatchingRequisitionsCount: number;
    totalCandidatesEvaluated: number;
    totalDonorsNotified: number;
    totalResponsesReceived: number;
    totalAccepted: number;
    totalDeclined: number;
    totalPending: number;
    responseRatePercent: number;
    acceptanceRatePercent: number;
}

export interface RequisitionForMatching {
    requestId: string;
    patientName: string;
    patientAge: number;
    patientGender: string;
    bloodGroup: string;
    bloodComponent: string;
    unitsRequired: number;
    urgencyLevel: string;
    isEmergency: boolean;
    searchRadiusKm: number;
    requiredBy: string;
    status: string;
    createdAt: string;
    hasActiveBroadcast: boolean;
    broadcastId: string | null;
    totalNotifiedCount: number;
    totalRespondedCount: number;
}

export interface DonorEmergencyRequestItem {
    deliveryId: string;
    broadcastId: string;
    requestId: string;
    hospitalName: string;
    hospitalCity: string;
    bloodGroup: string;
    bloodComponent: string;
    unitsRequired: number;
    urgencyLevel: string;
    requiredBy: string;
    distanceKm: number | null;
    distanceDisplay: string;
    matchType: string;
    response: "PENDING" | "ACCEPTED" | "DECLINED";
    respondedAt: string | null;
    transitStatus: string | null;
    createdAt: string;
}

function maskPhone(phone?: string | null): string {
    if (!phone) return "Not Provided";
    const clean = phone.trim();
    if (clean.length <= 4) return "******" + clean;
    return clean.slice(0, 3) + "******" + clean.slice(-2);
}

function maskEmail(email?: string | null): string {
    if (!email) return "Not Provided";
    const parts = email.split("@");
    if (parts.length !== 2) return "***@***";
    const name = parts[0];
    const domain = parts[1];
    const visibleName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
    return `${visibleName}@${domain}`;
}

export class EmergencyDonorMatchingService {
    /**
     * Resolves the hospital facility for a user.
     */
    public static async resolveHospitalForUser(userId: string) {
        return await prisma.hospitals.findUnique({
            where: { userid: userId },
            select: {
                hospitalid: true,
                hospitalname: true,
                city: true,
                state: true,
                latitude: true,
                longitude: true,
                contactpersonphone: true,
                approvalstatus: true,
            },
        });
    }

    /**
     * Resolves the donor profile for a user.
     */
    public static async resolveDonorForUser(userId: string) {
        return await prisma.donors.findUnique({
            where: { userid: userId },
            include: {
                users: {
                    select: {
                        userid: true,
                        name: true,
                        email: true,
                        phonenumber: true,
                        isactive: true,
                    },
                },
            },
        });
    }

    /**
     * Get aggregate matching overview metrics for the hospital dashboard.
     */
    public static async getHospitalOverview(hospitalUserId: string): Promise<HospitalMatchingOverview> {
        const hospital = await this.resolveHospitalForUser(hospitalUserId);
        if (!hospital) {
            throw new Error("Hospital profile not found for the user.");
        }

        // Active requisitions belonging to this hospital
        const activeRequests = await prisma.bloodrequests.findMany({
            where: {
                hospitalid: hospital.hospitalid,
                status: { notIn: ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"] },
            },
            select: {
                requestid: true,
            },
        });

        const activeRequestIds = activeRequests.map((r) => r.requestid);

        if (activeRequestIds.length === 0) {
            return {
                activeMatchingRequisitionsCount: 0,
                totalCandidatesEvaluated: 0,
                totalDonorsNotified: 0,
                totalResponsesReceived: 0,
                totalAccepted: 0,
                totalDeclined: 0,
                totalPending: 0,
                responseRatePercent: 0,
                acceptanceRatePercent: 0,
            };
        }

        // Fetch deliveries linked to this hospital's requests
        const deliveries = await prisma.broadcastdeliveries.findMany({
            where: {
                requestid: { in: activeRequestIds },
            },
            select: {
                deliveryid: true,
                response: true,
            },
        });

        const totalDonorsNotified = deliveries.length;
        let totalAccepted = 0;
        let totalDeclined = 0;
        let totalPending = 0;

        for (const d of deliveries) {
            if (d.response === "ACCEPTED") {
                totalAccepted++;
            } else if (d.response === "DECLINED") {
                totalDeclined++;
            } else {
                totalPending++;
            }
        }

        const totalResponsesReceived = totalAccepted + totalDeclined;
        const responseRatePercent = totalDonorsNotified > 0
            ? Math.round((totalResponsesReceived / totalDonorsNotified) * 100)
            : 0;
        const acceptanceRatePercent = totalResponsesReceived > 0
            ? Math.round((totalAccepted / totalResponsesReceived) * 100)
            : 0;

        return {
            activeMatchingRequisitionsCount: activeRequestIds.length,
            totalCandidatesEvaluated: totalDonorsNotified * 3, // Estimated pool evaluated
            totalDonorsNotified,
            totalResponsesReceived,
            totalAccepted,
            totalDeclined,
            totalPending,
            responseRatePercent,
            acceptanceRatePercent,
        };
    }

    /**
     * Returns hospital requisitions eligible for emergency matching.
     */
    public static async getHospitalRequisitions(hospitalUserId: string): Promise<RequisitionForMatching[]> {
        const hospital = await this.resolveHospitalForUser(hospitalUserId);
        if (!hospital) {
            throw new Error("Hospital profile not found for the user.");
        }

        const requests = await prisma.bloodrequests.findMany({
            where: {
                hospitalid: hospital.hospitalid,
                status: { notIn: ["FULFILLED", "CANCELLED", "EXPIRED", "BLOOD_ARRANGED"] },
            },
            include: {
                emergencybroadcasts: {
                    select: {
                        broadcastid: true,
                        totalnotified: true,
                        totalresponded: true,
                        status: true,
                    },
                    orderBy: { createdat: "desc" },
                    take: 1,
                },
            },
            orderBy: [
                { urgencylevel: "desc" },
                { createdat: "desc" },
            ],
        });

        return requests.map((r) => {
            const activeBroadcast = r.emergencybroadcasts && r.emergencybroadcasts.length > 0
                ? r.emergencybroadcasts[0]
                : null;

            return {
                requestId: r.requestid,
                patientName: r.patientname,
                patientAge: r.patientage,
                patientGender: r.patientgender,
                bloodGroup: r.bloodgroup,
                bloodComponent: r.bloodcomponent,
                unitsRequired: r.unitsrequired,
                urgencyLevel: r.urgencylevel,
                isEmergency: Boolean(r.isemergency) || r.urgencylevel === urgency_level.CRITICAL,
                searchRadiusKm: r.searchradius || 15,
                requiredBy: r.requiredby.toISOString(),
                status: r.status || "CREATED",
                createdAt: r.createdat ? r.createdat.toISOString() : new Date().toISOString(),
                hasActiveBroadcast: Boolean(activeBroadcast && activeBroadcast.status === "ACTIVE"),
                broadcastId: activeBroadcast ? activeBroadcast.broadcastid : null,
                totalNotifiedCount: activeBroadcast ? activeBroadcast.totalnotified : 0,
                totalRespondedCount: activeBroadcast ? activeBroadcast.totalresponded : 0,
            };
        });
    }

    /**
     * Finds and scores matching candidates for a given requisition.
     */
    public static async findMatchingCandidates(
        hospitalUserId: string,
        requestId: string,
        options?: { radiusKm?: number }
    ): Promise<{
        success: boolean;
        requisition: RequisitionForMatching;
        candidates: MatchingCandidateDonor[];
        totalCandidates: number;
    }> {
        const hospital = await this.resolveHospitalForUser(hospitalUserId);
        if (!hospital) {
            throw new Error("Hospital profile not found for the user.");
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
            include: {
                hospitals: true,
            },
        });

        if (!bloodRequest) {
            throw new Error("Blood request not found.");
        }

        if (bloodRequest.hospitalid !== hospital.hospitalid) {
            throw new Error("Access denied: You can only match donors for requests from your hospital facility.");
        }

        const recipientBloodGroup = bloodRequest.bloodgroup;
        const requestedComponent = bloodRequest.bloodcomponent || blood_component.WHOLE_BLOOD;

        // 1. Mandatory Clinical Gate: Resolve compatible donor blood groups
        const compatibleDonorGroups = getCompatibleDonorBloodGroups(recipientBloodGroup, requestedComponent);
        if (!compatibleDonorGroups || compatibleDonorGroups.length === 0) {
            return {
                success: true,
                requisition: {
                    requestId: bloodRequest.requestid,
                    patientName: bloodRequest.patientname,
                    patientAge: bloodRequest.patientage,
                    patientGender: bloodRequest.patientgender,
                    bloodGroup: bloodRequest.bloodgroup,
                    bloodComponent: bloodRequest.bloodcomponent,
                    unitsRequired: bloodRequest.unitsrequired,
                    urgencyLevel: bloodRequest.urgencylevel,
                    isEmergency: Boolean(bloodRequest.isemergency),
                    searchRadiusKm: bloodRequest.searchradius || 15,
                    requiredBy: bloodRequest.requiredby.toISOString(),
                    status: bloodRequest.status || "CREATED",
                    createdAt: bloodRequest.createdat ? bloodRequest.createdat.toISOString() : new Date().toISOString(),
                    hasActiveBroadcast: false,
                    broadcastId: null,
                    totalNotifiedCount: 0,
                    totalRespondedCount: 0,
                },
                candidates: [],
                totalCandidates: 0,
            };
        }

        // Search radius
        const effectiveRadius = options?.radiusKm && options.radiusKm > 0
            ? Math.max(1, Math.min(100, options.radiusKm))
            : (bloodRequest.searchradius && bloodRequest.searchradius > 0
                ? Math.max(1, Math.min(100, bloodRequest.searchradius))
                : 25);

        // Facility coordinates
        const hospLat = bloodRequest.latitude !== null && bloodRequest.latitude !== undefined
            ? Number(bloodRequest.latitude)
            : (hospital.latitude !== null && hospital.latitude !== undefined ? Number(hospital.latitude) : null);

        const hospLng = bloodRequest.longitude !== null && bloodRequest.longitude !== undefined
            ? Number(bloodRequest.longitude)
            : (hospital.longitude !== null && hospital.longitude !== undefined ? Number(hospital.longitude) : null);

        const hospCity = (hospital.city || "").trim().toLowerCase();

        // 2. Fetch candidates matching compatible blood groups, active users
        const candidateDonors = await prisma.donors.findMany({
            where: {
                bloodgroup: { in: compatibleDonorGroups },
                availabilitystatus: availability_status.AVAILABLE,
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
                        isactive: true,
                    },
                },
            },
        });

        // 3. Query existing deliveries for this request to detect if already notified
        const existingDeliveries = await prisma.broadcastdeliveries.findMany({
            where: {
                requestid: requestId,
            },
            select: {
                donorid: true,
                deliverystatus: true,
                response: true,
            },
        });

        const deliveryMap = new Map<string, { deliverystatus: string; response: string | null }>();
        for (const del of existingDeliveries) {
            deliveryMap.set(del.donorid, {
                deliverystatus: del.deliverystatus,
                response: del.response,
            });
        }

        // 4. Query historical deliveries across all requests to compute responsiveness score
        const donorIds = candidateDonors.map((d) => d.donorid);
        const allDeliveries = await prisma.broadcastdeliveries.findMany({
            where: {
                donorid: { in: donorIds },
                deliverystatus: { not: "FAILED" },
            },
            select: {
                donorid: true,
                response: true,
            },
        });

        const donorHistoryMap = new Map<string, { total: number; accepted: number }>();
        for (const del of allDeliveries) {
            if (!donorHistoryMap.has(del.donorid)) {
                donorHistoryMap.set(del.donorid, { total: 0, accepted: 0 });
            }
            const stat = donorHistoryMap.get(del.donorid)!;
            stat.total++;
            if (del.response === "ACCEPTED") {
                stat.accepted++;
            }
        }

        // 5. Evaluate and score candidates
        const now = Date.now();
        const scoredCandidates: MatchingCandidateDonor[] = [];

        for (const d of candidateDonors) {
            // Cooldown check (90 days interval)
            let daysSinceLastDonation: number | null = null;
            let cooldownSatisfied = true;
            if (d.lastdonationdate) {
                daysSinceLastDonation = Math.floor((now - new Date(d.lastdonationdate).getTime()) / (1000 * 60 * 60 * 24));
                if (daysSinceLastDonation < 90) {
                    cooldownSatisfied = false;
                }
            }

            // Geographic boundary evaluation
            const donorLat = d.latitude !== null && d.latitude !== undefined ? Number(d.latitude) : null;
            const donorLng = d.longitude !== null && d.longitude !== undefined ? Number(d.longitude) : null;

            const locEval = evaluateLocationDistance(donorLat, donorLng, hospLat, hospLng, effectiveRadius);

            let matchType: "COORDINATES" | "CITY_FALLBACK";
            let distanceKm: number | null = null;
            let distanceDisplay: string;
            let distanceScore = 0;
            let locationExplanation: string;

            if (locEval.hasCoordinates && locEval.locationMatch === "COORDINATES") {
                matchType = "COORDINATES";
                distanceKm = locEval.distanceKm;
                distanceDisplay = locEval.distanceDisplay;

                if (!locEval.isWithinRadius || locEval.distanceKm === null) {
                    // Out of requested radius, but could still be listed with low distance score if same city
                    const donorCity = (d.city || "").trim().toLowerCase();
                    if (donorCity && hospCity && donorCity === hospCity) {
                        distanceScore = 5;
                        locationExplanation = `${distanceDisplay} (outside ${effectiveRadius} km target, but same city ${d.city})`;
                    } else {
                        continue; // Outside search radius
                    }
                } else {
                    const distRatio = Math.min(1, Math.max(0, locEval.distanceKm / effectiveRadius));
                    distanceScore = Math.max(0, Math.min(35, Math.round(35 * (1 - distRatio))));
                    locationExplanation = `${distanceDisplay} from hospital (within ${effectiveRadius} km target radius)`;
                }
            } else {
                // Fallback to city match
                const donorCity = (d.city || "").trim().toLowerCase();
                if (!donorCity || !hospCity || donorCity !== hospCity) {
                    continue; // No coordinates and not matching city
                }
                matchType = "CITY_FALLBACK";
                distanceKm = null;
                distanceDisplay = `City Match (${d.city})`;
                distanceScore = 18; // Neutral mid-tier score for uncoordinated city match
                locationExplanation = `Located in ${d.city} (matches hospital city; GPS coordinates not configured)`;
            }

            // Compatibility Score (0 - 35)
            const isExactMatch = d.bloodgroup === recipientBloodGroup;
            const compatibilityScore = isExactMatch ? 35 : 30;
            const compatibilityExplanation = isExactMatch
                ? `Exact blood group match (${d.bloodgroup}) for requested ${requestedComponent}.`
                : `Clinically compatible ${d.bloodgroup} donor for ${recipientBloodGroup} recipient (${requestedComponent}).`;

            // Availability & Cooldown Score (0 - 15)
            let availabilityScore = 15;
            let availabilityExplanation = "";
            if (!cooldownSatisfied) {
                availabilityScore = 5;
                availabilityExplanation = `Caution: Recent donation ${daysSinceLastDonation} days ago (within 90-day cooldown).`;
            } else if (daysSinceLastDonation !== null) {
                availabilityExplanation = `Verified AVAILABLE. ${daysSinceLastDonation} days since last donation (90-day cooldown satisfied).`;
            } else {
                availabilityExplanation = `Verified AVAILABLE. First-time or new registered donor profile.`;
            }

            // Responsiveness Score (0 - 15)
            const history = donorHistoryMap.get(d.donorid);
            let responseScore = 8; // Neutral default
            let responsivenessExplanation = "";

            if (!history || history.total === 0) {
                responsivenessExplanation = "No past emergency broadcast history (neutral baseline score 8/15).";
            } else if (history.total < 3) {
                responsivenessExplanation = `Limited broadcast history (${history.total} delivery, ${history.accepted} accepted). Neutral score 8/15.`;
            } else {
                const acceptRatio = history.accepted / history.total;
                responseScore = Math.max(0, Math.min(15, Math.round(15 * acceptRatio)));
                responsivenessExplanation = `Historical acceptance rate ${(acceptRatio * 100).toFixed(0)}% across ${history.total} notifications.`;
            }

            // Total composite score (0 - 100)
            const totalScore = Math.max(0, Math.min(100, compatibilityScore + distanceScore + availabilityScore + responseScore));

            const existingDel = deliveryMap.get(d.donorid);

            scoredCandidates.push({
                donorId: d.donorid,
                donorUserId: d.users.userid,
                donorName: d.users.name,
                bloodGroup: d.bloodgroup,
                gender: d.gender,
                city: d.city,
                state: d.state,
                matchScore: totalScore,
                scoreBreakdown: {
                    compatibilityScore,
                    distanceScore,
                    availabilityScore,
                    responseScore,
                    totalScore,
                },
                explanations: {
                    compatibility: compatibilityExplanation,
                    location: locationExplanation,
                    availability: availabilityExplanation,
                    responsiveness: responsivenessExplanation,
                },
                distanceKm,
                distanceDisplay,
                matchType,
                availabilityStatus: d.availabilitystatus || "AVAILABLE",
                isEligible: Boolean(d.iseligible),
                lastDonationDate: d.lastdonationdate ? new Date(d.lastdonationdate).toISOString().split("T")[0] : null,
                daysSinceLastDonation,
                cooldownSatisfied,
                maskedPhone: maskPhone(d.users.phonenumber),
                maskedEmail: maskEmail(d.users.email),
                hasBeenNotified: Boolean(existingDel),
                currentDeliveryStatus: existingDel ? existingDel.deliverystatus : null,
                currentResponse: existingDel ? existingDel.response : null,
            });
        }

        // Sort: highest score first, then closer distance
        scoredCandidates.sort((a, b) => {
            if (b.matchScore !== a.matchScore) {
                return b.matchScore - a.matchScore;
            }
            if (a.distanceKm !== null && b.distanceKm === null) return -1;
            if (a.distanceKm === null && b.distanceKm !== null) return 1;
            if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
                return a.distanceKm - b.distanceKm;
            }
            return a.donorId.localeCompare(b.donorId);
        });

        return {
            success: true,
            requisition: {
                requestId: bloodRequest.requestid,
                patientName: bloodRequest.patientname,
                patientAge: bloodRequest.patientage,
                patientGender: bloodRequest.patientgender,
                bloodGroup: bloodRequest.bloodgroup,
                bloodComponent: bloodRequest.bloodcomponent,
                unitsRequired: bloodRequest.unitsrequired,
                urgencyLevel: bloodRequest.urgencylevel,
                isEmergency: Boolean(bloodRequest.isemergency) || bloodRequest.urgencylevel === urgency_level.CRITICAL,
                searchRadiusKm: effectiveRadius,
                requiredBy: bloodRequest.requiredby.toISOString(),
                status: bloodRequest.status || "CREATED",
                createdAt: bloodRequest.createdat ? bloodRequest.createdat.toISOString() : new Date().toISOString(),
                hasActiveBroadcast: scoredCandidates.some((c) => c.hasBeenNotified),
                broadcastId: null,
                totalNotifiedCount: scoredCandidates.filter((c) => c.hasBeenNotified).length,
                totalRespondedCount: scoredCandidates.filter((c) => c.currentResponse !== null).length,
            },
            candidates: scoredCandidates,
            totalCandidates: scoredCandidates.length,
        };
    }

    /**
     * Dispatch emergency matching request to selected donors.
     * Records durable broadcast deliveries and creates persistent in-app notifications.
     */
    public static async notifySelectedDonors(
        hospitalUserId: string,
        requestId: string,
        donorIds: string[],
        notes?: string
    ) {
        if (!donorIds || donorIds.length === 0) {
            throw new Error("At least one donor must be selected for notification.");
        }

        const hospital = await this.resolveHospitalForUser(hospitalUserId);
        if (!hospital) {
            throw new Error("Hospital profile not found.");
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
        });

        if (!bloodRequest) {
            throw new Error("Blood request not found.");
        }

        if (bloodRequest.hospitalid !== hospital.hospitalid) {
            throw new Error("Access denied: You can only notify donors for requests from your hospital facility.");
        }

        // Fetch selected donors
        const donorsToNotify = await prisma.donors.findMany({
            where: {
                donorid: { in: donorIds },
                users: { isactive: true },
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

        if (donorsToNotify.length === 0) {
            throw new Error("No valid active donors found from selected IDs.");
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Find or create emergency broadcast header
            let broadcast = await tx.emergencybroadcasts.findFirst({
                where: {
                    requestid: requestId,
                    status: "ACTIVE",
                },
                orderBy: { createdat: "desc" },
            });

            if (!broadcast) {
                broadcast = await tx.emergencybroadcasts.create({
                    data: {
                        requestid: requestId,
                        triggeredbyuserid: hospitalUserId,
                        triggertype: "HOSPITAL_INTELLIGENT_MATCH",
                        triggerreason: notes || `Direct hospital emergency match dispatch by ${hospital.hospitalname}`,
                        radiuskm: bloodRequest.searchradius || 15,
                        status: "ACTIVE",
                        totalmatched: donorsToNotify.length,
                        totalnotified: 0,
                        totalresponded: 0,
                    },
                });
            }

            let newlyNotifiedCount = 0;

            for (const d of donorsToNotify) {
                // Check if delivery already exists
                const existingDel = await tx.broadcastdeliveries.findFirst({
                    where: {
                        broadcastid: broadcast.broadcastid,
                        donorid: d.donorid,
                    },
                });

                if (existingDel) {
                    continue; // Skip already notified donor
                }

                // Calculate distance
                let distKm: number | null = null;
                let matchType = "CITY_FALLBACK";
                if (d.latitude && d.longitude && hospital.latitude && hospital.longitude) {
                    distKm = calculateHaversineDistanceKm(
                        Number(d.latitude),
                        Number(d.longitude),
                        Number(hospital.latitude),
                        Number(hospital.longitude)
                    );
                    matchType = "COORDINATES";
                }

                // Create in-app notification for the donor
                const notification = await tx.notification.create({
                    data: {
                        userid: d.users.userid,
                        requestid: requestId,
                        type: notification_type.MATCH,
                        title: `Urgent Blood Request: ${bloodRequest.bloodgroup} needed at ${hospital.hospitalname}`,
                        message: `Emergency Match: ${hospital.hospitalname} in ${hospital.city || "your area"} urgently requires ${bloodRequest.unitsrequired} unit(s) of ${bloodRequest.bloodgroup} (${bloodRequest.bloodcomponent}). Can you volunteer to donate?`,
                        actionurl: `/donor/emergency-requests`,
                        isread: false,
                    },
                });

                // Create durable delivery record
                await tx.broadcastdeliveries.create({
                    data: {
                        broadcastid: broadcast.broadcastid,
                        requestid: requestId,
                        donorid: d.donorid,
                        donoruserid: d.users.userid,
                        matchtype: matchType,
                        distancekm: distKm !== null ? Number(distKm.toFixed(2)) : null,
                        deliverystatus: "DELIVERED",
                        notificationid: notification.notificationid,
                        attemptcount: 1,
                        response: null,
                        transitstatus: null,
                    },
                });

                newlyNotifiedCount++;
            }

            // Update broadcast counter
            await tx.emergencybroadcasts.update({
                where: { broadcastid: broadcast.broadcastid },
                data: {
                    totalnotified: { increment: newlyNotifiedCount },
                    updatedat: new Date(),
                },
            });

            return {
                success: true,
                broadcastId: broadcast.broadcastid,
                totalNotified: newlyNotifiedCount,
                message: `Successfully dispatched emergency matching request to ${newlyNotifiedCount} donor(s).`,
            };
        });
    }

    /**
     * Get real-time responses from donors for a given requisition.
     */
    public static async getRequestResponses(hospitalUserId: string, requestId: string) {
        const hospital = await this.resolveHospitalForUser(hospitalUserId);
        if (!hospital) {
            throw new Error("Hospital profile not found.");
        }

        const bloodRequest = await prisma.bloodrequests.findUnique({
            where: { requestid: requestId },
        });

        if (!bloodRequest) {
            throw new Error("Blood request not found.");
        }

        if (bloodRequest.hospitalid !== hospital.hospitalid) {
            throw new Error("Access denied.");
        }

        const deliveries = await prisma.broadcastdeliveries.findMany({
            where: { requestid: requestId },
            include: {
                users: {
                    select: {
                        userid: true,
                        name: true,
                        email: true,
                        phonenumber: true,
                    },
                },
                donors: {
                    select: {
                        donorid: true,
                        bloodgroup: true,
                        city: true,
                        state: true,
                    },
                },
            },
            orderBy: [
                { respondedat: "desc" },
                { createdat: "desc" },
            ],
        });

        return deliveries.map((d) => {
            const isAccepted = d.response === "ACCEPTED";
            return {
                deliveryId: d.deliveryid,
                donorId: d.donorid,
                donorName: d.users.name,
                bloodGroup: d.donors.bloodgroup,
                city: d.donors.city,
                state: d.donors.state,
                distanceKm: d.distancekm ? Number(d.distancekm) : null,
                matchType: d.matchtype,
                deliveryStatus: d.deliverystatus,
                response: d.response || "PENDING",
                respondedAt: d.respondedat ? d.respondedat.toISOString() : null,
                transitStatus: d.transitstatus || null,
                transitNotes: d.transitnotes || null,
                // Contact details unmasked strictly when donor expresses ACCEPTED consent
                donorPhone: isAccepted ? d.users.phonenumber : maskPhone(d.users.phonenumber),
                donorEmail: isAccepted ? d.users.email : maskEmail(d.users.email),
                notifiedAt: d.createdat ? d.createdat.toISOString() : null,
            };
        });
    }

    /**
     * Get incoming emergency matching requests for an authenticated donor.
     */
    public static async getDonorEmergencyRequests(donorUserId: string): Promise<DonorEmergencyRequestItem[]> {
        const donor = await this.resolveDonorForUser(donorUserId);
        if (!donor) {
            throw new Error("Donor profile not found for authenticated user.");
        }

        // Fetch deliveries targeted to this donor
        const deliveries = await prisma.broadcastdeliveries.findMany({
            where: {
                OR: [
                    { donoruserid: donorUserId },
                    { donorid: donor.donorid },
                ],
            },
            include: {
                bloodrequests: {
                    include: {
                        hospitals: {
                            select: {
                                hospitalid: true,
                                hospitalname: true,
                                city: true,
                                state: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                { createdat: "desc" },
            ],
        });

        return deliveries.map((d) => {
            const bReq = d.bloodrequests;
            const hosp = bReq?.hospitals;

            return {
                deliveryId: d.deliveryid,
                broadcastId: d.broadcastid,
                requestId: d.requestid,
                hospitalName: hosp?.hospitalname || "Hospital Medical Facility",
                hospitalCity: hosp?.city || "Local Healthcare Facility",
                bloodGroup: bReq?.bloodgroup || donor.bloodgroup,
                bloodComponent: bReq?.bloodcomponent || "WHOLE_BLOOD",
                unitsRequired: bReq?.unitsrequired || 1,
                urgencyLevel: bReq?.urgencylevel || "URGENT",
                requiredBy: bReq?.requiredby ? bReq.requiredby.toISOString() : new Date().toISOString(),
                distanceKm: d.distancekm ? Number(d.distancekm) : null,
                distanceDisplay: d.distancekm ? `${Number(d.distancekm).toFixed(1)} km away` : "City Area Match",
                matchType: d.matchtype,
                response: (d.response as "PENDING" | "ACCEPTED" | "DECLINED") || "PENDING",
                respondedAt: d.respondedat ? d.respondedat.toISOString() : null,
                transitStatus: d.transitstatus || null,
                createdAt: d.createdat ? d.createdat.toISOString() : new Date().toISOString(),
            };
        });
    }

    /**
     * Donor responds to emergency request (ACCEPTED or DECLINED).
     * Non-clinical: acceptance signifies voluntary willingness to be contacted and attend.
     */
    public static async respondToEmergencyRequest(
        donorUserId: string,
        deliveryId: string,
        response: "ACCEPTED" | "DECLINED",
        notes?: string
    ) {
        const donor = await this.resolveDonorForUser(donorUserId);
        if (!donor) {
            throw new Error("Donor profile not found.");
        }

        const delivery = await prisma.broadcastdeliveries.findUnique({
            where: { deliveryid: deliveryId },
            include: {
                bloodrequests: {
                    include: {
                        hospitals: true,
                    },
                },
            },
        });

        if (!delivery) {
            throw new Error("Emergency matching delivery request not found.");
        }

        if (delivery.donoruserid !== donorUserId && delivery.donorid !== donor.donorid) {
            throw new Error("Access denied: You can only respond to matching requests sent to your profile.");
        }

        return await prisma.$transaction(async (tx) => {
            const now = new Date();

            // Update delivery record
            const updatedDelivery = await tx.broadcastdeliveries.update({
                where: { deliveryid: deliveryId },
                data: {
                    response,
                    respondedat: now,
                    transitnotes: notes || null,
                    transitstatus: response === "ACCEPTED" ? "DONOR_ACCEPTED" : "DECLINED",
                },
            });

            // Increment broadcast totalresponded
            await tx.emergencybroadcasts.update({
                where: { broadcastid: delivery.broadcastid },
                data: {
                    totalresponded: { increment: 1 },
                    status: response === "ACCEPTED" ? "DONOR_RESPONDED" : undefined,
                    updatedat: now,
                },
            });

            // If donor ACCEPTED, notify the hospital facility
            if (response === "ACCEPTED" && delivery.bloodrequests?.hospitals) {
                const hosp = delivery.bloodrequests.hospitals;
                await tx.notification.create({
                    data: {
                        userid: hosp.userid,
                        requestid: delivery.requestid,
                        type: notification_type.MATCH,
                        title: `Emergency Donor Accepted: ${donor.users.name} (${donor.bloodgroup})`,
                        message: `Volunteer donor ${donor.users.name} (${donor.bloodgroup}) has accepted the urgent donation request for requisition #${delivery.requestid.slice(0, 8)}. Please review contact info and coordinate donation arrival.`,
                        actionurl: `/hospital/emergency-matching?requestId=${delivery.requestid}`,
                        isread: false,
                    },
                });
            }

            return {
                success: true,
                deliveryId: updatedDelivery.deliveryid,
                response: updatedDelivery.response,
                respondedAt: updatedDelivery.respondedat?.toISOString(),
                message: response === "ACCEPTED"
                    ? "Thank you! Your voluntary acceptance has been shared with the hospital. Medical staff will reach out to coordinate your donation."
                    : "Your response has been recorded. Thank you for letting the medical team know.",
            };
        });
    }

    /**
     * Update transit status for a donor who accepted an emergency matching request.
     */
    public static async updateTransitStatus(
        hospitalUserId: string,
        deliveryId: string,
        transitStatus: string,
        notes?: string
    ) {
        const hospital = await this.resolveHospitalForUser(hospitalUserId);
        if (!hospital) {
            throw new Error("Hospital profile not found.");
        }

        const delivery = await prisma.broadcastdeliveries.findUnique({
            where: { deliveryid: deliveryId },
            include: { bloodrequests: true },
        });

        if (!delivery) {
            throw new Error("Delivery record not found.");
        }

        if (delivery.bloodrequests.hospitalid !== hospital.hospitalid) {
            throw new Error("Access denied: You can only update deliveries for your hospital's blood requests.");
        }

        const updated = await prisma.broadcastdeliveries.update({
            where: { deliveryid: deliveryId },
            data: {
                transitstatus: transitStatus,
                transitnotes: notes !== undefined ? notes : delivery.transitnotes,
            },
        });

        return {
            success: true,
            deliveryId: updated.deliveryid,
            transitStatus: updated.transitstatus,
            message: `Updated transit status to ${transitStatus}.`,
        };
    }
}
