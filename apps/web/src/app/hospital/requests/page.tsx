"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Droplets,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  X,
  Calendar,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import { formatDate, formatTimeAgo, mapBloodGroupToDisplay } from "@/lib/mappers";

type StatusTab = "ALL" | "ACTIVE" | "EMERGENCY" | "REVIEW" | "FULFILLED";

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
    case "CREATED":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-[#FAF6EE] text-[#053845] border-[#F3E9D1]";
  }
}

export default function HospitalBloodRequestsPage() {
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusTab>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async (background = false) => {
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const res = await api.hospital.getBloodRequests();
      setRequests(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load facility blood requests");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Dynamic filter counts
  const activeCount = useMemo(() => {
    return requests.filter((r) => !["FULFILLED", "CANCELLED", "EXPIRED"].includes(r.status || "")).length;
  }, [requests]);

  const emergencyCount = useMemo(() => {
    return requests.filter((r) => r.isemergency || r.urgencylevel === "CRITICAL" || r.urgencylevel === "HIGH").length;
  }, [requests]);

  const reviewCount = useMemo(() => {
    return requests.filter((r) => ["CREATED", "HOSPITAL_REVIEW"].includes(r.status || "")).length;
  }, [requests]);

  const fulfilledCount = useMemo(() => {
    return requests.filter((r) => r.status === "FULFILLED").length;
  }, [requests]);

  // Filtered list
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.patientname.toLowerCase().includes(q);
        const matchesGroup = (r.bloodgroup || "").toLowerCase().includes(q);
        const matchesGroupDisplay = mapBloodGroupToDisplay(r.bloodgroup).toLowerCase().includes(q);
        const matchesReqId = `req-${r.requestid.slice(0, 8)}`.toLowerCase().includes(q);
        const matchesNotes = (r.notes || "").toLowerCase().includes(q);

        if (!matchesName && !matchesGroup && !matchesGroupDisplay && !matchesReqId && !matchesNotes) {
          return false;
        }
      }

      // 2. Status/Urgency Tab Filter
      if (statusFilter === "ACTIVE") {
        if (["FULFILLED", "CANCELLED", "EXPIRED"].includes(r.status || "")) return false;
      } else if (statusFilter === "EMERGENCY") {
        if (!r.isemergency && r.urgencylevel !== "CRITICAL" && r.urgencylevel !== "HIGH") return false;
      } else if (statusFilter === "REVIEW") {
        if (!["CREATED", "HOSPITAL_REVIEW"].includes(r.status || "")) return false;
      } else if (statusFilter === "FULFILLED") {
        if (r.status !== "FULFILLED") return false;
      }

      return true;
    });
  }, [requests, searchQuery, statusFilter]);

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
            Showing {filteredRequests.length} of {requests.length}{" "}
            {requests.length === 1 ? "requisition" : "requisitions"}
          </span>
        )}
      </div>

      {/* 1. Compact Page Header directly on cream background */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Droplets className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Assigned Blood Requests
              </h1>
              {!isLoading && !error && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {requests.length} Assigned
                </span>
              )}
            </div>
            <p className="hidden sm:block text-sm text-slate-600">
              Review, verify, and coordinate blood units assigned to your medical facility for urgent or scheduled transfusions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => fetchRequests(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh assigned requisitions"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/hospital/requests/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Request</span>
          </Link>
        </div>
      </header>

      {/* 2. Compact Search & Filter Toolbar directly on cream background */}
      <section
        aria-label="Search and filter assigned blood requests"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search patient, blood group, REQ ID, notes..."
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

        <div className="flex items-center gap-1.5 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
          <Filter className="w-3.5 h-3.5 text-[#317786] mr-1 hidden sm:inline shrink-0" />
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-[#053845] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
            }`}
          >
            All ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVE")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "ACTIVE"
                ? "bg-[#317786] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("EMERGENCY")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "EMERGENCY"
                ? "bg-[#A2363A] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
            }`}
          >
            Emergency ({emergencyCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("REVIEW")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "REVIEW"
                ? "bg-[#B94F30] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#B94F30] border border-[#F3E9D1]"
            }`}
          >
            Review Needed ({reviewCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("FULFILLED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "FULFILLED"
                ? "bg-emerald-700 text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-emerald-700 border border-[#F3E9D1]"
            }`}
          >
            Fulfilled ({fulfilledCount})
          </button>
        </div>
      </section>

      {/* 3. Loading, Error, Empty States & Individual Blood Request Cards */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center space-y-3 shadow-2xs">
          <Loader2 className="w-7 h-7 text-[#317786] animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">
            Loading assigned clinical requisitions...
          </p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-10 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-base font-bold text-[#053845]">
            Failed to Load Requests
          </h2>
          <p className="text-xs text-slate-500">{error}</p>
          <button
            type="button"
            onClick={() => fetchRequests()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
            <Droplets className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
              No blood requests assigned yet
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Requisitions assigned to this medical care facility will appear here for coordination and fulfillment.
            </p>
          </div>
          <div className="pt-1">
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
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-serif text-base font-bold text-[#053845]">
              No requests match your filters
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try clearing your search query or resetting the selected status filter.
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
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

            const urgencyBadgeClass =
              req.urgencylevel === "CRITICAL" || req.isemergency
                ? "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/25"
                : req.urgencylevel === "HIGH"
                ? "bg-[#EFA27E]/20 text-[#B94F30] border-[#EFA27E]/45"
                : "bg-[#317786]/10 text-[#317786] border-[#317786]/25";

            return (
              <article
                key={req.requestid}
                className={`w-full bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs hover:border-[#317786]/45 transition-all space-y-4 ${
                  isUrgent ? "border-l-4 border-l-[#EFA27E]" : ""
                }`}
              >
                {/* 3-Column Distribution on Desktop: 40% - 30% - 30% */}
                <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-stretch">
                  {/* Left — Patient Information (40%) */}
                  <div className="lg:col-span-4 space-y-2 lg:pr-6 lg:border-r border-[#F3E9D1]/70 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2
                          className="font-serif text-lg sm:text-xl font-bold text-[#053845] leading-snug break-words"
                          title={req.patientname}
                        >
                          {req.patientname}
                        </h2>
                        <span className="font-mono text-xs font-semibold text-slate-400 bg-[#FAF6EE] px-2 py-0.5 rounded-md border border-[#F3E9D1] shrink-0">
                          {reqCode}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 space-y-0.5">
                        <p>
                          Age: <strong className="text-slate-700">{req.patientage} yrs</strong> &bull; Gender: <strong className="text-slate-700">{req.patientgender}</strong>
                        </p>
                        {req.patientcontact && (
                          <p className="text-slate-600">
                            Contact: <strong className="font-mono text-slate-800">{req.patientcontact}</strong>
                          </p>
                        )}
                      </div>
                    </div>

                    {req.notes && (
                      <div className="bg-[#FAF6EE]/80 p-2.5 rounded-xl border border-[#F3E9D1]/70 text-xs text-slate-600 mt-2">
                        <span className="font-semibold text-[#053845] block mb-0.5">Clinical Notes:</span>
                        <p className="line-clamp-2 leading-relaxed">{req.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Middle — Blood Requirement (30%) */}
                  <div className="lg:col-span-3 space-y-3 lg:pr-6 lg:border-r border-[#F3E9D1]/70 flex flex-col justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-12 h-12 rounded-xl bg-[#317786]/10 border border-[#317786]/25 font-serif text-xl font-bold text-[#053845] flex items-center justify-center shrink-0 shadow-2xs">
                        {bloodDisplay}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Blood Group
                        </span>
                        <span className="text-sm font-semibold text-[#053845] truncate block">
                          {componentDisplay}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Required:</span>
                        <span className="font-serif text-sm font-bold text-[#053845]">
                          {req.unitsrequired} {req.unitsrequired === 1 ? "unit" : "units"}
                        </span>
                      </div>

                      {req.requiredby && (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Calendar className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                          <span>
                            Needed: <strong className="text-slate-800">{formatDate(req.requiredby)}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right — Request Status and Actions (30%) */}
                  <div className="lg:col-span-3 flex flex-col lg:items-end justify-between gap-3">
                    <div className="flex flex-wrap items-center lg:flex-col lg:items-end gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isUrgent ? (
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 ${urgencyBadgeClass}`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-[#A2363A]" />
                            <span>
                              {req.urgencylevel === "CRITICAL" || req.isemergency
                                ? "Critical Emergency"
                                : "Urgent Priority"}
                            </span>
                          </span>
                        ) : req.urgencylevel && req.urgencylevel !== "LOW" ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 inline-block">
                            {req.urgencylevel} Priority
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 inline-block">
                            Standard Priority
                          </span>
                        )}

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold border inline-block ${getStatusBadgeClass(
                            req.status
                          )}`}
                        >
                          {formatStatusLabel(req.status)}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Logged {formatTimeAgo(req.createdat)}</span>
                      </span>
                    </div>

                    <Link
                      href={`/hospital/requests/${req.requestid}`}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs cursor-pointer"
                    >
                      <span>Manage &amp; Fulfill</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Bottom Information Row */}
                <div className="pt-3 border-t border-[#F3E9D1]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    {req.prescription ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Prescription verified &amp; attached ({req.prescription.status})</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Direct Requisition (Hospital Originated)</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                    ID: {req.requestid}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
