"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  MapPin,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Droplets,
  RefreshCw,
  Search,
  ArrowLeft,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Tent,
  Plus,
  X,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Building,
  Users,
  Compass,
  SlidersHorizontal,
  Check,
  CalendarCheck2,
} from "lucide-react";
import {
  api,
  CompleteCampPlannerPayloadItem,
  CampPlannerLocationItem,
  CampPlannerDateItem,
  CampPlannerBloodGroupPriorityItem,
  CampPlannerInsightItem,
} from "@/lib/api";

type HorizonPeriod = 7 | 14 | 30;

function formatBloodGroup(bg?: string | null): string {
  if (!bg) return "—";
  return bg
    .replace("_POSITIVE", "+")
    .replace("_NEGATIVE", "-")
    .replace("POSITIVE", "+")
    .replace("NEGATIVE", "-");
}

export default function SmartCampPlannerPage() {
  const router = useRouter();
  const [horizon, setHorizon] = useState<HorizonPeriod>(14);
  const [data, setData] = useState<CompleteCampPlannerPayloadItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Tabs
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [activeTab, setActiveTab] = useState<"LOCATIONS" | "DATES" | "BLOOD_GROUPS" | "INSIGHTS">("LOCATIONS");

  const fetchPlannerData = useCallback(
    async (isBackground = false) => {
      try {
        if (isBackground) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);

        const res = await api.bloodbank.campPlanner.get({ horizon });
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError("Failed to load camp planner intelligence from facility database");
        }
      } catch (err: any) {
        console.error("Error fetching camp planner data:", err);
        setError(err?.data?.message || err?.message || "Failed to connect to camp planner intelligence service");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [horizon]
  );

  useEffect(() => {
    fetchPlannerData();
  }, [fetchPlannerData]);

  // Filtered locations
  const filteredLocations = useMemo(() => {
    if (!data?.locations) return [];
    return data.locations.filter((loc) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        loc.locationName.toLowerCase().includes(q) ||
        loc.city.toLowerCase().includes(q) ||
        loc.district.toLowerCase().includes(q) ||
        loc.suggestedVenue.toLowerCase().includes(q) ||
        loc.targetedBloodGroups.some((g) => g.displayName.toLowerCase().includes(q));

      const matchesPriority = priorityFilter === "ALL" || loc.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [data?.locations, searchQuery, priorityFilter]);

  // Navigate to dedicated create camp page pre-populated from recommendation (just like create blood request)
  const handleScheduleCamp = (loc: CampPlannerLocationItem, overrideDate?: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    const targetDate = overrideDate || loc.recommendedSlot.suggestedDate || todayStr;
    const targetedNames = loc.targetedBloodGroups.map((g) => g.displayName).join(", ");

    const params = new URLSearchParams({
      from: "planner",
      name: `${loc.city} Voluntary Blood Drive`,
      organizer: data?.overview.facilityName || "Swastya Blood Bank Network",
      contactPerson: "Camp Logistics Coordinator",
      contactPhone: "+91 98765 43210",
      venue: loc.suggestedVenue,
      address: `${loc.suggestedVenue}, ${loc.city}`,
      city: loc.city,
      district: loc.district || loc.city,
      state: loc.state || "",
      pincode: loc.pincode || "",
      date: targetDate,
      startTime: loc.recommendedSlot.startTime || "09:00",
      endTime: loc.recommendedSlot.endTime || "15:00",
      capacity: String(loc.estimatedTurnout || 50),
      description: `Community blood donation drive organized by ${data?.overview.facilityName || "Swastya"}. Specifically mobilizing registered donors for prioritized groups: ${targetedNames}. Clinical rationale: ${loc.clinicalRationale}`,
    });

    if (loc.latitude) params.append("lat", String(loc.latitude));
    if (loc.longitude) params.append("lon", String(loc.longitude));

    router.push(`/bloodbank/camps/new?${params.toString()}`);
  };

  const overview = data?.overview;

  const getPriorityBadgeStyles = (priority: "HIGH" | "MEDIUM" | "LOW") => {
    switch (priority) {
      case "HIGH":
        return "bg-rose-50 text-rose-800 border-rose-200";
      case "MEDIUM":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "LOW":
        return "bg-teal-50 text-teal-800 border-teal-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Breadcrumb Navigation & Top Facility Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          href="/bloodbank/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blood Bank Dashboard</span>
        </Link>

        {!isLoading && overview && (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              Facility: <strong className="text-[#053845]">{overview.facilityName}</strong> ({overview.facilityCity})
            </span>
            <span>&bull;</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[11px]">
              <ShieldCheck className="w-3 h-3 text-teal-600" />
              {overview.dataConfidence} Confidence
            </span>
          </div>
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

      {/* 2. Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Smart Blood Donation Camp Planner
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                AI Recommended Drives
              </span>
            </div>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-500">
              Data-driven camp location and date recommendations coupled with live inventory and shortage forecasts. Zero synthetic data.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <Link
            href="/bloodbank/camps/new"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule New Camp</span>
          </Link>
          <Link
            href="/bloodbank/predictor"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#FAF6EE]/80 border border-[#F3E9D1] shadow-2xs transition-colors"
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#317786]" />
            <span>Shortage Predictor</span>
          </Link>
          <button
            type="button"
            onClick={() => fetchPlannerData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh planner calculations"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 3. Four Overview KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Camps Organized */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Camps Organized</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <Tent className="w-3.5 h-3.5 text-teal-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {overview?.totalCampsOrganized ?? 0}
          </div>
          <p className="text-[11px] text-teal-700 font-medium">Facility camp records</p>
        </div>

        {/* Upcoming Scheduled Camps */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Upcoming Camps</span>
            <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845]">
              <CalendarCheck2 className="w-3.5 h-3.5 text-[#053845]" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {overview?.upcomingCampsCount ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">Scheduled on calendar</p>
        </div>

        {/* Recommended Locations */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Target Locations</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {overview?.recommendedLocationsCount ?? 0}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium">Scored geographic clusters</p>
        </div>

        {/* High-Demand Areas */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">High Demand Areas</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-700">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-rose-900">
            {overview?.highDemandAreasCount ?? 0}
          </div>
          <p className="text-[11px] text-rose-700 font-medium">
            {overview?.predictedDeficitUnits ? `-${overview.predictedDeficitUnits} units projected deficit` : "Active requisition demand"}
          </p>
        </div>
      </section>

      {/* 4. Controls: Horizon Selector, Search & View Tabs */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search recommended locations by city, venue, or blood group..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-[#FAF6EE]/50 border border-[#F3E9D1] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#317786] focus:border-[#317786] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Horizon Period Pills (7, 14, 30 Days) */}
          <div className="flex items-center gap-1 bg-[#FAF6EE] p-1 rounded-xl border border-[#F3E9D1] self-start sm:self-auto shrink-0">
            <span className="text-[11px] font-semibold text-slate-500 px-2">Shortage Horizon:</span>
            {[7, 14, 30].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h as HorizonPeriod)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  horizon === h
                    ? "bg-[#053845] text-white shadow-2xs"
                    : "text-slate-600 hover:text-[#053845] hover:bg-white/60"
                }`}
              >
                {h} Days
              </button>
            ))}
          </div>
        </div>

        {/* View Navigation Tabs & Priority Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#F3E9D1]/50">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab("LOCATIONS")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === "LOCATIONS"
                  ? "bg-[#053845] text-white shadow-2xs"
                  : "text-slate-600 hover:bg-[#FAF6EE] border border-transparent"
              }`}
            >
              Recommended Locations ({data?.locations.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("DATES")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === "DATES"
                  ? "bg-[#053845] text-white shadow-2xs"
                  : "text-slate-600 hover:bg-[#FAF6EE] border border-transparent"
              }`}
            >
              Optimal Dates ({data?.dates.filter((d) => d.status !== "CONFLICT").length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("BLOOD_GROUPS")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === "BLOOD_GROUPS"
                  ? "bg-[#053845] text-white shadow-2xs"
                  : "text-slate-600 hover:bg-[#FAF6EE] border border-transparent"
              }`}
            >
              Deficit Alignment ({data?.bloodGroupPriorities.filter((g) => g.priority === "HIGH").length ?? 0} High Priority)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("INSIGHTS")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === "INSIGHTS"
                  ? "bg-[#053845] text-white shadow-2xs"
                  : "text-slate-600 hover:bg-[#FAF6EE] border border-transparent"
              }`}
            >
              Strategic Insights ({data?.insights.length ?? 0})
            </button>
          </div>

          {activeTab === "LOCATIONS" && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="text-[11px] font-semibold">Priority:</span>
              {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    priorityFilter === p
                      ? "bg-[#317786] text-white font-semibold"
                      : "bg-[#FAF6EE] text-slate-600 hover:bg-slate-200/50"
                  }`}
                >
                  {p === "ALL" ? "All" : p}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. Tab Content: LOCATIONS */}
      {activeTab === "LOCATIONS" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#053845]">
              AI Recommended Camp Locations ({filteredLocations.length})
            </h2>
            <span className="text-xs text-slate-500">
              Ranked by composite score: Shortage Alleviation (40%) + Donor Density (30%) + Hospital Demand (30%)
            </span>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-[#317786] animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Analyzing regional donor clusters and hospital requisitions...</p>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center space-y-3">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No matching camp locations found</p>
              <p className="text-xs text-slate-500">Try adjusting your search query or priority filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredLocations.map((loc, idx) => (
                <div
                  key={loc.id}
                  className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs hover:border-[#317786]/40 transition-all space-y-4"
                >
                  {/* Top Location Summary Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#FAF6EE] text-[#053845] font-serif text-xs font-bold flex items-center justify-center border border-[#F3E9D1]">
                          #{idx + 1}
                        </span>
                        <h3 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
                          {loc.locationName}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getPriorityBadgeStyles(loc.priority)}`}>
                          {loc.priority} Priority
                        </span>
                        {loc.distanceKm !== null && loc.distanceKm !== undefined && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                            {loc.distanceKm === 0 ? "Facility Home City" : `${loc.distanceKm} km away`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>
                          <strong>{loc.suggestedVenue}</strong> &bull; {loc.city}, {loc.district}, {loc.state} {loc.pincode ? `(${loc.pincode})` : ""}
                        </span>
                      </p>
                    </div>

                    {/* Composite Score Pill & Schedule CTA -> Navigates to dedicated new camp page */}
                    <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-medium">Composite Score</div>
                        <div className="font-serif text-xl sm:text-2xl font-bold text-[#053845]">
                          {loc.compositeScore}<span className="text-xs font-normal text-slate-400">/100</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleScheduleCamp(loc)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs cursor-pointer"
                        title="Open full camp creation form pre-filled with this recommendation"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Schedule Camp</span>
                      </button>
                    </div>
                  </div>

                  {/* 4-Part Transparent Score Breakdown Bar */}
                  <div className="bg-[#FAF6EE]/50 rounded-xl p-3 border border-[#F3E9D1] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">Deterministic Scoring Breakdown:</span>
                      <span className="text-slate-500 text-[11px]">Formula derived from actual Neon database entities</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-[#F3E9D1]/70">
                        <span className="text-[10px] text-slate-500 block">Shortage Alignment</span>
                        <strong className="text-emerald-800 font-serif text-sm">{loc.scoreBreakdown.shortageScore}</strong>
                        <span className="text-[10px] text-slate-400"> / 40 pts</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#F3E9D1]/70">
                        <span className="text-[10px] text-slate-500 block">Donor Accessibility</span>
                        <strong className="text-teal-800 font-serif text-sm">{loc.scoreBreakdown.donorScore}</strong>
                        <span className="text-[10px] text-slate-400"> / 30 pts</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#F3E9D1]/70">
                        <span className="text-[10px] text-slate-500 block">Hospital Demand</span>
                        <strong className="text-amber-800 font-serif text-sm">{loc.scoreBreakdown.demandScore}</strong>
                        <span className="text-[10px] text-slate-400"> / 30 pts</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#F3E9D1]/70">
                        <span className="text-[10px] text-slate-500 block">Conflict Penalty</span>
                        <strong className={loc.scoreBreakdown.conflictPenalty < 0 ? "text-rose-700 font-serif text-sm" : "text-slate-700 font-serif text-sm"}>
                          {loc.scoreBreakdown.conflictPenalty}
                        </strong>
                        <span className="text-[10px] text-slate-400"> pts</span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {/* Registered Donors in Area */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Users className="w-3.5 h-3.5 text-[#317786]" />
                        <span>Registered Donor Pool</span>
                      </div>
                      <div className="font-semibold text-slate-800 text-sm">
                        {loc.donorCluster.availableDonorsInArea} available donors
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {loc.donorCluster.deficitGroupMatchingDonors} matching predicted shortage blood groups
                      </p>
                    </div>

                    {/* Estimated Participation */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Droplets className="w-3.5 h-3.5 text-teal-600" />
                        <span>Estimated Yield</span>
                      </div>
                      <div className="font-semibold text-slate-800 text-sm">
                        ~{loc.estimatedTurnout} Donors &bull; ~{loc.estimatedCollectionUnits} Units
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Assumes ~18% routine clinical deferral factor
                      </p>
                    </div>

                    {/* Recommended Date Slot */}
                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Optimal Mobilization Slot</span>
                      </div>
                      <div className="font-semibold text-slate-800 text-sm">
                        {loc.recommendedSlot.formattedDate} ({loc.recommendedSlot.dayOfWeek.slice(0, 3)})
                      </div>
                      <p className="text-[11px] text-emerald-700 font-medium">
                        {loc.recommendedSlot.conflictStatus === "OPTIMAL" ? "Conflict-Free Weekend Slot" : "Scheduled Slot"}
                      </p>
                    </div>
                  </div>

                  {/* Targeted Blood Groups */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                      Targeted Blood Groups for this Location:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {loc.targetedBloodGroups.map((g) => (
                        <span
                          key={g.bloodGroup}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            g.priority === "HIGH"
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : "bg-[#FAF6EE] text-[#053845] border-[#F3E9D1]"
                          }`}
                        >
                          <Droplets className="w-3 h-3 text-[#317786]" />
                          <span>{g.displayName}</span>
                          {g.deficitUnits > 0 && (
                            <span className="text-[10px] font-semibold text-rose-600">
                              (-{g.deficitUnits}u deficit)
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Clinical & Operational Rationale */}
                  <div className="p-3 rounded-xl bg-teal-50/40 border border-teal-100/70 text-xs text-teal-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold text-teal-950">AI Strategic Rationale: </strong>
                      <span>{loc.clinicalRationale}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 6. Tab Content: OPTIMAL DATES */}
      {activeTab === "DATES" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#053845]">
              AI Evaluated Scheduling Window (Next 7 to 28 Days)
            </h2>
            <span className="text-xs text-slate-500">
              Evaluated against existing facility camps & weekend donor availability
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {data?.dates.map((d) => {
              const isOptimal = d.status === "OPTIMAL";
              const isConflict = d.status === "CONFLICT";

              return (
                <div
                  key={d.date}
                  className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-3 transition-all ${
                    isOptimal
                      ? "border-emerald-300 ring-1 ring-emerald-200 bg-emerald-50/15"
                      : isConflict
                      ? "border-rose-200 bg-rose-50/20 opacity-75"
                      : "border-[#F3E9D1]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-serif text-base font-bold text-[#053845]">
                          {d.formattedDate}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">
                        {d.dayOfWeek} &bull; in {d.daysAway} days
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        isOptimal
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : isConflict
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : "bg-teal-50 text-teal-800 border-teal-200"
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    {d.alignmentReason}
                  </p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Suggested: <strong>{d.suggestedTiming.startTime} - {d.suggestedTiming.endTime}</strong>
                    </span>
                    {!isConflict && data.locations.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleScheduleCamp(data.locations[0], d.date)}
                        className="text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors cursor-pointer"
                        title="Open full camp creation form pre-filled with this date"
                      >
                        Schedule on this date &rarr;
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. Tab Content: BLOOD GROUP DEFICIT ALIGNMENT */}
      {activeTab === "BLOOD_GROUPS" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#053845]">
              Camp Collection Targets by Blood Group
            </h2>
            <Link
              href="/bloodbank/predictor"
              className="text-xs font-semibold text-[#053845] hover:text-[#317786] inline-flex items-center gap-1"
            >
              <span>View Full Shortage Predictor</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-[#F3E9D1] overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FAF6EE] text-slate-700 border-b border-[#F3E9D1] uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 font-bold">Blood Group</th>
                    <th className="py-3 px-4 font-bold">Priority Status</th>
                    <th className="py-3 px-4 font-bold">Current Reserve</th>
                    <th className="py-3 px-4 font-bold">Runway Days</th>
                    <th className="py-3 px-4 font-bold">Forecast Deficit</th>
                    <th className="py-3 px-4 font-bold">Camp Target Collection</th>
                    <th className="py-3 px-4 font-bold">Mobilization Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3E9D1]/50 text-slate-800">
                  {data?.bloodGroupPriorities.map((item) => (
                    <tr key={item.bloodGroup} className="hover:bg-[#FAF6EE]/30 transition-colors">
                      <td className="py-3 px-4 font-bold font-serif text-sm text-[#053845]">
                        {item.displayName}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityBadgeStyles(item.priority)}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {item.availableUnits} units
                      </td>
                      <td className="py-3 px-4">
                        <span className={item.daysOfSupply <= 5 ? "font-bold text-rose-700" : "text-slate-600"}>
                          {item.daysOfSupply}d
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {item.deficitUnits > 0 ? (
                          <span className="font-bold text-rose-700">-{item.deficitUnits} units</span>
                        ) : (
                          <span className="text-slate-400">0 units</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold font-serif text-[#053845] text-sm">
                        {item.targetCollectionUnits} units
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs">
                        {item.rationale}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 8. Tab Content: STRATEGIC INSIGHTS */}
      {activeTab === "INSIGHTS" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#053845]">
              AI Strategic Insights & Action Items ({data?.insights.length ?? 0})
            </h2>
            <span className="text-xs text-slate-500">
              Generated by clinical & logistics optimization models
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.insights.map((insight) => (
              <div
                key={insight.id}
                className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
                      <Sparkles className="w-4 h-4 text-teal-600" />
                    </div>
                    <h3 className="font-serif text-sm sm:text-base font-bold text-[#053845]">
                      {insight.title}
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] shrink-0">
                    {insight.impactScore}% Impact
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {insight.description}
                </p>

                <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs text-[#053845]">
                  <strong className="block text-[11px] font-bold text-[#317786] uppercase tracking-wider mb-1">
                    Recommended Action:
                  </strong>
                  <span>{insight.suggestedAction}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
