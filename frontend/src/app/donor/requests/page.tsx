"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  MapPin,
  ArrowLeft,
  Heart,
  CheckCircle2,
  Clock,
  Droplet,
  Filter,
  Search,
  Eye,
  Loader2,
  AlertCircle,
  RefreshCw,
  Building2,
  Calendar,
  X,
} from "lucide-react";
import { RequestPreviewItem } from "@/components/donor/DonorTypes";
import { RequestDetailModal } from "@/components/donor/RequestDetailModal";
import { DonorCommitmentActions } from "@/components/donor/DonorCommitmentActions";
import { api } from "@/lib/api";
import { mapBackendRequestToPreview, mapBloodGroupToDisplay } from "@/lib/mappers";

export default function DonorBloodRequestsPage() {
  const [requests, setRequests] = useState<RequestPreviewItem[]>([]);
  const [donorBloodGroup, setDonorBloodGroup] = useState<string>("O+");
  const [selectedRequest, setSelectedRequest] = useState<RequestPreviewItem | null>(null);
  const [respondedIds, setRespondedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [transitUpdatingId, setTransitUpdatingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const fetchMatchingRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getMatchingRequests();

      if (res.success) {
        setDonorBloodGroup(mapBloodGroupToDisplay(res.donorBloodGroup));
        const rawList = res.requests || [];
        const rawCommitments = res.myCommitments || [];
        const mappedCommitments = rawCommitments.map(mapBackendRequestToPreview);
        const mappedMatches = rawList.map(mapBackendRequestToPreview);

        const byRawId = new Map<string, RequestPreviewItem>();
        for (const c of mappedCommitments) {
          byRawId.set(c.rawId || c.id, c);
        }
        for (const m of mappedMatches) {
          const key = m.rawId || m.id;
          if (!byRawId.has(key)) byRawId.set(key, m);
        }
        setRequests(Array.from(byRawId.values()));

        const alreadyResponded = [...rawList, ...rawCommitments]
          .filter((r: { hasResponded?: boolean; requestid?: string }) => r.hasResponded && r.requestid)
          .map((r: { requestid: string }) => `REQ-${r.requestid.slice(0, 8).toUpperCase()}`);
        setRespondedIds((prev) => Array.from(new Set([...prev, ...alreadyResponded])));
      } else {
        setError("Failed to load blood requests.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to Swastya backend.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchingRequests();
  }, []);

  const handleUpdateTransit = async (
    requestId: string,
    status: "STARTED" | "REACHED_LOCATION",
    deliveryId?: string
  ) => {
    try {
      setTransitUpdatingId(requestId);
      const res = await api.bloodRequests.updateTransitStatus(requestId, status, { deliveryId });
      setActionSuccessMessage(
        res.message ||
          (status === "STARTED"
            ? "Journey started! The requester has been notified."
            : "Arrival at hospital recorded! Awaiting blood receipt confirmation.")
      );
      await fetchMatchingRequests();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update journey status.");
    } finally {
      setTransitUpdatingId(null);
    }
  };

  const handleRespond = async (id: string) => {
    const target = requests.find((r) => r.id === id);
    const targetId = target?.rawId || id.replace(/^REQ-/, "");

    try {
      const res = await api.donor.respondToRequest(targetId);
      if (res.success) {
        if (!respondedIds.includes(id)) {
          setRespondedIds((prev) => [...prev, id]);
        }
        setActionSuccessMessage(
          res.message || "Your willingness to donate was recorded successfully."
        );
        setTimeout(() => setActionSuccessMessage(null), 4000);
        await fetchMatchingRequests();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to submit response. Please try again.");
    }
  };

  const handleDecline = async (id: string) => {
    const target = requests.find((r) => r.id === id || r.rawId === id);
    const targetId = target?.rawId || id.replace(/^REQ-/, "");

    try {
      setDecliningId(id);
      const res = await api.donor.declineRequest(targetId);
      if (res.success) {
        setActionSuccessMessage(res.message || "Blood request declined.");
        setTimeout(() => setActionSuccessMessage(null), 4000);
        await fetchMatchingRequests();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to decline request. Please try again.");
    } finally {
      setDecliningId(null);
    }
  };

  const filteredRequests = requests.filter((req) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !q ||
      req.hospitalName.toLowerCase().includes(q) ||
      req.location.toLowerCase().includes(q) ||
      (req.wardOrRoom && req.wardOrRoom.toLowerCase().includes(q)) ||
      req.id.toLowerCase().includes(q);

    const matchesUrgency =
      urgencyFilter === "all" ||
      (urgencyFilter === "critical" && req.urgency === "Critical Emergency") ||
      (urgencyFilter === "urgent" && req.urgency === "Urgent") ||
      (urgencyFilter === "standard" && req.urgency === "Standard");

    return matchesSearch && matchesUrgency;
  });

  const hasActiveFilters = Boolean(searchTerm.trim()) || urgencyFilter !== "all";

  const resetFilters = () => {
    setSearchTerm("");
    setUrgencyFilter("all");
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            Showing {filteredRequests.length} of {requests.length} verified{" "}
            {requests.length === 1 ? "requisition" : "requisitions"}
          </span>
        )}
      </div>

      {actionSuccessMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* 1. Compact Page Header directly on cream background */}
      <header className="flex items-center gap-3.5 pb-4 border-b border-[#317786]/15">
        <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
          <Droplet className="w-5 h-5" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              Matching Blood Requests
            </h1>
            {!isLoading && !error && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                {requests.length} Verified
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Verified requisitions matching your{" "}
            <strong className="text-[#053845]">{donorBloodGroup}</strong> blood group compatibility.
          </p>
        </div>
      </header>

      {/* 2. Compact Search & Filter Toolbar directly on cream background */}
      <section
        aria-label="Search and filter matching blood requests"
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-3"
      >
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by hospital name or area..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white shadow-2xs focus:outline-none focus:border-[#317786] transition-colors text-[#053845]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
          <Filter className="w-3.5 h-3.5 text-[#317786] mr-1 hidden sm:inline shrink-0" />
          <button
            type="button"
            onClick={() => setUrgencyFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              urgencyFilter === "all"
                ? "bg-[#053845] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
            }`}
          >
            All Urgencies ({requests.length})
          </button>
          <button
            type="button"
            onClick={() => setUrgencyFilter("critical")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              urgencyFilter === "critical"
                ? "bg-[#A2363A] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
            }`}
          >
            Critical Emergency
          </button>
          <button
            type="button"
            onClick={() => setUrgencyFilter("urgent")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              urgencyFilter === "urgent"
                ? "bg-[#B94F30] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#B94F30] border border-[#F3E9D1]"
            }`}
          >
            Urgent
          </button>
        </div>
      </section>

      {/* 3. Loading, Error, Empty States & Individual Blood Request Cards */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center space-y-3 shadow-2xs">
          <Loader2 className="w-7 h-7 text-[#317786] animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">
            Checking active compatible requisitions...
          </p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-10 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#fdf2f2] text-[#A2363A] flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-base font-bold text-[#053845]">
            Failed to Load Requests
          </h2>
          <p className="text-xs text-slate-500">{error}</p>
          <button
            type="button"
            onClick={fetchMatchingRequests}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 text-center space-y-2 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
            <Droplet className="w-5 h-5" />
          </div>
          <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
            No matching blood requests right now
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            Open blood requests compatible with your {donorBloodGroup} blood group and coverage area will appear here.
          </p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 text-center space-y-3 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-serif text-base font-bold text-[#053845]">
              No requests match your filters
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try clearing your search or resetting the selected urgency filter.
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const hasResponded = respondedIds.includes(req.id) || Boolean(req.hasResponded);
            const isUrgentCard =
              Boolean(req.isEmergency) ||
              req.urgency === "Critical Emergency" ||
              req.urgency === "Urgent";
            const urgencyBadgeClass =
              req.urgency === "Critical Emergency"
                ? "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/25"
                : req.urgency === "Urgent"
                ? "bg-[#EFA27E]/20 text-[#B94F30] border-[#EFA27E]/45"
                : "bg-[#317786]/10 text-[#317786] border-[#317786]/25";
            const hasRealLocation =
              Boolean(req.location) && req.location !== "Location not specified";
            const hasRealDistance =
              typeof req.distanceKm === "number" || req.locationMatch === "COORDINATES";

            return (
              <article
                key={req.id}
                className={`bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs hover:border-[#317786]/45 transition-colors space-y-2.5 ${
                  isUrgentCard ? "border-l-4 border-l-[#EFA27E]" : ""
                }`}
              >
                {/* Request Identification Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="px-2.5 py-1 rounded-lg bg-[#317786]/10 border border-[#317786]/25 font-serif text-sm font-bold text-[#053845] leading-none shrink-0">
                      {req.bloodGroup}
                    </span>

                    <span className="text-xs font-mono font-semibold text-slate-400 shrink-0">
                      {req.id}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${urgencyBadgeClass}`}
                    >
                      {req.urgencyLabel || req.urgency}
                    </span>

                    <span className="text-xs font-semibold text-[#053845]">
                      {req.units} {req.units > 1 ? "units" : "unit"} &middot;{" "}
                      {req.bloodComponent || "Whole Blood"}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{req.postedTime}</span>
                  </span>
                </div>

                {/* Request Information */}
                <div className="space-y-1.5 min-w-0">
                  <div>
                    <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845] leading-snug break-words">
                      {req.hospitalName}
                    </h2>
                    {req.patientAgeGroup && (
                      <p className="text-xs text-slate-500 mt-0.5">{req.patientAgeGroup}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                    {req.wardOrRoom && (
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span className="break-words">{req.wardOrRoom}</span>
                      </span>
                    )}

                    {hasRealLocation && (
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span className="break-words">{req.location}</span>
                      </span>
                    )}

                    {hasRealDistance && (
                      <span className="inline-flex items-center gap-1 font-medium text-[#317786] shrink-0">
                        <span>{req.distance}</span>
                      </span>
                    )}

                    {(req.requiredByDateTime || req.requiredWithin) && (
                      <span className="inline-flex items-center gap-1.5 text-slate-600 shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                        <span>
                          {req.requiredByDateTime
                            ? `Required ${req.requiredByDateTime}`
                            : req.requiredWithin}
                        </span>
                      </span>
                    )}
                  </div>

                  {req.caseDetails && (
                    <p className="text-xs text-slate-600 line-clamp-2 pt-0.5">
                      {req.caseDetails}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-2.5 border-t border-[#F3E9D1]/70 grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRequest(req)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Details</span>
                  </button>

                  <DonorCommitmentActions
                    item={req}
                    hasResponded={hasResponded}
                    isUpdating={transitUpdatingId === (req.rawId || req.id)}
                    onUpdateTransit={handleUpdateTransit}
                    onDecline={handleDecline}
                    isDeclining={decliningId === req.id || decliningId === req.rawId}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      <RequestDetailModal
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onConfirmDonation={handleRespond}
        onDecline={handleDecline}
        isDeclining={selectedRequest ? (decliningId === selectedRequest.id || decliningId === selectedRequest.rawId) : false}
        hasResponded={selectedRequest ? respondedIds.includes(selectedRequest.id) : false}
        transitUpdatingId={transitUpdatingId}
        onUpdateTransit={handleUpdateTransit}
      />
    </div>
  );
}
