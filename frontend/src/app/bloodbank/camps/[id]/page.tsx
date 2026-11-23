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
  XCircle,
  RefreshCw,
  Edit3,
  Ban,
  FileCheck2,
  Globe,
  SlidersHorizontal,
  Loader2,
  Lock,
  Unlock,
  History,
  Phone,
  Building,
  ChevronRight,
} from "lucide-react";
import { api, DonationCampItem } from "@/lib/api";

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
        setActionSuccess("Camp successfully published and discoverable by donors.");
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
        setActionSuccess(`Registration status changed to ${newStatus}.`);
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
      <div className="min-h-screen bg-[#FAF6EE] flex items-center justify-center p-6">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-[#053845] mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading camp details...</p>
        </div>
      </div>
    );
  }

  if (error || !camp) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] p-8">
        <div className="max-w-xl mx-auto bg-white rounded-2xl border border-rose-200 p-8 text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">Camp Not Found</h2>
          <p className="text-sm text-slate-500 mt-1">{error || "Unable to retrieve camp details."}</p>
          <Link
            href="/bloodbank/camps"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-xl bg-[#053845] text-white text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Camps</span>
          </Link>
        </div>
      </div>
    );
  }

  const st = formatCampStatus(camp.status);
  const metrics = camp.metrics;
  const isTerminal = camp.status === "COMPLETED" || camp.status === "CANCELLED";

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-24">
      {/* Top Banner */}
      <div className="bg-white border-b border-[#F3E9D1]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/bloodbank/camps"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#053845] transition mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Camp Management</span>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                  <Tent className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-2xl font-bold text-[#053845]">{camp.campname}</h1>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.badge}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Organizer: <span className="font-medium text-slate-700">{camp.organizername}</span> | Contact: {camp.contactperson}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {!isTerminal && (
                <Link
                  href={`/bloodbank/camps/${camp.campid}/edit`}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </Link>
              )}

              <Link
                href={`/bloodbank/camps/${camp.campid}/registrations`}
                className="px-3.5 py-2 rounded-xl bg-[#053845] text-white hover:bg-[#074757] text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-sm"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Registrations & Attendance</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {actionSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview & Schedule Card */}
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100">
                Camp Schedule & Overview
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Camp Date
                  </span>
                  <span className="text-base font-bold text-slate-800 mt-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {new Date(camp.campdate).toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Operational Hours
                  </span>
                  <span className="text-base font-bold text-slate-800 mt-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {camp.starttime} - {camp.endtime} ({camp.timezone})
                  </span>
                </div>
              </div>

              {camp.description && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Description
                  </span>
                  <p className="text-sm text-slate-700 leading-relaxed">{camp.description}</p>
                </div>
              )}
            </div>

            {/* Venue & Location Card */}
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Venue & Location</span>
                <span className="text-xs font-normal text-slate-500">
                  {camp.latitude && camp.longitude ? "Coordinates Verified" : "Map Unavailable"}
                </span>
              </h2>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">{camp.venuename}</h3>
                  <p className="text-sm text-slate-600 mt-0.5">{camp.address}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {camp.city}, {camp.district ? `${camp.district}, ` : ""}{camp.state} - {camp.pincode}
                  </p>

                  {camp.latitude && camp.longitude ? (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600">
                      <span>Lat: {Number(camp.latitude).toFixed(4)}</span>
                      <span>•</span>
                      <span>Lng: {Number(camp.longitude).toFixed(4)}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg mt-3 inline-block">
                      Geographic coordinates were not supplied. Distance discovery on Feature 6 will use district/city matching.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Donor Instructions & Eligibility Card */}
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100">
                Donor Instructions & Guidelines
              </h2>

              <div className="space-y-4 text-sm">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Preparation Instructions
                  </span>
                  <p className="text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {camp.donorinstructions || "Standard blood donation preparation applies. Hydrate well and have a light meal."}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Organizer Eligibility Notes
                  </span>
                  <p className="text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {camp.eligibilitynotes || "Standard blood donor eligibility criteria as mandated by NBTC/DGHS."}
                  </p>
                </div>
              </div>
            </div>

            {/* Audit History */}
            {camp.audithistory && camp.audithistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-400" />
                  <span>Audit Trail</span>
                </h2>

                <div className="space-y-3">
                  {camp.audithistory.map((item) => (
                    <div key={item.auditid} className="text-xs border-l-2 border-slate-200 pl-3 py-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{item.action}</span>
                        <span className="text-slate-400">
                          {new Date(item.createdat).toLocaleString("en-IN")}
                        </span>
                      </div>
                      {item.changedby && (
                        <span className="text-slate-500 block mt-0.5">
                          By: {item.changedby.name}
                        </span>
                      )}
                      {item.details && (
                        <p className="text-slate-600 font-mono text-[11px] mt-0.5 break-all">
                          {item.details}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Status & Lifecycle Console */}
          <div className="space-y-6">
            {/* Registration Capacity Card */}
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Capacity & Registration</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  camp.registrationstatus === "OPEN"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-300"
                }`}>
                  {camp.registrationstatus === "OPEN" ? "Registration Open" : "Registration Closed"}
                </span>
              </h2>

              {camp.isregistrationrequired ? (
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-3xl font-extrabold text-[#053845]">
                      {metrics?.registeredCount || 0}
                    </span>
                    <span className="text-xs text-slate-500">
                      {camp.maxcapacity ? `of ${camp.maxcapacity} slots reserved` : "registrations (Unlimited)"}
                    </span>
                  </div>

                  {camp.maxcapacity && (
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-3">
                      <div
                        className={`h-2.5 rounded-full transition-all ${
                          (metrics?.registeredCount || 0) >= camp.maxcapacity
                            ? "bg-rose-500"
                            : (metrics?.registeredCount || 0) / camp.maxcapacity > 0.8
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(100, ((metrics?.registeredCount || 0) / camp.maxcapacity) * 100)}%`,
                        }}
                      />
                    </div>
                  )}

                  <div className="text-xs text-slate-500 space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span>Attended Count:</span>
                      <span className="font-semibold text-slate-800">{metrics?.attendedCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cancelled Registrations:</span>
                      <span className="font-semibold text-slate-800">{metrics?.cancelledCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Registration Window:</span>
                      <span className="font-medium text-slate-700">
                        {new Date(camp.registrationdeadline).toLocaleDateString()} (Deadline)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-800 text-xs">
                  <strong>Walk-in Camp:</strong> Advance registration is not required for this camp.
                </div>
              )}
            </div>

            {/* Lifecycle Action Console */}
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100">
                Organizer Actions
              </h2>

              <div className="space-y-3">
                {camp.status === "DRAFT" && (
                  <button
                    disabled={isPublishing}
                    onClick={handlePublish}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                    <span>Publish Camp to Public</span>
                  </button>
                )}

                {camp.status === "PUBLISHED" && (
                  <>
                    {camp.registrationstatus === "OPEN" ? (
                      <button
                        disabled={isTogglingReg}
                        onClick={() => handleToggleRegistration("CLOSED")}
                        className="w-full py-2.5 px-4 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Close Registration Early</span>
                      </button>
                    ) : (
                      <button
                        disabled={isTogglingReg}
                        onClick={() => handleToggleRegistration("OPEN")}
                        className="w-full py-2.5 px-4 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Re-open Registration</span>
                      </button>
                    )}

                    <button
                      disabled={isCompleting}
                      onClick={handleComplete}
                      className="w-full py-2.5 px-4 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>Mark Camp as COMPLETED</span>
                    </button>
                  </>
                )}

                {!isTerminal && (
                  <button
                    disabled={isCancelling}
                    onClick={() => setShowCancelModal(true)}
                    className="w-full py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancel Camp</span>
                  </button>
                )}

                {camp.status === "CANCELLED" && (
                  <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-xs">
                    <span className="font-semibold block mb-0.5">Camp Cancelled</span>
                    <span>Reason: {camp.cancellationreason || "No reason specified."}</span>
                  </div>
                )}

                {camp.status === "COMPLETED" && (
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-800 text-xs">
                    <span className="font-semibold block mb-0.5">Camp Completed</span>
                    <span>Historical records are permanently archived.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Camp Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#F3E9D1]">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <Ban className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-800">Cancel Blood Donation Camp</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Cancelling a published camp is irreversible and will immediately notify all registered donors. Please provide a clear cancellation reason.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cancellation Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Unforeseen venue unavailability due to civic maintenance..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition"
              >
                Go Back
              </button>

              <button
                type="button"
                disabled={isCancelling || !cancelReason.trim()}
                onClick={handleCancelCamp}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition disabled:opacity-50 flex items-center gap-2"
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
