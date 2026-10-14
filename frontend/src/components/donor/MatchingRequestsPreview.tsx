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
  Sparkles,
} from "lucide-react";
import { RequestPreviewItem } from "./DonorTypes";
import { RequestDetailModal } from "./RequestDetailModal";

interface MatchingRequestsPreviewProps {
  previews: RequestPreviewItem[];
  donorBloodGroup?: string;
}

export function MatchingRequestsPreview({
  previews,
  donorBloodGroup = "O+",
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
    if (filter === "near") return item.distanceKm <= 5.0;
    return true;
  });

  return (
    <section className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#F3E9D1]/70 bg-gradient-to-r from-white via-[#FAF6EE]/30 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#317786]/10 text-[#317786] flex items-center justify-center shrink-0">
              <Droplet className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg sm:text-xl font-bold text-[#053845]">
                  Blood Requests For You
                </h2>
                <span className="text-xs font-bold text-[#317786] bg-[#317786]/10 px-2.5 py-0.5 rounded-full">
                  {previews.length} Active Matches
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Targeted for your <strong className="text-[#053845] font-semibold">{donorBloodGroup}</strong> blood group within registered perimeter.
              </p>
            </div>
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 mt-3 sm:mt-0 sm:self-center">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-[#053845] text-white shadow-2xs"
                  : "bg-[#FAF6EE] text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
              }`}
            >
              All ({previews.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("critical")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "critical"
                  ? "bg-[#A2363A] text-white shadow-2xs"
                  : "bg-[#FAF6EE] text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
              }`}
            >
              Critical Only
            </button>
            <button
              type="button"
              onClick={() => setFilter("near")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "near"
                  ? "bg-[#317786] text-white shadow-2xs"
                  : "bg-[#FAF6EE] text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
              }`}
            >
              &lt; 5 km
            </button>
          </div>
        </div>

        <Link
          href="/donor/requests"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group self-start sm:self-center"
        >
          <span>View All Requests</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] text-slate-400 mx-auto flex items-center justify-center border border-[#F3E9D1]">
            <Inbox className="w-6 h-6 text-[#317786]" />
          </div>
          <h3 className="font-serif text-base font-semibold text-[#053845]">
            No Requests Found for this Filter
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Try switching to &quot;All&quot; to see all verified requisitions currently matching your profile.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#F3E9D1]/50">
          {filteredRequests.map((item) => {
            const hasResponded = respondedIds.includes(item.id);

            return (
              <div
                key={item.id}
                className="p-5 sm:p-6 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left Details */}
                <div className="flex items-start gap-4 min-w-0">
                  {/* Blood Group Badge */}
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] flex flex-col items-center justify-center shrink-0 shadow-2xs">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold leading-none">
                      GROUP
                    </span>
                    <span className="font-serif font-bold text-base sm:text-lg leading-none mt-1 text-[#053845]">
                      {item.bloodGroup}
                    </span>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          item.urgency === "Critical Emergency"
                            ? "bg-[#A2363A]/10 text-[#A2363A] border border-[#A2363A]/20"
                            : "bg-[#B94F30]/10 text-[#B94F30] border border-[#B94F30]/20"
                        }`}
                      >
                        {item.urgency}
                      </span>

                      <span className="text-xs font-semibold text-slate-700">
                        {item.units} {item.units > 1 ? "Units" : "Unit"} Required
                      </span>

                      <span className="text-slate-300 hidden sm:inline">•</span>

                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{item.postedTime}</span>
                      </span>
                    </div>

                    {/* Hospital Name */}
                    <h3 className="font-serif font-bold text-base sm:text-lg text-[#053845] truncate">
                      {item.hospitalName}
                    </h3>

                    {/* Location & Time */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-[#317786] font-semibold">
                        <MapPin className="w-3.5 h-3.5 text-[#B94F30] shrink-0" />
                        <span>{item.distance}</span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="truncate max-w-xs">{item.location}</span>
                    </div>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2.5 pt-2 md:pt-0 shrink-0 self-start md:self-center">
                  <button
                    type="button"
                    onClick={() => setSelectedRequest(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-all cursor-pointer shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Details</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRespond(item.id)}
                    disabled={hasResponded}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                      hasResponded
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                        : "bg-[#317786] hover:bg-[#245964] text-white"
                    }`}
                  >
                    {hasResponded ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Response Sent</span>
                      </>
                    ) : (
                      <>
                        <Heart className="w-3.5 h-3.5 fill-current" />
                        <span>Can Donate</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Banner */}
      <div className="px-5 py-3 bg-[#FAF6EE]/60 border-t border-[#F3E9D1]/70 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#317786]" />
          <span>Hospitals prioritize voluntary donors within your registered radius.</span>
        </div>
        <Link
          href="/donor/settings"
          className="font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          Adjust Coverage Radius &rarr;
        </Link>
      </div>

      {/* Modal */}
      <RequestDetailModal
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onConfirmDonation={handleRespond}
        hasResponded={selectedRequest ? respondedIds.includes(selectedRequest.id) : false}
      />
    </section>
  );
}
