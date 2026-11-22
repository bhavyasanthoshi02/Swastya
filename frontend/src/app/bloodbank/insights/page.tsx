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
  FlaskConical,
  ClipboardList,
  ShieldCheck,
  Check,
  X,
  ExternalLink,
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

export default function BloodBankInsightsPage() {
  const [activeTab, setActiveTab] = useState<"EXPIRY" | "DEMAND">("EXPIRY");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedComponent, setSelectedComponent] = useState<string>("");
  const [timeframeDays, setTimeframeDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [expiryData, setExpiryData] = useState<any | null>(null);
  const [demandData, setDemandData] = useState<any | null>(null);

  // Safety test feedback
  const [safetyFeedback, setSafetyFeedback] = useState<{
    unitBarcode: string;
    isSafe: boolean;
    message: string;
  } | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expRes, demRes] = await Promise.all([
        api.bloodbank.getExpiryPrediction({
          bloodGroup: selectedGroup || undefined,
          bloodComponent: selectedComponent || undefined,
        }),
        api.bloodbank.getDemandForecast({
          timeframeDays,
          bloodGroup: selectedGroup || undefined,
          bloodComponent: selectedComponent || undefined,
        }),
      ]);

      if (expRes.success && expRes.data) {
        setExpiryData(expRes.data);
      }
      if (demRes.success && demRes.data) {
        setDemandData(demRes.data);
      }
    } catch (err: any) {
      console.error("Error loading blood bank analytics:", err);
      setError(err.message || "Failed to retrieve blood bank insights.");
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, selectedComponent, timeframeDays]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const testUnitSafety = async (unit: any) => {
    try {
      const res = await api.bloodbank.validateUnitSafety(
        expiryData?.bloodBankId || "",
        unit.unitid
      );
      setSafetyFeedback({
        unitBarcode: unit.unitbarcode,
        isSafe: res.isSafe,
        message: res.message,
      });
    } catch (err: any) {
      setSafetyFeedback({
        unitBarcode: unit.unitbarcode,
        isSafe: false,
        message: err.message || "Safety validation failed.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-16">
      {/* Header Strip */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#F3E9D1] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#053845]/10 text-[#053845]">
                <Sparkles className="w-3.5 h-3.5 text-[#317786]" />
                Clinical AI & Analytics
              </span>
              <span className="text-xs text-slate-500">
                Blood Bank Intelligence
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#053845] tracking-tight">
              Blood Expiry & Demand Intelligence
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              FEFO allocation queuing, prospective wastage prediction via velocity models, and prospective demand forecasting.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-white border border-[#F3E9D1] text-[#053845] hover:bg-[#FAF6EE] transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh Data
            </button>
            <Link
              href="/bloodbank/inventory"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#053845] text-white hover:bg-[#074d5f] transition-colors shadow-sm"
            >
              <Droplets className="w-3.5 h-3.5 text-red-300" />
              Manage Inventory
            </Link>
          </div>
        </div>

        {/* View Switcher Tabs & Filters */}
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-xl border border-[#F3E9D1] p-4 shadow-sm">
          {/* Main Navigation Tabs */}
          <div className="flex items-center bg-[#FAF6EE] p-1 rounded-lg border border-[#F3E9D1]">
            <button
              onClick={() => setActiveTab("EXPIRY")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "EXPIRY"
                  ? "bg-[#053845] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#053845]"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Expiry & Wastage Prediction (Feature 2)
            </button>
            <button
              onClick={() => setActiveTab("DEMAND")}
              className={`px-4 py-2 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "DEMAND"
                  ? "bg-[#053845] text-white shadow-xs"
                  : "text-slate-600 hover:text-[#053845]"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Demand Forecasting (Feature 1)
            </button>
          </div>

          {/* Filter dropdowns */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 font-medium">Group:</label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="text-xs bg-[#FAF6EE] border border-[#F3E9D1] rounded-lg px-2.5 py-1.5 font-medium text-[#053845] focus:outline-none"
              >
                {BLOOD_GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 font-medium">Component:</label>
              <select
                value={selectedComponent}
                onChange={(e) => setSelectedComponent(e.target.value)}
                className="text-xs bg-[#FAF6EE] border border-[#F3E9D1] rounded-lg px-2.5 py-1.5 font-medium text-[#053845] focus:outline-none"
              >
                {COMPONENTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Safety Feedback Banner */}
        {safetyFeedback && (
          <div
            className={`mt-4 p-4 rounded-xl border flex items-start justify-between gap-3 shadow-xs ${
              safetyFeedback.isSafe
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            <div className="flex items-start gap-2.5 text-xs">
              {safetyFeedback.isSafe ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
              )}
              <div>
                <div className="font-bold">
                  Clinical Safety Check: Unit {safetyFeedback.unitBarcode}
                </div>
                <div className="mt-0.5">{safetyFeedback.message}</div>
              </div>
            </div>
            <button
              onClick={() => setSafetyFeedback(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Early Warnings from Expiry Service */}
        {expiryData?.earlyWarnings?.length > 0 && (
          <div className="mt-4 space-y-2">
            {expiryData.earlyWarnings.map((warn: string, i: number) => (
              <div
                key={i}
                className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-medium">{warn}</span>
              </div>
            ))}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: EXPIRY & WASTAGE PREDICTION (FEATURE 2)                           */}
        {/* ========================================================================= */}
        {activeTab === "EXPIRY" && (
          <>
            {/* KPI Cards: Expiry Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
              {/* Card 1: Active Units */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1">Total Active Stock</div>
                <div className="text-2xl font-bold text-[#053845]">
                  {expiryData?.summary?.totalActiveUnits ?? (loading ? "..." : 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  Available & Quarantined
                </div>
              </div>

              {/* Card 2: Expiring Soon */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                  <span>Expiring Soon</span>
                  <span className="text-[10px] bg-amber-50 text-amber-700 font-semibold px-1.5 py-0.5 rounded border border-amber-200">
                    ≤ 7 Days
                  </span>
                </div>
                <div className="text-2xl font-bold text-amber-600">
                  {expiryData?.summary?.expiringSoonCount ?? (loading ? "..." : 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </div>
                <div className="text-[11px] text-amber-700 mt-2 font-medium">
                  {expiryData?.summary?.expiringCriticalCount ?? 0} critical (≤ 72h)
                </div>
              </div>

              {/* Card 3: Expired Units */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                  <span>Expired Stock</span>
                  <span className="text-[10px] bg-red-50 text-red-700 font-semibold px-1.5 py-0.5 rounded border border-red-200">
                    Disposal Required
                  </span>
                </div>
                <div className="text-2xl font-bold text-red-700">
                  {expiryData?.summary?.expiredCount ?? (loading ? "..." : 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </div>
                <div className="text-[11px] text-red-600 mt-2">
                  Zero clinical allocation allowed
                </div>
              </div>

              {/* Card 4: Predicted Wastage */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                  <span>Projected Wastage</span>
                  <span className="text-[10px] bg-purple-50 text-purple-700 font-semibold px-1.5 py-0.5 rounded border border-purple-200">
                    Next 7d
                  </span>
                </div>
                <div className="text-2xl font-bold text-purple-700">
                  {expiryData?.summary?.predictedWastageUnits7d ?? (loading ? "..." : 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Burn rate surplus excess
                </div>
              </div>

              {/* Card 5: FEFO Eligible */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                  <span>FEFO Queued</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-1.5 py-0.5 rounded border border-emerald-200">
                    Priority Safe
                  </span>
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {expiryData?.summary?.fefoEligibleUnitsCount ?? (loading ? "..." : 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Earliest-expiring safe stock
                </div>
              </div>
            </div>

            {/* FEFO Prioritization Queue Container */}
            <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-[#F3E9D1]">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#053845] flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    FEFO (First-Expiring, First-Out) Priority Allocation Queue
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Units sorted strictly by earliest expiry date to prioritize compatible dispatch and minimize expiry losses.
                  </p>
                </div>
                <span className="text-xs bg-[#FAF6EE] px-2.5 py-1 rounded border border-[#F3E9D1] text-[#053845] font-semibold">
                  {expiryData?.fefoQueue?.length ?? 0} Eligible Units
                </span>
              </div>

              {expiryData?.fefoQueue && expiryData.fefoQueue.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500 bg-[#FAF6EE]/50">
                        <th className="py-2.5 px-3 font-semibold">FEFO Rank</th>
                        <th className="py-2.5 px-3 font-semibold">Barcode / DIN</th>
                        <th className="py-2.5 px-3 font-semibold">Group</th>
                        <th className="py-2.5 px-3 font-semibold">Component</th>
                        <th className="py-2.5 px-3 font-semibold">Actual Expiry Date</th>
                        <th className="py-2.5 px-3 font-semibold">Days Left</th>
                        <th className="py-2.5 px-3 font-semibold">TTI Screening</th>
                        <th className="py-2.5 px-3 font-semibold">Storage Location</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Safety Guard</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]/60">
                      {expiryData.fefoQueue.slice(0, 8).map((unit: any, idx: number) => (
                        <tr key={unit.unitid} className="hover:bg-[#FAF6EE]/40 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-500">
                            #{idx + 1}
                          </td>
                          <td className="py-3 px-3 font-mono font-medium text-[#053845]">
                            {unit.unitbarcode}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-block px-2 py-0.5 rounded font-bold bg-red-50 text-red-700 text-xs">
                              {unit.bloodGroupDisplay}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 font-medium">
                            {unit.componentDisplay}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {new Date(unit.expirydate).toISOString().split("T")[0]}
                          </td>
                          <td className="py-3 px-3 font-semibold">
                            {unit.daysRemaining <= 3 ? (
                              <span className="text-red-600 font-bold">
                                {unit.daysRemaining}d ({unit.hoursRemaining}h)
                              </span>
                            ) : unit.daysRemaining <= 7 ? (
                              <span className="text-amber-600 font-bold">
                                {unit.daysRemaining}d
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-medium">
                                {unit.daysRemaining}d
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <Check className="w-3 h-3" />
                              PASSED
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                            {unit.storagebinlocation || "Vault Bin A1"}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => testUnitSafety(unit)}
                              className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#053845] text-white hover:bg-[#074d5f] transition-colors"
                            >
                              Verify Safety
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  No eligible unexpired units currently queued for FEFO dispatch.
                </div>
              )}
            </div>

            {/* Comprehensive Unit Inventory Expiry Table */}
            <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-[#F3E9D1]">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#053845]">
                    Active Inventory Units — Expiry & Viability Monitor
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tracked by unique barcode and actual collection and expiry timestamps
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  Showing {expiryData?.units?.length ?? 0} tracked units
                </span>
              </div>

              {expiryData?.units && expiryData.units.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500 bg-[#FAF6EE]/50">
                        <th className="py-2.5 px-3 font-semibold">Barcode</th>
                        <th className="py-2.5 px-3 font-semibold">Group</th>
                        <th className="py-2.5 px-3 font-semibold">Component</th>
                        <th className="py-2.5 px-3 font-semibold">Expiry Date</th>
                        <th className="py-2.5 px-3 font-semibold">Status Category</th>
                        <th className="py-2.5 px-3 font-semibold">TTI Status</th>
                        <th className="py-2.5 px-3 font-semibold">Location</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Safety Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]/60">
                      {expiryData.units.map((unit: any) => {
                        const isExpired = unit.category === "EXPIRED";
                        const isCritical = unit.category === "EXPIRING_CRITICAL_3D";
                        const isWarning = unit.category === "EXPIRING_SOON_7D";

                        return (
                          <tr
                            key={unit.unitid}
                            className={`hover:bg-[#FAF6EE]/40 transition-colors ${
                              isExpired ? "bg-red-50/40" : ""
                            }`}
                          >
                            <td className="py-3 px-3 font-mono font-medium text-[#053845]">
                              {unit.unitbarcode}
                            </td>
                            <td className="py-3 px-3 font-bold text-red-700">
                              {unit.bloodGroupDisplay}
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              {unit.componentDisplay}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-600">
                              {new Date(unit.expirydate).toISOString().split("T")[0]}
                            </td>
                            <td className="py-3 px-3">
                              {isExpired ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
                                  EXPIRED ({Math.abs(unit.daysRemaining)}d ago)
                                </span>
                              ) : isCritical ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                                  CRITICAL ({unit.daysRemaining}d left)
                                </span>
                              ) : isWarning ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  EXPIRING ({unit.daysRemaining}d left)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  SAFE ({unit.daysRemaining}d left)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                  unit.ttiscreeningstatus === "PASSED"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {unit.ttiscreeningstatus}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                              {unit.storagebinlocation || "Vault Bin A1"}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <button
                                onClick={() => testUnitSafety(unit)}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                                  isExpired
                                    ? "bg-red-700 text-white hover:bg-red-800"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                              >
                                {isExpired ? "Audit Disposal" : "Validate Safety"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  No active units found matching current filter criteria.
                </div>
              )}
            </div>

            {/* Wastage Risk Projections via Consumption Velocity Model */}
            <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
              <div className="mb-4 pb-3 border-b border-[#F3E9D1]">
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  Turnover Velocity & Prospective Wastage Modeling
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Estimates potential expiry surplus by evaluating units expiring in 7 days against 30-day historical consumption velocity (burn rate).
                </p>
              </div>

              {expiryData?.wastageProjections && expiryData.wastageProjections.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500 bg-[#FAF6EE]/50">
                        <th className="py-2.5 px-3 font-semibold">Group</th>
                        <th className="py-2.5 px-3 font-semibold">Component</th>
                        <th className="py-2.5 px-3 font-semibold">Expiring ≤ 7d</th>
                        <th className="py-2.5 px-3 font-semibold">Daily Burn Rate</th>
                        <th className="py-2.5 px-3 font-semibold">Projected 7d Usage</th>
                        <th className="py-2.5 px-3 font-semibold">Predicted Wastage Surplus</th>
                        <th className="py-2.5 px-3 font-semibold">Risk Level</th>
                        <th className="py-2.5 px-3 font-semibold">Mitigation Strategy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]/60">
                      {expiryData.wastageProjections.map((p: any, idx: number) => {
                        const riskStyles: Record<string, string> = {
                          HIGH: "bg-red-50 text-red-700 border-red-200",
                          MEDIUM: "bg-orange-50 text-orange-700 border-orange-200",
                          LOW: "bg-amber-50 text-amber-700 border-amber-200",
                          NONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
                        };

                        return (
                          <tr key={idx} className="hover:bg-[#FAF6EE]/40 transition-colors">
                            <td className="py-3 px-3 font-bold text-[#053845]">
                              {p.bloodGroupDisplay}
                            </td>
                            <td className="py-3 px-3 text-slate-600">
                              {p.componentDisplay}
                            </td>
                            <td className="py-3 px-3 font-medium text-slate-800">
                              {p.currentExpiringUnits7d} unit(s)
                            </td>
                            <td className="py-3 px-3 text-slate-600 font-mono">
                              {p.historicalDailyBurnRate} u/day
                            </td>
                            <td className="py-3 px-3 text-slate-600 font-mono">
                              {p.projected7dConsumption} unit(s)
                            </td>
                            <td className="py-3 px-3 font-bold">
                              {p.predictedWastageUnits > 0 ? (
                                <span className="text-red-700">
                                  +{p.predictedWastageUnits} surplus unit(s)
                                </span>
                              ) : (
                                <span className="text-emerald-700">0 units (absorbed)</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                  riskStyles[p.wastageRiskLevel] || riskStyles.NONE
                                }`}
                              >
                                {p.wastageRiskLevel}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-600 text-[11px] max-w-sm">
                              {p.mitigationStrategy}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  No expiring inventory units detected in the upcoming 7 days.
                </div>
              )}
            </div>

            {/* Actionable Recommendations */}
            <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
              <h3 className="text-base font-serif font-bold text-[#053845] mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Actionable Wastage Reduction Protocols
              </h3>
              <ul className="space-y-2 text-xs text-slate-700">
                {expiryData?.actionableRecommendations?.map((rec: string, i: number) => (
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
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DEMAND FORECASTING (FEATURE 1)                                    */}
        {/* ========================================================================= */}
        {activeTab === "DEMAND" && (
          <>
            {/* KPI Cards: Demand Forecast */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1">Historical Fulfilled Demand</div>
                <div className="text-2xl font-bold text-[#053845]">
                  {demandData?.totalHistoricalUnits ?? (loading ? "..." : 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Past {timeframeDays} days across assignments
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                  <span>7-Day Forecast</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-1.5 py-0.5 rounded border border-emerald-200">
                    WMA Projection
                  </span>
                </div>
                <div className="text-2xl font-bold text-[#053845]">
                  {demandData?.predictedDemand?.totalProjected7d ?? (loading ? "..." : 0)}{" "}
                  <span className="text-xs font-normal text-slate-500">units</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  14d: {demandData?.predictedDemand?.totalProjected14d ?? 0}u | 30d:{" "}
                  {demandData?.predictedDemand?.totalProjected30d ?? 0}u
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                  <span>Top Requested Group</span>
                  <span className="text-[10px] bg-red-50 text-red-700 font-semibold px-1.5 py-0.5 rounded border border-red-200">
                    Highest Volume
                  </span>
                </div>
                <div className="text-2xl font-bold text-red-700">
                  {demandData?.frequentlyRequestedGroups?.[0]?.displayName ?? (loading ? "..." : "N/A")}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  {demandData?.frequentlyRequestedGroups?.[0]
                    ? `${demandData.frequentlyRequestedGroups[0].percentage}% of total bank demand`
                    : "No assignments"}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-sm">
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-between">
                  <span>Inventory Shortage Alerts</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                    Vault Deficit
                  </span>
                </div>
                <div className="text-2xl font-bold text-[#053845]">
                  {demandData?.shortages?.filter((s: any) => s.riskLevel !== "ADEQUATE").length ?? 0}{" "}
                  <span className="text-xs font-normal text-slate-500">group(s)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Compared against 7d forecast
                </div>
              </div>
            </div>

            {/* Daily Projections Chart / Bar List */}
            <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#F3E9D1]">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#053845]">
                    Prospective 7-Day Demand Schedule
                  </h3>
                  <p className="text-xs text-slate-500">
                    Statistical requirement projection with upper/lower variance intervals
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  Method: WMA + Linear Trend
                </span>
              </div>

              {demandData?.predictedDemand?.daily7d?.length > 0 ? (
                <div className="space-y-3">
                  {demandData.predictedDemand.daily7d.map((dp: any, idx: number) => {
                    const maxVal = Math.max(
                      5,
                      ...demandData.predictedDemand.daily7d.map((p: any) => p.upperBound || p.predictedUnits)
                    );
                    const pct = Math.min(100, Math.round((dp.predictedUnits / maxVal) * 100));

                    return (
                      <div key={idx} className="flex items-center gap-4 text-xs">
                        <div className="w-24 text-slate-600 font-mono text-[11px]">
                          {dp.date}
                        </div>
                        <div className="flex-1 bg-[#FAF6EE] h-6 rounded-md relative overflow-hidden flex items-center px-2">
                          <div
                            className="absolute bg-[#053845] h-3.5 rounded transition-all"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                        <div className="w-28 text-right font-medium text-[#053845]">
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
                <div className="py-8 text-center text-xs text-slate-500">
                  No demand data available to project.
                </div>
              )}
            </div>

            {/* Shortage Analysis Table */}
            <div className="mt-8 bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-sm">
              <div className="mb-4 pb-3 border-b border-[#F3E9D1]">
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  Vault Shortages vs Prospective 7-Day Demand
                </h3>
                <p className="text-xs text-slate-500">
                  Evaluates available unquarantined stock against forecasted regional requests
                </p>
              </div>

              {demandData?.shortages && demandData.shortages.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500 bg-[#FAF6EE]/50">
                        <th className="py-2.5 px-3 font-semibold">Blood Group</th>
                        <th className="py-2.5 px-3 font-semibold">Component</th>
                        <th className="py-2.5 px-3 font-semibold">Available Stock</th>
                        <th className="py-2.5 px-3 font-semibold">Projected 7d Demand</th>
                        <th className="py-2.5 px-3 font-semibold">Deficit</th>
                        <th className="py-2.5 px-3 font-semibold">Risk Level</th>
                        <th className="py-2.5 px-3 font-semibold">Action Plan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]/60">
                      {demandData.shortages.map((item: any, idx: number) => {
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
                            <td className="py-3 px-3 text-slate-600 text-[11px] max-w-sm">
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
                  No shortages identified.
                </div>
              )}
            </div>
          </>
        )}

        {/* Section: Methodological Disclaimer */}
        <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs">
          <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            Clinical Safety & Governance Policy
          </div>
          <p className="leading-relaxed">
            All expiry timelines strictly utilize verified laboratory collection dates. No automatic expiry extensions are permitted under Indian Drugs and Cosmetics Act regulations. FEFO prioritization enforces First-Expiring, First-Out sequence while enforcing strict TTI-negative screening clearance prior to any reservation or dispatch event.
          </p>
        </div>
      </div>
    </div>
  );
}
