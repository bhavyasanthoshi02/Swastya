"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Radio,
  Users,
  Droplets,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Sliders,
  Phone,
  Mail,
  UserCheck,
  Building2,
  ArrowLeft,
  Search,
  Filter,
  Check,
  X,
} from "lucide-react";
import {
  api,
  HospitalMatchingOverviewData,
  RequisitionForMatchingItem,
  MatchingCandidateItem,
  MatchingDonorResponseItem,
} from "@/lib/api";
import { mapBloodGroupToDisplay } from "@/lib/mappers";

export default function EmergencyDonorMatchingPage() {
  const [overview, setOverview] = useState<HospitalMatchingOverviewData | null>(null);
  const [requisitions, setRequisitions] = useState<RequisitionForMatchingItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [selectedRequisition, setSelectedRequisition] = useState<RequisitionForMatchingItem | null>(null);

  const [candidates, setCandidates] = useState<MatchingCandidateItem[]>([]);
  const [responses, setResponses] = useState<MatchingDonorResponseItem[]>([]);
  const [searchRadius, setSearchRadius] = useState<number>(25);

  const [activeTab, setActiveTab] = useState<"candidates" | "responses">("candidates");
  const [candidateFilter, setCandidateFilter] = useState<"all" | "top" | "nearby">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDonorIds, setSelectedDonorIds] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [isNotifying, setIsNotifying] = useState<boolean>(false);
  const [notificationNotes, setNotificationNotes] = useState<string>("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load initial requisitions & overview
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const [overviewRes, reqRes] = await Promise.all([
        api.hospital.emergencyMatching.getOverview().catch(() => ({ success: false, overview: null })),
        api.hospital.emergencyMatching.getRequisitions().catch(() => ({ success: false, requisitions: [] })),
      ]);

      if (overviewRes.success && overviewRes.overview) {
        setOverview(overviewRes.overview);
      }

      if (reqRes.success && reqRes.requisitions && reqRes.requisitions.length > 0) {
        setRequisitions(reqRes.requisitions);
        const preferred = reqRes.requisitions.find((r) => r.isEmergency) || reqRes.requisitions[0];
        setSelectedRequestId(preferred.requestId);
        setSelectedRequisition(preferred);
        setSearchRadius(preferred.searchRadiusKm || 25);
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to load requisitions.",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load candidates and responses for the selected request
  const loadCandidatesAndResponses = useCallback(async (requestId: string, radius: number) => {
    if (!requestId) return;
    setIsLoadingDetails(true);
    setSelectedDonorIds([]);
    try {
      const [candidatesRes, responsesRes] = await Promise.all([
        api.hospital.emergencyMatching.findCandidates(requestId, radius).catch(() => null),
        api.hospital.emergencyMatching.getResponses(requestId).catch(() => null),
      ]);

      if (candidatesRes && candidatesRes.success) {
        setCandidates(candidatesRes.candidates || []);
        if (candidatesRes.requisition) {
          setSelectedRequisition(candidatesRes.requisition);
        }
      }

      if (responsesRes && responsesRes.success) {
        setResponses(responsesRes.responses || []);
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to load matching candidates.",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRequestId) {
      loadCandidatesAndResponses(selectedRequestId, searchRadius);
    }
  }, [selectedRequestId, searchRadius, loadCandidatesAndResponses]);

  // Handle request dropdown change
  const handleSelectRequest = (reqId: string) => {
    setSelectedRequestId(reqId);
    const found = requisitions.find((r) => r.requestId === reqId);
    if (found) {
      setSelectedRequisition(found);
      setSearchRadius(found.searchRadiusKm || 25);
    }
  };

  // Toggle donor selection
  const handleToggleSelectDonor = (donorId: string) => {
    setSelectedDonorIds((prev) =>
      prev.includes(donorId) ? prev.filter((id) => id !== donorId) : [...prev, donorId]
    );
  };

  // Select all unnotified
  const handleSelectAll = () => {
    const unnotified = filteredCandidates.filter((c) => !c.hasBeenNotified).map((c) => c.donorId);
    if (selectedDonorIds.length === unnotified.length) {
      setSelectedDonorIds([]);
    } else {
      setSelectedDonorIds(unnotified);
    }
  };

  // Dispatch emergency notifications
  const handleDispatchNotification = async () => {
    if (!selectedRequestId || selectedDonorIds.length === 0) return;
    setIsNotifying(true);
    setFeedback(null);
    try {
      const res = await api.hospital.emergencyMatching.notifyDonors({
        requestId: selectedRequestId,
        donorIds: selectedDonorIds,
        notes: notificationNotes.trim() || undefined,
      });

      if (res.success) {
        setFeedback({
          type: "success",
          text: `Emergency matching request sent to ${res.totalNotified} voluntary donor(s).`,
        });
        setSelectedDonorIds([]);
        setNotificationNotes("");
        await loadCandidatesAndResponses(selectedRequestId, searchRadius);
        setActiveTab("responses");
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to send emergency requests.",
      });
    } finally {
      setIsNotifying(false);
    }
  };

  // Update donor transit status
  const handleUpdateTransit = async (deliveryId: string, transitStatus: string) => {
    try {
      const res = await api.hospital.emergencyMatching.updateTransit(deliveryId, { transitStatus });
      if (res.success) {
        setResponses((prev) =>
          prev.map((r) => (r.deliveryId === deliveryId ? { ...r, transitStatus } : r))
        );
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err?.message || "Failed to update transit status.",
      });
    }
  };

  // Filter candidates based on search & quick pill filters
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.donorName.toLowerCase().includes(q);
        const matchesCity = c.city.toLowerCase().includes(q);
        const matchesBlood = c.bloodGroup.toLowerCase().includes(q);
        if (!matchesName && !matchesCity && !matchesBlood) return false;
      }
      if (candidateFilter === "top" && c.matchScore < 70) return false;
      if (candidateFilter === "nearby" && (c.distanceKm === null || c.distanceKm > 10)) return false;
      return true;
    });
  }, [candidates, searchQuery, candidateFilter]);

  return (
    <div className="space-y-5 pb-12">
      {/* 1. Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>

        {selectedRequisition && (
          <span className="text-xs text-slate-500">
            Requisition #{selectedRequisition.requestId.slice(0, 8).toUpperCase()} • {candidates.length} potential matches
          </span>
        )}
      </div>

      {/* 2. Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Emergency Donor Matching
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                {requisitions.length} Requisitions Available
              </span>
            </div>
            <p className="hidden sm:block text-sm text-slate-600">
              Identify compatible registered blood donors nearby, send urgent requests, and coordinate volunteer responses.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => {
              loadInitialData();
              if (selectedRequestId) {
                loadCandidatesAndResponses(selectedRequestId, searchRadius);
              }
            }}
            disabled={isLoading || isLoadingDetails}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading || isLoadingDetails ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/hospital/requests"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs"
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>View All Requests</span>
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

      {/* 4. Active Requisition Selector Card */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-[#317786] uppercase tracking-wider block">
              Step 1: Choose Blood Requisition to Match
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedRequestId}
                onChange={(e) => handleSelectRequest(e.target.value)}
                className="text-sm font-semibold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] rounded-xl px-3.5 py-2 focus:outline-none focus:border-[#317786] cursor-pointer max-w-md w-full sm:w-auto"
              >
                {requisitions.length === 0 ? (
                  <option value="">No active requisitions</option>
                ) : (
                  requisitions.map((req) => (
                    <option key={req.requestId} value={req.requestId}>
                      {req.bloodGroup} • {req.unitsRequired} Unit(s) — {req.patientName} ({req.urgencyLevel})
                    </option>
                  ))
                )}
              </select>

              {selectedRequisition && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#053845] text-white">
                    {selectedRequisition.bloodGroup} Needed
                  </span>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                    {selectedRequisition.unitsRequired} unit(s) • {selectedRequisition.bloodComponent.replace("_", " ")}
                  </span>
                  {selectedRequisition.isEmergency && (
                    <span className="px-2 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">
                      CRITICAL URGENCY
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Search Radius Pills */}
          <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#317786]" />
              Coverage Area:
            </span>
            <div className="flex items-center gap-1 bg-[#FAF6EE] p-1 rounded-xl border border-[#F3E9D1]">
              {[10, 25, 50, 100].map((radius) => (
                <button
                  key={radius}
                  type="button"
                  onClick={() => setSearchRadius(radius)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    searchRadius === radius
                      ? "bg-[#053845] text-white shadow-2xs"
                      : "text-slate-600 hover:text-[#053845]"
                  }`}
                >
                  {radius} km
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedRequisition && (
          <div className="pt-3 border-t border-[#F3E9D1]/70 flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span>
              Patient: <strong className="text-slate-800">{selectedRequisition.patientName}</strong> ({selectedRequisition.patientAge} yrs, {selectedRequisition.patientGender})
            </span>
            <span>&bull;</span>
            <span>
              Needed by: <strong className="text-slate-800">{new Date(selectedRequisition.requiredBy).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong> ({new Date(selectedRequisition.requiredBy).toLocaleDateString()})
            </span>
            <span>&bull;</span>
            <span>
              Status: <strong className="text-[#317786]">{selectedRequisition.status}</strong>
            </span>
          </div>
        )}
      </section>

      {/* 5. 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Matching Donors</span>
            <div className="w-8 h-8 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-serif text-[#053845]">
            {candidates.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Compatible donors within {searchRadius} km</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Donors Contacted</span>
            <div className="w-8 h-8 rounded-lg bg-[#053845]/10 text-[#053845] flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-serif text-[#053845]">
            {responses.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Alerts dispatched for this request</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Volunteered</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-serif text-emerald-700">
            {responses.filter((r) => r.response === "ACCEPTED").length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Donors willing to donate</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Awaiting Response</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-serif text-amber-700">
            {responses.filter((r) => r.response === "PENDING").length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Pending donor decisions</p>
        </div>
      </div>

      {/* 6. Main Navigation Tabs */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab("candidates")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "candidates"
                ? "bg-[#053845] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1. Matched Donors</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "candidates" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
            }`}>
              {filteredCandidates.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("responses")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "responses"
                ? "bg-[#053845] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>2. Responses & Tracking</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "responses" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
            }`}>
              {responses.length}
            </span>
          </button>
        </div>

        {activeTab === "candidates" && (
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search donor or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-7 py-1.5 text-xs rounded-xl border border-[#F3E9D1] bg-white shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-semibold text-[#317786] hover:text-[#053845] px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white whitespace-nowrap cursor-pointer"
            >
              {selectedDonorIds.length === filteredCandidates.filter((c) => !c.hasBeenNotified).length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
        )}
      </section>

      {/* 7. TAB 1: MATCHED DONORS LIST */}
      {activeTab === "candidates" && (
        <div className="space-y-4">
          {isLoadingDetails ? (
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center text-slate-500 shadow-2xs space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#317786] mx-auto" />
              <div className="space-y-1">
                <h3 className="font-serif text-base font-bold text-[#053845]">Searching Registered Donors...</h3>
                <p className="text-xs text-slate-500">Checking blood group compatibility, proximity, and 90-day cooldown status.</p>
              </div>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-10 text-center text-slate-500 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-base font-bold text-[#053845]">No Matching Donors Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No registered voluntary donors match the criteria within {searchRadius} km. Try increasing the coverage area.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCandidates.map((cand) => {
                const isSelected = selectedDonorIds.includes(cand.donorId);
                const isNotified = cand.hasBeenNotified;
                const bloodDisplay = mapBloodGroupToDisplay(cand.bloodGroup);

                return (
                  <article
                    key={cand.donorId}
                    className={`bg-white rounded-2xl border p-5 shadow-2xs transition-all space-y-3 ${
                      isSelected
                        ? "border-[#317786] ring-1 ring-[#317786] bg-[#317786]/5"
                        : "border-[#F3E9D1] hover:border-[#317786]/45"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left: Checkbox + Blood Badge + Details */}
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <input
                          type="checkbox"
                          disabled={isNotified}
                          checked={isSelected}
                          onChange={() => handleToggleSelectDonor(cand.donorId)}
                          className="w-4 h-4 rounded border-slate-300 text-[#317786] focus:ring-[#317786] cursor-pointer mt-1 sm:mt-0 disabled:opacity-40"
                        />

                        <div className="w-12 h-12 rounded-xl bg-[#317786]/10 border border-[#317786]/25 font-serif text-lg font-bold text-[#053845] flex items-center justify-center shrink-0 shadow-2xs">
                          {bloodDisplay}
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-serif text-base font-bold text-[#053845] truncate">
                              {cand.donorName}
                            </h3>
                            <span className="text-xs text-slate-500">
                              {cand.gender || "Donor"} • {cand.city}, {cand.state}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                            <span className="flex items-center gap-1 text-[#317786] font-medium">
                              <MapPin className="w-3.5 h-3.5" />
                              {cand.distanceDisplay}
                            </span>
                            <span>&bull;</span>
                            <span className="text-slate-500">
                              {cand.lastDonationDate
                                ? `Last donated: ${cand.lastDonationDate} (${cand.daysSinceLastDonation}d ago)`
                                : "First-time voluntary donor"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Match Score + Notification Status */}
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <div className="text-right">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                            cand.matchScore >= 80
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : cand.matchScore >= 60
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-slate-50 text-slate-700 border border-slate-200"
                          }`}>
                            {cand.matchScore}% Match
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {cand.maskedPhone}
                          </span>
                        </div>

                        {isNotified ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Already Notified
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDonorIds([cand.donorId]);
                              handleDispatchNotification();
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition cursor-pointer"
                          >
                            Notify
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Explanatory subtitle */}
                    <div className="pt-2 border-t border-[#F3E9D1]/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>{cand.explanations.compatibility} • {cand.explanations.location}</span>
                      <span className="font-medium text-slate-600">{cand.explanations.availability}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Sticky Notification Dispatch Footer */}
          {filteredCandidates.length > 0 && selectedDonorIds.length > 0 && (
            <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-[#F3E9D1] p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#317786]/10 text-[#317786] flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#053845]">
                    {selectedDonorIds.length} candidate(s) selected
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Sends emergency in-app alert directly to the chosen donors.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Optional brief note for donors..."
                  value={notificationNotes}
                  onChange={(e) => setNotificationNotes(e.target.value)}
                  className="text-xs px-3 py-2 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE] focus:outline-none focus:border-[#317786] w-full sm:w-64"
                />

                <button
                  type="button"
                  disabled={isNotifying}
                  onClick={handleDispatchNotification}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#053845] text-white hover:bg-[#317786] transition shadow-xs cursor-pointer shrink-0"
                >
                  {isNotifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Notify Selected Donors</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. TAB 2: RESPONSES & TRACKING */}
      {activeTab === "responses" && (
        <div className="space-y-4">
          {isLoadingDetails ? (
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center text-slate-500 shadow-2xs space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#317786] mx-auto" />
              <p className="text-xs text-slate-500">Loading donor responses...</p>
            </div>
          ) : responses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#F3E9D1] p-10 text-center text-slate-500 shadow-2xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
                <Send className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-base font-bold text-[#053845]">No Donors Notified Yet</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Go to &quot;1. Matched Donors&quot;, select compatible donors, and click &quot;Notify&quot; to begin receiving voluntary responses.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map((resp) => {
                const isAccepted = resp.response === "ACCEPTED";
                const isDeclined = resp.response === "DECLINED";
                const bloodDisplay = mapBloodGroupToDisplay(resp.bloodGroup);

                return (
                  <article
                    key={resp.deliveryId}
                    className="bg-white rounded-2xl border border-[#F3E9D1] p-5 shadow-2xs space-y-4 hover:border-[#317786]/45 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left: Blood badge + Donor Details */}
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-[#317786]/10 border border-[#317786]/25 font-serif text-lg font-bold text-[#053845] flex items-center justify-center shrink-0 shadow-2xs">
                          {bloodDisplay}
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-serif text-base font-bold text-[#053845]">
                              {resp.donorName}
                            </h3>
                            <span className="text-xs text-slate-500">
                              {resp.city}, {resp.state}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>
                              Notified: {resp.notifiedAt ? new Date(resp.notifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently"}
                            </span>
                            {resp.respondedAt && (
                              <>
                                <span>&bull;</span>
                                <span>Responded: {new Date(resp.respondedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Response Status */}
                      <div>
                        {isAccepted && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>VOLUNTEERED (ACCEPTED)</span>
                          </span>
                        )}
                        {isDeclined && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <XCircle className="w-4 h-4 text-slate-400" />
                            <span>Declined</span>
                          </span>
                        )}
                        {!isAccepted && !isDeclined && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-4 h-4 text-amber-500" />
                            <span>Awaiting Response</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Unlocked Contact & Coordination for Accepted Donors */}
                    {isAccepted && (
                      <div className="pt-3 border-t border-[#F3E9D1] bg-emerald-50/50 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Donor Contact Information (Unlocked with Consent)</span>
                          </span>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                            <span className="flex items-center gap-1 font-mono font-semibold">
                              <Phone className="w-3.5 h-3.5 text-[#317786]" />
                              {resp.donorPhone}
                            </span>
                            <span className="flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5 text-[#317786]" />
                              {resp.donorEmail}
                            </span>
                          </div>
                        </div>

                        {/* Transit Quick Status Pills */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] font-semibold text-slate-600">Transit:</span>
                          {(["CONTACTED", "IN_TRANSIT", "ARRIVED"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => handleUpdateTransit(resp.deliveryId, status)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                resp.transitStatus === status
                                  ? "bg-[#053845] text-white shadow-2xs"
                                  : "bg-white text-slate-600 border border-[#F3E9D1] hover:bg-[#FAF6EE]"
                              }`}
                            >
                              {status === "CONTACTED" ? "Contacted" : status === "IN_TRANSIT" ? "In Transit" : "Arrived"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
