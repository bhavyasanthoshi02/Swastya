"use client";

import React from "react";
import Link from "next/link";
import {
  Calendar,
  Droplet,
  ArrowRight,
  ShieldCheck,
  Building2,
  CheckCircle2,
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

interface LatestRequisitionCardProps {
  request: BloodRequestItem | null;
}

export function LatestRequisitionCard({
  request,
}: LatestRequisitionCardProps) {
  if (!request) {
    return (
      <section className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-7 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-[#F3E9D1]/70">
          <h2 className="font-serif text-lg font-bold text-[#053845]">
            Latest Requisition Status
          </h2>
          <Link
            href="/requester/requests"
            className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group"
          >
            <span>View All Requests</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="py-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-slate-400 mx-auto flex items-center justify-center">
            <Droplet className="w-6 h-6 text-[#B94F30]" />
          </div>
          <h3 className="font-serif text-base font-semibold text-[#053845]">
            No Requisitions Recorded
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            When you raise a clinical blood requisition, its real-time matching status, blood bank reservations, and donor volunteer logs will be tracked here.
          </p>
          <div className="pt-2">
            <Link
              href="/requester/requests/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-xs"
            >
              <span>Raise First Request</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const statusMeta = mapRequestStatusToDisplay(request.status);
  const urgencyMeta = mapUrgencyBadge(request.urgencylevel);
  const bloodGroupDisplay = mapBloodGroupToDisplay(request.bloodgroup);
  const componentDisplay = mapBloodComponentToDisplay(request.bloodcomponent);
  const refId = `REQ-${request.requestid.slice(0, 8).toUpperCase()}`;

  // Calculate progress percentage based on status
  const getProgressPercentage = (status: string) => {
    switch (status.toUpperCase()) {
      case "CREATED":
        return 20;
      case "VERIFIED":
        return 40;
      case "HOSPITAL_REVIEW":
        return 60;
      case "BLOOD_BANK_CHECK":
        return 70;
      case "DONOR_MATCHING":
        return 80;
      case "BLOOD_ARRANGED":
        return 90;
      case "FULFILLED":
        return 100;
      default:
        return 35;
    }
  };

  const progress = getProgressPercentage(request.status);

  return (
    <section className="bg-white rounded-3xl border border-[#F3E9D1] p-5 sm:p-7 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#F3E9D1]/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold text-[#053845]">
              Latest Requisition Status &amp; Tracking
            </h2>
            <p className="text-xs text-slate-500">
              Reference: <strong className="font-mono text-[#053845]">{refId}</strong> for patient {request.patientname}
            </p>
          </div>
        </div>

        <Link
          href={`/requester/requests/${request.requestid}`}
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group"
        >
          <span>Full Tracking</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Progress & Verification Bar (mirrors MyLastDonationCard progress bar) */}
      <div className="p-4 rounded-2xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[#053845] flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
            <span>Current Stage: {statusMeta.label}</span>
          </span>
          <span className={`font-bold px-2 py-0.5 rounded-full text-[11px] border ${urgencyMeta.badgeClass}`}>
            {urgencyMeta.label}
          </span>
        </div>

        {/* Progress Meter */}
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-[#317786] h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
          <span>Posted: {formatTimeAgo(request.createdat)}</span>
          <span>Required By: {formatDate(request.requiredby)}</span>
        </div>
      </div>

      {/* 3 Detail Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/40 border border-[#F3E9D1] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Droplet className="w-3 h-3 text-[#B94F30]" />
            Blood Need
          </span>
          <div className="font-serif font-bold text-base text-[#053845]">
            {bloodGroupDisplay} ({request.unitsrequired} {request.unitsrequired === 1 ? "Unit" : "Units"})
          </div>
          <p className="text-[11px] text-slate-500">
            {componentDisplay}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/40 border border-[#F3E9D1] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Building2 className="w-3 h-3 text-[#317786]" />
            Hospital Facility
          </span>
          <div className="font-serif font-bold text-sm text-[#053845] truncate">
            {request.hospitals?.hospitalname || "Transfusion Center"}
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {request.hospitals?.city || "Area Network"}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/40 border border-[#F3E9D1] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Calendar className="w-3 h-3 text-emerald-600" />
            Transfusion Due
          </span>
          <div className="font-serif font-bold text-sm text-[#053845]">
            {formatDate(request.requiredby)}
          </div>
          <p className="text-[11px] text-slate-500">
            Search Radius: {request.searchradius || 5} km
          </p>
        </div>
      </div>

      {/* Verification Summary Footer */}
      <div className="p-4 rounded-2xl bg-[#FAF6EE]/60 border border-[#F3E9D1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
            Requisition ID:
          </span>
          <span className="font-mono font-semibold text-[#053845]">
            {refId}
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Clinical Coordination Active</span>
        </div>
      </div>
    </section>
  );
}
