"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Check,
  X,
  Loader2,
  Heart,
  Navigation,
  Building,
  Car,
  FileText,
  Eye,
  Download,
  AlertTriangle,
  RefreshCw,
  Users,
  UserCheck,
} from "lucide-react";
import { api, BloodRequestItem, VolunteerDonorResponse } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatTimeAgo,
} from "@/lib/mappers";

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
  const router = useRouter();
  const requestId = params?.id as string;

  const [request, setRequest] = useState<BloodRequestItem | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Facility Action States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingTransit, setIsUpdatingTransit] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [selectedDeliveryMode, setSelectedDeliveryMode] = useState<"FACILITY_DELIVERY" | "SELF_PICKUP" | null>(null);
  const [modalDismissed, setModalDismissed] = useState(false);
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [thankYouDismissed, setThankYouDismissed] = useState(false);

  const fetchRequestDetails = useCallback(async (isRefresh = false) => {
    if (!requestId) return;
    try {
      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      // Load user profile
      const authRes = await api.auth.me().catch(() => null);
      if (authRes?.success && authRes.user) {
        setCurrentUser(authRes.user);
      }

      const data = await api.bloodRequests.getById(requestId);
      if (data && data.requestid) {
        setRequest(data);
      } else {
        setError("Requisition not found.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load requisition details.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchRequestDetails();
  }, [fetchRequestDetails]);

  // Resolve facility commitment
  const commitment: VolunteerDonorResponse | null =
    request?.myCommitment ||
    (currentUser?.userid ? request?.volunteers?.find((v) => v.donorUserId === currentUser.userid) : null) ||
    null;

  const hasResponded = Boolean(commitment && commitment.acceptanceStatus);
  const isAcceptedByRequester = commitment?.acceptanceStatus === "ACCEPTED";
  const isPendingRequester = commitment?.acceptanceStatus === "PENDING";
  const isRejectedByRequester = commitment?.acceptanceStatus === "REJECTED";
  const isDeclined = commitment?.acceptanceStatus === "DECLINED";

  // Parse metadata from notes
  let metaData: any = {};
  if (commitment?.transitnotes) {
    try {
      metaData = JSON.parse(commitment.transitnotes);
    } catch {}
  } else if (commitment?.notes) {
    try {
      metaData = JSON.parse(commitment.notes);
    } catch {}
  }

  const deliveryMode: "FACILITY_DELIVERY" | "SELF_PICKUP" | null =
    selectedDeliveryMode ||
    (commitment as any)?.deliveryMode ||
    metaData.deliveryMode ||
    (metaData.notes?.includes("Self-Pickup") || commitment?.notes?.includes("Self-Pickup") ? "SELF_PICKUP" : null) ||
    (metaData.notes?.includes("Hospital staff") || metaData.notes?.includes("delivery") || commitment?.notes?.includes("delivery") || commitment?.notes?.includes("assigned") ? "FACILITY_DELIVERY" : null);

  const transitStatus = (commitment?.transitStatus || commitment?.status || "DONOR_FOUND").toUpperCase();
  const isCompleted = transitStatus === "COMPLETED" || request?.status === "FULFILLED";

  // Prompt modal when requester accepts if delivery mode not decided yet
  useEffect(() => {
    if (isAcceptedByRequester && !deliveryMode && !modalDismissed && !showDeliveryModal && transitStatus === "DONOR_FOUND" && !isCompleted) {
      setShowDeliveryModal(true);
    }
  }, [isAcceptedByRequester, deliveryMode, modalDismissed, showDeliveryModal, transitStatus, isCompleted]);

  // Prompt celebratory Thank You modal when requisition is fulfilled & closed
  useEffect(() => {
    if (isCompleted && !thankYouDismissed && !showThankYouModal) {
      setShowThankYouModal(true);
    }
  }, [isCompleted, thankYouDismissed, showThankYouModal]);

  const handleAcceptBloodRequest = async () => {
    if (!requestId || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setActionSuccess(null);
      setError(null);

      const res = await api.bloodRequests.respondToRequest(requestId, {
        action: "ACCEPT",
        notes: "Blood units confirmed available by hospital facility",
      });

      setActionSuccess(res.message || "Blood availability confirmed! Offer submitted to requester.");
      await fetchRequestDetails(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept blood requisition.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeclineBloodRequest = async () => {
    if (!requestId || isSubmitting) return;
    if (!confirm("Are you sure you want to decline this requisition?")) return;
    try {
      setIsSubmitting(true);
      setActionSuccess(null);
      setError(null);

      const res = await api.bloodRequests.respondToRequest(requestId, {
        action: "DECLINE",
      });

      setActionSuccess(res.message || "Blood requisition declined.");
      await fetchRequestDetails(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to decline blood requisition.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectDeliveryMode = async (mode: "FACILITY_DELIVERY" | "SELF_PICKUP") => {
    if (!requestId || isUpdatingTransit) return;
    const targetDeliveryId = commitment?.deliveryId || (request as any)?.myCommitment?.deliveryId || request?.volunteers?.[0]?.deliveryId;
    if (!targetDeliveryId) {
      setError("Delivery record not found yet. Please refresh the page.");
      return;
    }
    try {
      setIsUpdatingTransit(true);
      setError(null);
      setSelectedDeliveryMode(mode);
      setShowDeliveryModal(false);
      setModalDismissed(true);

      if (mode === "FACILITY_DELIVERY") {
        await api.bloodRequests.updateTransitStatus(requestId, "DONOR_FOUND", {
          deliveryId: targetDeliveryId,
          deliveryMode: "FACILITY_DELIVERY",
          notes: "Hospital staff delivery assigned",
        });
        setActionSuccess("Delivery assigned: Hospital member will transport the blood units.");
      } else {
        await api.bloodRequests.updateTransitStatus(requestId, "REACHED_LOCATION", {
          deliveryId: targetDeliveryId,
          deliveryMode: "SELF_PICKUP",
          notes: "Requester family self-pickup arranged at hospital",
        });
        setActionSuccess("Self-pickup arranged: Requester/family member will collect blood units from hospital.");
      }

      await fetchRequestDetails(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set delivery method.");
    } finally {
      setIsUpdatingTransit(false);
    }
  };

  const handleUpdateTransit = async (newStatus: "STARTED" | "REACHED_LOCATION") => {
    if (!requestId || isUpdatingTransit) return;
    const targetDeliveryId = commitment?.deliveryId || (request as any)?.myCommitment?.deliveryId || request?.volunteers?.[0]?.deliveryId;
    if (!targetDeliveryId) return;
    try {
      setIsUpdatingTransit(true);
      setError(null);

      const res = await api.bloodRequests.updateTransitStatus(requestId, newStatus, {
        deliveryId: targetDeliveryId,
      });

      setActionSuccess(
        res.message ||
          (newStatus === "STARTED"
            ? "Journey started! Requester has been notified that blood is on the way."
            : "Arrival recorded! Reached destination.")
      );
      await fetchRequestDetails(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update journey status.");
    } finally {
      setIsUpdatingTransit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading requisition details...</p>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-[#F3E9D1] text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-[#A2363A] flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-serif text-lg font-bold text-[#053845]">Requisition Error</h2>
          <p className="text-xs text-slate-600">{error}</p>
        </div>
        <Link
          href="/hospital/requests"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Requisitions</span>
        </Link>
      </div>
    );
  }

  if (!request) return null;

  const bloodGroupDisplay = mapBloodGroupToDisplay(request.bloodgroup);
  const componentDisplay = mapBloodComponentToDisplay(request.bloodcomponent);
  const urgencyMeta = mapUrgencyBadge(request.urgencylevel);
  const rawStatusMeta = mapRequestStatusToDisplay(request.status);
  const statusMeta = isCompleted
    ? {
        label: "Fulfilled (Closed)",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
        dotClass: "bg-emerald-600",
      }
    : rawStatusMeta;
  const refId = `REQ-${request.requestid.slice(0, 8).toUpperCase()}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 px-4">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2">
        <div className="flex items-center gap-2 text-slate-500">
          <Link href="/hospital/dashboard" className="hover:text-[#053845] transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/hospital/requests" className="hover:text-[#053845] transition-colors">
            Blood Requests
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#053845]">{refId}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchRequestDetails(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-slate-700 hover:bg-[#FAF6EE] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/hospital/requests"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Requisitions</span>
          </Link>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {actionSuccess && (
        <div className="flex items-center justify-between gap-2 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#A2363A] shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Request Summary Card */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm space-y-5">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#F3E9D1]/70">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl font-bold text-[#053845]">
                {request.patientname}
              </h1>
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
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
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${urgencyMeta.badgeClass}`}
            >
              {urgencyMeta.label}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusMeta.badgeClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
              <span>{statusMeta.label}</span>
            </span>
          </div>
        </div>

        {/* Blood Requirements Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#317786] text-white flex flex-col items-center justify-center shadow-sm shrink-0">
              <span className="font-serif text-xl font-bold leading-none">{bloodGroupDisplay}</span>
              <span className="text-[10px] font-medium tracking-wide mt-1 uppercase text-slate-100">
                {componentDisplay}
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-base font-bold text-[#053845]">
                {request.unitsrequired} {request.unitsrequired === 1 ? "unit" : "units"} required
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                <span>Required by: {formatDateTime(request.requiredby)}</span>
              </div>
            </div>
          </div>

          {request.patientcontact && (
            <div className="flex items-center gap-2">
              <a
                href={`tel:${request.patientcontact}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-[#F3E9D1] text-[#053845] hover:bg-[#FAF6EE] transition-colors shadow-2xs"
              >
                <Phone className="w-3.5 h-3.5 text-[#317786]" />
                <span>Call Patient ({request.patientcontact})</span>
              </a>
            </div>
          )}
        </div>

        {/* Patient, Requester & Location Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2">
            <h3 className="font-semibold text-[#053845] flex items-center gap-1.5 text-sm">
              <Users className="w-4 h-4 text-[#317786]" />
              <span>Contact & Patient Details</span>
            </h3>
            <div className="space-y-1 text-slate-600">
              <p>
                <strong className="text-slate-700">Patient:</strong> {request.patientname} (
                {request.patientage || "N/A"} yrs, {request.patientgender || "N/A"})
              </p>
              <p>
                <strong className="text-slate-700">Patient Phone:</strong> {request.patientcontact || "Not provided"}
              </p>
              <p>
                <strong className="text-slate-700">Requester:</strong>{" "}
                {request.users?.name || (request.requesters as any)?.users?.name || "Family Member"}
              </p>
              <p>
                <strong className="text-slate-700">Requester Phone:</strong>{" "}
                {request.users?.phonenumber || (request.requesters as any)?.users?.phonenumber || "Not provided"}
              </p>
              <p>
                <strong className="text-slate-700">Requester Email:</strong>{" "}
                {request.users?.email || (request.requesters as any)?.users?.email || "Not provided"}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2">
            <h3 className="font-semibold text-[#053845] flex items-center gap-1.5 text-sm">
              <MapPin className="w-4 h-4 text-[#317786]" />
              <span>Hospital & Instructions</span>
            </h3>
            <div className="space-y-1 text-slate-600">
              <p>
                <strong className="text-slate-700">Facility:</strong>{" "}
                {request.hospitals?.hospitalname || request.prescription?.hospitalname || "Care Facility"}
              </p>
              <p>
                <strong className="text-slate-700">Location:</strong>{" "}
                {request.hospitals?.city || "Registered Area"}
              </p>
              <p>
                <strong className="text-slate-700">Clinical Notes:</strong>{" "}
                {request.notes || "No special instructions provided."}
              </p>
              {request.prescription && (
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { blob } = await api.bloodRequests.fetchPrescriptionBlob(request.requestid);
                        const url = URL.createObjectURL(blob);
                        window.open(url, "_blank");
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                      } catch (err: unknown) {
                        alert(err instanceof Error ? err.message : "Failed to open prescription");
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#317786] text-white hover:bg-[#053845] transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Prescription</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Action / Fulfillment Workflow Card */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
          <h2 className="font-serif text-lg font-bold text-[#053845] flex items-center gap-2">
            <Heart className="w-5 h-5 text-[#317786]" />
            <span>Blood Availability & Delivery Status</span>
          </h2>
        </div>

        {/* 1. If Hospital has not responded yet: Accept or Decline */}
        {!hasResponded || isDeclined ? (
          <div className="p-5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-4">
            <div>
              <h3 className="font-semibold text-[#053845] text-sm">
                Confirm Blood Stock Availability
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Please verify if compatible {bloodGroupDisplay} ({componentDisplay}) is currently available
                in your hospital stock to fulfill this requisition.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleAcceptBloodRequest}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#317786] hover:bg-[#245964] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Accept Request (Blood Available)</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleDeclineBloodRequest}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                <span>Decline (Blood Not Available)</span>
              </button>
            </div>
          </div>
        ) : isPendingRequester ? (
          /* 2. Hospital accepted, waiting for Requester to accept */
          <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <Clock className="w-4 h-4 text-amber-700" />
              <span>Offer Submitted (Blood Available) – Awaiting Requester Decision</span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              You have confirmed blood availability for patient <strong>{request.patientname}</strong>. The
              requester has been notified and their acceptance is pending. Once accepted, delivery or pickup
              options will become available.
            </p>
          </div>
        ) : isRejectedByRequester ? (
          /* 3. Offer Rejected */
          <div className="p-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
            <span className="font-bold">Offer Not Selected:</span> The requester selected an alternative donor or source for this requisition.
          </div>
        ) : isAcceptedByRequester ? (
          /* 4. Requester ACCEPTED Offer: Delivery / Pickup Flow */
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <h3 className="font-bold text-emerald-900 text-sm">Requester Accepted Your Offer!</h3>
                  <p className="text-xs text-emerald-800">
                    The requester has approved your blood provision for patient {request.patientname}.
                  </p>
                </div>
              </div>

              {!deliveryMode && (
                <button
                  type="button"
                  onClick={() => setShowDeliveryModal(true)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#317786] hover:bg-[#053845] transition-colors cursor-pointer shrink-0"
                >
                  Choose Transfer Method
                </button>
              )}
            </div>

            {/* Delivery Option Chosen: Donor-style Live Transit Stepper */}
            {deliveryMode === "FACILITY_DELIVERY" && (
              <div className="p-5 rounded-2xl bg-[#FAF6EE]/80 border border-[#F3E9D1] space-y-5">
                <div className="flex items-center justify-between pb-2 border-b border-[#F3E9D1]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center">
                      <Car className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#053845] text-sm">Hospital Delivery In Progress</h3>
                      <p className="text-[11px] text-slate-500">Live milestone progress &bull; Visible to requester</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeliveryModal(true)}
                    className="text-xs font-semibold text-[#317786] hover:text-[#053845] hover:underline transition-colors"
                  >
                    Change Transfer Option
                  </button>
                </div>

                {/* Donor-Style Circular Stepper with connecting line */}
                <div className="relative py-2">
                  {/* Connecting track line */}
                  <div className="absolute top-5 left-[16%] right-[16%] h-1 bg-[#E8DEC8] -z-0 rounded-full" />
                  <div
                    className="absolute top-5 left-[16%] h-1 bg-[#317786] transition-all duration-500 rounded-full -z-0"
                    style={{
                      width:
                        transitStatus === "COMPLETED" || transitStatus === "REACHED_LOCATION"
                          ? "68%"
                          : transitStatus === "STARTED"
                          ? "34%"
                          : "0%",
                    }}
                  />

                  <div className="grid grid-cols-3 gap-2 text-center relative z-10">
                    {/* Step 1: Blood Prepared */}
                    <div className="flex flex-col items-center space-y-1.5">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#317786] text-white shadow-sm ring-4 ring-[#FAF6EE]">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#053845] block">Blood Prepared</span>
                        <span className="text-[11px] text-slate-500 hidden sm:block">Units Screened &amp; Ready</span>
                      </div>
                    </div>

                    {/* Step 2: On The Way */}
                    <div className="flex flex-col items-center space-y-1.5">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ring-4 ring-[#FAF6EE] ${
                          transitStatus === "STARTED" || transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                            ? "bg-[#317786] text-white shadow-sm"
                            : "bg-white text-slate-400 border border-[#F3E9D1]"
                        }`}
                      >
                        <Car className="w-5 h-5" />
                      </div>
                      <div>
                        <span
                          className={`text-xs font-bold block ${
                            transitStatus === "STARTED" || transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                              ? "text-[#053845]"
                              : "text-slate-400"
                          }`}
                        >
                          On The Way
                        </span>
                        <span className="text-[11px] text-slate-500 hidden sm:block">In Transit to Patient</span>
                      </div>
                    </div>

                    {/* Step 3: Reached Destination */}
                    <div className="flex flex-col items-center space-y-1.5">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ring-4 ring-[#FAF6EE] ${
                          transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                            ? "bg-[#317786] text-white shadow-sm"
                            : "bg-white text-slate-400 border border-[#F3E9D1]"
                        }`}
                      >
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <span
                          className={`text-xs font-bold block ${
                            transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                              ? "text-[#053845]"
                              : "text-slate-400"
                          }`}
                        >
                          Reached Destination
                        </span>
                        <span className="text-[11px] text-slate-500 hidden sm:block">At Facility / Transfusion Desk</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons based on Transit Status */}
                <div className="pt-2 border-t border-[#F3E9D1] space-y-2">
                  {transitStatus === "DONOR_FOUND" && (
                    <button
                      type="button"
                      disabled={isUpdatingTransit}
                      onClick={() => handleUpdateTransit("STARTED")}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                    >
                      {isUpdatingTransit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />}
                      <span>Start Journey (On the Way)</span>
                    </button>
                  )}

                  {transitStatus === "STARTED" && (
                    <button
                      type="button"
                      disabled={isUpdatingTransit}
                      onClick={() => handleUpdateTransit("REACHED_LOCATION")}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
                    >
                      {isUpdatingTransit ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                      <span>Mark Reached Hospital / Destination</span>
                    </button>
                  )}

                  {transitStatus === "REACHED_LOCATION" && (
                    <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-700 shrink-0" />
                      <span>
                        Arrival at destination recorded. Awaiting requester to confirm receipt and close requisition.
                      </span>
                    </div>
                  )}

                  {isCompleted && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-bold text-emerald-900 text-sm">Transfusion Fulfilled &amp; Requisition Closed</p>
                          <p className="text-emerald-800 text-xs">
                            Blood donation &amp; receipt confirmed! Blood units have been successfully received for patient {request.patientname}.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowThankYouModal(true)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors cursor-pointer shrink-0 shadow-2xs"
                      >
                        View Thank You Card
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Self-Pickup Option Chosen */}
            {deliveryMode === "SELF_PICKUP" && (
              <div className="p-5 rounded-2xl bg-[#FAF6EE]/80 border border-[#F3E9D1] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#F3E9D1]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center">
                      <Building className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#053845] text-sm">Requester Family Member Self-Pickup Arranged</h3>
                      <p className="text-[11px] text-slate-500">Pick up scheduled &bull; Units reserved at hospital desk</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeliveryModal(true)}
                    className="text-xs font-semibold text-[#317786] hover:text-[#053845] hover:underline transition-colors"
                  >
                    Change Transfer Option
                  </button>
                </div>

                {/* Self-Pickup Stepper with connecting line */}
                <div className="relative py-2">
                  <div className="absolute top-5 left-[25%] right-[25%] h-1 bg-[#E8DEC8] -z-0 rounded-full" />
                  <div
                    className="absolute top-5 left-[25%] h-1 bg-[#317786] transition-all duration-500 rounded-full -z-0"
                    style={{
                      width: isCompleted ? "50%" : "0%",
                    }}
                  />

                  <div className="grid grid-cols-2 gap-4 text-center relative z-10">
                    <div className="flex flex-col items-center space-y-1.5">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#317786] text-white shadow-sm ring-4 ring-[#FAF6EE]">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#053845] block">Units Ready for Pickup</span>
                        <span className="text-[11px] text-slate-500">Reserved at hospital desk</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center space-y-1.5">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ring-4 ring-[#FAF6EE] ${
                          isCompleted
                            ? "bg-[#317786] text-white shadow-sm"
                            : "bg-white text-slate-400 border border-[#F3E9D1]"
                        }`}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <span
                          className={`text-xs font-bold block ${
                            isCompleted ? "text-[#053845]" : "text-slate-400"
                          }`}
                        >
                          Handed Over &amp; Confirmed
                        </span>
                        <span className="text-[11px] text-slate-500">Receipt verified by requester</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#F3E9D1]">
                  {isCompleted ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-bold text-emerald-900 text-sm">Blood Units Collected &amp; Requisition Closed</p>
                          <p className="text-emerald-800 text-xs">
                            Patient's family collected blood units and verified receipt. Thank you!
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowThankYouModal(true)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors cursor-pointer shrink-0 shadow-2xs"
                      >
                        View Thank You Card
                      </button>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        Blood units are staged and ready. Awaiting requester or family member to visit hospital and confirm receipt.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {/* Delivery Mode Choice Modal */}
      {showDeliveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between pb-2 border-b border-[#F3E9D1]/70">
              <div className="space-y-1">
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Select Blood Transfer Method
                </h3>
                <p className="text-xs text-slate-500">
                  Patient {request.patientname} ({bloodGroupDisplay})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeliveryModal(false);
                  setModalDismissed(true);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              The requester has accepted your offer. Please select how the blood units will be delivered:
            </p>

            <div className="space-y-3 pt-1">
              <button
                type="button"
                disabled={isUpdatingTransit}
                onClick={() => handleSelectDeliveryMode("FACILITY_DELIVERY")}
                className="w-full text-left p-4 rounded-xl border-2 border-[#317786]/30 hover:border-[#317786] bg-[#FAF6EE]/50 hover:bg-[#FAF6EE] transition-all cursor-pointer group space-y-1"
              >
                <div className="flex items-center gap-2 text-[#053845] font-bold text-sm group-hover:text-[#317786]">
                  <Car className="w-4 h-4 text-[#317786]" />
                  <span>Delivery by Hospital Member / Staff</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  A hospital staff member or delivery courier will transport the blood units to the patient's location.
                </p>
              </button>

              <button
                type="button"
                disabled={isUpdatingTransit}
                onClick={() => handleSelectDeliveryMode("SELF_PICKUP")}
                className="w-full text-left p-4 rounded-xl border-2 border-slate-200 hover:border-[#317786] bg-white hover:bg-[#FAF6EE]/40 transition-all cursor-pointer group space-y-1"
              >
                <div className="flex items-center gap-2 text-[#053845] font-bold text-sm group-hover:text-[#317786]">
                  <Users className="w-4 h-4 text-[#B94F30]" />
                  <span>Requester / Family Member Self-Pickup</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Delivery person is not available. The patient's family member will visit the hospital to collect the blood units.
                </p>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowDeliveryModal(false);
                  setModalDismissed(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Celebration Thank You Modal */}
      {showThankYouModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 sm:p-7 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#317786] to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Heart className="w-8 h-8 fill-current animate-pulse text-white" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Requisition Fulfilled &amp; Closed</span>
              </span>
              <h2 className="font-serif text-2xl font-bold text-[#053845]">
                Thank You So Much!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                A life was saved today! We extend our warmest appreciation and heartfelt thanks to your medical team
                for successfully coordinating and providing the life-saving <strong>{bloodGroupDisplay}</strong> ({componentDisplay})
                units for patient <strong>{request.patientname}</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs space-y-1.5 text-left">
              <div className="flex justify-between text-slate-600">
                <span>Care Facility:</span>
                <span className="font-bold text-[#053845]">{request.hospitals?.hospitalname || "Hospital Facility"}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Patient Name:</span>
                <span className="font-bold text-[#053845]">{request.patientname}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Blood Units:</span>
                <span className="font-bold text-emerald-700">{request.unitsrequired || 1} Unit(s)</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Requisition Status:</span>
                <span className="font-bold text-emerald-700">Fulfilled &amp; Closed</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowThankYouModal(false);
                  setThankYouDismissed(true);
                }}
                className="w-full sm:w-1/2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                View Closed Request
              </button>
              <Link
                href="/hospital/requests"
                className="w-full sm:w-1/2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#053845] hover:bg-[#317786] transition-colors"
              >
                <span>Back to Requisitions</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
