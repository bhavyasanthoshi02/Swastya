"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  MapPin,
  Phone,
  Clock,
  ShieldCheck,
  Heart,
  CheckCircle2,
  Navigation,
  FileCheck,
} from "lucide-react";
import { RequestPreviewItem } from "./DonorTypes";

interface RequestDetailModalProps {
  request: RequestPreviewItem | null;
  onClose: () => void;
  onConfirmDonation?: (requestId: string) => void;
  hasResponded?: boolean;
}

export function RequestDetailModal({
  request,
  onClose,
  onConfirmDonation,
  hasResponded = false,
}: RequestDetailModalProps) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(hasResponded);

  if (!request) return null;

  const handleRespond = () => {
    onClose();
    const targetId = request.rawId || request.id.replace(/^REQ-/, "");
    router.push(`/donor/requests/${targetId}/donate`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#053845]/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#F3E9D1] flex items-center justify-between bg-[#FAF6EE]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#A2363A] text-white font-serif font-bold text-lg flex flex-col items-center justify-center shadow-xs">
              <span className="text-[8px] uppercase tracking-wider text-white/80 leading-none">
                NEED
              </span>
              <span className="mt-0.5">{request.bloodGroup}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-lg font-bold text-[#053845] leading-tight">
                  {request.hospitalName}
                </h3>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {request.id} • Posted {request.postedTime}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-[#053845] hover:bg-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Urgency and Units row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Urgency Level
              </span>
              <span
                className={`font-bold text-xs sm:text-sm mt-0.5 block ${
                  request.urgency === "Critical Emergency"
                    ? "text-[#A2363A]"
                    : "text-[#B94F30]"
                }`}
              >
                {request.urgency}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Units Required
              </span>
              <span className="font-bold text-xs sm:text-sm text-[#053845] mt-0.5 block">
                {request.units} {request.units > 1 ? "Units" : "Unit"} Whole Blood
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Required By
              </span>
              <span className="font-bold text-xs sm:text-sm text-[#317786] mt-0.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{request.requiredWithin || "Immediate"}</span>
              </span>
            </div>
          </div>

          {/* Location & Contact Details */}
          <div className="p-4 rounded-2xl bg-white border border-[#F3E9D1] space-y-2.5">
            <div className="flex items-start gap-2.5 text-xs text-slate-700">
              <MapPin className="w-4 h-4 text-[#B94F30] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#053845] block">Hospital Address:</span>
                <span className="text-slate-600">{request.location}</span>
                <span className="text-[#317786] font-semibold block mt-0.5">
                  Approx. {request.distance} from your location
                </span>
              </div>
            </div>

            {request.contactPhone && (
              <div className="flex items-center gap-2.5 pt-2 border-t border-[#F3E9D1]/50 text-xs">
                <Phone className="w-4 h-4 text-[#317786] shrink-0" />
                <div>
                  <span className="text-slate-500">Emergency Desk Coordinator: </span>
                  <a
                    href={`tel:${request.contactPhone}`}
                    className="font-bold text-[#053845] hover:text-[#317786] transition-colors"
                  >
                    {request.contactPerson} ({request.contactPhone})
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Clinical Context */}
          {request.caseDetails && (
            <div className="p-4 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Clinical Context &amp; Reason for Request
              </span>
              <p className="text-xs text-slate-700 leading-relaxed">
                {request.caseDetails}
              </p>
              {request.patientAgeGroup && (
                <div className="text-[11px] text-slate-500 pt-1">
                  Category: <strong className="text-slate-700">{request.patientAgeGroup}</strong>
                </div>
              )}
            </div>
          )}

          {/* Donor Quick Preparation Checklist */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[#053845]">
              <FileCheck className="w-3.5 h-3.5 text-[#317786]" />
              <span>Before You Proceed (Checklist):</span>
            </div>
            <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
              <li>Ensure you have had plenty of water and a light meal</li>
              <li>Carry a valid government photo ID (Aadhaar / Voter ID / Driving License)</li>
              <li>No heavy physical exertion immediately after blood donation</li>
            </ul>
          </div>

          {/* Feedback banner if confirmed */}
          {confirmed && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Hospital Coordinator Notified!</span>
                <span className="text-[11px] text-emerald-700 leading-relaxed block mt-0.5">
                  Your willingness to donate has been registered with the hospital transfusion desk. Please arrive at the donor center at your earliest convenience.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#F3E9D1] bg-[#FAF6EE] flex flex-col sm:flex-row items-center justify-between gap-3">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${request.hospitalName} ${request.location}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Open Directions in Maps</span>
          </a>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-[#053845] bg-white border border-[#F3E9D1] cursor-pointer"
            >
              Close
            </button>

            {!confirmed ? (
              <button
                type="button"
                onClick={handleRespond}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                <span>I Can Donate</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Response Registered</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
