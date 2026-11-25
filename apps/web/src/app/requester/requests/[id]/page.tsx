"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  Clock,
  Building2,
  Phone,
  Users,
  ShieldAlert,
  AlertCircle,
  FileQuestion,
  Loader2,
  ArrowRight,
  Ban,
  Heart,
  CheckCircle2,
  MapPin,
  FileText,
  Download,
  UploadCloud,
  Eye,
  History,
  X,
  Radio,
  RadioTower,
  RefreshCw,
  Calendar,
  User,
  Check,
  XCircle,
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

function extractRequestFacilityAndNotes(req: BloodRequestItem): {
  hospitalName: string | null;
  wardOrRoom: string | null;
  additionalNotes: string | null;
} {
  let noteFacility: string | null = null;
  let wardOrRoom: string | null = null;
  const extraNotes: string[] = [];

  if (req.notes) {
    const segments = req.notes
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const seg of segments) {
      if (seg.startsWith("Facility / Hospital:")) {
        const val = seg.slice("Facility / Hospital:".length).trim();
        if (val) noteFacility = val;
      } else if (seg.startsWith("Selected Facility:")) {
        const val = seg.slice("Selected Facility:".length).trim();
        if (val) noteFacility = val;
      } else if (seg.startsWith("Ward / Room:")) {
        const val = seg.slice("Ward / Room:".length).trim();
        if (val) wardOrRoom = val;
      } else if (seg.startsWith("Clinical Instructions:")) {
        const val = seg.slice("Clinical Instructions:".length).trim();
        if (val) extraNotes.push(val);
      } else {
        extraNotes.push(seg);
      }
    }
  }

  const hospitalName =
    req.hospitals?.hospitalname?.trim() ||
    req.prescription?.hospitalname?.trim() ||
    noteFacility ||
    null;

  return {
    hospitalName,
    wardOrRoom,
    additionalNotes: extraNotes.length > 0 ? extraNotes.join(" • ") : null,
  };
}

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id;

  const [request, setRequest] = useState<BloodRequestItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cancellation State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Prescription State
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementDoctor, setReplacementDoctor] = useState("");
  const [replacementHospital, setReplacementHospital] = useState("");
  const [isUploadingReplacement, setIsUploadingReplacement] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [replacementSuccess, setReplacementSuccess] = useState<string | null>(null);
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

  // Donor Decision State
  const [decidingDeliveryId, setDecidingDeliveryId] = useState<string | null>(null);
  const [volunteerActionFeedback, setVolunteerActionFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const fetchRequestDetails = useCallback(async () => {
    if (!requestId) return;

    try {
      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);

      const data = await api.bloodRequests.getById(requestId);
      if (data && data.requestid) {
        setRequest(data);
      } else {
        setErrorStatus(404);
        setErrorMessage("Blood requisition not found.");
      }
    } catch (err: unknown) {
      const errObj = err as { status?: number; message?: string };
      const status =
        errObj?.status ||
        (errObj?.message?.includes("403")
          ? 403
          : errObj?.message?.includes("404")
          ? 404
          : 500);
      setErrorStatus(status);
      setErrorMessage(errObj?.message || "Failed to load blood requisition details.");
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  const handleVolunteerDecision = async (deliveryId: string, decision: "ACCEPTED" | "REJECTED") => {
    if (!requestId || !deliveryId) return;
    try {
      setDecidingDeliveryId(deliveryId);
      setVolunteerActionFeedback(null);
      const res = await api.bloodRequests.decideVolunteer(requestId, deliveryId, decision);
      setVolunteerActionFeedback({
        type: "success",
        text: res.message || (decision === "ACCEPTED" ? "Donor offer accepted." : "Donor offer rejected."),
      });
      await fetchRequestDetails();
    } catch (err: any) {
      setVolunteerActionFeedback({
        type: "error",
        text: err?.message || `Failed to ${decision === "ACCEPTED" ? "accept" : "reject"} donor offer.`,
      });
    } finally {
      setDecidingDeliveryId(null);
    }
  };

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

  useEffect(() => {
    fetchRequestDetails();
    fetchBroadcastStatus();
  }, [fetchRequestDetails, fetchBroadcastStatus]);

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
            "Your browser blocked opening the prescription in a new tab. Please allow pop-ups or use Download."
          );
          return;
        }
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== objectUrl);
        }, 60000);
      }
    } catch (err: unknown) {
      setPrescriptionViewError(
        err instanceof Error
          ? err.message
          : "Unable to retrieve prescription document. Please try again."
      );
    } finally {
      setIsLoadingPrescription(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!requestId || isCancelling) return;

    try {
      setIsCancelling(true);
      setCancelError(null);

      const updated = await api.bloodRequests.update(requestId, {
        status: "CANCELLED",
        remarks: "Cancelled directly by requester via coordination portal.",
      });

      if (updated && updated.requestid) {
        setRequest(updated);
        setShowCancelModal(false);
        fetchRequestDetails();
      }
    } catch (err: unknown) {
      setCancelError(
        err instanceof Error ? err.message : "Failed to cancel request. Please try again."
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUploadReplacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || !replacementFile || isUploadingReplacement) return;

    try {
      setIsUploadingReplacement(true);
      setReplacementError(null);
      setReplacementSuccess(null);

      const formData = new FormData();
      formData.append("prescription", replacementFile);
      if (replacementDoctor.trim()) formData.append("doctorname", replacementDoctor.trim());
      if (replacementHospital.trim()) formData.append("hospitalname", replacementHospital.trim());

      const res = await api.bloodRequests.uploadReplacementPrescription(requestId, formData);
      if (res && res.success) {
        setReplacementSuccess(
          "Replacement prescription uploaded. Status returned to Pending verification."
        );
        setReplacementFile(null);
        setShowReplacementModal(false);
        await fetchRequestDetails();
      }
    } catch (err: unknown) {
      setReplacementError(
        err instanceof Error
          ? err.message
          : "Failed to upload replacement prescription. Please check file format and size."
      );
    } finally {
      setIsUploadingReplacement(false);
    }
  };

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
      await fetchRequestDetails();
    } catch (err: unknown) {
      setBroadcastFeedback({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Failed to trigger or expand emergency broadcast.",
      });
    } finally {
      setIsExpandingBroadcast(false);
    }
  };

  const isCancellable =
    request &&
    !["FULFILLED", "CANCELLED", "EXPIRED"].includes(request.status?.toUpperCase() || "");

  // 1. Loading State
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
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 h-36 animate-pulse" />
      </div>
    );
  }

  // 2. Access Denied (403) State
  if (errorStatus === 403) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-[#A2363A] flex items-center justify-center mx-auto shadow-2xs">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-serif text-2xl font-bold text-[#053845]">Access Denied</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            You do not own this blood requisition or lack authorization to view its details.
          </p>
        </div>
        <Link
          href="/requester/requests"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-xs transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Return to My Blood Requests</span>
        </Link>
      </div>
    );
  }

  // 3. Not Found (404) State
  if (errorStatus === 404 || !request) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-white border border-[#F3E9D1] text-slate-400 flex items-center justify-center mx-auto shadow-2xs">
          <FileQuestion className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-serif text-2xl font-bold text-[#053845]">
            Blood Request Not Found
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            The requested blood requisition does not exist or may have been removed.
          </p>
        </div>
        <Link
          href="/requester/requests"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-xs transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Return to My Blood Requests</span>
        </Link>
      </div>
    );
  }

  // 4. Server/Network Error State
  if (errorMessage && errorStatus !== 403 && errorStatus !== 404) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#fdf2f2] border border-[#A2363A]/30 text-[#A2363A] flex items-center justify-center mx-auto shadow-2xs">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-serif text-2xl font-bold text-[#053845]">
            Unable to Load Request Details
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">{errorMessage}</p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fetchRequestDetails()}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#A2363A] hover:bg-[#85272b] shadow-xs transition-colors cursor-pointer"
          >
            Retry
          </button>
          <Link
            href="/requester/requests"
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 bg-white border border-[#F3E9D1] hover:bg-slate-50 transition-colors"
          >
            Back to Requests
          </Link>
        </div>
      </div>
    );
  }

  const statusMeta = mapRequestStatusToDisplay(request.status);
  const urgencyMeta = mapUrgencyBadge(request.urgencylevel);
  const bloodGroupDisplay = mapBloodGroupToDisplay(request.bloodgroup);
  const componentDisplay = mapBloodComponentToDisplay(request.bloodcomponent);
  const refId = `REQ-${request.requestid.slice(0, 8).toUpperCase()}`;
  const { hospitalName, wardOrRoom, additionalNotes } =
    extractRequestFacilityAndNotes(request);

  const isTerminal = ["CANCELLED", "FULFILLED", "EXPIRED"].includes(
    request.status?.toUpperCase() || ""
  );
  const canManageBroadcast = !isTerminal;
  const isCriticalOrEmergency =
    Boolean(request.isemergency) || request.urgencylevel === "CRITICAL";

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-500">
          <Link href="/requester/dashboard" className="hover:text-[#053845] transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/requester/requests" className="hover:text-[#053845] transition-colors">
            My Blood Requests
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#053845]">Request Details</span>
        </div>

        <Link
          href="/requester/requests"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to My Blood Requests</span>
        </Link>
      </div>

      {/* 1. Request Overview – Main Section */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-4">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3.5 border-b border-[#F3E9D1]/70">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] truncate">
                {request.patientname}
              </h1>
              <span className="text-xs font-medium text-slate-400 shrink-0">{refId}</span>
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

            {isCancellable && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 text-xs font-semibold text-[#A2363A] hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Cancel Request</span>
              </button>
            )}
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

        {/* Hospital & Location Details */}
        {(hospitalName || wardOrRoom) && (
          <div className="pt-3 border-t border-[#F3E9D1]/70 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
            {hospitalName && (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#053845]">
                <Building2 className="w-4 h-4 text-[#317786] shrink-0" />
                <span>
                  {hospitalName}
                  {request.hospitals?.city ? `, ${request.hospitals.city}` : ""}
                </span>
              </span>
            )}

            {wardOrRoom && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#317786] shrink-0" />
                <span>{wardOrRoom}</span>
              </span>
            )}
          </div>
        )}

        {/* Additional Facility Instructions / Notes Subsection */}
        {additionalNotes && (
          <div className="p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-xs space-y-1">
            <span className="font-semibold text-[#053845] block">
              Additional Facility Notes
            </span>
            <p className="text-slate-600 leading-relaxed">{additionalNotes}</p>
          </div>
        )}
      </section>

      {/* 2. Prescription & Verification */}
      {request.prescription && (
        <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3.5">
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

          {replacementSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{replacementSuccess}</span>
            </div>
          )}

          {request.prescription.status === "REJECTED" && (
            <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5 text-xs">
                <p className="font-semibold text-[#A2363A]">Prescription Rejected</p>
                <p className="text-slate-700">
                  {request.prescription.remarks || "Please upload a clearer replacement prescription."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplacementError(null);
                  setReplacementFile(null);
                  setShowReplacementModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#A2363A] hover:bg-[#85272b] text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Replacement</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
              <span className="text-slate-500 block">Prescribing Doctor</span>
              <span className="font-semibold text-[#053845] mt-0.5 block">
                {request.prescription.doctorname || "Attending Physician"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
              <span className="text-slate-500 block">Issuing Hospital</span>
              <span className="font-semibold text-[#053845] mt-0.5 block truncate">
                {request.prescription.hospitalname ||
                  request.hospitals?.hospitalname ||
                  "Prescribing Hospital"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
              <span className="text-slate-500 block">Uploaded Document</span>
              <span className="font-semibold text-[#053845] mt-0.5 block truncate">
                {request.prescription.originalfilename || "Prescription Document"}
                {request.prescription.filesize
                  ? ` (${(request.prescription.filesize / 1024).toFixed(1)} KB)`
                  : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
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
                <span>View Prescription</span>
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

            {request.prescriptionhistory && request.prescriptionhistory.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPrescriptionHistory(!showPrescriptionHistory)}
                className="inline-flex items-center gap-1.5 text-xs text-[#317786] font-semibold hover:underline cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>
                  {showPrescriptionHistory
                    ? "Hide History"
                    : `Review History (${request.prescriptionhistory.length})`}
                </span>
              </button>
            )}
          </div>

          {prescriptionViewError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{prescriptionViewError}</span>
            </div>
          )}

          {showPrescriptionHistory &&
            request.prescriptionhistory &&
            request.prescriptionhistory.length > 0 && (
              <div className="pt-3 border-t border-[#F3E9D1]/70 space-y-2">
                {request.prescriptionhistory.map((hist) => (
                  <div
                    key={hist.historyid}
                    className="p-3 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#053845]">{hist.status}</span>
                      <span className="text-[11px] text-slate-400">
                        {formatDateTime(hist.createdat)}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      {hist.originalfilename || "Prescription Document"}
                      {hist.hospitals?.hospitalname
                        ? ` · Reviewed by ${hist.hospitals.hospitalname}`
                        : ""}
                    </p>
                    {hist.remarks && (
                      <p className="text-slate-600 italic">&quot;{hist.remarks}&quot;</p>
                    )}
                  </div>
                ))}
              </div>
            )}
        </section>
      )}

      {/* 3. Emergency Blood Broadcast (Simplified) */}
      {(isCriticalOrEmergency || hasBroadcast) && (
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
                className={`w-3.5 h-3.5 text-[#317786] ${
                  isBroadcastLoading ? "animate-spin" : ""
                }`}
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
              {/* Compact Horizontal Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                  <span className="text-[11px] text-slate-500 block">Current Radius</span>
                  <span className="font-serif text-lg font-bold text-[#053845]">
                    {broadcast.radiuskm} km
                  </span>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                  <span className="text-[11px] text-slate-500 block">Matched Donors</span>
                  <span className="font-serif text-lg font-bold text-[#053845]">
                    {broadcast.totalmatched}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                  <span className="text-[11px] text-slate-500 block">Notifications Sent</span>
                  <span className="font-serif text-lg font-bold text-[#B94F30]">
                    {broadcast.totalnotified}
                  </span>
                </div>

                <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
                  <span className="text-[11px] text-slate-500 block">Volunteer Responses</span>
                  <span className="font-serif text-lg font-bold text-[#317786]">
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
                  <span className="text-xs font-medium text-slate-600">
                    Expand search radius to reach additional donors:
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={selectedRadius}
                      onChange={(e) => setSelectedRadius(Number(e.target.value))}
                      disabled={isExpandingBroadcast}
                      className="px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] focus:outline-none focus:border-[#317786]"
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
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExpandingBroadcast ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RadioTower className="w-3.5 h-3.5" />
                      )}
                      <span>Expand Radius</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-xs">
              <span className="text-slate-600">
                Emergency broadcast has not been triggered yet.
              </span>
              {canManageBroadcast && (
                <button
                  type="button"
                  onClick={handleExpandOrTriggerBroadcast}
                  disabled={isExpandingBroadcast}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white font-semibold cursor-pointer transition-colors disabled:opacity-50 self-start sm:self-auto"
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
      )}

      {/* 4. Voluntary Donor Responses */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F3E9D1]/70">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-[#B94F30]" />
            <h2 className="font-serif text-base font-bold text-[#053845]">
              Voluntary Donor Responses
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 text-[#317786]">
              {(request.volunteers || []).length}
            </span>
          </div>

          <Link
            href={`/requester/donors?requestId=${request.requestid}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
          >
            <span>Available Donors</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {volunteerActionFeedback && (
          <div
            className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border ${
              volunteerActionFeedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-[#A2363A]"
            }`}
          >
            <span>{volunteerActionFeedback.text}</span>
            <button
              type="button"
              onClick={() => setVolunteerActionFeedback(null)}
              className="text-current/70 hover:text-current"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {request.volunteers && request.volunteers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {request.volunteers.map((vol, idx) => {
              const acceptance = (vol.acceptanceStatus || "PENDING").toUpperCase();
              const transit = (vol.transitStatus || vol.status || "DONOR_FOUND").toUpperCase();
              const isPendingDecision = acceptance === "PENDING";
              const isAccepted = acceptance === "ACCEPTED";
              const isRejected = acceptance === "REJECTED";
              const isCompleted = transit === "COMPLETED" || Boolean(vol.receiptConfirmedAt);

              const acceptanceBadge = isRejected
                ? { label: "Rejected", cls: "bg-rose-50 text-[#A2363A] border-rose-200" }
                : isAccepted
                ? { label: "Accepted", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                : { label: "Pending Review", cls: "bg-amber-50 text-amber-800 border-amber-200" };

              const journeyStatusLabel = isRejected
                ? null
                : isCompleted
                ? "Blood Received – Confirmed"
                : transit === "REACHED_LOCATION"
                ? "Reached Hospital"
                : transit === "STARTED"
                ? "On the Way"
                : isAccepted
                ? "Awaiting Journey Start"
                : null;

              return (
                <div
                  key={vol.deliveryId || vol.notificationid || `${vol.donorUserId}-${idx}`}
                  className={`p-3.5 rounded-xl border space-y-2.5 text-xs ${
                    isRejected
                      ? "bg-slate-50/70 border-slate-200/80 opacity-85"
                      : "bg-[#FAF6EE]/70 border-[#F3E9D1]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#053845] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                        {mapBloodGroupToDisplay(vol.donorBloodGroup)}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-[#053845] block text-sm truncate">
                          {vol.donorName}
                        </span>
                        <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#317786]" />
                          <span>{vol.donorCity || "Registered Donor"}</span>
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center text-[11px] font-semibold border px-2 py-0.5 rounded-full shrink-0 ${acceptanceBadge.cls}`}
                    >
                      {acceptanceBadge.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F3E9D1]">
                    <span className="text-[11px] font-medium text-slate-600">
                      {journeyStatusLabel || "Awaiting your decision"}
                    </span>

                    {isPendingDecision && !isTerminal && vol.deliveryId ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={decidingDeliveryId === vol.deliveryId}
                          onClick={() => handleVolunteerDecision(vol.deliveryId!, "ACCEPTED")}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {decidingDeliveryId === vol.deliveryId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          disabled={decidingDeliveryId === vol.deliveryId}
                          onClick={() => handleVolunteerDecision(vol.deliveryId!, "REJECTED")}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#A2363A] bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Reject</span>
                        </button>
                      </div>
                    ) : isAccepted && vol.deliveryId ? (
                      <div className="flex items-center gap-1.5">
                        {transit === "REACHED_LOCATION" && !isCompleted && (
                          <Link
                            href={`/requester/requests/${request.requestid}/donors/${vol.deliveryId}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors animate-pulse"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm Receipt</span>
                          </Link>
                        )}
                        <Link
                          href={`/requester/requests/${request.requestid}/donors/${vol.deliveryId}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors"
                        >
                          <span>{transit === "REACHED_LOCATION" ? "Details & Tracker" : "View Details"}</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]">
            <div className="w-9 h-9 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <p className="font-semibold text-[#053845]">Awaiting donor responses</p>
              <p className="text-slate-500">
                Compatible donors ({bloodGroupDisplay}) have been notified and responses will appear here.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Cancel Requisition Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-[#A2363A] flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-base font-bold text-[#053845]">
                  Cancel Blood Request?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to cancel request <strong>{refId}</strong> for patient{" "}
                  <strong>{request.patientname}</strong>? This will stop active donor matching.
                </p>
              </div>
            </div>

            {cancelError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {cancelError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={isCancelling}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                No, Keep Active
              </button>
              <button
                type="button"
                onClick={handleCancelRequest}
                disabled={isCancelling}
                className="px-5 py-2 rounded-xl bg-[#A2363A] hover:bg-[#85272b] text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Yes, Cancel Request</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Replacement Prescription Modal */}
      {showReplacementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#A2363A]/10 text-[#A2363A] flex items-center justify-center shrink-0">
                  <UploadCloud className="w-5 h-5 text-[#A2363A]" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-[#053845]">
                    Upload Replacement Prescription
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Submit an updated prescription document for hospital review
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReplacementModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadReplacement} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#053845]">
                  Select Prescription Document (PDF, JPEG, PNG, max 5 MB){" "}
                  <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setReplacementFile(e.target.files[0]);
                      setReplacementError(null);
                    }
                  }}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#053845] file:text-white hover:file:bg-[#317786] file:cursor-pointer cursor-pointer border border-slate-200 rounded-xl p-2"
                />
                {replacementFile && (
                  <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      Selected: {replacementFile.name} (
                      {(replacementFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#053845]">
                    Doctor Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={replacementDoctor}
                    onChange={(e) => setReplacementDoctor(e.target.value)}
                    placeholder="e.g., Dr. Mehra, MD"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-[#317786]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#053845]">
                    Clinic / Hospital (Optional)
                  </label>
                  <input
                    type="text"
                    value={replacementHospital}
                    onChange={(e) => setReplacementHospital(e.target.value)}
                    placeholder="e.g., Apollo Hospital"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-[#317786]"
                  />
                </div>
              </div>

              {replacementError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{replacementError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3 font-semibold">
                <button
                  type="button"
                  onClick={() => setShowReplacementModal(false)}
                  disabled={isUploadingReplacement}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!replacementFile || isUploadingReplacement}
                  className="px-5 py-2.5 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isUploadingReplacement ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      <span>Submit Replacement</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
