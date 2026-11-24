"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Radio,
  Droplets,
  MapPin,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Heart,
  ArrowLeft,
  Filter,
  Search,
  X,
} from "lucide-react";
import { api, DonorEmergencyRequestItem } from "@/lib/api";
import { mapBloodGroupToDisplay } from "@/lib/mappers";

export default function DonorEmergencyRequestsPage() {
  const [requests, setRequests] = useState<DonorEmergencyRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "ACCEPTED">("PENDING");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.donor.emergencyRequests.getAll();
      if (res.success && res.requests) {
        setRequests(res.requests);
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to load emergency blood requests.",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleRespond = async (deliveryId: string, response: "ACCEPTED" | "DECLINED") => {
    setIsSubmittingId(deliveryId);
    setFeedback(null);
    try {
      const res = await api.donor.emergencyRequests.respond(deliveryId, {
        response,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          text: res.message || `Response recorded successfully.`,
        });
        setRequests((prev) =>
          prev.map((r) =>
            r.deliveryId === deliveryId
              ? { ...r, response, respondedAt: new Date().toISOString() }
              : r
          )
        );
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to submit response. Please try again.",
      });
    } finally {
      setIsSubmittingId(null);
    }
  };

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesHospital = r.hospitalName.toLowerCase().includes(q);
        const matchesCity = r.hospitalCity.toLowerCase().includes(q);
        const matchesBlood = r.bloodGroup.toLowerCase().includes(q);
        if (!matchesHospital && !matchesCity && !matchesBlood) return false;
      }
      if (statusFilter === "PENDING" && r.response !== "PENDING") return false;
      if (statusFilter === "ACCEPTED" && r.response !== "ACCEPTED") return false;
      return true;
    });
  }, [requests, searchQuery, statusFilter]);

  const pendingCount = requests.filter((r) => r.response === "PENDING").length;
  const acceptedCount = requests.filter((r) => r.response === "ACCEPTED").length;

  return (
    <div className="space-y-5 pb-12">
      {/* 1. Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {!isLoading && (
          <span className="text-xs text-slate-500">
            Showing {filteredRequests.length} of {requests.length} emergency alerts
          </span>
        )}
      </div>

      {/* 2. Compact Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Emergency Blood Requests
              </h1>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#A2363A]/10 border border-[#A2363A]/20 text-[#A2363A]">
                  {pendingCount} Awaiting Response
                </span>
              )}
            </div>
            <p className="hidden sm:block text-sm text-slate-600">
              Urgent hospital alerts in your area matching your blood group. Volunteering helps save lives in critical situations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={loadRequests}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/donor/requests"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs"
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>All Requests</span>
          </Link>
        </div>
      </header>

      {/* 3. Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-2xs ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4. Search and Status Tabs */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search hospital or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-[#317786] mr-1 hidden sm:inline shrink-0" />
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "PENDING"
                ? "bg-[#053845] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
            }`}
          >
            Awaiting Action ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACCEPTED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "ACCEPTED"
                ? "bg-emerald-700 text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-emerald-700 border border-[#F3E9D1]"
            }`}
          >
            You Volunteered ({acceptedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-[#317786] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
            }`}
          >
            All Requests ({requests.length})
          </button>
        </div>
      </section>

      {/* 5. Request Cards List */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center text-slate-500 shadow-2xs space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#317786] mx-auto" />
          <p className="text-xs text-slate-500">Checking for urgent matching requests...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-10 text-center text-slate-500 shadow-2xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
            <Heart className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-serif text-base font-bold text-[#053845]">
              {statusFilter === "PENDING"
                ? "No Urgent Requests Pending Action"
                : statusFilter === "ACCEPTED"
                ? "No Volunteered Requests Yet"
                : "No Emergency Requests Found"}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {statusFilter === "PENDING"
                ? "You have answered all incoming emergency requests. Check back later or view general requests."
                : "Matching requests will appear here when hospital facilities request your blood group."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((item) => {
            const isPending = item.response === "PENDING";
            const isAccepted = item.response === "ACCEPTED";
            const isDeclined = item.response === "DECLINED";
            const isSubmitting = isSubmittingId === item.deliveryId;
            const bloodDisplay = mapBloodGroupToDisplay(item.bloodGroup);

            return (
              <article
                key={item.deliveryId}
                className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs hover:border-[#317786]/45 transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Blood Badge + Hospital & Urgency Info */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#317786]/10 border border-[#317786]/25 font-serif text-lg font-bold text-[#053845] flex items-center justify-center shrink-0 shadow-2xs">
                      {bloodDisplay}
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-serif text-base sm:text-lg font-bold text-[#053845] truncate">
                          {item.hospitalName}
                        </h3>
                        {item.urgencyLevel === "CRITICAL" && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            CRITICAL EMERGENCY
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 text-[#317786] font-medium">
                          <MapPin className="w-3.5 h-3.5" />
                          {item.hospitalCity} ({item.distanceDisplay})
                        </span>
                        <span>&bull;</span>
                        <span>
                          {item.unitsRequired} unit(s) • {item.bloodComponent.replace("_", " ")}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 text-slate-600">
                          <Clock className="w-3.5 h-3.5 text-rose-500" />
                          Needed by: {new Date(item.requiredBy).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Response Status */}
                  <div className="shrink-0 self-end sm:self-center">
                    {isAccepted && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>You Volunteered</span>
                      </span>
                    )}
                    {isDeclined && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <XCircle className="w-4 h-4 text-slate-400" />
                        <span>Declined</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Radio className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        <span>Action Required</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions Bar for Pending Requests */}
                {isPending && (
                  <div className="pt-3 border-t border-[#F3E9D1]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-500">
                      Volunteering lets the medical team contact you directly to coordinate your arrival. Pre-donation screening occurs at the facility.
                    </p>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleRespond(item.deliveryId, "DECLINED")}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-[#F3E9D1] text-slate-600 hover:bg-[#FAF6EE] transition cursor-pointer disabled:opacity-50"
                      >
                        Decline
                      </button>

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleRespond(item.deliveryId, "ACCEPTED")}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-[#317786] text-white hover:bg-[#255d69] transition shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <>
                            <Heart className="w-3.5 h-3.5 fill-current" />
                            <span>I Can Donate</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Volunteered Confirmation Note */}
                {isAccepted && (
                  <div className="pt-3 border-t border-[#F3E9D1]/70 bg-emerald-50/50 p-3 rounded-xl flex items-start gap-2 text-xs text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">Voluntary Confirmation Sent:</strong> The medical team at {item.hospitalName} has been notified and will reach out to you shortly to coordinate timing. Thank you!
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
