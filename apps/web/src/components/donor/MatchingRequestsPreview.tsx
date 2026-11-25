"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Eye,
  ArrowRight,
  Droplet,
  Heart,
  CheckCircle2,
  Inbox,
  Clock,
  Calendar,
  Building2,
} from "lucide-react";
import { RequestPreviewItem } from "./DonorTypes";
import { RequestDetailModal } from "./RequestDetailModal";
import { DonorCommitmentActions } from "./DonorCommitmentActions";

interface MatchingRequestsPreviewProps {
  previews: RequestPreviewItem[];
  donorBloodGroup?: string;
  transitUpdatingId?: string | null;
  onUpdateTransit?: (
    requestId: string,
    status: "STARTED" | "REACHED_LOCATION",
    deliveryId?: string
  ) => void | Promise<void>;
}

export function MatchingRequestsPreview({
  previews,
  donorBloodGroup = "O+",
  transitUpdatingId = null,
  onUpdateTransit,
}: MatchingRequestsPreviewProps) {
  const [selectedRequest, setSelectedRequest] = useState<RequestPreviewItem | null>(null);
  const [respondedIds, setRespondedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "critical" | "near">("all");

  const handleRespond = (id: string) => {
    if (!respondedIds.includes(id)) {
      setRespondedIds((prev) => [...prev, id]);
    }
  };

  const filteredRequests = previews.filter((item) => {
    if (filter === "critical") return item.urgency === "Critical Emergency";
    if (filter === "near") return typeof item.distanceKm === "number" && item.distanceKm <= 5.0;
    return true;
  });

  return (
    <section className="h-full bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#F3E9D1]/70 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0 mt-0.5">
                <Droplet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-lg font-bold text-[#053845]">
                    Matching Blood Requests
                  </h2>
                  <span className="text-[11px] font-semibold text-[#317786] bg-[#317786]/10 border border-[#317786]/20 px-2 py-0.5 rounded-full shrink-0">
                    {previews.length}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Blood requests matching your blood group ({donorBloodGroup}) and coverage area.
                </p>
              </div>
            </div>

            <Link
              href="/donor/requests"
              className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 shrink-0 pt-1"
            >
              <span>View All Requests</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Compact Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${filter === "all"
                ? "bg-[#053845] text-white"
                : "bg-[#FAF6EE] text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
                }`}
            >
              All ({previews.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("critical")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${filter === "critical"
                ? "bg-[#A2363A] text-white"
                : "bg-[#FAF6EE] text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
                }`}
            >
              Critical Only
            </button>
            <button
              type="button"
              onClick={() => setFilter("near")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${filter === "near"
                ? "bg-[#317786] text-white"
                : "bg-[#FAF6EE] text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
                }`}
            >
              Under 5 km
            </button>
          </div>
        </div>

        {/* Empty States vs Requests List */}
        {previews.length === 0 ? (
          <div className="py-10 px-5 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] mx-auto flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-base font-bold text-[#053845]">
              No matching requests right now
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              We&apos;ll show eligible blood requests here when they match your profile and coverage area.
            </p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-8 px-5 text-center space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] mx-auto flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-serif text-base font-bold text-[#053845]">
                No requests match this filter
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Switch back to All to view {previews.length} matching{" "}
                {previews.length === 1 ? "request" : "requests"}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#053845] text-white hover:bg-[#317786] transition-colors cursor-pointer"
            >
              Show All Requests
            </button>
          </div>
        ) : (
          <div className="p-3.5 sm:p-4 space-y-3 bg-[#FAF6EE]/30">
            {filteredRequests.map((item) => {
              const hasResponded = respondedIds.includes(item.id) || Boolean(item.hasResponded);
              const isUrgentCard =
                Boolean(item.isEmergency) ||
                item.urgency === "Critical Emergency" ||
                item.urgency === "Urgent";
              const urgencyBadgeClass =
                item.urgency === "Critical Emergency"
                  ? "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/25"
                  : item.urgency === "Urgent"
                    ? "bg-[#EFA27E]/20 text-[#B94F30] border-[#EFA27E]/45"
                    : "bg-[#317786]/10 text-[#317786] border-[#317786]/25";
              const hasRealLocation =
                Boolean(item.location) && item.location !== "Location not specified";
              const hasRealDistance =
                typeof item.distanceKm === "number" || item.locationMatch === "COORDINATES";

              return (
                <article
                  key={item.id}
                  className={`bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs hover:border-[#317786]/45 transition-colors space-y-2.5 ${isUrgentCard ? "border-l-4 border-l-[#EFA27E]" : ""
                    }`}
                >
                  {/* A. Request Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="px-2.5 py-1 rounded-lg bg-[#317786]/10 border border-[#317786]/25 font-serif text-sm font-bold text-[#053845] leading-none shrink-0">
                        {item.bloodGroup}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${urgencyBadgeClass}`}
                      >
                        {item.urgencyLabel || item.urgency}
                      </span>

                      <span className="text-xs font-semibold text-[#053845]">
                        {item.units} {item.units > 1 ? "units" : "unit"} &middot;{" "}
                        {item.bloodComponent || "Whole Blood"}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{item.postedTime}</span>
                    </span>
                  </div>

                  {/* B. Request Information */}
                  <div className="space-y-1.5 min-w-0">
                    <div>
                      <h3 className="font-serif text-base font-bold text-[#053845] leading-snug break-words">
                        {item.hospitalName}
                      </h3>
                      {item.patientAgeGroup && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.patientAgeGroup}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 pt-0.5">
                      {item.wardOrRoom && (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                          <span className="break-words">{item.wardOrRoom}</span>
                        </span>
                      )}

                      {hasRealLocation && (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                          <span className="break-words">{item.location}</span>
                        </span>
                      )}

                      {hasRealDistance && (
                        <span className="inline-flex items-center gap-1 font-medium text-[#317786] shrink-0">
                          <span>{item.distance}</span>
                        </span>
                      )}

                      {(item.requiredByDateTime || item.requiredWithin) && (
                        <span className="inline-flex items-center gap-1.5 text-slate-600 shrink-0">
                          <Calendar className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                          <span>
                            {item.requiredByDateTime
                              ? `Required ${item.requiredByDateTime}`
                              : item.requiredWithin}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* C. Actions */}
                  <div className="pt-2.5 border-t border-[#F3E9D1]/70 grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRequest(item)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#317786]" />
                      <span>Details</span>
                    </button>

                    <DonorCommitmentActions
                      item={item}
                      hasResponded={hasResponded}
                      isUpdating={transitUpdatingId === (item.rawId || item.id)}
                      onUpdateTransit={onUpdateTransit}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Compact Footer */}
      <div className="px-4 sm:px-5 py-2.5 bg-[#FAF6EE]/60 border-t border-[#F3E9D1]/70 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Hospitals prioritize donors within your matching radius.</span>
        <Link
          href="/donor/settings"
          className="font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          Adjust Coverage Radius &rarr;
        </Link>
      </div>

      <RequestDetailModal
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onConfirmDonation={handleRespond}
        hasResponded={selectedRequest ? respondedIds.includes(selectedRequest.id) : false}
        transitUpdatingId={transitUpdatingId}
        onUpdateTransit={onUpdateTransit}
      />
    </section>
  );
}
