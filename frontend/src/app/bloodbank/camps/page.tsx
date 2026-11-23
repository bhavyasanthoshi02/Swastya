"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Tent,
  Plus,
  Search,
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { api, DonationCampItem, CampSummary } from "@/lib/api";

function formatCampStatus(status: string) {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", badge: "bg-slate-100 text-slate-700 border-slate-200" };
    case "PUBLISHED":
      return { label: "Published", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "COMPLETED":
      return { label: "Completed", badge: "bg-[#317786]/10 text-[#053845] border-[#317786]/20" };
    case "CANCELLED":
      return { label: "Cancelled", badge: "bg-rose-50 text-rose-700 border-rose-200" };
    default:
      return { label: status, badge: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

function formatRegistrationStatus(regStatus: string, isRequired: boolean) {
  if (!isRequired) {
    return { label: "Walk-in Welcome", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  }
  return regStatus === "OPEN"
    ? { label: "Registration Open", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : { label: "Registration Closed", badge: "bg-amber-50 text-amber-800 border-amber-200" };
}

export default function BloodBankCampsDashboardPage() {
  const [camps, setCamps] = useState<DonationCampItem[]>([]);
  const [summary, setSummary] = useState<CampSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchCamps = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.bloodbank.camps.list({
          status: statusFilter === "ALL" ? undefined : statusFilter,
          search: searchQuery.trim() || undefined,
          page,
          limit: 10,
        }),
        api.bloodbank.camps.getSummary(),
      ]);

      if (listRes.success) {
        setCamps(listRes.data.camps);
        setTotalPages(listRes.data.totalPages || 1);
        setTotalCount(listRes.data.total || 0);
      }
      if (summaryRes.success) {
        setSummary(summaryRes.data);
      }
    } catch (err: any) {
      console.error("Error loading camps:", err);
      setError(err?.message || "Failed to load blood donation camps");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, searchQuery, page]);

  useEffect(() => {
    fetchCamps();
  }, [fetchCamps]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 1. Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Tent className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Blood Donation Camps
              </h1>
              {!isLoading && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {totalCount} Camps Scheduled
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Create, schedule, publish, and monitor voluntary community donation drives.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <Link
            href="/bloodbank/camp-planner"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#FAF6EE]/80 border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#317786]" />
            <span>AI Camp Planner</span>
          </Link>

          <button
            type="button"
            onClick={() => fetchCamps(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh camp records"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/bloodbank/camps/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule New Camp</span>
          </Link>
        </div>
      </header>

      {/* 2. Metric Summary Statistics Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Camps
            </span>
            <span className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] block">
              {summary.totalCamps}
            </span>
            <span className="text-[10px] text-slate-400 block">All recorded drives</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
              Upcoming
            </span>
            <span className="font-serif text-2xl sm:text-3xl font-bold text-emerald-800 block">
              {summary.upcomingCamps}
            </span>
            <span className="text-[10px] text-emerald-600 block">Active future dates</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
            <span className="text-[11px] font-semibold text-[#317786] uppercase tracking-wider block">
              Published
            </span>
            <span className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] block">
              {summary.publishedCamps}
            </span>
            <span className="text-[10px] text-[#317786] block">Live for donors</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
            <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
              Reg Open
            </span>
            <span className="font-serif text-2xl sm:text-3xl font-bold text-amber-800 block">
              {summary.registrationOpenCamps}
            </span>
            <span className="text-[10px] text-amber-600 block">Slots available</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Drafts
            </span>
            <span className="font-serif text-2xl sm:text-3xl font-bold text-slate-700 block">
              {summary.draftCamps}
            </span>
            <span className="text-[10px] text-slate-400 block">Unpublished</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Cancelled
            </span>
            <span className="font-serif text-2xl sm:text-3xl font-bold text-slate-600 block">
              {summary.cancelledCamps}
            </span>
            <span className="text-[10px] text-slate-400 block">Archived / called off</span>
          </div>
        </div>
      )}

      {/* 3. Search and Status Filters */}
      <div className="bg-white p-3 rounded-2xl border border-[#F3E9D1] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by camp name, venue, city, or organizer..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] text-xs text-[#053845] placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#317786]"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {["ALL", "PUBLISHED", "DRAFT", "COMPLETED", "CANCELLED"].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === st
                  ? "bg-[#053845] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
              }`}
            >
              {st === "ALL" ? "All Statuses" : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Camps List Table */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#317786] mx-auto" />
            <p className="text-xs text-slate-500">Loading donation camps...</p>
          </div>
        ) : error ? (
          <div className="py-16 px-4 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <button
              onClick={() => fetchCamps()}
              className="px-4 py-2 bg-[#053845] text-white rounded-xl text-xs font-semibold hover:bg-[#317786] transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : camps.length === 0 ? (
          <div className="py-16 text-center px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
              <Tent className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#053845]">No donation camps found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {statusFilter !== "ALL" || searchQuery
                ? "Try clearing your search query or status filter to see other records."
                : "Your facility has not organized any blood donation camps yet. Schedule a camp to connect with community donors."}
            </p>
            <div className="pt-2">
              <Link
                href="/bloodbank/camps/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold shadow-2xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule First Camp</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF6EE]/60 border-b border-[#F3E9D1] text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-5">Camp & Organizer</th>
                  <th className="py-3 px-5">Date & Time</th>
                  <th className="py-3 px-5">Venue Location</th>
                  <th className="py-3 px-5">Slot Bookings</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {camps.map((camp) => {
                  const st = formatCampStatus(camp.status);
                  const regSt = formatRegistrationStatus(
                    camp.registrationstatus,
                    camp.isregistrationrequired
                  );

                  return (
                    <tr key={camp.campid} className="hover:bg-[#FAF6EE]/40 transition-colors">
                      <td className="py-3.5 px-5">
                        <Link
                          href={`/bloodbank/camps/${camp.campid}`}
                          className="font-serif text-sm font-bold text-[#053845] hover:text-[#317786] block"
                        >
                          {camp.campname}
                        </Link>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          Organizer: <span className="font-medium text-slate-700">{camp.organizername}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                          <span>
                            {new Date(camp.campdate).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            {camp.starttime} - {camp.endtime}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-5">
                        <div className="flex items-start gap-1 font-medium text-slate-800">
                          <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{camp.venuename}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 block pl-4.5 mt-0.5">
                          {camp.city}, {camp.state}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap">
                        {camp.isregistrationrequired ? (
                          <div>
                            <div className="flex items-center gap-1.5 font-medium text-slate-800">
                              <Users className="w-3.5 h-3.5 text-slate-500" />
                              <span>
                                {camp.registeredCount || 0}
                                {camp.maxcapacity ? ` / ${camp.maxcapacity} slots` : " registered"}
                              </span>
                            </div>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border mt-1 ${regSt.badge}`}
                            >
                              {regSt.label}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-indigo-50 text-indigo-700 border-indigo-200">
                            Walk-in Welcome
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${st.badge}`}
                        >
                          {st.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <Link
                          href={`/bloodbank/camps/${camp.campid}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#053845] hover:text-white text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="bg-[#FAF6EE]/30 border-t border-[#F3E9D1] px-5 py-3 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Showing {camps.length} of {totalCount} scheduled camps
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-slate-700 font-semibold disabled:opacity-40 hover:bg-[#FAF6EE] cursor-pointer"
              >
                Previous
              </button>
              <span className="font-semibold text-[#053845] px-1">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-slate-700 font-semibold disabled:opacity-40 hover:bg-[#FAF6EE] cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
