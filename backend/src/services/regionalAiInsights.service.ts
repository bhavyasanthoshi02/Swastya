import { prisma } from "../config/prisma";
import { blood_group, blood_component, request_status } from "../generated/prisma/enums";
import { getNormalizedLocation, toTitleCase } from "../utils/location";
import { BLOOD_GROUP_DISPLAY, COMPONENT_DISPLAY } from "./bloodDemandForecast.service";
import { BloodExpiryPredictionService, TrackedUnitRecord } from "./bloodExpiryPrediction.service";

const ALL_BLOOD_GROUPS: blood_group[] = [
    "A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE",
    "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"
];

const ALL_COMPONENTS: blood_component[] = [
    "WHOLE_BLOOD", "PLATELETS", "PLASMA", "RBC"
];

// Valid request statuses that represent real clinical blood demand (excludes cancelled and expired)
const VALID_DEMAND_STATUSES: request_status[] = [
    "CREATED",
    "VERIFIED",
    "HOSPITAL_REVIEW",
    "BLOOD_BANK_CHECK",
    "DONOR_MATCHING",
    "BLOOD_ARRANGED",
    "FULFILLED",
];

export interface HospitalAiInsightsResult {
    scope: "HOSPITAL" | "DISTRICT" | "STATE";
    hospitalId: string;
    hospitalName: string;
    location: {
        district: string;
        state: string;
        displayDistrict: string;
        displayState: string;
        isValid: boolean;
        missingLocationMessage?: string;
    };
    historicalWindowDays: number;
    isDataSufficient: boolean;
    dataQualityNote: string;
    overview: {
        totalUnitsRequested: number;
        totalRequestsCount: number;
        fulfilledUnits: number;
        pendingUnits: number;
        mostRequestedGroup: { bloodGroup: blood_group; displayName: string; totalUnits: number; percentage: number } | null;
        mostRequestedComponent: { bloodComponent: blood_component; displayName: string; totalUnits: number; percentage: number } | null;
        estimatedUpcoming7d: number; // Integer units
        currentAvailableStock: number | null;
        attentionGroups: Array<{ bloodGroup: blood_group; displayName: string; deficit: number; reason: string }>;
    };
    upcomingRequirements7d: Array<{
        bloodGroup: blood_group;
        bloodGroupDisplay: string;
        component: blood_component;
        componentDisplay: string;
        estimatedUnits: number;
        availableStock: number | null;
        shortageStatus: "Shortage" | "Adequate" | "Surplus";
        statusExplanation: string;
    }>;
    demandHistory: {
        frequentlyRequestedGroups: Array<{
            bloodGroup: blood_group;
            displayName: string;
            totalUnits: number;
            requestCount: number;
            percentage: number;
            rank: number;
        }>;
        componentBreakdown: Array<{
            bloodComponent: blood_component;
            displayName: string;
            totalUnits: number;
            percentage: number;
        }>;
        dailyTrends: Array<{ date: string; actualUnits: number; requestCount: number }>;
        weeklyTrends: Array<{ period: string; actualUnits: number; requestCount: number }>;
    };
    regionalContext?: {
        participatingHospitalsCount: number;
        districtName?: string;
        stateName?: string;
        hospitalComparison?: {
            hospitalUnits: number;
            districtUnits: number;
            hospitalSharePercent: number;
            summaryMessage: string;
        };
        districtBreakdown?: Array<{
            districtName: string;
            totalUnits: number;
            hospitalCount: number;
            percentageOfState: number;
        }>;
    };
    recommendedActions: string[];
    excludedRecordsCount?: number;
}

export interface BloodBankAiInsightsResult {
    scope: "INVENTORY" | "DISTRICT" | "STATE";
    bloodBankId: string;
    bloodBankName: string;
    location: {
        district: string;
        state: string;
        displayDistrict: string;
        displayState: string;
        isValid: boolean;
        missingLocationMessage?: string;
    };
    historicalWindowDays: number;
    isDataSufficient: boolean;
    dataQualityNote: string;
    inventoryOverview?: {
        totalAvailableUnits: number;
        expiringWithin3Days: number;
        expiringWithin7Days: number;
        expiredCount: number;
        eligibleAllocationCount: number;
    };
    unitsExpiringSoon?: Array<{
        unitBarcode: string;
        bloodGroupDisplay: string;
        componentDisplay: string;
        expiryDate: string;
        daysRemaining: number;
        ttiStatus: string;
        recommendedAction: string;
    }>;
    unitsToUseFirst?: Array<{
        unitBarcode: string;
        bloodGroupDisplay: string;
        componentDisplay: string;
        expiryDate: string;
        daysRemaining: number;
        storageBin?: string;
    }>;
    wastageInsights?: {
        historicalWastageUnits: number;
        unitsAtRiskOfExpiry: number;
        estimatedPotentialWastageUnits: number;
        actionsToReduceWastage: string[];
    };
    regionalDemand?: {
        totalRequestsCount: number;
        totalUnitsRequested: number;
        mostRequestedGroup: { bloodGroup: blood_group; displayName: string; totalUnits: number } | null;
        mostRequestedComponent: { bloodComponent: blood_component; displayName: string; totalUnits: number } | null;
        estimatedUpcoming7d: number;
        historicalWeeklyTrends: Array<{ period: string; actualUnits: number }>;
        breakdownByGroup: Array<{ bloodGroup: blood_group; displayName: string; totalUnits: number; percentage: number }>;
    };
    regionalSupply?: {
        participatingBloodBanksCount: number;
        totalAvailableUnits: number;
        supplyByGroup: Array<{ bloodGroup: blood_group; displayName: string; availableUnits: number }>;
        supplyByComponent: Array<{ bloodComponent: blood_component; displayName: string; availableUnits: number }>;
    };
    demandSupplyComparison?: Array<{
        bloodGroup: blood_group;
        displayName: string;
        projectedDemand7d: number;
        availableSupplyUnits: number;
        balance: number;
        status: "Shortage Risk" | "Adequate Stock" | "Surplus";
        statusMessage: string;
    }>;
    regionalContext?: {
        districtName?: string;
        stateName?: string;
        shortageAlerts: string[];
        redistributionOpportunities: string[];
        summaryInsights: string[];
        districtBreakdown?: Array<{
            districtName: string;
            hospitalCount: number;
            bloodBankCount: number;
            requestedUnits: number;
            availableSupplyUnits: number;
            balance: number;
            status: "Shortage Risk" | "Adequate Stock" | "Surplus";
        }>;
    };
    recommendedActions: string[];
    excludedRecordsCount?: number;
}

/**
 * Common projection helper calculating 7-day requirement from continuous daily points
 */
function calculate7DayForecastFromDaily(dailyPoints: Array<{ date: string; actualUnits: number }>): {
    projected7d: number;
    wmaBaseline: number;
    trendSlope: number;
} {
    const T = dailyPoints.length;
    if (T === 0) return { projected7d: 0, wmaBaseline: 0, trendSlope: 0 };

    const wmaWindow = Math.min(14, Math.max(3, T));
    const recentUnits = dailyPoints.slice(T - wmaWindow).map((p) => p.actualUnits);

    let weightSum = 0;
    let weightedDemandSum = 0;
    for (let i = 0; i < recentUnits.length; i++) {
        const w = i + 1;
        weightSum += w;
        weightedDemandSum += recentUnits[i] * w;
    }
    const wmaBaseline = weightSum > 0 ? weightedDemandSum / weightSum : 0;

    let sumT = 0;
    let sumY = 0;
    let sumTY = 0;
    let sumTT = 0;
    for (let t = 0; t < T; t++) {
        const y = dailyPoints[t].actualUnits;
        sumT += t;
        sumY += y;
        sumTY += t * y;
        sumTT += t * t;
    }
    const denom = T * sumTT - sumT * sumT;
    const trendSlope = denom !== 0 ? (T * sumTY - sumT * sumY) / denom : 0;

    let total7d = 0;
    for (let h = 1; h <= 7; h++) {
        total7d += Math.max(0, wmaBaseline + trendSlope * h);
    }
    return {
        projected7d: Math.round(total7d),
        wmaBaseline,
        trendSlope,
    };
}

export class RegionalAiInsightsService {
    /**
     * Compute Hospital AI Insights for:
     * - View 1: MY HOSPITAL
     * - View 2: MY DISTRICT
     * - View 3: MY STATE
     */
    static async getHospitalInsights(params: {
        hospitalId: string;
        scope: "HOSPITAL" | "DISTRICT" | "STATE";
        timeframeDays?: number;
        bloodGroup?: blood_group;
        bloodComponent?: blood_component;
    }): Promise<HospitalAiInsightsResult> {
        const { hospitalId, scope, timeframeDays = 30, bloodGroup, bloodComponent } = params;
        const now = new Date();
        const startDate = new Date(now.getTime() - timeframeDays * 24 * 60 * 60 * 1000);

        // 1. Fetch current hospital and its normalized location
        const targetHospital = await prisma.hospitals.findUnique({
            where: { hospitalid: hospitalId },
            select: {
                hospitalid: true,
                hospitalname: true,
                city: true,
                state: true,
                pincode: true,
            },
        });

        if (!targetHospital) {
            throw new Error("Hospital record not found");
        }

        const hospLocation = getNormalizedLocation(targetHospital);

        // If location is incomplete and regional scope is requested, return graceful notification
        if (!hospLocation.isValid && (scope === "DISTRICT" || scope === "STATE")) {
            return {
                scope,
                hospitalId: targetHospital.hospitalid,
                hospitalName: targetHospital.hospitalname,
                location: {
                    district: hospLocation.district,
                    state: hospLocation.state,
                    displayDistrict: hospLocation.displayDistrict,
                    displayState: hospLocation.displayState,
                    isValid: false,
                    missingLocationMessage: "Location information is incomplete. Regional insights are unavailable for this record.",
                },
                historicalWindowDays: timeframeDays,
                isDataSufficient: false,
                dataQualityNote: "Location information is incomplete. Regional insights are unavailable for this record.",
                overview: {
                    totalUnitsRequested: 0,
                    totalRequestsCount: 0,
                    fulfilledUnits: 0,
                    pendingUnits: 0,
                    mostRequestedGroup: null,
                    mostRequestedComponent: null,
                    estimatedUpcoming7d: 0,
                    currentAvailableStock: null,
                    attentionGroups: [],
                },
                upcomingRequirements7d: [],
                demandHistory: {
                    frequentlyRequestedGroups: [],
                    componentBreakdown: [],
                    dailyTrends: [],
                    weeklyTrends: [],
                },
                recommendedActions: [
                    "Update your hospital profile with a valid city/district and state to unlock regional blood intelligence.",
                ],
            };
        }

        // 2. Identify target hospitals based on scope
        let targetHospitalIds: string[] = [hospitalId];
        let participatingHospitalsCount = 1;
        let allStateHospitals: Array<{ hospitalid: string; city: string; state: string; hospitalname: string }> = [];
        let excludedIncompleteCount = 0;

        if (scope === "DISTRICT") {
            const districtCandidates = await prisma.hospitals.findMany({
                where: { approvalstatus: "APPROVED" as any },
                select: { hospitalid: true, city: true, state: true, hospitalname: true },
            });

            const matched = districtCandidates.filter((h) => {
                const loc = getNormalizedLocation(h);
                if (!loc.isValid) {
                    excludedIncompleteCount++;
                    return false;
                }
                return loc.district === hospLocation.district && loc.state === hospLocation.state;
            });

            // Ensure authenticated hospital is always included even if self-registered
            if (!matched.some((h) => h.hospitalid === hospitalId)) {
                matched.push(targetHospital);
            }

            targetHospitalIds = matched.map((h) => h.hospitalid);
            participatingHospitalsCount = matched.length;
        } else if (scope === "STATE") {
            const stateCandidates = await prisma.hospitals.findMany({
                where: { approvalstatus: "APPROVED" as any },
                select: { hospitalid: true, city: true, state: true, hospitalname: true },
            });

            const matched = stateCandidates.filter((h) => {
                const loc = getNormalizedLocation(h);
                if (!loc.isValid) {
                    excludedIncompleteCount++;
                    return false;
                }
                return loc.state === hospLocation.state;
            });

            if (!matched.some((h) => h.hospitalid === hospitalId)) {
                matched.push(targetHospital);
            }

            allStateHospitals = matched;
            targetHospitalIds = matched.map((h) => h.hospitalid);
            participatingHospitalsCount = matched.length;
        }

        // 3. Query historical blood requests strictly for the scoped hospitals
        const rawRequests = await prisma.bloodrequests.findMany({
            where: {
                hospitalid: { in: targetHospitalIds },
                createdat: { gte: startDate },
                status: { in: VALID_DEMAND_STATUSES },
                ...(bloodGroup ? { bloodgroup: bloodGroup } : {}),
                ...(bloodComponent ? { bloodcomponent: bloodComponent } : {}),
            },
            select: {
                requestid: true,
                hospitalid: true,
                bloodgroup: true,
                bloodcomponent: true,
                unitsrequired: true,
                createdat: true,
                status: true,
            },
            orderBy: { createdat: "asc" },
        });

        // 4. Data sufficiency checks
        const totalRequestsCount = rawRequests.length;
        const totalUnitsRequested = rawRequests.reduce((sum, r) => sum + (r.unitsrequired || 1), 0);
        const fulfilledUnits = rawRequests
            .filter((r) => r.status === "FULFILLED")
            .reduce((sum, r) => sum + (r.unitsrequired || 1), 0);
        const pendingUnits = rawRequests
            .filter((r) => r.status !== "FULFILLED" && r.status !== "CANCELLED" && r.status !== "EXPIRED")
            .reduce((sum, r) => sum + (r.unitsrequired || 1), 0);

        let earliestDate = now;
        let latestDate = startDate;
        for (const r of rawRequests) {
            if (r.createdat) {
                if (r.createdat < earliestDate) earliestDate = r.createdat;
                if (r.createdat > latestDate) latestDate = r.createdat;
            }
        }
        const daySpan = Math.max(1, Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (24 * 60 * 60 * 1000)));
        const isDataSufficient = totalRequestsCount >= 5 && daySpan >= 7;

        let dataQualityNote = `Based on ${totalRequestsCount} actual request records spanning ${daySpan} day(s).`;
        if (!isDataSufficient) {
            dataQualityNote = totalRequestsCount === 0
                ? "Not enough request history to estimate future blood requirements."
                : `Not enough request history to estimate future blood requirements (${totalRequestsCount} request(s) recorded). Estimated numbers are baseline guidelines only.`;
        }

        // 5. Daily continuous time series & grouping
        const dailyMap = new Map<string, { actualUnits: number; requestCount: number }>();
        for (let i = 0; i < timeframeDays; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().split("T")[0];
            dailyMap.set(key, { actualUnits: 0, requestCount: 0 });
        }

        for (const r of rawRequests) {
            if (!r.createdat) continue;
            const key = r.createdat.toISOString().split("T")[0];
            const existing = dailyMap.get(key) || { actualUnits: 0, requestCount: 0 };
            existing.actualUnits += r.unitsrequired || 1;
            existing.requestCount += 1;
            dailyMap.set(key, existing);
        }

        const dailyTrends: Array<{ date: string; actualUnits: number; requestCount: number }> = [];
        dailyMap.forEach((val, date) => {
            dailyTrends.push({ date, actualUnits: val.actualUnits, requestCount: val.requestCount });
        });
        dailyTrends.sort((a, b) => a.date.localeCompare(b.date));

        // Group into Weekly (7-day intervals)
        const weeklyTrends: Array<{ period: string; actualUnits: number; requestCount: number }> = [];
        for (let i = 0; i < dailyTrends.length; i += 7) {
            const chunk = dailyTrends.slice(i, i + 7);
            const sumUnits = chunk.reduce((s, p) => s + p.actualUnits, 0);
            const sumReqs = chunk.reduce((s, p) => s + p.requestCount, 0);
            const startD = chunk[0].date;
            weeklyTrends.push({
                period: `Week of ${startD}`,
                actualUnits: sumUnits,
                requestCount: sumReqs,
            });
        }

        // 6. Projections (7-day requirement in whole sensible units)
        const { projected7d } = calculate7DayForecastFromDaily(dailyTrends);
        const estimatedUpcoming7d = projected7d;

        // 7. Blood Group & Component Breakdown
        const groupMap = new Map<blood_group, { units: number; count: number }>();
        for (const bg of ALL_BLOOD_GROUPS) groupMap.set(bg, { units: 0, count: 0 });
        for (const r of rawRequests) {
            const cur = groupMap.get(r.bloodgroup) || { units: 0, count: 0 };
            cur.units += r.unitsrequired || 1;
            cur.count += 1;
            groupMap.set(r.bloodgroup, cur);
        }

        const groupList: Array<{ bloodGroup: blood_group; displayName: string; totalUnits: number; requestCount: number; percentage: number; rank: number }> = [];
        groupMap.forEach((val, bg) => {
            const percentage = totalUnitsRequested > 0 ? Math.round((val.units / totalUnitsRequested) * 100) : 0;
            groupList.push({
                bloodGroup: bg,
                displayName: BLOOD_GROUP_DISPLAY[bg],
                totalUnits: val.units,
                requestCount: val.count,
                percentage,
                rank: 0,
            });
        });
        groupList.sort((a, b) => b.totalUnits - a.totalUnits || b.requestCount - a.requestCount);
        groupList.forEach((item, index) => { item.rank = index + 1; });

        const mostRequestedGroup = groupList[0]?.totalUnits > 0 ? groupList[0] : null;

        // Components
        const compMap = new Map<blood_component, { units: number; count: number }>();
        for (const comp of ALL_COMPONENTS) compMap.set(comp, { units: 0, count: 0 });
        for (const r of rawRequests) {
            const cur = compMap.get(r.bloodcomponent) || { units: 0, count: 0 };
            cur.units += r.unitsrequired || 1;
            cur.count += 1;
            compMap.set(r.bloodcomponent, cur);
        }

        const componentBreakdown: Array<{ bloodComponent: blood_component; displayName: string; totalUnits: number; percentage: number }> = [];
        compMap.forEach((val, comp) => {
            const percentage = totalUnitsRequested > 0 ? Math.round((val.units / totalUnitsRequested) * 100) : 0;
            componentBreakdown.push({
                bloodComponent: comp,
                displayName: COMPONENT_DISPLAY[comp],
                totalUnits: val.units,
                percentage,
            });
        });
        componentBreakdown.sort((a, b) => b.totalUnits - a.totalUnits);
        const mostRequestedComponent = componentBreakdown[0]?.totalUnits > 0 ? componentBreakdown[0] : null;

        // 8. Available stock determination
        // For hospital scope: check active reservations assigned to this hospital
        let currentAvailableStock: number | null = null;
        const availableStockMap = new Map<string, number>();

        if (scope === "HOSPITAL") {
            const reservations = await prisma.bloodreservations.findMany({
                where: {
                    bloodrequests: { hospitalid: hospitalId },
                    reservationstatus: "ACTIVE",
                },
                include: {
                    reservationitems: {
                        where: { itemstatus: "RESERVED" },
                        include: { unit: true },
                    },
                },
            });

            let stockCount = 0;
            for (const res of reservations) {
                for (const item of res.reservationitems) {
                    if (item.unit && item.unit.expirydate > now && item.unit.ttiscreeningstatus === "PASSED") {
                        stockCount++;
                        const key = `${item.unit.bloodgroup}_${item.unit.bloodcomponent}`;
                        availableStockMap.set(key, (availableStockMap.get(key) || 0) + 1);
                    }
                }
            }
            currentAvailableStock = stockCount;
        }

        // 9. Upcoming Requirements table (7-day forecast per blood group & component)
        const upcomingRequirements7d: HospitalAiInsightsResult["upcomingRequirements7d"] = [];
        const attentionGroups: HospitalAiInsightsResult["overview"]["attentionGroups"] = [];

        for (const bg of ALL_BLOOD_GROUPS) {
            if (bloodGroup && bg !== bloodGroup) continue;
            const bgData = groupMap.get(bg);
            const bgShare = totalUnitsRequested > 0 ? (bgData?.units || 0) / totalUnitsRequested : 0.125;

            for (const comp of ALL_COMPONENTS) {
                if (bloodComponent && comp !== bloodComponent) continue;
                const compData = compMap.get(comp);
                const compShare = totalUnitsRequested > 0 ? (compData?.units || 0) / totalUnitsRequested : 0.25;

                // Whole unit estimate
                const estUnits = isDataSufficient && totalUnitsRequested > 0
                    ? Math.max(bgData?.units ? 1 : 0, Math.round(estimatedUpcoming7d * bgShare * compShare))
                    : (bgData?.units ? Math.max(1, Math.round(bgData.units / 4)) : 0);

                const key = `${bg}_${comp}`;
                const stock = scope === "HOSPITAL" ? (availableStockMap.get(key) || 0) : null;

                let shortageStatus: "Shortage" | "Adequate" | "Surplus" = "Adequate";
                let statusExplanation = "Stock appears sufficient for normal requirements.";

                if (stock !== null) {
                    if (stock < estUnits) {
                        shortageStatus = "Shortage";
                        statusExplanation = `Estimated shortage of ${estUnits - stock} unit(s).`;
                        if (estUnits - stock > 0 && !attentionGroups.some((a) => a.bloodGroup === bg)) {
                            attentionGroups.push({
                                bloodGroup: bg,
                                displayName: BLOOD_GROUP_DISPLAY[bg],
                                deficit: estUnits - stock,
                                reason: `Current reserved stock (${stock}) is below estimated 7-day need (${estUnits}).`,
                            });
                        }
                    } else if (stock > estUnits + 2) {
                        shortageStatus = "Surplus";
                        statusExplanation = `Surplus buffer available (${stock} units vs ${estUnits} estimated).`;
                    }
                } else if (estUnits > 0 && (bg === "O_NEGATIVE" || bg === "B_POSITIVE")) {
                    // General clinical focus for district/state
                    if (!attentionGroups.some((a) => a.bloodGroup === bg)) {
                        attentionGroups.push({
                            bloodGroup: bg,
                            displayName: BLOOD_GROUP_DISPLAY[bg],
                            deficit: estUnits,
                            reason: `High clinical request volume across the ${scope.toLowerCase()}.`,
                        });
                    }
                }

                if (estUnits > 0 || (stock !== null && stock > 0)) {
                    upcomingRequirements7d.push({
                        bloodGroup: bg,
                        bloodGroupDisplay: BLOOD_GROUP_DISPLAY[bg],
                        component: comp,
                        componentDisplay: COMPONENT_DISPLAY[comp],
                        estimatedUnits: estUnits,
                        availableStock: stock,
                        shortageStatus,
                        statusExplanation,
                    });
                }
            }
        }

        // 10. Regional Context & Hospital-District Comparisons
        let regionalContext: HospitalAiInsightsResult["regionalContext"];

        if (scope === "DISTRICT") {
            // Calculate this hospital's own demand vs district
            const hospitalOnlyReqs = rawRequests.filter((r) => r.hospitalid === hospitalId);
            const hospitalUnits = hospitalOnlyReqs.reduce((s, r) => s + (r.unitsrequired || 1), 0);
            const districtUnits = totalUnitsRequested;
            const hospitalSharePercent = districtUnits > 0 ? Number(((hospitalUnits / districtUnits) * 100).toFixed(1)) : 0;

            const summaryMessage = districtUnits > 0
                ? `Your hospital accounts for ${hospitalSharePercent}% of all blood units requested in ${hospLocation.displayDistrict} district (${hospitalUnits} of ${districtUnits} units).`
                : `No blood requests have been recorded yet in ${hospLocation.displayDistrict} district.`;

            regionalContext = {
                participatingHospitalsCount,
                districtName: hospLocation.displayDistrict,
                stateName: hospLocation.displayState,
                hospitalComparison: {
                    hospitalUnits,
                    districtUnits,
                    hospitalSharePercent,
                    summaryMessage,
                },
            };
        } else if (scope === "STATE") {
            // Aggregate district by district within the state
            const districtAgg = new Map<string, { totalUnits: number; hospitalSet: Set<string> }>();

            // Create lookup of hospitalid -> district
            const hospDistrictMap = new Map<string, string>();
            for (const h of allStateHospitals) {
                const loc = getNormalizedLocation(h);
                if (loc.isValid) {
                    hospDistrictMap.set(h.hospitalid, loc.displayDistrict);
                }
            }

            for (const r of rawRequests) {
                if (!r.hospitalid) continue;
                const distName = hospDistrictMap.get(r.hospitalid) || "Other Districts";
                const cur = districtAgg.get(distName) || { totalUnits: 0, hospitalSet: new Set() };
                cur.totalUnits += r.unitsrequired || 1;
                cur.hospitalSet.add(r.hospitalid);
                districtAgg.set(distName, cur);
            }

            const districtBreakdown: Array<{ districtName: string; totalUnits: number; hospitalCount: number; percentageOfState: number }> = [];
            districtAgg.forEach((val, distName) => {
                const percentageOfState = totalUnitsRequested > 0 ? Number(((val.totalUnits / totalUnitsRequested) * 100).toFixed(1)) : 0;
                districtBreakdown.push({
                    districtName: distName,
                    totalUnits: val.totalUnits,
                    hospitalCount: val.hospitalSet.size,
                    percentageOfState,
                });
            });
            districtBreakdown.sort((a, b) => b.totalUnits - a.totalUnits);

            regionalContext = {
                participatingHospitalsCount,
                stateName: hospLocation.displayState,
                districtBreakdown,
            };
        }

        // 11. Simple, understandable recommended actions
        const recommendedActions: string[] = [];
        if (scope === "HOSPITAL") {
            if (mostRequestedGroup) {
                recommendedActions.push(
                    `Your hospital frequently requests ${mostRequestedGroup.displayName} blood (${mostRequestedGroup.totalUnits} units in the last ${timeframeDays} days).`
                );
            }
            if (estimatedUpcoming7d > 0) {
                recommendedActions.push(
                    `Your estimated requirement is ${estimatedUpcoming7d} unit(s) over the next 7 days based on past request patterns.`
                );
            }
            if (attentionGroups.length > 0) {
                const topAttn = attentionGroups[0];
                recommendedActions.push(
                    `Your hospital may need additional ${topAttn.displayName} units (${topAttn.deficit} unit deficit projected).`
                );
            }
            if (!isDataSufficient) {
                recommendedActions.push(
                    "Registering blood requirements consistently will help provide more accurate upcoming estimates."
                );
            }
        } else if (scope === "DISTRICT") {
            if (mostRequestedGroup) {
                recommendedActions.push(
                    `${mostRequestedGroup.displayName} is the most requested blood group in ${hospLocation.displayDistrict} district (${mostRequestedGroup.percentage}% of all district requests).`
                );
            }
            if (estimatedUpcoming7d > 0) {
                recommendedActions.push(
                    `Hospitals in ${hospLocation.displayDistrict} may collectively require approximately ${estimatedUpcoming7d} unit(s) over the next 7 days.`
                );
            }
            if (regionalContext?.hospitalComparison && regionalContext.hospitalComparison.hospitalSharePercent > 40) {
                recommendedActions.push(
                    `Your facility represents a high proportion (${regionalContext.hospitalComparison.hospitalSharePercent}%) of district blood demand. Coordinating early with local blood banks helps prevent delays.`
                );
            }
        } else if (scope === "STATE") {
            if (mostRequestedGroup) {
                recommendedActions.push(
                    `${mostRequestedGroup.displayName} represents the highest blood requirement across ${hospLocation.displayState} (${mostRequestedGroup.totalUnits} units requested).`
                );
            }
            if (regionalContext?.districtBreakdown && regionalContext.districtBreakdown.length > 0) {
                const topDist = regionalContext.districtBreakdown[0];
                recommendedActions.push(
                    `${topDist.districtName} district shows the highest blood requirement in the state (${topDist.totalUnits} units requested across ${topDist.hospitalCount} hospitals).`
                );
            }
            recommendedActions.push(
                `State-level insights represent combined data across ${participatingHospitalsCount} registered hospitals in ${hospLocation.displayState}.`
            );
        }

        return {
            scope,
            hospitalId: targetHospital.hospitalid,
            hospitalName: targetHospital.hospitalname,
            location: {
                district: hospLocation.district,
                state: hospLocation.state,
                displayDistrict: hospLocation.displayDistrict,
                displayState: hospLocation.displayState,
                isValid: hospLocation.isValid,
            },
            historicalWindowDays: timeframeDays,
            isDataSufficient,
            dataQualityNote,
            overview: {
                totalUnitsRequested,
                totalRequestsCount,
                fulfilledUnits,
                pendingUnits,
                mostRequestedGroup,
                mostRequestedComponent,
                estimatedUpcoming7d,
                currentAvailableStock,
                attentionGroups,
            },
            upcomingRequirements7d,
            demandHistory: {
                frequentlyRequestedGroups: groupList.filter((g) => g.totalUnits > 0).slice(0, 5),
                componentBreakdown,
                dailyTrends,
                weeklyTrends,
            },
            regionalContext,
            recommendedActions,
            excludedRecordsCount: excludedIncompleteCount,
        };
    }

    /**
     * Compute Blood Bank AI Insights for:
     * - View 1: MY INVENTORY
     * - View 2: MY DISTRICT
     * - View 3: MY STATE
     */
    static async getBloodBankInsights(params: {
        bloodBankId: string;
        scope: "INVENTORY" | "DISTRICT" | "STATE";
        timeframeDays?: number;
        bloodGroup?: blood_group;
        bloodComponent?: blood_component;
    }): Promise<BloodBankAiInsightsResult> {
        const { bloodBankId, scope, timeframeDays = 30, bloodGroup, bloodComponent } = params;
        const now = new Date();
        const startDate = new Date(now.getTime() - timeframeDays * 24 * 60 * 60 * 1000);

        // 1. Fetch current blood bank and location
        const targetBloodBank = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: bloodBankId },
            select: {
                bloodbankid: true,
                bloodbankname: true,
                city: true,
                state: true,
                pincode: true,
            },
        });

        if (!targetBloodBank) {
            throw new Error("Blood bank record not found");
        }

        const bbLocation = getNormalizedLocation(targetBloodBank);

        // Location incomplete check
        if (!bbLocation.isValid && (scope === "DISTRICT" || scope === "STATE")) {
            return {
                scope,
                bloodBankId: targetBloodBank.bloodbankid,
                bloodBankName: targetBloodBank.bloodbankname,
                location: {
                    district: bbLocation.district,
                    state: bbLocation.state,
                    displayDistrict: bbLocation.displayDistrict,
                    displayState: bbLocation.displayState,
                    isValid: false,
                    missingLocationMessage: "Location information is incomplete. Regional insights are unavailable for this record.",
                },
                historicalWindowDays: timeframeDays,
                isDataSufficient: false,
                dataQualityNote: "Location information is incomplete. Regional insights are unavailable for this record.",
                recommendedActions: [
                    "Update your blood bank facility profile with a valid city/district and state to view regional supply and demand.",
                ],
            };
        }

        // -------------------------------------------------------------
        // SCOPE 1: MY INVENTORY (Solely authenticated blood bank units)
        // -------------------------------------------------------------
        if (scope === "INVENTORY") {
            const expiryResult = await BloodExpiryPredictionService.calculateExpiryAndWastage({
                bloodBankId,
                bloodGroup,
                bloodComponent,
            });

            // Map units expiring soon table (<= 7 days and > 0 days, or expiring critical <= 3d)
            const unitsExpiringSoon = expiryResult.units
                .filter((u) => u.daysRemaining > 0 && u.daysRemaining <= 7)
                .slice(0, 20)
                .map((u) => ({
                    unitBarcode: u.unitbarcode,
                    bloodGroupDisplay: u.bloodGroupDisplay,
                    componentDisplay: u.componentDisplay,
                    expiryDate: u.expirydate instanceof Date ? u.expirydate.toISOString().split("T")[0] : String(u.expirydate).split("T")[0],
                    daysRemaining: Math.max(0, Math.round(u.daysRemaining * 10) / 10),
                    ttiStatus: u.ttiscreeningstatus,
                    recommendedAction: u.daysRemaining <= 3
                        ? "Urgent: Prioritize for immediate issue or transfer before expiry."
                        : "Prioritize allocation via FEFO queue within 7 days.",
                }));

            // Map units to use first (Strictly FEFO eligible: unexpired, available, TTI passed)
            const unitsToUseFirst = expiryResult.fefoQueue
                .filter((u) => u.isFefoEligible)
                .slice(0, 15)
                .map((u) => ({
                    unitBarcode: u.unitbarcode,
                    bloodGroupDisplay: u.bloodGroupDisplay,
                    componentDisplay: u.componentDisplay,
                    expiryDate: u.expirydate instanceof Date ? u.expirydate.toISOString().split("T")[0] : String(u.expirydate).split("T")[0],
                    daysRemaining: Math.max(0, Math.round(u.daysRemaining * 10) / 10),
                    storageBin: u.storagebinlocation || "Standard Cold Storage",
                }));

            const actionsToReduceWastage: string[] = [];
            if (expiryResult.summary.expiringCriticalCount > 0) {
                actionsToReduceWastage.push(
                    `You have ${expiryResult.summary.expiringCriticalCount} unit(s) expiring within 3 days. Prioritize these for immediate clinical requisitions.`
                );
            }
            if (expiryResult.summary.expiredCount > 0) {
                actionsToReduceWastage.push(
                    `${expiryResult.summary.expiredCount} expired unit(s) detected. Remove from active storage and log formal biomedical disposal.`
                );
            }
            if (unitsToUseFirst.length > 0) {
                actionsToReduceWastage.push(
                    "Follow earliest-expiry-first (FEFO) dispensing order to maintain minimum turnover risk."
                );
            }

            return {
                scope: "INVENTORY",
                bloodBankId: targetBloodBank.bloodbankid,
                bloodBankName: targetBloodBank.bloodbankname,
                location: {
                    district: bbLocation.district,
                    state: bbLocation.state,
                    displayDistrict: bbLocation.displayDistrict,
                    displayState: bbLocation.displayState,
                    isValid: bbLocation.isValid,
                },
                historicalWindowDays: timeframeDays,
                isDataSufficient: expiryResult.summary.totalActiveUnits > 0,
                dataQualityNote: expiryResult.summary.totalActiveUnits > 0
                    ? `Inventory assessment based on ${expiryResult.summary.totalActiveUnits} active tracked unit(s).`
                    : "No active inventory records found.",
                inventoryOverview: {
                    totalAvailableUnits: expiryResult.summary.totalActiveUnits,
                    expiringWithin3Days: expiryResult.summary.expiringCriticalCount,
                    expiringWithin7Days: expiryResult.summary.expiringSoonCount,
                    expiredCount: expiryResult.summary.expiredCount,
                    eligibleAllocationCount: expiryResult.summary.fefoEligibleUnitsCount,
                },
                unitsExpiringSoon,
                unitsToUseFirst,
                wastageInsights: {
                    historicalWastageUnits: expiryResult.historicalWastage.totalWastedUnits,
                    unitsAtRiskOfExpiry: expiryResult.summary.expiringSoonCount,
                    estimatedPotentialWastageUnits: expiryResult.summary.predictedWastageUnits7d,
                    actionsToReduceWastage,
                },
                recommendedActions: actionsToReduceWastage,
            };
        }

        // -------------------------------------------------------------
        // SCOPES 2 & 3: MY DISTRICT & MY STATE (Regional Demand vs Supply)
        // -------------------------------------------------------------
        let excludedCount = 0;
        let districtHospitals: Array<{ hospitalid: string; city: string; state: string }> = [];
        let districtBloodBanks: Array<{ bloodbankid: string; city: string; state: string; bloodbankname: string }> = [];
        let allStateHospitals: Array<{ hospitalid: string; city: string; state: string }> = [];
        let allStateBloodBanks: Array<{ bloodbankid: string; city: string; state: string; bloodbankname: string }> = [];

        // Query all approved hospitals & blood banks
        const [hospList, bbList] = await Promise.all([
            prisma.hospitals.findMany({
                where: { approvalstatus: "APPROVED" as any },
                select: { hospitalid: true, city: true, state: true },
            }),
            prisma.bloodbanks.findMany({
                where: { approvalstatus: "APPROVED" as any },
                select: { bloodbankid: true, city: true, state: true, bloodbankname: true },
            }),
        ]);

        if (scope === "DISTRICT") {
            districtHospitals = hospList.filter((h) => {
                const loc = getNormalizedLocation(h);
                if (!loc.isValid) { excludedCount++; return false; }
                return loc.district === bbLocation.district && loc.state === bbLocation.state;
            });

            districtBloodBanks = bbList.filter((b) => {
                const loc = getNormalizedLocation(b);
                if (!loc.isValid) { excludedCount++; return false; }
                return loc.district === bbLocation.district && loc.state === bbLocation.state;
            });
            if (!districtBloodBanks.some((b) => b.bloodbankid === bloodBankId)) {
                districtBloodBanks.push(targetBloodBank);
            }
        } else {
            // STATE
            allStateHospitals = hospList.filter((h) => {
                const loc = getNormalizedLocation(h);
                if (!loc.isValid) { excludedCount++; return false; }
                return loc.state === bbLocation.state;
            });

            allStateBloodBanks = bbList.filter((b) => {
                const loc = getNormalizedLocation(b);
                if (!loc.isValid) { excludedCount++; return false; }
                return loc.state === bbLocation.state;
            });
            if (!allStateBloodBanks.some((b) => b.bloodbankid === bloodBankId)) {
                allStateBloodBanks.push(targetBloodBank);
            }
        }

        const scopedHospIds = scope === "DISTRICT" ? districtHospitals.map((h) => h.hospitalid) : allStateHospitals.map((h) => h.hospitalid);
        const scopedBbIds = scope === "DISTRICT" ? districtBloodBanks.map((b) => b.bloodbankid) : allStateBloodBanks.map((b) => b.bloodbankid);

        // Fetch regional blood requests
        const regionalRequests = await prisma.bloodrequests.findMany({
            where: {
                hospitalid: { in: scopedHospIds },
                createdat: { gte: startDate },
                status: { in: VALID_DEMAND_STATUSES },
                ...(bloodGroup ? { bloodgroup: bloodGroup } : {}),
                ...(bloodComponent ? { bloodcomponent: bloodComponent } : {}),
            },
            select: {
                requestid: true,
                hospitalid: true,
                bloodgroup: true,
                bloodcomponent: true,
                unitsrequired: true,
                createdat: true,
            },
            orderBy: { createdat: "asc" },
        });

        // Fetch regional available inventory (strictly eligible, non-expired, TTI passed)
        const regionalInventory = await prisma.inventoryunits.findMany({
            where: {
                bloodbankid: { in: scopedBbIds },
                status: "AVAILABLE",
                ttiscreeningstatus: "PASSED",
                expirydate: { gt: now },
                ...(bloodGroup ? { bloodgroup: bloodGroup } : {}),
                ...(bloodComponent ? { bloodcomponent: bloodComponent } : {}),
            },
            select: {
                unitid: true,
                bloodbankid: true,
                bloodgroup: true,
                bloodcomponent: true,
            },
        });

        // Compute regional demand stats
        const totalRegionalRequests = regionalRequests.length;
        const totalUnitsRequested = regionalRequests.reduce((sum, r) => sum + (r.unitsrequired || 1), 0);

        const groupReqMap = new Map<blood_group, number>();
        for (const bg of ALL_BLOOD_GROUPS) groupReqMap.set(bg, 0);
        for (const r of regionalRequests) {
            groupReqMap.set(r.bloodgroup, (groupReqMap.get(r.bloodgroup) || 0) + (r.unitsrequired || 1));
        }

        const breakdownByGroup: Array<{ bloodGroup: blood_group; displayName: string; totalUnits: number; percentage: number }> = [];
        groupReqMap.forEach((units, bg) => {
            const percentage = totalUnitsRequested > 0 ? Math.round((units / totalUnitsRequested) * 100) : 0;
            breakdownByGroup.push({
                bloodGroup: bg,
                displayName: BLOOD_GROUP_DISPLAY[bg],
                totalUnits: units,
                percentage,
            });
        });
        breakdownByGroup.sort((a, b) => b.totalUnits - a.totalUnits);
        const mostRequestedGroup = breakdownByGroup[0]?.totalUnits > 0 ? breakdownByGroup[0] : null;

        const compReqMap = new Map<blood_component, number>();
        for (const comp of ALL_COMPONENTS) compReqMap.set(comp, 0);
        for (const r of regionalRequests) {
            compReqMap.set(r.bloodcomponent, (compReqMap.get(r.bloodcomponent) || 0) + (r.unitsrequired || 1));
        }

        const breakdownByComp: Array<{ bloodComponent: blood_component; displayName: string; totalUnits: number }> = [];
        compReqMap.forEach((units, comp) => {
            breakdownByComp.push({
                bloodComponent: comp,
                displayName: COMPONENT_DISPLAY[comp],
                totalUnits: units,
            });
        });
        breakdownByComp.sort((a, b) => b.totalUnits - a.totalUnits);
        const mostRequestedComponent = breakdownByComp[0]?.totalUnits > 0 ? breakdownByComp[0] : null;

        // Daily continuous for 7-day projection
        const dailyReqMap = new Map<string, number>();
        for (let i = 0; i < timeframeDays; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            dailyReqMap.set(d.toISOString().split("T")[0], 0);
        }
        for (const r of regionalRequests) {
            if (!r.createdat) continue;
            const key = r.createdat.toISOString().split("T")[0];
            dailyReqMap.set(key, (dailyReqMap.get(key) || 0) + (r.unitsrequired || 1));
        }

        const dailyPoints: Array<{ date: string; actualUnits: number }> = [];
        dailyReqMap.forEach((actualUnits, date) => { dailyPoints.push({ date, actualUnits }); });
        dailyPoints.sort((a, b) => a.date.localeCompare(b.date));

        const weeklyTrends: Array<{ period: string; actualUnits: number }> = [];
        for (let i = 0; i < dailyPoints.length; i += 7) {
            const chunk = dailyPoints.slice(i, i + 7);
            const sumUnits = chunk.reduce((s, p) => s + p.actualUnits, 0);
            weeklyTrends.push({ period: `Week of ${chunk[0].date}`, actualUnits: sumUnits });
        }

        const { projected7d: estimatedUpcoming7d } = calculate7DayForecastFromDaily(dailyPoints);

        // Compute regional supply stats
        const totalAvailableSupply = regionalInventory.length;
        const supplyByGroupMap = new Map<blood_group, number>();
        for (const bg of ALL_BLOOD_GROUPS) supplyByGroupMap.set(bg, 0);
        for (const u of regionalInventory) {
            supplyByGroupMap.set(u.bloodgroup, (supplyByGroupMap.get(u.bloodgroup) || 0) + 1);
        }

        const supplyByGroup: Array<{ bloodGroup: blood_group; displayName: string; availableUnits: number }> = [];
        supplyByGroupMap.forEach((availableUnits, bg) => {
            supplyByGroup.push({
                bloodGroup: bg,
                displayName: BLOOD_GROUP_DISPLAY[bg],
                availableUnits,
            });
        });

        const supplyByCompMap = new Map<blood_component, number>();
        for (const c of ALL_COMPONENTS) supplyByCompMap.set(c, 0);
        for (const u of regionalInventory) {
            supplyByCompMap.set(u.bloodcomponent, (supplyByCompMap.get(u.bloodcomponent) || 0) + 1);
        }

        const supplyByComponent: Array<{ bloodComponent: blood_component; displayName: string; availableUnits: number }> = [];
        supplyByCompMap.forEach((availableUnits, comp) => {
            supplyByComponent.push({
                bloodComponent: comp,
                displayName: COMPONENT_DISPLAY[comp],
                availableUnits,
            });
        });

        // Demand vs Supply Comparison
        const demandSupplyComparison: BloodBankAiInsightsResult["demandSupplyComparison"] = [];
        const shortageAlerts: string[] = [];
        const summaryInsights: string[] = [];

        for (const bg of ALL_BLOOD_GROUPS) {
            if (bloodGroup && bg !== bloodGroup) continue;

            const reqUnits = groupReqMap.get(bg) || 0;
            const availUnits = supplyByGroupMap.get(bg) || 0;
            const bgShare = totalUnitsRequested > 0 ? reqUnits / totalUnitsRequested : 0.125;
            const projDemand7d = Math.max(reqUnits > 0 ? 1 : 0, Math.round(estimatedUpcoming7d * bgShare));
            const balance = availUnits - projDemand7d;

            let status: "Shortage Risk" | "Adequate Stock" | "Surplus" = "Adequate Stock";
            let statusMessage = "Supply appears sufficient for projected demand.";

            if (availUnits < projDemand7d) {
                status = "Shortage Risk";
                statusMessage = `${BLOOD_GROUP_DISPLAY[bg]} demand is higher than available regional supply (${availUnits} in stock vs ${projDemand7d} needed).`;
                shortageAlerts.push(
                    `Shortage Alert: ${BLOOD_GROUP_DISPLAY[bg]} regional supply (${availUnits} units) is below projected 7-day demand (${projDemand7d} units).`
                );
            } else if (availUnits > projDemand7d + 3) {
                status = "Surplus";
                statusMessage = `${BLOOD_GROUP_DISPLAY[bg]} stock is currently surplus (+${balance} units above projected demand).`;
            } else {
                statusMessage = `${BLOOD_GROUP_DISPLAY[bg]} stock appears sufficient for current demand.`;
            }

            demandSupplyComparison.push({
                bloodGroup: bg,
                displayName: BLOOD_GROUP_DISPLAY[bg],
                projectedDemand7d: projDemand7d,
                availableSupplyUnits: availUnits,
                balance,
                status,
                statusMessage,
            });
        }

        // Summary messages
        if (shortageAlerts.length > 0) {
            summaryInsights.push(shortageAlerts[0]);
        }
        if (demandSupplyComparison.some((c) => c.status === "Adequate Stock")) {
            const ad = demandSupplyComparison.find((c) => c.status === "Adequate Stock");
            summaryInsights.push(`${ad?.displayName} stock appears sufficient for current demand.`);
        }
        if (totalRegionalRequests < 5) {
            summaryInsights.push("More historical data is required for a reliable regional prediction.");
        }

        // Redistribution opportunities: Blood banks with surplus vs shortage
        const redistributionOpportunities: string[] = [];
        if (shortageAlerts.length > 0) {
            redistributionOpportunities.push(
                `Consider coordinating with blood banks in adjacent areas to transfer surplus units for groups facing deficit.`
            );
        }

        // District breakdown for STATE scope
        let districtBreakdown: NonNullable<BloodBankAiInsightsResult["regionalContext"]>["districtBreakdown"];
        if (scope === "STATE") {
            const distMap = new Map<string, { hospCount: Set<string>; bbCount: Set<string>; reqUnits: number; supplyUnits: number }>();

            const hospDist = new Map<string, string>();
            for (const h of allStateHospitals) {
                const loc = getNormalizedLocation(h);
                if (loc.isValid) {
                    hospDist.set(h.hospitalid, loc.displayDistrict);
                    const cur = distMap.get(loc.displayDistrict) || { hospCount: new Set(), bbCount: new Set(), reqUnits: 0, supplyUnits: 0 };
                    cur.hospCount.add(h.hospitalid);
                    distMap.set(loc.displayDistrict, cur);
                }
            }

            const bbDist = new Map<string, string>();
            for (const b of allStateBloodBanks) {
                const loc = getNormalizedLocation(b);
                if (loc.isValid) {
                    bbDist.set(b.bloodbankid, loc.displayDistrict);
                    const cur = distMap.get(loc.displayDistrict) || { hospCount: new Set(), bbCount: new Set(), reqUnits: 0, supplyUnits: 0 };
                    cur.bbCount.add(b.bloodbankid);
                    distMap.set(loc.displayDistrict, cur);
                }
            }

            for (const r of regionalRequests) {
                if (!r.hospitalid) continue;
                const dName = hospDist.get(r.hospitalid) || "Other";
                const cur = distMap.get(dName) || { hospCount: new Set(), bbCount: new Set(), reqUnits: 0, supplyUnits: 0 };
                cur.reqUnits += r.unitsrequired || 1;
                distMap.set(dName, cur);
            }

            for (const u of regionalInventory) {
                const dName = bbDist.get(u.bloodbankid) || "Other";
                const cur = distMap.get(dName) || { hospCount: new Set(), bbCount: new Set(), reqUnits: 0, supplyUnits: 0 };
                cur.supplyUnits += 1;
                distMap.set(dName, cur);
            }

            districtBreakdown = [];
            distMap.forEach((val, dName) => {
                const bal = val.supplyUnits - val.reqUnits;
                let status: "Shortage Risk" | "Adequate Stock" | "Surplus" = "Adequate Stock";
                if (bal < 0) status = "Shortage Risk";
                else if (bal > 5) status = "Surplus";

                districtBreakdown!.push({
                    districtName: dName,
                    hospitalCount: val.hospCount.size,
                    bloodBankCount: val.bbCount.size,
                    requestedUnits: val.reqUnits,
                    availableSupplyUnits: val.supplyUnits,
                    balance: bal,
                    status,
                });
            });
            districtBreakdown.sort((a: any, b: any) => b.requestedUnits - a.requestedUnits);
        }

        const isDataSufficient = totalRegionalRequests >= 5;
        const dataQualityNote = isDataSufficient
            ? `Regional intelligence aggregated across ${scope === "DISTRICT" ? districtHospitals.length : allStateHospitals.length} hospitals and ${scopedBbIds.length} blood banks.`
            : "Not enough historical data is available to estimate future demand.";

        const recommendedActions: string[] = [];
        if (scope === "DISTRICT") {
            if (shortageAlerts.length > 0) {
                recommendedActions.push(shortageAlerts[0]);
            }
            if (mostRequestedGroup) {
                recommendedActions.push(
                    `District hospitals request ${mostRequestedGroup.displayName} most frequently (${mostRequestedGroup.totalUnits} units in the last ${timeframeDays} days).`
                );
            }
            recommendedActions.push(
                `Ensure participating blood banks maintain regular stock intake to cover the projected 7-day requirement of ${estimatedUpcoming7d} unit(s).`
            );
        } else {
            // STATE
            if (shortageAlerts.length > 0) {
                recommendedActions.push(
                    `State-level shortage detected for ${shortageAlerts.length} blood group(s). Coordinated inter-district supply routing recommended.`
                );
            }
            if (districtBreakdown && districtBreakdown.length > 0) {
                const topD = districtBreakdown[0];
                recommendedActions.push(
                    `${topD.districtName} records the highest blood demand in ${bbLocation.displayState} (${topD.requestedUnits} requested units).`
                );
            }
        }

        return {
            scope,
            bloodBankId: targetBloodBank.bloodbankid,
            bloodBankName: targetBloodBank.bloodbankname,
            location: {
                district: bbLocation.district,
                state: bbLocation.state,
                displayDistrict: bbLocation.displayDistrict,
                displayState: bbLocation.displayState,
                isValid: bbLocation.isValid,
            },
            historicalWindowDays: timeframeDays,
            isDataSufficient,
            dataQualityNote,
            regionalDemand: {
                totalRequestsCount: totalRegionalRequests,
                totalUnitsRequested,
                mostRequestedGroup,
                mostRequestedComponent,
                estimatedUpcoming7d,
                historicalWeeklyTrends: weeklyTrends,
                breakdownByGroup,
            },
            regionalSupply: {
                participatingBloodBanksCount: scopedBbIds.length,
                totalAvailableUnits: totalAvailableSupply,
                supplyByGroup,
                supplyByComponent,
            },
            demandSupplyComparison,
            regionalContext: {
                districtName: bbLocation.displayDistrict,
                stateName: bbLocation.displayState,
                shortageAlerts,
                redistributionOpportunities,
                summaryInsights,
                districtBreakdown,
            },
            recommendedActions,
            excludedRecordsCount: excludedCount,
        };
    }
}
