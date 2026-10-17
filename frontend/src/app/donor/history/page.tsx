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
        setStats(res.stats || {
          totalDonations: 0,
          totalUnits: 0,
          totalMl: 0,
          livesSaved: 0,
          cooldownStatus: "Eligible",
          nextEligibleDate: null,
        });

        const mapped = (res.history || []).map(mapBackendHistoryToRecord);
        setHistory(mapped);
      } else {
        setError("Failed to load donation history records.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>
      </div>

      {/* Impact Stats Banner */}
      <section className="bg-gradient-to-r from-[#053845] to-[#0b4d5e] rounded-3xl p-6 sm:p-8 text-white shadow-lg grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/15">
            <Heart className="w-6 h-6 text-[#EFA27E]" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block">
              Lifetime Contributions
            </span>
            <div className="font-serif text-2xl font-bold text-white mt-0.5">
              {stats.totalDonations} {stats.totalDonations === 1 ? "Donation" : "Donations"}
            </div>
            <p className="text-xs text-slate-300">
              {stats.totalMl > 0 ? `${stats.totalMl.toLocaleString()} ml whole blood` : "Initial clinical profile"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/15">
            <Droplet className="w-6 h-6 text-rose-300" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block">
              Estimated Impact
            </span>
            <div className="font-serif text-2xl font-bold text-white mt-0.5">
              ~{stats.livesSaved} Lives Saved
            </div>
            <p className="text-xs text-slate-300">Emergency &amp; surgery support</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/15">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block">
              Clinical Cooldown
            </span>
            <div className="font-serif text-2xl font-bold text-emerald-300 mt-0.5">
              {stats.cooldownStatus}
            </div>
            <p className="text-xs text-slate-300">
              {stats.cooldownStatus === "Eligible" ? "Clinical clearance active" : "Recovery interval active"}
            </p>
          </div>
        </div>
      </section>

      {/* Main Donation History List */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#053845]">
              Verified Donation Records
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Clinical records of your voluntary whole blood donations, verified by authorized transfusion medicine departments.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchHistory}
            className="p-2 rounded-xl text-slate-400 hover:text-[#053845] hover:bg-slate-50 transition-colors self-start sm:self-auto"
            title="Refresh records"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Retrieving certified transfusion records...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-[#A2363A] mx-auto" />
            <h3 className="font-serif text-base font-bold text-[#053845]">Failed to Load Records</h3>
            <p className="text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={fetchHistory}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] mx-auto flex items-center justify-center">
              <HeartHandshake className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#053845]">
              No Past Donation Records Yet
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              When you complete a voluntary donation at an accredited hospital or licensed blood bank, your verified cross-match record will be registered directly here.
            </p>
            <div className="pt-2">
              <Link
                href="/donor/requests"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-all cursor-pointer"
              >
                <span>Find Matching Blood Requisitions</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((rec) => (
              <div
                key={rec.id}
                className="p-5 sm:p-7 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-5"
              >
                <div className="space-y-2">
                  <div className="flex items-center flex-wrap gap-2.5">
                    <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
                      {rec.location}
                    </h2>
                    {rec.isImported ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
                        <span>Historical Import</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                        <span>Swastya Live Donation</span>
                      </span>
                    )}

                    {rec.verificationStatus === "VERIFIED" && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Verified</span>
                      </span>
                    )}
                    {rec.verificationStatus === "PENDING" && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>Pending Clinical Verification</span>
                      </span>
                    )}
                    {rec.verificationStatus === "REJECTED" && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        <span>Rejected Record</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1 text-[#053845] font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                      {rec.date}
                    </span>
                    <span>•</span>
                    <span>{rec.componentType}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-500">
                      Ref: {rec.recordReference}
                    </span>
                  </div>

                  {rec.notes && (
                    <p className="text-xs text-slate-600 leading-relaxed pt-0.5">
                      {rec.notes}
                    </p>
                  )}
                </div>

                <div className="shrink-0 self-start sm:self-center">
                  {rec.verificationStatus === "VERIFIED" ? (
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Clinical Record Verified</span>
                    </span>
                  ) : rec.verificationStatus === "PENDING" ? (
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Pending Verification</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      <span>Unverified / Rejected</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
