"use client";

import React from "react";
import { DonorRegistryItem } from "@/lib/api";
import {
  Droplets,
  MapPin,
  Mail,
  Phone,
  Eye,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface DonorCardProps {
  donor: DonorRegistryItem;
  onViewDetails: (donorId: string) => void;
}

export function DonorCard({ donor, onViewDetails }: DonorCardProps) {
  return (
    <div
      className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xs hover:border-[#317786]/50 hover:shadow-xs transition-all duration-150 h-full min-h-[285px]"
      data-testid={`donor-card-${donor.donorId}`}
    >
      {/* Top Header: Blood Group Badge & Account/Verification Status */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {/* Blood Group Badge */}
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845]"
            title={`Blood Group: ${donor.bloodGroup}`}
          >
            <Droplets className="w-4 h-4 text-[#B94F30] shrink-0" />
            <span className="font-serif font-bold text-sm sm:text-base tracking-tight text-[#053845]">
              {donor.bloodGroup}
            </span>
          </div>

          {/* Account Status Pill */}
          {donor.accountStatus === "ACTIVATED" ? (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
              title="Active Swastya Account"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Active</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
              title="Pending User Activation"
            >
              <Clock className="w-3 h-3 text-amber-600 shrink-0" />
              <span>Pending</span>
            </span>
          )}
        </div>

        {/* Donor Identity: Full Name & Source Reference */}
        <div>
          <h3
            className="font-serif text-base font-bold text-[#053845] group-hover:text-[#317786] transition-colors truncate"
            title={donor.name}
          >
            {donor.name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {donor.sourceIdentifier ? (
              <span
                className="text-[11px] text-[#317786] font-medium truncate"
                title={`Legacy ID: ${donor.sourceIdentifier}`}
              >
                ID: {donor.sourceIdentifier}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">Swastya Registry</span>
            )}
            {donor.gender && (
              <>
                <span className="text-slate-300 text-xs">•</span>
                <span className="text-[11px] text-slate-500 capitalize">{donor.gender.toLowerCase()}</span>
              </>
            )}
          </div>
        </div>

        {/* Contact and Location Meta */}
        <div className="space-y-1.5 pt-1 text-xs text-slate-600">
          {/* Location */}
          <div className="flex items-center gap-2 truncate" title={donor.city ? `${donor.city}${donor.state ? `, ${donor.state}` : ""}` : "Location not provided"}>
            <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
            <span className="truncate">
              {donor.city ? `${donor.city}${donor.state ? `, ${donor.state}` : ""}` : "Location unlisted"}
            </span>
          </div>

          {/* Email */}
          <div className="flex items-center gap-2 truncate" title={donor.email || "Email not available"}>
            <Mail className="w-3.5 h-3.5 text-[#317786] shrink-0" />
            <span className="truncate">
              {donor.email || "No email recorded"}
            </span>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2 truncate" title={donor.phoneNumber || "Phone not available"}>
            <Phone className="w-3.5 h-3.5 text-[#317786] shrink-0" />
            <span className="truncate">
              {donor.phoneNumber || "No phone recorded"}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Footer: Donation Stats & Detail Action */}
      <div className="pt-3 mt-3 border-t border-[#F3E9D1]/70 flex items-center justify-between gap-2">
        {/* Donation count & Verification badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="flex items-center gap-1 text-xs text-slate-600 shrink-0"
            title={`${donor.donationCount} hospital donation records`}
          >
            <Droplets className="w-3.5 h-3.5 text-[#317786]" />
            <span className="font-semibold text-slate-800">{donor.donationCount}</span>
            <span className="text-[11px] text-slate-500">
              {donor.donationCount === 1 ? "rec" : "recs"}
            </span>
          </div>

          {donor.historicalVerificationStatus === "VERIFIED" && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0"
              title="Verified Clinical History"
            >
              ✓ Verified
            </span>
          )}
          {donor.historicalVerificationStatus === "PENDING" && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
              title="Pending Clinical Verification"
            >
              Pending
            </span>
          )}
          {donor.historicalVerificationStatus === "REJECTED" && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 shrink-0"
              title="Rejected Clinical History"
            >
              Rejected
            </span>
          )}
        </div>

        {/* View Details Action Button */}
        <button
          type="button"
          onClick={() => onViewDetails(donor.donorId)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] hover:text-[#03252e] transition-colors border border-[#F3E9D1] shrink-0 cursor-pointer"
          title={`View details for ${donor.name}`}
        >
          <Eye className="w-3.5 h-3.5 text-[#317786]" />
          <span>Details</span>
        </button>
      </div>
    </div>
  );
}
