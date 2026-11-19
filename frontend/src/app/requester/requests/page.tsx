"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Droplet,
  RefreshCw,
  Search,
  Building2,
  ArrowLeft,
  AlertCircle,
  X,
  Eye,
  Loader2,
  Filter,
  Users,
  Calendar,
  MapPin,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatDate,
} from "@/lib/mappers";

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

export default function RequesterRequestsPage() {
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");

  const fetchRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await api.requester.getBloodRequests();

      if (res && res.success && Array.isArray(res.bloodRequests)) {
        setRequests(res.bloodRequests);
      } else {
        setError("Unable to retrieve blood requests. Please check your connection.");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load blood requests from Swastya backend."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Derived filtered requests (preserves existing search & filter logic)
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // 1. Search Query Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const refId = `req-${req.requestid.slice(0, 8)}`.toLowerCase();
        const patientName = req.patientname.toLowerCase();
        const bloodGroup = mapBloodGroupToDisplay(req.bloodgroup).toLowerCase();
        const component = mapBloodComponentToDisplay(req.bloodcomponent).toLowerCase();
        const { hospitalName } = extractFacilityDetails(req);
        const hospitalSearch = (hospitalName || "").toLowerCase();

        const matchesQuery =
          patientName.includes(q) ||
          refId.includes(q) ||
          bloodGroup.includes(q) ||
          component.includes(q) ||
          hospitalSearch.includes(q);

        if (!matchesQuery) return false;
      }

      // 2. Status Filter
      if (statusFilter !== "all") {
        const s = req.status?.toUpperCase() || "";
        if (statusFilter === "active") {
          const isClosed = ["FULFILLED", "CANCELLED", "EXPIRED"].includes(s);
          if (isClosed) return false;
        } else if (statusFilter === "fulfilled") {
          if (s !== "FULFILLED") return false;
        } else if (statusFilter === "critical") {
          if (req.urgencylevel?.toUpperCase() !== "CRITICAL" && !req.isemergency) {
            return false;
          }
        }
      }

      // 3. Urgency Filter
      if (urgencyFilter !== "all") {
        const u = req.urgencylevel?.toUpperCase() || "";
        if (urgencyFilter === "critical" && u !== "CRITICAL") return false;
        if (urgencyFilter === "urgent" && u !== "HIGH") return false;
        if (urgencyFilter === "standard" && u !== "MEDIUM" && u !== "LOW") return false;
      }

      return true;
    });
  }, [requests, searchTerm, statusFilter, urgencyFilter]);

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setUrgencyFilter("all");
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Requester Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            Showing {filteredRequests.length} of {requests.length} requests
          </span>
        )}
      </div>

      {/* Compact Page Header */}
      <header className="flex items-center gap-3.5 pb-4 border-b border-[#317786]/15">
        <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
          <Droplet className="w-5 h-5" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            My Blood Requests
          </h1>
          <p className="text-sm text-slate-600">
            View and manage all your submitted blood requests.
          </p>
        </div>
      </header>

      {/* Compact Search & Filter Toolbar directly on page background */}
      <section
        aria-label="Search and filter blood requests"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search patient, hospital, blood group, REQ ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white shadow-2xs focus:outline-none focus:border-[#317786] transition-colors text-[#053845]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
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
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "all"
                ? "bg-[#053845] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
            }`}
          >
            All Requests ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "active"
                ? "bg-[#317786] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
            }`}
          >
            Active in Progress
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("critical")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "critical"
                ? "bg-[#A2363A] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
            }`}
          >
            Critical Emergency
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("fulfilled")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "fulfilled"
                ? "bg-emerald-700 text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-emerald-700 border border-[#F3E9D1]"
            }`}
          >
            Fulfilled
          </button>
        </div>
      </section>

      {/* Requests Content */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-14 text-center space-y-3 shadow-2xs">
          <Loader2 className="w-7 h-7 text-[#317786] animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading your blood requests...</p>
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
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-10 text-center space-y-2 shadow-2xs">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center mx-auto mb-2">
            <Droplet className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-lg font-bold text-[#053845]">
            {requests.length === 0 ? "No blood requests yet." : "No matching requests"}
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {requests.length === 0
              ? "Your submitted blood requests will appear here once created."
              : "No blood requests matched your search query or selected filter."}
          </p>
          {requests.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] hover:bg-[#F3E9D1]/60 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const statusMeta = mapRequestStatusToDisplay(req.status);
            const urgencyMeta = mapUrgencyBadge(req.urgencylevel);
            const bloodGroupDisplay = mapBloodGroupToDisplay(req.bloodgroup);
            const componentDisplay = mapBloodComponentToDisplay(req.bloodcomponent);
            const refId = `REQ-${req.requestid.slice(0, 8).toUpperCase()}`;
            const { hospitalName, wardOrRoom } = extractFacilityDetails(req);
            const isCritical = req.urgencylevel === "CRITICAL" || Boolean(req.isemergency);

            return (
              <article
                key={req.requestid}
                className="bg-white rounded-2xl border border-[#F3E9D1] px-4 py-3 sm:px-5 sm:py-3.5 shadow-2xs hover:border-[#317786]/45 transition-colors space-y-2"
              >
                {/* Top row: Patient name, Request ID, Emergency priority & Status badge */}
                <div className="flex items-start sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <h2 className="font-serif text-base font-bold text-[#053845] truncate">
                      {req.patientname}
                    </h2>
                    <span className="text-xs font-medium text-slate-400 shrink-0">
                      {refId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${
                        isCritical
                          ? "bg-[#A2363A]/10 text-[#A2363A] border-[#A2363A]/25"
                          : "bg-[#EFA27E]/25 text-[#B94F30] border-[#EFA27E]/50"
                      }`}
                    >
                      {isCritical ? "Critical Emergency" : urgencyMeta.label}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${statusMeta.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                    <span>{statusMeta.label}</span>
                  </span>
                </div>

                {/* Compact information & actions row */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 border-t border-[#F3E9D1]/60">
                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 min-w-0">
                    <div className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-lg bg-[#317786]/10 border border-[#317786]/20 shrink-0">
                      <span className="font-serif text-sm font-bold text-[#053845] leading-none">
                        {bloodGroupDisplay}
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

                    {(hospitalName || wardOrRoom) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 text-xs text-slate-600">
                        {hospitalName && (
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                            <span className="truncate max-w-[220px]">{hospitalName}</span>
                          </span>
                        )}

                        {wardOrRoom && (
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                            <span className="truncate max-w-[180px]">{wardOrRoom}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {(req.requiredby || req.createdat) && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>
                          {req.requiredby
                            ? `Required ${formatDate(req.requiredby)}`
                            : `Requested ${formatDate(req.createdat)}`}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Preserved Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-center">
                    <Link
                      href={`/requester/donors?requestId=${req.requestid}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#317786] bg-[#317786]/10 hover:bg-[#317786]/15 border border-[#317786]/25 transition-colors"
                      title="View voluntary donors committed to this request"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Available Donors</span>
                    </Link>

                    <Link
                      href={`/requester/requests/${req.requestid}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] transition-colors shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Track Details</span>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
