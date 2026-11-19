"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Droplet,
  ShieldCheck,
  Heart,
  Compass,
  ArrowRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { MatchingRequestsPreview } from "@/components/donor/MatchingRequestsPreview";
import { DonorProfileSummary } from "@/components/donor/DonorProfileSummary";
import {
  DonorProfile,
  RequestPreviewItem,
} from "@/components/donor/DonorTypes";
import { api } from "@/lib/api";
import {
  mapBackendDonorToProfile,
  mapBackendRequestToPreview,
} from "@/lib/mappers";

export default function DonorDashboardOverviewPage() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [matchingRequests, setMatchingRequests] = useState<RequestPreviewItem[]>([]);
  const [transitUpdatingId, setTransitUpdatingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getDashboard();

      if (res.success) {
        const donorRecord = res.donor as unknown as {
          users?: {
            userid?: string;
            name?: string;
            email?: string;
            phonenumber?: string | null;
          };
        };

        const mappedProfile = mapBackendDonorToProfile(
          res.donor,
          donorRecord?.users,
          res.stats,
          res.eligibility
        );
        setProfile(mappedProfile);

        const mappedCommitments = (res.myCommitments || []).map(mapBackendRequestToPreview);
        const mappedMatches = (res.matchingRequests || []).map(mapBackendRequestToPreview);
        const byRawId = new Map<string, RequestPreviewItem>();
        for (const c of mappedCommitments) {
          byRawId.set(c.rawId || c.id, c);
        }
        for (const m of mappedMatches) {
          const key = m.rawId || m.id;
          if (!byRawId.has(key)) byRawId.set(key, m);
        }
        setMatchingRequests(Array.from(byRawId.values()));
      } else {
        setError("Failed to load dashboard data.");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect to Swastya backend server."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleUpdateTransit = async (
    requestId: string,
    status: "STARTED" | "REACHED_LOCATION",
    deliveryId?: string
  ) => {
    try {
      setTransitUpdatingId(requestId);
      await api.bloodRequests.updateTransitStatus(requestId, status, { deliveryId });
      await fetchDashboardData();
    } catch (err) {
      console.error("Failed to update donor journey status:", err);
    } finally {
      setTransitUpdatingId(null);
    }
  };

  const handleAvailabilityToggle = async (newStatus: "Available" | "Paused") => {
    if (!profile) return;
    const previousStatus = profile.availability;

    setProfile((prev) => (prev ? { ...prev, availability: newStatus } : null));

    try {
      const backendStatus =
        newStatus === "Available" ? "AVAILABLE" : "TEMPORARILY_UNAVAILABLE";
      await api.donor.updateAvailability(backendStatus);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("swastya-auth-change"));
      }
    } catch {
      setProfile((prev) => (prev ? { ...prev, availability: previousStatus } : null));
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading your donor dashboard...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white rounded-2xl border border-[#F3E9D1] text-center space-y-4 shadow-2xs my-12">
        <div className="w-11 h-11 rounded-xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center mx-auto">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="font-serif text-lg font-bold text-[#053845]">
            Dashboard Unavailable
          </h2>
          <p className="text-xs text-slate-600">
            {error || "Could not retrieve donor information."}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchDashboardData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Compact Welcome Section directly on cream page background */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Droplet className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Welcome back, {profile.name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#317786]/10 border border-[#317786]/20 text-[#053845]">
                {profile.bloodGroup}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  profile.availability === "Available"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    profile.availability === "Available" ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
                <span>{profile.availability}</span>
              </span>
            </div>
            <p className="text-sm text-slate-600">
              {matchingRequests.length === 0
                ? "No active blood requests currently match your group and area."
                : `${matchingRequests.length} ${
                    matchingRequests.length === 1 ? "active request matches" : "active requests match"
                  } your ${profile.bloodGroup} blood group in your coverage area.`}
            </p>
          </div>
        </div>

        <Link
          href="/donor/requests"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white text-xs font-semibold shadow-2xs transition-colors shrink-0 self-start md:self-center"
        >
          <span>View Matching Requests</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </section>

      {/* 2. Compact Vital Stats Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5" aria-label="Donor summary">
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Clinical Status</p>
            <p className="font-serif text-lg sm:text-xl font-bold text-[#053845] leading-tight truncate">
              {profile.eligibility}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Droplet className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Active Matches</p>
            <p className="font-serif text-lg sm:text-xl font-bold text-[#053845] leading-tight">
              {matchingRequests.length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EFA27E]/20 border border-[#EFA27E]/40 text-[#B94F30] flex items-center justify-center shrink-0">
            <Heart className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Total Impact</p>
            <p className="font-serif text-lg sm:text-xl font-bold text-[#053845] leading-tight">
              {profile.totalDonations} {profile.totalDonations === 1 ? "Donation" : "Donations"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Location Area</p>
            <p className="font-serif text-lg sm:text-xl font-bold text-[#053845] leading-tight truncate">
              {profile.city}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Balanced Two-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Main Column: Blood Requests For You */}
        <div className="lg:col-span-7">
          <MatchingRequestsPreview
            previews={matchingRequests}
            donorBloodGroup={profile.bloodGroup}
            transitUpdatingId={transitUpdatingId}
            onUpdateTransit={handleUpdateTransit}
          />
        </div>

        {/* Side Column: Donor Coordination Profile */}
        <div className="lg:col-span-5">
          <DonorProfileSummary
            profile={profile}
            onAvailabilityToggle={handleAvailabilityToggle}
          />
        </div>
      </div>
    </div>
  );
}
