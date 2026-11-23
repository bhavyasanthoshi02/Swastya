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
  ShieldCheck,
  Package,
  ClockAlert,
  Archive,
  ArrowUpRight,
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

type InsightScope = "INVENTORY" | "DISTRICT" | "STATE";

export default function BloodBankInsightsPage() {
  const [activeScope, setActiveScope] = useState<InsightScope>("INVENTORY");
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
        activeScope === "INVENTORY"
          ? "inventory"
          : activeScope === "DISTRICT"
          ? "district"
          : "state";

      const res = await api.bloodbank.getRegionalInsights({
        scope: scopeParam,
        timeframeDays,
        bloodGroup: selectedGroup || undefined,
        bloodComponent: selectedComponent || undefined,
      });

      if (res.success && res.data) {
        setInsights(res.data);
      } else {
        setError("Failed to load blood bank insights.");
      }
    } catch (err: any) {
      console.error("Error loading blood bank insights:", err);
      setError(err.message || "Failed to retrieve blood bank insights.");
    } finally {
      setLoading(false);
    }
  }, [activeScope, timeframeDays, selectedGroup, selectedComponent]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const location = insights?.location;
  const inventoryOverview = insights?.inventoryOverview;
  const regionalDemand = insights?.regionalDemand;
  const regionalSupply = insights?.regionalSupply;
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
                Inventory & Regional Supply Intelligence
              </span>
              <span className="text-xs text-slate-500">
                Blood Bank Operations
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#053845] tracking-tight">
              Blood Inventory & Demand Insights
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Track units to use first (FEFO queue), prevent wastage before expiry, and balance district and state blood supply against hospital requirements.
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
              href="/bloodbank/inventory"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#053845] text-white hover:bg-[#074d5f] transition-colors shadow-xs"
            >
              <Package className="w-3.5 h-3.5 text-emerald-300" />
              Manage Inventory
            </Link>
          </div>
        </div>

        {/* View Selection Tabs (3 Views) */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="inline-flex p-1 bg-[#EBE3D0] rounded-xl border border-[#D8CEB8]">
            <button
              onClick={() => setActiveScope("INVENTORY")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeScope === "INVENTORY"
                  ? "bg-white text-[#053845] shadow-xs"
                  : "text-slate-600 hover:text-[#053845]"
              }`}
            >
              <Package className="w-4 h-4 text-[#317786]" />
              My Inventory
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
            <span>Blood Bank:</span>
            <span className="font-semibold text-[#053845]">
              {insights?.bloodBankName || "Authenticated Facility"}
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
            {/* Timeframe Selector (for district and state tabs) */}
            {activeScope !== "INVENTORY" && (
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
            )}

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
            * Only units verified safe (TTI Passed) and unexpired are marked allocation-eligible.
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
                  "City or state is missing in your facility profile. Update address to enable accurate district and state supply-demand balancing."}
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
        {/* VIEW 1: MY INVENTORY                                                     */}
        {/* ========================================================================= */}
        {activeScope === "INVENTORY" && (
          <div className="mt-6 space-y-6">
            {/* Inventory Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Card 1: Total Available Units */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">Available Units</div>
                <div className="text-2xl font-bold text-[#053845]">
                  {inventoryOverview?.totalAvailableUnits ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  <span>In active stock</span>
                </div>
              </div>

              {/* Card 2: Expiring in 3 Days */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Expiring in ≤3 Days</span>
                  <span className="text-[10px] bg-red-50 text-red-700 font-semibold px-2 py-0.5 rounded border border-red-200">
                    High Urgency
                  </span>
                </div>
                <div className="text-2xl font-bold text-red-700">
                  {inventoryOverview?.expiringWithin3Days ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <ClockAlert className="w-3.5 h-3.5 text-red-500" />
                  <span>Requires immediate use</span>
                </div>
              </div>

              {/* Card 3: Expiring in 7 Days */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Expiring in ≤7 Days</span>
                  <span className="text-[10px] bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded border border-amber-200">
                    Watchlist
                  </span>
                </div>
                <div className="text-2xl font-bold text-amber-700">
                  {inventoryOverview?.expiringWithin7Days ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>Plan upcoming dispatch</span>
                </div>
              </div>

              {/* Card 4: Allocation-Eligible Units */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Allocation-Eligible</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                    Safe
                  </span>
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {inventoryOverview?.eligibleAllocationCount ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>TTI passed + unexpired</span>
                </div>
              </div>

              {/* Card 5: Expired Units */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Expired / Discarded</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded border border-slate-200">
                    Isolated
                  </span>
                </div>
                <div className="text-2xl font-bold text-slate-600">
                  {inventoryOverview?.expiredCount ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                  <Archive className="w-3.5 h-3.5 text-slate-400" />
                  <span>Excluded from active stock</span>
                </div>
              </div>
            </div>

            {/* Units to Use First (FEFO Queue) */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#F3E9D1] gap-2">
                <div>
                  <h3 className="text-base font-serif font-bold text-[#053845] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Units to Use First (Strict Expiry Order)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dispatched in First-Expiry-First-Out order. Expired, quarantined, or TTI-failed units are strictly excluded.
                  </p>
                </div>
                <span className="text-[11px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded">
                  Clinical Safety Verified
                </span>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Loading allocation queue...
                </div>
              ) : (insights?.unitsToUseFirst?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500">
                        <th className="py-2.5 px-3 font-semibold">Priority</th>
                        <th className="py-2.5 px-3 font-semibold">Unit Barcode</th>
                        <th className="py-2.5 px-3 font-semibold">Blood Group</th>
                        <th className="py-2.5 px-3 font-semibold">Component</th>
                        <th className="py-2.5 px-3 font-semibold">Expiry Date</th>
                        <th className="py-2.5 px-3 font-semibold text-center">
                          Days Remaining
                        </th>
                        <th className="py-2.5 px-3 font-semibold">Storage Bin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]">
                      {insights.unitsToUseFirst.map((unit: any, idx: number) => {
                        const isCritical = unit.daysRemaining <= 3;
                        return (
                          <tr key={idx} className="hover:bg-[#FAF6EE]/50">
                            <td className="py-3 px-3 font-mono font-bold text-slate-400">
                              #{idx + 1}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-[#053845]">
                              {unit.unitBarcode}
                            </td>
                            <td className="py-3 px-3">
                              <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-red-700 font-mono font-bold border border-red-100">
                                {unit.bloodGroupDisplay}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-700">
                              {unit.componentDisplay}
                            </td>
                            <td className="py-3 px-3 text-slate-600 font-mono">
                              {new Date(unit.expiryDate).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full font-semibold font-mono text-[11px] ${
                                  isCritical
                                    ? "bg-red-50 text-red-700 border border-red-200"
                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                }`}
                              >
                                {unit.daysRemaining} days
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-500 font-mono">
                              {unit.storageBin || "Unassigned"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-500">
                  No active eligible inventory units available for dispatch.
                </div>
              )}
            </div>

            {/* Units Expiring Soon Table */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
              <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                <h3 className="text-base font-serif font-bold text-[#053845] flex items-center gap-2">
                  <ClockAlert className="w-4 h-4 text-red-600" />
                  Units Expiring Soon (Action List)
                </h3>
                <p className="text-xs text-slate-500">
                  Units reaching expiry within the next 7 days that require clinical priority or transfer.
                </p>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading...</div>
              ) : (insights?.unitsExpiringSoon?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500">
                        <th className="py-2.5 px-3 font-semibold">Barcode</th>
                        <th className="py-2.5 px-3 font-semibold">Blood Group</th>
                        <th className="py-2.5 px-3 font-semibold">Component</th>
                        <th className="py-2.5 px-3 font-semibold">Expiry Date</th>
                        <th className="py-2.5 px-3 font-semibold text-center">
                          Days Left
                        </th>
                        <th className="py-2.5 px-3 font-semibold">Safety Status</th>
                        <th className="py-2.5 px-3 font-semibold">Recommended Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]">
                      {insights.unitsExpiringSoon.map((unit: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#FAF6EE]/50">
                          <td className="py-3 px-3 font-mono font-bold text-[#053845]">
                            {unit.unitBarcode}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-red-700 font-mono font-bold border border-red-100">
                              {unit.bloodGroupDisplay}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700">
                            {unit.componentDisplay}
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-mono">
                            {new Date(unit.expiryDate).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full font-semibold font-mono text-[11px] ${
                                unit.daysRemaining <= 3
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {unit.daysRemaining} days
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {unit.ttiStatus}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 text-[11px]">
                            {unit.recommendedAction}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  No units expiring within the next 7 days.
                </div>
              )}
            </div>

            {/* Potential Wastage & Mitigation Tips */}
            {insights?.wastageInsights && (
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
                <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                  <h3 className="text-base font-serif font-bold text-[#053845]">
                    Blood Wastage Mitigation
                  </h3>
                  <p className="text-xs text-slate-500">
                    Proactive steps to prevent discarding units nearing expiry
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="p-4 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-xs">
                    <span className="text-slate-500">Historical Discarded Units</span>
                    <div className="text-xl font-bold text-slate-700 mt-1">
                      {insights.wastageInsights.historicalWastageUnits} units
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200 text-xs">
                    <span className="text-amber-800">Units Currently at Expiry Risk</span>
                    <div className="text-xl font-bold text-amber-900 mt-1">
                      {insights.wastageInsights.unitsAtRiskOfExpiry} units
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-red-50/60 border border-red-200 text-xs">
                    <span className="text-red-800">Estimated Potential Wastage</span>
                    <div className="text-xl font-bold text-red-900 mt-1">
                      {insights.wastageInsights.estimatedPotentialWastageUnits} units
                    </div>
                  </div>
                </div>

                {insights.wastageInsights.actionsToReduceWastage?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[#053845]">
                      Actionable Mitigation Steps:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {insights.wastageInsights.actionsToReduceWastage.map(
                        (tip: string, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 bg-[#FAF6EE]/50 rounded-lg border border-[#F3E9D1] text-xs text-slate-700 flex items-start gap-2"
                          >
                            <ArrowRight className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                            <span>{tip}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
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
                    District Supply & Demand
                  </span>
                  <span className="text-xs text-slate-500">
                    {location?.displayDistrict || "District"}, {location?.displayState || "State"}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#053845]">
                  District Blood Supply vs. Hospital Demand
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Comparing hospital blood requests with available blood bank stock across {location?.displayDistrict || "this district"}.
                </p>
              </div>

              <div className="flex items-center gap-6 text-xs shrink-0">
                <div className="text-right">
                  <div className="text-lg font-bold text-[#053845]">
                    {regionalDemand?.totalRequestsCount ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500">Hospital Requisitions</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-emerald-700">
                    {regionalSupply?.participatingBloodBanksCount ?? 1}
                  </div>
                  <div className="text-[11px] text-slate-500">District Blood Banks</div>
                </div>
              </div>
            </div>

            {/* Overview Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Regional Demand */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">District Hospital Demand</div>
                <div className="text-2xl font-bold text-[#053845]">
                  {regionalDemand?.totalUnitsRequested ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Past {timeframeDays} days requested
                </div>
              </div>

              {/* Card 2: 7-Day Projected Demand */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">Next 7 Days Demand</div>
                <div className="text-2xl font-bold text-indigo-700">
                  {regionalDemand?.estimatedUpcoming7d ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Expected district hospital requirements
                </div>
              </div>

              {/* Card 3: District Available Supply */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">Available District Stock</div>
                <div className="text-2xl font-bold text-emerald-700">
                  {regionalSupply?.totalAvailableUnits ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Ready unexpired units across district
                </div>
              </div>

              {/* Card 4: Top Needed Blood Group */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">Most Needed Blood Group</div>
                <div className="text-2xl font-bold text-red-700">
                  {regionalDemand?.mostRequestedGroup?.displayName ??
                    (loading ? "..." : "None")}
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  {regionalDemand?.mostRequestedGroup
                    ? `${regionalDemand.mostRequestedGroup.totalUnits} units requested`
                    : "No district requests"}
                </div>
              </div>
            </div>

            {/* Demand vs Supply Comparison Table */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
              <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  Blood Group Balance: Hospital Demand vs. Available Stock
                </h3>
                <p className="text-xs text-slate-500">
                  Evaluates 7-day projected hospital requirements against currently available blood bank supply.
                </p>
              </div>

              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading...</div>
              ) : (insights?.demandSupplyComparison?.length ?? 0) > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#F3E9D1] text-slate-500">
                        <th className="py-2.5 px-3 font-semibold">Blood Group</th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Estimated Demand (7d)
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Available Stock
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Net Balance
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-center">
                          Supply Status
                        </th>
                        <th className="py-2.5 px-3 font-semibold">
                          Recommended Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]">
                      {insights.demandSupplyComparison.map((row: any, idx: number) => {
                        const isShortage = row.status === "Shortage Risk";
                        return (
                          <tr key={idx} className="hover:bg-[#FAF6EE]/50">
                            <td className="py-3 px-3 font-bold text-[#053845]">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-50 text-red-700 font-mono border border-red-100">
                                {row.displayName}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                              {row.projectedDemand7d} u
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-[#053845]">
                              {row.availableSupplyUnits} u
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono font-bold ${
                                row.balance < 0
                                  ? "text-red-700"
                                  : row.balance > 0
                                  ? "text-emerald-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {row.balance > 0 ? `+${row.balance}` : row.balance} u
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  isShortage
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : row.status === "Adequate Stock"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-600 text-[11px]">
                              {row.statusMessage}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No district comparison data available.
                </div>
              )}
            </div>

            {/* Shortage Alerts & Simple Coordination Recommendations */}
            {insights?.recommendedActions && (
              <div className="bg-[#FAF6EE] rounded-xl border border-[#E3D8BF] p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-serif font-bold text-[#053845]">
                    District Supply Coordination Actions
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
                    State-wide Scope
                  </span>
                  <span className="text-xs text-slate-500">
                    {location?.displayState || "State"}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#053845]">
                  State-wide Blood Supply vs. Hospital Demand
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Macro supply-demand balance and district-by-district breakdown across {location?.displayState || "the state"}.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs shrink-0">
                <div className="text-right">
                  <div className="text-lg font-bold text-[#053845]">
                    {regionalContext?.districtBreakdown?.length ?? 1}
                  </div>
                  <div className="text-[11px] text-slate-500">Active Districts</div>
                </div>
              </div>
            </div>

            {/* State Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: State Hospital Demand */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">State Hospital Demand</div>
                <div className="text-2xl font-bold text-[#053845]">
                  {regionalDemand?.totalUnitsRequested ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Total requested in past {timeframeDays}d
                </div>
              </div>

              {/* Card 2: State Available Supply */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">State Available Stock</div>
                <div className="text-2xl font-bold text-emerald-700">
                  {regionalSupply?.totalAvailableUnits ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Available in participating blood banks
                </div>
              </div>

              {/* Card 3: 7-Day State Projected Demand */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">Next 7-Day State Need</div>
                <div className="text-2xl font-bold text-indigo-700">
                  {regionalDemand?.estimatedUpcoming7d ?? (loading ? "..." : 0)}{" "}
                  <span className="text-sm font-normal text-slate-500">units</span>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Estimated 7-day state requirements
                </div>
              </div>

              {/* Card 4: Net State Balance */}
              <div className="bg-white rounded-xl border border-[#F3E9D1] p-5 shadow-xs">
                <div className="text-xs text-slate-500 mb-1">State Supply Balance</div>
                {(() => {
                  const supply = regionalSupply?.totalAvailableUnits ?? 0;
                  const dem7d = regionalDemand?.estimatedUpcoming7d ?? 0;
                  const bal = supply - dem7d;
                  return (
                    <>
                      <div
                        className={`text-2xl font-bold ${
                          bal < 0 ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {bal > 0 ? `+${bal}` : bal}{" "}
                        <span className="text-sm font-normal text-slate-500">units</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        {bal < 0 ? "Deficit against 7-day projection" : "Adequate overall stock"}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* District-by-District Breakdown Table */}
            <div className="bg-white rounded-xl border border-[#F3E9D1] p-6 shadow-xs">
              <div className="pb-3 border-b border-[#F3E9D1] mb-4">
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  District-by-District Demand vs. Supply Breakdown
                </h3>
                <p className="text-xs text-slate-500">
                  Identify districts with critical supply deficits or stock surplus for inter-facility redistribution.
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
                        <th className="py-2.5 px-3 font-semibold text-center">
                          Blood Banks
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Hospital Demand
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Available Stock
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Balance
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3E9D1]">
                      {regionalContext!.districtBreakdown!.map((d: any, idx: number) => {
                        const isCurrent =
                          d.districtName.toLowerCase() ===
                          (location?.district || "").toLowerCase();
                        const isShortage = d.status === "Shortage Risk";
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
                            <td className="py-3 px-3 text-center text-slate-700">
                              {d.bloodBankCount}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-700">
                              {d.requestedUnits} u
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-[#053845]">
                              {d.availableSupplyUnits} u
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono font-bold ${
                                d.balance < 0
                                  ? "text-red-700"
                                  : d.balance > 0
                                  ? "text-emerald-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {d.balance > 0 ? `+${d.balance}` : d.balance} u
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  isShortage
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : d.status === "Adequate Stock"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                              >
                                {d.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No district breakdown records found.
                </div>
              )}
            </div>

            {/* State Coordination Recommendations */}
            {insights?.recommendedActions && (
              <div className="bg-[#FAF6EE] rounded-xl border border-[#E3D8BF] p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <h3 className="text-sm font-serif font-bold text-[#053845]">
                    State-wide Supply Redistribution Actions
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
