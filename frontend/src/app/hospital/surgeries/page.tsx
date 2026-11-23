"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Stethoscope,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  ChevronRight,
  Droplets,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  ArrowLeft,
  X,
  Building2,
} from "lucide-react";
import {
  api,
  SurgeryPlanItem,
  SurgeryPlanSummary,
} from "@/lib/api";
import { formatDate } from "@/lib/mappers";

function formatStatus(status: string) {
  switch (status) {
    case "PLANNED":
      return { label: "Planned", badge: "bg-slate-100 text-slate-700 border-slate-200" };
    case "REQUIREMENT_ESTIMATED":
      return { label: "Estimate Ready", badge: "bg-sky-50 text-sky-700 border-sky-200" };
    case "AWAITING_CLINICAL_REVIEW":
      return { label: "Needs Clinical Review", badge: "bg-amber-50 text-amber-800 border-amber-300" };
    case "BLOOD_AVAILABLE":
      return { label: "Stock Eligible", badge: "bg-emerald-50 text-emerald-700 border-emerald-300" };
    case "SHORTAGE_IDENTIFIED":
      return { label: "Shortage Identified", badge: "bg-rose-50 text-rose-700 border-rose-300" };
    case "BLOOD_REQUESTED":
      return { label: "Requisition Active", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "READY_FOR_SURGERY":
      return { label: "Ready For Surgery", badge: "bg-emerald-100 text-emerald-800 border-emerald-400" };
    case "COMPLETED":
      return { label: "Completed", badge: "bg-gray-100 text-gray-600 border-gray-200" };
    case "CANCELLED":
      return { label: "Cancelled", badge: "bg-stone-100 text-stone-500 border-stone-200" };
    default:
      return { label: status, badge: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

export default function SurgeryPlannerPage() {
  const [plans, setPlans] = useState<SurgeryPlanItem[]>([]);
  const [summary, setSummary] = useState<SurgeryPlanSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchData = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [plansRes, summaryRes] = await Promise.all([
        api.hospital.surgeries.list({
          status: statusFilter === "ALL" ? undefined : statusFilter,
          search: searchQuery.trim() || undefined,
        }),
        api.hospital.surgeries.getSummary(),
      ]);

      if (plansRes.success) {
        setPlans(plansRes.data || []);
      }
      if (summaryRes.success) {
        setSummary(summaryRes.data || null);
      }
    } catch (err: any) {
      console.error("Error loading surgery planner data:", err);
      setError(err?.message || "Failed to load surgery plans. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Client-side filtered plans
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = p.patientreference.toLowerCase().includes(q);
        const matchesProc = p.procedurename.toLowerCase().includes(q);
        const matchesCategory = (p.category || "").toLowerCase().includes(q);
        const matchesBlood = (p.patientbloodgroup || "").toLowerCase().includes(q);
        if (!matchesRef && !matchesProc && !matchesCategory && !matchesBlood) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusFilter !== "ALL" && p.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [plans, searchQuery, statusFilter]);

  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL";

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            Showing {filteredPlans.length} of {plans.length}{" "}
            {plans.length === 1 ? "procedure plan" : "procedure plans"}
          </span>
        )}
      </div>

      {/* 1. Compact Page Header directly on cream background */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Surgery Blood Requirement Planner
              </h1>
              {!isLoading && !error && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {plans.length} Planned
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600">
              Plan blood component needs for upcoming surgeries, verify against hospital-approved clinical guidelines, and eliminate day-of-surgery shortages.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh surgery plans"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/hospital/surgeries/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Plan New Surgery</span>
          </Link>
        </div>
      </header>

      {/* 2. Metric Overview Cards directly on cream background */}
      <section aria-label="Surgery Summary Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 1. Total Upcoming */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Upcoming Surgeries
            </span>
            <span className="text-2xl font-serif font-bold text-[#053845] mt-0.5 block">
              {summary ? summary.upcomingTotal : (isLoading ? "…" : "0")}
            </span>
            <span className="text-xs text-slate-500 mt-0.5 block">
              {summary?.next7Days ?? 0} in next 7 days
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Awaiting Review */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Clinical Review
            </span>
            <span className="text-2xl font-serif font-bold text-amber-700 mt-0.5 block">
              {summary ? summary.awaitingReview : (isLoading ? "…" : "0")}
            </span>
            <span className="text-xs text-slate-500 mt-0.5 block">
              Requires clinician review
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
        </div>

        {/* 3. Shortages Identified */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Shortage Identified
            </span>
            <span className="text-2xl font-serif font-bold text-rose-600 mt-0.5 block">
              {summary ? summary.shortageIdentified : (isLoading ? "…" : "0")}
            </span>
            <span className="text-xs text-slate-500 mt-0.5 block">
              Action required before surgery
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* 4. Ready / Arranged */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Blood Ready / Arranged
            </span>
            <span className="text-2xl font-serif font-bold text-emerald-700 mt-0.5 block">
              {summary ? summary.bloodArranged : (isLoading ? "…" : "0")}
            </span>
            <span className="text-xs text-slate-500 mt-0.5 block">
              Eligible inventory verified
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* 3. Compact Search & Filter Toolbar directly on cream background */}
      <section
        aria-label="Search and filter surgical procedure plans"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by patient ID, procedure name, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white shadow-2xs focus:outline-none focus:border-[#317786] transition-colors text-[#053845]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <div className="flex items-center gap-2 self-start lg:self-auto">
          <Filter className="w-3.5 h-3.5 text-[#317786] shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white text-[#053845] shadow-2xs focus:outline-none focus:border-[#317786] transition-colors cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="AWAITING_CLINICAL_REVIEW">Awaiting Clinical Review</option>
            <option value="REQUIREMENT_ESTIMATED">Requirement Estimated</option>
            <option value="SHORTAGE_IDENTIFIED">Shortage Identified</option>
            <option value="BLOOD_AVAILABLE">Blood Available</option>
            <option value="BLOOD_REQUESTED">Blood Requested</option>
            <option value="READY_FOR_SURGERY">Ready For Surgery</option>
            <option value="PLANNED">Planned</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-slate-500 hover:text-[#053845] underline ml-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Surgery Plans Table / Listing Area */}
      {isLoading ? (
        <div className="bg-white border border-[#F3E9D1] rounded-2xl p-14 text-center text-slate-500 shadow-2xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-[#317786]" />
          <p className="text-xs font-medium">Loading scheduled surgeries and blood readiness...</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-[#F3E9D1] rounded-3xl p-10 sm:p-14 text-center shadow-2xs max-w-md mx-auto my-6">
          <div className="w-12 h-12 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 flex items-center justify-center mx-auto mb-4 text-[#317786]">
            <Stethoscope className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-serif font-bold text-[#053845]">
            No scheduled surgeries found
          </h3>
          <p className="text-xs text-slate-600 max-w-xs mx-auto mt-1 mb-6 leading-relaxed">
            Start planning upcoming surgical procedures to estimate blood requirements and check blood bank availability well in advance.
          </p>
          <Link
            href="/hospital/surgeries/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#317786] hover:bg-[#245964] text-white font-semibold text-xs transition shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Plan First Surgery</span>
          </Link>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="bg-white border border-[#F3E9D1] rounded-2xl p-10 text-center shadow-2xs">
          <p className="text-xs text-slate-600">No surgery plans match your current filter parameters.</p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 px-3.5 py-1.5 rounded-xl bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1] text-xs font-semibold hover:bg-[#F3E9D1]/50 cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#F3E9D1] rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF6EE]/50 border-b border-[#F3E9D1] text-[11px] font-semibold text-[#053845] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Patient Reference</th>
                  <th className="py-3 px-4">Procedure & Category</th>
                  <th className="py-3 px-4">Scheduled Date</th>
                  <th className="py-3 px-4">Blood Requirement</th>
                  <th className="py-3 px-4">Readiness Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9D1]/50">
                {filteredPlans.map((p) => {
                  const statusInfo = formatStatus(p.status);
                  const unitsRequired = p.finalunits !== null ? p.finalunits : p.baselineunits;
                  const component = p.finalcomponent || p.baselinecomponent;

                  return (
                    <tr
                      key={p.surgeryid}
                      className="hover:bg-[#FAF6EE]/30 transition-colors"
                    >
                      {/* Patient info */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-[#053845]">
                          {p.patientreference}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {p.patientage} yrs • {p.patientgender}
                        </div>
                        <div className="mt-1">
                          {p.patientbloodgroup ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <Droplets className="w-3 h-3" />
                              {p.patientbloodgroup.replace("_POSITIVE", "+").replace("_NEGATIVE", "-")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <HelpCircle className="w-3 h-3" />
                              Typing Pending
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Procedure */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-[#053845]">
                          {p.procedurename}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {p.category || "General Surgery"}
                        </div>
                        {p.procedureconfig && (
                          <span className="inline-block mt-1 text-[10px] text-[#317786] bg-[#317786]/10 px-2 py-0.5 rounded border border-[#317786]/20 font-medium">
                            MSBOS: {p.procedureconfig.guidelinesource.split(" ")[0]} v{p.procedureconfig.guidelineversion}
                          </span>
                        )}
                      </td>

                      {/* Scheduled Date */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-1.5 text-[#053845] font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                          <span>{formatDate(p.scheduleddate)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            {new Date(p.scheduleddate).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {p.expecteddurationminutes && ` (${p.expecteddurationminutes} mins)`}
                          </span>
                        </div>
                      </td>

                      {/* Blood Requirement */}
                      <td className="py-3.5 px-4 align-top">
                        {unitsRequired !== null && unitsRequired !== undefined ? (
                          <div>
                            <div className="font-semibold text-[#053845]">
                              {unitsRequired} unit(s) {component || "RBC"}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {p.finalunits !== null ? (
                                <span className="text-emerald-700 font-medium">Clinically Approved</span>
                              ) : (
                                <span>Guideline Estimate</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-amber-700 italic">
                            Estimate unavailable (clinical review required)
                          </div>
                        )}
                      </td>

                      {/* Readiness Status */}
                      <td className="py-3.5 px-4 align-top">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.badge}`}
                        >
                          {statusInfo.label}
                        </span>
                        {p.linkedrequest && (
                          <div className="mt-1 text-[10px] text-indigo-700 font-medium">
                            Linked Requisition Active
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <Link
                          href={`/hospital/surgeries/${p.surgeryid}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] hover:bg-[#FAF6EE] shadow-2xs transition-all"
                        >
                          <span>Manage Plan</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
