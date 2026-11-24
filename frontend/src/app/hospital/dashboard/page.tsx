"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Plus,
  ArrowRight,
  Calendar,
  Loader2,
  AlertCircle,
  RefreshCw,
  Droplets,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import { AuthHospital } from "@/lib/auth";
import { formatDate, mapBloodGroupToDisplay } from "@/lib/mappers";

type FilterTab = "ALL" | "ACTIVE" | "EMERGENCY" | "FULFILLED";

const ACTIVE_COORDINATION_STATUSES = new Set([
  "CREATED",
  "HOSPITAL_REVIEW",
  "BLOOD_BANK_CHECK",
  "DONOR_MATCHING",
  "BLOOD_ARRANGED",
]);

function formatComponentLabel(component?: string | null): string {
  if (!component) return "Whole Blood";
  if (component === "RBC") return "Red Blood Cells";
  return component
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatStatusLabel(status?: string | null): string {
  if (!status) return "Pending";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getStatusBadgeClass(status?: string | null): string {
  switch (status) {
    case "FULFILLED":
    case "BLOOD_ARRANGED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "CANCELLED":
    case "EXPIRED":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "DONOR_MATCHING":
      return "bg-[#317786]/10 text-[#317786] border-[#317786]/25";
    case "HOSPITAL_REVIEW":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-[#FAF6EE] text-[#053845] border-[#F3E9D1]";
  }
}

export default function HospitalDashboardPage() {
  const [hospital, setHospital] = useState<AuthHospital | null>(null);
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");
  const [kpiCounts, setKpiCounts] = useState({
    total: 0,
    emergency: 0,
    inCoordination: 0,
    fulfilled: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [dashRes, profileRes, reqsRes] = await Promise.allSettled([
        api.hospital.getDashboard(),
        api.hospital.getProfile(),
        api.bloodRequests.getAll(),
      ]);

      // 1. Resolve Profile
      if (profileRes.status === "fulfilled" && profileRes.value?.success) {
        setHospital(profileRes.value.hospital);
      }

      // 2. Resolve Blood Requests
      let loadedRequests: BloodRequestItem[] = [];
      if (reqsRes.status === "fulfilled" && Array.isArray(reqsRes.value)) {
        loadedRequests = reqsRes.value;
      } else if (dashRes.status === "fulfilled" && dashRes.value?.success) {
        loadedRequests = dashRes.value.recentRequests || [];
      }
      setRequests(loadedRequests);

      // 3. Compute KPI Metrics
      if (dashRes.status === "fulfilled" && dashRes.value?.success) {
        const dash = dashRes.value;
        const total = dash.totalRequests ?? loadedRequests.length;
        const emergency =
          dash.emergencyRequests ??
          loadedRequests.filter(
            (r) => r.isemergency || r.urgencylevel === "CRITICAL" || r.urgencylevel === "HIGH"
          ).length;
        const fulfilled =
          dash.fulfilledRequests ??
          loadedRequests.filter((r) => r.status === "FULFILLED").length;
        const inCoordination = loadedRequests.filter((r) =>
          ACTIVE_COORDINATION_STATUSES.has(r.status || "CREATED")
        ).length;

        setKpiCounts({
          total,
          emergency,
          inCoordination: inCoordination > 0 ? inCoordination : Math.max(0, total - fulfilled),
          fulfilled,
        });
      } else if (loadedRequests.length > 0) {
        const total = loadedRequests.length;
        const emergency = loadedRequests.filter(
          (r) => r.isemergency || r.urgencylevel === "CRITICAL" || r.urgencylevel === "HIGH"
        ).length;
        const fulfilled = loadedRequests.filter((r) => r.status === "FULFILLED").length;
        const inCoordination = loadedRequests.filter((r) =>
          ACTIVE_COORDINATION_STATUSES.has(r.status || "CREATED")
        ).length;

        setKpiCounts({
          total,
          emergency,
          inCoordination,
          fulfilled,
        });
      } else if (dashRes.status === "rejected" && reqsRes.status === "rejected") {
        const err = dashRes.reason || reqsRes.reason;
        setError(err?.message || "Failed to load hospital dashboard data.");
      }
    } catch (err: any) {
      setError(err?.message || "Network error. Failed to load clinical dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Dynamic counts for tab filters
  const activeCount = useMemo(
    () => requests.filter((r) => ACTIVE_COORDINATION_STATUSES.has(r.status || "CREATED")).length,
    [requests]
  );

  const emergencyCount = useMemo(
    () =>
      requests.filter(
        (r) => r.isemergency || r.urgencylevel === "CRITICAL" || r.urgencylevel === "HIGH"
      ).length,
    [requests]
  );

  const fulfilledCount = useMemo(
    () => requests.filter((r) => r.status === "FULFILLED").length,
    [requests]
  );

  // Filtered list of requests (max 8 for compact, balanced presentation)
  const filteredRequests = useMemo(() => {
    let list = requests;
    if (activeFilter === "ACTIVE") {
      list = requests.filter((r) => ACTIVE_COORDINATION_STATUSES.has(r.status || "CREATED"));
    } else if (activeFilter === "EMERGENCY") {
      list = requests.filter(
        (r) => r.isemergency || r.urgencylevel === "CRITICAL" || r.urgencylevel === "HIGH"
      );
    } else if (activeFilter === "FULFILLED") {
      list = requests.filter((r) => r.status === "FULFILLED");
    }
    return list.slice(0, 8);
  }, [requests, activeFilter]);

  // Loading state
  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading hospital dashboard...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white rounded-2xl border border-[#F3E9D1] text-center space-y-4 shadow-2xs my-12">
        <div className="w-11 h-11 rounded-xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center mx-auto">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-serif text-lg font-bold text-[#053845]">
            Dashboard Unavailable
          </h2>
          <p className="text-xs text-slate-600">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => fetchDashboardData()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Welcome Section (Create button removed, clean alignment matching Requester) */}
      <section className="flex items-center gap-3.5 pb-4 border-b border-[#317786]/15">
        <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight truncate">
            Welcome back{hospital?.hospitalname ? `, ${hospital.hospitalname}` : ""}
          </h1>
          <p className="hidden sm:block text-sm text-slate-600">
            Here&apos;s an overview of your hospital&apos;s blood coordination activities.
          </p>
        </div>
      </section>

      {/* 2. Four Individual KPI Cards (Clean, balanced, unified dimensions) */}
      <section
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        aria-label="Hospital summary"
      >
        {/* 1. Total Assigned */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4.5 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Total Assigned</p>
            <p className="font-serif text-2xl font-bold text-[#053845] leading-tight my-0.5">
              {kpiCounts.total}
            </p>
            <p className="text-[11px] text-slate-400 truncate">All assigned requisitions</p>
          </div>
        </div>

        {/* 2. Emergency Requisitions */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4.5 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#EFA27E]/20 border border-[#EFA27E]/40 text-[#B94F30] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Emergency Requisitions</p>
            <p className="font-serif text-2xl font-bold text-[#053845] leading-tight my-0.5">
              {kpiCounts.emergency}
            </p>
            <p className="text-[11px] text-slate-400 truncate">High or Critical priority</p>
          </div>
        </div>

        {/* 3. In Coordination */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4.5 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">In Coordination</p>
            <p className="font-serif text-2xl font-bold text-[#053845] leading-tight my-0.5">
              {kpiCounts.inCoordination}
            </p>
            <p className="text-[11px] text-slate-400 truncate">Review, matching, or arranged</p>
          </div>
        </div>

        {/* 4. Fulfilled */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4.5 shadow-2xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Fulfilled</p>
            <p className="font-serif text-2xl font-bold text-[#053845] leading-tight my-0.5">
              {kpiCounts.fulfilled}
            </p>
            <p className="text-[11px] text-slate-400 truncate">Completed &amp; verified</p>
          </div>
        </div>
      </section>

      {/* 3. Recent Blood Requests (Full width, balanced layout inspired by Requester Dashboard) */}
      <section className="space-y-4" aria-label="Recent blood requests">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif text-xl font-bold text-[#053845]">
              Recent Blood Requests
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
              {requests.length}
            </span>
          </div>

          {requests.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
              <div
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-[#F3E9D1]"
                role="tablist"
                aria-label="Filter blood requests"
              >
                {(
                  [
                    { key: "ALL", label: "All", count: requests.length },
                    { key: "ACTIVE", label: "Active", count: activeCount },
                    { key: "EMERGENCY", label: "Emergency", count: emergencyCount },
                    { key: "FULFILLED", label: "Fulfilled", count: fulfilledCount },
                  ] as const
                ).map((tab) => {
                  const isActive = activeFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveFilter(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        isActive
                          ? "bg-[#317786] text-white shadow-2xs"
                          : "text-slate-600 hover:text-[#053845] hover:bg-[#317786]/10"
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  );
                })}
              </div>

              <Link
                href="/hospital/requests"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {requests.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 text-center shadow-2xs space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center mx-auto">
              <Droplets className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif text-base font-bold text-[#053845]">
                No blood requests assigned yet
              </h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                Requisitions assigned to this facility or created by your team will appear here for coordination.
              </p>
            </div>
            <div>
              <Link
                href="/hospital/requests/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Blood Request</span>
              </Link>
            </div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 text-center text-sm text-slate-500">
            No {activeFilter.toLowerCase()} blood requests found.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((req) => {
              const reqCode = `REQ-${req.requestid.slice(0, 8).toUpperCase()}`;
              const bloodDisplay = mapBloodGroupToDisplay(req.bloodgroup);
              const componentDisplay = formatComponentLabel(req.bloodcomponent);
              const isUrgent =
                req.isemergency ||
                req.urgencylevel === "CRITICAL" ||
                req.urgencylevel === "HIGH";

              return (
                <article
                  key={req.requestid}
                  className="bg-white rounded-2xl border border-[#F3E9D1] px-4 py-3.5 sm:px-5 sm:py-4 shadow-2xs hover:border-[#317786]/45 transition-all space-y-3"
                >
                  {/* Top row: Patient name, Request reference, Priority badge, & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                      <h3
                        className="font-serif text-base sm:text-lg font-bold text-[#053845] truncate max-w-[260px] sm:max-w-md"
                        title={req.patientname}
                      >
                        {req.patientname}
                      </h3>
                      <span className="font-mono text-xs font-medium text-slate-400 bg-[#FAF6EE] px-2 py-0.5 rounded-md border border-[#F3E9D1] shrink-0">
                        {reqCode}
                      </span>
                      {isUrgent ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFA27E]/25 text-[#B94F30] border border-[#EFA27E]/50 shrink-0 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-[#B94F30]" />
                          <span>
                            {req.urgencylevel === "CRITICAL" || req.isemergency
                              ? "Emergency"
                              : "High Priority"}
                          </span>
                        </span>
                      ) : req.urgencylevel && req.urgencylevel !== "LOW" ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                          {req.urgencylevel}
                        </span>
                      ) : null}
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border shrink-0 self-start sm:self-auto ${getStatusBadgeClass(
                        req.status
                      )}`}
                    >
                      {formatStatusLabel(req.status)}
                    </span>
                  </div>

                  {/* Compact information row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-[#F3E9D1]/70">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-slate-600 min-w-0">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#317786]/10 border border-[#317786]/20 shrink-0">
                        <Droplets className="w-3.5 h-3.5 text-[#317786]" />
                        <span className="font-serif font-bold text-[#053845]">
                          {bloodDisplay}
                        </span>
                        <span className="text-slate-400 text-xs">•</span>
                        <span className="text-[11px] font-medium text-[#317786] whitespace-nowrap">
                          {componentDisplay}
                        </span>
                      </div>

                      <span className="shrink-0 text-slate-700">
                        <span className="font-serif font-bold text-[#053845] text-sm sm:text-base">
                          {req.unitsrequired}
                        </span>{" "}
                        {req.unitsrequired === 1 ? "unit" : "units"}
                      </span>

                      {(req.requiredby || req.createdat) && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                          <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                          <span>
                            {req.requiredby
                              ? `Needed: ${formatDate(req.requiredby)}`
                              : formatDate(req.createdat)}
                          </span>
                        </span>
                      )}
                    </div>

                    <Link
                      href={`/hospital/requests/${req.requestid}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#053845] hover:text-white border border-[#F3E9D1] hover:border-[#053845] transition-all shadow-2xs shrink-0 self-start sm:self-center"
                    >
                      <span>Manage</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
