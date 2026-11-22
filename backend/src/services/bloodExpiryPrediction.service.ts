import { prisma } from "../config/prisma";
import { blood_group, blood_component } from "../generated/prisma/enums";
import { BLOOD_GROUP_DISPLAY, COMPONENT_DISPLAY } from "./bloodDemandForecast.service";

export interface TrackedUnitRecord {
    unitid: string;
    unitbarcode: string;
    donationidentificationnumber: string | null;
    bloodgroup: blood_group;
    bloodGroupDisplay: string;
    bloodcomponent: blood_component;
    componentDisplay: string;
    collectiondate: Date | null;
    expirydate: Date;
    daysRemaining: number;
    hoursRemaining: number;
    status: string;
    ttiscreeningstatus: string;
    storagebinlocation: string | null;
    category: "EXPIRED" | "EXPIRING_CRITICAL_3D" | "EXPIRING_SOON_7D" | "SAFE";
    isFefoEligible: boolean; // Safe, unexpired, available, TTI passed
}

export interface WastageRiskBreakdown {
    bloodgroup: blood_group;
    bloodGroupDisplay: string;
    bloodcomponent: blood_component;
    componentDisplay: string;
    currentExpiringUnits7d: number;
    historicalDailyBurnRate: number;
    projected7dConsumption: number;
    predictedWastageUnits: number;
    wastageRiskLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE";
    mitigationStrategy: string;
}

export interface HistoricalWastageStats {
    totalWastedUnits: number;
    totalHistoricalIntake: number;
    historicalWastageRatePercent: number;
    breakdownByGroup: Array<{ bloodGroup: blood_group; displayName: string; wastedUnits: number; percentage: number }>;
    breakdownByComponent: Array<{ bloodComponent: blood_component; displayName: string; wastedUnits: number; percentage: number }>;
    commonDisposalReasons: Array<{ reason: string; count: number }>;
}

export interface BloodExpiryPredictionResult {
    bloodBankId: string;
    bloodBankName: string;
    generatedAt: string;
    summary: {
        totalActiveUnits: number;
        expiredCount: number;
        expiringSoonCount: number; // <= 7 days
        expiringCriticalCount: number; // <= 3 days
        safeStockCount: number; // > 7 days
        predictedWastageUnits7d: number;
        fefoEligibleUnitsCount: number;
    };
    units: TrackedUnitRecord[];
    fefoQueue: TrackedUnitRecord[];
    wastageProjections: WastageRiskBreakdown[];
    historicalWastage: HistoricalWastageStats;
    earlyWarnings: string[];
    actionableRecommendations: string[];
}

export class BloodExpiryPredictionService {
    /**
     * Strict clinical safety guard ensuring expired or TTI-failed units cannot be allocated or dispatched.
     * Enforces Indian blood banking regulatory and clinical transfusion standards.
     */
    static validateUnitSafetyForAllocation(unit: {
        unitbarcode?: string;
        expirydate: Date | string;
        status: string;
        ttiscreeningstatus: string;
    }): { safe: boolean; error?: string } {
        const expiry = new Date(unit.expirydate);
        const now = new Date();

        // 1. Expiry date check
        if (expiry.getTime() <= now.getTime()) {
            return {
                safe: false,
                error: `CLINICAL SAFETY VIOLATION: Unit ${unit.unitbarcode || "unknown"} expired on ${expiry.toISOString()} and cannot be allocated, crossmatched, or dispatched under any circumstances.`,
            };
        }

        // 2. TTI screening check
        if (unit.ttiscreeningstatus !== "PASSED") {
            return {
                safe: false,
                error: `CLINICAL SAFETY VIOLATION: Unit ${unit.unitbarcode || "unknown"} has TTI screening status "${unit.ttiscreeningstatus}". Only units with verified PASSED TTI clearance may be allocated.`,
            };
        }

        // 3. Availability status check
        if (unit.status !== "AVAILABLE" && unit.status !== "RESERVED") {
            return {
                safe: false,
                error: `INVENTORY VIOLATION: Unit ${unit.unitbarcode || "unknown"} is in status "${unit.status}" and is not eligible for allocation.`,
            };
        }

        return { safe: true };
    }

    /**
     * Analyze inventory units, predict potential wastage via velocity models, and generate FEFO prioritization queue.
     */
    static async calculateExpiryAndWastage(params: {
        bloodBankId: string;
        bloodGroup?: blood_group;
        bloodComponent?: blood_component;
    }): Promise<BloodExpiryPredictionResult> {
        const { bloodBankId, bloodGroup, bloodComponent } = params;
        const now = new Date();

        const bb = await prisma.bloodbanks.findUnique({
            where: { bloodbankid: bloodBankId },
            select: { bloodbankname: true },
        });
        const bloodBankName = bb?.bloodbankname || "Blood Bank Facility";

        // Query active units
        const rawUnits = await prisma.inventoryunits.findMany({
            where: {
                bloodbankid: bloodBankId,
                status: { in: ["AVAILABLE", "RESERVED", "QUARANTINED"] },
                ...(bloodGroup ? { bloodgroup: bloodGroup } : {}),
                ...(bloodComponent ? { bloodcomponent: bloodComponent } : {}),
            },
            orderBy: { expirydate: "asc" },
        });

        const trackedUnits: TrackedUnitRecord[] = [];
        let expiredCount = 0;
        let expiringSoonCount = 0;
        let expiringCriticalCount = 0;
        let safeStockCount = 0;

        for (const u of rawUnits) {
            const expTime = new Date(u.expirydate).getTime();
            const nowTime = now.getTime();
            const diffMs = expTime - nowTime;
            const diffHours = Math.round(diffMs / (1000 * 60 * 60));
            const diffDays = Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10;

            let category: "EXPIRED" | "EXPIRING_CRITICAL_3D" | "EXPIRING_SOON_7D" | "SAFE" = "SAFE";
            if (diffMs <= 0) {
                category = "EXPIRED";
                expiredCount++;
            } else if (diffDays <= 3) {
                category = "EXPIRING_CRITICAL_3D";
                expiringCriticalCount++;
                expiringSoonCount++;
            } else if (diffDays <= 7) {
                category = "EXPIRING_SOON_7D";
                expiringSoonCount++;
            } else {
                category = "SAFE";
                safeStockCount++;
            }

            const safetyCheck = this.validateUnitSafetyForAllocation({
                unitbarcode: u.unitbarcode,
                expirydate: u.expirydate,
                status: u.status,
                ttiscreeningstatus: u.ttiscreeningstatus,
            });

            trackedUnits.push({
                unitid: u.unitid,
                unitbarcode: u.unitbarcode,
                donationidentificationnumber: u.donationidentificationnumber,
                bloodgroup: u.bloodgroup,
                bloodGroupDisplay: BLOOD_GROUP_DISPLAY[u.bloodgroup] || u.bloodgroup,
                bloodcomponent: u.bloodcomponent,
                componentDisplay: COMPONENT_DISPLAY[u.bloodcomponent] || u.bloodcomponent,
                collectiondate: u.collectiondate,
                expirydate: u.expirydate,
                daysRemaining: diffDays,
                hoursRemaining: diffHours,
                status: u.status,
                ttiscreeningstatus: u.ttiscreeningstatus,
                storagebinlocation: u.storagebinlocation,
                category,
                isFefoEligible: safetyCheck.safe,
            });
        }

        // FEFO Queue: Sort eligible units strictly by expiry date ascending
        const fefoQueue = trackedUnits
            .filter((u) => u.isFefoEligible && u.status === "AVAILABLE")
            .sort((a, b) => a.expirydate.getTime() - b.expirydate.getTime());

        // --- Historical Wastage Analysis ---
        // Look up inventory ledger and unit disposition records for this blood bank over past 90 days
        const past90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

        const wastedDispositions = await prisma.unitdispositionhistory.findMany({
            where: {
                bloodbankid: bloodBankId,
                createdat: { gte: past90d },
                newstatus: "DISCARDED",
            },
            include: { unit: true },
        });

        const wastedLedgerEntries = await prisma.inventoryledger.findMany({
            where: {
                bloodbankid: bloodBankId,
                createdat: { gte: past90d },
                operationtype: "UNIT_DISPOSAL",
            },
            include: { inventory: true },
        });

        const totalWastedUnits = Math.max(wastedDispositions.length, wastedLedgerEntries.length);

        // Historical intake to compute wastage rate
        const intakeLedgerEntries = await prisma.inventoryledger.aggregate({
            where: {
                bloodbankid: bloodBankId,
                createdat: { gte: past90d },
                operationtype: { in: ["STOCK_ADDITION", "STOCK_INTAKE"] },
            },
            _sum: { quantitydelta: true },
        });

        const totalHistoricalIntake =
            Math.abs(intakeLedgerEntries._sum?.quantitydelta || 0) +
            rawUnits.length;

        const historicalWastageRatePercent =
            totalHistoricalIntake > 0
                ? Number(((totalWastedUnits / totalHistoricalIntake) * 100).toFixed(1))
                : 0;

        // Breakdown by blood group & component from dispositions
        const groupWastageMap = new Map<blood_group, number>();
        const compWastageMap = new Map<blood_component, number>();
        const reasonMap = new Map<string, number>();

        for (const disp of wastedDispositions) {
            if (disp.unit) {
                groupWastageMap.set(disp.unit.bloodgroup, (groupWastageMap.get(disp.unit.bloodgroup) || 0) + 1);
                compWastageMap.set(disp.unit.bloodcomponent, (compWastageMap.get(disp.unit.bloodcomponent) || 0) + 1);
            }
            const r = disp.reason || "EXPIRED";
            reasonMap.set(r, (reasonMap.get(r) || 0) + 1);
        }

        const breakdownByGroup = Array.from(groupWastageMap.entries()).map(([bg, count]) => ({
            bloodGroup: bg,
            displayName: BLOOD_GROUP_DISPLAY[bg] || bg,
            wastedUnits: count,
            percentage: totalWastedUnits > 0 ? Number(((count / totalWastedUnits) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.wastedUnits - a.wastedUnits);

        const breakdownByComponent = Array.from(compWastageMap.entries()).map(([comp, count]) => ({
            bloodComponent: comp,
            displayName: COMPONENT_DISPLAY[comp] || comp,
            wastedUnits: count,
            percentage: totalWastedUnits > 0 ? Number(((count / totalWastedUnits) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.wastedUnits - a.wastedUnits);

        const commonDisposalReasons = Array.from(reasonMap.entries())
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count);

        // --- Future Wastage Risk Prediction via Velocity / Burn Rate ---
        // Calculate consumption velocity over past 30 days
        const past30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const outboundLedger = await prisma.inventoryledger.findMany({
            where: {
                bloodbankid: bloodBankId,
                createdat: { gte: past30d },
                operationtype: { in: ["DISPATCH_DEPARTURE", "RESERVATION_ALLOCATE", "HOSPITAL_RECEIPT_CONFIRM"] },
            },
            include: { inventory: true },
        });

        // Compute daily burn rate per (group, component)
        const burnRateMap = new Map<string, number>();
        for (const entry of outboundLedger) {
            if (entry.inventory) {
                const k = `${entry.inventory.bloodgroup}_${entry.inventory.bloodcomponent}`;
                const units = Math.abs(entry.quantitydelta || 1);
                burnRateMap.set(k, (burnRateMap.get(k) || 0) + units);
            }
        }

        // Count expiring units in next 7 days per (group, component)
        const expiring7dMap = new Map<string, number>();
        for (const u of trackedUnits) {
            if (u.category === "EXPIRING_CRITICAL_3D" || u.category === "EXPIRING_SOON_7D") {
                const k = `${u.bloodgroup}_${u.bloodcomponent}`;
                expiring7dMap.set(k, (expiring7dMap.get(k) || 0) + 1);
            }
        }

        const wastageProjections: WastageRiskBreakdown[] = [];
        let totalPredictedWastageUnits = 0;

        const allKeys = new Set([...Array.from(burnRateMap.keys()), ...Array.from(expiring7dMap.keys())]);
        allKeys.forEach((key) => {
            const [bg, comp] = key.split("_") as [blood_group, blood_component];
            const expiringUnits = expiring7dMap.get(key) || 0;
            const past30dUsage = burnRateMap.get(key) || 0;
            const dailyBurnRate = Number((past30dUsage / 30).toFixed(2));
            const projected7dConsumption = Math.round(dailyBurnRate * 7);

            // Surplus model: If units expiring in 7d exceed projected consumption over 7d, excess will expire!
            const predictedWastage = Math.max(0, expiringUnits - projected7dConsumption);
            totalPredictedWastageUnits += predictedWastage;

            let wastageRiskLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE" = "NONE";
            let mitigationStrategy = "Turnover velocity matches or exceeds expiring volume. Normal FEFO dispatch is sufficient.";

            if (predictedWastage > 0) {
                if (predictedWastage >= 3 || expiringUnits >= 5) {
                    wastageRiskLevel = "HIGH";
                    mitigationStrategy = `HIGH RISK OF EXPIRY: ${predictedWastage} unit(s) surplus projected to expire. Initiate immediate redistribution or offer to nearby tertiary hospitals via clinical network.`;
                } else {
                    wastageRiskLevel = "MEDIUM";
                    mitigationStrategy = `MODERATE RISK: ${predictedWastage} unit(s) at risk. Flag for FEFO top-priority matching on incoming hospital requisitions.`;
                }
            } else if (expiringUnits > 0) {
                wastageRiskLevel = "LOW";
                mitigationStrategy = `Expiring units (${expiringUnits}) are projected to be absorbed by standard clinical demand (${projected7dConsumption} units/wk). Maintain strict FEFO order.`;
            }

            if (expiringUnits > 0 || predictedWastage > 0) {
                wastageProjections.push({
                    bloodgroup: bg,
                    bloodGroupDisplay: BLOOD_GROUP_DISPLAY[bg] || bg,
                    bloodcomponent: comp,
                    componentDisplay: COMPONENT_DISPLAY[comp] || comp,
                    currentExpiringUnits7d: expiringUnits,
                    historicalDailyBurnRate: dailyBurnRate,
                    projected7dConsumption,
                    predictedWastageUnits: predictedWastage,
                    wastageRiskLevel,
                    mitigationStrategy,
                });
            }
        });

        // Sort wastage projections by predicted wastage DESC
        const riskWeights = { HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
        wastageProjections.sort((a, b) => riskWeights[a.wastageRiskLevel] - riskWeights[b.wastageRiskLevel] || b.predictedWastageUnits - a.predictedWastageUnits);

        // --- Early Warnings & Recommendations ---
        const earlyWarnings: string[] = [];
        if (expiredCount > 0) {
            earlyWarnings.push(
                `SAFETY ALERT: ${expiredCount} unit(s) in inventory are currently expired. Regulatory compliance requires immediate quarantine and authorized biohazard disposal.`
            );
        }
        if (expiringCriticalCount > 0) {
            earlyWarnings.push(
                `CRITICAL EXPIRY: ${expiringCriticalCount} unit(s) will expire within the next 72 hours. Prioritize immediate crossmatch or inter-hospital transfer.`
            );
        }
        if (totalPredictedWastageUnits > 0) {
            earlyWarnings.push(
                `VELOCITY DEFICIT: Projected wastage of ${totalPredictedWastageUnits} unit(s) across all blood components over the next 7 days based on current burn rates.`
            );
        }

        const actionableRecommendations: string[] = [
            "Apply FEFO (First-Expiring, First-Out) queuing to automatically select the earliest-expiring compatible unit for each incoming requisition.",
            "Transfer units approaching critical expiry (<= 72 hrs) to regional high-consumption trauma facilities before viability expires.",
            "Enforce daily digital inventory audits to isolate any unit crossing the 00:00 expiry threshold.",
            "Audit collection volume targets: align whole-blood and platelet collection drives to historical 30-day consumption velocity to eliminate systemic surplus.",
        ];

        return {
            bloodBankId,
            bloodBankName,
            generatedAt: now.toISOString(),
            summary: {
                totalActiveUnits: rawUnits.length,
                expiredCount,
                expiringSoonCount,
                expiringCriticalCount,
                safeStockCount,
                predictedWastageUnits7d: totalPredictedWastageUnits,
                fefoEligibleUnitsCount: fefoQueue.length,
            },
            units: trackedUnits,
            fefoQueue,
            wastageProjections,
            historicalWastage: {
                totalWastedUnits,
                totalHistoricalIntake,
                historicalWastageRatePercent,
                breakdownByGroup,
                breakdownByComponent,
                commonDisposalReasons,
            },
            earlyWarnings,
            actionableRecommendations,
        };
    }
}
