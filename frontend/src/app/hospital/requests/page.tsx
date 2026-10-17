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
  ChevronRight,
  Loader2,
  Plus,
  X,
  ShieldCheck,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import { formatDate, formatTimeAgo } from "@/lib/mappers";

export default function HospitalBloodRequestsPage() {
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("ALL");
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

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.patientname.toLowerCase().includes(q);
        const matchesGroup = r.bloodgroup.toLowerCase().includes(q);
        const matchesReqId = `req-${r.requestid.slice(0, 8)}`.toLowerCase().includes(q);
        const matchesNotes = (r.notes || "").toLowerCase().includes(q);

        if (!matchesName && !matchesGroup && !matchesReqId && !matchesNotes) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusFilter !== "ALL") {
        const s = r.status?.toUpperCase() || "";
        if (statusFilter === "ACTIVE") {
          if (["FULFILLED", "CANCELLED", "EXPIRED"].includes(s)) return false;
        } else if (statusFilter === "REVIEW") {
          if (!["CREATED", "HOSPITAL_REVIEW"].includes(s)) return false;
        } else if (statusFilter === "MATCHING") {
          if (!["DONOR_MATCHING", "BLOOD_BANK_CHECK"].includes(s)) return false;
        } else if (statusFilter === "FULFILLED") {
          if (s !== "FULFILLED") return false;
        }
      }

      // 3. Urgency Filter
      if (urgencyFilter !== "ALL") {
        if (urgencyFilter === "EMERGENCY" && !r.isemergency && r.urgencylevel !== "CRITICAL") return false;
        if (urgencyFilter === "HIGH" && r.urgencylevel !== "HIGH") return false;
      }

      return true;
    });
  }, [requests, searchQuery, statusFilter, urgencyFilter]);

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>

        {!isLoading && (
          <span className="text-xs text-slate-500">
            Showing {filteredRequests.length} of {requests.length} assigned requisitions
          </span>
        )}
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Page Header Banner */}
        <div className="p-6 sm:p-8 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#B94F30] animate-pulse" />
                <span className="text-xs font-bold text-[#B94F30] uppercase tracking-wider">
                  Clinical Requisition Registry
                </span>
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                Assigned Blood Requests
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
                Review, verify, and coordinate blood units assigned to your medical facility for urgent or scheduled transfusions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fetchRequests(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <Link
                href="/hospital/requests/new"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#053845] hover:bg-[#317786] text-white font-semibold text-xs shadow-xs transition-all hover:scale-[1.02]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Blood Request</span>
              </Link>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="mt-6 pt-6 border-t border-[#F3E9D1]/70 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-88">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search patient, blood group, REQ ID, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-8 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white focus:outline-none focus:border-[#317786] transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 hidden sm:inline" />
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "ALL"
                    ? "bg-[#053845] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
                }`}
              >
                All ({requests.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("ACTIVE")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "ACTIVE"
                    ? "bg-[#317786] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("REVIEW")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "REVIEW"
                    ? "bg-[#B94F30] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#B94F30] border border-[#F3E9D1]"
                }`}
              >
                Review Needed
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("FULFILLED")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === "FULFILLED"
                    ? "bg-emerald-700 text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-emerald-700 border border-[#F3E9D1]"
                }`}
              >
                Fulfilled
              </button>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="m-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Content View */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading clinical requisitions...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <Droplets className="w-7 h-7" />
            </div>
            <h3 className="text-base font-serif font-bold text-[#053845]">No requisitions found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
              {searchQuery || statusFilter !== "ALL"
                ? "No blood requests matched your filter criteria."
                : "No blood requisitions have been assigned to this medical care facility yet."}
            </p>
            <div className="mt-5">
              <Link
                href="/hospital/requests/new"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Blood Request</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#F3E9D1]/50">
            {filteredRequests.map((req) => (
              <div
                key={req.requestid}
                className="p-6 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  {/* Blood Group Badge */}
                  <div className="w-14 h-14 rounded-2xl bg-[#B94F30]/10 border border-[#B94F30]/25 text-[#B94F30] flex flex-col items-center justify-center font-serif text-lg font-bold shrink-0 shadow-2xs">
                    <span className="leading-none">{req.bloodgroup}</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-base font-bold text-[#053845]">
                        {req.patientname}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                        REQ #{req.requestid.slice(0, 8)}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                        {req.unitsrequired} unit(s)
                      </span>
                      {req.isemergency && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700 uppercase flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Emergency</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Age: <strong className="text-slate-700">{req.patientage} yrs</strong> ({req.patientgender})</span>
                      <span>&bull;</span>
                      <span>Component: <span className="capitalize">{req.bloodcomponent.toLowerCase().replace(/_/g, " ")}</span></span>
                      <span>&bull;</span>
                      <span>Required by: <strong className="text-slate-700">{formatDate(req.requiredby)}</strong></span>
                      <span>&bull;</span>
                      <span>Logged: {formatTimeAgo(req.createdat)}</span>
                    </div>

                    {req.notes && (
                      <p className="text-xs text-slate-600 bg-[#FAF6EE]/60 p-2.5 rounded-xl border border-[#F3E9D1]/50 mt-1 line-clamp-2 max-w-2xl">
                        <span className="font-semibold text-[#053845]">Clinical Notes:</span> {req.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0 self-start md:self-center">
                  <div className="text-left sm:text-right">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                        req.status === "FULFILLED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : req.status === "BLOOD_ARRANGED"
                          ? "bg-teal-50 text-teal-800 border border-teal-200"
                          : req.status === "DONOR_MATCHING"
                          ? "bg-sky-50 text-sky-800 border border-sky-200"
                          : req.status === "CANCELLED"
                          ? "bg-slate-100 text-slate-600 border border-slate-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {req.status?.replace(/_/g, " ")}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Updated {formatDate(req.updatedat)}
                    </span>
                  </div>

                  <Link
                    href={`/hospital/requests/${req.requestid}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs hover:scale-[1.02] shrink-0"
                  >
                    <span>Manage & Fulfill</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
