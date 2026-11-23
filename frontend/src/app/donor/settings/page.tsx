"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Power,
  AlertCircle,
  Loader2,
  MapPin,
  Droplet,
  Droplets,
  ShieldCheck,
  Compass,
  RefreshCw,
  Bell,
  Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  mapAvailabilityToDisplay,
  mapDisplayToAvailability,
  mapBloodGroupToDisplay,
  getCompatibleRecipientBloodGroups,
} from "@/lib/mappers";

interface MatchingContext {
  bloodGroup: string;
  compatibleGroups: string[];
  city: string;
  state: string;
  hasGps: boolean;
  eligibilityStatus: string;
  eligibilityIsEligible: boolean;
}

export default function DonorSettingsPage() {
  const [availability, setAvailability] = useState<"Available" | "Paused">("Available");
  const [savedAvailability, setSavedAvailability] = useState<"Available" | "Paused">("Available");
  const [matchingRadius, setMatchingRadius] = useState<number>(15);
  const [matchingContext, setMatchingContext] = useState<MatchingContext | null>(null);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [profileRes, matchingRes] = await Promise.all([
        api.donor.getProfile(),
        api.donor.getMatchingRequests({ limit: 1 }).catch(() => null),
      ]);
      if (profileRes.success && profileRes.donor) {
        const displayStatus = mapAvailabilityToDisplay(profileRes.donor.availabilitystatus);
        setAvailability(displayStatus);
        setSavedAvailability(displayStatus);

        const existingRadius = (profileRes.donor as { radiuskm?: number; radiusKm?: number }).radiuskm ??
          (profileRes.donor as { radiuskm?: number; radiusKm?: number }).radiusKm;
        if (typeof existingRadius === "number" && existingRadius >= 3 && existingRadius <= 30) {
          setMatchingRadius(existingRadius);
        }

        const hasGps =
          profileRes.donor.latitude !== undefined &&
          profileRes.donor.latitude !== null &&
          profileRes.donor.longitude !== undefined &&
          profileRes.donor.longitude !== null &&
          !isNaN(Number(profileRes.donor.latitude)) &&
          !isNaN(Number(profileRes.donor.longitude));

        const backendCompatible =
          matchingRes?.success &&
          Array.isArray(matchingRes.compatibleGroups) &&
          matchingRes.compatibleGroups.length > 1
            ? matchingRes.compatibleGroups.map(mapBloodGroupToDisplay)
            : getCompatibleRecipientBloodGroups(profileRes.donor.bloodgroup);

        const rawEligibility = profileRes.eligibility;
        const isClinicallyEligible =
          typeof rawEligibility?.isEligible === "boolean"
            ? rawEligibility.isEligible
            : rawEligibility?.status === "Eligible";
        const eligibilityLabel =
          rawEligibility?.status ||
          (isClinicallyEligible ? "Eligible" : "Ineligible");

        setMatchingContext({
          bloodGroup: profileRes.donor.bloodgroup
            ? mapBloodGroupToDisplay(profileRes.donor.bloodgroup)
            : "",
          compatibleGroups: backendCompatible,
          city: profileRes.donor.city && profileRes.donor.city !== "Not Provided" ? profileRes.donor.city : "",
          state: profileRes.donor.state && profileRes.donor.state !== "Not Provided" ? profileRes.donor.state : "",
          hasGps,
          eligibilityStatus: eligibilityLabel,
          eligibilityIsEligible: isClinicallyEligible,
        });
      } else {
        setError("Unable to load your current availability settings.");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load your current availability settings. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentSettings();
  }, [fetchCurrentSettings]);

  const handleSave = async () => {
    if (isSaving || isLoading) return;
    try {
      setIsSaving(true);
      setError(null);
      setSaved(false);
      const backendStatus = mapDisplayToAvailability(availability);
      const res = await api.donor.updateAvailability(backendStatus);

      if (res.success) {
        setSavedAvailability(availability);
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("swastya-auth-change"));
        }
      } else {
        setError(res.message || "Unable to save your availability changes. Please try again.");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save your availability changes. Please check your connection."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const hasUnsavedChanges = availability !== savedAvailability;
  const locationDisplay = [matchingContext?.city, matchingContext?.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-8">
      {/* Top Breadcrumb & Save Feedback */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {saved && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Availability updated</span>
          </span>
        )}
      </div>

      {/* 1. Compact Page Header */}
      <header className="pb-3.5 border-b border-[#317786]/15 space-y-0.5">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
          Availability &amp; Match Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-600">
          Control your emergency donation availability and review the location details used to match nearby blood requests.
        </p>
      </header>

      {/* Error State */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#A2363A] shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchCurrentSettings}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-[#A2363A] hover:bg-rose-100 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-pulse">
          <div className="lg:col-span-7 h-60 rounded-2xl bg-white border border-[#F3E9D1]" />
          <div className="lg:col-span-5 h-60 rounded-2xl bg-white border border-[#F3E9D1]" />
        </div>
      ) : (
        /* 2. Balanced Two-Column Desktop Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Left Card: Emergency Availability */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#F3E9D1]/70">
                <div className="flex items-center gap-2">
                  <Power className="w-4 h-4 text-[#317786]" />
                  <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
                    Emergency Availability Mode
                  </h2>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    savedAvailability === "Available"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      savedAvailability === "Available" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <span>{savedAvailability}</span>
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Choose whether you can be matched with urgent blood requests in your area. You can pause or resume your availability at any time.
              </p>

              {/* Accessible Available / Paused Selector */}
              <div
                role="radiogroup"
                aria-label="Emergency availability mode"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={availability === "Available"}
                  disabled={isSaving}
                  onClick={() => setAvailability("Available")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                    availability === "Available"
                      ? "bg-emerald-50/70 border-emerald-400 ring-1 ring-emerald-400/40"
                      : "bg-[#FAF6EE]/50 border-[#F3E9D1] hover:border-[#317786]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#053845]">Available</span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        availability === "Available"
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {availability === "Available" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    Receive matching blood requests and respond when you are able to donate.
                  </p>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={availability === "Paused"}
                  disabled={isSaving}
                  onClick={() => setAvailability("Paused")}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer space-y-1 ${
                    availability === "Paused"
                      ? "bg-amber-50/70 border-amber-400 ring-1 ring-amber-400/40"
                      : "bg-[#FAF6EE]/50 border-[#F3E9D1] hover:border-[#317786]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#053845]">Paused</span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        availability === "Paused"
                          ? "border-amber-600 bg-amber-600"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {availability === "Paused" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    Temporarily step back from new request matching without deleting your profile.
                  </p>
                </button>
              </div>

              {/* Divider + Matching Radius */}
              <div className="pt-4 border-t border-[#F3E9D1]/70 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#317786]" />
                    <label
                      htmlFor="donor-matching-radius"
                      className="font-serif text-sm sm:text-base font-bold text-[#053845] cursor-pointer"
                    >
                      Matching Radius
                    </label>
                  </div>
                  <span className="font-serif text-sm font-bold text-[#053845] px-2.5 py-0.5 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] tabular-nums">
                    {matchingRadius} km
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-snug">
                  Choose how far away blood requests can be to match with you.
                </p>

                <input
                  id="donor-matching-radius"
                  type="range"
                  min={3}
                  max={30}
                  step={1}
                  value={matchingRadius}
                  onChange={(e) => setMatchingRadius(Number(e.target.value))}
                  aria-label="Matching Radius in kilometers"
                  className="w-full accent-[#317786] h-1.5 bg-[#F3E9D1] rounded-lg cursor-pointer"
                />

                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>3 km</span>
                  <span>15 km</span>
                  <span>30 km</span>
                </div>
              </div>
            </div>

            {/* Save Action */}
            <div className="pt-3 border-t border-[#F3E9D1]/70 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                {hasUnsavedChanges
                  ? "You have unsaved availability changes."
                  : `Currently set to ${savedAvailability}.`}
              </span>

              <button
                type="button"
                disabled={isSaving || !hasUnsavedChanges}
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] transition-colors cursor-pointer shadow-2xs disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>

            {/* Quick Link to Notification Preferences */}
            <div className="mt-4 pt-3 border-t border-[#F3E9D1]/70">
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                    <Bell className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#053845]">Blood Camp Notifications</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      Manage alerts for nearby camps, reminders, and updates
                    </p>
                  </div>
                </div>
                <Link
                  href="/donor/settings/notifications"
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] shrink-0 inline-flex items-center gap-1 shadow-2xs"
                >
                  <span>Configure</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </section>

          {/* Right Card: Matching Profile Overview */}
          <section className="lg:col-span-5 bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/70">
                <Compass className="w-4 h-4 text-[#317786]" />
                <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
                  How Requests Match You
                </h2>
              </div>

              <dl className="divide-y divide-[#F3E9D1]/70 text-xs">
                {/* 1. Blood Group */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <Droplet className="w-3.5 h-3.5 text-[#B94F30]" />
                    <span>Blood Group</span>
                  </dt>
                  <dd className="font-serif text-sm font-bold text-[#B94F30]">
                    {matchingContext?.bloodGroup || "Not set"}
                  </dd>
                </div>

                {/* 2. Blood Compatibility */}
                <div className="py-2.5 flex items-start justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5 shrink-0 pt-0.5">
                    <Droplets className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Blood Compatibility</span>
                  </dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {matchingContext?.compatibleGroups && matchingContext.compatibleGroups.length > 0 ? (
                      matchingContext.compatibleGroups.map((group) => (
                        <span
                          key={group}
                          className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#317786]/10 text-[#053845] border border-[#317786]/20"
                        >
                          {group}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">Not available</span>
                    )}
                  </dd>
                </div>

                {/* 3. Matching Area */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Matching Area</span>
                  </dt>
                  <dd className="font-semibold text-[#053845] text-right truncate max-w-[180px]">
                    {locationDisplay || "Not set"}
                  </dd>
                </div>

                {/* 4. Distance Matching */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Distance Matching</span>
                  </dt>
                  <dd
                    className={`font-semibold ${
                      matchingContext?.hasGps ? "text-emerald-700" : "text-[#B94F30]"
                    }`}
                  >
                    {matchingContext?.hasGps ? "GPS enabled" : "City-based only"}
                  </dd>
                </div>

                {/* 5. Donation Eligibility */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Donation Eligibility</span>
                  </dt>
                  <dd
                    className={`font-semibold ${
                      matchingContext?.eligibilityIsEligible
                        ? "text-emerald-700"
                        : "text-[#A2363A]"
                    }`}
                  >
                    {matchingContext?.eligibilityStatus || "Pending review"}
                  </dd>
                </div>

                {/* 6. Availability */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Availability</span>
                  </dt>
                  <dd>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        savedAvailability === "Available"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-rose-50 text-[#A2363A] border-rose-200"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          savedAvailability === "Available" ? "bg-emerald-500" : "bg-[#A2363A]"
                        }`}
                      />
                      <span>{savedAvailability}</span>
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="pt-3 border-t border-[#F3E9D1]/70 flex flex-wrap items-center justify-between gap-2 text-xs">
              <Link
                href="/donor/profile"
                className="inline-flex items-center gap-1 font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>Update Location</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/donor/settings/notifications"
                className="inline-flex items-center gap-1 font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Notification Preferences</span>
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
