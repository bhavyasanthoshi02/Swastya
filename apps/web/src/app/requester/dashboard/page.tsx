"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Droplet,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Building2,
  Calendar,
  ArrowRight,
  FileText,
  Activity,
  MapPin,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import { getStoredUser, AuthUser } from "@/lib/auth";
import {
  formatDate,
  mapBloodGroupToDisplay,
} from "@/lib/mappers";

type FilterTab = "ALL" | "ACTIVE" | "COMPLETED";

const ACTIVE_STATUSES = new Set([
  "CREATED",
  "HOSPITAL_REVIEW",
  "BLOOD_BANK_CHECK",
  "DONOR_MATCHING",
  "BLOOD_ARRANGED",
]);

const COMPLETED_STATUSES = new Set(["FULFILLED", "CANCELLED", "EXPIRED"]);

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
    default:
      return "bg-[#FAF6EE] text-[#053845] border-[#F3E9D1]";
  }
}

function extractFacilityDetails(req: BloodRequestItem): {
  hospitalName: string | null;
  wardOrRoom: string | null;
} {
  let noteFacility: string | null = null;
  let wardOrRoom: string | null = null;

  if (req.notes) {
    const segments = req.notes.split("|").map((s) => s.trim());
    for (const seg of segments) {
      if (seg.startsWith("Facility / Hospital:")) {
        const val = seg.slice("Facility / Hospital:".length).trim();
        if (val) noteFacility = val;
      } else if (seg.startsWith("Selected Facility:")) {
        const val = seg.slice("Selected Facility:".length).trim();
        if (val) noteFacility = val;
      } else if (seg.startsWith("Ward / Room:")) {
        const val = seg.slice("Ward / Room:".length).trim();
        if (val) wardOrRoom = val;
      }
    }
  }

  const hospitalName =
    req.hospitals?.hospitalname?.trim() ||
    req.prescription?.hospitalname?.trim() ||
    noteFacility ||
    null;

  return { hospitalName, wardOrRoom };
}

export default function RequesterDashboardOverviewPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [kpis, setKpis] = useState({ total: 0, active: 0, fulfilled: 0 });
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [dashRes, listRes] = await Promise.allSettled([
        api.requester.getDashboard(),
        api.requester.getBloodRequests(),
      ]);

      let loadedRequests: BloodRequestItem[] = [];
      if (listRes.status === "fulfilled" && listRes.value?.success) {
        loadedRequests = listRes.value.bloodRequests || [];
      }

      if (dashRes.status === "fulfilled" && dashRes.value?.success) {
        const dash = dashRes.value;
        if (loadedRequests.length === 0) {
          loadedRequests = dash.recentRequests || [];
        }
        const computedActive = loadedRequests.filter((r) =>
          ACTIVE_STATUSES.has(r.status || "CREATED")
        ).length;
        const computedFulfilled = loadedRequests.filter(
          (r) => r.status === "FULFILLED"
        ).length;

        setKpis({
          total: dash.totalRequests ?? loadedRequests.length,
          active: dash.activeRequests ?? computedActive,
          fulfilled: dash.completedRequests ?? computedFulfilled,
        });
      } else if (listRes.status === "fulfilled" && listRes.value?.success) {
        setKpis({
          total: loadedRequests.length,
          active: loadedRequests.filter((r) =>
            ACTIVE_STATUSES.has(r.status || "CREATED")
          ).length,
          fulfilled: loadedRequests.filter((r) => r.status === "FULFILLED").length,
        });
      } else {
        setError("Failed to retrieve your requester dashboard.");
        return;
      }

      setRequests(loadedRequests);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect to Swastya backend server."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setUser(getStoredUser());

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("created") === "true") {
        const id = params.get("requestId");
        setSuccessBanner(
          id
            ? `Blood request REQ-${id.slice(0, 8).toUpperCase()} submitted successfully.`
            : "Blood request submitted successfully."
        );
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    fetchDashboardData();
  }, [fetchDashboardData]);

  const filteredRequests = useMemo(() => {
    if (activeFilter === "ACTIVE") {
      return requests.filter((r) => ACTIVE_STATUSES.has(r.status || "CREATED"));
    }
    if (activeFilter === "COMPLETED") {
      return requests.filter((r) => COMPLETED_STATUSES.has(r.status || ""));
    }
    return requests;
  }, [requests, activeFilter]);

  const activeCount = useMemo(
    () => requests.filter((r) => ACTIVE_STATUSES.has(r.status || "CREATED")).length,
    [requests]
  );

  const completedCount = useMemo(
    () => requests.filter((r) => COMPLETED_STATUSES.has(r.status || "")).length,
    [requests]
  );

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading your dashboard...</p>
      </div>
    );
  }

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
      {/* Success Banner */}
      {successBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs sm:text-sm text-emerald-800">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer text-xs shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Compact Welcome Section */}
      <section className="flex items-center gap-3.5 pb-4 border-b border-[#317786]/15">
        <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
          <Droplet className="w-5 h-5" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="hidden sm:block text-sm text-slate-600">
            Manage your blood requests and track their progress.
          </p>
        </div>
      </section>

      {/* 2. Three Compact KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Request summary">
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Total Requests</p>
            <p className="font-serif text-2xl font-bold text-[#053845] leading-tight">
              {kpis.total}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EFA27E]/20 border border-[#EFA27E]/40 text-[#B94F30] flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Active Requests</p>
            <p className="font-serif text-2xl font-bold text-[#053845] leading-tight">
              {kpis.active}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Fulfilled Requests</p>
            <p className="font-serif text-2xl font-bold text-[#053845] leading-tight">
              {kpis.fulfilled}
            </p>
          </div>
        </div>
      </section>

      {/* 3. My Blood Requests (Full-Width Main Section) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif text-xl font-bold text-[#053845]">
              My Blood Requests
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
                    { key: "COMPLETED", label: "Completed", count: completedCount },
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
                href="/requester/requests"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

          {requests.length === 0 ? (
            /* 5. Simple Empty State inside My Blood Requests */
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 text-center shadow-2xs">
              <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center mx-auto mb-3">
                <Droplet className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-lg font-bold text-[#053845]">
                No blood requests yet.
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                Your submitted requests will appear here.
              </p>
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
                const { hospitalName, wardOrRoom } = extractFacilityDetails(req);
                const isUrgent = req.isemergency || req.urgencylevel === "CRITICAL";

                return (
                  <article
                    key={req.requestid}
                    className="bg-white rounded-2xl border border-[#F3E9D1] px-4 py-3 sm:px-5 sm:py-3.5 shadow-2xs hover:border-[#317786]/45 transition-colors space-y-2"
                  >
                    {/* Top row: Patient name, Request ID, Emergency badge & Status */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <h3 className="font-serif text-base font-bold text-[#053845] truncate">
                          {req.patientname}
                        </h3>
                        <span className="text-xs font-medium text-slate-400 shrink-0">
                          {reqCode}
                        </span>
                        {isUrgent && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFA27E]/25 text-[#B94F30] border border-[#EFA27E]/50 shrink-0">
                            Emergency
                          </span>
                        )}
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${getStatusBadgeClass(
                          req.status
                        )}`}
                      >
                        {formatStatusLabel(req.status)}
                      </span>
                    </div>

                    {/* Compact information row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#F3E9D1]/60">
                      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 min-w-0">
                        <div className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-lg bg-[#317786]/10 border border-[#317786]/20 shrink-0">
                          <span className="font-serif text-sm font-bold text-[#053845] leading-none">
                            {bloodDisplay}
                          </span>
                          <span className="text-[10px] font-medium text-[#317786] mt-0.5 leading-tight whitespace-nowrap">
                            {componentDisplay}
                          </span>
                        </div>

                        <span className="text-xs sm:text-sm text-slate-700 shrink-0">
                          <span className="font-serif text-base font-bold text-[#053845]">
                            {req.unitsrequired}
                          </span>{" "}
                          {req.unitsrequired === 1 ? "unit" : "units"}
                        </span>

                        {hospitalName && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
                            <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                            <span className="truncate max-w-[220px]">{hospitalName}</span>
                          </span>
                        )}

                        {wardOrRoom && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                            <span className="truncate max-w-[180px]">{wardOrRoom}</span>
                          </span>
                        )}

                        {(req.requiredby || req.createdat) && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                            <Calendar className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                            <span>
                              {req.requiredby
                                ? formatDate(req.requiredby)
                                : formatDate(req.createdat)}
                            </span>
                          </span>
                        )}
                      </div>

                      <Link
                        href={`/requester/requests/${req.requestid}`}
                        className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#B94F30] hover:text-[#053845] transition-colors shrink-0 self-end sm:self-center"
                      >
                        <span>View Details</span>
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
