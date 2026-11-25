"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Tent,
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Ban,
  FileCheck2,
  Globe,
  Loader2,
  Lock,
  Unlock,
  History,
} from "lucide-react";
import { api, DonationCampItem } from "@/lib/api";

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

export default function BloodBankCampDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const campId = resolvedParams.id;

  const [camp, setCamp] = useState<DonationCampItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals & Action States
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTogglingReg, setIsTogglingReg] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const fetchCamp = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.bloodbank.camps.getById(campId);
      if (res.success && res.data) {
        setCamp(res.data);
      }
    } catch (err: any) {
      console.error("Error loading camp:", err);
      setError(err?.message || "Failed to load camp details.");
    } finally {
      setIsLoading(false);
    }
  }, [campId]);

  useEffect(() => {
    fetchCamp();
  }, [fetchCamp]);

  // Actions
  const handlePublish = async () => {
    setIsPublishing(true);
    setActionSuccess(null);
    try {
      const res = await api.bloodbank.camps.publish(campId);
      if (res.success) {
        setActionSuccess("Camp successfully published and discoverable by community donors.");
        fetchCamp();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to publish camp");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleToggleRegistration = async (newStatus: "OPEN" | "CLOSED") => {
    setIsTogglingReg(true);
    setActionSuccess(null);
    try {
      const res = await api.bloodbank.camps.toggleRegistrationStatus(campId, {
        status: newStatus,
        reason: `Registration ${newStatus.toLowerCase()} by organizer.`,
      });
      if (res.success) {
        setActionSuccess(`Registration status updated to ${newStatus}.`);
        fetchCamp();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update registration status");
    } finally {
      setIsTogglingReg(false);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Are you sure you want to mark this donation camp as COMPLETED? No further registrations will be accepted.")) {
      return;
    }
    setIsCompleting(true);
    setActionSuccess(null);
    try {
      const res = await api.bloodbank.camps.complete(campId, "Camp concluded successfully.");
      if (res.success) {
        setActionSuccess("Camp marked as COMPLETED.");
        fetchCamp();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to complete camp");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleCancelCamp = async () => {
    if (!cancelReason.trim()) {
      alert("Please provide a cancellation reason.");
      return;
    }
    setIsCancelling(true);
    setActionSuccess(null);
    try {
      const res = await api.bloodbank.camps.cancel(campId, cancelReason.trim());
      if (res.success) {
        setShowCancelModal(false);
        setCancelReason("");
        setActionSuccess("Camp cancelled. Cancellation notices dispatched to registered donors.");
        fetchCamp();
      }
    } catch (err: any) {
      alert(err?.message || "Failed to cancel camp");
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#317786] mx-auto" />
        <p className="text-xs text-slate-500">Loading donation camp details...</p>
      </div>
    );
  }

  if (error || !camp) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="font-serif text-lg font-bold text-[#053845]">Camp Not Found</h2>
          <p className="text-xs text-slate-500">{error || "The requested donation camp could not be retrieved."}</p>
        </div>
        <Link
          href="/bloodbank/camps"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#053845] text-white text-xs font-semibold hover:bg-[#317786] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Camps</span>
        </Link>
      </div>
    );
  }

  const st = formatCampStatus(camp.status);
  const isTerminal = camp.status === "COMPLETED" || camp.status === "CANCELLED";
  const metrics = camp.metrics;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 1. Header with Breadcrumbs & Actions */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href="/bloodbank/camps"
            className="w-10 h-10 rounded-2xl bg-white border border-[#F3E9D1] text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] flex items-center justify-center shrink-0 shadow-2xs transition-colors"
            title="Back to Camp Management"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                {camp.campname}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.badge}`}>
                {st.label}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Organizer: <span className="font-semibold text-slate-700">{camp.organizername}</span> &bull; Contact: {camp.contactperson}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          {!isTerminal && (
            <Link
              href={`/bloodbank/camps/${camp.campid}/edit`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#FAF6EE] text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#317786]" />
              <span>Edit Details</span>
            </Link>
          )}

          <Link
            href={`/bloodbank/camps/${camp.campid}/registrations`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Registrations & Attendance</span>
          </Link>
        </div>
      </header>

      {/* Action Success Alert */}
      {actionSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{actionSuccess}</span>
        </div>
      )}

      {/* Main Grid: Details + Sidebar Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Information Details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Schedule & Overview */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
              <Calendar className="w-4 h-4 text-[#317786]" />
              <span>Camp Schedule & Timings</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Drive Date
                </span>
                <span className="font-serif text-base font-bold text-[#053845] mt-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#317786]" />
                  {new Date(camp.campdate).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Operating Window
                </span>
                <span className="font-serif text-base font-bold text-[#053845] mt-1 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#317786]" />
                  {camp.starttime} - {camp.endtime} ({camp.timezone})
                </span>
              </div>
            </div>

            {camp.description && (
              <div className="pt-3 border-t border-[#F3E9D1]/50">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Description
                </span>
                <p className="text-xs text-slate-700 leading-relaxed">{camp.description}</p>
              </div>
            )}
          </div>

          {/* Venue & Location */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
              <MapPin className="w-4 h-4 text-[#317786]" />
              <span>Venue & Location</span>
            </div>

            <div className="space-y-1 text-xs">
              <h3 className="font-serif text-base font-bold text-[#053845]">{camp.venuename}</h3>
              <p className="text-slate-600">{camp.address}</p>
              <p className="text-slate-500">
                {camp.city}, {camp.district ? `${camp.district}, ` : ""}{camp.state} - {camp.pincode}
              </p>

              {camp.latitude && camp.longitude && (
                <div className="pt-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] font-mono text-slate-600">
                    <span>Lat: {Number(camp.latitude).toFixed(4)}</span>
                    <span>&bull;</span>
                    <span>Lng: {Number(camp.longitude).toFixed(4)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Donor Instructions */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
              <Tent className="w-4 h-4 text-[#317786]" />
              <span>Donor Guidelines & Eligibility</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Preparation Guidelines</span>
                <p className="text-slate-600 bg-[#FAF6EE]/40 p-3 rounded-xl border border-[#F3E9D1]">
                  {camp.donorinstructions || "Hydrate adequately, sleep for at least 6 hours, and have a light meal prior to donation."}
                </p>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Organizer Eligibility Criteria</span>
                <p className="text-slate-600 bg-[#FAF6EE]/40 p-3 rounded-xl border border-[#F3E9D1]">
                  {camp.eligibilitynotes || "Standard blood donor eligibility criteria as mandated by NBTC/DGHS."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Status & Actions Console */}
        <div className="space-y-5">
          {/* Registration Capacity Card */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#F3E9D1]/60">
              <span className="font-serif text-xs font-bold text-[#053845]">Slot Reservations</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  camp.registrationstatus === "OPEN"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {camp.registrationstatus === "OPEN" ? "Registration Open" : "Registration Closed"}
              </span>
            </div>

            {camp.isregistrationrequired ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-serif text-3xl font-bold text-[#053845]">
                    {metrics?.registeredCount || 0}
                  </span>
                  <span className="text-xs text-slate-500">
                    {camp.maxcapacity ? `of ${camp.maxcapacity} slots` : "registrations"}
                  </span>
                </div>

                {camp.maxcapacity && (
                  <div className="w-full bg-[#FAF6EE] rounded-full h-2 overflow-hidden border border-[#F3E9D1]">
                    <div
                      className="h-2 rounded-full bg-[#317786] transition-all"
                      style={{
                        width: `${Math.min(100, ((metrics?.registeredCount || 0) / camp.maxcapacity) * 100)}%`,
                      }}
                    />
                  </div>
                )}

                <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-[#F3E9D1]/50">
                  <div className="flex justify-between">
                    <span>Attended Donors:</span>
                    <span className="font-semibold text-slate-800">{metrics?.attendedCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cancelled Bookings:</span>
                    <span className="font-semibold text-slate-800">{metrics?.cancelledCount || 0}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#F3E9D1] text-[#053845] text-xs">
                <strong>Walk-in Drive:</strong> Advance online booking is optional for this camp.
              </div>
            )}
          </div>

          {/* Management Console */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <h2 className="font-serif text-xs font-bold text-[#053845] pb-2 border-b border-[#F3E9D1]/60">
              Camp Lifecycle Actions
            </h2>

            <div className="space-y-2">
              {camp.status === "DRAFT" && (
                <button
                  type="button"
                  disabled={isPublishing}
                  onClick={handlePublish}
                  className="w-full py-2 px-3 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  <span>Publish to Public Network</span>
                </button>
              )}

              {camp.status === "PUBLISHED" && (
                <>
                  {camp.registrationstatus === "OPEN" ? (
                    <button
                      type="button"
                      disabled={isTogglingReg}
                      onClick={() => handleToggleRegistration("CLOSED")}
                      className="w-full py-2 px-3 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#FAF6EE] text-[#053845] text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#317786]" />
                      <span>Close Registration Early</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isTogglingReg}
                      onClick={() => handleToggleRegistration("OPEN")}
                      className="w-full py-2 px-3 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#FAF6EE] text-[#053845] text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5 text-[#317786]" />
                      <span>Re-open Registration</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isCompleting}
                    onClick={handleComplete}
                    className="w-full py-2 px-3 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#FAF6EE] text-[#053845] text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Conclude & Complete Camp</span>
                  </button>
                </>
              )}

              {!isTerminal && (
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => setShowCancelModal(true)}
                  className="w-full py-2 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5 text-rose-600" />
                  <span>Cancel Donation Camp</span>
                </button>
              )}

              {camp.status === "CANCELLED" && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-xs">
                  <span className="font-semibold block mb-0.5">Camp Cancelled</span>
                  <span>Reason: {camp.cancellationreason || "No reason specified."}</span>
                </div>
              )}

              {camp.status === "COMPLETED" && (
                <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#F3E9D1] text-[#053845] text-xs">
                  <span className="font-semibold block mb-0.5">Camp Completed</span>
                  <span>Drive concluded. Donor attendance recorded.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Camp Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#F3E9D1] space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <Ban className="w-5 h-5" />
              <h3 className="font-serif text-lg font-bold text-[#053845]">Cancel Blood Donation Camp</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Cancelling a camp will notify all registered donors. Please provide an explicit reason.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cancellation Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Unforeseen venue unavailability due to civic maintenance..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl border border-[#F3E9D1] text-slate-600 hover:bg-[#FAF6EE] text-xs font-semibold transition-colors"
              >
                Go Back
              </button>

              <button
                type="button"
                disabled={isCancelling || !cancelReason.trim()}
                onClick={handleCancelCamp}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isCancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
