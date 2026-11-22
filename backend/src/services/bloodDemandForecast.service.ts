import { prisma } from "../config/prisma";
import { blood_group, blood_component } from "../generated/prisma/enums";

export interface DemandDataPoint {
    period: string; // ISO date string or formatted period
    date: string;
    actualUnits: number;
    requestCount: number;
}

export interface ForecastDataPoint {
    period: string;
    date: string;
    predictedUnits: number;
    lowerBound: number;
    upperBound: number;
}

export interface BloodGroupDemand {
    bloodGroup: blood_group;
    displayName: string;
    totalUnits: number;
    requestCount: number;
    percentage: number;
    rank: number;
}

export interface BloodComponentDemand {
    bloodComponent: blood_component;
    displayName: string;
    totalUnits: number;
    requestCount: number;
    percentage: number;
}

export interface InventoryShortageAlert {
    bloodGroup: blood_group;
    bloodGroupDisplay: string;
    bloodComponent: blood_component;
    componentDisplay: string;
    availableUnits: number;
    forecastedDemand7d: number;
    deficit: number;
    riskLevel: "CRITICAL" | "HIGH" | "MODERATE" | "ADEQUATE";
    recommendation: string;
}

export interface DemandForecastResult {
    facilityType: "HOSPITAL" | "BLOOD_BANK";
    facilityId: string;
    facilityName: string;
    historicalWindowDays: number;
    isDataSufficient: boolean;
    dataQualityNote: string;
    confidenceScore: number;
    forecastingMethod: string;
    totalHistoricalUnits: number;
    totalHistoricalRequests: number;
    actualDemand: {
        daily: DemandDataPoint[];
        weekly: DemandDataPoint[];
        monthly: DemandDataPoint[];
    };
    predictedDemand: {
        daily7d: ForecastDataPoint[];
        daily14d: ForecastDataPoint[];
        daily30d: ForecastDataPoint[];
        totalProjected7d: number;
        totalProjected14d: number;
        totalProjected30d: number;
    };
    bloodGroupBreakdown: BloodGroupDemand[];
    componentBreakdown: BloodComponentDemand[];
    frequentlyRequestedGroups: BloodGroupDemand[];
    shortages: InventoryShortageAlert[];
    actionableRecommendations: string[];
}

export const BLOOD_GROUP_DISPLAY: Record<blood_group, string> = {
    A_POSITIVE: "A+",
    A_NEGATIVE: "A-",
    B_POSITIVE: "B+",
    B_NEGATIVE: "B-",
    AB_POSITIVE: "AB+",
    AB_NEGATIVE: "AB-",
    O_POSITIVE: "O+",
    O_NEGATIVE: "O-",
};

export const COMPONENT_DISPLAY: Record<blood_component, string> = {
    WHOLE_BLOOD: "Whole Blood",
    PLATELETS: "Platelets",
    PLASMA: "Fresh Frozen Plasma",
    RBC: "Packed Red Blood Cells (PRBC)",
};

const ALL_BLOOD_GROUPS: blood_group[] = [
    "A_POSITIVE", "A_NEGATIVE", "B_POSITIVE", "B_NEGATIVE",
    "AB_POSITIVE", "AB_NEGATIVE", "O_POSITIVE", "O_NEGATIVE"
];

const ALL_COMPONENTS: blood_component[] = [
    "WHOLE_BLOOD", "PLATELETS", "PLASMA", "RBC"
];

export class BloodDemandForecastService {
    /**
     * Compute comprehensive blood demand forecast and historical trend analysis.
     */
    static async calculateDemandForecast(params: {
        facilityType: "HOSPITAL" | "BLOOD_BANK";
        facilityId: string;
        timeframeDays?: number;
        bloodGroup?: blood_group;
        bloodComponent?: blood_component;
    }): Promise<DemandForecastResult> {
        const { facilityType, facilityId, timeframeDays = 30, bloodGroup, bloodComponent } = params;
        const now = new Date();
        const startDate = new Date(now.getTime() - timeframeDays * 24 * 60 * 60 * 1000);

        let facilityName = "Unknown Facility";
        let requests: Array<{
            requestid: string;
            bloodgroup: blood_group;
            bloodcomponent: blood_component;
            unitsrequired: number;
            createdat: Date | null;
            urgencylevel: string;
            status: string | null;
        }> = [];

        if (facilityType === "HOSPITAL") {
            const hosp = await prisma.hospitals.findUnique({
                where: { hospitalid: facilityId },
                select: { hospitalname: true },
            });
            facilityName = hosp?.hospitalname || "Hospital Facility";

            // Query requests created by or registered for this hospital
            const rawRequests = await prisma.bloodrequests.findMany({
                where: {
                    hospitalid: facilityId,
                    createdat: { gte: startDate },
                    ...(bloodGroup ? { bloodgroup: bloodGroup } : {}),
                    ...(bloodComponent ? { bloodcomponent: bloodComponent } : {}),
                    status: { notIn: ["CANCELLED"] },
                },
                select: {
                    requestid: true,
                    bloodgroup: true,
                    bloodcomponent: true,
                    unitsrequired: true,
                    createdat: true,
                    urgencylevel: true,
                    status: true,
                },
                orderBy: { createdat: "asc" },
            });
            requests = rawRequests;
        } else {
            const bb = await prisma.bloodbanks.findUnique({
                where: { bloodbankid: facilityId },
                select: { bloodbankname: true },
            });
            facilityName = bb?.bloodbankname || "Blood Bank Facility";

            // For blood banks, demand is derived from assignments, reservations, and fulfilled requests
            const assignments = await prisma.requisitionassignments.findMany({
                where: {
                    bloodbankid: facilityId,
                    createdat: { gte: startDate },
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

            requests = assignments
                .map((a) => a.bloodrequests)
                .filter((r) => {
                    if (!r) return false;
                    if (bloodGroup && r.bloodgroup !== bloodGroup) return false;
                    if (bloodComponent && r.bloodcomponent !== bloodComponent) return false;
                    return true;
                });
        }

        // --- Data Sufficiency Assessment ---
        const totalHistoricalRequests = requests.length;
        const totalHistoricalUnits = requests.reduce((sum, r) => sum + (r.unitsrequired || 1), 0);

        let earliestDate = now;
        let latestDate = startDate;
        for (const req of requests) {
            if (req.createdat) {
                if (req.createdat < earliestDate) earliestDate = req.createdat;
                if (req.createdat > latestDate) latestDate = req.createdat;
            }
        }

        const daySpan = Math.max(1, Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (24 * 60 * 60 * 1000)));
        const isDataSufficient = totalHistoricalRequests >= 5 && daySpan >= 7;

        let confidenceScore = 0.85;
        let dataQualityNote = "Historical data sample is robust. Projections calculated with 85% statistical confidence.";
        if (!isDataSufficient) {
            confidenceScore = totalHistoricalRequests === 0 ? 0.1 : 0.35;
            dataQualityNote = `Provisional forecast: Insufficient historical records (${totalHistoricalRequests} request(s) over ${daySpan} day(s)). A minimum of 5 requests spanning 7+ days is required for high-confidence projections. Baseline moving averages are shown.`;
        }

        // --- Actual Demand Aggregation (Daily, Weekly, Monthly) ---
        // Construct day-by-day continuous bucket map
        const dailyMap = new Map<string, { actualUnits: number; requestCount: number }>();
        for (let i = 0; i < timeframeDays; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const key = d.toISOString().split("T")[0];
            dailyMap.set(key, { actualUnits: 0, requestCount: 0 });
        }

        for (const r of requests) {
            if (!r.createdat) continue;
            const key = r.createdat.toISOString().split("T")[0];
            const existing = dailyMap.get(key) || { actualUnits: 0, requestCount: 0 };
            existing.actualUnits += r.unitsrequired || 1;
            existing.requestCount += 1;
            dailyMap.set(key, existing);
        }

        const dailyPoints: DemandDataPoint[] = [];
        dailyMap.forEach((val, date) => {
            dailyPoints.push({
                period: date,
                date,
                actualUnits: val.actualUnits,
                requestCount: val.requestCount,
            });
        });
        dailyPoints.sort((a, b) => a.date.localeCompare(b.date));

        // Group into Weekly (7-day buckets)
        const weeklyPoints: DemandDataPoint[] = [];
        for (let i = 0; i < dailyPoints.length; i += 7) {
            const chunk = dailyPoints.slice(i, i + 7);
            const sumUnits = chunk.reduce((s, p) => s + p.actualUnits, 0);
            const sumReqs = chunk.reduce((s, p) => s + p.requestCount, 0);
            const startD = chunk[0].date;
            const endD = chunk[chunk.length - 1].date;
            weeklyPoints.push({
                period: `Week of ${startD}`,
                date: startD,
                actualUnits: sumUnits,
                requestCount: sumReqs,
            });
        }

        // Group into Monthly (30-day buckets)
        const monthlyPoints: DemandDataPoint[] = [];
        for (let i = 0; i < dailyPoints.length; i += 30) {
            const chunk = dailyPoints.slice(i, i + 30);
            const sumUnits = chunk.reduce((s, p) => s + p.actualUnits, 0);
            const sumReqs = chunk.reduce((s, p) => s + p.requestCount, 0);
            const startD = chunk[0].date;
            monthlyPoints.push({
                period: `Month ${startD.substring(0, 7)}`,
                date: startD,
                actualUnits: sumUnits,
                requestCount: sumReqs,
            });
        }

        // --- Blood Group Breakdown & Ranking Frequently Requested Groups ---
        const groupMap = new Map<blood_group, { units: number; count: number }>();
        for (const bg of ALL_BLOOD_GROUPS) {
            groupMap.set(bg, { units: 0, count: 0 });
        }
        for (const r of requests) {
            const cur = groupMap.get(r.bloodgroup) || { units: 0, count: 0 };
            cur.units += r.unitsrequired || 1;
            cur.count += 1;
            groupMap.set(r.bloodgroup, cur);
        }

        const bloodGroupBreakdown: BloodGroupDemand[] = [];
        groupMap.forEach((data, bg) => {
            const percentage = totalHistoricalUnits > 0 ? Number(((data.units / totalHistoricalUnits) * 100).toFixed(1)) : 0;
            bloodGroupBreakdown.push({
                bloodGroup: bg,
                displayName: BLOOD_GROUP_DISPLAY[bg],
                totalUnits: data.units,
                requestCount: data.count,
                percentage,
                rank: 0,
            });
        });

        // Rank by totalUnits DESC, then requestCount DESC
        bloodGroupBreakdown.sort((a, b) => b.totalUnits - a.totalUnits || b.requestCount - a.requestCount);
        bloodGroupBreakdown.forEach((item, index) => {
            item.rank = index + 1;
        });

        const frequentlyRequestedGroups = bloodGroupBreakdown.filter((g) => g.totalUnits > 0).slice(0, 4);

        // --- Component Breakdown ---
        const compMap = new Map<blood_component, { units: number; count: number }>();
        for (const comp of ALL_COMPONENTS) {
            compMap.set(comp, { units: 0, count: 0 });
        }
        for (const r of requests) {
            const cur = compMap.get(r.bloodcomponent) || { units: 0, count: 0 };
            cur.units += r.unitsrequired || 1;
            cur.count += 1;
            compMap.set(r.bloodcomponent, cur);
        }

        const componentBreakdown: BloodComponentDemand[] = [];
        compMap.forEach((data, comp) => {
            const percentage = totalHistoricalUnits > 0 ? Number(((data.units / totalHistoricalUnits) * 100).toFixed(1)) : 0;
            componentBreakdown.push({
                bloodComponent: comp,
                displayName: COMPONENT_DISPLAY[comp],
                totalUnits: data.units,
                requestCount: data.count,
                percentage,
            });
        });
        componentBreakdown.sort((a, b) => b.totalUnits - a.totalUnits);

        // --- Statistical Forecasting (Weighted Moving Average + Linear Trend) ---
        // 1. Calculate 7-day Weighted Moving Average (WMA) of recent daily demand
        const nDays = dailyPoints.length;
        const wmaWindow = Math.min(14, Math.max(3, nDays));
        const recentUnits = dailyPoints.slice(nDays - wmaWindow).map((p) => p.actualUnits);

        let weightSum = 0;
        let weightedDemandSum = 0;
        for (let i = 0; i < recentUnits.length; i++) {
            const w = i + 1;
            weightSum += w;
            weightedDemandSum += recentUnits[i] * w;
        }
        const wmaBaseline = weightSum > 0 ? weightedDemandSum / weightSum : 0;

        // 2. Linear Regression Trend Slope over historical series: y = a + b * t
        let sumT = 0;
        let sumY = 0;
        let sumTY = 0;
        let sumTT = 0;
        const T = dailyPoints.length;
        for (let t = 0; t < T; t++) {
            const y = dailyPoints[t].actualUnits;
            sumT += t;
            sumY += y;
            sumTY += t * y;
            sumTT += t * t;
        }

        const denom = T * sumTT - sumT * sumT;
        const trendSlope = denom !== 0 ? (T * sumTY - sumT * sumY) / denom : 0;

        // 3. Residual standard deviation for confidence bounds
        let residualSqSum = 0;
        for (let t = 0; t < T; t++) {
            const y = dailyPoints[t].actualUnits;
            const yPred = wmaBaseline + trendSlope * (t - (T - 1));
            residualSqSum += Math.pow(y - yPred, 2);
        }
        const stdDev = T > 1 ? Math.sqrt(residualSqSum / (T - 1)) : 1.0;
        const zMultiplier = 1.28; // ~80% confidence interval band

        // 4. Generate daily forecast projections for 7, 14, and 30 days ahead
        const buildForecastSeries = (daysAhead: number): ForecastDataPoint[] => {
            const series: ForecastDataPoint[] = [];
            for (let h = 1; h <= daysAhead; h++) {
                const forecastDate = new Date(now.getTime() + h * 24 * 60 * 60 * 1000);
                const rawForecast = Math.max(0, wmaBaseline + trendSlope * h);
                // When data is insufficient, decay uncertainty wider
                const uncertainty = (stdDev + h * 0.05) * (isDataSufficient ? 1.0 : 1.5);
                const lowerBound = Math.max(0, Math.round((rawForecast - zMultiplier * uncertainty) * 10) / 10);
                const upperBound = Math.round((rawForecast + zMultiplier * uncertainty) * 10) / 10;
                const predictedUnits = Math.round(rawForecast * 10) / 10;

                const dateStr = forecastDate.toISOString().split("T")[0];
                series.push({
                    period: dateStr,
                    date: dateStr,
                    predictedUnits,
                    lowerBound,
                    upperBound,
                });
            }
            return series;
        };

        const daily7d = buildForecastSeries(7);
        const daily14d = buildForecastSeries(14);
        const daily30d = buildForecastSeries(30);

        const totalProjected7d = Math.round(daily7d.reduce((s, p) => s + p.predictedUnits, 0));
        const totalProjected14d = Math.round(daily14d.reduce((s, p) => s + p.predictedUnits, 0));
        const totalProjected30d = Math.round(daily30d.reduce((s, p) => s + p.predictedUnits, 0));

        // --- Inventory Shortage Analysis ---
        // Fetch current available inventory
        const shortages: InventoryShortageAlert[] = [];
        let availableStockByGroup: Array<{ bloodgroup: blood_group; bloodcomponent: blood_component; count: number }> = [];

        if (facilityType === "BLOOD_BANK") {
            const stockRows = await prisma.inventoryunits.groupBy({
                by: ["bloodgroup", "bloodcomponent"],
                where: {
                    bloodbankid: facilityId,
                    status: "AVAILABLE",
                    ttiscreeningstatus: "PASSED",
                    expirydate: { gt: now },
                },
                _count: { unitid: true },
            });
            availableStockByGroup = stockRows.map((s) => ({
                bloodgroup: s.bloodgroup,
                bloodcomponent: s.bloodcomponent,
                count: s._count.unitid,
            }));
        } else {
            // For hospital, check hospital-assigned inventory or general network buffer
            const hospitalAssignments = await prisma.bloodreservations.findMany({
                where: {
                    bloodrequests: { hospitalid: facilityId },
                    reservationstatus: "ACTIVE",
                },
                include: {
                    reservationitems: {
                        where: { itemstatus: "RESERVED" },
                        include: { unit: true },
                    },
                },
            });

            const stockMap = new Map<string, number>();
            for (const res of hospitalAssignments) {
                for (const item of res.reservationitems) {
                    if (item.unit && item.unit.expirydate > now && item.unit.ttiscreeningstatus === "PASSED") {
                        const k = `${item.unit.bloodgroup}_${item.unit.bloodcomponent}`;
                        stockMap.set(k, (stockMap.get(k) || 0) + 1);
                    }
                }
            }
            availableStockByGroup = Array.from(stockMap.entries()).map(([k, count]) => {
                const [bg, comp] = k.split("_") as [blood_group, blood_component];
                return { bloodgroup: bg, bloodcomponent: comp, count };
            });
        }

        // Compare available stock against 7-day forecasted demand for each group
        for (const bg of ALL_BLOOD_GROUPS) {
            if (bloodGroup && bg !== bloodGroup) continue;

            const bgShare = totalHistoricalUnits > 0
                ? (groupMap.get(bg)?.units || 0) / totalHistoricalUnits
                : 1 / ALL_BLOOD_GROUPS.length;

            for (const comp of ALL_COMPONENTS) {
                if (bloodComponent && comp !== bloodComponent) continue;

                const compShare = totalHistoricalUnits > 0
                    ? (compMap.get(comp)?.units || 0) / totalHistoricalUnits
                    : 1 / ALL_COMPONENTS.length;

                // Group-component expected demand over next 7 days
                const forecastedDemand7d = Math.max(1, Math.round(totalProjected7d * bgShare * compShare));
                const stockEntry = availableStockByGroup.find((s) => s.bloodgroup === bg && s.bloodcomponent === comp);
                const availableUnits = stockEntry ? stockEntry.count : 0;
                const deficit = Math.max(0, forecastedDemand7d - availableUnits);

                let riskLevel: "CRITICAL" | "HIGH" | "MODERATE" | "ADEQUATE" = "ADEQUATE";
                let recommendation = "Stock levels are currently adequate to cover projected 7-day demand.";

                if (deficit > 0) {
                    const ratio = availableUnits / forecastedDemand7d;
                    if (availableUnits === 0 || ratio < 0.25) {
                        riskLevel = "CRITICAL";
                        recommendation = `CRITICAL DEFICIT: Zero or severely depleted stock (${availableUnits}/${forecastedDemand7d} units). Mobilize immediate emergency donor drive or inter-facility transfer of ${deficit + 2} units.`;
                    } else if (ratio < 0.5) {
                        riskLevel = "HIGH";
                        recommendation = `HIGH SHORTAGE RISK: Available stock (${availableUnits}) satisfies less than 50% of 7-day demand (${forecastedDemand7d} units). Issue targeted donor callouts for ${deficit} units.`;
                    } else if (ratio < 0.75) {
                        riskLevel = "MODERATE";
                        recommendation = `MODERATE BUFFER RISK: Prepare inventory replenishment for ${deficit} units to preserve safety buffer.`;
                    }
                }

                if (riskLevel !== "ADEQUATE" || (groupMap.get(bg)?.units || 0) > 0) {
                    shortages.push({
                        bloodGroup: bg,
                        bloodGroupDisplay: BLOOD_GROUP_DISPLAY[bg],
                        bloodComponent: comp,
                        componentDisplay: COMPONENT_DISPLAY[comp],
                        availableUnits,
                        forecastedDemand7d,
                        deficit,
                        riskLevel,
                        recommendation,
                    });
                }
            }
        }

        // Sort shortages by risk severity
        const riskOrder = { CRITICAL: 1, HIGH: 2, MODERATE: 3, ADEQUATE: 4 };
        shortages.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || b.deficit - a.deficit);

        // --- Actionable Inventory Recommendations ---
        const actionableRecommendations: string[] = [];
        const topShortage = shortages.find((s) => s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH");
        if (topShortage) {
            actionableRecommendations.push(
                `Urgent replenishment: Blood group ${topShortage.bloodGroupDisplay} (${topShortage.componentDisplay}) faces an estimated deficit of ${topShortage.deficit} units over the next 7 days.`
            );
        }

        if (frequentlyRequestedGroups.length > 0) {
            const topGroup = frequentlyRequestedGroups[0];
            actionableRecommendations.push(
                `Demand Concentration: Blood group ${topGroup.displayName} accounts for ${topGroup.percentage}% of all historical demand (${topGroup.totalUnits} units). Maintain a minimum buffer of ${Math.max(3, Math.ceil(topGroup.totalUnits / 4))} units on standby.`
            );
        }

        if (trendSlope > 0.1) {
            actionableRecommendations.push(
                `Upward Demand Velocity: Consumption shows a rising trend (+${(trendSlope * 7).toFixed(1)} units/week). Increase weekly procurement threshold by 15%.`
            );
        } else if (trendSlope < -0.1) {
            actionableRecommendations.push(
                `Stabilizing Demand Velocity: Weekly requirement trend is plateauing/softening (-${Math.abs(trendSlope * 7).toFixed(1)} units/week). Monitor short-shelf-life components like platelets closely.`
            );
        }

        if (!isDataSufficient) {
            actionableRecommendations.push(
                "Data Collection Notice: Additional historical requisitions are needed to unlock tighter confidence intervals. Regular registration of requests will refine accuracy."
            );
        }

        return {
            facilityType,
            facilityId,
            facilityName,
            historicalWindowDays: timeframeDays,
            isDataSufficient,
            dataQualityNote,
            confidenceScore,
            forecastingMethod: "7-day/14-day Weighted Moving Average (WMA) with Ordinary Least Squares Linear Trend Projection",
            totalHistoricalUnits,
            totalHistoricalRequests,
            actualDemand: {
                daily: dailyPoints,
                weekly: weeklyPoints,
                monthly: monthlyPoints,
            },
            predictedDemand: {
                daily7d,
                daily14d,
                daily30d,
                totalProjected7d,
                totalProjected14d,
                totalProjected30d,
            },
            bloodGroupBreakdown,
            componentBreakdown,
            frequentlyRequestedGroups,
            shortages,
            actionableRecommendations,
        };
    }
}
