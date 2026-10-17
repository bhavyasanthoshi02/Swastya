"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Droplets,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Building2,
  User,
  Calendar,
  FileText,
  Activity,
  ShieldCheck,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Check,
  X,
  ChevronRight,
  Loader2,
  Navigation,
  Car,
  HeartHandshake,
  Info,
  Eye,
  Download,
  History,
  ShieldAlert,
} from "lucide-react";
import { api, BloodRequestItem, RequestStatusHistoryItem, VolunteerDonorResponse } from "@/lib/api";
import { formatDate, formatTimeAgo } from "@/lib/mappers";
import EmergencyBroadcastCard from "@/components/broadcast/EmergencyBroadcastCard";

// Actual Swastya Blood Request status pipeline
const STATUS_STEPS = [
  { key: "CREATED", label: "Requisition Raised", stepNumber: 1 },
  { key: "HOSPITAL_REVIEW", label: "Hospital Review", stepNumber: 2 },
  { key: "BLOOD_BANK_CHECK", label: "Blood Bank Check", stepNumber: 3 },
  { key: "DONOR_MATCHING", label: "Donor Matching", stepNumber: 4 },
  { key: "BLOOD_ARRANGED", label: "Blood Arranged", stepNumber: 5 },
  { key: "FULFILLED", label: "Transfusion Fulfilled", stepNumber: 6 },
];

export default function HospitalRequestDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;

  const [request, setRequest] = useState<BloodRequestItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Status Action Modal State
  const [actionType, setActionType] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [notes, setNotes] = useState("");
  const [fulfillmentConfirmed, setFulfillmentConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Prescription Review State (Phase 2)
  const [prescriptionReviewAction, setPrescriptionReviewAction] = useState<"VERIFIED" | "REJECTED" | null>(null);
  const [prescriptionReviewRemarks, setPrescriptionReviewRemarks] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [showPrescriptionHistory, setShowPrescriptionHistory] = useState(false);

  // Edit Clinical Notes inline state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const fetchRequestDetails = useCallback(async (background = false) => {
    if (!requestId) return;
    try {
      if (!background) setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

      // Backend enforces ownership: checks if authenticated hospital is assigned
      const data = await api.hospital.getRequestDetails(requestId);
      setRequest(data);
      setEditedNotes(data.notes || "");
    } catch (err: any) {
      console.error("Failed to load requisition details:", err);
      if (err?.status === 403) {
        setError("Access Denied: This blood requisition is not assigned to your medical facility.");
      } else if (err?.status === 404) {
        setError("Blood requisition not found. It may have been removed or the ID is invalid.");
      } else {
        setError(err?.message || "Failed to load requisition details. Please check your connection.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchRequestDetails();
  }, [fetchRequestDetails]);

  // Handle status update submission
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || !actionType || isSubmitting) return;

    // Safety constraint: Explicit authorized physical transfusion verification required for FULFILLED
    if (actionType === "FULFILLED" && !fulfillmentConfirmed) {
      setActionError("You must explicitly confirm that the physical transfusion was completed and verified by authorized hospital staff.");
      return;
    }

    // Phase 2 Clinical safety gate: Requester requests cannot advance to BLOOD_ARRANGED or FULFILLED without verified prescription
    if (actionType === "BLOOD_ARRANGED" || actionType === "FULFILLED") {
      if (request?.requesterid && request?.prescription?.status !== "VERIFIED") {
        setActionError(
          `Clinical Safety Gate: Cannot advance requester requisition to ${actionType.replace(/_/g, " ")} without a clinically VERIFIED prescription (Current status: ${request?.prescription?.status || "NONE"}). Please review and verify the prescription document first.`
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setActionError(null);

      const payload: { status: string; remarks?: string; notes?: string } = {
        status: actionType,
      };

      if (remarks.trim()) {
        payload.remarks = remarks.trim();
      }

      if (notes.trim()) {
        payload.notes = notes.trim();
      }

      const res = await api.hospital.updateBloodRequest(requestId, payload);

      setActionSuccess(`Requisition status successfully updated to ${actionType.replace(/_/g, " ")}.`);
      setActionType(null);
      setRemarks("");
      setNotes("");
      setFulfillmentConfirmed(false);

      // Refresh to get full updated state and latest status history
      await fetchRequestDetails(true);

      // Auto-hide success alert after 5 seconds
      setTimeout(() => {
        setActionSuccess(null);
      }, 5000);
    } catch (err: any) {
      console.error("Failed to update status:", err);
      setActionError(err?.message || "Failed to update requisition status. Please review the server requirements.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Prescription Verification / Rejection (Phase 2)
  const handleVerifyPrescription = async (status: "VERIFIED" | "REJECTED") => {
    if (!requestId || isSubmittingReview) return;
    if (status === "REJECTED" && !prescriptionReviewRemarks.trim()) {
      setReviewError("A clear explanation/reason is required when rejecting a prescription.");
      return;
    }

    try {
      setIsSubmittingReview(true);
      setReviewError(null);
      const res = await api.bloodRequests.verifyPrescription(requestId, {
        status,
        remarks: prescriptionReviewRemarks.trim() || undefined,
      });

      if (res && res.success) {
        setReviewSuccess(`Prescription successfully ${status.toLowerCase()}.`);
        setPrescriptionReviewAction(null);
        setPrescriptionReviewRemarks("");
        await fetchRequestDetails(true);
        setTimeout(() => setReviewSuccess(null), 5000);
      }
    } catch (err: any) {
      setReviewError(err?.message || "Failed to submit prescription verification decision.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Handle saving clinical notes without changing status
  const handleSaveNotesOnly = async () => {
    if (!requestId || isSavingNotes) return;
    try {
      setIsSavingNotes(true);
      setActionError(null);

      await api.hospital.updateBloodRequest(requestId, {
        notes: editedNotes.trim(),
        remarks: "Updated clinical notes via hospital coordination portal.",
      });

      setIsEditingNotes(false);
      setActionSuccess("Clinical notes updated successfully.");
      await fetchRequestDetails(true);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error("Failed to update notes:", err);
      setActionError(err?.message || "Failed to save clinical notes.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const currentStatus = request?.status?.toUpperCase() || "CREATED";
  const isTerminal = ["FULFILLED", "CANCELLED", "EXPIRED"].includes(currentStatus);

  // Stepper helper
  const getStepState = (stepKey: string) => {
    if (currentStatus === "CANCELLED") return "cancelled";
    const order = ["CREATED", "HOSPITAL_REVIEW", "BLOOD_BANK_CHECK", "DONOR_MATCHING", "BLOOD_ARRANGED", "FULFILLED"];
    const currentIndex = order.indexOf(currentStatus);
    const stepIndex = order.indexOf(stepKey);

    if (currentIndex === -1) return "upcoming";
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "current";
    return "upcoming";
  };

  // Determine allowed status transitions for Hospital role based on Phase 5.2 rules
  const getAllowedActions = () => {
    if (!request || isTerminal) return [];

    switch (currentStatus) {
      case "CREATED":
      case "VERIFIED":
        return [
          {
            targetStatus: "HOSPITAL_REVIEW",
            title: "Accept for Hospital Review",
            description: "Acknowledge receipt and initiate medical record evaluation.",
            variant: "primary",
          },
          {
            targetStatus: "BLOOD_BANK_CHECK",
            title: "Initiate Blood Bank Check",
            description: "Direct inquiry to internal hospital transfusion service.",
            variant: "secondary",
          },
          {
            targetStatus: "DONOR_MATCHING",
            title: "Open Voluntary Donor Matching",
            description: "Broadcast requisition to eligible volunteer blood donors.",
            variant: "secondary",
          },
          {
            targetStatus: "CANCELLED",
            title: "Reject / Cancel Requisition",
            description: "Unable to process or requisition withdrawn.",
            variant: "danger",
          },
        ];

      case "HOSPITAL_REVIEW":
        return [
          {
            targetStatus: "BLOOD_BANK_CHECK",
            title: "Check Blood Bank Stock",
            description: "Verify cross-match inventory in internal blood bank.",
            variant: "primary",
          },
          {
            targetStatus: "DONOR_MATCHING",
            title: "Open Donor Matching",
            description: "Direct matching with voluntary compatible community donors.",
            variant: "secondary",
          },
          {
            targetStatus: "BLOOD_ARRANGED",
            title: "Units Already Secured",
            description: "Units reserved and ready for cross-match.",
            variant: "secondary",
          },
          {
            targetStatus: "CANCELLED",
            title: "Cancel Requisition",
            description: "Cancel active review with clinical explanation.",
            variant: "danger",
          },
        ];

      case "BLOOD_BANK_CHECK":
        return [
          {
            targetStatus: "BLOOD_ARRANGED",
            title: "Blood Bank Stock Confirmed",
            description: "Required units identified, quarantined, and allocated.",
            variant: "primary",
          },
          {
            targetStatus: "DONOR_MATCHING",
            title: "Stock Depleted — Match Donors",
            description: "Internal supply insufficient; request volunteer community donors.",
            variant: "secondary",
          },
          {
            targetStatus: "CANCELLED",
            title: "Cancel Requisition",
            description: "Requisition cannot be met by facility.",
            variant: "danger",
          },
        ];

      case "DONOR_MATCHING":
        return [
          {
            targetStatus: "BLOOD_ARRANGED",
            title: "Confirm Units Arranged",
            description: "Donation received or replacement units verified and prepped.",
            variant: "primary",
          },
          {
            targetStatus: "CANCELLED",
            title: "Cancel Requisition",
            description: "Cancel donor search with reason.",
            variant: "danger",
          },
        ];

      case "BLOOD_ARRANGED":
        return [
          {
            targetStatus: "FULFILLED",
            title: "Confirm Transfusion & Fulfill",
            description: "Verify physical blood transfusion performed on patient.",
            variant: "success",
          },
          {
            targetStatus: "CANCELLED",
            title: "Cancel Requisition",
            description: "Cancel requisition prior to transfusion.",
            variant: "danger",
          },
        ];

      default:
        return [];
    }
  };

  const allowedActions = getAllowedActions();

  // Loading View
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <span>/</span>
          <div className="h-4 w-40 bg-slate-200 rounded" />
        </div>
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 sm:p-8 space-y-4">
          <div className="h-6 w-48 bg-slate-200 rounded" />
          <div className="h-10 w-72 bg-slate-200 rounded" />
          <div className="h-20 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  // Error / Not Found / Unauthorized View
  if (error || !request) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="font-serif text-lg font-bold text-[#053845]">
            Unable to Display Requisition
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            {error || "The requested requisition record is unavailable or access was denied."}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              href="/hospital/requests"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Assigned Requests</span>
            </Link>
            <button
              type="button"
              onClick={() => fetchRequestDetails()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Query</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-16">
      {/* Breadcrumb Navigation & Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link
            href="/hospital/requests"
            className="hover:text-[#053845] flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Assigned Requisitions</span>
          </Link>
          <span>/</span>
          <span className="font-mono text-slate-700 font-semibold truncate max-w-[200px]">
            {request.requestid}
          </span>
        </div>

        <button
          type="button"
          onClick={() => fetchRequestDetails(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh Details</span>
        </button>
      </div>

      {/* Action Success Toast */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{actionSuccess}</div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header Requisition Card */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-md">
                REQ #{request.requestid.slice(0, 8)}
              </span>
              {request.isemergency && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700 uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Emergency Requisition</span>
                </span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                request.urgencylevel === "CRITICAL"
                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                  : request.urgencylevel === "HIGH"
                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                  : "bg-slate-100 text-slate-700"
              }`}>
                {request.urgencylevel} Urgency
              </span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
              {request.patientname}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-0.5">
              <span>Patient: <strong className="text-slate-800">{request.patientage} yrs</strong> ({request.patientgender})</span>
              <span>&bull;</span>
              <span>Contact: <strong className="text-slate-800">{request.patientcontact}</strong></span>
              <span>&bull;</span>
              <span>Required by: <strong className="text-[#053845]">{formatDate(request.requiredby)}</strong></span>
            </div>
          </div>

          {/* Blood Specs Badge */}
          <div className="flex items-center gap-3 bg-[#FAF6EE] border border-[#F3E9D1] p-3.5 rounded-2xl self-start md:self-center">
            <div className="w-12 h-12 rounded-xl bg-white border border-[#F3E9D1] flex items-center justify-center text-[#B94F30] font-serif text-xl font-bold shrink-0 shadow-2xs">
              {request.bloodgroup}
            </div>
            <div className="space-y-0.5 pr-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Required Units
              </span>
              <span className="font-bold text-slate-800 text-sm block">
                {request.unitsrequired} Unit(s)
              </span>
              <span className="text-[11px] text-slate-500 capitalize block">
                {request.bloodcomponent.toLowerCase().replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>

        {/* Status Stepper */}
        <div className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#053845] uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#317786]" />
              <span>Requisition Pipeline Progression</span>
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              currentStatus === "FULFILLED"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : currentStatus === "CANCELLED"
                ? "bg-slate-100 text-slate-600 border border-slate-200"
                : currentStatus === "BLOOD_ARRANGED"
                ? "bg-teal-50 text-teal-800 border border-teal-200"
                : "bg-[#e8f3f5] text-[#053845] border border-[#317786]/30"
            }`}>
              Current: {currentStatus.replace(/_/g, " ")}
            </span>
          </div>

          {/* Stepper Display */}
          {currentStatus === "CANCELLED" ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
              <X className="w-4 h-4 text-rose-500 shrink-0" />
              <div>
                <strong>Requisition Cancelled:</strong> This blood requisition was cancelled and is in a terminal state.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {STATUS_STEPS.map((step) => {
                const state = getStepState(step.key);
                return (
                  <div
                    key={step.key}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      state === "completed"
                        ? "bg-emerald-50/60 border-emerald-200 text-emerald-800"
                        : state === "current"
                        ? "bg-[#053845] border-[#053845] text-white shadow-xs ring-2 ring-[#317786]/30"
                        : "bg-slate-50/60 border-slate-200 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-center mb-1">
                      {state === "completed" ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                      ) : (
                        <span className={`text-[10px] font-bold ${state === "current" ? "text-teal-200" : "text-slate-400"}`}>
                          0{step.stepNumber}
                        </span>
                      )}
                    </div>
                    <span className="block text-[11px] font-bold leading-tight">
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Clinical Actions, Donor Transit, Requester Info, and Status History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Actions & Voluntary Donor Coordination */}
        <div className="lg:col-span-2 space-y-6">

          {/* Clinical Prescription Verification Card (Phase 2 Hospital Review) */}
          {request.prescription ? (
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#317786]" />
                      <span>Clinical Prescription Review</span>
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                      Transfusion Gate
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Authorized hospital verification required before blood arrangement and fulfillment.
                  </p>
                </div>

                {/* Status Badge */}
                <div>
                  {request.prescription.status === "VERIFIED" && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Clinically Verified</span>
                    </span>
                  )}
                  {request.prescription.status === "PENDING" && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pending Your Verification</span>
                    </span>
                  )}
                  {request.prescription.status === "REJECTED" && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Prescription Rejected</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Review Success Alert */}
              {reviewSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{reviewSuccess}</span>
                </div>
              )}

              {/* Rejection Details Banner */}
              {request.prescription.status === "REJECTED" && (
                <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 text-xs text-rose-800 space-y-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Rejection Reason Recorded:</span>
                  </span>
                  <p className="pl-5 italic text-slate-700">
                    &quot;{request.prescription.remarks || "No detailed remarks provided"}&quot;
                  </p>
                  <p className="pl-5 text-[11px] text-slate-500">
                    The requester has been notified to provide an updated replacement prescription.
                  </p>
                </div>
              )}

              {/* Prescription Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                    Prescribing Doctor
                  </span>
                  <span className="font-bold text-[#053845] block mt-0.5">
                    {request.prescription.doctorname || "Attending Physician"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                    Originating Facility
                  </span>
                  <span className="font-bold text-[#053845] block mt-0.5 truncate">
                    {request.prescription.hospitalname || request.hospitals?.hospitalname || "Prescribing Clinic"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                    File Attachment
                  </span>
                  <span className="font-bold text-[#053845] block mt-0.5 truncate">
                    {request.prescription.originalfilename || "Prescription Document"}
                  </span>
                  {request.prescription.filesize && (
                    <span className="text-[10px] text-slate-500 block">
                      {(request.prescription.filesize / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
              </div>

              {/* Review Actions Bar */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <a
                    href={api.bloodRequests.getPrescriptionDownloadUrl(request.requestid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-[#F3E9D1] text-[#053845] font-semibold border border-[#F3E9D1] transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Document</span>
                  </a>

                  <a
                    href={api.bloodRequests.getPrescriptionDownloadUrl(request.requestid, true)}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 font-semibold border border-slate-200 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewError(null);
                      setPrescriptionReviewRemarks("");
                      setPrescriptionReviewAction("VERIFIED");
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-semibold shadow-2xs transition-colors cursor-pointer ${
                      request.prescription.status === "VERIFIED"
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{request.prescription.status === "VERIFIED" ? "Re-Verify" : "Verify Prescription"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewError(null);
                      setPrescriptionReviewRemarks("");
                      setPrescriptionReviewAction("REJECTED");
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer ${
                      request.prescription.status === "REJECTED"
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{request.prescription.status === "REJECTED" ? "Update Rejection" : "Reject Prescription"}</span>
                  </button>
                </div>
              </div>

              {/* Version History Collapsible */}
              {request.prescriptionhistory && request.prescriptionhistory.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowPrescriptionHistory(!showPrescriptionHistory)}
                    className="inline-flex items-center gap-1.5 text-xs text-[#317786] font-semibold hover:underline cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>
                      {showPrescriptionHistory ? "Hide Review History" : `Prescription Review History (${request.prescriptionhistory.length} records)`}
                    </span>
                  </button>

                  {showPrescriptionHistory && (
                    <div className="pt-2 space-y-2">
                      {request.prescriptionhistory.map((hist) => (
                        <div key={hist.historyid} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              hist.status === "VERIFIED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {hist.status}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {formatDate(hist.createdat)}
                            </span>
                          </div>
                          {hist.remarks && (
                            <p className="text-slate-700 text-[11px] italic">
                              Remarks: &quot;{hist.remarks}&quot;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : request.requesterid ? (
            <div className="bg-amber-50/80 rounded-2xl border border-amber-200 p-5 shadow-xs flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-amber-900 block">
                  Prescription Not Uploaded
                </span>
                <p className="text-amber-800 leading-relaxed">
                  This blood requisition was created by an external requester without a prescription document. Under clinical safety gating, you cannot advance this request to <strong>Blood Arranged</strong> or <strong>Transfusion Fulfilled</strong> until verified.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-teal-50/60 rounded-2xl border border-teal-200 p-4 shadow-xs flex items-center gap-3 text-xs text-teal-900">
              <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0" />
              <span>Hospital-originated requisition. Verified clinical facility order.</span>
            </div>
          )}

          {/* Emergency Blood Broadcast Card (Phase 3) */}
          <EmergencyBroadcastCard
            requestId={request.requestid}
            isEmergency={Boolean(request.isemergency)}
            urgencyLevel={request.urgencylevel}
            canManage={!isTerminal}
            isTerminal={isTerminal}
            onRefreshParent={() => fetchRequestDetails(true)}
          />

          {/* Clinical Status Actions Card */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#317786]" />
                  <span>Clinical Coordination Actions</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authorized medical staff actions strictly enforced by hospital ownership rules.
                </p>
              </div>
            </div>

            {isTerminal ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <span className="font-semibold text-slate-800 block">
                  Requisition in Terminal State ({currentStatus})
                </span>
                <p>
                  No further status updates or clinical modifications may be applied to this requisition in accordance with transfusion safety audit regulations.
                </p>
              </div>
            ) : allowedActions.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                No next actions currently available for status: {currentStatus}.
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider block">
                  Available Next Clinical Transitions:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allowedActions.map((act) => (
                    <button
                      key={act.targetStatus}
                      type="button"
                      onClick={() => {
                        setActionType(act.targetStatus);
                        setActionError(null);
                        setRemarks("");
                        setFulfillmentConfirmed(false);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        act.variant === "success"
                          ? "bg-emerald-50/80 border-emerald-300 hover:bg-emerald-100/70 text-emerald-900"
                          : act.variant === "danger"
                          ? "bg-rose-50/80 border-rose-200 hover:bg-rose-100/70 text-rose-900"
                          : act.variant === "primary"
                          ? "bg-[#053845] text-white hover:bg-[#317786] border-[#053845] shadow-xs"
                          : "bg-white border-slate-200 hover:border-[#317786] text-slate-800"
                      }`}
                    >
                      <div>
                        <span className={`block text-xs font-bold ${act.variant === "primary" ? "text-white" : ""}`}>
                          {act.title}
                        </span>
                        <p className={`text-[11px] mt-1 leading-snug ${
                          act.variant === "primary" ? "text-teal-100/90" : "text-slate-500"
                        }`}>
                          {act.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider pt-1 self-end">
                        <span>Advance &rarr;</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Voluntary Donor Transit & Milestones Card */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-[#317786]" />
                  <span>Voluntary Donor Coordination & Transit</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live responses and logistical progress reported by registered volunteer blood donors.
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845]">
                {request.volunteers?.length || 0} Matched
              </span>
            </div>

            {!request.volunteers || request.volunteers.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-slate-100 space-y-2">
                <User className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-xs font-bold text-slate-700">No Volunteer Responses Yet</h4>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                  When compatible donors accept the broadcast request, their arrival milestones and pre-screening declarations will be reported here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {request.volunteers.map((vol, idx) => (
                  <div
                    key={vol.notificationid || idx}
                    className="p-4 rounded-xl border border-slate-200 bg-[#FAF6EE]/30 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white border border-[#F3E9D1] flex items-center justify-center text-[#B94F30] font-bold text-xs shrink-0">
                          {vol.donorBloodGroup || request.bloodgroup}
                        </div>
                        <div>
                          <span className="font-bold text-xs text-[#053845] block">
                            {vol.donorName}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {vol.donorCity}{vol.donorState ? `, ${vol.donorState}` : ""}
                          </span>
                        </div>
                      </div>

                      {/* Transit Status Badge */}
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                          vol.transitStatus === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : vol.transitStatus === "REACHED_LOCATION"
                            ? "bg-teal-100 text-teal-800 border border-teal-200"
                            : vol.transitStatus === "STARTED"
                            ? "bg-sky-100 text-sky-800 border border-sky-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}>
                          <Car className="w-3 h-3" />
                          <span>{vol.transitStatus?.replace(/_/g, " ") || "DONOR FOUND"}</span>
                        </span>
                      </div>
                    </div>

                    {/* Transit Milestones Timeline */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] bg-white p-2.5 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Transit Departure</span>
                        <span className="text-slate-700 font-medium">
                          {vol.startedAt ? formatDate(vol.startedAt) : "Not departed yet"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Facility Arrival</span>
                        <span className="text-slate-700 font-medium">
                          {vol.reachedAt ? formatDate(vol.reachedAt) : "Pending arrival"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Donation Collection</span>
                        <span className="text-slate-700 font-medium">
                          {vol.completedAt ? formatDate(vol.completedAt) : "Not completed"}
                        </span>
                      </div>
                    </div>

                    {/* Pre-Screening Clearance */}
                    {vol.screening && (
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600 pt-0.5">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          Health: {vol.screening.generalHealth || "Cleared"}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          Alcohol Screen: {vol.screening.alcoholClearance || "Cleared"}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          Cooldown: Passed
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Clinical Policy Notice:</strong> Voluntary donor response status reflects logistics and collection. Fulfilling the requisition requires physical transfusion confirmation by attending hospital clinical staff.
              </p>
            </div>
          </div>

          {/* Status Audit History Ledger */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#317786]" />
                <span>Status Audit History</span>
              </h2>
              <span className="text-xs text-slate-500">
                {request.requeststatushistory?.length || 0} transitions logged
              </span>
            </div>

            {!request.requeststatushistory || request.requeststatushistory.length === 0 ? (
              <div className="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl text-center">
                Initial requisition creation logged. No status changes recorded yet.
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
                {request.requeststatushistory.map((hist, idx) => (
                  <div key={hist.historyid || idx} className="flex items-start gap-3 relative pl-1">
                    <div className="w-6 h-6 rounded-full bg-[#053845] text-white flex items-center justify-center shrink-0 ring-4 ring-white z-10">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <div className="flex-1 bg-[#FAF6EE]/50 border border-[#F3E9D1] p-3 rounded-xl space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-bold text-xs text-[#053845]">
                          {hist.oldstatus ? `${hist.oldstatus} \u2192 ` : ""}{hist.newstatus}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDate(hist.changedat)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        Changed by: <strong className="text-slate-800">{hist.users?.name || "Staff Member"}</strong> ({hist.users?.role || "USER"})
                      </div>
                      {hist.remarks && (
                        <p className="text-[11px] text-slate-700 bg-white p-2 rounded-lg border border-slate-100 mt-1 italic">
                          &ldquo;{hist.remarks}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Patient, Requester, and Clinical Notes */}
        <div className="space-y-6">
          {/* Clinical Notes Card */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#317786]" />
                <span>Clinical Notes</span>
              </h3>
              {!isTerminal && (
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(!isEditingNotes)}
                  className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors cursor-pointer"
                >
                  {isEditingNotes ? "Cancel" : "Edit Notes"}
                </button>
              )}
            </div>

            {isEditingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  rows={4}
                  placeholder="Enter clinical observations, cross-match instructions, or special handling notes..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-[#FAF6EE]/50 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800 leading-relaxed"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingNotes(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNotesOnly}
                    disabled={isSavingNotes}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors disabled:opacity-50"
                  >
                    {isSavingNotes && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Save Notes</span>
                  </button>
                </div>
              </div>
            ) : request.notes ? (
              <p className="text-xs text-slate-700 bg-[#FAF6EE]/60 p-3 rounded-xl border border-[#F3E9D1]/50 leading-relaxed whitespace-pre-line">
                {request.notes}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No clinical notes recorded for this requisition.
              </p>
            )}
          </div>

          {/* Requester Contact Details Card */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-3.5">
            <h3 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-1.5 pb-3 border-b border-slate-100">
              <User className="w-4 h-4 text-[#317786]" />
              <span>Requester Information</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Contact Person
                </span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {request.users?.name || "Not Specified"}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Contact Number
                </span>
                <div className="flex items-center gap-1.5 text-slate-800 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-[#317786]" />
                  <a href={`tel:${request.users?.phonenumber || request.patientcontact}`} className="font-semibold hover:underline">
                    {request.users?.phonenumber || request.patientcontact || "Not provided"}
                  </a>
                </div>
              </div>

              {request.users?.email && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Email Address
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-800 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-[#317786]" />
                    <span className="truncate">{request.users.email}</span>
                  </div>
                </div>
              )}

              {request.requesters && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Requester Location
                  </span>
                  <div className="flex items-start gap-1.5 text-slate-700 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                    <span>
                      {request.requesters.address}, {request.requesters.city}, {request.requesters.state} - {request.requesters.pincode}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Assigned Medical Facility Card */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-3.5">
            <h3 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-1.5 pb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-[#317786]" />
              <span>Assigned Facility Record</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Facility Name
                </span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {request.hospitals?.hospitalname || "Your Medical Facility"}
                </span>
              </div>

              {request.hospitals?.city && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Location
                  </span>
                  <span className="text-slate-700 mt-0.5 block">
                    {request.hospitals.city}, {request.hospitals.state}
                  </span>
                </div>
              )}

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Assigned ID
                </span>
                <span className="font-mono text-slate-500 text-[10px] mt-0.5 block">
                  {request.hospitalid || "Unassigned"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Transition Action & Fulfillment Modal */}
      {actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                {actionType === "FULFILLED" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : actionType === "CANCELLED" ? (
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                ) : (
                  <Activity className="w-5 h-5 text-[#317786]" />
                )}
                <span>
                  {actionType === "FULFILLED"
                    ? "Confirm Clinical Transfusion (Fulfill)"
                    : actionType === "CANCELLED"
                    ? "Cancel Blood Requisition"
                    : `Transition to ${actionType.replace(/_/g, " ")}`}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                &times;
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>{actionError}</div>
              </div>
            )}

            <form onSubmit={handleStatusSubmit} className="space-y-4">
              {/* Special Fulfillment Confirmation Warning */}
              {actionType === "FULFILLED" && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3">
                  <div className="flex items-start gap-2 text-xs text-emerald-900 leading-relaxed">
                    <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block mb-0.5">Physical Transfusion Verification Required</strong>
                      Marking a requisition as <strong>FULFILLED</strong> is a terminal medical action. It certifies that the blood units were verified, cross-matched, and completely transfused into the patient. Once fulfilled, this record is locked.
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 pt-1 text-xs text-emerald-950 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fulfillmentConfirmed}
                      onChange={(e) => setFulfillmentConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-emerald-300 text-[#053845] focus:ring-[#317786]"
                    />
                    <span>
                      I confirm that the physical transfusion was completed and verified by authorized hospital staff.
                    </span>
                  </label>
                </div>
              )}

              {/* Special Cancellation Notice */}
              {actionType === "CANCELLED" && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Cancellation is permanent.</strong> Please provide the clinical reason for canceling this requisition in the remarks below.
                  </div>
                </div>
              )}

              {/* Transition Remarks / Audit Log */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Transition Remarks (Audit Log)
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={
                    actionType === "FULFILLED"
                      ? "e.g., Transfusion completed in Ward 4, verified by attending physician"
                      : actionType === "CANCELLED"
                      ? "e.g., Patient discharged / alternative blood sourced"
                      : "Enter notes for status history log..."
                  }
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-[#FAF6EE]/50 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>

              {/* Optional Clinical Notes Update */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Clinical Notes (Optional Update)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Update patient notes or handling instructions..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-[#FAF6EE]/50 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActionType(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (actionType === "FULFILLED" && !fulfillmentConfirmed)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                    actionType === "FULFILLED"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : actionType === "CANCELLED"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-[#053845] hover:bg-[#317786]"
                  }`}
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {actionType === "FULFILLED"
                      ? "Confirm Physical Transfusion"
                      : actionType === "CANCELLED"
                      ? "Confirm Cancellation"
                      : `Advance to ${actionType.replace(/_/g, " ")}`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Prescription Review & Verification Modal */}
      {prescriptionReviewAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    prescriptionReviewAction === "VERIFIED"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {prescriptionReviewAction === "VERIFIED" ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <X className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#053845]">
                    {prescriptionReviewAction === "VERIFIED"
                      ? "Verify Blood Prescription"
                      : "Reject Blood Prescription"}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Requisition #{request.requestid.slice(0, 8)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPrescriptionReviewAction(null)}
                disabled={isSubmittingReview}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reviewError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{reviewError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                {prescriptionReviewAction === "VERIFIED"
                  ? "You are certifying that this prescription document has been clinically examined, authenticated, and approved for transfusion requisition processing."
                  : "Prescription rejection will notify the requester immediately and allow them to upload a corrected replacement prescription. A clear clinical explanation is required."}
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {prescriptionReviewAction === "VERIFIED"
                    ? "Clinical Notes / Remarks (Optional)"
                    : "Rejection Explanation (Required) *"}
                </label>
                <textarea
                  rows={3}
                  value={prescriptionReviewRemarks}
                  onChange={(e) => setPrescriptionReviewRemarks(e.target.value)}
                  placeholder={
                    prescriptionReviewAction === "VERIFIED"
                      ? "e.g., Verified against attending physician records; hemoglobin match confirmed."
                      : "e.g., Prescription image is blurry / Doctor's signature or hospital stamp missing / Expired requisition date."
                  }
                  required={prescriptionReviewAction === "REJECTED"}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPrescriptionReviewAction(null)}
                disabled={isSubmittingReview}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleVerifyPrescription(prescriptionReviewAction)}
                disabled={
                  isSubmittingReview ||
                  (prescriptionReviewAction === "REJECTED" && !prescriptionReviewRemarks.trim())
                }
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                  prescriptionReviewAction === "VERIFIED"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isSubmittingReview && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {prescriptionReviewAction === "VERIFIED"
                    ? "Confirm Verification"
                    : "Confirm Rejection"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
