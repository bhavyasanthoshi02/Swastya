"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Droplets,
  Layers,
  ShieldAlert,
  ArrowUpRight,
  Info,
  Clock,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";

const BLOOD_GROUPS = [
  { value: "", label: "All Groups" },
  { value: "A_POSITIVE", label: "A+" },
  { value: "A_NEGATIVE", label: "A-" },
  { value: "B_POSITIVE", label: "B+" },
  { value: "B_NEGATIVE", label: "B-" },
  { value: "AB_POSITIVE", label: "AB+" },
  { value: "AB_NEGATIVE", label: "AB-" },
  { value: "O_POSITIVE", label: "O+" },
  { value: "O_NEGATIVE", label: "O-" },
];

const COMPONENTS = [
  { value: "", label: "All Components" },
  { value: "WHOLE_BLOOD", label: "Whole Blood" },
  { value: "PLATELETS", label: "Platelets" },
  { value: "PLASMA", label: "Fresh Frozen Plasma" },
  { value: "RBC", label: "Packed RBC" },
];

export default function HospitalInsightsPage() {
  const [timeframeDays, setTimeframeDays] = useState<number>(30);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedComponent, setSelectedComponent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<any | null>(null);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.hospital.getDemandForecast({
        timeframeDays,
        bloodGroup: selectedGroup || undefined,
        bloodComponent: selectedComponent || undefined,
      });

      if (res.success && res.data) {
        setForecastData(res.data);
      } else {
        setError("Failed to load demand forecast records.");
      }
    } catch (err: any) {
      console.error("Error loading hospital demand forecast:", err);
      setError(err.message || "Failed to retrieve forecasting insights.");
    } finally {
      setLoading(false);
    }
  }, [timeframeDays, selectedGroup, selectedComponent]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const topGroup = forecastData?.frequentlyRequestedGroups?.[0];
  const criticalShortagesCount =
    forecastData?.shortages?.filter(
      (s: any) => s.riskLevel === "CRITICAL" || s.riskLevel === "HIGH"
    ).length || 0;

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-16">
      {/* Top Header Strip */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#F3E9D1] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#053845]/10 text-[#053845]">
                <Sparkles className="w-3.5 h-3.5 text-[#317786]" />
                Statistical Intelligence
              </span>
              <span className="text-xs text-slate-500">
                Hospital Demand Module
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#053845] tracking-tight">
              Blood Demand Forecasting
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Practical moving average demand modeling, prospective 7-day to 30-day requirement projections, and clinical shortage risk detection.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchForecast}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-white border border-[#F3E9D1] text-[#053845] hover:bg-[#FAF6EE] transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Analytics
            </button>
            <Link
              href="/hospital/requests/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#053845] text-white hover:bg-[#074d5f] transition-colors shadow-sm"
            >
              <Droplets className="w-3.5 h-3.5 text-red-300" />
              New Requisition
            </Link>
          </div>
        </div>

        {/* Filter Controls Toolbar */}
        <div className="mt-6 bg-white rounded-xl border border-[#F3E9D1] p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Timeframe selector */}
            <div className="flex items-center bg-[#FAF6EE] p-1 rounded-lg border border-[#F3E9D1]">
              {[
                { days: 7, label: "7 Days" },
                { days: 30, label: "30 Days" },
                { days: 90, label: "90 Days" },
              ].map((tf) => (
                <button
                  key={tf.days}
                  onClick={() => setTimeframeDays(tf.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    timeframeDays === tf.days
                      ? "bg-[#053845] text-white shadow-xs"
                      : "text-slate-600 hover:text-[#053845]"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Blood Group Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 font-medium">Group:</label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="text-xs bg-[#FAF6EE] border border-[#F3E9D1] rounded-lg px-2.5 py-1.5 font-medium text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#053845]"
              >
                {BLOOD_GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Component Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 font-medium">Component:</label>
              <select
                value={selectedComponent}
                onChange={(e) => setSelectedComponent(e.target.value)}
                className="text-xs bg-[#FAF6EE] border border-[#F3E9D1] rounded-lg px-2.5 py-1.5 font-medium text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#053845]"
              >
                {COMPONENTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {glabel(c.label)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Analyzed Facility:{" "}
            <span className="font-semibold text-[#053845]">
              {forecastData?.facilityName || "Authenticated Hospital"}
            </span>
          </div>
        </div>

        {/* Data Sufficiency Banner */}
        {forecastData && !forecastData.isDataSufficient && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-amber-950 mb-0.5">
                Provisional Statistical Forecast (Limited Sample)
              </div>
              <p className="text-amber-800 leading-relaxed">
                {forecastData.dataQualityNote}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="text-xs">{error}</div>
          </div>
        )}

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {/* Card 1: Historical Demand */}
          <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Historical Demand</span>
              <span className="text-[10px] bg-[#FAF6EE] px-2 py-0.5 rounded border border-[#F3E9D1]">
                Past {timeframeDays}d
              </span>
            </div>
            <div className="text-2xl font-bold text-[#053845]">
              {forecastData?.totalHistoricalUnits ?? (loading ? "..." : 0)}{" "}
              <span className="text-sm font-normal text-slate-500">units</span>
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Across {forecastData?.totalHistoricalRequests ?? 0} registered requisitions
              </span>
            </div>
          </div>

          {/* Card 2: Projected 7-Day Demand */}
          <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Projected 7-Day Demand</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                WMA + Trend
              </span>
            </div>
            <div className="text-2xl font-bold text-[#053845]">
              {forecastData?.predictedDemand?.totalProjected7d ?? (loading ? "..." : 0)}{" "}
              <span className="text-sm font-normal text-slate-500">units</span>
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-[#317786]" />
              <span>
                14d: {forecastData?.predictedDemand?.totalProjected14d ?? 0}u | 30d:{" "}
                {forecastData?.predictedDemand?.totalProjected30d ?? 0}u
              </span>
            </div>
          </div>

          {/* Card 3: Frequently Requested Group */}
          <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Primary Demand Group</span>
              <span className="text-[10px] bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded border border-red-200">
                Rank #1
              </span>
            </div>
            <div className="text-2xl font-bold text-red-700">
              {topGroup?.displayName ?? (loading ? "..." : "N/A")}
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5 text-red-400" />
              <span>
                {topGroup ? `${topGroup.percentage}% of facility demand (${topGroup.totalUnits}u)` : "No requisitions"}
              </span>
            </div>
          </div>

          {/* Card 4: Shortage Alerts */}
          <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Stock Deficit Alerts</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                  criticalShortagesCount > 0
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {criticalShortagesCount > 0 ? "Action Required" : "Stable"}
              </span>
            </div>
            <div className="text-2xl font-bold text-[#053845]">
              {criticalShortagesCount}{" "}
              <span className="text-sm font-normal text-slate-500">groups at risk</span>
            </div>
            <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Compared against 7-day forecast</span>
            </div>
          </div>
        </div>

        {/* Section: Forecast vs Actual Visualization */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Visualizer: Actual vs Predicted Demand */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#F3E9D1]">
              <div>
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  Prospective 7-Day Demand Forecast
                </h3>
                <p className="text-xs text-slate-500">
                  Daily projected requirements with upper and lower 80% confidence boundaries
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#053845]"></span>
                  Projected Units
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                  Confidence Band
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Computing moving average projections...
              </div>
            ) : forecastData?.predictedDemand?.daily7d?.length > 0 ? (
              <div className="space-y-3">
                {forecastData.predictedDemand.daily7d.map((dp: any, idx: number) => {
                  const maxExpected = Math.max(
                    5,
                    ...forecastData.predictedDemand.daily7d.map((p: any) => p.upperBound || p.predictedUnits)
                  );
                  const predPct = Math.min(100, Math.round((dp.predictedUnits / maxExpected) * 100));

                  return (
                    <div key={idx} className="flex items-center gap-4 text-xs">
                      <div className="w-24 text-slate-600 font-mono text-[11px] shrink-0">
                        {dp.date}
                      </div>
                      <div className="flex-1 bg-[#FAF6EE] h-6 rounded-md relative overflow-hidden flex items-center px-2">
                        {/* Confidence interval band */}
                        <div
                          className="absolute bg-slate-200/70 h-full rounded"
                          style={{
                            left: `${Math.max(0, (dp.lowerBound / maxExpected) * 100)}%`,
                            width: `${Math.min(
                              100,
                              ((dp.upperBound - dp.lowerBound) / maxExpected) * 100
                            )}%`,
                          }}
                        />
                        {/* Projected bar */}
                        <div
                          className="absolute bg-[#053845] h-3.5 rounded transition-all"
                          style={{ width: `${Math.max(4, predPct)}%` }}
                        />
                      </div>
                      <div className="w-28 text-right font-medium text-[#053845] shrink-0">
                        {dp.predictedUnits} u{" "}
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({dp.lowerBound}–{dp.upperBound})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500">
                No historical demand data available in the selected timeframe.
              </div>
            )}

            {/* Note on Separation */}
            <div className="mt-5 pt-3 border-t border-[#F3E9D1] flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1 text-slate-500">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                Actual historical demand is tracked separately from mathematical projections.
              </span>
              <span>
                Method: WMA + Linear Trend (No black-box models)
              </span>
            </div>
          </div>

          {/* Blood Group Breakdown Column */}
          <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#F3E9D1]">
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  Blood Group Distribution
                </h3>
                <span className="text-xs text-slate-400 font-mono">Ranked</span>
              </div>

              <div className="space-y-3">
                {forecastData?.bloodGroupBreakdown?.slice(0, 6).map((bg: any) => (
                  <div key={bg.bloodGroup} className="text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-[#053845] flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-md bg-red-50 text-red-700 flex items-center justify-center text-xs font-bold">
                          {bg.displayName}
                        </span>
                        <span className="text-slate-500 font-normal">
                          {bg.requestCount} request(s)
                        </span>
                      </span>
                      <span className="font-semibold text-slate-700">
                        {bg.totalUnits}u ({bg.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-[#FAF6EE] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-red-500 h-full rounded-full"
                        style={{ width: `${Math.min(100, bg.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#F3E9D1]">
              <div className="text-xs text-slate-500 font-medium mb-1">
                Frequently Requested Groups
              </div>
              <div className="flex flex-wrap gap-1.5">
                {forecastData?.frequentlyRequestedGroups?.map((g: any) => (
                  <span
                    key={g.bloodGroup}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#FAF6EE] border border-[#F3E9D1] text-xs font-semibold text-[#053845]"
                  >
                    {g.displayName}: {g.totalUnits}u
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section: Shortage Risk Warnings & Clinical Inventory Recommendations */}
        <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-[#F3E9D1]">
            <div>
              <h3 className="text-base font-serif font-bold text-[#053845]">
                Potential Inventory Shortages & Requisition Preparation
              </h3>
              <p className="text-xs text-slate-500">
                Cross-referencing available hospital reserves against 7-day projected clinical requirements
              </p>
            </div>
            <span className="text-xs text-slate-500">
              Evaluated across all 8 blood groups
            </span>
          </div>

          {forecastData?.shortages && forecastData.shortages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#F3E9D1] text-slate-500 bg-[#FAF6EE]/50">
                    <th className="py-2.5 px-3 font-semibold">Blood Group</th>
                    <th className="py-2.5 px-3 font-semibold">Component</th>
                    <th className="py-2.5 px-3 font-semibold">Available Stock</th>
                    <th className="py-2.5 px-3 font-semibold">Projected 7d Demand</th>
                    <th className="py-2.5 px-3 font-semibold">Estimated Deficit</th>
                    <th className="py-2.5 px-3 font-semibold">Risk Level</th>
                    <th className="py-2.5 px-3 font-semibold">Preparation Recommendation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3E9D1]/60">
                  {forecastData.shortages.map((item: any, idx: number) => {
                    const badgeStyles: Record<string, string> = {
                      CRITICAL: "bg-red-50 text-red-700 border-red-200",
                      HIGH: "bg-orange-50 text-orange-700 border-orange-200",
                      MODERATE: "bg-amber-50 text-amber-700 border-amber-200",
                      ADEQUATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    };

                    return (
                      <tr key={idx} className="hover:bg-[#FAF6EE]/40 transition-colors">
                        <td className="py-3 px-3 font-bold text-[#053845]">
                          {item.bloodGroupDisplay}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {item.componentDisplay}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800">
                          {item.availableUnits} unit(s)
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800">
                          {item.forecastedDemand7d} unit(s)
                        </td>
                        <td className="py-3 px-3 font-semibold">
                          {item.deficit > 0 ? (
                            <span className="text-red-600">-{item.deficit} unit(s)</span>
                          ) : (
                            <span className="text-emerald-600">Sufficient</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                              badgeStyles[item.riskLevel] || badgeStyles.ADEQUATE
                            }`}
                          >
                            {item.riskLevel}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 text-[11px] max-w-md">
                          {item.recommendation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              No shortages identified. All blood components show sufficient reserves.
            </div>
          )}
        </div>

        {/* Section: Actionable Insights & Strategic Guidance */}
        {forecastData?.actionableRecommendations?.length > 0 && (
          <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
            <h3 className="text-base font-serif font-bold text-[#053845] mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Actionable Clinical Procurement Recommendations
            </h3>
            <ul className="space-y-2 text-xs text-slate-700">
              {forecastData.actionableRecommendations.map((rec: string, i: number) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1]"
                >
                  <ArrowUpRight className="w-4 h-4 text-[#317786] shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Section: Methodology & Transparency */}
        <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
          <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            Methodological Transparency & Clinical Safety Note
          </div>
          <p className="leading-relaxed">
            Forecasting calculations apply 7-day and 14-day Weighted Moving Averages (WMA) combined with linear ordinary least-squares regression trend slopes. Projections are intended strictly for clinical inventory preparation and procurement planning. No artificial deep neural network or unverified predictive claims are made.
          </p>
        </div>
      </div>
    </div>
  );
}

function glabel(text: string) {
  return text;
}
