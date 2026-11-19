"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  MapPin,
  ArrowRight,
  User,
  SlidersHorizontal,
  Power,
  Check,
  Compass,
  Heart,
  Droplet,
} from "lucide-react";
import { DonorProfile } from "./DonorTypes";

interface DonorProfileSummaryProps {
  profile: DonorProfile;
  onAvailabilityToggle?: (newStatus: "Available" | "Paused") => void;
  onRadiusChange?: (newRadius: number) => void;
}

export function DonorProfileSummary({
  profile,
  onAvailabilityToggle,
  onRadiusChange,
}: DonorProfileSummaryProps) {
  const [localAvailability, setLocalAvailability] = useState<"Available" | "Paused">(
    profile.availability || "Available"
  );
  const [localRadius, setLocalRadius] = useState<number>(profile.radiusKm || 15);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (profile.availability) {
      setLocalAvailability(profile.availability);
    }
  }, [profile.availability]);

  const handleToggle = () => {
    const nextStatus = localAvailability === "Available" ? "Paused" : "Available";
    setLocalAvailability(nextStatus);
    if (onAvailabilityToggle) {
      onAvailabilityToggle(nextStatus);
    }
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 2400);
  };

  const handleRadiusSlider = (val: number) => {
    setLocalRadius(val);
    if (onRadiusChange) {
      onRadiusChange(val);
    }
  };

  const isAvailable = localAvailability === "Available";

  return (
    <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs">
      <div className="divide-y divide-[#F3E9D1]/70">
        {/* Card Header */}
        <div className="pb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-4 h-4 text-[#317786] shrink-0" />
            <h2 className="font-serif text-lg font-bold text-[#053845] truncate">
              Your Donor Status
            </h2>
          </div>

          <Link
            href="/donor/profile"
            className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 shrink-0"
          >
            <span>Full Profile</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 1. Donor Information */}
        <div className="py-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#053845]">Donor Information</span>
            <span className="text-[11px] font-mono text-slate-400">ID: {profile.donorId}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]/80">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Droplet className="w-3 h-3 text-[#B94F30]" />
                <span>Blood Group</span>
              </span>
              <p className="font-serif text-lg font-bold text-[#053845] mt-0.5">
                {profile.bloodGroup}
              </p>
            </div>

            <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1]/80">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Heart className="w-3 h-3 text-[#317786]" />
                <span>Verified Donations</span>
              </span>
              <p className="font-serif text-lg font-bold text-[#053845] mt-0.5">
                {profile.totalDonations}{" "}
                <span className="text-xs font-sans font-medium text-slate-600">
                  {profile.totalDonations === 1 ? "donation" : "donations"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* 2. Availability */}
        <div className="py-3 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-semibold text-[#053845] block">Availability</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isAvailable
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-[#FAF6EE] text-slate-600 border-[#F3E9D1]"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isAvailable ? "bg-emerald-500" : "bg-[#B94F30]"
                  }`}
                />
                <span>
                  {isAvailable
                    ? "Available to receive matching requests"
                    : "Paused — not receiving new matches"}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleToggle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                isAvailable
                  ? "bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1] hover:bg-[#F3E9D1]"
                  : "bg-[#317786] text-white hover:bg-[#245964]"
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isAvailable ? "Pause" : "Resume"}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-500">
            Pause to temporarily stop receiving new matching requests.
          </p>

          {showFeedback && (
            <div className="text-[11px] text-[#317786] bg-[#FAF6EE] border border-[#317786]/25 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Availability updated to <strong>{localAvailability}</strong>
              </span>
            </div>
          )}
        </div>

        {/* 3. Coverage Area */}
        <div className="pt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#053845]">Coverage Area</span>
              <span className="inline-flex items-center gap-1 font-serif text-xs font-bold text-[#053845] bg-[#317786]/10 border border-[#317786]/25 px-2 py-0.5 rounded-lg">
                <Compass className="w-3 h-3 text-[#317786]" />
                <span>{localRadius} km</span>
              </span>
            </div>

            <Link
              href="/donor/settings"
              className="text-xs font-semibold text-[#317786] hover:text-[#053845] inline-flex items-center gap-1 shrink-0"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Settings</span>
            </Link>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
            <span className="truncate">{profile.location}</span>
          </div>

          <input
            type="range"
            min="3"
            max="30"
            step="1"
            value={localRadius}
            onChange={(e) => handleRadiusSlider(Number(e.target.value))}
            aria-label="Matching coverage radius in kilometers"
            className="w-full accent-[#317786] h-1.5 bg-[#F3E9D1] rounded-lg cursor-pointer"
          />

          <p className="text-[11px] text-slate-500">
            Controls how far away matching requests can be.
          </p>
        </div>
      </div>
    </section>
  );
}
