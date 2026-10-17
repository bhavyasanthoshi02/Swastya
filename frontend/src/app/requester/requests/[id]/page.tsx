"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Droplet,
  ChevronLeft,
  Clock,
  Building2,
  Phone,
  User,
  Users,
  ShieldAlert,
  AlertCircle,
  FileQuestion,
  Loader2,
  ArrowRight,
  Info,
  ShieldCheck,
  Ban,
  Heart,
  CheckCircle2,
  Car,
  MapPin,
  FileText,
  Download,
  UploadCloud,
  Eye,
  History,
  X,
} from "lucide-react";
import { api, BloodRequestItem, RequestStatusHistoryItem } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatTimeAgo,
} from "@/lib/mappers";
import EmergencyBroadcastCard from "@/components/broadcast/EmergencyBroadcastCard";

// Helper to format ISO date into human-readable date and time
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

  // Prescription Replacement Upload State (Phase 2)
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [replacementDoctor, setReplacementDoctor] = useState("");
  const [replacementHospital, setReplacementHospital] = useState("");
  const [isUploadingReplacement, setIsUploadingReplacement] = useState(false);
  const [replacementError, setReplacementError] = useState<string | null>(null);
  const [replacementSuccess, setReplacementSuccess] = useState<string | null>(null);
  const [showPrescriptionHistory, setShowPrescriptionHistory] = useState(false);

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
    } catch (err: any) {
      const status = err?.status || (err?.message?.includes("403") ? 403 : err?.message?.includes("404") ? 404 : 500);
      setErrorStatus(status);
      setErrorMessage(err?.message || "Failed to load blood requisition details.");
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchRequestDetails();
  }, [fetchRequestDetails]);

  // Handle Cancel Action (only if backend supports and request is still active)
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
        // Refresh to fetch fresh status history
        fetchRequestDetails();
      }
    } catch (err: any) {
      setCancelError(err?.message || "Failed to cancel request. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle Replacement Prescription Upload
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
        setReplacementSuccess("Replacement prescription uploaded successfully. Status returned to PENDING verification.");
        setReplacementFile(null);
        setShowReplacementModal(false);
        await fetchRequestDetails();
      }
    } catch (err: any) {
      setReplacementError(err?.message || "Failed to upload replacement prescription. Please check file format and size.");
    } finally {
      setIsUploadingReplacement(false);
    }
  };

  // Check if request is currently cancellable
  const isCancellable =
    request &&
    !["FULFILLED", "CANCELLED", "EXPIRED"].includes(request.status?.toUpperCase() || "");

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-12">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
          <span>/</span>
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 sm:p-8 space-y-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-6 w-36 bg-slate-200 rounded-md" />
            <div className="h-6 w-24 bg-slate-200 rounded-full" />
          </div>
          <div className="h-8 w-64 bg-slate-200 rounded-lg" />
          <div className="h-4 w-96 bg-slate-100 rounded" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 h-48 animate-pulse" />
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 h-48 animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 h-72 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Access Denied (403) State
  if (errorStatus === 403) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-[#A2363A] flex items-center justify-center mx-auto shadow-2xs">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#A2363A] bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
            Security Authorization Policy
          </span>
          <h2 className="font-serif text-2xl font-bold text-[#053845] mt-2">
            Access Denied
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            You do not own this blood requisition or lack clinical authorization to view its details. Patient records are strictly protected under Swastya privacy protocols.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/requester/requests"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#053845] hover:bg-[#03232c] shadow-xs transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Return to My Blood Requests</span>
          </Link>
        </div>
      </div>
    );
  }

  // 3. Not Found (404) State
  if (errorStatus === 404 || !request) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-slate-400 flex items-center justify-center mx-auto shadow-2xs">
          <FileQuestion className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
            Record Reference Missing
          </span>
          <h2 className="font-serif text-2xl font-bold text-[#053845] mt-2">
            Blood Requisition Not Found
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            The blood requisition you requested does not exist or may have been deleted. Verify the requisition ID and try again.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/requester/requests"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#053845] hover:bg-[#03232c] shadow-xs transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Return to My Blood Requests</span>
          </Link>
        </div>
      </div>
    );
  }

  // 4. Server/Network Error State
  if (errorMessage && errorStatus !== 403 && errorStatus !== 404) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[#fdf2f2] border border-[#A2363A]/30 text-[#A2363A] flex items-center justify-center mx-auto shadow-2xs">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-serif text-2xl font-bold text-[#053845]">
            Unable to Load Requisition Details
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">{errorMessage}</p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fetchRequestDetails()}
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#A2363A] hover:bg-[#85272b] shadow-xs transition-colors cursor-pointer"
          >
            Retry Loading
          </button>
          <Link
            href="/requester/requests"
            className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Back to Requests
          </Link>
        </div>
      </div>
    );
  }

  // Derived metadata from real API response
  const statusMeta = mapRequestStatusToDisplay(request.status);
  const urgencyMeta = mapUrgencyBadge(request.urgencylevel);
  const bloodGroupDisplay = mapBloodGroupToDisplay(request.bloodgroup);
  const componentDisplay = mapBloodComponentToDisplay(request.bloodcomponent);
  const refId = `REQ-${request.requestid.slice(0, 8).toUpperCase()}`;

  // Real status history records
  const statusHistory: RequestStatusHistoryItem[] = request.requeststatushistory || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
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
          <span className="font-mono font-bold text-[#053845]">{refId}</span>
        </div>

        <Link
          href="/requester/requests"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to My Blood Requests</span>
        </Link>
      </div>

      {/* Main Request Hero Banner Card */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 space-y-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-start gap-4">
            {/* Prominent Blood Group Badge */}
            <div className="w-16 h-16 rounded-2xl bg-[#B94F30]/10 border border-[#B94F30]/30 text-[#B94F30] flex flex-col items-center justify-center font-serif text-xl font-bold shadow-2xs flex-shrink-0">
              <Droplet className="w-4 h-4 fill-current mb-0.5" />
              <span className="leading-none">{bloodGroupDisplay}</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#053845] bg-[#FAF6EE] px-2.5 py-0.5 rounded-md border border-[#F3E9D1]">
                  {refId}
                </span>
                <span className="text-xs text-slate-400">
                  Logged {formatTimeAgo(request.createdat)} ({formatDateTime(request.createdat)})
                </span>
              </div>

              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                {request.patientname}
              </h1>

              <p className="text-xs sm:text-sm text-slate-600">
                {request.unitsrequired} {request.unitsrequired === 1 ? "Unit" : "Units"} • {componentDisplay} • Age {request.patientage} yrs ({request.patientgender})
              </p>
            </div>
          </div>

          {/* Badges & Action Controls */}
          <div className="flex flex-wrap md:flex-col md:items-end gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Urgency Badge */}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${urgencyMeta.badgeClass}`}
              >
                {urgencyMeta.label}
              </span>

              {/* Emergency Indicator */}
              {request.isemergency && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#A2363A] text-white">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>CRITICAL EMERGENCY</span>
                </span>
              )}

              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusMeta.badgeClass}`}
              >
                <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                <span>{statusMeta.label}</span>
              </span>
            </div>

            {/* Cancel Requisition Action (if cancellable) */}
            {isCancellable && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-[#A2363A] hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Cancel Requisition</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Highlights Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Required By
            </span>
            <span className="font-bold text-[#053845] block mt-0.5">
              {formatDateTime(request.requiredby)}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Facility Location
            </span>
            <span className="font-bold text-[#053845] block mt-0.5 truncate">
              {request.hospitals?.hospitalname || "Regional Network"}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Search Scope
            </span>
            <span className="font-bold text-[#053845] block mt-0.5">
              {request.searchradius || 5} km radius
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Patient Contact
            </span>
            <span className="font-bold text-[#053845] block mt-0.5 font-mono">
              {request.patientcontact}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content: Prescription, Donors, Specifications & Facility */}
      <div className="space-y-6">

        {/* Prescription Verification & Clinical Status Card (Phase 2 Mandatory Tracking) */}
        {request.prescription ? (
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#F3E9D1] gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#053845]/10 text-[#053845] flex items-center justify-center font-bold text-xs flex-shrink-0">
                  <FileText className="w-5 h-5 text-[#053845]" />
                </div>
                <div>
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Clinical Prescription &amp; Verification
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Hospital verification record and document tracking
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {request.prescription.status === "VERIFIED" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Clinically Verified &amp; Approved</span>
                  </span>
                )}
                {request.prescription.status === "PENDING" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pending Hospital Review</span>
                  </span>
                )}
                {request.prescription.status === "REJECTED" && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-[#A2363A] border border-rose-200">
                    <AlertCircle className="w-3.5 h-3.5 text-[#A2363A]" />
                    <span>Prescription Rejected</span>
                  </span>
                )}
              </div>
            </div>

            {/* Replacement Success Banner */}
            {replacementSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{replacementSuccess}</span>
              </div>
            )}

            {/* Rejection Notice Banner (If Rejected) */}
            {request.prescription.status === "REJECTED" && (
              <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-[#A2363A] flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-[#A2363A]">
                      Review Decision: Prescription Rejected by Medical Reviewer
                    </h3>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <strong>Hospital Remarks:</strong> {request.prescription.remarks || "No detailed remarks provided."}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      In accordance with clinical safety regulations, blood arrangement cannot proceed until a valid, clear prescription is verified.
                    </p>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setReplacementError(null);
                      setReplacementFile(null);
                      setShowReplacementModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#A2363A] hover:bg-[#85272b] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload Replacement Prescription</span>
                  </button>
                </div>
              </div>
            )}

            {/* Prescription Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                  Attending / Prescribing Doctor
                </span>
                <span className="font-bold text-[#053845] block mt-0.5">
                  {request.prescription.doctorname || "Attending Physician"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                  Issuing Clinic / Hospital
                </span>
                <span className="font-bold text-[#053845] block mt-0.5 truncate">
                  {request.prescription.hospitalname || request.hospitals?.hospitalname || "Prescribing Hospital"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
                  Uploaded File Details
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

            {/* Actions Bar */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-100">
              <div className="flex items-center gap-2">
                <a
                  href={api.bloodRequests.getPrescriptionDownloadUrl(request.requestid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-[#F3E9D1] text-[#053845] font-semibold border border-[#F3E9D1] transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Prescription Document</span>
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

              {request.prescriptionhistory && request.prescriptionhistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPrescriptionHistory(!showPrescriptionHistory)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#317786] font-semibold hover:underline cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>
                    {showPrescriptionHistory ? "Hide Version History" : `Past Reviews & History (${request.prescriptionhistory.length})`}
                  </span>
                </button>
              )}
            </div>

            {/* Collapsible History Section */}
            {showPrescriptionHistory && request.prescriptionhistory && request.prescriptionhistory.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2 animate-in fade-in duration-150">
                <h4 className="text-xs font-bold text-[#053845] uppercase tracking-wider">
                  Prescription Review &amp; Version History
                </h4>
                <div className="space-y-2">
                  {request.prescriptionhistory.map((hist) => (
                    <div
                      key={hist.historyid}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            hist.status === "VERIFIED"
                              ? "bg-emerald-100 text-emerald-800"
                              : hist.status === "REJECTED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {hist.status}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(hist.createdat)}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        <strong>File:</strong> {hist.originalfilename || "Prescription Document"}
                        {hist.hospitals?.hospitalname && (
                          <span> • <strong>Reviewed by:</strong> {hist.hospitals.hospitalname}</span>
                        )}
                      </p>
                      {hist.remarks && (
                        <p className="text-slate-700 text-[11px] italic bg-white p-2 rounded border border-slate-100">
                          &quot;{hist.remarks}&quot;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Emergency Blood Broadcast Card (Phase 3) */}
        <EmergencyBroadcastCard
          requestId={request.requestid}
          isEmergency={Boolean(request.isemergency)}
          urgencyLevel={request.urgencylevel}
          canManage={request.status !== "CANCELLED" && request.status !== "FULFILLED" && request.status !== "EXPIRED"}
          isTerminal={request.status === "CANCELLED" || request.status === "FULFILLED" || request.status === "EXPIRED"}
          onRefreshParent={() => fetchRequestDetails()}
        />

        {/* Card 1: Voluntary Donor Responses (Top Priority Section) */}
        <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#F3E9D1] gap-2">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-[#A2363A]" />
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Voluntary Donor Responses
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] px-2.5 py-0.5 rounded-full">
                {(request.volunteers || []).length} {(request.volunteers || []).length === 1 ? "Volunteer" : "Volunteers"} Connected
              </span>
              <Link
                href={`/requester/donors?requestId=${request.requestid}`}
                className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors flex items-center gap-1"
              >
                <span>Open Available Donors Page</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {request.volunteers && request.volunteers.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                The following verified donors have cleared mandatory pre-donation screening (including 24-hr alcohol and health clearance) and pledged for this requisition.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {request.volunteers.map((vol) => (
                  <div
                    key={vol.notificationid}
                    className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[#A2363A] text-white flex items-center justify-center font-serif font-bold text-xs shadow-2xs">
                          {mapBloodGroupToDisplay(vol.donorBloodGroup)}
                        </div>
                        <div>
                          <span className="font-bold text-[#053845] block text-sm">
                            {vol.donorName}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Donor Group: <strong className="text-[#A2363A] font-semibold">{mapBloodGroupToDisplay(vol.donorBloodGroup)}</strong>
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#053845] bg-white border border-[#F3E9D1] px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
                        <CheckCircle2 className="w-3 h-3 text-[#317786]" />
                        <span>Screened &bull; Eligible</span>
                      </span>
                    </div>

                    {vol.estimatedArrival && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-xl border border-[#F3E9D1]">
                        <Clock className="w-3.5 h-3.5 text-[#317786]" />
                        <span>Pledged Arrival: <strong className="text-[#053845]">{vol.estimatedArrival}</strong></span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-[#F3E9D1] flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#B94F30]" />
                        <span>{vol.donorCity || "Registered Area"}</span>
                      </span>
                      {vol.donorPhone ? (
                        <a
                          href={`tel:${vol.donorPhone}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Call {vol.donorPhone}</span>
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400">{formatTimeAgo(vol.respondedAt)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-[#F3E9D1] text-[11px] text-slate-600 space-y-1 mt-2">
                <p className="font-semibold text-[#053845] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#317786]" />
                  <span>Clinical Donation Protocol</span>
                </p>
                <p className="leading-relaxed text-slate-500">
                  A donor volunteer response indicates availability and consent to donate. Final blood collection is conducted at the attending hospital or licensed blood bank following pre-donation vitals and screening tests.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center space-y-3 rounded-2xl bg-[#FAF6EE]/50 border border-dashed border-[#F3E9D1]">
              <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 flex items-center justify-center mx-auto border border-[#F3E9D1]">
                <Users className="w-6 h-6 text-[#317786]" />
              </div>
              <div className="space-y-1">
                <span className="font-serif text-base font-bold text-[#053845] block">
                  Awaiting Donor Responses
                </span>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Nearby voluntary donors with matching blood group ({bloodGroupDisplay}) have been matched and notified in their donor portals. Responses will appear here in real-time.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Consolidated Clinical & Patient Specifications */}
        <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Droplet className="w-4 h-4 text-[#B94F30]" />
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Patient &amp; Clinical Requisition Specifications
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-[#053845] bg-[#FAF6EE] px-2.5 py-0.5 rounded-md border border-[#F3E9D1]">
              {refId}
            </span>
          </div>

          {/* 4 Feature Tiles Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Blood Group & Units */}
            <div className="p-3.5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Blood Group &amp; Component Required
              </span>
              <span className="font-serif text-lg font-bold text-[#B94F30] block">
                {bloodGroupDisplay} ({request.bloodgroup})
              </span>
              <span className="text-[11px] text-slate-600 block">
                {request.unitsrequired} {request.unitsrequired === 1 ? "Unit" : "Units"} &bull; {componentDisplay}
              </span>
            </div>

            {/* Urgency & Required By */}
            <div className="p-3.5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Urgency &amp; Schedule
              </span>
              <span className="font-serif text-lg font-bold text-[#053845] block">
                {urgencyMeta.label}
              </span>
              <span className="text-[11px] text-slate-600 block">
                Required By: <strong>{formatDateTime(request.requiredby)}</strong>
              </span>
            </div>

            {/* Patient Profile */}
            <div className="p-3.5 rounded-2xl bg-white border border-[#F3E9D1] space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Patient Profile
              </span>
              <span className="font-bold text-[#053845] text-sm block">
                {request.patientname}
              </span>
              <span className="text-[11px] text-slate-600 block">
                {request.patientage} years &bull; {request.patientgender}
              </span>
            </div>

            {/* Emergency Attendant Contact */}
            <div className="p-3.5 rounded-2xl bg-white border border-[#F3E9D1] space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Attendant Contact
              </span>
              <div className="flex items-center justify-between pt-0.5">
                <span className="font-mono font-bold text-[#053845] text-sm block">
                  {request.patientcontact}
                </span>
                <a
                  href={`tel:${request.patientcontact}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#053845] text-white hover:bg-[#317786] font-semibold text-[11px] transition-colors shadow-2xs"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call Attendant</span>
                </a>
              </div>
            </div>
          </div>

          {/* Additional parameters bar */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#317786]" />
              <span>Search Perimeter: <strong>{request.searchradius || 5} km radius</strong> alert boundary</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#317786]" />
              <span>Logged {formatTimeAgo(request.createdat)}</span>
            </span>
          </div>
        </div>

        {/* Card 3: Care Facility & Clinical Notes */}
        <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xs p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Building2 className="w-4 h-4 text-[#053845]" />
            <h2 className="font-serif text-base font-bold text-[#053845]">
              Care Facility &amp; Clinical Instructions
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            {/* Registered Hospital Info */}
            {request.hospitals && (
              <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[#053845] text-sm">
                  <Building2 className="w-4 h-4 text-[#317786]" />
                  <span>{request.hospitals.hospitalname}</span>
                </div>
                <p className="text-slate-600 text-xs">
                  {request.hospitals.address}, {request.hospitals.city} ({request.hospitals.pincode})
                </p>
                {request.hospitals.contactpersonphone && (
                  <p className="text-slate-500 text-[11px] pt-0.5">
                    Facility Desk Contact: <strong className="text-[#053845]">{request.hospitals.contactpersonphone}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Submitted Clinical Notes */}
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold mb-1">
                Submitted Medical Notes &amp; Facility Instructions
              </span>
              <div className="p-3.5 rounded-2xl bg-white border border-[#F3E9D1] text-slate-700 leading-relaxed text-xs">
                {request.notes ? (
                  <p>{request.notes}</p>
                ) : (
                  <p className="text-slate-400 italic">No additional clinical notes specified.</p>
                )}
              </div>
          </div>
        </div>
      </div>
    </div>

      {/* Cancel Requisition Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-[#A2363A] flex items-center justify-center flex-shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-base font-bold text-[#053845]">
                  Cancel Blood Requisition?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to cancel requisition <strong>{refId}</strong> for patient <strong>{request.patientname}</strong>? This will discontinue active donor matching and notify coordinated facilities.
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
                  <span>Yes, Cancel Requisition</span>
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
                <div className="w-9 h-9 rounded-xl bg-[#A2363A]/10 text-[#A2363A] flex items-center justify-center flex-shrink-0">
                  <UploadCloud className="w-5 h-5 text-[#A2363A]" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-[#053845]">
                    Upload Replacement Prescription
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Submit a clear, updated prescription document for hospital re-review
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
              {/* File Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#053845]">
                  Select Prescription Document (PDF, JPEG, PNG, max 5 MB) <span className="text-[#A2363A]">*</span>
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
                    <span>Selected: {replacementFile.name} ({(replacementFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  </p>
                )}
              </div>

              {/* Doctor and Hospital Fields */}
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
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{replacementError}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] text-slate-600">
                • Uploading a replacement will archive your previous submission and return this requisition&apos;s verification status to <strong>PENDING</strong> for review by hospital staff.
              </div>

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
