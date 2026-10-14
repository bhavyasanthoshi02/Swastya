"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Eye,
  ArrowRight,
  Droplet,
  Clock,
  Inbox,
  ShieldCheck,
  Building2,
  Calendar,
} from "lucide-react";
import { BloodRequestItem } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  mapRequestStatusToDisplay,
  mapUrgencyBadge,
  formatDate,
  formatTimeAgo,
} from "@/lib/mappers";

interface ActiveRequisitionsPreviewProps {
  requests: BloodRequestItem[];
}

export function ActiveRequisitionsPreview({
  requests,
}: ActiveRequisitionsPreviewProps) {
  const [filter, setFilter] = useState<"all" | "critical" | "matching">("all");

  const filtered = requests.filter((item) => {
    if (filter === "critical") {
      return item.urgencylevel?.toUpperCase() === "CRITICAL" || item.isemergency;
    }
    if (filter === "matching") {
      return !["FULFILLED", "CANCELLED", "EXPIRED"].includes(item.status?.toUpperCase());
    }
    return true;
  });

  return (
    <section className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#F3E9D1]/70 bg-gradient-to-r from-white via-[#FAF6EE]/30 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#B94F30]/10 text-[#B94F30] flex items-center justify-center shrink-0">
              <Droplet className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg sm:text-xl font-bold text-[#053845]">
                  Active Blood Requisitions
                </h2>
                <span className="text-xs font-bold text-[#B94F30] bg-[#B94F30]/10 px-2.5 py-0.5 rounded-full">
                  {requests.length} Managed
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time patient needs, voluntary donor responses, and clinical verification logs.
              </p>
            </div>
          </div>

          {/* Quick Filter Tabs (mirrors MatchingRequestsPreview) */}
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
              All ({requests.length})
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
              Emergency Only
            </button>
            <button
              type="button"
              onClick={() => setFilter("matching")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === "matching"
                  ? "bg-[#317786] text-white shadow-2xs"
                  : "bg-[#FAF6EE] text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
              }`}
            >
              In Progress
            </button>
          </div>
        </div>

        <Link
          href="/requester/requests"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group self-start sm:self-center"
        >
          <span>View All Requisitions</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Requests List */}
      {filtered.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] text-slate-400 mx-auto flex items-center justify-center border border-[#F3E9D1]">
            <Inbox className="w-6 h-6 text-[#317786]" />
          </div>
          <h3 className="font-serif text-base font-semibold text-[#053845]">
            No Requisitions Found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            {filter === "all"
              ? "You haven't submitted any clinical blood requisitions yet."
              : "No requests found for this filter criteria."}
          </p>
          <div className="pt-2">
            <Link
              href="/requester/requests/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-xs"
            >
              <span>Raise Blood Request</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[#F3E9D1]/50">
          {filtered.slice(0, 4).map((item) => {
            const statusMeta = mapRequestStatusToDisplay(item.status);
            const urgencyMeta = mapUrgencyBadge(item.urgencylevel);
            const bloodGroupDisplay = mapBloodGroupToDisplay(item.bloodgroup);
            const componentDisplay = mapBloodComponentToDisplay(item.bloodcomponent);
            const refId = `REQ-${item.requestid.slice(0, 8).toUpperCase()}`;

            return (
              <div
                key={item.requestid}
                className="p-5 sm:p-6 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left Details */}
                <div className="flex items-start gap-4 min-w-0">
                  {/* Blood Group Badge (mirrors MatchingRequestsPreview) */}
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] flex flex-col items-center justify-center shrink-0 shadow-2xs">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold leading-none">
                      GROUP
                    </span>
                    <span className="font-serif font-bold text-base sm:text-lg leading-none mt-1 text-[#B94F30]">
                      {bloodGroupDisplay}
                    </span>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-400">
                        {refId}
                      </span>

                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                          item.urgencylevel === "CRITICAL" || item.isemergency
                            ? "bg-[#A2363A]/10 text-[#A2363A] border border-[#A2363A]/20"
                            : "bg-[#B94F30]/10 text-[#B94F30] border border-[#B94F30]/20"
                        }`}
                      >
                        {urgencyMeta.label}
                      </span>

                      <span className="text-xs font-semibold text-slate-700">
                        {item.unitsrequired} {item.unitsrequired > 1 ? "Units" : "Unit"} Required ({componentDisplay})
                      </span>

                      <span className="text-slate-300 hidden sm:inline">•</span>

                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Posted {formatTimeAgo(item.createdat)}</span>
                      </span>
                    </div>

                    {/* Patient & Hospital Info */}
                    <h3 className="font-serif font-bold text-base sm:text-lg text-[#053845] truncate">
                      Patient: {item.patientname} (Age {item.patientage} • {item.patientgender})
                    </h3>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-[#317786] font-semibold">
                        <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>{item.hospitals?.hospitalname || "Regional Medical Center"}</span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="truncate max-w-xs">{item.hospitals?.city || "Area Transfusion"}</span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>Due {formatDate(item.requiredby)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Actions & Status Badge */}
                <div className="flex items-center gap-2.5 pt-2 md:pt-0 shrink-0 self-start md:self-center">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusMeta.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotClass}`} />
                    <span>{statusMeta.label}</span>
                  </span>

                  <Link
                    href={`/requester/requests/${item.requestid}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-all cursor-pointer shadow-2xs"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Track</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Banner */}
      <div className="px-5 py-3 bg-[#FAF6EE]/60 border-t border-[#F3E9D1]/70 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Hospital coordination desk automatically matches voluntary donors in real time.</span>
        </div>
        <Link
          href="/requester/requests"
          className="font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          View All Requests &rarr;
        </Link>
      </div>
    </section>
  );
}
