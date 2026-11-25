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
  ArrowLeft,
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

  // Tab counts
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
    <div className="space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            {counts.upcoming} upcoming {counts.upcoming === 1 ? "commitment" : "commitments"}
          </span>
        )}
      </div>

      {/* Top Header matching Donor Dashboard & Blood Requests */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Tent className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                My Camp Registrations
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                {counts.all} Total
              </span>
            </div>
            <p className="hidden sm:block text-sm text-slate-600">
              View your upcoming schedule, present your registration ticket, or manage voluntary commitments.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
          <Link
            href="/donor/camps"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#317786] hover:bg-[#245964] text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <Tent className="w-4 h-4" />
            <span>Discover More Camps</span>
          </Link>
          <button
            onClick={fetchRegistrations}
            disabled={isLoading}
            className="p-2 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#FAF6EE] text-[#053845] transition-colors shadow-2xs cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Success Notification Alert */}
      {actionSuccessMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs Filter Bar */}
      <div className="flex border-b border-[#317786]/15 space-x-2 sm:space-x-6 overflow-x-auto no-scrollbar">
        {[
          { key: "UPCOMING", label: "Upcoming Camps", count: counts.upcoming },
          { key: "ATTENDED", label: "Attended & Donated", count: counts.attended },
          { key: "CANCELLED", label: "Cancelled", count: counts.cancelled },
          { key: "ALL", label: "All Registrations", count: counts.all },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`pb-3 pt-1 text-xs sm:text-sm font-semibold transition border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                isActive
                  ? "border-[#317786] text-[#053845]"
                  : "border-transparent text-slate-500 hover:text-[#053845]"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-2 py-0.5 text-xs rounded-full ${
                  isActive
                    ? "bg-[#317786]/15 text-[#053845] font-bold"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Registrations List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#317786]" />
          <p className="text-xs font-medium text-slate-500">Loading your camp registrations...</p>
        </div>
      ) : error ? (
        <div className="p-8 max-w-lg mx-auto bg-white rounded-2xl border border-[#F3E9D1] text-center space-y-4 shadow-2xs my-8">
          <div className="w-11 h-11 rounded-xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-serif text-lg font-bold text-[#053845]">
              Unable to Load Registrations
            </h2>
            <p className="text-xs text-slate-600">{error}</p>
          </div>
          <button
            onClick={fetchRegistrations}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="bg-white border border-[#F3E9D1] rounded-2xl p-10 sm:p-14 text-center max-w-lg mx-auto shadow-2xs space-y-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto text-[#317786]">
            <Tent className="w-6 h-6" />
          </div>
          <h3 className="font-serif text-lg font-bold text-[#053845]">
            {activeTab === "UPCOMING"
              ? "No Upcoming Camp Registrations"
              : activeTab === "ATTENDED"
              ? "No Completed Camp Donations Yet"
              : activeTab === "CANCELLED"
              ? "No Cancelled Registrations"
              : "No Camp Registrations Found"}
          </h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            {activeTab === "UPCOMING"
              ? "Explore nearby voluntary blood donation camps and reserve your slot today."
              : "Your camp donation history will appear here once you participate in blood donation camps."}
          </p>
          <div className="pt-2">
            <Link
              href="/donor/camps"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#317786] hover:bg-[#245964] text-white text-xs font-semibold rounded-xl transition shadow-2xs"
            >
              <span>Browse Blood Camps</span>
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

            const campDateFormatted = campDate.toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <div
                key={reg.registrationid}
                className="bg-white border border-[#F3E9D1] rounded-2xl p-5 sm:p-6 transition shadow-2xs hover:shadow-xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left: Camp & Schedule Info */}
                  <div className="space-y-2.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isAttended ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Attended & Donated
                        </span>
                      ) : isRegCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold rounded-full">
                          <CalendarX className="w-3 h-3 text-slate-500" />
                          Registration Cancelled
                        </span>
                      ) : isCampCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#fdf2f2] text-[#A2363A] border border-[#A2363A]/20 text-xs font-semibold rounded-full">
                          Camp Cancelled by Organizer
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full">
                          Registration Confirmed
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1] text-[11px] font-mono font-bold rounded-lg">
                        Ref: {reg.registrationreference}
                      </span>
                      <button
                        onClick={() => handleCopyRef(reg.registrationreference)}
                        className="p-1 text-slate-400 hover:text-[#317786] transition-colors cursor-pointer"
                        title="Copy Reference"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copiedId === reg.registrationreference && (
                        <span className="text-[10px] text-emerald-700 font-bold">Copied!</span>
                      )}
                    </div>

                    <h2 className="font-serif text-lg font-bold text-[#053845] line-clamp-1">
                      {reg.camp.campname}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>{campDateFormatted}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>
                          {reg.camp.starttime} – {reg.camp.endtime}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span className="truncate">
                          {reg.camp.venuename}, {reg.camp.city}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-3">
                      <span>Organized by <strong>{reg.camp.organizername}</strong></span>
                      <span>•</span>
                      <span>{reg.camp.organizingbloodbank}</span>
                      {reg.camp.contactphone && (
                        <>
                          <span>•</span>
                          <a
                            href={`tel:${reg.camp.contactphone}`}
                            className="inline-flex items-center gap-1 text-[#317786] hover:underline"
                          >
                            <Phone className="w-3 h-3" />
                            {reg.camp.contactphone}
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#F3E9D1]/60">
                    {isUpcoming && (
                      <button
                        onClick={() => setCancellingReg(reg)}
                        className="px-3.5 py-2 text-xs font-semibold text-[#A2363A] hover:bg-[#fdf2f2] rounded-xl border border-[#A2363A]/25 transition-colors cursor-pointer"
                      >
                        Cancel Slot
                      </button>
                    )}

                    <Link
                      href={`/donor/camps/${reg.camp.campid}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#317786] hover:bg-[#245964] text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors"
                    >
                      <span>View Camp Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellingReg && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#F3E9D1] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <h3 className="font-serif text-base font-bold text-[#053845]">Cancel Camp Registration</h3>
                </div>
                <button
                  onClick={() => {
                    setCancellingReg(null);
                    setCancelError(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {cancelError && (
                <div className="p-3 bg-[#fdf2f2] border border-[#A2363A]/30 rounded-xl text-xs text-[#A2363A] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cancelError}</span>
                </div>
              )}

              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to cancel your voluntary registration for{" "}
                <strong>{cancellingReg.camp.campname}</strong>. Releasing your slot helps the organizing blood bank allocate medical staff and supplies accurately.
              </p>

              <div className="space-y-2 pt-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Reason for Cancellation
                </label>
                {[
                  "Personal scheduling conflict",
                  "Feeling unwell or health concerns",
                  "Travel or transportation unavailable",
                  "Registered for another camp or recent donation",
                  "Other",
                ].map((reason) => (
                  <label
                    key={reason}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#FAF6EE] text-xs text-slate-700 cursor-pointer transition-colors"
                  >
                    <input
                      type="radio"
                      name="cancelReason"
                      value={reason}
                      checked={cancelReason === reason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="text-[#317786] focus:ring-[#317786] h-3.5 w-3.5"
                    />
                    <span>{reason}</span>
                  </label>
                ))}

                {cancelReason === "Other" && (
                  <input
                    type="text"
                    placeholder="Please specify reason..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full text-xs p-2.5 border border-[#F3E9D1] bg-white rounded-xl focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786] outline-none mt-2"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setCancellingReg(null);
                    setCancelError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-[#FAF6EE] rounded-xl border border-[#F3E9D1] transition-colors cursor-pointer"
                >
                  Keep Registration
                </button>
                <button
                  type="button"
                  disabled={isSubmittingCancel}
                  onClick={handleCancelSubmit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#A2363A] hover:bg-[#852c30] text-white text-xs font-semibold rounded-xl transition shadow-2xs disabled:opacity-50 cursor-pointer"
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
