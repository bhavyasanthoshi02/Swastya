"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Activity,
  Loader2,
  Plus,
  Sparkles,
  Users,
  Upload,
  FileText,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import { AuthHospital } from "@/lib/auth";
import { formatDate } from "@/lib/mappers";

interface DashboardMetrics {
  totalRequests: number;
  emergencyRequests: number;
  fulfilledRequests: number;
  recentRequests: BloodRequestItem[];
}

export default function HospitalDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [hospital, setHospital] = useState<AuthHospital | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = useCallback(async (background = false) => {
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const [dashRes, profileRes] = await Promise.allSettled([
        api.hospital.getDashboard(),
        api.hospital.getProfile(),
      ]);

      if (dashRes.status === "fulfilled" && dashRes.value && dashRes.value.success) {
        setMetrics({
          totalRequests: dashRes.value.totalRequests ?? 0,
          emergencyRequests: dashRes.value.emergencyRequests ?? 0,
          fulfilledRequests: dashRes.value.fulfilledRequests ?? 0,
          recentRequests: dashRes.value.recentRequests || [],
        });
      } else if (dashRes.status === "rejected") {
        const err = dashRes.reason;
        if (err?.status !== 404) {
          setError(err?.message || "Failed to load dashboard metrics");
        }
      }

      if (profileRes.status === "fulfilled" && profileRes.value && profileRes.value.success) {
        setHospital(profileRes.value.hospital);
      }
    } catch (err: any) {
      setError(err?.message || "Network error. Failed to load clinical dashboard data.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading clinical facility dashboard...</p>
      </div>
    );
  }

  const pendingRequests = Math.max(
    0,
    (metrics?.totalRequests ?? 0) - (metrics?.fulfilledRequests ?? 0)
  );

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Hero Welcome & Vital Readiness Bar (mirrors Donor and Requester hero layout) */}
      <section className="bg-gradient-to-br from-[#053845] via-[#0b4d5e] to-[#053845] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Ambient background glow orbs */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#EFA27E]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-1/3 -top-10 w-48 h-48 bg-[#317786]/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-[#EFA27E]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Accredited Clinical Blood Care Partner</span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
              {hospital?.hospitalname || "Hospital Facility"}
            </h1>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Clinical coordination desk active for{" "}
              <strong className="text-white font-bold">{hospital?.city || "Regional Network"}</strong>. License:{" "}
              <strong className="font-mono text-[#EFA27E]">{hospital?.registrationnumber || "VERIFIED"}</strong>.
              Currently coordinating{" "}
              <strong className="text-white font-bold">
                {pendingRequests} active {pendingRequests === 1 ? "blood requisition" : "blood requisitions"}
              </strong>.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-3 shrink-0">
            <Link
              href="/hospital/requests/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-[1.02] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Blood Request</span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadDashboardData(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-all cursor-pointer disabled:opacity-50"
                title="Refresh dashboard stats"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <span className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hospital?.approvalstatus === "VERIFIED"
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-amber-400"
                  }`}
                />
                <span>{hospital?.approvalstatus === "VERIFIED" ? "Verified Facility" : "Verification Pending"}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 4 Vital Quick Stats Bar */}
        <div className="relative z-10 mt-6 pt-6 border-t border-white/15 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Droplets className="w-3 h-3 text-[#EFA27E]" />
              Total Assigned
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-white">
              {metrics?.totalRequests ?? 0}
            </div>
            <p className="text-[11px] text-slate-300">All requisitions on file</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-300" />
              Emergency Requisitions
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-rose-300">
              {metrics?.emergencyRequests ?? 0}
            </div>
            <p className="text-[11px] text-slate-300">High / Critical urgency</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-300" />
              Transfusions Fulfilled
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-300">
              {metrics?.fulfilledRequests ?? 0}
            </div>
            <p className="text-[11px] text-slate-300">Completed transfusion cycles</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Activity className="w-3 h-3 text-[#EFA27E]" />
              In Coordination
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-white">
              {pendingRequests}
            </div>
            <p className="text-[11px] text-slate-300">Review / Matching / Arranged</p>
          </div>
        </div>
      </section>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong>Error loading clinical metrics:</strong> {error}
            <button
              onClick={() => loadDashboardData()}
              className="ml-2 font-semibold underline hover:text-rose-900 cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Left Column (2 Cols): Recent Assigned Requisitions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
            <div className="p-6 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#B94F30] animate-pulse" />
                  <span className="text-xs font-bold text-[#B94F30] uppercase tracking-wider">
                    Transfusion Pipeline
                  </span>
                </div>
                <h2 className="font-serif text-xl font-bold text-[#053845]">
                  Recent Blood Requisitions
                </h2>
              </div>
              <Link
                href="/hospital/requests"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>View all ({metrics?.totalRequests ?? 0})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* List / Empty State */}
            {!metrics?.recentRequests || metrics.recentRequests.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
                  <Droplets className="w-7 h-7" />
                </div>
                <h3 className="text-base font-serif font-bold text-[#053845]">No requisitions assigned yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                  When patients or attending doctors raise a blood request for this facility, or when you create a request, it will appear here for coordination.
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
                {metrics.recentRequests.map((req) => (
                  <div
                    key={req.requestid}
                    className="p-5 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      {/* Blood Group Badge */}
                      <div className="w-12 h-12 rounded-2xl bg-[#B94F30]/10 border border-[#B94F30]/25 text-[#B94F30] flex flex-col items-center justify-center font-serif text-base font-bold shrink-0 shadow-2xs">
                        <span className="leading-none">{req.bloodgroup}</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-[#053845]">
                            {req.patientname}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                            REQ #{req.requestid.slice(0, 8)}
                          </span>
                          {req.isemergency && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700 uppercase flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Emergency</span>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                          <span>Required: <strong className="text-slate-700">{req.unitsrequired} unit(s)</strong></span>
                          <span>&bull;</span>
                          <span>Component: <span className="capitalize">{req.bloodcomponent.toLowerCase().replace(/_/g, " ")}</span></span>
                          <span>&bull;</span>
                          <span>Needed by: {formatDate(req.requiredby)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
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
                      <Link
                        href={`/hospital/requests/${req.requestid}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#053845] hover:text-white border border-[#F3E9D1] transition-all shadow-2xs"
                        title="Review requisition"
                      >
                        <span>Manage</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Registry & Facility Credentials */}
        <div className="space-y-6">
          {/* Donor Registry & Import Portal Card */}
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#e8f3f5] border border-[#317786]/25 flex items-center justify-center text-[#317786]">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-sm font-bold text-[#053845]">Donor Registry</h3>
                <p className="text-[11px] text-slate-500">Facility roster & legacy records</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Upload legacy donor spreadsheets, verify historical donation records, and activate voluntary donors in your catchment area.
            </p>

            <div className="space-y-2 pt-1">
              <Link
                href="/hospital/donors"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
              >
                <Users className="w-4 h-4 text-[#317786]" />
                <span>Open Donor Registry</span>
              </Link>
              <Link
                href="/hospital/donors?action=import"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs"
              >
                <Upload className="w-4 h-4" />
                <span>Bulk Import Donors</span>
              </Link>
            </div>
          </div>

          {/* Facility Credentials Card */}
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#F3E9D1]/70 mb-4">
              <h2 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#317786]" />
                <span>Facility Credentials</span>
              </h2>
              <Link
                href="/hospital/profile"
                className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                Edit
              </Link>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Facility Name
                </span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {hospital?.hospitalname || "Not Specified"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Registration / License
                </span>
                <span className="font-mono text-slate-800 mt-0.5 block">
                  {hospital?.registrationnumber || "Pending"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Clinical Representative
                </span>
                <span className="text-slate-800 mt-0.5 block font-medium">
                  {hospital?.contactpersonname || "Medical Officer"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Address
                </span>
                <span className="text-slate-600 mt-0.5 block leading-relaxed">
                  {hospital?.address ? `${hospital.address}, ${hospital.city}, ${hospital.state} - ${hospital.pincode}` : "Address pending"}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Notice Card */}
          <div className="bg-[#FAF6EE] rounded-3xl border border-[#F3E9D1] p-5 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 text-[#053845] font-semibold">
              <ShieldCheck className="w-4 h-4 text-[#317786]" />
              <span>Transfusion Verification Rule</span>
            </div>
            <p className="leading-relaxed text-[11px] text-slate-600">
              Transfusions can only be marked <strong>FULFILLED</strong> after the physical cross-match and infusion are verified by attending facility staff.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
