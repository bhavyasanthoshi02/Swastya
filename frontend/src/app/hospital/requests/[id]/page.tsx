"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
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
  Loader2,
  Heart,
  Radio,
  RadioTower,
  Eye,
  Download,
  History,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api, BloodRequestItem } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatTimeAgo,
} from "@/lib/mappers";

interface BroadcastData {
  broadcastid: string;
  triggertype: string;
  triggerreason: string | null;
  radiuskm: number;
  status: string;
  totalmatched: number;
  totalnotified: number;
  totalresponded: number;
  createdat: string;
}

// Swastya Blood Request status pipeline
const STATUS_STEPS = [
  { key: "CREATED", label: "Requisition Raised", stepNumber: 1 },
  { key: "HOSPITAL_REVIEW", label: "Hospital Review", stepNumber: 2 },
  { key: "BLOOD_BANK_CHECK", label: "Blood Bank Check", stepNumber: 3 },
  { key: "DONOR_MATCHING", label: "Donor Matching", stepNumber: 4 },
  { key: "BLOOD_ARRANGED", label: "Blood Arranged", stepNumber: 5 },
  { key: "FULFILLED", label: "Transfusion Fulfilled", stepNumber: 6 },
];

function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Date not specified";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function HospitalRequestDetailsPage() {
  const params = useParams();
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

  // Prescription Review State
  const [prescriptionReviewAction, setPrescriptionReviewAction] = useState<"VERIFIED" | "REJECTED" | null>(null);
  const [prescriptionReviewRemarks, setPrescriptionReviewRemarks] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [showPrescriptionHistory, setShowPrescriptionHistory] = useState(false);
  const [isLoadingPrescription, setIsLoadingPrescription] = useState(false);
  const [prescriptionViewError, setPrescriptionViewError] = useState<string | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  // Broadcast State
  const [hasBroadcast, setHasBroadcast] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastData | null>(null);
  const [isBroadcastLoading, setIsBroadcastLoading] = useState(true);
  const [isExpandingBroadcast, setIsExpandingBroadcast] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState<number>(25);
  const [broadcastFeedback, setBroadcastFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // History Expand State
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Edit Clinical Notes inline state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const fetchBroadcastStatus = useCallback(async () => {
    if (!requestId) return;
    try {
      setIsBroadcastLoading(true);
      const res = await api.bloodRequests.getBroadcastStatus(requestId);
      setHasBroadcast(res.hasBroadcast);
      setBroadcast(res.broadcast || null);
      if (res.broadcast?.radiuskm) {
        const cur = res.broadcast.radiuskm;
        if (cur < 25) setSelectedRadius(25);
        else if (cur < 50) setSelectedRadius(50);
        else if (cur < 75) setSelectedRadius(75);
        else if (cur < 100) setSelectedRadius(100);
      }
    } catch (err: unknown) {
      console.error("Failed to load broadcast status:", err);
    } finally {
      setIsBroadcastLoading(false);
    }
  }, [requestId]);

  const handleExpandOrTriggerBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || isExpandingBroadcast) return;

    try {
      setIsExpandingBroadcast(true);
      setBroadcastFeedback(null);

      const res = await api.bloodRequests.triggerBroadcast(requestId, {
        radiusKm: selectedRadius,
        reason: hasBroadcast
          ? `Emergency broadcast radius expanded to ${selectedRadius} km`
          : "Emergency broadcast initiated",
      });

      setBroadcastFeedback({
        type: "success",
        text: res.message || `Broadcast updated to ${selectedRadius} km radius.`,
      });

      await fetchBroadcastStatus();
      await fetchRequestDetails(true);
    } catch (err: unknown) {
      setBroadcastFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to trigger or expand emergency broadcast.",
      });
    } finally {
      setIsExpandingBroadcast(false);
    }
  };

  const handleOpenPrescription = async (download: boolean) => {
    if (!request) return;
    try {
      setIsLoadingPrescription(true);
      setPrescriptionViewError(null);
      const { blob, filename } = await api.bloodRequests.fetchPrescriptionBlob(
        request.requestid,
        download
      );
      const objectUrl = URL.createObjectURL(blob);
      objectUrlsRef.current.push(objectUrl);

      if (download) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = request.prescription?.originalfilename || filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== objectUrl);
        }, 1000);
      } else {
        const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== objectUrl);
          setPrescriptionViewError(
            "Your browser blocked opening the prescription in a new tab. Please allow pop-ups or use the Download button."
          );
          return;
        }
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== objectUrl);
        }, 60000);
      }
    } catch (err: any) {
      setPrescriptionViewError(
        err?.message || "Unable to retrieve prescription document. Please try again."
      );
    } finally {
      setIsLoadingPrescription(false);
    }
  };

  const fetchRequestDetails = useCallback(async (background = false) => {
    if (!requestId) return;
    try {
      if (!background) setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

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
    fetchBroadcastStatus();
  }, [fetchRequestDetails, fetchBroadcastStatus]);

  // Handle status update submission
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || !actionType || isSubmitting) return;

    if (actionType === "FULFILLED" && !fulfillmentConfirmed) {
      setActionError("You must explicitly confirm that the physical transfusion was completed and verified by authorized hospital staff.");
      return;
    }

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

      await api.hospital.updateBloodRequest(requestId, payload);

      setActionSuccess(`Requisition status updated to ${actionType.replace(/_/g, " ")}.`);
      setActionType(null);
      setRemarks("");
      setNotes("");
      setFulfillmentConfirmed(false);

      await fetchRequestDetails(true);

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

  // Handle Prescription Verification / Rejection
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
  const canManageBroadcast = !isTerminal;

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

  // Allowed status transitions for Hospital
  const getAllowedActions = () => {
    if (!request || isTerminal) return [];

    switch (currentStatus) {
      case "CREATED":
      case "VERIFIED":
        return [
          { targetStatus: "HOSPITAL_REVIEW", title: "Accept for Review", variant: "primary" },
          { targetStatus: "BLOOD_BANK_CHECK", title: "Check Blood Bank", variant: "secondary" },
          { targetStatus: "DONOR_MATCHING", title: "Open Donor Matching", variant: "secondary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "HOSPITAL_REVIEW":
        return [
          { targetStatus: "BLOOD_BANK_CHECK", title: "Check Blood Bank Stock", variant: "primary" },
          { targetStatus: "DONOR_MATCHING", title: "Open Donor Matching", variant: "secondary" },
          { targetStatus: "BLOOD_ARRANGED", title: "Units Arranged", variant: "secondary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "BLOOD_BANK_CHECK":
        return [
          { targetStatus: "BLOOD_ARRANGED", title: "Stock Confirmed (Arranged)", variant: "primary" },
          { targetStatus: "DONOR_MATCHING", title: "Stock Depleted (Match Donors)", variant: "secondary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "DONOR_MATCHING":
        return [
          { targetStatus: "BLOOD_ARRANGED", title: "Confirm Units Arranged", variant: "primary" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      case "BLOOD_ARRANGED":
        return [
          { targetStatus: "FULFILLED", title: "Confirm Transfusion & Fulfill", variant: "success" },
          { targetStatus: "CANCELLED", title: "Cancel Requisition", variant: "danger" },
        ];

      default:
        return [];
    }
  };

  const allowedActions = getAllowedActions();

  // Loading View
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-5 pb-12">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
          <span>/</span>
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 space-y-4 animate-pulse">
          <div className="h-7 w-56 bg-slate-200 rounded-lg" />
          <div className="h-14 w-full bg-slate-100 rounded-xl" />
          <div className="h-4 w-80 bg-slate-100 rounded" />
        </div>
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 h-36 animate-pulse" />
      </div>
    );
  }

  // Error View
  if (error || !request) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#fdf2f2] border border-[#A2363A]/30 text-[#A2363A] flex items-center justify-center mx-auto shadow-2xs">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-serif text-2xl font-bold text-[#053845]">
            Unable to Display Requisition
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            {error || "The requested requisition record is unavailable or access was denied."}
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link
            href="/hospital/requests"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Requisitions</span>
          </Link>
          <button
            type="button"
            onClick={() => fetchRequestDetails()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Query</span>
          </button>
        </div>
      </div>
    );
  }

  const statusMeta = mapRequestStatusToDisplay(request.status);
  const urgencyMeta = mapUrgencyBadge(request.urgencylevel);
  const bloodGroupDisplay = mapBloodGroupToDisplay(request.bloodgroup);
  const componentDisplay = mapBloodComponentToDisplay(request.bloodcomponent);
  const refId = `REQ-${request.requestid.slice(0, 8).toUpperCase()}`;
  const isCriticalOrEmergency = Boolean(request.isemergency) || request.urgencylevel === "CRITICAL";

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-500">
          <Link href="/hospital/dashboard" className="hover:text-[#053845] transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/hospital/requests" className="hover:text-[#053845] transition-colors">
            Assigned Requisitions
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#053845] font-mono">{refId}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              fetchRequestDetails(true);
              fetchBroadcastStatus();
            }}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/hospital/requests"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Requisitions</span>
          </Link>
        </div>
      </div>

      {/* Action Success Toast */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{actionSuccess}</div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* 1. Request Overview Header Card */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-4">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3.5 border-b border-[#F3E9D1]/70">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] truncate">
                {request.patientname}
              </h1>
              <span className="text-xs font-medium text-slate-400 shrink-0 font-mono">
                {refId}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Submitted {formatTimeAgo(request.createdat)}
              {request.patientage ? ` · Age ${request.patientage} yrs` : ""}
              {request.patientgender ? ` · ${request.patientgender}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isCriticalOrEmergency
                  ? "bg-[#A2363A]/10 text-[#A2363A] border-[#A2363A]/25"
                  : urgencyMeta.badgeClass
              }`}
            >
              {isCriticalOrEmergency ? "Critical Emergency" : urgencyMeta.label}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
              <span>{statusMeta.label}</span>
            </span>
          </div>
        </div>

        {/* Blood Group & Required Units Focal Point */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1">
          <div className="flex items-center gap-3.5">
            <div className="inline-flex flex-col items-center justify-center px-3.5 py-2 rounded-xl bg-[#317786]/10 border border-[#317786]/20 shrink-0">
              <span className="font-serif text-xl font-bold text-[#053845] leading-none">
                {bloodGroupDisplay}
              </span>
              <span className="text-[11px] font-medium text-[#317786] mt-1 leading-none whitespace-nowrap">
                {componentDisplay}
              </span>
            </div>

            <div className="space-y-0.5">
              <p className="text-sm sm:text-base text-slate-700">
                <span className="font-serif text-xl font-bold text-[#053845]">
                  {request.unitsrequired}
                </span>{" "}
                {request.unitsrequired === 1 ? "unit" : "units"} required
              </p>
              <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                <span>Required by {formatDateTime(request.requiredby)}</span>
              </p>
            </div>
          </div>

          {request.patientcontact && (
            <a
              href={`tel:${request.patientcontact}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] text-xs font-semibold text-[#053845] transition-colors self-start sm:self-center shrink-0"
            >
              <Phone className="w-3.5 h-3.5 text-[#317786]" />
              <span>{request.patientcontact}</span>
            </a>
          )}
        </div>

        {/* Horizontal Progress Tracker */}
        <div className="pt-3 border-t border-[#F3E9D1]/70">
          {currentStatus === "CANCELLED" ? (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <X className="w-4 h-4 text-rose-500 shrink-0" />
              <span><strong>Requisition Cancelled:</strong> This blood requisition has been cancelled.</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {STATUS_STEPS.map((step) => {
                const state = getStepState(step.key);
                return (
                  <div
                    key={step.key}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      state === "completed"
                        ? "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                        : state === "current"
                        ? "bg-[#053845] border-[#053845] text-white shadow-2xs ring-1 ring-[#317786]/30"
                        : "bg-slate-50/60 border-slate-200/70 text-slate-400"
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
                    <span className="block text-[11px] font-semibold leading-tight">
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Main Content: Clean Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN: Emergency Broadcast, Volunteer Responses, Collapsible History */}
        <div className="space-y-5">
          {/* Emergency Blood Broadcast Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#B94F30]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Emergency Blood Broadcast
                </h2>
                {hasBroadcast && broadcast && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFA27E]/20 text-[#B94F30] border border-[#EFA27E]/50">
                    {broadcast.status === "DONOR_RESPONDED"
                      ? "Donor Responded"
                      : broadcast.status || "Active"}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fetchBroadcastStatus()}
                disabled={isBroadcastLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#F3E9D1] text-xs font-semibold text-slate-600 hover:bg-[#FAF6EE] cursor-pointer transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#317786] ${isBroadcastLoading ? "animate-spin" : ""}`}
                />
                <span>Refresh</span>
              </button>
            </div>

            {broadcastFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  broadcastFeedback.type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {broadcastFeedback.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{broadcastFeedback.text}</span>
              </div>
            )}

            {isBroadcastLoading && !broadcast ? (
              <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-[#317786]" />
                <span>Loading broadcast status...</span>
              </div>
            ) : hasBroadcast && broadcast ? (
              <div className="space-y-3">
                {/* Horizontal Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Radius</span>
                    <span className="font-serif text-base font-bold text-[#053845]">
                      {broadcast.radiuskm} km
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Matched</span>
                    <span className="font-serif text-base font-bold text-[#053845]">
                      {broadcast.totalmatched}
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Notified</span>
                    <span className="font-serif text-base font-bold text-[#B94F30]">
                      {broadcast.totalnotified}
                    </span>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                    <span className="text-[10px] text-slate-500 block uppercase font-medium">Responded</span>
                    <span className="font-serif text-base font-bold text-[#317786]">
                      {broadcast.totalresponded}
                    </span>
                  </div>
                </div>

                {/* Radius Expansion Control */}
                {canManageBroadcast && broadcast.radiuskm < 100 && (
                  <form
                    onSubmit={handleExpandOrTriggerBroadcast}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1"
                  >
                    <span className="text-xs text-slate-600">
                      Expand broadcast search radius:
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={selectedRadius}
                        onChange={(e) => setSelectedRadius(Number(e.target.value))}
                        disabled={isExpandingBroadcast}
                        className="px-2.5 py-1 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] focus:outline-none focus:border-[#317786]"
                      >
                        {[15, 25, 50, 75, 100].map((r) => (
                          <option key={r} value={r} disabled={r <= broadcast.radiuskm}>
                            {r} km {r <= broadcast.radiuskm ? "(Current)" : ""}
                          </option>
                        ))}
                      </select>

                      <button
                        type="submit"
                        disabled={isExpandingBroadcast || selectedRadius <= broadcast.radiuskm}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isExpandingBroadcast ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RadioTower className="w-3 h-3" />
                        )}
                        <span>Expand</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-xs">
                <span className="text-slate-600">
                  Emergency broadcast has not been initiated yet.
                </span>
                {canManageBroadcast && (
                  <button
                    type="button"
                    onClick={handleExpandOrTriggerBroadcast}
                    disabled={isExpandingBroadcast}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white font-semibold cursor-pointer transition-colors disabled:opacity-50 shrink-0"
                  >
                    {isExpandingBroadcast ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Radio className="w-3.5 h-3.5" />
                    )}
                    <span>Initiate Broadcast</span>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Volunteer Donor Responses & Transit Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#B94F30]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Volunteer Donor Responses
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 text-[#317786]">
                  {(request.volunteers || []).length}
                </span>
              </div>
            </div>

            {!request.volunteers || request.volunteers.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] text-xs text-slate-500 text-center">
                No volunteer responses recorded yet. Matched community donors will appear here as they respond.
              </div>
            ) : (
              <div className="space-y-2.5">
                {request.volunteers.map((vol, idx) => {
                  const transit = (vol.transitStatus || "DONOR_FOUND").toUpperCase();
                  const isCompleted = transit === "COMPLETED";

                  return (
                    <div
                      key={vol.notificationid || idx}
                      className="p-3 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/40 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-white border border-[#F3E9D1] text-[#053845] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                            {mapBloodGroupToDisplay(vol.donorBloodGroup || request.bloodgroup)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-[#053845] block truncate">
                              {vol.donorName}
                            </span>
                            <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#317786]" />
                              <span>{vol.donorCity || "Registered Donor"}</span>
                            </span>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full shrink-0 ${
                            isCompleted
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : transit === "REACHED_LOCATION"
                              ? "bg-teal-50 text-teal-800 border-teal-200"
                              : transit === "STARTED"
                              ? "bg-sky-50 text-sky-800 border-sky-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {isCompleted
                            ? "Blood Received"
                            : transit === "REACHED_LOCATION"
                            ? "Reached Hospital"
                            : transit === "STARTED"
                            ? "On the Way"
                            : "Donor Matched"}
                        </span>
                      </div>

                      {vol.screening && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600 pt-1 border-t border-[#F3E9D1]/50">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Health: {vol.screening.generalHealth || "Cleared"}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Alcohol: {vol.screening.alcoholClearance || "Cleared"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Status Audit History (Collapsible Accordion) */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-[#FAF6EE]/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#317786]" />
                <h3 className="font-serif text-sm font-bold text-[#053845]">
                  Status Audit History
                </h3>
                <span className="text-xs font-semibold text-slate-400">
                  ({request.requeststatushistory?.length || 0})
                </span>
              </div>
              {isHistoryExpanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {isHistoryExpanded && (
              <div className="p-4 pt-1 border-t border-[#F3E9D1]/70 space-y-2 text-xs">
                {!request.requeststatushistory || request.requeststatushistory.length === 0 ? (
                  <p className="text-slate-400 italic">No status transitions recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {request.requeststatushistory.map((hist, idx) => (
                      <div
                        key={hist.historyid || idx}
                        className="p-2.5 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#053845]">
                            {hist.oldstatus ? `${hist.oldstatus} → ` : ""}{hist.newstatus}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDateTime(hist.changedat)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          By: {hist.users?.name || "Staff Member"} ({hist.users?.role || "USER"})
                        </p>
                        {hist.remarks && (
                          <p className="text-[11px] text-slate-600 italic">
                            &quot;{hist.remarks}&quot;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Clinical Actions, Prescription, Notes, Details */}
        <div className="space-y-5">
          {/* Clinical Coordination Actions Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#317786]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Clinical Actions
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {currentStatus.replace(/_/g, " ")}
              </span>
            </div>

            {isTerminal ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Requisition is in terminal state ({currentStatus}). No further actions permitted.
              </div>
            ) : allowedActions.length === 0 ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                No active actions available for this stage.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
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
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      act.variant === "success"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : act.variant === "danger"
                        ? "bg-rose-50 hover:bg-rose-100 text-[#A2363A] border border-rose-200"
                        : act.variant === "primary"
                        ? "bg-[#053845] hover:bg-[#317786] text-white"
                        : "bg-white hover:bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]"
                    }`}
                  >
                    <span>{act.title}</span>
                    <span>&rarr;</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Clinical Prescription Review (Only when present or requested) */}
          {request.prescription ? (
            <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F3E9D1]/70">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#317786]" />
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Prescription &amp; Verification
                  </h2>
                </div>

                {request.prescription.status === "VERIFIED" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Verified</span>
                  </span>
                )}
                {request.prescription.status === "PENDING" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pending Review</span>
                  </span>
                )}
                {request.prescription.status === "REJECTED" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-[#A2363A] border border-rose-200">
                    <AlertCircle className="w-3.5 h-3.5 text-[#A2363A]" />
                    <span>Rejected</span>
                  </span>
                )}
              </div>

              {reviewSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{reviewSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
                  <span className="text-slate-400 block text-[10px] uppercase font-medium">Doctor</span>
                  <span className="font-semibold text-[#053845] mt-0.5 block truncate">
                    {request.prescription.doctorname || "Attending Physician"}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
                  <span className="text-slate-400 block text-[10px] uppercase font-medium">Document</span>
                  <span className="font-semibold text-[#053845] mt-0.5 block truncate">
                    {request.prescription.originalfilename || "Prescription File"}
                  </span>
                </div>
              </div>

              {prescriptionViewError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{prescriptionViewError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isLoadingPrescription}
                    onClick={() => handleOpenPrescription(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#317786]/10 hover:bg-[#317786]/15 text-[#053845] font-semibold border border-[#317786]/25 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingPrescription ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#317786]" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-[#317786]" />
                    )}
                    <span>View</span>
                  </button>

                  <button
                    type="button"
                    disabled={isLoadingPrescription}
                    onClick={() => handleOpenPrescription(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF6EE] text-slate-700 font-semibold border border-[#F3E9D1] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Download</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewError(null);
                      setPrescriptionReviewRemarks("");
                      setPrescriptionReviewAction("VERIFIED");
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      request.prescription.status === "VERIFIED"
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    <Check className="w-3 h-3" />
                    <span>{request.prescription.status === "VERIFIED" ? "Re-Verify" : "Verify"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewError(null);
                      setPrescriptionReviewRemarks("");
                      setPrescriptionReviewAction("REJECTED");
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      request.prescription.status === "REJECTED"
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-rose-50 text-[#A2363A] border border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    <X className="w-3 h-3" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              {request.prescriptionhistory && request.prescriptionhistory.length > 0 && (
                <div className="pt-2 border-t border-[#F3E9D1]/70">
                  <button
                    type="button"
                    onClick={() => setShowPrescriptionHistory(!showPrescriptionHistory)}
                    className="inline-flex items-center gap-1.5 text-xs text-[#317786] font-semibold hover:underline cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>
                      {showPrescriptionHistory ? "Hide Review History" : `History (${request.prescriptionhistory.length})`}
                    </span>
                  </button>

                  {showPrescriptionHistory && (
                    <div className="pt-2 space-y-1.5">
                      {request.prescriptionhistory.map((hist) => (
                        <div
                          key={hist.historyid}
                          className="p-2 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] text-[11px] space-y-0.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#053845]">{hist.status}</span>
                            <span className="text-slate-400">{formatDateTime(hist.createdat)}</span>
                          </div>
                          {hist.remarks && (
                            <p className="text-slate-600 italic">&quot;{hist.remarks}&quot;</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : request.requesterid ? (
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-amber-800 leading-relaxed">
                Prescription not attached by requester. Verification is required prior to transfusion fulfillment.
              </p>
            </div>
          ) : null}

          {/* Clinical Notes Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
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
                  rows={3}
                  placeholder="Enter clinical observations or handling instructions..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-[#FAF6EE]/50 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800 leading-relaxed"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingNotes(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNotesOnly}
                    disabled={isSavingNotes}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors disabled:opacity-50 cursor-pointer"
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
          </section>

          {/* Patient & Contact Details Card */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3">
            <h3 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-1.5 pb-3 border-b border-[#F3E9D1]/70">
              <User className="w-4 h-4 text-[#317786]" />
              <span>Patient &amp; Contact Details</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Patient:</span>
                <span className="font-semibold text-slate-800">
                  {request.patientname} ({request.patientage ? `${request.patientage} yrs` : "Age N/A"}, {request.patientgender || "N/A"})
                </span>
              </div>

              {request.patientcontact && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Patient Phone:</span>
                  <a
                    href={`tel:${request.patientcontact}`}
                    className="font-semibold text-[#053845] hover:underline flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3 text-[#317786]" />
                    <span>{request.patientcontact}</span>
                  </a>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">Requester:</span>
                <span className="font-semibold text-slate-800">
                  {request.users?.name || "Not Specified"}
                </span>
              </div>

              {(request.users?.phonenumber || request.patientcontact) && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Requester Phone:</span>
                  <a
                    href={`tel:${request.users?.phonenumber || request.patientcontact}`}
                    className="font-semibold text-[#053845] hover:underline flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3 text-[#317786]" />
                    <span>{request.users?.phonenumber || request.patientcontact}</span>
                  </a>
                </div>
              )}

              {request.users?.email && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Requester Email:</span>
                  <span className="font-medium text-slate-700 flex items-center gap-1 truncate max-w-[200px]">
                    <Mail className="w-3 h-3 text-[#317786]" />
                    <span className="truncate">{request.users.email}</span>
                  </span>
                </div>
              )}

              {request.requesters && (
                <div className="flex items-start justify-between gap-2 pt-1">
                  <span className="text-slate-500 shrink-0">Location:</span>
                  <span className="font-medium text-slate-700 text-right">
                    {request.requesters.city}, {request.requesters.state}
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Status Transition Action & Fulfillment Modal */}
      {actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#317786]" />
                <span>
                  {actionType === "FULFILLED"
                    ? "Confirm Transfusion (Fulfill)"
                    : actionType === "CANCELLED"
                    ? "Cancel Blood Requisition"
                    : `Transition to ${actionType.replace(/_/g, " ")}`}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
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
              {actionType === "FULFILLED" && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                  <div className="text-xs text-emerald-900 leading-relaxed">
                    <strong>Physical Transfusion Verification Required</strong>
                    <p className="mt-0.5">
                      Fulfilling is a terminal action confirming units were cross-matched and transfused into the patient.
                    </p>
                  </div>

                  <label className="flex items-start gap-2 pt-1 text-xs text-emerald-950 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fulfillmentConfirmed}
                      onChange={(e) => setFulfillmentConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-emerald-300 text-[#053845] focus:ring-[#317786]"
                    />
                    <span>
                      I confirm that physical transfusion was completed and verified.
                    </span>
                  </label>
                </div>
              )}

              {actionType === "CANCELLED" && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <strong>Cancellation is permanent.</strong> Please provide a reason below.
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter remarks for audit history..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-[#FAF6EE]/50 focus:bg-white focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActionType(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (actionType === "FULFILLED" && !fulfillmentConfirmed)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
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
                      ? "Confirm Transfusion"
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-[#053845]">
                {prescriptionReviewAction === "VERIFIED"
                  ? "Verify Blood Prescription"
                  : "Reject Blood Prescription"}
              </h3>
              <button
                type="button"
                onClick={() => setPrescriptionReviewAction(null)}
                disabled={isSubmittingReview}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
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
                  ? "You are certifying that this prescription has been clinically authenticated for transfusion processing."
                  : "Prescription rejection will notify the requester to provide an updated document. A clear explanation is required."}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {prescriptionReviewAction === "VERIFIED"
                    ? "Clinical Remarks (Optional)"
                    : "Rejection Reason (Required) *"}
                </label>
                <textarea
                  rows={3}
                  value={prescriptionReviewRemarks}
                  onChange={(e) => setPrescriptionReviewRemarks(e.target.value)}
                  placeholder={
                    prescriptionReviewAction === "VERIFIED"
                      ? "e.g., Verified against attending physician records."
                      : "e.g., Signature missing or image blurry."
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
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
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
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
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
