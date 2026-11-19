"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  ArrowLeft,
  ShieldCheck,
  Heart,
  Droplet,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  HeartHandshake,
  Clock,
  XCircle,
  Building2,
} from "lucide-react";
import { LastDonationRecord } from "@/components/donor/DonorTypes";
import { api } from "@/lib/api";
import { mapBackendHistoryToRecord } from "@/lib/mappers";

export default function DonorHistoryPage() {
  const [history, setHistory] = useState<LastDonationRecord[]>([]);
  const [stats, setStats] = useState({
    totalDonations: 0,
    totalUnits: 0,
    totalMl: 0,
    livesSaved: 0,
    cooldownStatus: "Eligible",
    nextEligibleDate: null as string | null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getHistory();

      if (res.success) {
        setStats(
          res.stats || {
            totalDonations: 0,
            totalUnits: 0,
            totalMl: 0,
            livesSaved: 0,
            cooldownStatus: "Eligible",
            nextEligibleDate: null,
          }
        );

        const mapped = (res.history || []).map(mapBackendHistoryToRecord);
        setHistory(mapped);
      } else {
        setError("Failed to load donation history records.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to Swastya server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const isCooldownActive = stats.cooldownStatus !== "Eligible";
  const formattedNextEligible = stats.nextEligibleDate
    ? new Date(stats.nextEligibleDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Compact Page Header */}
      <header className="space-y-2">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Donor Dashboard</span>
        </Link>

        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Donation History
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Verified donation records confirmed by authorized hospitals and blood banks.
          </p>
        </div>
      </header>

      {/* 2. Three Compact Summary KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 block">
              Lifetime Verified Donations
            </span>
            <p className="font-serif text-xl font-bold text-[#053845] leading-tight mt-0.5">
              {stats.totalDonations} {stats.totalDonations === 1 ? "Donation" : "Donations"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {stats.totalMl > 0
                ? `${stats.totalMl.toLocaleString()} ml (${stats.totalUnits} ${
                    stats.totalUnits === 1 ? "unit" : "units"
                  })`
                : "No verified units recorded"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#EFA27E]/20 border border-[#EFA27E]/40 text-[#B94F30] flex items-center justify-center shrink-0">
            <Droplet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 block">
              Estimated Impact
            </span>
            <p className="font-serif text-xl font-bold text-[#053845] leading-tight mt-0.5">
              {stats.livesSaved > 0
                ? `~${stats.livesSaved} ${stats.livesSaved === 1 ? "Life" : "Lives"} Supported`
                : "0 Lives Supported"}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              Calculated from verified donations only
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex items-center gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isCooldownActive
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 block">
              Clinical Cooldown Status
            </span>
            <p
              className={`font-serif text-xl font-bold leading-tight mt-0.5 ${
                isCooldownActive ? "text-amber-800" : "text-emerald-700"
              }`}
            >
              {stats.cooldownStatus}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {!isCooldownActive
                ? "Eligible to donate · No active interval"
                : formattedNextEligible
                ? `In recovery interval · Eligible ${formattedNextEligible}`
                : "Currently within 90-day recovery interval"}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Verified Donation Records */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3E9D1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg sm:text-xl font-bold text-[#053845]">
              Verified Donation Records
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clinical records of your voluntary blood donations verified by authorized transfusion departments.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchHistory}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] disabled:opacity-50 transition-colors self-start sm:self-auto cursor-pointer shrink-0"
            title="Refresh records"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#317786] ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 px-6 text-center space-y-2.5">
            <Loader2 className="w-7 h-7 text-[#317786] animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Retrieving certified transfusion records...</p>
          </div>
        ) : error ? (
          <div className="py-10 px-6 text-center space-y-3">
            <AlertCircle className="w-7 h-7 text-[#A2363A] mx-auto" />
            <div className="space-y-1">
              <h3 className="font-serif text-base font-bold text-[#053845]">
                Failed to Load Records
              </h3>
              <p className="text-xs text-slate-500">{error}</p>
            </div>
            <button
              type="button"
              onClick={fetchHistory}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : history.length === 0 ? (
          /* 4. Compact Empty State */
          <div className="py-10 px-6 text-center space-y-3">
            <div className="w-11 h-11 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] mx-auto flex items-center justify-center">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif text-base font-bold text-[#053845]">
                No verified donations yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Your verified donation records will appear here after an authorized hospital confirms a completed donation.
              </p>
            </div>
            <div className="pt-1">
              <Link
                href="/donor/requests"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
              >
                <span>Browse Matching Blood Requests</span>
              </Link>
            </div>
          </div>
        ) : (
          /* 5. Populated Donation History Cards */
          <div className="p-4 sm:p-5 space-y-3">
            {history.map((rec) => {
              const isVerified = rec.verificationStatus === "VERIFIED";
              const isPending = rec.verificationStatus === "PENDING";

              return (
                <article
                  key={rec.id}
                  className="p-4 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] hover:border-[#317786]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 font-serif text-base font-bold text-[#053845]">
                        <Building2 className="w-4 h-4 text-[#317786] shrink-0" />
                        <span>{rec.location}</span>
                      </span>

                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-[#317786] border border-[#F3E9D1]">
                        {rec.isImported ? "Historical Import" : "Swastya Donation"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1 font-semibold text-[#053845]">
                        <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                        <span>{rec.date}</span>
                      </span>
                      <span>&middot;</span>
                      <span>
                        {rec.bloodGroup ? `${rec.bloodGroup} · ` : ""}
                        {rec.componentType}
                      </span>
                      <span>&middot;</span>
                      <span>
                        {rec.units} {rec.units === 1 ? "unit" : "units"}
                      </span>
                      {(rec.associatedRequest || rec.recordReference) && (
                        <>
                          <span>&middot;</span>
                          <span className="font-mono text-[11px] text-slate-500">
                            Ref: {rec.associatedRequest || rec.recordReference}
                          </span>
                        </>
                      )}
                    </div>

                    {rec.notes && (
                      <p className="text-xs text-slate-500 leading-relaxed">{rec.notes}</p>
                    )}
                  </div>

                  <div className="shrink-0 self-start sm:self-center">
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Verified</span>
                      </span>
                    ) : isPending ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Pending Verification</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#A2363A] bg-rose-50 border border-rose-200">
                        <XCircle className="w-3.5 h-3.5 text-[#A2363A]" />
                        <span>Unverified / Rejected</span>
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
