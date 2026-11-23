"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  ArrowLeft,
  Calendar,
  Clock,
  Droplets,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  Building2,
  Phone,
  ShieldAlert,
  HelpCircle,
  BookOpen,
  Send,
  Ban,
  Loader2,
  ExternalLink,
  History,
  Info,
} from "lucide-react";
import {
  api,
  SurgeryPlanItem,
  SurgeryAvailabilityResult,
} from "@/lib/api";
import { formatDate } from "@/lib/mappers";

function formatStatus(status: string) {
  switch (status) {
    case "PLANNED":
      return { label: "Planned", badge: "bg-slate-100 text-slate-700 border-slate-300" };
    case "REQUIREMENT_ESTIMATED":
      return { label: "Estimate Ready", badge: "bg-sky-50 text-sky-700 border-sky-300" };
    case "AWAITING_CLINICAL_REVIEW":
      return { label: "Needs Clinical Review", badge: "bg-amber-50 text-amber-800 border-amber-300" };
    case "BLOOD_AVAILABLE":
      return { label: "Stock Eligible", badge: "bg-emerald-50 text-emerald-700 border-emerald-300" };
    case "SHORTAGE_IDENTIFIED":
      return { label: "Shortage Identified", badge: "bg-rose-50 text-rose-700 border-rose-300" };
    case "BLOOD_REQUESTED":
      return { label: "Requisition Active", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "READY_FOR_SURGERY":
      return { label: "Ready For Surgery", badge: "bg-emerald-100 text-emerald-800 border-emerald-400" };
    case "COMPLETED":
      return { label: "Completed", badge: "bg-gray-100 text-gray-600 border-gray-200" };
    case "CANCELLED":
      return { label: "Cancelled", badge: "bg-stone-100 text-stone-500 border-stone-200" };
    default:
      return { label: status, badge: "bg-slate-100 text-slate-700 border-slate-300" };
  }
}

export default function SurgeryPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const surgeryId = resolvedParams.id;

  const [plan, setPlan] = useState<SurgeryPlanItem | null>(null);
  const [availability, setAvailability] = useState<SurgeryAvailabilityResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingStock, setIsCheckingStock] = useState(false);
  const [isSubmittingRequisition, setIsSubmittingRequisition] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Clinical Review Form State
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [finalComponent, setFinalComponent] = useState("RBC");
  const [finalUnits, setFinalUnits] = useState(2);
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const fetchPlan = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.hospital.surgeries.getById(surgeryId);
      if (res.success && res.data) {
        setPlan(res.data);
        if (res.data.finalcomponent) {
          setFinalComponent(res.data.finalcomponent);
        } else if (res.data.baselinecomponent) {
          setFinalComponent(res.data.baselinecomponent);
        }
        if (res.data.finalunits !== null) {
          setFinalUnits(res.data.finalunits);
        } else if (res.data.baselineunits !== null) {
          setFinalUnits(res.data.baselineunits);
        }
      }
    } catch (err: any) {
      console.error("Error loading surgery plan:", err);
      setError(err?.message || "Failed to load surgery plan details.");
    } finally {
      setIsLoading(false);
    }
  }, [surgeryId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Check live availability
  const handleCheckAvailability = async () => {
    setIsCheckingStock(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await api.hospital.surgeries.checkAvailability(surgeryId);
      if (res.success && res.data) {
        setAvailability(res.data);
        // Refresh plan to reflect new status
        await fetchPlan();
      }
    } catch (err: any) {
      console.error("Error checking availability:", err);
      setError(err?.message || "Failed to check inventory availability.");
    } finally {
      setIsCheckingStock(false);
    }
  };

  // Submit clinical review
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentReason.trim()) {
      setError("Clinical adjustment reason / justification is required for audit signoff.");
      return;
    }

    setIsSubmittingReview(true);
    setError(null);
    try {
      const res = await api.hospital.surgeries.review(surgeryId, {
        finalcomponent: finalComponent,
        finalunits: Number(finalUnits),
        adjustmentreason: adjustmentReason.trim(),
      });
      if (res.success) {
        setActionSuccess("Clinical review and requirement approval recorded successfully.");
        setShowReviewForm(false);
        await fetchPlan();
      }
    } catch (err: any) {
      console.error("Error saving clinical review:", err);
      setError(err?.message || "Failed to submit clinical review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Create requisition for shortage
  const handleCreateRequisition = async () => {
    if (!confirm("Are you sure you want to initiate a formal blood requisition for this surgery?")) {
      return;
    }

    setIsSubmittingRequisition(true);
    setError(null);
    try {
      const res = await api.hospital.surgeries.createRequest(surgeryId);
      if (res.success) {
        setActionSuccess("Blood requisition initiated successfully. Connected to regional blood banks.");
        await fetchPlan();
      }
    } catch (err: any) {
      console.error("Error creating requisition:", err);
      setError(err?.message || "Failed to initiate blood requisition.");
    } finally {
      setIsSubmittingRequisition(false);
    }
  };

  // Cancel surgery plan
  const handleCancelPlan = async () => {
    if (!cancelReason.trim()) {
      setError("Cancellation reason is mandatory.");
      return;
    }

    setIsCancelling(true);
    setError(null);
    try {
      const res = await api.hospital.surgeries.cancel(surgeryId, cancelReason.trim());
      if (res.success) {
        setActionSuccess("Surgery plan has been cancelled.");
        setShowCancelModal(false);
        await fetchPlan();
      }
    } catch (err: any) {
      console.error("Error cancelling plan:", err);
      setError(err?.message || "Failed to cancel surgery plan.");
    } finally {
      setIsCancelling(false);
    }
  };

  // Confirm surgical readiness
  const handleConfirmReadiness = async () => {
    if (!confirm("Confirm that pre-operative blood preparations are complete and patient is ready for surgery?")) {
      return;
    }
    setError(null);
    try {
      const res = await api.hospital.surgeries.confirmReadiness(
        surgeryId,
        "Pre-operative blood readiness verified by hospital clinical team."
      );
      if (res.success) {
        setActionSuccess("Surgery plan confirmed ready for surgery.");
        await fetchPlan();
      }
    } catch (err: any) {
      console.error("Error confirming readiness:", err);
      setError(err?.message || "Failed to confirm surgery readiness.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] flex items-center justify-center p-8">
        <div className="text-center text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-[#317786]" />
          <p className="text-sm">Loading surgery plan details...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] p-8">
        <div className="max-w-xl mx-auto bg-white border border-[#F3E9D1] rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-serif font-bold text-[#053845]">Surgery Plan Not Found</h2>
          <p className="text-sm text-slate-600 mt-1 mb-6">
            The requested surgery plan could not be located or you lack access permission.
          </p>
          <Link
            href="/hospital/surgeries"
            className="px-5 py-2.5 rounded-lg bg-[#317786] text-white text-sm font-medium hover:bg-[#286370]"
          >
            Back to Surgeries
          </Link>
        </div>
      </div>
    );
  }

  const statusInfo = formatStatus(plan.status);
  const isTerminal = plan.status === "COMPLETED" || plan.status === "CANCELLED";

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-24">
      {/* Top Header */}
      <div className="bg-white border-b border-[#F3E9D1]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <Link
                href="/hospital/surgeries"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:underline mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to All Surgeries</span>
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-serif font-bold text-[#053845]">
                  Surgery: {plan.procedurename}
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.badge}`}
                >
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Case Ref: <span className="font-semibold text-slate-700">{plan.patientreference}</span> •
                Scheduled for {formatDate(plan.scheduleddate)} at{" "}
                {new Date(plan.scheduleddate).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {!isTerminal && (
                <>
                  <button
                    onClick={handleCheckAvailability}
                    disabled={isCheckingStock}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#317786] text-white text-xs font-medium hover:bg-[#286370] shadow-sm transition disabled:opacity-50"
                  >
                    {isCheckingStock ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Droplets className="w-3.5 h-3.5" />
                    )}
                    <span>Check Live Stock</span>
                  </button>

                  {plan.status !== "READY_FOR_SURGERY" &&
                    (plan.status === "BLOOD_AVAILABLE" ||
                      plan.status === "BLOOD_REQUESTED" ||
                      plan.finalunits === 0) && (
                      <button
                        onClick={handleConfirmReadiness}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirm Readiness</span>
                      </button>
                    )}

                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition"
                  >
                    <Ban className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                    <span>Cancel Surgery</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 space-y-6">
        {/* Success Alert */}
        {actionSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-xs text-emerald-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-rose-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Card 1: Patient & Case Overview */}
        <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
            Patient & Surgery Specification
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <span className="text-xs text-slate-400 block">Patient Reference</span>
              <span className="font-semibold text-[#053845] mt-0.5 block">
                {plan.patientreference}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Demographics</span>
              <span className="font-semibold text-[#053845] mt-0.5 block">
                {plan.patientage} yrs • {plan.patientgender}
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">ABO/Rh Blood Group</span>
              <div className="mt-1">
                {plan.patientbloodgroup ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <Droplets className="w-3 h-3" />
                    {plan.patientbloodgroup.replace("_POSITIVE", "+").replace("_NEGATIVE", "-")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-300">
                    <HelpCircle className="w-3 h-3" />
                    Typing Pending
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 block">Expected Duration</span>
              <span className="font-semibold text-[#053845] mt-0.5 block">
                {plan.expecteddurationminutes ? `${plan.expecteddurationminutes} mins` : "Standard"}
              </span>
            </div>
          </div>

          {plan.clinicalnotes && (
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
              <span className="font-semibold text-slate-700">Pre-Op Clinical Notes: </span>
              {plan.clinicalnotes}
            </div>
          )}
        </div>

        {/* Card 2: Clinical Blood Requirement & Clinical Signoff */}
        <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#317786]" />
              <h2 className="text-base font-serif font-bold text-[#053845]">
                Clinical Blood Requirement & Guidelines
              </h2>
            </div>

            {!isTerminal && !showReviewForm && (
              <button
                onClick={() => setShowReviewForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#317786] text-[#317786] hover:bg-[#317786]/10 text-xs font-semibold transition"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>{plan.reviewedat ? "Modify Clinical Signoff" : "Perform Clinical Signoff"}</span>
              </button>
            )}
          </div>

          {/* Baseline vs Approved Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* MSBOS Baseline */}
            <div className="bg-[#FAF8F5] border border-[#F3E9D1] rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Approved MSBOS Baseline
              </span>
              {plan.baselineunits !== null ? (
                <div className="mt-2">
                  <div className="text-xl font-serif font-bold text-[#053845]">
                    {plan.baselineunits} unit(s) of {plan.baselinecomponent}
                    {plan.secondarybaselineunits ? ` + ${plan.secondarybaselineunits} ${plan.secondarybaselinecomponent}` : ""}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    {plan.baselinerationale}
                  </p>
                </div>
              ) : (
                <div className="mt-2 text-xs text-amber-700 italic">
                  Estimate unavailable – Clinical review required. No verified guideline matched this procedure.
                </div>
              )}

              {plan.procedureconfig && (
                <div className="mt-3 pt-3 border-t border-[#F3E9D1] text-[11px] text-slate-500 space-y-0.5">
                  <div>
                    <span className="font-semibold text-slate-700">Source: </span>
                    {plan.procedureconfig.guidelinesource} (v{plan.procedureconfig.guidelineversion})
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Authority: </span>
                    {plan.procedureconfig.approvalauthority}
                  </div>
                </div>
              )}
            </div>

            {/* Approved Final Requirement */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Final Approved Clinical Requirement
              </span>
              {plan.finalunits !== null ? (
                <div className="mt-2">
                  <div className="text-xl font-serif font-bold text-emerald-800 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>
                      {plan.finalunits} unit(s) of {plan.finalcomponent}
                    </span>
                  </div>
                  {plan.adjustmentreason && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      <span className="font-semibold text-slate-700">Clinical Reason: </span>
                      {plan.adjustmentreason}
                    </p>
                  )}
                  {plan.reviewedby && (
                    <div className="text-[11px] text-slate-500 mt-2">
                      Approved by <span className="font-medium text-slate-700">{plan.reviewedby.name}</span> on{" "}
                      {plan.reviewedat ? new Date(plan.reviewedat).toLocaleDateString() : ""}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <span className="inline-block px-2.5 py-1 rounded bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200">
                    Awaiting Authorized Clinician Review
                  </span>
                  <p className="text-xs text-slate-500 mt-1.5">
                    Click &ldquo;Perform Clinical Signoff&rdquo; to record approved units and medical justification.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Clinical Review Drawer / Form */}
          {showReviewForm && (
            <form
              onSubmit={handleReviewSubmit}
              className="mt-6 p-5 rounded-xl bg-slate-50 border border-slate-300"
            >
              <h3 className="text-sm font-semibold text-[#053845] mb-3 flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#317786]" />
                <span>Authorized Clinical Review & Requirement Approval</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approved Component <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={finalComponent}
                    onChange={(e) => setFinalComponent(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="RBC">Red Blood Cells (RBC)</option>
                    <option value="WHOLE_BLOOD">Whole Blood</option>
                    <option value="PLASMA">Plasma (FFP)</option>
                    <option value="PLATELETS">Platelets</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approved Units Required <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    required
                    value={finalUnits}
                    onChange={(e) => setFinalUnits(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Set 0 for Type & Screen without advance crossmatch.
                  </span>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Clinical Justification / Reason <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Approved standard 2 units RBC for elective CABG; baseline coagulopathy evaluated."
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Required for medical audit log compliance.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowReviewForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#317786] text-white text-xs font-semibold hover:bg-[#286370] disabled:opacity-50"
                >
                  {isSubmittingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Sign & Save Approval</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Card 3: Live Blood Bank Availability & Shortage Resolution */}
        <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-[#317786]" />
              <h2 className="text-base font-serif font-bold text-[#053845]">
                Live Inventory Availability & Readiness Check
              </h2>
            </div>

            <button
              onClick={handleCheckAvailability}
              disabled={isCheckingStock || isTerminal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#317786] text-[#317786] hover:bg-[#317786]/10 text-xs font-semibold transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStock ? "animate-spin" : ""}`} />
              <span>Refresh Stock Snapshot</span>
            </button>
          </div>

          {/* Prominent Non-Reservation Disclaimer (Refinement 4) */}
          <div className="mb-4 p-3 rounded-lg bg-[#FAF8F5] border border-[#F3E9D1] text-[11px] text-slate-600 flex items-start gap-2">
            <Info className="w-4 h-4 text-[#317786] shrink-0 mt-0.5" />
            <p>
              <span className="font-semibold text-slate-700">Live Inventory Notice: </span>
              Displaying live available units across connected blood banks satisfying medical safety
              filters (<code className="text-[10px] bg-white px-1 rounded">AVAILABLE</code> status,{" "}
              <code className="text-[10px] bg-white px-1 rounded">PASSED</code> TTI infectious screening,
              unexpired on scheduled surgery date).{" "}
              <strong className="text-slate-800">
                These units are NOT reserved. To guarantee unit readiness, request blood or initiate clinical reservation.
              </strong>
            </p>
          </div>

          {/* Condition A: Blood Typing Pending (Refinement 3) */}
          {!plan.patientbloodgroup ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-800">
                <HelpCircle className="w-4 h-4 text-amber-600" />
                <span>Patient ABO/Rh Typing is Pending</span>
              </div>
              <p className="text-xs text-amber-800/90 mt-1">
                In accordance with clinical transfusion safety standards, donor compatibility and unit
                availability cannot be evaluated until pre-operative ABO/Rh typing is confirmed. Zero units
                are claimed compatible.
              </p>
            </div>
          ) : availability ? (
            /* Condition B: Stock Availability Evaluated */
            <div>
              {/* Shortage or Adequate Banner */}
              {availability.isShortage ? (
                <div className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-300">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-rose-900 text-sm">
                          Shortage Identified: Deficit of {availability.shortageUnits} unit(s)
                        </h4>
                        <p className="text-xs text-rose-800/80 mt-0.5">
                          Required: {availability.unitsRequired} unit(s) • Total Eligible Stock Across Blood Banks:{" "}
                          <span className="font-semibold">{availability.totalAvailable} unit(s)</span>.
                        </p>
                      </div>
                    </div>

                    {!plan.linkedrequestid && !isTerminal && (
                      <button
                        onClick={handleCreateRequisition}
                        disabled={isSubmittingRequisition}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-xs font-semibold shadow-sm transition disabled:opacity-50 shrink-0"
                      >
                        {isSubmittingRequisition ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span>Initiate Blood Requisition</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-5 p-4 rounded-xl bg-emerald-50 border border-emerald-300">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-emerald-900 text-sm">
                        Adequate Compatible Units Available Across Blood Banks
                      </h4>
                      <p className="text-xs text-emerald-800/80 mt-0.5">
                        Found {availability.totalAvailable} eligible unit(s) satisfying scheduled surgery date requirements.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Facility Breakdown */}
              {availability.bloodBankBreakdown.length > 0 ? (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Blood Bank Facilities with Compatible Stock
                  </h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {availability.bloodBankBreakdown.map((bank) => (
                      <div
                        key={bank.bloodbankid}
                        className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition"
                      >
                        <div>
                          <div className="font-semibold text-sm text-[#053845] flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-[#317786]" />
                            <span>{bank.bloodbankname}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {bank.address}
                          </div>
                          {bank.contactPhone && (
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <span>{bank.contactPhone}</span>
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs text-slate-500 block">Eligible Units</span>
                          <span className="text-lg font-bold text-[#317786]">
                            {bank.eligibleUnitsCount}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 text-slate-600 text-xs text-center border border-slate-200">
                  No eligible compatible units found in connected blood banks for this date.
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-xs text-slate-600 mb-3">
                Live availability check has not been run for this session yet.
              </p>
              <button
                onClick={handleCheckAvailability}
                disabled={isCheckingStock}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#317786] text-white text-xs font-semibold hover:bg-[#286370]"
              >
                {isCheckingStock ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Droplets className="w-3.5 h-3.5" />
                )}
                <span>Check Live Stock Now</span>
              </button>
            </div>
          )}

          {/* Linked Requisition Card (Refinement 5) */}
          {plan.linkedrequest && (
            <div className="mt-5 p-4 rounded-xl bg-indigo-50 border border-indigo-200">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider block">
                    Formal Requisition Active
                  </span>
                  <span className="text-sm font-bold text-indigo-950 mt-0.5 block">
                    Request #{plan.linkedrequest.requestid.slice(0, 8)} • Status: {plan.linkedrequest.status}
                  </span>
                  <span className="text-xs text-indigo-700/80 mt-0.5 block">
                    {plan.linkedrequest.unitsrequired} unit(s) requested for scheduled surgery.
                  </span>
                </div>

                <Link
                  href="/hospital/requests"
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition shrink-0"
                >
                  <span>View in Requests</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Card 4: Audit Trail & Status History (Refinements 6 & 7) */}
        {plan.statushistory && plan.statushistory.length > 0 && (
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-[#317786]" />
              <span>Audit Trail & Lifecycle History</span>
            </h2>

            <div className="space-y-3">
              {plan.statushistory.map((h) => (
                <div
                  key={h.historyid}
                  className="flex items-start gap-3 text-xs border-l-2 border-[#317786] pl-3 py-1"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-[#053845]">
                      Transitioned to <span className="text-[#317786]">{h.newstatus}</span>
                      {h.oldstatus ? ` (from ${h.oldstatus})` : ""}
                    </div>
                    {h.reason && (
                      <p className="text-slate-600 mt-0.5">{h.reason}</p>
                    )}
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(h.createdat).toLocaleString()}
                      {h.changedby && ` • ${h.changedby.name} (${h.changedby.role})`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cancel Surgery Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200">
            <h3 className="text-lg font-serif font-bold text-[#053845] mb-2">
              Cancel Surgery Plan
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Please enter the clinical reason for cancelling this surgery plan. This will be preserved in the audit log.
            </p>

            <textarea
              rows={3}
              required
              placeholder="e.g. Surgery postponed by surgeon; patient hemodynamically unstable, etc."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-4"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleCancelPlan}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50"
              >
                {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
