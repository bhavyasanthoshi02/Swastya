"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Tent,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { api, DonationCampItem, CampSummary } from "@/lib/api";
import { formatDate } from "@/lib/mappers";

function formatCampStatus(status: string) {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", badge: "bg-slate-100 text-slate-700 border-slate-300" };
    case "PUBLISHED":
      return { label: "Published", badge: "bg-emerald-50 text-emerald-700 border-emerald-300" };
    case "COMPLETED":
      return { label: "Completed", badge: "bg-blue-50 text-blue-700 border-blue-300" };
    case "CANCELLED":
      return { label: "Cancelled", badge: "bg-rose-50 text-rose-700 border-rose-300" };
    default:
      return { label: status, badge: "bg-slate-100 text-slate-700 border-slate-300" };
  }
}

function formatRegistrationStatus(regStatus: string, isRequired: boolean) {
  if (!isRequired) {
    return { label: "Walk-in Welcome (No Reg)", badge: "bg-purple-50 text-purple-700 border-purple-200" };
  }
  return regStatus === "OPEN"
    ? { label: "Registration Open", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : { label: "Registration Closed", badge: "bg-amber-50 text-amber-800 border-amber-300" };
}

export default function BloodBankCampsDashboardPage() {
  const [camps, setCamps] = useState<DonationCampItem[]>([]);
  const [summary, setSummary] = useState<CampSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchCamps = useCallback(async () => {
    setIsLoading(true);
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
    }
  }, [statusFilter, searchQuery, page]);

  useEffect(() => {
    fetchCamps();
  }, [fetchCamps]);

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-16">
      {/* Header Banner */}
      <div className="bg-white border-b border-[#F3E9D1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                  <Tent className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#053845]">
                    Blood Donation Camp Management
                  </h1>
                  <p className="text-sm text-slate-500">
                    Create, schedule, publish, and monitor donation camps and volunteer registrations.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/bloodbank/camps/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#053845] text-white hover:bg-[#074757] transition font-medium shadow-sm text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Donation Camp</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Metric Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white p-4 rounded-2xl border border-[#F3E9D1] shadow-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Total Camps
              </span>
              <span className="text-2xl font-bold text-[#053845] mt-1 block">
                {summary.totalCamps}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block">
                Upcoming
              </span>
              <span className="text-2xl font-bold text-emerald-700 mt-1 block">
                {summary.upcomingCamps}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm">
              <span className="text-xs font-semibold text-sky-600 uppercase tracking-wider block">
                Published
              </span>
              <span className="text-2xl font-bold text-sky-700 mt-1 block">
                {summary.publishedCamps}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm">
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider block">
                Reg Open
              </span>
              <span className="text-2xl font-bold text-amber-700 mt-1 block">
                {summary.registrationOpenCamps}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Drafts
              </span>
              <span className="text-2xl font-bold text-slate-700 mt-1 block">
                {summary.draftCamps}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm">
              <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider block">
                Cancelled
              </span>
              <span className="text-2xl font-bold text-rose-700 mt-1 block">
                {summary.cancelledCamps}
              </span>
            </div>
          </div>
        )}

        {/* Filters and Search Bar */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 mb-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search by camp name, venue, city, or organizer..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845] focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
              {["ALL", "PUBLISHED", "DRAFT", "COMPLETED", "CANCELLED"].map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    setStatusFilter(st);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    statusFilter === st
                      ? "bg-[#053845] text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {st === "ALL" ? "All Statuses" : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => fetchCamps()}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Camps List Table */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-[#053845] mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading donation camps...</p>
            </div>
          ) : error ? (
            <div className="py-16 px-4 text-center">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-800">{error}</p>
              <button
                onClick={() => fetchCamps()}
                className="mt-4 px-4 py-2 bg-[#053845] text-white rounded-xl text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          ) : camps.length === 0 ? (
            <div className="py-20 text-center px-4">
              <Tent className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800">No donation camps found</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
                {statusFilter !== "ALL" || searchQuery
                  ? "Try clearing your search query or filters."
                  : "You haven't scheduled any blood donation camps yet. Click Create Donation Camp to begin."}
              </p>
              <div className="mt-6">
                <Link
                  href="/bloodbank/camps/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] text-white text-sm font-medium hover:bg-[#074757] transition"
                >
                  <Plus className="w-4 h-4" />
                  Schedule First Camp
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Camp Information</th>
                    <th className="py-3.5 px-6">Date & Schedule</th>
                    <th className="py-3.5 px-6">Venue & Location</th>
                    <th className="py-3.5 px-6">Registration Capacity</th>
                    <th className="py-3.5 px-6">Camp Status</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {camps.map((camp) => {
                    const st = formatCampStatus(camp.status);
                    const regSt = formatRegistrationStatus(
                      camp.registrationstatus,
                      camp.isregistrationrequired
                    );

                    return (
                      <tr key={camp.campid} className="hover:bg-slate-50/60 transition group">
                        <td className="py-4 px-6">
                          <Link
                            href={`/bloodbank/camps/${camp.campid}`}
                            className="font-semibold text-[#053845] hover:underline block text-base"
                          >
                            {camp.campname}
                          </Link>
                          <span className="text-xs text-slate-500 block mt-0.5">
                            Organizer: <span className="font-medium text-slate-700">{camp.organizername}</span>
                          </span>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2 font-medium text-slate-800">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span>{new Date(camp.campdate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{camp.starttime} - {camp.endtime}</span>
                          </div>
                        </td>

                        <td className="py-4 px-6">
                          <div className="flex items-start gap-1.5 font-medium text-slate-800">
                            <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            <span className="line-clamp-1">{camp.venuename}</span>
                          </div>
                          <span className="text-xs text-slate-500 block pl-5 mt-0.5">
                            {camp.city}, {camp.state}
                          </span>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          {camp.isregistrationrequired ? (
                            <div>
                              <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                <Users className="w-4 h-4 text-indigo-500" />
                                <span>
                                  {camp.registeredCount || 0}
                                  {camp.maxcapacity ? ` / ${camp.maxcapacity} slots` : " registered"}
                                </span>
                              </div>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border mt-1 ${regSt.badge}`}>
                                {regSt.label}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border bg-purple-50 text-purple-700 border-purple-200">
                              Walk-in Welcome
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${st.badge}`}
                          >
                            {st.label}
                          </span>
                        </td>

                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <Link
                            href={`/bloodbank/camps/${camp.campid}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#053845] hover:text-white text-slate-700 text-xs font-medium transition"
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

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Showing {camps.length} of {totalCount} camps
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="text-xs font-medium px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
