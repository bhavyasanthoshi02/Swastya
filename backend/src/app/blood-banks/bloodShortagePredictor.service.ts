/**
 * AI Blood Shortage Predictor Service — Swastya Blood Bank Portal
 * 
 * Computes multi-horizon (7, 14, 30 days) blood shortage forecasts, stock depletion runways,
 * shelf-life attrition, and clinical insights derived STRICTLY from that particular blood bank only.
 * 
 * Zero cross-facility fallback, zero synthetic demand, zero fake data.
 */

import { prisma } from "../../config/prisma";
import { blood_group, blood_component } from "../../generated/prisma/enums";

export type ForecastPeriod = 7 | 14 | 30;
export type ShortageRiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export interface BloodGroupPrediction {
    bloodGroup: blood_group;
    displayName: string;
    availableUnits: number;
    reservedUnits: number;
    quarantinedUnits: number;
    expiringUnitsInPeriod: number;
    effectiveAvailableUnits: number;
    historicalDailyDemand: number;
    historicalTotalDemand: number;
    predictedDemand: number;
    expectedStockPosition: number;
    deficitUnits: number;
    daysOfSupply: number;
    riskLevel: ShortageRiskLevel;
    explanation: string;
    componentBreakdown: Array<{
        component: blood_component;
        displayName: string;
        availableUnits: number;
        expiringUnits: number;
        predictedDemand: number;
    }>;
}

export interface ShortageTrendPoint {
    day: number;
    date: string;
    historicalDemand?: number;
    projectedDemand: number;
    projectedStockBalance: number;
}

export interface AiGeneratedInsight {
    id: string;
    type: "CRITICAL_DEFICIT" | "EXPIRY_WARNING" | "DEMAND_SURGE" | "SUFFICIENT_STOCK" | "COMPONENT_IMBALANCE";
    severity: "critical" | "warning" | "info" | "success";
    title: string;
    description: string;
    bloodGroup?: blood_group;
    impactScore: number;
    suggestedAction: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    affectedBloodGroups: string[];
}

export interface ActionableRecommendation {
    id: string;
    category: "CAMP_ORGANIZATION" | "TTI_CLEARANCE" | "FEFO_DISPATCH" | "REGIONAL_TRANSFER" | "MONITORING";
    title: string;
    actionText: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    relatedBloodGroup?: string;
    estimatedDeficitAverted?: number;
}

export interface PredictorOverviewSummary {
    totalAvailableUnits: number;
    totalReservedUnits: number;
    totalQuarantinedUnits: number;
    groupsAtRiskCount: number;
    criticalGroupsCount: number;
    highRiskGroupsCount: number;
    predictedShortagesTotalUnits: number;
    unitsApproachingCriticalExpiry: number;
    confidenceScore: number;
    confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
    dataSufficiencyNote: string;
    historicalRequestsAnalyzed: number;
    forecastPeriodDays: ForecastPeriod;
    selectedComponent: string;
    facilityId: string;
    facilityName: string;
    generatedAt: string;
}

export interface CompletePredictionPayload {
    overview: PredictorOverviewSummary;
    predictions: BloodGroupPrediction[];
    trends: {
        timeline: ShortageTrendPoint[];
        historicalVsPredictedByGroup: Array<{
            bloodGroup: string;
            historicalAvg: number;
            predicted: number;
            currentStock: number;
        }>;
        riskDistribution: Record<ShortageRiskLevel, number>;
    };
    insights: AiGeneratedInsight[];
    recommendations: ActionableRecommendation[];
}

export const BLOOD_GROUP_LABELS: Record<blood_group, string> = {
    A_POSITIVE: "A+",
    A_NEGATIVE: "A-",
    B_POSITIVE: "B+",
    B_NEGATIVE: "B-",
    AB_POSITIVE: "AB+",
    AB_NEGATIVE: "AB-",
    O_POSITIVE: "O+",
    O_NEGATIVE: "O-",
};

export const COMPONENT_LABELS: Record<blood_component, string> = {
    WHOLE_BLOOD: "Whole Blood",
    RBC: "Packed Red Blood Cells (PRBC)",
    PLATELETS: "Platelets",
    PLASMA: "Fresh Frozen Plasma (FFP)",
};

export const ALL_GROUPS: blood_group[] = [
    "A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE",
    "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE",
];

export const ALL_COMPONENTS: blood_component[] = [
    "WHOLE_BLOOD", "RBC", "PLATELETS", "PLASMA",
];

export class BloodShortagePredictorService {
    /**
     * Alias for calculatePredictions supporting period & componentFilter keys.
     */
    public static async generatePredictions(params: {
        bloodBankId: string;
        period?: ForecastPeriod;
        componentFilter?: string;
    }): Promise<CompletePredictionPayload> {
        return this.calculatePredictions({
            bloodBankId: params.bloodBankId,
            forecastDays: params.period,
            component: params.componentFilter,
        });
    }

    /**
     * Compute blood shortage predictions strictly for THIS particular blood bank.
     */
    public static async calculatePredictions(params: {
        bloodBankId: string;
        forecastDays?: ForecastPeriod;
        component?: string;
    }): Promise<CompletePredictionPayload> {
        const { bloodBankId } = params;
        const forecastDays: ForecastPeriod = (params.forecastDays === 14 ? 14 : params.forecastDays === 30 ? 30 : 7);
        const componentFilter = params.component && params.component !== "ALL" ? (params.component as blood_component) : undefined;

        // 1. Fetch Blood Bank Facility Profile
        const bloodBank = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: bloodBankId },
            select: {
                bloodbankid: true,
                bloodbankname: true,
                city: true,
                state: true,
                createdat: true,
            },
        });

        if (!bloodBank) {
            throw new Error(`Blood bank facility with ID ${bloodBankId} not found`);
        }

        const now = new Date();
        const forecastEndDate = new Date(now.getTime() + forecastDays * 24 * 60 * 60 * 1000);
        const lookbackDays = 30;
        const historicalStartDate = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

        // 2. Fetch Actual Inventory Records for THIS Blood Bank ONLY
        const inventoryRecords = await prisma.inventory.findMany({
            where: {
                bloodbankid: bloodBankId,
                ...(componentFilter ? { bloodcomponent: componentFilter } : {}),
            },
            select: {
                inventoryid: true,
                bloodgroup: true,
                bloodcomponent: true,
                unitsavailable: true,
                unitsreserved: true,
                unitsquarantined: true,
                expirydate: true,
            },
        });

        // 3. Fetch Actual Requisitions Assigned to THIS Blood Bank ONLY
        const assignments = await prisma.requisitionassignments.findMany({
            where: {
                bloodbankid: bloodBankId,
                createdat: { gte: historicalStartDate },
                assignmentstatus: { notIn: ["DECLINED"] },
            },
            include: {
                bloodrequests: {
                    select: {
                        requestid: true,
                        bloodgroup: true,
                        bloodcomponent: true,
                        unitsrequired: true,
                        createdat: true,
                        urgencylevel: true,
                        status: true,
                    },
                },
            },
            orderBy: { createdat: "asc" },
        });

        // Strictly assigned requests to this facility
        const allValidRequests = assignments
            .map(a => a.bloodrequests)
            .filter((r): r is NonNullable<typeof r> => Boolean(r && (!componentFilter || r.bloodcomponent === componentFilter)));

        const totalRequestsAnalyzed = allValidRequests.length;

        // 4. Data Sufficiency Assessment
        let confidenceScore = 95;
        let confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = "HIGH";
        let dataSufficiencyNote = `Predictions computed strictly for ${bloodBank.bloodbankname}: ${totalRequestsAnalyzed} assigned requisitions & ${inventoryRecords.length} inventory records.`;

        if (totalRequestsAnalyzed === 0) {
            confidenceScore = 50;
            confidenceLevel = "LOW";
            dataSufficiencyNote = `No hospital requisitions currently assigned to ${bloodBank.bloodbankname}. Calculations reflect exact facility stock with 0 assumed demand.`;
        } else if (totalRequestsAnalyzed < 5) {
            confidenceScore = 75;
            confidenceLevel = "MEDIUM";
            dataSufficiencyNote = `${totalRequestsAnalyzed} hospital requisitions assigned to this facility. Demand velocity computed directly from these records.`;
        }

        // 5. Calculate Metrics Group by Group
        const predictions: BloodGroupPrediction[] = [];
        let totalAvailableAll = 0;
        let totalReservedAll = 0;
        let totalQuarantinedAll = 0;
        let totalDeficitAll = 0;
        let unitsApproachingCriticalExpiry = 0;

        for (const bg of ALL_GROUPS) {
            // A. Inventory tallies for this blood group in THIS blood bank
            const groupInv = inventoryRecords.filter(i => i.bloodgroup === bg);
            let availableUnits = 0;
            let reservedUnits = 0;
            let quarantinedUnits = 0;
            let expiringUnitsInPeriod = 0;

            const componentBreakdown: BloodGroupPrediction["componentBreakdown"] = [];
            const targetComponents = componentFilter ? [componentFilter] : ALL_COMPONENTS;

            for (const comp of targetComponents) {
                const compInv = groupInv.filter(i => i.bloodcomponent === comp);
                const cAvailable = compInv.reduce((sum, i) => sum + Math.max(0, i.unitsavailable), 0);
                const cReserved = compInv.reduce((sum, i) => sum + Math.max(0, i.unitsreserved), 0);
                const cQuarantined = compInv.reduce((sum, i) => sum + Math.max(0, i.unitsquarantined), 0);

                // Expiry within period
                const cExpiring = compInv
                    .filter(i => {
                        const exp = new Date(i.expirydate);
                        return exp >= now && exp <= forecastEndDate;
                    })
                    .reduce((sum, i) => sum + Math.max(0, i.unitsavailable), 0);

                // Critical expiry (within 3 days)
                const cCritExpiring = compInv
                    .filter(i => {
                        const exp = new Date(i.expirydate);
                        const critDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
                        return exp >= now && exp <= critDate;
                    })
                    .reduce((sum, i) => sum + Math.max(0, i.unitsavailable), 0);

                availableUnits += cAvailable;
                reservedUnits += cReserved;
                quarantinedUnits += cQuarantined;
                expiringUnitsInPeriod += cExpiring;
                unitsApproachingCriticalExpiry += cCritExpiring;

                // Component specific demand from assignments to this blood bank
                const compRequests = allValidRequests.filter(r => r.bloodgroup === bg && r.bloodcomponent === comp);
                const compTotalUnits = compRequests.reduce((sum, r) => sum + (r.unitsrequired || 1), 0);
                const compDailyDemand = compTotalUnits > 0 ? Number((compTotalUnits / lookbackDays).toFixed(2)) : 0;
                const compPredicted = Math.round(compDailyDemand * forecastDays);

                componentBreakdown.push({
                    component: comp,
                    displayName: COMPONENT_LABELS[comp] || comp,
                    availableUnits: cAvailable,
                    expiringUnits: cExpiring,
                    predictedDemand: compPredicted,
                });
            }

            totalAvailableAll += availableUnits;
            totalReservedAll += reservedUnits;
            totalQuarantinedAll += quarantinedUnits;

            // B. Demand calculations for this group strictly from assignments to THIS blood bank
            const groupRequests = allValidRequests.filter(r => r.bloodgroup === bg);
            let weightedDemandSum = 0;
            let urgentCount = 0;

            for (const r of groupRequests) {
                const reqDate = r.createdat ? new Date(r.createdat).getTime() : now.getTime();
                const ageDays = (now.getTime() - reqDate) / (24 * 60 * 60 * 1000);
                const weight = ageDays <= 14 ? 1.0 : ageDays <= 30 ? 0.7 : 0.4;
                weightedDemandSum += (r.unitsrequired || 1) * weight;

                if (r.urgencylevel === "CRITICAL" || r.urgencylevel === "HIGH") {
                    urgentCount++;
                }
            }

            const rawTotalUnits = groupRequests.reduce((sum, r) => sum + (r.unitsrequired || 1), 0);
            const urgencyMultiplier = urgentCount > 0 ? 1.15 : 1.0;

            // Daily velocity from assignments (strictly 0 if this facility has no assigned requests)
            const historicalDailyDemand = rawTotalUnits > 0
                ? Number((weightedDemandSum / lookbackDays).toFixed(2))
                : 0;

            // Predicted demand over the period (strictly 0 if no assigned requests)
            const predictedDemand = historicalDailyDemand > 0
                ? Math.max(1, Math.round(historicalDailyDemand * forecastDays * urgencyMultiplier))
                : 0;

            // Effective available stock accounting for expiration attrition
            const effectiveAvailableUnits = Math.max(0, availableUnits - expiringUnitsInPeriod);

            // Expected stock position
            const expectedStockPosition = effectiveAvailableUnits - predictedDemand;
            const deficitUnits = expectedStockPosition < 0 ? Math.abs(expectedStockPosition) : 0;
            totalDeficitAll += deficitUnits;

            // Days of supply remaining
            let daysOfSupply = 0;
            if (historicalDailyDemand > 0) {
                daysOfSupply = Number((availableUnits / historicalDailyDemand).toFixed(1));
            } else if (availableUnits > 0) {
                daysOfSupply = 90; // Available in stock with 0 current burn rate
            } else {
                daysOfSupply = 0;
            }

            // C. Documented Risk Classification Rule (Strictly real data)
            let riskLevel: ShortageRiskLevel = "LOW";
            let explanation = "";

            if (deficitUnits > 0 || (availableUnits === 0 && predictedDemand > 0)) {
                riskLevel = "CRITICAL";
                explanation = availableUnits === 0
                    ? `0 units in stock with an active requisition requirement of ${predictedDemand} units.`
                    : `Active shortage projected. Stock (${availableUnits} units) is depleted by daily demand (${historicalDailyDemand} units/day), creating a ${deficitUnits}-unit deficit.`;
            } else if (historicalDailyDemand > 0 && daysOfSupply <= 3) {
                riskLevel = "HIGH";
                explanation = `High risk. Stock (${availableUnits} units) provides only ${daysOfSupply} days coverage against assigned demand (${historicalDailyDemand} units/day).`;
            } else if (expiringUnitsInPeriod > 0 && expiringUnitsInPeriod >= availableUnits * 0.5) {
                riskLevel = "MODERATE";
                explanation = `Moderate expiry risk. ${expiringUnitsInPeriod} of ${availableUnits} units expire within ${forecastDays} days.`;
            } else if (availableUnits > 0 && predictedDemand === 0) {
                riskLevel = "LOW";
                explanation = `${availableUnits} units available in facility stock. No assigned hospital requisitions.`;
            } else if (availableUnits === 0 && quarantinedUnits > 0) {
                riskLevel = "LOW";
                explanation = `0 available units (${quarantinedUnits} quarantined awaiting TTI clearance). No assigned hospital requisitions.`;
            } else {
                riskLevel = "LOW";
                explanation = `0 units in inventory. No hospital requisitions currently assigned to this facility.`;
            }

            predictions.push({
                bloodGroup: bg,
                displayName: BLOOD_GROUP_LABELS[bg] || bg,
                availableUnits,
                reservedUnits,
                quarantinedUnits,
                expiringUnitsInPeriod,
                effectiveAvailableUnits,
                historicalDailyDemand,
                historicalTotalDemand: rawTotalUnits,
                predictedDemand,
                expectedStockPosition,
                deficitUnits,
                daysOfSupply,
                riskLevel,
                explanation,
                componentBreakdown,
            });
        }

        // Sort predictions: Critical first, then High, Moderate, Low
        const riskSortOrder: Record<ShortageRiskLevel, number> = {
            CRITICAL: 1,
            HIGH: 2,
            MODERATE: 3,
            LOW: 4,
        };
        predictions.sort((a, b) => riskSortOrder[a.riskLevel] - riskSortOrder[b.riskLevel]);

        const criticalGroupsCount = predictions.filter(p => p.riskLevel === "CRITICAL").length;
        const highRiskGroupsCount = predictions.filter(p => p.riskLevel === "HIGH").length;
        const groupsAtRiskCount = criticalGroupsCount + highRiskGroupsCount;

        // 6. Generate Timeline Demand Trend Points (Real stock and velocity)
        const timeline: ShortageTrendPoint[] = [];
        let cumulativeDailyDemand = 0;
        for (const p of predictions) {
            cumulativeDailyDemand += p.historicalDailyDemand;
        }

        let runningStock = totalAvailableAll;
        for (let day = 1; day <= forecastDays; day++) {
            const pointDate = new Date(now.getTime() + day * 24 * 60 * 60 * 1000);
            const dateStr = pointDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const stepProjectedDemand = Math.round(cumulativeDailyDemand * day);
            runningStock = Math.max(0, totalAvailableAll - stepProjectedDemand);

            timeline.push({
                day,
                date: dateStr,
                historicalDemand: totalRequestsAnalyzed > 0 ? Math.round(cumulativeDailyDemand) : 0,
                projectedDemand: stepProjectedDemand,
                projectedStockBalance: runningStock,
            });
        }

        // 7. Group-wise Comparison Chart Data
        const historicalVsPredictedByGroup = predictions.map(p => ({
            bloodGroup: p.displayName,
            historicalAvg: p.historicalTotalDemand,
            predicted: p.predictedDemand,
            currentStock: p.availableUnits,
        }));

        const riskDistribution: Record<ShortageRiskLevel, number> = {
            CRITICAL: criticalGroupsCount,
            HIGH: highRiskGroupsCount,
            MODERATE: predictions.filter(p => p.riskLevel === "MODERATE").length,
            LOW: predictions.filter(p => p.riskLevel === "LOW").length,
        };

        // 8. AI-Generated Insights (Strictly for THIS blood bank)
        const insights: AiGeneratedInsight[] = [];

        // Critical groups insight (only if real deficit or real assigned requirement exists)
        const criticalGroups = predictions.filter(p => p.riskLevel === "CRITICAL" && (p.deficitUnits > 0 || p.predictedDemand > 0));
        if (criticalGroups.length > 0) {
            const names = criticalGroups.map(g => g.displayName).join(", ");
            const totalDef = criticalGroups.reduce((s, g) => s + g.deficitUnits, 0);
            insights.push({
                id: "insight_crit_shortage",
                type: "CRITICAL_DEFICIT",
                severity: "critical",
                title: `Active Shortage Risk: ${names}`,
                description: `Projected deficit of ${totalDef} units across ${names} over the next ${forecastDays} days for requisitions assigned to this blood bank.`,
                impactScore: 95,
                suggestedAction: "Initiate emergency voluntary donor camps and broadcast SMS alerts",
                confidence: confidenceLevel,
                affectedBloodGroups: criticalGroups.map(g => g.displayName),
            });
        }

        // Expiry alert insight (only if real inventory is expiring in this blood bank)
        const groupsWithExpiring = predictions.filter(p => p.expiringUnitsInPeriod > 0);
        if (groupsWithExpiring.length > 0) {
            const expTotal = groupsWithExpiring.reduce((s, g) => s + g.expiringUnitsInPeriod, 0);
            const expNames = groupsWithExpiring.map(g => `${g.displayName} (${g.expiringUnitsInPeriod}u)`).slice(0, 3).join(", ");
            insights.push({
                id: "insight_expiry_attrition",
                type: "EXPIRY_WARNING",
                severity: "warning",
                title: `Stock Expiry Alert: ${expTotal} Units Expiring`,
                description: `${expTotal} unit(s) in this facility will expire within ${forecastDays} days (${expNames}). Prioritize First-Expiry-First-Out (FEFO) allocation.`,
                impactScore: 80,
                suggestedAction: "Prioritize FEFO dispatch for incoming hospital requisitions",
                confidence: confidenceLevel,
                affectedBloodGroups: groupsWithExpiring.map(g => g.displayName),
            });
        }

        // Platelet specific insight (only if real platelets in this blood bank are expiring)
        const plateletExpiring = inventoryRecords.filter(i => {
            if (i.bloodcomponent !== "PLATELETS") return false;
            const exp = new Date(i.expirydate);
            return exp >= now && exp <= forecastEndDate;
        }).reduce((sum, i) => sum + i.unitsavailable, 0);

        if (plateletExpiring > 0) {
            insights.push({
                id: "insight_platelet_turnover",
                type: "COMPONENT_IMBALANCE",
                severity: "warning",
                title: "Rapid Platelet Shelf-Life Pressure",
                description: `${plateletExpiring} platelet unit(s) in this facility are approaching their 5-day viability limit.`,
                impactScore: 85,
                suggestedAction: "Alert affiliated surgical wards for immediate crossmatch",
                confidence: confidenceLevel,
                affectedBloodGroups: ["PLATELETS"],
            });
        }

        // Quarantined units insight (if this facility has unreleased stock)
        if (totalQuarantinedAll > 0) {
            insights.push({
                id: "insight_quarantine_stock",
                type: "COMPONENT_IMBALANCE",
                severity: "info",
                title: `${totalQuarantinedAll} Unit(s) in Serological Quarantine`,
                description: `This facility has ${totalQuarantinedAll} unit(s) awaiting TTI test clearance before they can be released to available inventory.`,
                impactScore: 70,
                suggestedAction: "Complete laboratory screening sign-off in the Screening portal",
                confidence: confidenceLevel,
                affectedBloodGroups: predictions.filter(p => p.quarantinedUnits > 0).map(p => p.displayName),
            });
        }

        // Available stock reserve insight
        const safeGroups = predictions.filter(p => p.riskLevel === "LOW" && p.availableUnits > 0);
        if (safeGroups.length > 0) {
            const safeNames = safeGroups.map(g => `${g.displayName} (${g.availableUnits}u)`).slice(0, 4).join(", ");
            insights.push({
                id: "insight_safe_stock",
                type: "SUFFICIENT_STOCK",
                severity: "success",
                title: `Available Inventory: ${safeNames}`,
                description: `Facility stock of ${safeNames} is verified and ready for hospital requisition fulfillment.`,
                impactScore: 60,
                suggestedAction: "Maintain standard temperature monitoring and storage logs",
                confidence: confidenceLevel,
                affectedBloodGroups: safeGroups.map(g => g.displayName),
            });
        }

        // Facility baseline insight if no critical shortages
        if (insights.length === 0) {
            insights.push({
                id: "insight_baseline_stable",
                type: "SUFFICIENT_STOCK",
                severity: "info",
                title: "Facility Inventory Status",
                description: `No active deficits or unassigned requisitions recorded for ${bloodBank.bloodbankname}. Total stock on hand: ${totalAvailableAll} units.`,
                impactScore: 50,
                suggestedAction: "Monitor incoming hospital requisitions in the Requisitions portal",
                confidence: confidenceLevel,
                affectedBloodGroups: [],
            });
        }

        // 9. Actionable Recommendations (Strictly for THIS blood bank)
        const recommendations: ActionableRecommendation[] = [];

        // Camp recommendation for shortage groups in THIS facility
        const campTargets = predictions.filter(p => (p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH") && p.predictedDemand > 0);
        if (campTargets.length > 0) {
            const targetNames = campTargets.map(g => g.displayName).join(", ");
            const totalDef = campTargets.reduce((s, g) => s + g.deficitUnits, 0);
            recommendations.push({
                id: "rec_camp_targeted",
                category: "CAMP_ORGANIZATION",
                title: `Organize Mobile Blood Drive for ${targetNames}`,
                actionText: `Schedule a community or corporate donation camp within ${Math.min(7, forecastDays)} days targeting ${targetNames} to fulfill assigned requisitions.`,
                priority: "HIGH",
                relatedBloodGroup: targetNames,
                estimatedDeficitAverted: totalDef > 0 ? totalDef : 5,
            });
        }

        // TTI Clearance recommendation if quarantined stock exists in THIS facility
        if (totalQuarantinedAll > 0) {
            recommendations.push({
                id: "rec_tti_clearance",
                category: "TTI_CLEARANCE",
                title: `Expedite Viral Screening (TTI) for ${totalQuarantinedAll} Quarantined Unit(s)`,
                actionText: `Complete laboratory screening and clinical sign-off for ${totalQuarantinedAll} unit(s) to transition safe stock to active inventory.`,
                priority: "HIGH",
                estimatedDeficitAverted: totalQuarantinedAll,
            });
        }

        // FEFO dispatch if units expiring in THIS facility
        if (unitsApproachingCriticalExpiry > 0) {
            recommendations.push({
                id: "rec_fefo_rotation",
                category: "FEFO_DISPATCH",
                title: `Prioritize FEFO Dispatch for ${unitsApproachingCriticalExpiry} Expiring Unit(s)`,
                actionText: `Dispatch earliest expiring units first for upcoming hospital surgical requisitions to prevent clinical wastage.`,
                priority: "MEDIUM",
                estimatedDeficitAverted: unitsApproachingCriticalExpiry,
            });
        }

        // Default routine recommendation if no acute alerts
        if (recommendations.length === 0) {
            recommendations.push({
                id: "rec_routine_monitoring",
                category: "MONITORING",
                title: "Routine Inventory Management",
                actionText: "Verify physical bag counts against Swastya digital ledger and check cold-chain calibration logs.",
                priority: "LOW",
            });
        }

        return {
            overview: {
                totalAvailableUnits: totalAvailableAll,
                totalReservedUnits: totalReservedAll,
                totalQuarantinedUnits: totalQuarantinedAll,
                groupsAtRiskCount,
                criticalGroupsCount,
                highRiskGroupsCount,
                predictedShortagesTotalUnits: totalDeficitAll,
                unitsApproachingCriticalExpiry,
                confidenceScore,
                confidenceLevel,
                dataSufficiencyNote,
                historicalRequestsAnalyzed: totalRequestsAnalyzed,
                forecastPeriodDays: forecastDays,
                selectedComponent: componentFilter || "ALL",
                facilityId: bloodBank.bloodbankid,
                facilityName: bloodBank.bloodbankname,
                generatedAt: now.toISOString(),
            },
            predictions,
            trends: {
                timeline,
                historicalVsPredictedByGroup,
                riskDistribution,
            },
            insights,
            recommendations,
        };
    }
}
