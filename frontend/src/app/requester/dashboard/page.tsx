"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  Heart,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Droplet,
  ArrowRight,
  AlertCircle,
  Clock,
  Calendar,
  Loader2,
  FileText,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import { getStoredUser, AuthUser } from "@/lib/auth";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatDate,
  formatTimeAgo,
} from "@/lib/mappers";

interface DashboardData {
  totalRequests: number;
  activeRequests: number;
  completedRequests: number;
  recentRequests: BloodRequestItem[];
}

export default function RequesterDashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (background = false) => {
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const res = await api.requester.getDashboard();

      if (res && res.success) {
        setData({
          totalRequests: res.totalRequests ?? 0,
          activeRequests: res.activeRequests ?? 0,
          completedRequests: res.completedRequests ?? 0,
          recentRequests: res.recentRequests || [],
        });
      } else {
        setError("Failed to retrieve requester dashboard statistics.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya backend server.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    fetchDashboardData();
  }, [fetchDashboardData]);

  const filteredRequests = (data?.recentRequests || []).filter((req) => {
    if (filter === "active") {
      return !["FULFILLED", "CANCELLED", "EXPIRED"].includes(req.status.toUpperCase());
    }
    if (filter === "completed") {
      return req.status.toUpperCase() === "FULFILLED";
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Welcome / Hero Banner */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#317786]/10 border border-[#317786]/20 text-[#053845] text-[10px] font-semibold tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#317786] animate-pulse" />
            LIVE PATIENT COORDINATION DESK
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            Welcome back{user?.name ? `, ${user.name}` : ""}
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
            Monitor patient blood requirements, track voluntary donor responses, and follow verified inventory reservations across accredited hospitals and regional blood banks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => fetchDashboardData(true)}
            disabled={isLoading || isRefreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-[#053845] bg-white border border-slate-200 hover:border-[#317786] hover:bg-slate-50 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            title="Refresh dashboard stats"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#317786]" : "text-slate-500"}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            href="/requester/create-request"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-xs hover:shadow transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Raise Blood Request</span>
          </Link>
        </div>
      </div>

      {/* Error State Notification */}
      {error && (
        <div className="p-4 rounded-xl bg-[#fdf2f2] border border-[#A2363A]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-[#A2363A]">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Unable to Load Dashboard Data</span>
              <span className="text-slate-700">{error}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchDashboardData()}
            className="px-3 py-1.5 rounded-lg bg-[#A2363A] text-white font-medium hover:bg-[#85272b] transition-colors self-start sm:self-auto cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !data && (
        <div className="py-16 text-center space-y-3 bg-white rounded-2xl border border-[#F3E9D1]">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] text-[#317786] flex items-center justify-center mx-auto shadow-2xs">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif text-base font-bold text-[#053845]">
              Loading Requester Coordination Desk...
            </h3>
            <p className="text-xs text-slate-500">
              Fetching verified clinical requisitions and real-time status history
            </p>
          </div>
        </div>
      )}

      {/* Live Metrics Grid */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Requisitions */}
          <div className="bg-white p-5 rounded-2xl border border-[#F3E9D1] shadow-2xs transition-all hover:shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Requests
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#053845]/10 text-[#053845] flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-serif text-[#053845]">
              {data.totalRequests}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              All requisitions raised under your account
            </p>
          </div>

          {/* Card 2: Active Requests */}
          <div className="bg-white p-5 rounded-2xl border border-[#F3E9D1] shadow-2xs transition-all hover:shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Active in Progress
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#EFA27E]/20 text-[#B94F30] flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-serif text-[#B94F30]">
              {data.activeRequests}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Currently undergoing matching or review
            </p>
          </div>

          {/* Card 3: Completed Transfusions */}
          <div className="bg-white p-5 rounded-2xl border border-[#F3E9D1] shadow-2xs transition-all hover:shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Fulfilled Requests
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold font-serif text-emerald-700">
              {data.completedRequests}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Successfully matched and transfused
            </p>
          </div>
        </div>
      )}

      {/* Recent Blood Requests Section */}
      {data && (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xs overflow-hidden">
          {/* Card Header & Filter Tabs */}
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-[#053845]">
                Recent Blood Requisitions
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time tracking of patient needs, required units, urgency, and clinical fulfillment status.
              </p>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filter === "all"
                    ? "bg-white text-[#053845] font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-[#053845]"
                }`}
              >
                All ({data.recentRequests.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("active")}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filter === "active"
                    ? "bg-white text-[#053845] font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-[#053845]"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setFilter("completed")}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filter === "completed"
                    ? "bg-white text-[#053845] font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-[#053845]"
                }`}
              >
                Fulfilled
              </button>
            </div>
          </div>

          {/* Table or Empty State */}
          {filteredRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-[#FAF6EE]/60 border-b border-[#F3E9D1]/70 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-5 font-semibold">Patient &amp; Case</th>
                    <th className="py-3 px-5 font-semibold">Group &amp; Component</th>
                    <th className="py-3 px-5 font-semibold">Units</th>
                    <th className="py-3 px-5 font-semibold">Urgency</th>
                    <th className="py-3 px-5 font-semibold">Required By</th>
                    <th className="py-3 px-5 font-semibold">Current Status</th>
                    <th className="py-3 px-5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map((req) => {
                    const statusMeta = mapRequestStatusToDisplay(req.status);
                    const urgencyMeta = mapUrgencyBadge(req.urgencylevel);
                    const bloodGroupDisplay = mapBloodGroupToDisplay(req.bloodgroup);
                    const componentDisplay = mapBloodComponentToDisplay(req.bloodcomponent);

                    return (
                      <tr key={req.requestid} className="hover:bg-slate-50/70 transition-colors">
                        {/* Patient info */}
                        <td className="py-4 px-5">
                          <div className="font-bold text-[#053845]">{req.patientname}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {req.patientage} yrs • {req.patientgender}
                          </div>
                        </td>

                        {/* Blood group & component */}
                        <td className="py-4 px-5">
                          <div className="inline-flex items-center gap-1.5 font-bold text-[#B94F30]">
                            <Droplet className="w-3.5 h-3.5 fill-current" />
                            <span>{bloodGroupDisplay}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {componentDisplay}
                          </div>
                        </td>

                        {/* Units */}
                        <td className="py-4 px-5 font-semibold text-slate-700">
                          {req.unitsrequired} {req.unitsrequired === 1 ? "unit" : "units"}
                        </td>

                        {/* Urgency */}
                        <td className="py-4 px-5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] border ${urgencyMeta.badgeClass}`}
                          >
                            {urgencyMeta.label}
                          </span>
                        </td>

                        {/* Required By */}
                        <td className="py-4 px-5 text-slate-600">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDate(req.requiredby)}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Posted {formatTimeAgo(req.createdat)}
                          </span>
                        </td>

                        {/* Current Status */}
                        <td className="py-4 px-5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                            <span>{statusMeta.label}</span>
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-4 px-5 text-right">
                          <Link
                            href="/requester/requests"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#245964] hover:underline"
                          >
                            <span>Track</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Empty State */
            <div className="py-14 px-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#B94F30] flex items-center justify-center mx-auto shadow-2xs">
                <Droplet className="w-7 h-7 fill-current opacity-80" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  {filter === "all" ? "No blood requests raised yet" : `No ${filter} requests`}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {filter === "all"
                    ? "When you submit a clinical blood requisition, its real-time matching status, blood bank reservations, and donor volunteer logs will be tracked here."
                    : "No requests found matching this filter criteria."}
                </p>
              </div>

              {filter === "all" && (
                <div className="pt-2">
                  <Link
                    href="/requester/create-request"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-xs hover:shadow transition-all"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Raise Your First Blood Request</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Table Footer */}
          {filteredRequests.length > 0 && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">
                Showing {filteredRequests.length} recent requisition{filteredRequests.length === 1 ? "" : "s"}
              </span>
              <Link
                href="/requester/requests"
                className="inline-flex items-center gap-1.5 font-semibold text-[#317786] hover:text-[#245964] hover:underline"
              >
                <span>View all requisitions in tracking view</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
