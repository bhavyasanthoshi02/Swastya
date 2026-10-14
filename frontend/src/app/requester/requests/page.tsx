"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Droplet,
  PlusCircle,
  RefreshCw,
  Search,
  Building2,
  ArrowLeft,
  AlertCircle,
  X,
  ShieldCheck,
  Clock,
  Eye,
  Loader2,
  Filter,
  Users,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatDate,
  formatTimeAgo,
} from "@/lib/mappers";

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
    } catch (err: any) {
      setError(err?.message || "Failed to load blood requests from Swastya backend.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Derived filtered requests (mirrors Donor filter logic)
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // 1. Search Query Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const refId = `req-${req.requestid.slice(0, 8)}`.toLowerCase();
        const patientName = req.patientname.toLowerCase();
        const bloodGroup = mapBloodGroupToDisplay(req.bloodgroup).toLowerCase();
        const component = mapBloodComponentToDisplay(req.bloodcomponent).toLowerCase();
        const hospitalName = req.hospitals?.hospitalname?.toLowerCase() || "";

        const matchesQuery =
          patientName.includes(q) ||
          refId.includes(q) ||
          bloodGroup.includes(q) ||
          component.includes(q) ||
          hospitalName.includes(q);

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
          if (req.urgencylevel?.toUpperCase() !== "CRITICAL" && !req.isemergency) return false;
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
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb Navigation (mirrors DonorBloodRequestsPage) */}
      <div className="flex items-center justify-between">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Requester Dashboard</span>
        </Link>

        {!isLoading && (
          <span className="text-xs text-slate-500">
            Showing {filteredRequests.length} verified requisitions
          </span>
        )}
      </div>

      {/* Main Container (mirrors Donor rounded-3xl container) */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Page Header (mirrors Donor header styling) */}
        <div className="p-6 sm:p-8 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#B94F30] animate-pulse" />
                <span className="text-xs font-bold text-[#B94F30] uppercase tracking-wider">
                  Live Clinical Requisition Registry
                </span>
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                My Blood Requests
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
                Track and manage all blood requisitions submitted under your requester account. Monitor live donor matching, clinical hospital reviews, and transfusion dispatch history.
              </p>
            </div>

            {/* Quick Summary Pill & Actions */}
            <div className="flex flex-wrap items-center gap-3 self-start md:self-center">
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1]">
                <ShieldCheck className="w-5 h-5 text-[#317786]" />
                <div className="text-xs">
                  <span className="font-bold text-[#053845] block">Direct Coordination</span>
                  <span className="text-slate-500">Zero middlemen • Hospital-direct</span>
                </div>
              </div>

              <Link
                href="/requester/requests/new"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#B94F30] hover:bg-[#a14023] text-white font-semibold text-xs shadow-xs transition-all"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Raise Request</span>
              </Link>
            </div>
          </div>

          {/* Search & Filter Bar (mirrors Donor search bar) */}
          <div className="mt-6 pt-6 border-t border-[#F3E9D1]/70 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-88">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search patient, hospital, blood group, REQ ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-8 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white focus:outline-none focus:border-[#317786] transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Buttons (mirrors Donor filter buttons) */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 hidden sm:inline" />
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-[#053845] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
                }`}
              >
                All Requests ({requests.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "active"
                    ? "bg-[#317786] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
                }`}
              >
                Active in Progress
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("critical")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "critical"
                    ? "bg-[#A2363A] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
                }`}
              >
                Critical Emergency
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("fulfilled")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "fulfilled"
                    ? "bg-emerald-700 text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-emerald-700 border border-[#F3E9D1]"
                }`}
              >
                Fulfilled
              </button>
            </div>
          </div>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="p-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Loading verified clinical requisitions...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-[#A2363A] mx-auto" />
            <h3 className="font-serif text-base font-bold text-[#053845]">Failed to Load Requests</h3>
            <p className="text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => fetchRequests()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <Droplet className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="font-serif text-base font-bold text-[#053845]">
              No Requisitions Found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {requests.length === 0
                ? "You haven't submitted any blood requests yet. When you raise a requisition, tracking details and matching donor responses will appear here."
                : "No requisitions matched your search query or filter selection."}
            </p>
            <div className="pt-3">
              {requests.length === 0 ? (
                <Link
                  href="/requester/requests/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-xs"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Raise Your First Request</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((req) => {
              const statusMeta = mapRequestStatusToDisplay(req.status);
              const urgencyMeta = mapUrgencyBadge(req.urgencylevel);
              const bloodGroupDisplay = mapBloodGroupToDisplay(req.bloodgroup);
              const componentDisplay = mapBloodComponentToDisplay(req.bloodcomponent);
              const refId = `REQ-${req.requestid.slice(0, 8).toUpperCase()}`;

              return (
                <div
                  key={req.requestid}
                  className="p-5 sm:p-7 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-5"
                >
                  <div className="flex items-start gap-4 sm:gap-5 min-w-0">
                    {/* Big Need Blood Group Badge (mirrors Donor list item badge) */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#053845] text-white font-serif font-bold text-lg sm:text-xl flex flex-col items-center justify-center shrink-0 shadow-xs">
                      <span className="text-[9px] uppercase opacity-70 leading-none">
                        NEED
                      </span>
                      <span className="mt-0.5 text-[#EFA27E]">{bloodGroupDisplay}</span>
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          {refId}
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            req.urgencylevel === "CRITICAL" || req.isemergency
                              ? "bg-[#A2363A]/10 text-[#A2363A] border border-[#A2363A]/20"
                              : "bg-[#B94F30]/10 text-[#B94F30] border border-[#B94F30]/20"
                          }`}
                        >
                          {urgencyMeta.label}
                        </span>

                        <span className="text-xs font-semibold text-slate-700">
                          • {req.unitsrequired} {req.unitsrequired > 1 ? "Units" : "Unit"} ({componentDisplay})
                        </span>

                        <span className="text-[11px] font-medium text-[#317786] bg-[#317786]/10 px-2 py-0.5 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>Due {formatDate(req.requiredby)}</span>
                        </span>
                      </div>

                      <h2 className="font-serif text-lg sm:text-xl font-bold text-[#053845] truncate">
                        Patient: {req.patientname} (Age {req.patientage} • {req.patientgender})
                      </h2>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1 text-[#317786] font-semibold">
                          <Building2 className="w-3.5 h-3.5 text-[#B94F30] shrink-0" />
                          <span>{req.hospitals?.hospitalname || "Regional Medical Center"}</span>
                        </span>
                        <span>•</span>
                        <span className="truncate">{req.hospitals?.city || "Area Transfusion"}</span>
                        <span>•</span>
                        <span className="text-slate-400">Posted {formatTimeAgo(req.createdat)}</span>
                        <span>•</span>
                        <span className="text-slate-400">Radius: {req.searchradius || 5} km</span>
                      </div>

                      {req.notes && (
                        <p className="text-xs text-slate-600 line-clamp-2 max-w-2xl pt-1 italic">
                          &quot;{req.notes}&quot;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions & Status Pill */}
                  <div className="flex items-center gap-2.5 self-start md:self-center shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusMeta.badgeClass}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                      <span>{statusMeta.label}</span>
                    </span>

                    <Link
                      href={`/requester/donors?requestId=${req.requestid}`}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      title="View voluntary donors committed to this request"
                    >
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Available Donors</span>
                    </Link>

                    <Link
                      href={`/requester/requests/${req.requestid}`}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#317786]" />
                      <span>Track Details</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
