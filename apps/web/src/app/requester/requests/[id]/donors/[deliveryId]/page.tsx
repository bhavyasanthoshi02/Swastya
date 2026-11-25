"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  User,
  MapPin,
  Phone,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
  AlertCircle,
  Building2,
  Check,
  Navigation,
  HeartHandshake,
  Heart,
  X,
  UploadCloud,
  FileText,
  Eye,
} from "lucide-react";
import { api, VolunteerDonorResponse } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  formatTimeAgo,
} from "@/lib/mappers";

interface RequestSummary {
  requestid: string;
  patientname: string;
  bloodgroup: string;
  bloodcomponent: string;
  unitsrequired: number;
  urgencylevel: string;
  status: string;
  hospitalname: string | null;
  hospitalcity: string | null;
  createdat: string;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RequesterDonorDetailPage() {
  const params = useParams<{ id: string; deliveryId: string }>();
  const searchParams = useSearchParams();
  const requestId = params?.id;
  const deliveryId = params?.deliveryId;
  const fromAvailableDonors = searchParams?.get("from") === "available-donors";
  const backHref = fromAvailableDonors
    ? "/requester/donors"
    : requestId
    ? `/requester/requests/${requestId}`
    : "/requester/requests";
  const backLabel = fromAvailableDonors
    ? "Back to Available Donors"
    : "Back to Blood Request Details";
  const router = useRouter();

  const [requestSummary, setRequestSummary] = useState<RequestSummary | null>(null);
  const [volunteer, setVolunteer] = useState<VolunteerDonorResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isDeciding, setIsDeciding] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isViewingReceipt, setIsViewingReceipt] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState(false);
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchDonorDetails = useCallback(async () => {
    if (!requestId || !deliveryId) return;
    try {
      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);
      const res = await api.bloodRequests.getVolunteerDetail(requestId, deliveryId);
      if (res.success && res.volunteer) {
        setRequestSummary(res.request);
        setVolunteer(res.volunteer);
      } else {
        setErrorStatus(404);
        setErrorMessage("Donor commitment not found.");
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
      setErrorMessage(errObj?.message || "Failed to load donor commitment details.");
    } finally {
      setIsLoading(false);
    }
  }, [requestId, deliveryId]);

  useEffect(() => {
    fetchDonorDetails();
  }, [fetchDonorDetails]);

  const handleDecision = async (decision: "ACCEPTED" | "REJECTED") => {
    if (!requestId || !deliveryId) return;
    try {
      setIsDeciding(true);
      setActionFeedback(null);
      const res = await api.bloodRequests.decideVolunteer(requestId, deliveryId, decision);
      setActionFeedback({
        type: "success",
        text:
          res.message ||
          (decision === "ACCEPTED" ? "Donor offer accepted." : "Donor offer rejected."),
      });
      await fetchDonorDetails();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setActionFeedback({
        type: "error",
        text: errObj?.message || "Failed to update donor decision.",
      });
    } finally {
      setIsDeciding(false);
    }
  };

  const handleUploadReceipt = async (): Promise<boolean> => {
    if (!requestId || !deliveryId || !receiptFile) return false;
    try {
      setIsUploadingReceipt(true);
      setActionFeedback(null);
      const res = await api.bloodRequests.uploadDonationReceipt(requestId, deliveryId, receiptFile);
      setReceiptFile(null);
      setActionFeedback({
        type: "success",
        text: res.message || "Hospital donation receipt uploaded.",
      });
      await fetchDonorDetails();
      return true;
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setActionFeedback({
        type: "error",
        text: errObj?.message || "Failed to upload donation receipt.",
      });
      return false;
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleViewReceipt = async () => {
    if (!requestId || !deliveryId) return;
    try {
      setIsViewingReceipt(true);
      const { blob } = await api.bloodRequests.fetchDonationReceiptBlob(requestId, deliveryId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setActionFeedback({
        type: "error",
        text: errObj?.message || "Failed to open donation receipt.",
      });
    } finally {
      setIsViewingReceipt(false);
    }
  };

  const handleConfirmBloodReceipt = async () => {
    if (!requestId || !deliveryId || isConfirmingReceipt) return;
    try {
      setIsConfirmingReceipt(true);
      setActionFeedback(null);
      if (receiptFile) {
        const uploaded = await handleUploadReceipt();
        if (!uploaded) {
          setIsConfirmingReceipt(false);
          return;
        }
      }
      const res = await api.bloodRequests.confirmBloodReceipt(requestId, deliveryId);
      setShowReceiptModal(false);
      setShowThankYouModal(true);
      setActionFeedback({
        type: "success",
        text: res.message || "Blood receipt confirmed and donor notified.",
      });
      await fetchDonorDetails();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setActionFeedback({
        type: "error",
        text: errObj?.message || "Failed to confirm blood receipt.",
      });
    } finally {
      setIsConfirmingReceipt(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2.5">
        <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading donor commitment details...</p>
      </div>
    );
  }

  if (errorStatus === 403) {
    return (
      <div className="max-w-md mx-auto my-10 p-6 bg-white rounded-2xl border border-[#F3E9D1] text-center space-y-3 shadow-2xs">
        <div className="w-10 h-10 rounded-xl bg-rose-50 text-[#A2363A] flex items-center justify-center mx-auto">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h1 className="font-serif text-lg font-bold text-[#053845]">Access Denied</h1>
          <p className="text-xs text-slate-600">
            {errorMessage || "You do not have permission to view this donor commitment."}
          </p>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{backLabel}</span>
        </Link>
      </div>
    );
  }

  if (errorStatus || !volunteer || !requestSummary) {
    return (
      <div className="max-w-md mx-auto my-10 p-6 bg-white rounded-2xl border border-[#F3E9D1] text-center space-y-3 shadow-2xs">
        <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] text-[#B94F30] flex items-center justify-center mx-auto">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h1 className="font-serif text-lg font-bold text-[#053845]">Donor Commitment Not Found</h1>
          <p className="text-xs text-slate-600">
            {errorMessage || "The requested donor commitment could not be found."}
          </p>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{backLabel}</span>
        </Link>
      </div>
    );
  }

  const acceptance = (volunteer.acceptanceStatus || "PENDING").toUpperCase();
  const transit = (volunteer.transitStatus || volunteer.status || "DONOR_FOUND").toUpperCase();
  const isPendingDecision = acceptance === "PENDING";
  const isAccepted = acceptance === "ACCEPTED";
  const isRejected = acceptance === "REJECTED";
  const isCompleted = transit === "COMPLETED" && isAccepted;
  const isTerminalRequest = ["CANCELLED", "FULFILLED", "EXPIRED"].includes(
    (requestSummary.status || "").toUpperCase()
  );
  const canConfirmReceipt =
    isAccepted && transit === "REACHED_LOCATION" && !isTerminalRequest;

  const acceptanceBadge = isRejected
    ? { label: "Rejected", cls: "bg-rose-50 text-[#A2363A] border-rose-200" }
    : isAccepted
    ? { label: "Accepted", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : { label: "Pending Review", cls: "bg-amber-50 text-amber-800 border-amber-200" };

  const journeyStages = [
    {
      key: "VOLUNTEERED",
      label: "Volunteered",
      icon: HeartHandshake,
      completed: true,
      current: isPendingDecision,
      rejected: false,
      timestamp: formatDateTime(volunteer.respondedAt),
    },
    {
      key: "ACCEPTED",
      label: isRejected ? "Rejected" : "Accepted",
      icon: isRejected ? XCircle : Check,
      completed: isAccepted || isRejected,
      current: isAccepted && transit === "DONOR_FOUND",
      rejected: isRejected,
      timestamp: formatDateTime(isRejected ? volunteer.rejectedAt : volunteer.acceptedAt),
    },
    {
      key: "STARTED",
      label: "On the Way",
      icon: Navigation,
      completed: isAccepted && ["STARTED", "REACHED_LOCATION", "COMPLETED"].includes(transit),
      current: isAccepted && transit === "STARTED",
      rejected: false,
      timestamp: formatDateTime(volunteer.startedAt),
    },
    {
      key: "REACHED_LOCATION",
      label: "Reached Hospital",
      icon: MapPin,
      completed: isAccepted && ["REACHED_LOCATION", "COMPLETED"].includes(transit),
      current: isAccepted && transit === "REACHED_LOCATION",
      rejected: false,
      timestamp: formatDateTime(volunteer.reachedAt),
    },
    {
      key: "COMPLETED",
      label: "Blood Received",
      icon: CheckCircle2,
      completed: isCompleted,
      current: isCompleted,
      rejected: false,
      timestamp: formatDateTime(volunteer.receiptConfirmedAt || volunteer.completedAt),
    },
  ];

  const timelineItems = [
    { label: "Volunteer response", value: formatDateTime(volunteer.respondedAt) },
    { label: "Requester acceptance", value: formatDateTime(volunteer.acceptedAt) },
    ...(isRejected
      ? [{ label: "Offer declined", value: formatDateTime(volunteer.rejectedAt) }]
      : []),
    { label: "Journey started", value: formatDateTime(volunteer.startedAt) },
    { label: "Reached hospital", value: formatDateTime(volunteer.reachedAt) },
    {
      label: "Blood received confirmation",
      value: formatDateTime(volunteer.receiptConfirmedAt || volunteer.completedAt),
    },
  ].filter((item) => Boolean(item.value));

  const donorLocation = [volunteer.donorCity, volunteer.donorState].filter(Boolean).join(", ");
  const hospitalFacility = [requestSummary.hospitalname, requestSummary.hospitalcity]
    .filter(Boolean)
    .join(", ");
  const donorRef = (volunteer.deliveryId || deliveryId || "").slice(0, 8).toUpperCase();
  const reqRef = requestSummary.requestid.slice(0, 8).toUpperCase();
  const bloodGroupDisplay = mapBloodGroupToDisplay(volunteer.donorBloodGroup);

  return (
    <div className="max-w-5xl mx-auto py-3 sm:py-5 space-y-4">
      {/* 2. Compact Page Header */}
      <header className="space-y-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{backLabel}</span>
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-xl bg-[#317786]/10 border border-[#317786]/25 font-serif text-sm font-bold text-[#053845] shrink-0">
              {bloodGroupDisplay}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] truncate">
                  {volunteer.donorName}
                </h1>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${acceptanceBadge.cls}`}
                >
                  {acceptanceBadge.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                Donor Ref #{donorRef} &middot; Request #{reqRef} &middot; Patient{" "}
                {requestSummary.patientname} ({mapBloodGroupToDisplay(requestSummary.bloodgroup)}{" "}
                {mapBloodComponentToDisplay(requestSummary.bloodcomponent)})
              </p>
            </div>
          </div>

          {isPendingDecision && !isTerminalRequest && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isDeciding}
                onClick={() => handleDecision("ACCEPTED")}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isDeciding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Accept Donor</span>
              </button>
              <button
                type="button"
                disabled={isDeciding}
                onClick={() => handleDecision("REJECTED")}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#A2363A] bg-rose-50 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {actionFeedback && (
        <div
          className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border ${
            actionFeedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-[#A2363A]"
          }`}
        >
          <span>{actionFeedback.text}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-current/70 hover:text-current cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Compact Donor Information Section */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center gap-2 pb-3 mb-3.5 border-b border-[#F3E9D1]/70">
          <User className="w-4 h-4 text-[#317786]" />
          <h2 className="font-serif text-base font-bold text-[#053845]">Donor Information</h2>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-xs">
          <div>
            <dt className="text-[11px] font-medium text-slate-500">Blood Group</dt>
            <dd className="mt-0.5 font-semibold text-[#053845]">{bloodGroupDisplay}</dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium text-slate-500">Donor Location</dt>
            <dd className="mt-0.5 font-medium text-[#053845] inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
              <span>{donorLocation || "Location unavailable"}</span>
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium text-slate-500">Provided ETA</dt>
            <dd className="mt-0.5 font-medium text-[#053845] inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#317786] shrink-0" />
              <span>{volunteer.estimatedArrival || "Not provided"}</span>
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium text-slate-500">Assigned Hospital / Facility</dt>
            <dd className="mt-0.5 font-medium text-[#053845] inline-flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
              <span>{hospitalFacility || "No hospital assigned"}</span>
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium text-slate-500">Phone Number</dt>
            <dd className="mt-0.5">
              {!isRejected && volunteer.donorPhone ? (
                <a
                  href={`tel:${volunteer.donorPhone}`}
                  className="inline-flex items-center gap-1 font-semibold text-[#317786] hover:text-[#053845] transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>{volunteer.donorPhone}</span>
                </a>
              ) : (
                <span className="text-slate-400">
                  {isRejected ? "Unavailable for declined offer" : "Unavailable"}
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-[11px] font-medium text-slate-500">Email</dt>
            <dd className="mt-0.5">
              {!isRejected && volunteer.donorEmail ? (
                <a
                  href={`mailto:${volunteer.donorEmail}`}
                  className="inline-flex items-center gap-1 font-medium text-[#053845] hover:text-[#317786] transition-colors truncate max-w-full"
                >
                  <Mail className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                  <span className="truncate">{volunteer.donorEmail}</span>
                </a>
              ) : (
                <span className="text-slate-400">
                  {isRejected ? "Unavailable for declined offer" : "Unavailable"}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* 4. Donor Journey Tracker (Visual Focus, Compact Stepper) */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F3E9D1]/70">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#317786]" />
            <h2 className="font-serif text-base font-bold text-[#053845]">Donor Journey Tracker</h2>
          </div>
          <span className="text-[11px] text-slate-500">
            Volunteered {formatTimeAgo(volunteer.respondedAt)}
          </span>
        </div>

        {/* Desktop Horizontal Stepper */}
        <div className="hidden md:grid md:grid-cols-5 items-start">
          {journeyStages.map((stage, idx) => {
            const Icon = stage.icon;
            const prevCompleted = idx > 0 && journeyStages[idx - 1].completed && (stage.completed || stage.current);
            const nextCompleted = idx < journeyStages.length - 1 && stage.completed && journeyStages[idx + 1].completed;

            return (
              <div key={stage.key} className="flex flex-col items-center text-center">
                <div className="w-full flex items-center">
                  <div
                    className={`h-0.5 flex-1 ${
                      idx === 0
                        ? "bg-transparent"
                        : prevCompleted
                        ? "bg-[#317786]"
                        : "bg-slate-200"
                    }`}
                  />
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                      stage.rejected
                        ? "bg-rose-50 border-[#A2363A] text-[#A2363A]"
                        : stage.current
                        ? "bg-[#053845] border-[#053845] text-white ring-4 ring-[#317786]/15"
                        : stage.completed
                        ? "bg-[#317786] border-[#317786] text-white"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div
                    className={`h-0.5 flex-1 ${
                      idx === journeyStages.length - 1
                        ? "bg-transparent"
                        : nextCompleted
                        ? "bg-[#317786]"
                        : "bg-slate-200"
                    }`}
                  />
                </div>

                <span
                  className={`mt-2 text-xs font-semibold ${
                    stage.rejected
                      ? "text-[#A2363A]"
                      : stage.current || stage.completed
                      ? "text-[#053845]"
                      : "text-slate-400"
                  }`}
                >
                  {stage.label}
                </span>

                {stage.timestamp && (
                  <span className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                    {stage.timestamp}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile Vertical Stepper */}
        <div className="md:hidden space-y-3">
          {journeyStages.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div key={stage.key} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border shrink-0 ${
                      stage.rejected
                        ? "bg-rose-50 border-[#A2363A] text-[#A2363A]"
                        : stage.current
                        ? "bg-[#053845] border-[#053845] text-white ring-2 ring-[#317786]/20"
                        : stage.completed
                        ? "bg-[#317786] border-[#317786] text-white"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {idx < journeyStages.length - 1 && (
                    <div
                      className={`w-0.5 h-4 mt-1 ${
                        stage.completed && journeyStages[idx + 1].completed
                          ? "bg-[#317786]"
                          : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>

                <div className="pt-1 min-w-0">
                  <p
                    className={`text-xs font-semibold ${
                      stage.rejected
                        ? "text-[#A2363A]"
                        : stage.current || stage.completed
                        ? "text-[#053845]"
                        : "text-slate-400"
                    }`}
                  >
                    {stage.label}
                  </p>
                  {stage.timestamp && (
                    <p className="text-[11px] text-slate-500 tabular-nums">{stage.timestamp}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Balanced Grid: Journey Timeline (Left) + Receipt Upload & Confirmation (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* 5. Compact Chronological Journey Timeline */}
        <section className="lg:col-span-6 bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 pb-2.5 border-b border-[#F3E9D1]/70">
            <Clock className="w-4 h-4 text-[#317786]" />
            <h2 className="font-serif text-base font-bold text-[#053845]">Journey Timeline</h2>
          </div>

          {timelineItems.length > 0 ? (
            <ol className="border-l border-[#F3E9D1] ml-1.5 pl-4 space-y-3 text-xs">
              {timelineItems.map((item) => (
                <li key={item.label} className="relative flex items-center justify-between gap-3">
                  <span className="w-2 h-2 rounded-full bg-[#317786] absolute -left-[20.5px]" />
                  <span className="font-medium text-[#053845]">{item.label}</span>
                  <span className="text-slate-500 tabular-nums text-[11px] shrink-0">
                    {item.value}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-slate-500">No journey activity recorded yet.</p>
          )}
        </section>

        {/* Right Column: Hospital Donation Receipt + Blood Receipt Confirmation */}
        <div className="lg:col-span-6 space-y-4">
          {/* 6. Compact Hospital Donation Receipt Document Panel */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#F3E9D1]/70">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#317786]" />
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Hospital Donation Receipt
                </h2>
              </div>
              {volunteer.receiptDocument && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FAF6EE] text-[#317786] border border-[#F3E9D1]">
                  File Uploaded
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Upload the hospital donation slip or receipt issued for this unit. Supported: PDF, JPG, PNG (max 5 MB).
            </p>

            {volunteer.receiptDocument && (
              <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/80 border border-[#F3E9D1] flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-[#053845] truncate">
                    {volunteer.receiptDocument.fileName || "Uploaded receipt"}
                  </p>
                  {volunteer.receiptDocument.fileSize && (
                    <p className="text-[11px] text-slate-500">
                      {(volunteer.receiptDocument.fileSize / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isViewingReceipt}
                  onClick={handleViewReceipt}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#317786] bg-white hover:bg-[#F3E9D1]/60 border border-[#F3E9D1] transition-colors cursor-pointer shrink-0"
                >
                  {isViewingReceipt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>View</span>
                </button>
              </div>
            )}

            {isAccepted && !isRejected ? (
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer">
                    <UploadCloud className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Choose File</span>
                    <input
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/jpg"
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                  </label>

                  {receiptFile ? (
                    <span className="text-xs text-slate-600 truncate max-w-[220px]">
                      Selected: <strong className="text-[#053845]">{receiptFile.name}</strong>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">No file selected</span>
                  )}
                </div>

                {receiptFile && (
                  <button
                    type="button"
                    disabled={isUploadingReceipt}
                    onClick={handleUploadReceipt}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isUploadingReceipt ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="w-3.5 h-3.5" />
                    )}
                    <span>{isUploadingReceipt ? "Uploading..." : "Upload Receipt"}</span>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Receipt upload becomes available once the donor offer is accepted.
              </p>
            )}
          </section>

          {/* 7. Blood Receipt Confirmation */}
          <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-[#F3E9D1]/70">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Blood Receipt Confirmation
              </h2>
            </div>

            {isCompleted ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 text-xs">
                <p className="font-semibold text-emerald-800 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Blood Received – Confirmed</span>
                </p>
                {formatDateTime(volunteer.receiptConfirmedAt || volunteer.completedAt) && (
                  <p className="text-emerald-700">
                    Confirmed on{" "}
                    {formatDateTime(volunteer.receiptConfirmedAt || volunteer.completedAt)}
                  </p>
                )}
              </div>
            ) : canConfirmReceipt ? (
              <div className="space-y-3 text-xs">
                <p className="text-slate-600 leading-relaxed">
                  The donor has arrived at the hospital. Confirming records receipt for this
                  commitment and notifies the donor.
                </p>
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Blood Received</span>
                </button>
              </div>
            ) : isRejected ? (
              <p className="text-xs text-slate-400">
                Receipt confirmation is not applicable because this offer was declined.
              </p>
            ) : (
              <div className="space-y-2.5 text-xs">
                <p className="text-slate-500">
                  Confirmation becomes available after the donor arrives at the hospital.
                </p>
                <button
                  type="button"
                  disabled
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Blood Received</span>
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* 8. Compact Confirmation Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif text-base font-bold text-[#053845]">
                  Confirm Blood Received
                </h3>
                <button
                  type="button"
                  disabled={isConfirmingReceipt}
                  onClick={() => setShowReceiptModal(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs space-y-0.5">
                <p className="font-semibold text-[#053845]">
                  {volunteer.donorName} ({bloodGroupDisplay})
                </p>
                <p className="text-slate-600">Patient: {requestSummary.patientname}</p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Confirm that the blood unit has been received. This records receipt and marks this requisition as fulfilled.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isConfirmingReceipt}
                onClick={() => setShowReceiptModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isConfirmingReceipt}
                onClick={handleConfirmBloodReceipt}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isConfirmingReceipt && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isConfirmingReceipt ? "Confirming..." : "Confirm Blood Received"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Blood Donation Complete Pop Up for Requester */}
      {showThankYouModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 sm:p-7 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-md">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Requisition Fulfilled &amp; Closed</span>
              </span>
              <h2 className="font-serif text-2xl font-bold text-[#053845]">
                Blood Donation Complete
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Blood receipt has been confirmed successfully. The blood donation is complete and this requisition is now closed.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs space-y-1.5 text-left">
              <div className="flex justify-between text-slate-600">
                <span>Blood Provider:</span>
                <span className="font-bold text-[#053845]">{volunteer.donorName}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Patient Name:</span>
                <span className="font-bold text-[#053845]">{requestSummary.patientname}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Units Received:</span>
                <span className="font-bold text-emerald-700">{requestSummary.unitsrequired || 1} Unit(s)</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Status:</span>
                <span className="font-bold text-emerald-700">Fulfilled &amp; Closed</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push("/requester/requests")}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-sm cursor-pointer"
            >
              <span>Okay</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
