"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Stethoscope,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  ChevronRight,
  Droplets,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
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
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
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
        setPlans(plansRes.data);
      }
      if (summaryRes.success) {
        setSummary(summaryRes.data);
      }
    } catch (err: any) {
      console.error("Error loading surgery planner data:", err);
      setError(err?.message || "Failed to load surgery plans. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-16">
      {/* Header Banner */}
      <div className="bg-white border-b border-[#F3E9D1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[#317786] text-sm font-semibold uppercase tracking-wider mb-1">
                <Stethoscope className="w-4 h-4" />
                <span>Pre-Operative Care & Blood Planning</span>
              </div>
              <h1 className="text-3xl font-serif font-bold text-[#053845]">
                Surgery Blood Requirement Planner
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                Plan blood component needs for upcoming surgeries, verify against hospital-approved
                clinical guidelines, inspect blood bank stock, and eliminate day-of-surgery shortages.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchData()}
                className="p-2.5 rounded-lg border border-[#F3E9D1] hover:bg-slate-50 text-slate-600 transition"
                title="Refresh Plans"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <Link
                href="/hospital/surgeries/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#317786] text-white hover:bg-[#286370] font-medium shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Plan New Surgery</span>
              </Link>
            </div>
          </div>

          {/* Metric Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {/* 1. Total Upcoming */}
            <div className="bg-[#FAF8F5] border border-[#F3E9D1] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Upcoming Surgeries
                </span>
                <span className="text-2xl font-serif font-bold text-[#053845] mt-1 block">
                  {summary ? summary.upcomingTotal : "—"}
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  {summary?.next7Days ?? 0} in the next 7 days
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
            </div>

            {/* 2. Awaiting Review */}
            <div className="bg-[#FAF8F5] border border-[#F3E9D1] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Awaiting Clinical Signoff
                </span>
                <span className="text-2xl font-serif font-bold text-amber-700 mt-1 block">
                  {summary ? summary.awaitingReview : "—"}
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Requires clinician review
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </div>

            {/* 3. Shortages Identified */}
            <div className="bg-[#FAF8F5] border border-[#F3E9D1] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Shortage Identified
                </span>
                <span className="text-2xl font-serif font-bold text-rose-600 mt-1 block">
                  {summary ? summary.shortageIdentified : "—"}
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Action required before surgery
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
            </div>

            {/* 4. Ready / Arranged */}
            <div className="bg-[#FAF8F5] border border-[#F3E9D1] rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Blood Ready / Arranged
                </span>
                <span className="text-2xl font-serif font-bold text-emerald-700 mt-1 block">
                  {summary ? summary.bloodArranged : "—"}
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Eligible inventory verified
                </span>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Filters Bar */}
        <div className="bg-white border border-[#F3E9D1] rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by patient ID/reference or procedure name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786] text-slate-700"
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
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-800 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <p>{error}</p>
          </div>
        )}

        {/* Table / List */}
        {isLoading ? (
          <div className="bg-white border border-[#F3E9D1] rounded-xl p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-[#317786]" />
            <p className="text-sm">Loading scheduled surgeries and blood readiness...</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-4 text-[#317786]">
              <Stethoscope className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-serif font-bold text-[#053845]">
              No scheduled surgeries found
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-6">
              Start planning upcoming surgical procedures to estimate blood requirements and check
              blood bank availability well in advance.
            </p>
            <Link
              href="/hospital/surgeries/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#317786] text-white hover:bg-[#286370] font-medium text-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Plan First Surgery</span>
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-[#F3E9D1] rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAF8F5] border-b border-[#F3E9D1] text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Patient Reference</th>
                    <th className="py-3.5 px-4">Procedure & Category</th>
                    <th className="py-3.5 px-4">Scheduled Date</th>
                    <th className="py-3.5 px-4">Blood Requirement</th>
                    <th className="py-3.5 px-4">Readiness Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plans.map((p) => {
                    const statusInfo = formatStatus(p.status);
                    const unitsRequired = p.finalunits !== null ? p.finalunits : p.baselineunits;
                    const component = p.finalcomponent || p.baselinecomponent;

                    return (
                      <tr
                        key={p.surgeryid}
                        className="hover:bg-slate-50/70 transition"
                      >
                        {/* Patient info */}
                        <td className="py-4 px-4 align-top">
                          <div className="font-semibold text-[#053845]">
                            {p.patientreference}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {p.patientage} yrs • {p.patientgender}
                          </div>
                          <div className="mt-1">
                            {p.patientbloodgroup ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <Droplets className="w-3 h-3" />
                                {p.patientbloodgroup.replace("_POSITIVE", "+").replace("_NEGATIVE", "-")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <HelpCircle className="w-3 h-3" />
                                Typing Pending
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Procedure */}
                        <td className="py-4 px-4 align-top">
                          <div className="font-medium text-[#053845]">
                            {p.procedurename}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {p.category || "General Surgery"}
                          </div>
                          {p.procedureconfig && (
                            <span className="inline-block mt-1 text-[11px] text-[#317786] bg-[#317786]/10 px-2 py-0.5 rounded border border-[#317786]/20">
                              MSBOS: {p.procedureconfig.guidelinesource.split(" ")[0]} v{p.procedureconfig.guidelineversion}
                            </span>
                          )}
                        </td>

                        {/* Scheduled Date */}
                        <td className="py-4 px-4 align-top">
                          <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDate(p.scheduleddate)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
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
                        <td className="py-4 px-4 align-top">
                          {unitsRequired !== null && unitsRequired !== undefined ? (
                            <div>
                              <div className="font-semibold text-slate-800">
                                {unitsRequired} unit(s) {component || "RBC"}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {p.finalunits !== null ? (
                                  <span className="text-emerald-700 font-medium">Clinically Approved</span>
                                ) : (
                                  <span>Guideline Estimate</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-amber-700 italic">
                              Estimate unavailable (clinical review required)
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4 align-top">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${statusInfo.badge}`}
                          >
                            {statusInfo.label}
                          </span>
                          {p.linkedrequest && (
                            <div className="mt-1 text-[11px] text-indigo-700 font-medium">
                              Linked Requisition Active
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4 align-top text-right">
                          <Link
                            href={`/hospital/surgeries/${p.surgeryid}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#F3E9D1] bg-white text-xs font-medium text-[#053845] hover:bg-[#FAF8F5] transition"
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
    </div>
  );
}
