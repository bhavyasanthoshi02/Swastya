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

  return (
    <section className="bg-white rounded-3xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#FAF6EE] text-[#053845] flex items-center justify-center border border-[#F3E9D1]">
            <User className="w-4 h-4 text-[#317786]" />
          </div>
          <div>
            <h2 className="font-serif text-base font-bold text-[#053845]">
              Donor Coordination Profile
            </h2>
            <p className="text-[11px] text-slate-500">ID: {profile.donorId}</p>
          </div>
        </div>

        <Link
          href="/donor/profile"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group"
        >
          <span>Full Profile</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Attributes Row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Blood Group */}
        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
            <Droplet className="w-3 h-3 text-[#A2363A]" />
            Blood Group
          </span>
          <div className="font-serif text-2xl font-bold text-[#053845] mt-0.5">
            {profile.bloodGroup}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Universal Red Cell Donor
          </span>
        </div>

        {/* Impact Lifetime */}
        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
            <Heart className="w-3 h-3 text-[#B94F30]" />
            Lifetime Impact
          </span>
          <div className="font-serif text-2xl font-bold text-[#053845] mt-0.5">
            {profile.totalDonations} Donations
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            ~{profile.livesSaved} Lives Impacted
          </span>
        </div>
      </div>

      {/* Availability Status & Toggle */}
      <div className="p-4 rounded-2xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Emergency Availability Status
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  localAvailability === "Available"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    localAvailability === "Available"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-slate-400"
                  }`}
                />
                <span>{localAvailability === "Available" ? "Active (Receiving Matches)" : "Paused (On Standby)"}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
              localAvailability === "Available"
                ? "bg-white text-slate-700 border border-[#F3E9D1] hover:bg-[#FAF6EE]"
                : "bg-[#317786] text-white hover:bg-[#245964]"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{localAvailability === "Available" ? "Pause" : "Activate"}</span>
          </button>
        </div>

        {showFeedback && (
          <div className="text-[11px] text-[#317786] bg-white border border-[#317786]/20 px-3 py-1.5 rounded-xl animate-in fade-in duration-150 flex items-center gap-1.5 shadow-2xs">
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Availability updated to: <strong>{localAvailability}</strong></span>
          </div>
        )}

        {/* Coverage Perimeter interactive slider */}
        <div className="pt-2 border-t border-[#F3E9D1]/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#317786]" />
              <span>Coverage Radius</span>
              <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 rounded">Preview</span>
            </span>
            <span className="font-bold text-[#053845] font-mono px-2 py-0.5 rounded bg-white border border-[#F3E9D1]">
              {localRadius} km
            </span>
          </div>

          <input
            type="range"
            min="3"
            max="30"
            step="1"
            value={localRadius}
            onChange={(e) => handleRadiusSlider(Number(e.target.value))}
            className="w-full accent-[#317786] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 text-[#B94F30] shrink-0" />
              <span>{profile.location}</span>
            </span>
            <Link
              href="/donor/settings"
              className="text-[#317786] hover:text-[#053845] font-semibold flex items-center gap-1 shrink-0 ml-2"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
