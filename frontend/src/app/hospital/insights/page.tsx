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
  Info,
  Clock,
  Sparkles,
  Building2,
  MapPin,
  Globe,
  ChevronDown,
  ChevronUp,
  HeartHandshake,
  ArrowRight,
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

type InsightScope = "HOSPITAL" | "DISTRICT" | "STATE";

export default function HospitalInsightsPage() {
  const [activeScope, setActiveScope] = useState<InsightScope>("HOSPITAL");
  const [timeframeDays, setTimeframeDays] = useState<number>(30);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedComponent, setSelectedComponent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<any | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scopeParam =
        activeScope === "HOSPITAL"
          ? "hospital"
          : activeScope === "DISTRICT"
          ? "district"
          : "state";

      const res = await api.hospital.getRegionalInsights({
        scope: scopeParam,
        timeframeDays,
        bloodGroup: selectedGroup || undefined,
        bloodComponent: selectedComponent || undefined,
      });

      if (res.success && res.data) {
        setInsights(res.data);
      } else {
        setError("Failed to load regional hospital insights.");
      }
    } catch (err: any) {
      console.error("Error loading hospital insights:", err);
      setError(err.message || "Failed to retrieve blood demand insights.");
    } finally {
      setLoading(false);
    }
  }, [activeScope, timeframeDays, selectedGroup, selectedComponent]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const overview = insights?.overview;
  const isDataSufficient = insights?.isDataSufficient ?? false;
  const location = insights?.location;
  const regionalContext = insights?.regionalContext;

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-16">
      {/* Top Header Strip */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#F3E9D1] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#053845]/10 text-[#053845]">
                <Sparkles className="w-3.5 h-3.5 text-[#317786]" />
                Clinical Intelligence
              </span>
              <span className="text-xs text-slate-500">
                Hospital Demand & Planning
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#053845] tracking-tight">
              Blood Demand Insights
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Understand past blood usage patterns, estimate upcoming requirements in plain units, and compare demand across your district and state.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchInsights}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-white border border-[#F3E9D1] text-[#053845] hover:bg-[#FAF6EE] transition-colors shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/hospital/requests/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#053845] text-white hover:bg-[#074d5f] transition-colors shadow-xs"
            >
              <Droplets className="w-3.5 h-3.5 text-red-300" />
              New Blood Request
            </Link>
          </div>
        </div>

        {/* View Selection Tabs (3 Views) */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="inline-flex p-1 bg-[#EBE3D0] rounded-xl border border-[#D8CEB8]">
            <button
              onClick={() => setActiveScope("HOSPITAL")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeScope === "HOSPITAL"
                  ? "bg-white text-[#053845] shadow-xs"
                  : "text-slate-600 hover:text-[#053845]"
              }`}
            >
              <Building2 className="w-4 h-4 text-[#317786]" />
              My Hospital
            </button>
            <button
              onClick={() => setActiveScope("DISTRICT")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeScope === "DISTRICT"
                  ? "bg-white text-[#053845] shadow-xs"
                  : "text-slate-600 hover:text-[#053845]"
              }`}
            >
              <MapPin className="w-4 h-4 text-emerald-600" />
              My District
              {location?.displayDistrict && (
                <span className="text-[10px] font-normal px-1.5 py-0.2 bg-[#FAF6EE] text-slate-600 rounded">
                  {location.displayDistrict}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveScope("STATE")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeScope === "STATE"
                  ? "bg-white text-[#053845] shadow-xs"
                  : "text-slate-600 hover:text-[#053845]"
              }`}
            >
              <Globe className="w-4 h-4 text-indigo-600" />
              My State
              {location?.displayState && (
                <span className="text-[10px] font-normal px-1.5 py-0.2 bg-[#FAF6EE] text-slate-600 rounded">
                  {location.displayState}
                </span>
              )}
            </button>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Facility:</span>
            <span className="font-semibold text-[#053845]">
              {insights?.hospitalName || "Authenticated Hospital"}
            </span>
            {location?.displayDistrict && location?.displayState && (
              <span className="text-slate-400">
                • {location.displayDistrict}, {location.displayState}
              </span>
            )}
          </div>
        </div>

        {/* Filter Controls Toolbar */}
        <div className="mt-4 bg-white rounded-xl border border-[#F3E9D1] p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Timeframe Selector */}
            <div className="flex items-center bg-[#FAF6EE] p-1 rounded-lg border border-[#F3E9D1]">
              {[
                { days: 7, label: "Past 7 Days" },
                { days: 30, label: "Past 30 Days" },
                { days: 90, label: "Past 90 Days" },
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
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 italic">
            * Estimates are rounded to whole units for clinical requisition planning.
          </div>
        </div>

        {/* Location Notice (if location is missing or incomplete) */}
        {location && !location.isValid && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-amber-950 mb-0.5">
                Location Details Incomplete
              </div>
              <p className="text-amber-800 leading-relaxed">
                {location.missingLocationMessage ||
                  "City or state is missing in your hospital facility profile. Update your profile address to view accurate district and state comparisons."}
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="text-xs">{error}</div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: MY HOSPITAL                                                      */}
        {/* ========================================================================= */}
        {activeScope === "HOSPITAL" && (
          <div className="mt-6 space-y-6">
            {/* Overview Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Units Requested */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Units Requested</span>
                  <span className="text-[10px] bg-[#FAF6EE] px-2 py-0.5 rounded border border-[#F3E9D1]">
                    Past {timeframeDays}d
                  </span>
                </div>
                <div className="text-2xl font-bold text-[#053845]">
                  {overview?.totalUnitsRequested ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    From {overview?.totalRequestsCount ?? 0} completed blood requests
                  </span>
                </div>
              </div>

              {/* Card 2: Next 7-Day Estimated Need */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Next 7 Days Estimated</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                    Whole Units
                  </span>
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {overview?.estimatedUpcoming7d ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Based on recent clinical requisition pace</span>
                </div>
              </div>

              {/* Card 3: Most Requested Blood Group */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Most Requested Group</span>
                  <span className="text-[10px] bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded border border-red-200">
                    Highest Demand
                  </span>
                </div>
                <div className="text-2xl font-bold text-red-700">
                  {overview?.mostRequestedGroup?.displayName ??
                    (loading ? "..." : "None")}
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-red-400" />
                  <span>
                    {overview?.mostRequestedGroup
                      ? `${overview.mostRequestedGroup.totalUnits} units (${overview.mostRequestedGroup.percentage}% of total)`
                      : "No request history"}
                  </span>
                </div>
              </div>

              {/* Card 4: Most Requested Component */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Primary Component</span>
                  <span className="text-[10px] bg-[#FAF6EE] text-[#053845] font-semibold px-2 py-0.5 rounded border border-[#F3E9D1]">
                    Component
                  </span>
                </div>
                <div className="text-lg font-bold text-[#053845] truncate">
                  {overview?.mostRequestedComponent?.displayName ??
                    (loading ? "..." : "None")}
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {overview?.mostRequestedComponent
                      ? `${overview.mostRequestedComponent.totalUnits} units (${overview.mostRequestedComponent.percentage}%)`
                      : "No component records"}
                  </span>
                </div>
              </div>
            </div>

            {/* Data Quality Notice */}
            {!isDataSufficient && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-xs">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-amber-950 mb-0.5">
                    Not Enough Request History For Confident Forecasts
                  </div>
                  <p className="text-amber-800 leading-relaxed">
                    {insights?.dataQualityNote ||
                      "At least 5 completed requests across 7 or more days are recommended to forecast future blood requirements with high confidence. Estimates shown below are provisional."}
                  </p>
                </div>
              </div>
            )}

            {/* Upcoming 7-Day Requirements Table */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#F3E9D1] gap-2">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#053845]">
                    Upcoming 7-Day Blood Requirements
                  </h3>
                  <p className="text-xs text-slate-500">
                    Estimated units needed by blood group and component over the next week.
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Integer Planning Units
                </span>
              </div>

              {loading ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Calculating blood group estimates...
                </div>
              ) : (insights?.upcomingRequirements7d?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500">
                        <th className="py-2.5 px-3 font-semibold">Blood Group</th>
                        <th className="py-2.5 px-3 font-semibold">Component</th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Estimated Needed (7d)
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-center">
                          Supply Status
                        </th>
                        <th className="py-2.5 px-3 font-semibold">Clinical Advice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]">
                      {insights.upcomingRequirements7d.map(
                        (row: any, idx: number) => {
                          const isShortage = row.shortageStatus === "Shortage";
                          return (
                            <tr key={idx} className="hover:bg-[#FAF6EE]/50">
                              <td className="py-3 px-3 font-bold text-[#053845]">
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-100 font-mono">
                                  {row.bloodGroupDisplay}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-700">
                                {row.componentDisplay}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-[#053845] font-mono text-sm">
                                {row.estimatedUnits} u
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                    isShortage
                                      ? "bg-red-50 text-red-700 border-red-200"
                                      : row.shortageStatus === "Adequate"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-blue-50 text-blue-700 border-blue-200"
                                  }`}
                                >
                                  {row.shortageStatus}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-600 text-[11px]">
                                {row.statusExplanation}
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  No upcoming requirements estimated for the selected filters.
                </div>
              )}
            </div>

            {/* Demand History: Groups & Components */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Frequently Requested Groups */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
                <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                  <h3 className="text-base font-serif font-bold text-[#053845]">
                    Frequently Requested Blood Groups
                  </h3>
                  <p className="text-xs text-slate-500">
                    Past usage breakdown across all completed blood requests
                  </p>
                </div>

                {loading ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading...</div>
                ) : (insights?.demandHistory?.frequentlyRequestedGroups?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {insights.demandHistory.frequentlyRequestedGroups.map(
                      (grp: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 text-xs">
                          <span className="w-6 font-mono text-slate-400 text-center font-bold">
                            #{grp.rank}
                          </span>
                          <span className="w-12 font-mono font-bold text-red-700">
                            {grp.displayName}
                          </span>
                          <div className="flex-1 bg-[#FAF6EE] h-3.5 rounded-full overflow-hidden border border-[#F3E9D1]">
                            <div
                              className="bg-[#053845] h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(5, grp.percentage))}%` }}
                            />
                          </div>
                          <span className="w-20 text-right font-medium text-slate-700">
                            {grp.totalUnits} u ({grp.percentage}%)
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No blood group records found.
                  </div>
                )}
              </div>

              {/* Component Breakdown */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
                <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                  <h3 className="text-base font-serif font-bold text-[#053845]">
                    Component Breakdown
                  </h3>
                  <p className="text-xs text-slate-500">
                    Distribution between Whole Blood, Platelets, Plasma, and Packed RBC
                  </p>
                </div>

                {loading ? (
                  <div className="py-8 text-center text-xs text-slate-400">Loading...</div>
                ) : (insights?.demandHistory?.componentBreakdown?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {insights.demandHistory.componentBreakdown.map(
                      (comp: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-3 text-xs">
                          <span className="w-36 font-medium text-slate-700 truncate">
                            {comp.displayName}
                          </span>
                          <div className="flex-1 bg-[#FAF6EE] h-3.5 rounded-full overflow-hidden border border-[#F3E9D1]">
                            <div
                              className="bg-[#317786] h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(5, comp.percentage))}%` }}
                            />
                          </div>
                          <span className="w-20 text-right font-medium text-slate-700">
                            {comp.totalUnits} u ({comp.percentage}%)
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No component records found.
                  </div>
                )}
              </div>
            </div>

            {/* Recommended Actions */}
            {insights?.recommendedActions && insights.recommendedActions.length > 0 && (
              <div className="bg-[#FAF6EE] rounded-xl border border-[#E3D8BF] p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-serif font-bold text-[#053845]">
                    Recommended Planning Actions
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insights.recommendedActions.map((action: string, idx: number) => (
                    <div
                      key={idx}
                      className="bg-white p-3.5 rounded-lg border border-[#F3E9D1] text-xs text-slate-700 flex items-start gap-2.5 shadow-2xs"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How Are These Estimates Calculated (Accordion) */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] overflow-hidden shadow-xs">
              <button
                onClick={() => setShowHowItWorks(!showHowItWorks)}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-[#FAF6EE]/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#317786]" />
                  <span className="text-xs font-semibold text-[#053845]">
                    How are these estimates calculated?
                  </span>
                </div>
                {showHowItWorks ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>
              {showHowItWorks && (
                <div className="px-6 pb-6 pt-2 text-xs text-slate-600 leading-relaxed border-t border-[#F3E9D1] space-y-2 bg-[#FAF6EE]/20">
                  <p>
                    <strong>1. Past Requisitions:</strong> We analyze actual blood units requested by this hospital across the chosen window (7, 30, or 90 days), excluding cancelled and expired requests.
                  </p>
                  <p>
                    <strong>2. Recent Demand Weighting:</strong> Recent days carry greater statistical weight so that sudden surges or changes in hospital activity are reflected in the upcoming week.
                  </p>
                  <p>
                    <strong>3. Whole Planning Units:</strong> All recommendations are rounded to whole numbers so hospital staff can create realistic requisitions without dealing with fractions of units.
                  </p>
                  <p>
                    <strong>4. Safety Threshold:</strong> If fewer than 5 completed requests exist across at least 7 days, the system clearly marks estimates as provisional to prevent misleading predictions.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: MY DISTRICT                                                      */}
        {/* ========================================================================= */}
        {activeScope === "DISTRICT" && (
          <div className="mt-6 space-y-6">
            {/* District Header Banner */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <MapPin className="w-3.5 h-3.5" />
                    District Scope
                  </span>
                  <span className="text-xs text-slate-500">
                    {location?.displayState || "State"}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#053845]">
                  {location?.displayDistrict || "Local District"} Blood Demand
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Aggregated blood requests from all participating hospitals in {location?.displayDistrict || "this district"}.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs shrink-0">
                <div className="text-right">
                  <div className="text-lg font-bold text-[#053845]">
                    {regionalContext?.participatingHospitalsCount ?? 1}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Participating Hospitals
                  </div>
                </div>
              </div>
            </div>

            {/* District Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: District Total Units */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  District Total Requested
                </div>
                <div className="text-2xl font-bold text-[#053845]">
                  {overview?.totalUnitsRequested ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Across {overview?.totalRequestsCount ?? 0} hospital requests
                </div>
              </div>

              {/* Card 2: 7-Day District Need */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  District 7-Day Estimate
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {overview?.estimatedUpcoming7d ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Expected demand across all district hospitals
                </div>
              </div>

              {/* Card 3: Top District Group */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  Most Needed Group in District
                </div>
                <div className="text-2xl font-bold text-red-700">
                  {overview?.mostRequestedGroup?.displayName ??
                    (loading ? "..." : "None")}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {overview?.mostRequestedGroup
                    ? `${overview.mostRequestedGroup.totalUnits} units in district`
                    : "No district records"}
                </div>
              </div>

              {/* Card 4: Hospital Share */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  Your Hospital Share
                </div>
                <div className="text-2xl font-bold text-[#317786]">
                  {regionalContext?.hospitalComparison?.hospitalSharePercent ?? 100}%
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Of total district blood requirements
                </div>
              </div>
            </div>

            {/* Hospital vs District Comparison Banner */}
            {regionalContext?.hospitalComparison && (
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                    <HeartHandshake className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="flex-1 text-xs">
                    <h3 className="text-sm font-serif font-bold text-[#053845] mb-1">
                      Hospital Demand in District Context
                    </h3>
                    <p className="text-slate-600 leading-relaxed mb-3">
                      {regionalContext.hospitalComparison.summaryMessage}
                    </p>
                    <div className="w-full bg-[#FAF6EE] h-3 rounded-full overflow-hidden border border-[#F3E9D1]">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              5,
                              regionalContext.hospitalComparison.hospitalSharePercent
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                      <span>Your Hospital: {regionalContext.hospitalComparison.hospitalUnits} units</span>
                      <span>District Total: {regionalContext.hospitalComparison.districtUnits} units</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* District Blood Group Demand Breakdown */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
              <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  District Blood Group Demand Breakdown
                </h3>
                <p className="text-xs text-slate-500">
                  Aggregated volume and share across all participating facilities in {location?.displayDistrict || "this district"}
                </p>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading...</div>
              ) : (insights?.demandHistory?.frequentlyRequestedGroups?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {insights.demandHistory.frequentlyRequestedGroups.map(
                    (grp: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-lg border border-[#F3E9D1] bg-[#FAF6EE]/40 text-xs flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono font-bold text-base text-red-700">
                            {grp.displayName}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            #{grp.rank}
                          </span>
                        </div>
                        <div className="text-slate-700 font-semibold text-sm">
                          {grp.totalUnits} <span className="text-xs font-normal text-slate-500">units</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {grp.percentage}% of district total ({grp.requestCount} requests)
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No district request records found.
                </div>
              )}
            </div>

            {/* District Recommendations */}
            {insights?.recommendedActions && (
              <div className="bg-[#FAF6EE] rounded-xl border border-[#E3D8BF] p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-serif font-bold text-[#053845]">
                    District Collaboration Recommendations
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insights.recommendedActions.map((action: string, idx: number) => (
                    <div
                      key={idx}
                      className="bg-white p-3.5 rounded-lg border border-[#F3E9D1] text-xs text-slate-700 flex items-start gap-2.5 shadow-2xs"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: MY STATE                                                         */}
        {/* ========================================================================= */}
        {activeScope === "STATE" && (
          <div className="mt-6 space-y-6">
            {/* State Header Banner */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                    <Globe className="w-3.5 h-3.5" />
                    State Scope
                  </span>
                  <span className="text-xs text-slate-500">State-wide Overview</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#053845]">
                  {location?.displayState || "State"} Blood Demand
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Aggregated clinical demand trends and district-by-district breakdown across {location?.displayState || "the state"}.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs shrink-0">
                <div className="text-right">
                  <div className="text-lg font-bold text-[#053845]">
                    {regionalContext?.participatingHospitalsCount ?? 1}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Hospitals in State
                  </div>
                </div>
              </div>
            </div>

            {/* State Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: State-wide Units */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  State-wide Requested Units
                </div>
                <div className="text-2xl font-bold text-[#053845]">
                  {overview?.totalUnitsRequested ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Past {timeframeDays} days across state
                </div>
              </div>

              {/* Card 2: 7-Day State Estimate */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  State 7-Day Estimate
                </div>
                <div className="text-2xl font-bold text-indigo-700">
                  {overview?.estimatedUpcoming7d ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Expected 7-day state requirement
                </div>
              </div>

              {/* Card 3: Top State Group */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  Primary State-wide Group
                </div>
                <div className="text-2xl font-bold text-red-700">
                  {overview?.mostRequestedGroup?.displayName ??
                    (loading ? "..." : "None")}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {overview?.mostRequestedGroup
                    ? `${overview.mostRequestedGroup.totalUnits} units across state`
                    : "No state records"}
                </div>
              </div>

              {/* Card 4: Districts Count */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">
                  Active Districts
                </div>
                <div className="text-2xl font-bold text-[#053845]">
                  {regionalContext?.districtBreakdown?.length ?? 1}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Districts with participating facilities
                </div>
              </div>
            </div>

            {/* District-by-District Breakdown Table */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
              <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  District-by-District Blood Demand Breakdown
                </h3>
                <p className="text-xs text-slate-500">
                  Relative share of blood requisitions across districts in {location?.displayState || "the state"}
                </p>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading...</div>
              ) : (regionalContext?.districtBreakdown?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500">
                        <th className="py-2.5 px-3 font-semibold">District Name</th>
                        <th className="py-2.5 px-3 font-semibold text-center">
                          Hospitals
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Total Units Requested
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Share of State Demand
                        </th>
                        <th className="py-2.5 px-3 font-semibold">Demand Share Bar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]">
                      {regionalContext!.districtBreakdown!.map((d: any, idx: number) => {
                        const isCurrent =
                          d.districtName.toLowerCase() ===
                          (location?.district || "").toLowerCase();
                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-[#FAF6EE]/50 ${
                              isCurrent ? "bg-amber-50/50 font-semibold" : ""
                            }`}
                          >
                            <td className="py-3 px-3 text-[#053845] flex items-center gap-2">
                              <span>{d.districtName}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-normal">
                                  Your District
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center text-slate-700">
                              {d.hospitalCount}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-[#053845] font-mono">
                              {d.totalUnits} u
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700 font-mono">
                              {d.percentageOfState}%
                            </td>
                            <td className="py-3 px-3 w-40">
                              <div className="w-full bg-[#FAF6EE] h-2.5 rounded-full overflow-hidden border border-[#F3E9D1]">
                                <div
                                  className="bg-indigo-600 h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(5, d.percentageOfState)
                                    )}%`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No district breakdown available.
                </div>
              )}
            </div>

            {/* State Attention Groups & Recommendations */}
            {insights?.recommendedActions && (
              <div className="bg-[#FAF6EE] rounded-xl border border-[#E3D8BF] p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-serif font-bold text-[#053845]">
                    State-wide Coordination Recommendations
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insights.recommendedActions.map((action: string, idx: number) => (
                    <div
                      key={idx}
                      className="bg-white p-3.5 rounded-lg border border-[#F3E9D1] text-xs text-slate-700 flex items-start gap-2.5 shadow-2xs"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
