"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Tent,
  Calendar,
  Clock,
  MapPin,
  Building2,
  Copy,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ArrowRight,
  RefreshCw,
  Phone,
  AlertTriangle,
  Award,
  CalendarX,
  Filter,
} from "lucide-react";
import { api } from "@/lib/api";

interface DonorRegistration {
  registrationid: string;
  registrationreference: string;
  registrationdate: string;
  registrationstatus: "REGISTERED" | "CANCELLED";
  attendancestatus: "PENDING" | "ATTENDED" | "NOT_ATTENDED";
  attendedat?: string | null;
  unitsdonated?: number | null;
  camp: {
    campid: string;
    campname: string;
    organizername: string;
    organizingbloodbank: string;
    campdate: string;
    starttime: string;
    endtime: string;
    venuename: string;
    address: string;
    city: string;
    state: string;
    contactphone?: string | null;
    status: "DRAFT" | "PUBLISHED" | "COMPLETED" | "CANCELLED";
  };
}

export default function DonorMyCampsPage() {
  const [registrations, setRegistrations] = useState<DonorRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab filter
  const [activeTab, setActiveTab] = useState<"ALL" | "UPCOMING" | "ATTENDED" | "CANCELLED">("UPCOMING");

  // Copy reference state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Cancellation modal state
  const [cancellingReg, setCancellingReg] = useState<DonorRegistration | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchRegistrations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.camps.getMyRegistrations();
      if (res.success && Array.isArray(res.data)) {
        setRegistrations(res.data);
      } else {
        setRegistrations([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch donor registrations:", err);
      setError(err?.message || "Failed to load camp registrations.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const handleCopyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedId(ref);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCancelSubmit = async () => {
    if (!cancellingReg) return;

    const finalReason = cancelReason === "Other" ? customReason.trim() : cancelReason.trim();
    if (!finalReason) {
      setCancelError("Please select or enter a cancellation reason.");
      return;
    }

    try {
      setIsSubmittingCancel(true);
      setCancelError(null);

      const res = await api.camps.cancelMyRegistration(cancellingReg.registrationid, finalReason);
      if (res.success) {
        setActionSuccessMessage(`Registration ${cancellingReg.registrationreference} cancelled successfully.`);
        setTimeout(() => setActionSuccessMessage(null), 5000);
        setCancellingReg(null);
        setCancelReason("");
        setCustomReason("");
        fetchRegistrations();
      } else {
        setCancelError(res.message || "Failed to cancel registration.");
      }
    } catch (err: any) {
      console.error("Cancellation error:", err);
      setCancelError(err?.message || "Failed to cancel registration. Please try again.");
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Filter registrations by activeTab
  const filteredRegistrations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return registrations.filter((reg) => {
      const campDate = new Date(reg.camp.campdate);
      campDate.setHours(0, 0, 0, 0);

      if (activeTab === "ALL") return true;

      if (activeTab === "UPCOMING") {
        return (
          reg.registrationstatus === "REGISTERED" &&
          reg.attendancestatus === "PENDING" &&
          reg.camp.status !== "COMPLETED" &&
          reg.camp.status !== "CANCELLED" &&
          campDate.getTime() >= today.getTime()
        );
      }

      if (activeTab === "ATTENDED") {
        return reg.attendancestatus === "ATTENDED";
      }

      if (activeTab === "CANCELLED") {
        return reg.registrationstatus === "CANCELLED" || reg.camp.status === "CANCELLED";
      }

      return true;
    });
  }, [registrations, activeTab]);

  // Counts for tabs
  const counts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let upcoming = 0;
    let attended = 0;
    let cancelled = 0;

    for (const r of registrations) {
      const cDate = new Date(r.camp.campdate);
      cDate.setHours(0, 0, 0, 0);

      if (r.attendancestatus === "ATTENDED") {
        attended++;
      }
      if (r.registrationstatus === "CANCELLED" || r.camp.status === "CANCELLED") {
        cancelled++;
      }
      if (
        r.registrationstatus === "REGISTERED" &&
        r.attendancestatus === "PENDING" &&
        r.camp.status !== "COMPLETED" &&
        r.camp.status !== "CANCELLED" &&
        cDate.getTime() >= today.getTime()
      ) {
        upcoming++;
      }
    }

    return { all: registrations.length, upcoming, attended, cancelled };
  }, [registrations]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-600 mb-1">
            <Tent className="w-4 h-4" />
            <span>Donor Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Camp Registrations
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            View upcoming schedule, present your registration ticket, or manage voluntary camp commitments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/donor/camps"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
          >
            <Tent className="w-4 h-4" />
            Discover More Camps
          </Link>
          <button
            onClick={fetchRegistrations}
            disabled={isLoading}
            className="p-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition shadow-sm"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Filter Bar */}
      <div className="flex border-b border-slate-200 space-x-2 sm:space-x-6 overflow-x-auto no-scrollbar">
        {[
          { key: "UPCOMING", label: "Upcoming Camps", count: counts.upcoming },
          { key: "ATTENDED", label: "Attended & Donated", count: counts.attended },
          { key: "CANCELLED", label: "Cancelled", count: counts.cancelled },
          { key: "ALL", label: "All Registrations", count: counts.all },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`pb-3 pt-1 text-xs sm:text-sm font-semibold transition border-b-2 whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab.key
                ? "border-red-600 text-red-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-2 py-0.5 text-xs rounded-full ${
                activeTab === tab.key
                  ? "bg-red-100 text-red-700 font-bold"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Registrations List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
          <p className="text-sm font-medium">Loading your camp registrations...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-lg mx-auto">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-red-900">{error}</p>
          <button
            onClick={fetchRegistrations}
            className="mt-4 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 transition"
          >
            Try Again
          </button>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-3">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <Tent className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {activeTab === "UPCOMING"
              ? "No Upcoming Camp Registrations"
              : activeTab === "ATTENDED"
              ? "No Completed Camp Donations Yet"
              : activeTab === "CANCELLED"
              ? "No Cancelled Registrations"
              : "No Camp Registrations Found"}
          </h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {activeTab === "UPCOMING"
              ? "Explore nearby voluntary blood donation camps and reserve your slot today."
              : "Your camp donation history will appear here once you participate in blood donation camps."}
          </p>
          <div className="pt-2">
            <Link
              href="/donor/camps"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-sm"
            >
              Browse Blood Camps
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRegistrations.map((reg) => {
            const campDate = new Date(reg.camp.campdate);
            const isCampCancelled = reg.camp.status === "CANCELLED";
            const isRegCancelled = reg.registrationstatus === "CANCELLED";
            const isAttended = reg.attendancestatus === "ATTENDED";
            const isUpcoming =
              !isCampCancelled &&
              !isRegCancelled &&
              !isAttended &&
              reg.camp.status !== "COMPLETED";

            return (
              <div
                key={reg.registrationid}
                className={`bg-white border rounded-2xl p-5 sm:p-6 transition shadow-sm hover:shadow-md ${
                  isAttended
                    ? "border-emerald-200 bg-emerald-50/20"
                    : isRegCancelled || isCampCancelled
                    ? "border-slate-200 opacity-80"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Camp & Schedule Info */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5">
                        Ref: {reg.registrationreference}
                        <button
                          onClick={() => handleCopyRef(reg.registrationreference)}
                          className="text-slate-500 hover:text-slate-900 transition"
                          title="Copy reference"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </span>
                      {copiedId === reg.registrationreference && (
                        <span className="text-[11px] text-emerald-600 font-semibold">
                          Copied!
                        </span>
                      )}

                      {/* Status Badges */}
                      {isAttended ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Attended & Donated ({reg.unitsdonated || 1} Unit)
                        </span>
                      ) : isCampCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">
                          <CalendarX className="w-3.5 h-3.5" />
                          Camp Cancelled by Organizer
                        </span>
                      ) : isRegCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full">
                          Registration Cancelled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Registration Confirmed
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-slate-900">
                      {reg.camp.campname}
                    </h3>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5 font-medium text-slate-800">
                        <Calendar className="w-3.5 h-3.5 text-red-600" />
                        {campDate.toLocaleDateString("en-IN", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {reg.camp.starttime} – {reg.camp.endtime}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {reg.camp.venuename}, {reg.camp.city}
                      </span>

                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        {reg.camp.organizingbloodbank}
                      </span>
                    </div>

                    {isAttended && reg.attendedat && (
                      <p className="text-xs text-emerald-800 font-medium pt-1 flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-emerald-600" />
                        Donation recorded on {new Date(reg.attendedat).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}. Thank you for saving lives!
                      </p>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0 shrink-0">
                    <Link
                      href={`/donor/camps/${reg.camp.campid}`}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition"
                    >
                      View Camp Details
                    </Link>

                    {isUpcoming && (
                      <button
                        onClick={() => {
                          setCancellingReg(reg);
                          setCancelReason("");
                          setCustomReason("");
                          setCancelError(null);
                        }}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl border border-red-200 transition"
                      >
                        Cancel Registration
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancellingReg && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold text-slate-900">
                    Cancel Camp Registration
                  </h3>
                </div>
                <button
                  onClick={() => setCancellingReg(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cancelError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  {cancelError}
                </div>
              )}

              <p className="text-xs text-slate-600 leading-relaxed">
                Are you sure you want to cancel your slot for <strong>{cancellingReg.camp.campname}</strong>? Cancelling frees your slot for other voluntary donors.
              </p>

              {/* Reason Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">
                  Reason for Cancellation:
                </label>
                <div className="space-y-1.5 text-xs">
                  {[
                    "Schedule conflict / Unforeseen personal work",
                    "Feeling unwell / Under medical treatment",
                    "Transportation / Distance issue",
                    "Recently donated blood elsewhere",
                    "Other",
                  ].map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200"
                    >
                      <input
                        type="radio"
                        name="cancelReason"
                        value={r}
                        checked={cancelReason === r}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="text-red-600 focus:ring-red-500 h-3.5 w-3.5"
                      />
                      <span className="text-slate-800">{r}</span>
                    </label>
                  ))}
                </div>

                {cancelReason === "Other" && (
                  <textarea
                    rows={2}
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Please specify reason..."
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none mt-2"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingReg(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Keep Registration
                </button>
                <button
                  type="button"
                  disabled={isSubmittingCancel}
                  onClick={handleCancelSubmit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {isSubmittingCancel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
