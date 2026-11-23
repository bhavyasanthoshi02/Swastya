"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Droplets,
  Calendar,
  Layers,
  RefreshCw,
  Search,
  ArrowLeft,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Tent,
  MessageSquare,
  Package,
  ShieldAlert,
  X,
  AlertCircle,
  Eye,
} from "lucide-react";
import {
  api,
  CompletePredictionPayloadItem,
  BloodGroupPredictionItem,
  ShortageRiskLevel,
} from "@/lib/api";

type ForecastPeriod = 7 | 14 | 30;

function formatBloodGroup(bg?: string | null): string {
  if (!bg) return "—";
  return bg
    .replace("_POSITIVE", "+")
    .replace("_NEGATIVE", "-")
    .replace("POSITIVE", "+")
    .replace("NEGATIVE", "-");
}

function formatComponentLabel(component?: string | null): string {
  if (!component) return "All Components";
  if (component === "ALL") return "All Components";
  if (component === "WHOLE_BLOOD") return "Whole Blood";
  if (component === "RBC") return "Packed Red Cells (RBC)";
  if (component === "PLATELETS") return "Platelets";
  if (component === "PLASMA") return "Plasma (FFP)";
  return component
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const COMPONENT_OPTIONS = [
  { value: "ALL", label: "All Components" },
  { value: "WHOLE_BLOOD", label: "Whole Blood" },
  { value: "RBC", label: "Packed Red Cells (PRBC)" },
  { value: "PLATELETS", label: "Platelets" },
  { value: "PLASMA", label: "Plasma (FFP)" },
];

export default function BloodShortagePredictorPage() {
  const [period, setPeriod] = useState<ForecastPeriod>(7);
  const [component, setComponent] = useState<string>("ALL");
  const [data, setData] = useState<CompletePredictionPayloadItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ShortageRiskLevel>("ALL");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const fetchPredictions = useCallback(
    async (isBackground = false) => {
      try {
        if (isBackground) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const res = await api.bloodbank.predictions.get({
          period,
          component,
        });

        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError("Failed to load blood shortage predictions from database");
        }
      } catch (err: any) {
        console.error("Error fetching predictions:", err);
        setError(err?.data?.message || err?.message || "Failed to connect to predictive intelligence engine");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [period, component]
  );

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  // Filtered blood groups for the analysis table
  const filteredPredictions = useMemo(() => {
    if (!data?.predictions) return [];
    return data.predictions.filter((item) => {
      const formatted = formatBloodGroup(item.bloodGroup);
      const matchesSearch =
        searchQuery.trim() === "" ||
        item.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.bloodGroup.toLowerCase().includes(searchQuery.toLowerCase()) ||
        formatted.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || item.riskLevel === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [data?.predictions, searchQuery, statusFilter]);

  const toggleGroupExpand = (bg: string) => {
    setExpandedGroup((prev) => (prev === bg ? null : bg));
  };

  const getRiskBadgeStyles = (level: ShortageRiskLevel) => {
    switch (level) {
      case "CRITICAL":
        return "bg-rose-50 text-rose-800 border-rose-200";
      case "HIGH":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "MODERATE":
        return "bg-yellow-50 text-yellow-800 border-yellow-200";
      case "LOW":
        return "bg-teal-50 text-teal-800 border-teal-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const overview = data?.overview;
  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL" || component !== "ALL";

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/bloodbank/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blood Bank Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            Real Database Records: {overview?.historicalRequestsAnalyzed ?? 0} hospital requisitions &bull; {overview?.totalAvailableUnits ?? 0} units available
          </span>
        )}
      </div>

      {/* Notifications / Alerts */}
      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 rounded-lg text-teal-600 hover:text-teal-800 hover:bg-teal-100/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-100/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Page Header (Matching Hospital Requisitions & Bloodbank Pages) */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                AI Blood Shortage Predictor
              </h1>
              {!isLoading && overview && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {overview.confidenceLevel} Confidence
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Anticipate potential blood deficits {period} days ahead using live stock and recorded hospital requisitions. Zero synthetic data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <Link
            href="/bloodbank/camp-planner"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#FAF6EE]/80 border border-[#F3E9D1] shadow-2xs transition-colors"
          >
            <Tent className="w-3.5 h-3.5 text-[#317786]" />
            <span>Smart Camp Planner</span>
          </Link>
          <button
            type="button"
            onClick={() => fetchPredictions(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh prediction calculations"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Four Compact Summary KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Available Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Available Stock</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <Droplets className="w-3.5 h-3.5 text-teal-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {overview?.totalAvailableUnits ?? 0}
          </div>
          <p className="text-[11px] text-teal-700 font-medium">Active verified units</p>
        </div>

        {/* Shortage Risk Count */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Shortage Risk</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-700">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-rose-900">
            {overview?.groupsAtRiskCount ?? 0}
          </div>
          <p className="text-[11px] text-rose-700 font-medium">
            {overview?.groupsAtRiskCount === 1 ? "1 group at risk" : `${overview?.groupsAtRiskCount ?? 0} groups at risk`}
          </p>
        </div>

        {/* Predicted Deficit Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Forecast Deficit</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {overview?.predictedShortagesTotalUnits ? `-${overview.predictedShortagesTotalUnits}` : "0"}
          </div>
          <p className="text-[11px] text-amber-700 font-medium">Over next {period} days</p>
        </div>

        {/* Approaching Expiry */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Critical Expiry</span>
            <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845]">
              <Calendar className="w-3.5 h-3.5 text-[#053845]" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {overview?.unitsApproachingCriticalExpiry ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">Expiring within {period}d</p>
        </div>
      </section>

      {/* 3. Search and Multi-Horizon / Component Filters */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by blood group (e.g. A+, B-, O+)..."
              className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Forecast Horizon Switcher */}
          <div className="flex items-center gap-1 p-1 bg-[#FAF6EE] rounded-xl border border-[#F3E9D1]">
            {[
              { days: 7, label: "7 Days" },
              { days: 14, label: "14 Days" },
              { days: 30, label: "30 Days" },
            ].map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setPeriod(opt.days as ForecastPeriod)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  period === opt.days
                    ? "bg-[#053845] text-white shadow-2xs"
                    : "text-slate-600 hover:text-[#053845] hover:bg-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Component Filter */}
          <div className="flex items-center gap-2">
            <select
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
            >
              {COMPONENT_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Risk Level Filter */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
            >
              <option value="ALL">All Risk Tiers</option>
              <option value="CRITICAL">Critical Shortage</option>
              <option value="HIGH">High Risk</option>
              <option value="MODERATE">Moderate Risk</option>
              <option value="LOW">Stable / Safe</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setComponent("ALL");
                  setSearchQuery("");
                }}
                className="text-xs font-medium text-[#317786] hover:underline px-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Transparent Data Note */}
        {overview && (
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <div>
              <span className="font-semibold text-slate-700">Data Source: </span>
              <span>{overview.dataSufficiencyNote}</span>
            </div>
            <div className="text-slate-400 font-mono">
              Last updated: {new Date(overview.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        )}
      </section>

      {/* 4. Blood Group Shortage Analysis Table */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-7 h-7 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Calculating blood shortage predictions...</p>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#317786] mx-auto">
              <Droplets className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-serif text-base font-bold text-[#053845]">No blood groups found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                No blood groups match your active search and filter criteria.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setComponent("ALL");
                  setSearchQuery("");
                }}
                className="text-xs font-semibold text-[#317786] hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF6EE]/70 text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-b border-[#F3E9D1]">
                  <th className="py-3 px-5">Blood Group</th>
                  <th className="py-3 px-4">Available Units</th>
                  <th className="py-3 px-4">Recorded Requisitions</th>
                  <th className="py-3 px-4">Daily Velocity</th>
                  <th className="py-3 px-4 text-center">{period}d Demand</th>
                  <th className="py-3 px-4 text-center">Net Position</th>
                  <th className="py-3 px-4">Supply Runway</th>
                  <th className="py-3 px-4 text-center">Risk Tier</th>
                  <th className="py-3 px-5 text-right">Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredPredictions.map((row) => {
                  const isExpanded = expandedGroup === row.bloodGroup;
                  const displayGroup = formatBloodGroup(row.bloodGroup);
                  const isDeficit = row.deficitUnits > 0;

                  return (
                    <React.Fragment key={row.bloodGroup}>
                      <tr
                        onClick={() => toggleGroupExpand(row.bloodGroup)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isExpanded ? "bg-[#FAF6EE]/40" : ""
                        }`}
                      >
                        {/* Blood Group */}
                        <td className="py-3.5 px-5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]">
                            <Droplets className="w-3.5 h-3.5 text-[#B94F30]" />
                            <span>{displayGroup}</span>
                          </span>
                        </td>

                        {/* Available Stock */}
                        <td className="py-3.5 px-4 font-mono font-bold text-[#053845]">
                          {row.availableUnits} units
                          {row.quarantinedUnits > 0 && (
                            <span className="text-[10px] text-amber-700 block font-normal">
                              ({row.quarantinedUnits} quarantined)
                            </span>
                          )}
                        </td>

                        {/* Recorded Requisitions */}
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {row.historicalTotalDemand} req
                        </td>

                        {/* Daily Velocity */}
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {row.historicalDailyDemand > 0
                            ? `${row.historicalDailyDemand.toFixed(2)}/day`
                            : "0.00/day"}
                        </td>

                        {/* Predicted Demand in Period */}
                        <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-800">
                          {row.predictedDemand} units
                        </td>

                        {/* Net Position (Surplus / Deficit) */}
                        <td className="py-3.5 px-4 text-center font-mono font-bold">
                          {isDeficit ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                              -{row.deficitUnits} deficit
                            </span>
                          ) : row.availableUnits > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                              +{row.expectedStockPosition} surplus
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0</span>
                          )}
                        </td>

                        {/* Days of Supply Runway */}
                        <td className="py-3.5 px-4 font-mono">
                          {row.historicalDailyDemand > 0 ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                row.daysOfSupply <= 2
                                  ? "bg-rose-100 text-rose-800"
                                  : row.daysOfSupply <= 5
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-teal-100 text-teal-800"
                              }`}
                            >
                              {row.daysOfSupply} days
                            </span>
                          ) : row.availableUnits > 0 ? (
                            <span className="text-teal-700 font-medium text-[11px]">Surplus (0 burn)</span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">0 days</span>
                          )}
                        </td>

                        {/* Risk Tier Badge */}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${getRiskBadgeStyles(
                              row.riskLevel
                            )}`}
                          >
                            {row.riskLevel}
                          </span>
                        </td>

                        {/* Details Accordion Toggle */}
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            aria-label="Toggle details"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Component Breakdown & Explanation */}
                      {isExpanded && (
                        <tr className="bg-[#FAF6EE]/50">
                          <td colSpan={9} className="p-4 sm:p-5 border-b border-[#F3E9D1]">
                            <div className="space-y-3">
                              {/* Clinical Explanation */}
                              <div className="p-3 rounded-xl bg-white border border-[#F3E9D1] text-xs text-slate-700 flex items-start gap-2.5">
                                <Info className="w-4 h-4 text-[#317786] shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold text-[#053845]">Assessment: </span>
                                  <span>{row.explanation}</span>
                                </div>
                              </div>

                              {/* Component-level Breakdown */}
                              <div>
                                <span className="block text-[11px] font-bold text-[#053845] uppercase tracking-wider mb-2">
                                  Derivative Breakdown for {displayGroup}
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                  {row.componentBreakdown.map((comp) => (
                                    <div
                                      key={comp.component}
                                      className="p-2.5 rounded-xl bg-white border border-[#F3E9D1] shadow-2xs space-y-1 text-xs"
                                    >
                                      <div className="font-semibold text-[#053845] truncate">
                                        {comp.displayName}
                                      </div>
                                      <div className="flex items-center justify-between text-slate-600 font-mono text-[11px]">
                                        <span>Available:</span>
                                        <span className="font-bold text-[#053845]">
                                          {comp.availableUnits} units
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-600 font-mono text-[11px]">
                                        <span>Demand ({period}d):</span>
                                        <span className="font-bold text-slate-700">
                                          {comp.predictedDemand} units
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Action Shortcuts */}
                              <div className="pt-2 flex items-center justify-end gap-2">
                                {isDeficit && (
                                  <>
                                    <Link
                                      href="/bloodbank/camps"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#053845] text-white font-semibold text-xs hover:bg-[#317786] transition-colors"
                                    >
                                      <Tent className="w-3.5 h-3.5" />
                                      <span>Schedule Camp</span>
                                    </Link>
                                    <Link
                                      href="/bloodbank/sms"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-[#053845] font-semibold text-xs hover:bg-[#FAF6EE] transition-colors"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5 text-[#317786]" />
                                      <span>Broadcast SMS</span>
                                    </Link>
                                  </>
                                )}
                                <Link
                                  href="/bloodbank/inventory"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-slate-700 font-semibold text-xs hover:bg-[#FAF6EE] transition-colors"
                                >
                                  <Package className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Manage Inventory</span>
                                </Link>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. AI Insights & Operational Recommendations (Matching Requisitions / Portal Cards) */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* AI Clinical Insights */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#317786]/15">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#317786]" />
                <h3 className="font-serif font-bold text-[#053845] text-sm sm:text-base">
                  AI Clinical Insights
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {data.insights?.length || 0} findings
              </span>
            </div>

            <div className="space-y-2.5">
              {data.insights?.map((insight) => (
                <div
                  key={insight.id}
                  className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                    insight.severity === "critical"
                      ? "bg-rose-50/70 border-rose-200 text-rose-950"
                      : insight.severity === "warning"
                      ? "bg-amber-50/70 border-amber-200 text-amber-950"
                      : insight.severity === "success"
                      ? "bg-teal-50/70 border-teal-200 text-teal-950"
                      : "bg-[#FAF6EE] border-[#F3E9D1] text-[#053845]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold flex items-center gap-1.5">
                      {insight.severity === "critical" ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      ) : insight.severity === "warning" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      )}
                      {insight.title}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/80 border border-slate-200">
                      {insight.confidence}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {insight.description}
                  </p>

                  <div className="pt-1 text-[11px] font-semibold text-[#053845]">
                    Recommendation: {insight.suggestedAction}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Operational Action Items */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#317786]/15">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#317786]" />
                <h3 className="font-serif font-bold text-[#053845] text-sm sm:text-base">
                  Operational Action Items
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {data.recommendations?.length || 0} actions
              </span>
            </div>

            <div className="space-y-2.5">
              {data.recommendations?.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/50 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#053845]">{rec.title}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        rec.priority === "HIGH"
                          ? "bg-rose-100 text-rose-800"
                          : rec.priority === "MEDIUM"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {rec.priority}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {rec.actionText}
                  </p>

                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {rec.estimatedDeficitAverted
                        ? `Averts deficit: ~${rec.estimatedDeficitAverted} units`
                        : "Routine procedure"}
                    </span>

                    {rec.category === "CAMP_ORGANIZATION" && (
                      <Link
                        href="/bloodbank/camps"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#317786] hover:underline"
                      >
                        <span>Schedule Camp</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}

                    {rec.category === "FEFO_DISPATCH" && (
                      <Link
                        href="/bloodbank/inventory"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#317786] hover:underline"
                      >
                        <span>Manage Lots</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
