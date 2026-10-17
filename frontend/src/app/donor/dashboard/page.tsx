"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Droplet,
  ShieldCheck,
  Heart,
  Compass,
  ArrowRight,
  Sparkles,
  Info,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { MatchingRequestsPreview } from "@/components/donor/MatchingRequestsPreview";
import { MyLastDonationCard } from "@/components/donor/MyLastDonationCard";
import { DonorProfileSummary } from "@/components/donor/DonorProfileSummary";
import { RecentActivityPreview } from "@/components/donor/RecentActivityPreview";
import {
  DonorProfile,
  RequestPreviewItem,
  RecentActivityItem,
  LastDonationRecord,
} from "@/components/donor/DonorTypes";
import { api } from "@/lib/api";
import {
  mapBackendDonorToProfile,
  mapBackendRequestToPreview,
  mapBackendHistoryToRecord,
  formatTimeAgo,
  cleanNotificationMessage,
} from "@/lib/mappers";

export default function DonorDashboardOverviewPage() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [matchingRequests, setMatchingRequests] = useState<RequestPreviewItem[]>([]);
  const [lastDonation, setLastDonation] = useState<LastDonationRecord | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getDashboard();

      if (res.success) {
        const mappedProfile = mapBackendDonorToProfile(
          res.donor,
          (res.donor as any)?.users,
          res.stats,
          res.eligibility
        );
        setProfile(mappedProfile);

        const mappedRequests = (res.matchingRequests || []).map(mapBackendRequestToPreview);
        setMatchingRequests(mappedRequests);

        const mappedLast = res.lastDonation ? mapBackendHistoryToRecord(res.lastDonation) : null;
        setLastDonation(mappedLast);

        if (res.recentActivities && res.recentActivities.length > 0) {
          const mappedActs: RecentActivityItem[] = res.recentActivities.map((act: any) => ({
            id: act.id || `ACT-${Math.random().toString(36).substring(2, 7)}`,
            title: act.title || "Clinical Coordination Update",
            description: cleanNotificationMessage(act.description),
            timeAgo: formatTimeAgo(act.timestamp),
            type: act.type === "alert" || act.type === "donation" ? act.type : "availability",
          }));
          setRecentActivities(mappedActs);
        } else {
          // Standard clinical initial records
          setRecentActivities([
            {
              id: "act-initial-1",
              title: "Voluntary Profile Active",
              description: `Registered with ${mappedProfile.bloodGroup} voluntary coordination network.`,
              timeAgo: "Recently",
              type: "availability",
            },
            {
              id: "act-initial-2",
              title: "Clinical Readiness Confirmed",
              description: "Emergency requisition perimeter monitoring online.",
              timeAgo: "Active",
              type: "alert",
            },
          ]);
        }
      } else {
        setError("Failed to load dashboard data.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya backend server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleAvailabilityToggle = async (newStatus: "Available" | "Paused") => {
    if (!profile) return;
    const previousStatus = profile.availability;

    // Optimistic UI update
    setProfile((prev) => (prev ? { ...prev, availability: newStatus } : null));

    try {
      const backendStatus = newStatus === "Available" ? "AVAILABLE" : "TEMPORARILY_UNAVAILABLE";
      await api.donor.updateAvailability(backendStatus);
      // Trigger global event so top navigation updates immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("swastya-auth-change"));
      }
    } catch {
      // Revert if API fails
      setProfile((prev) => (prev ? { ...prev, availability: previousStatus } : null));
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading clinical donor overview...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white rounded-3xl border border-[#F3E9D1] text-center space-y-4 shadow-sm my-12">
        <div className="w-12 h-12 rounded-2xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-serif text-lg font-bold text-[#053845]">Dashboard Unavailable</h2>
          <p className="text-xs text-slate-600">{error || "Could not retrieve donor information."}</p>
        </div>
        <button
          type="button"
          onClick={fetchDashboardData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-all cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero Welcome & Readiness Bar */}
      <section className="bg-gradient-to-br from-[#053845] via-[#0b4d5e] to-[#053845] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Decorative background blur */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#EFA27E]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-1/3 -top-10 w-48 h-48 bg-[#317786]/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-[#EFA27E]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Verified Voluntary Blood Donor</span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
              Welcome back, {profile.name}
            </h1>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Your registered blood group is{" "}
              <strong className="text-[#EFA27E] font-bold">{profile.bloodGroup}</strong>. There{" "}
              {matchingRequests.length === 1 ? "is currently" : "are currently"}{" "}
              <strong className="text-white font-bold">
                {matchingRequests.length} {matchingRequests.length === 1 ? "urgent requisition" : "urgent requisitions"}
              </strong>{" "}
              matching your blood group and coverage area.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-3 shrink-0">
            <Link
              href="/donor/requests"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-[1.02] cursor-pointer"
            >
              <span>View Matching Requests</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <span className="text-[11px] text-slate-300 flex items-center gap-1.5 self-center md:self-auto">
              <span className={`w-2 h-2 rounded-full ${profile.availability === "Available" ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
              <span>Status: {profile.availability}</span>
            </span>
          </div>
        </div>

        {/* 4 Quick Vital Stats */}
        <div className="relative z-10 mt-6 pt-6 border-t border-white/15 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Clinical Status
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-emerald-300">
              {profile.eligibility}
            </div>
            <p className="text-[11px] text-slate-300">Est. cooldown (on-site screening req.)</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Droplet className="w-3 h-3 text-[#EFA27E]" />
              Active Matches
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-white">
              {matchingRequests.length} {matchingRequests.length === 1 ? "Requisition" : "Requisitions"}
            </div>
            <p className="text-[11px] text-slate-300">Compatible red-cell units</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Heart className="w-3 h-3 text-rose-300" />
              Total Impact
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-white">
              {profile.totalDonations} {profile.totalDonations === 1 ? "Donation" : "Donations"}
            </div>
            <p className="text-[11px] text-slate-300">~{profile.livesSaved} lives supported</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Compass className="w-3 h-3 text-[#317786]" />
              Location Area
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-white truncate">
              {profile.city}
            </div>
            <p className="text-[11px] text-slate-300 truncate">{profile.location}</p>
          </div>
        </div>
      </section>

      {/* Main Dashboard Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Priority Requisitions & Verification Record (7 cols) */}
        <div className="lg:col-span-7 space-y-6 lg:space-y-8">
          {/* Blood Requests for You */}
          <MatchingRequestsPreview
            previews={matchingRequests}
            donorBloodGroup={profile.bloodGroup}
          />

          {/* My Last Donation Record */}
          <MyLastDonationCard
            record={lastDonation}
            donorName={profile.name}
          />
        </div>

        {/* Right Column: Profile Coordination & Practical Guidance (5 cols) */}
        <div className="lg:col-span-5 space-y-6 lg:space-y-8">
          {/* Donor Profile Coordination Widget */}
          <DonorProfileSummary
            profile={profile}
            onAvailabilityToggle={handleAvailabilityToggle}
          />

          {/* Pre-Donation Donor Tips & Health Advisory */}
          <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/70">
              <div className="w-8 h-8 rounded-xl bg-[#FAF6EE] text-[#053845] flex items-center justify-center border border-[#F3E9D1]">
                <Info className="w-4 h-4 text-[#317786]" />
              </div>
              <div>
                <h3 className="font-serif text-base font-bold text-[#053845]">
                  Donor Health &amp; Safety Guide
                </h3>
                <p className="text-[11px] text-slate-500">
                  Best practices recommended before whole blood donation
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1]/50">
                <span className="w-5 h-5 rounded-full bg-[#317786]/10 text-[#317786] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <p>
                  <strong>Hydration is key:</strong> Drink at least 500 ml of water or fruit juice within 2 hours prior to donation.
                </p>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1]/50">
                <span className="w-5 h-5 rounded-full bg-[#317786]/10 text-[#317786] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <p>
                  <strong>Eat a wholesome meal:</strong> Avoid fatty meals before donating; a light, iron-rich meal is optimal.
                </p>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1]/50">
                <span className="w-5 h-5 rounded-full bg-[#317786]/10 text-[#317786] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <p>
                  <strong>Mandatory interval:</strong> A standard 90-day cooldown between whole blood donations protects your hemoglobin levels.
                </p>
              </div>
            </div>
          </div>

          {/* Recent Activity Timeline */}
          <RecentActivityPreview activities={recentActivities} />
        </div>
      </div>
    </div>
  );
}
