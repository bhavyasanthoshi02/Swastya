import { prisma } from "../config/prisma";
import { blood_group, blood_component, availability_status } from "../generated/prisma/enums";
import { getCompatibleDonorBloodGroups, isDonorCompatibleWithRecipient } from "../utils/bloodCompatibility";
import { evaluateLocationDistance } from "../utils/distance";

export interface ScoreBreakdown {
    distanceScore: number;     // 0 - 40
    availabilityScore: number; // 0 - 30
    responseScore: number;     // 0 - 30
    totalScore: number;        // 0 - 100
}

export interface MatchExplanations {
    compatibility: string;
    location: string;
    availability: string;
    responsiveness: string;
}

export interface MatchedDonorItem {
    donorId: string;
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
    lastDonationDate: string | null;
}

export interface MatchedDonorsOptions {
    radiusKm?: number;
    page?: number;
    limit?: number;
}

export interface MatchedDonorsResponse {
    success: boolean;
    count: number;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: MatchedDonorItem[];
}

export class DonorMatchingService {
    /**
     * Finds and ranks all clinically eligible, available donors for a blood request.
     * Enforces strict deterministic gates (compatibility, availability, cooldown, age, weight, geographic boundary)
     * and produces an explainable composite score from 0 to 100.
     */
    public static async getRankedEligibleDonors(
        bloodRequest: {
            requestid: string;
            bloodgroup: blood_group;
            bloodcomponent?: blood_component | null;
            searchradius?: number | null;
            latitude?: any;
            longitude?: any;
            hospitals?: { city?: string | null; latitude?: any; longitude?: any } | null;
            requesters?: { city?: string | null; latitude?: any; longitude?: any } | null;
        },
        options?: MatchedDonorsOptions
    ): Promise<MatchedDonorsResponse> {
        const recipientBloodGroup = bloodRequest.bloodgroup;
        const requestedComponent = bloodRequest.bloodcomponent || blood_component.WHOLE_BLOOD;

        // 1. Mandatory Clinical Gate: Resolve compatible donor blood groups
        const compatibleDonorGroups = getCompatibleDonorBloodGroups(recipientBloodGroup, requestedComponent);
        if (!compatibleDonorGroups || compatibleDonorGroups.length === 0) {
            return {
                success: true,
                count: 0,
                total: 0,
                page: options?.page || 1,
                limit: options?.limit || 20,
                totalPages: 0,
                data: [],
            };
        }

        // Resolve search radius
        const effectiveRadius = options?.radiusKm && options.radiusKm > 0
            ? Math.max(1, Math.min(100, options.radiusKm))
            : (bloodRequest.searchradius && bloodRequest.searchradius > 0
                ? Math.max(1, Math.min(100, bloodRequest.searchradius))
                : 5);

        // Resolve request coordinates & fallback city
        const reqLat = bloodRequest.latitude !== null && bloodRequest.latitude !== undefined
            ? Number(bloodRequest.latitude)
            : (bloodRequest.hospitals?.latitude !== null && bloodRequest.hospitals?.latitude !== undefined
                ? Number(bloodRequest.hospitals.latitude)
                : null);

        const reqLng = bloodRequest.longitude !== null && bloodRequest.longitude !== undefined
            ? Number(bloodRequest.longitude)
            : (bloodRequest.hospitals?.longitude !== null && bloodRequest.hospitals?.longitude !== undefined
                ? Number(bloodRequest.hospitals.longitude)
                : null);

        const requestCity = (bloodRequest.hospitals?.city || bloodRequest.requesters?.city || "").trim().toLowerCase();

        // 2. Fetch active candidate donors matching compatible blood groups
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
                        isactive: true,
                    },
                },
            },
        });

        if (candidateDonors.length === 0) {
            return {
                success: true,
                count: 0,
                total: 0,
                page: options?.page || 1,
                limit: options?.limit || 20,
                totalPages: 0,
                data: [],
            };
        }

        // 3. Strict Deterministic Hard Filtering
        const now = Date.now();
        const nowYear = new Date(now).getFullYear();
        const nowMonth = new Date(now).getMonth();
        const nowDate = new Date(now).getDate();

        interface FilteredDonorCandidate {
            donor: typeof candidateDonors[0];
            matchType: "COORDINATES" | "CITY_FALLBACK";
            distanceKm: number | null;
            distanceDisplay: string;
            distanceScore: number;
            locationExplanation: string;
            availabilityExplanation: string;
        }

        const eligibleCandidates: FilteredDonorCandidate[] = [];

        for (const d of candidateDonors) {
            // A. Cooldown Gate: 90 days since last donation
            if (d.lastdonationdate) {
                const daysSince = Math.floor((now - new Date(d.lastdonationdate).getTime()) / (1000 * 60 * 60 * 24));
                if (daysSince < 90) {
                    continue; // In 90-day cooldown
                }
            }

            // B. Age Gate: 18 - 65 years
            if (d.dateofbirth) {
                const birth = new Date(d.dateofbirth);
                let age = nowYear - birth.getFullYear();
                const m = nowMonth - birth.getMonth();
                if (m < 0 || (m === 0 && nowDate < birth.getDate())) {
                    age--;
                }
                if (age < 18 || age > 65) {
                    continue; // Outside permitted age window
                }
            }

            // C. Weight Gate: >= 50 kg if recorded
            if (d.weight !== null && d.weight !== undefined) {
                const w = Number(d.weight);
                if (!isNaN(w) && w < 50) {
                    continue; // Below safe donor weight threshold
                }
            }

            // D. Geographic Boundary Gate
            const donorLat = d.latitude !== null && d.latitude !== undefined ? Number(d.latitude) : null;
            const donorLng = d.longitude !== null && d.longitude !== undefined ? Number(d.longitude) : null;

            const locEval = evaluateLocationDistance(donorLat, donorLng, reqLat, reqLng, effectiveRadius);

            let matchType: "COORDINATES" | "CITY_FALLBACK";
            let distanceKm: number | null = null;
            let distanceDisplay: string;
            let distanceScore = 0;
            let locationExplanation: string;

            if (locEval.hasCoordinates && locEval.locationMatch === "COORDINATES") {
                if (!locEval.isWithinRadius || locEval.distanceKm === null) {
                    continue; // Outside configured search radius
                }
                matchType = "COORDINATES";
                distanceKm = locEval.distanceKm;
                distanceDisplay = locEval.distanceDisplay;

                // Distance Score: 0 - 40 points
                // 0 km = 40 pts, effectiveRadius = 0 pts
                const distRatio = Math.min(1, Math.max(0, locEval.distanceKm / effectiveRadius));
                distanceScore = Math.max(0, Math.min(40, Math.round(40 * (1 - distRatio))));
                locationExplanation = `${distanceDisplay} (within ${effectiveRadius} km search radius)`;
            } else {
                // Coordinate Fallback: Exact city match
                const donorCity = (d.city || "").trim().toLowerCase();
                if (!donorCity || !requestCity || donorCity !== requestCity) {
                    continue; // Neither coordinates match within radius nor cities match
                }
                matchType = "CITY_FALLBACK";
                distanceKm = null;
                distanceDisplay = `City Match (${d.city})`;

                // Neutral mid-tier distance score (20/40) for uncoordinated city match
                distanceScore = 20;
                locationExplanation = `Located in ${d.city} (matching request city). Exact distance unavailable due to unconfigured coordinates.`;
            }

            // Availability explanation (All surviving candidates are AVAILABLE with cooldown satisfied)
            const daysSince = d.lastdonationdate
                ? Math.floor((now - new Date(d.lastdonationdate).getTime()) / (1000 * 60 * 60 * 24))
                : null;
            const availabilityExplanation = daysSince !== null
                ? `Verified AVAILABLE and clinically eligible (${daysSince} days since last donation; 90-day cooldown satisfied).`
                : "Verified AVAILABLE and clinically eligible (first-time donor with no prior donations).";

            eligibleCandidates.push({
                donor: d,
                matchType,
                distanceKm,
                distanceDisplay,
                distanceScore,
                locationExplanation,
                availabilityExplanation,
            });
        }

        if (eligibleCandidates.length === 0) {
            return {
                success: true,
                count: 0,
                total: 0,
                page: options?.page || 1,
                limit: options?.limit || 20,
                totalPages: 0,
                data: [],
            };
        }

        // 4. Batch query historical broadcast response history for eligible candidates
        const eligibleDonorIds = eligibleCandidates.map((c) => c.donor.donorid);
        const deliveries = await prisma.broadcastdeliveries.findMany({
            where: {
                donorid: { in: eligibleDonorIds },
                deliverystatus: { not: "FAILED" },
            },
            select: {
                donorid: true,
                requestid: true,
                response: true,
            },
        });

        // Group deliveries by donor, deduplicating by requestid
        const donorDeliveriesMap = new Map<string, Map<string, string | null>>();
        for (const del of deliveries) {
            if (!donorDeliveriesMap.has(del.donorid)) {
                donorDeliveriesMap.set(del.donorid, new Map());
            }
            const reqMap = donorDeliveriesMap.get(del.donorid)!;
            if (!reqMap.has(del.requestid) || del.response === "ACCEPTED") {
                reqMap.set(del.requestid, del.response);
            }
        }

        // 5. Score & Rank Each Candidate
        const rankedDonors: MatchedDonorItem[] = [];

        for (const candidate of eligibleCandidates) {
            const d = candidate.donor;

            // Distance score: 0 - 40 points
            const distanceScore = candidate.distanceScore;

            // Availability score: 30 points (All eligible available donors get 30/30)
            const availabilityScore = 30;

            // Historical response score: 0 - 30 points
            const donorDeliveryMap = donorDeliveriesMap.get(d.donorid);
            const validDeliveriesCount = donorDeliveryMap ? donorDeliveryMap.size : 0;
            let responseScore = 15;
            let responsivenessExplanation = "";

            if (validDeliveriesCount < 3) {
                // Cold-start or insufficient history: Neutral baseline score (15/30)
                responseScore = 15;
                responsivenessExplanation = validDeliveriesCount === 0
                    ? "No previous emergency broadcast history. Assigned neutral baseline score (15/30)."
                    : `Insufficient broadcast history (${validDeliveriesCount} ${validDeliveriesCount === 1 ? "delivery" : "deliveries"} < 3 minimum). Assigned neutral baseline score (15/30).`;
            } else {
                let acceptedCount = 0;
                for (const resp of donorDeliveryMap!.values()) {
                    if (resp === "ACCEPTED") acceptedCount++;
                }
                const acceptanceRate = acceptedCount / validDeliveriesCount;
                responseScore = Math.max(0, Math.min(30, Math.round(30 * acceptanceRate)));
                responsivenessExplanation = `Historical response reliability: ${(acceptanceRate * 100).toFixed(0)}% acceptance across ${validDeliveriesCount} broadcast deliveries (${acceptedCount} accepted).`;
            }

            // Composite total score: 0 - 100 points
            const totalScore = Math.max(0, Math.min(100, distanceScore + availabilityScore + responseScore));

            // Compatibility explanation
            const isExactMatch = d.bloodgroup === recipientBloodGroup;
            const compatibilityExplanation = isExactMatch
                ? `Exact blood group match (${d.bloodgroup}) for requested ${requestedComponent}.`
                : `Clinically compatible ${d.bloodgroup} donor for ${recipientBloodGroup} recipient (${requestedComponent}).`;

            rankedDonors.push({
                donorId: d.donorid,
                donorName: d.users.name,
                bloodGroup: d.bloodgroup,
                gender: d.gender,
                city: d.city,
                state: d.state,
                matchScore: totalScore,
                scoreBreakdown: {
                    distanceScore,
                    availabilityScore,
                    responseScore,
                    totalScore,
                },
                explanations: {
                    compatibility: compatibilityExplanation,
                    location: candidate.locationExplanation,
                    availability: candidate.availabilityExplanation,
                    responsiveness: responsivenessExplanation,
                },
                distanceKm: candidate.distanceKm,
                distanceDisplay: candidate.distanceDisplay,
                matchType: candidate.matchType,
                availabilityStatus: d.availabilitystatus || "AVAILABLE",
                lastDonationDate: d.lastdonationdate ? new Date(d.lastdonationdate).toISOString().split("T")[0] : null,
            });
        }

        // 6. Deterministic Sort:
        // Highest matchScore first, then closer distance, then coordinate-matched over city fallback, then donorId
        rankedDonors.sort((a, b) => {
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

        // 7. Pagination
        const page = Math.max(1, parseInt(String(options?.page || 1), 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(String(options?.limit || 20), 10) || 20));
        const total = rankedDonors.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const paginatedData = rankedDonors.slice((page - 1) * limit, page * limit);

        return {
            success: true,
            count: paginatedData.length,
            total,
            page,
            limit,
            totalPages,
            data: paginatedData,
        };
    }
}
