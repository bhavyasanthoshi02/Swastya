"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  X,
  MapPin,
  Phone,
  Clock,
  ShieldCheck,
  Heart,
  Navigation,
  FileCheck,
  Building2,
  User,
} from "lucide-react";
import { RequestPreviewItem } from "./DonorTypes";
import { DonorCommitmentActions } from "./DonorCommitmentActions";

interface RequestDetailModalProps {
  request: RequestPreviewItem | null;
  onClose: () => void;
  onConfirmDonation?: (requestId: string) => void;
  hasResponded?: boolean;
  transitUpdatingId?: string | null;
  onUpdateTransit?: (
    requestId: string,
    status: "STARTED" | "REACHED_LOCATION",
    deliveryId?: string
  ) => void | Promise<void>;
}

export function RequestDetailModal({
  request,
  onClose,
  hasResponded = false,
  transitUpdatingId = null,
  onUpdateTransit,
}: RequestDetailModalProps) {
  const router = useRouter();

  if (!request) return null;

  const isResponded = hasResponded || Boolean(request.hasResponded);
  const hasRealLocation =
    Boolean(request.location) && request.location !== "Location not specified";
  const hasRealDistance =
    typeof request.distanceKm === "number" || request.locationMatch === "COORDINATES";
  const hasValidMapsQuery =
    hasRealLocation ||
    (Boolean(request.hospitalName) &&
      request.hospitalName !== "Medical Facility Not Specified");

  const urgencyBadgeClass =
    request.urgency === "Critical Emergency" || request.isEmergency
      ? "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/25"
      : request.urgency === "Urgent"
        ? "bg-[#EFA27E]/20 text-[#B94F30] border-[#EFA27E]/45"
        : "bg-[#317786]/10 text-[#317786] border-[#317786]/25";

  const handleRespond = () => {
    onClose();
    const targetId = request.rawId || request.id.replace(/^REQ-/, "");
    router.push(`/donor/requests/${targetId}/donate`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-[#053845]/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="donorRequestModalTitle"
        className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xl max-w-3xl w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Sticky Compact Header */}
        <div className="px-4 py-3.5 sm:px-5 border-b border-[#F3E9D1] bg-[#FAF6EE]/60 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="px-3 py-1.5 rounded-xl bg-[#317786]/10 border border-[#317786]/25 text-[#053845] font-serif font-bold text-base sm:text-lg leading-none shrink-0 mt-0.5">
              {request.bloodGroup}
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-semibold text-slate-500">
                  {request.id}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${urgencyBadgeClass}`}
                >
                  {request.urgencyLabel || request.urgency}
                </span>
                <span className="text-[11px] text-slate-400">
                  Posted {request.postedTime}
                </span>
              </div>

              <h3
                id="donorRequestModalTitle"
                className="font-serif text-lg sm:text-xl font-bold text-[#053845] leading-snug break-words"
              >
                {request.hospitalName}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#053845] hover:bg-white transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Single Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-3.5 text-xs">
          {/* 3. Request Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
              <span className="text-[11px] text-slate-500 block">Urgency Level</span>
              <span
                className={`font-semibold text-sm mt-0.5 block ${request.urgency === "Critical Emergency" || request.isEmergency
                  ? "text-[#A2363A]"
                  : "text-[#053845]"
                  }`}
              >
                {request.urgencyLabel || request.urgency}
              </span>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
              <span className="text-[11px] text-slate-500 block">Blood Requirement</span>
              <span className="font-semibold text-sm text-[#053845] mt-0.5 block">
                {request.units} {request.units > 1 ? "Units" : "Unit"} &middot;{" "}
                {request.bloodComponent || "Whole Blood"}
              </span>
            </div>

            <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1]">
              <span className="text-[11px] text-slate-500 block">Required By</span>
              <span className="font-semibold text-sm text-[#317786] mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {request.requiredByDateTime || request.requiredWithin || "Not specified"}
                </span>
              </span>
            </div>
          </div>

          {/* 4, 5, 6. Hospital & Location + Patient Details & Prescription Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Hospital & Location */}
            <div className="p-3.5 rounded-xl bg-white border border-[#F3E9D1] space-y-2">
              <h4 className="font-serif text-sm font-bold text-[#053845] pb-1.5 border-b border-[#F3E9D1]/70 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#317786]" />
                <span>Hospital &amp; Location</span>
              </h4>

              <dl className="space-y-1.5">
                <div>
                  <dt className="text-[11px] text-slate-500">Facility</dt>
                  <dd className="font-semibold text-[#053845] break-words">
                    {request.hospitalName}
                  </dd>
                </div>

                <div>
                  <dt className="text-[11px] text-slate-500">Address / Area</dt>
                  <dd className="text-slate-700 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                    <span className="break-words">
                      {hasRealLocation ? request.location : "Address not specified"}
                    </span>
                  </dd>
                </div>

                {request.wardOrRoom && (
                  <div>
                    <dt className="text-[11px] text-slate-500">Ward / Room / Bed</dt>
                    <dd className="font-medium text-[#053845] break-words">
                      {request.wardOrRoom}
                    </dd>
                  </div>
                )}

                {hasRealDistance && (
                  <div>
                    <dt className="text-[11px] text-slate-500">Matching Distance</dt>
                    <dd className="font-semibold text-[#317786]">{request.distance}</dd>
                  </div>
                )}

                {request.contactPhone && (
                  <div>
                    <dt className="text-[11px] text-slate-500">Facility Contact</dt>
                    <dd>
                      <a
                        href={`tel:${request.contactPhone}`}
                        className="inline-flex items-center gap-1 font-semibold text-[#053845] hover:text-[#317786] transition-colors"
                      >
                        <Phone className="w-3 h-3 text-[#317786]" />
                        <span>
                          {request.contactPerson
                            ? `${request.contactPerson} (${request.contactPhone})`
                            : request.contactPhone}
                        </span>
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Patient Details & Prescription Status */}
            <div className="p-3.5 rounded-xl bg-white border border-[#F3E9D1] space-y-2.5">
              <h4 className="font-serif text-sm font-bold text-[#053845] pb-1.5 border-b border-[#F3E9D1]/70 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#317786]" />
                <span>Patient Details</span>
              </h4>

              <dl className="space-y-1.5">
                <div>
                  <dt className="text-[11px] text-slate-500">Authorized Patient Info</dt>
                  <dd className="font-semibold text-[#053845]">
                    {request.patientAgeGroup || "Provided upon hospital coordination"}
                  </dd>
                </div>

                {request.caseDetails && (
                  <div>
                    <dt className="text-[11px] text-slate-500">Clinical Notes</dt>
                    <dd className="text-slate-600 leading-relaxed">{request.caseDetails}</dd>
                  </div>
                )}
              </dl>

              {request.prescriptionStatus && (
                <div className="pt-2 border-t border-[#F3E9D1]/70 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Prescription Status</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${request.prescriptionStatus === "VERIFIED"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : request.prescriptionStatus === "REJECTED"
                        ? "bg-rose-50 text-[#A2363A] border-rose-200"
                        : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                  >
                    {request.prescriptionStatus === "VERIFIED"
                      ? "Clinically Verified"
                      : request.prescriptionStatus === "REJECTED"
                        ? "Rejected"
                        : "Pending Hospital Review"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 7. Compact Before You Proceed Checklist */}
          <div className="px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#053845]">
              <FileCheck className="w-3.5 h-3.5 text-[#317786]" />
              <span>Before You Proceed</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Ensure you have had plenty of water and a light meal</li>
              <li>Carry a valid government photo ID (Aadhaar / Voter ID / Driving License)</li>
              <li>No heavy physical exertion immediately after blood donation</li>
            </ul>
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="px-4 py-3 sm:px-5 border-t border-[#F3E9D1] bg-[#FAF6EE]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          {hasValidMapsQuery ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${request.hospitalName !== "Medical Facility Not Specified"
                  ? request.hospitalName
                  : ""
                  } ${hasRealLocation ? request.location : ""}`.trim()
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Open Directions in Maps</span>
            </a>
          ) : (
            <span />
          )}

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] transition-colors cursor-pointer text-center"
            >
              Close
            </button>

            {!isResponded && !request.myCommitment ? (
              <button
                type="button"
                onClick={handleRespond}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                <span>I Can Donate</span>
              </button>
            ) : (
              <DonorCommitmentActions
                item={request}
                hasResponded={isResponded}
                isUpdating={transitUpdatingId === (request.rawId || request.id)}
                onUpdateTransit={onUpdateTransit}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
