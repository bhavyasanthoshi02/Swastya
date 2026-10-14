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
  ShieldCheck,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { RequestPreviewItem } from "@/components/donor/DonorTypes";
import { RequestDetailModal } from "@/components/donor/RequestDetailModal";
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

  const fetchMatchingRequests = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getMatchingRequests();

      if (res.success) {
        setDonorBloodGroup(mapBloodGroupToDisplay(res.donorBloodGroup));
        const mapped = (res.requests || []).map(mapBackendRequestToPreview);
        setRequests(mapped);

        // Pre-populate responded IDs from genuine backend persistence
        const alreadyResponded = (res.requests || [])
          .filter((r: any) => r.hasResponded)
          .map((r: any) => `REQ-${r.requestid.slice(0, 8).toUpperCase()}`);
        setRespondedIds((prev) => Array.from(new Set([...prev, ...alreadyResponded])));
      } else {
        setError("Failed to load blood requests.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya backend.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatchingRequests();
  }, []);

  const handleRespond = async (id: string) => {
    const target = requests.find((r) => r.id === id);
    const targetId = target?.rawId || id.replace(/^REQ-/, "");

    try {
      const res = await api.donor.respondToRequest(targetId);
      if (res.success) {
        if (!respondedIds.includes(id)) {
          setRespondedIds((prev) => [...prev, id]);
        }
        setActionSuccessMessage(res.message || "Your willingness to donate was recorded successfully.");
        setTimeout(() => setActionSuccessMessage(null), 4000);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to submit response. Please try again.");
    }
  };

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesUrgency =
      urgencyFilter === "all" ||
      (urgencyFilter === "critical" && req.urgency === "Critical Emergency") ||
      (urgencyFilter === "urgent" && req.urgency === "Urgent") ||
      (urgencyFilter === "standard" && req.urgency === "Standard");

    return matchesSearch && matchesUrgency;
  });

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {!isLoading && (
          <span className="text-xs text-slate-500">
            Showing {filteredRequests.length} verified requisitions
          </span>
        )}
      </div>

      {actionSuccessMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Page Header */}
        <div className="p-6 sm:p-8 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#A2363A] animate-pulse" />
                <span className="text-xs font-bold text-[#A2363A] uppercase tracking-wider">
                  Live Emergency Requisition Feed
                </span>
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                Matching Blood Requests
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
                Verified requisitions from certified hospitals matching your{" "}
                <strong className="text-[#053845]">{donorBloodGroup}</strong> blood group compatibility.
              </p>
            </div>

            {/* Quick Summary Pill */}
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] self-start md:self-center">
              <ShieldCheck className="w-5 h-5 text-[#317786]" />
              <div className="text-xs">
                <span className="font-bold text-[#053845] block">Direct Coordination</span>
                <span className="text-slate-500">Zero middlemen • Hospital-direct</span>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="mt-6 pt-6 border-t border-[#F3E9D1]/70 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by hospital name or area..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white focus:outline-none focus:border-[#317786] transition-colors"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 hidden sm:inline" />
              <button
                type="button"
                onClick={() => setUrgencyFilter("all")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  urgencyFilter === "all"
                    ? "bg-[#053845] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
                }`}
              >
                All Urgencies ({requests.length})
              </button>
              <button
                type="button"
                onClick={() => setUrgencyFilter("critical")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  urgencyFilter === "critical"
                    ? "bg-[#A2363A] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
                }`}
              >
                Critical Emergency
              </button>
              <button
                type="button"
                onClick={() => setUrgencyFilter("urgent")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  urgencyFilter === "urgent"
                    ? "bg-[#B94F30] text-white shadow-2xs"
                    : "bg-[#FAF6EE] text-slate-600 hover:text-[#B94F30] border border-[#F3E9D1]"
                }`}
              >
                Urgent
              </button>
            </div>
          </div>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className="p-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Checking active compatible requisitions...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-[#A2363A] mx-auto" />
            <h3 className="font-serif text-base font-bold text-[#053845]">Failed to Load Requests</h3>
            <p className="text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={fetchMatchingRequests}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <Droplet className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="font-serif text-base font-bold text-[#053845]">
              No Active Requisitions at this Time
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              There are currently no open blood requests matching your criteria. When a hospital logs an emergency requirement for your blood group, it will appear here immediately.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((req) => {
              const hasResponded = respondedIds.includes(req.id);

              return (
                <div
                  key={req.id}
                  className="p-5 sm:p-7 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-5"
                >
                  <div className="flex items-start gap-4 sm:gap-5 min-w-0">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#053845] text-white font-serif font-bold text-lg sm:text-xl flex flex-col items-center justify-center shrink-0 shadow-xs">
                      <span className="text-[9px] uppercase opacity-70 leading-none">
                        NEED
                      </span>
                      <span className="mt-0.5">{req.bloodGroup}</span>
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          {req.id}
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            req.urgency === "Critical Emergency"
                              ? "bg-[#A2363A]/10 text-[#A2363A] border border-[#A2363A]/20"
                              : "bg-[#B94F30]/10 text-[#B94F30] border border-[#B94F30]/20"
                          }`}
                        >
                          {req.urgency}
                        </span>

                        <span className="text-xs font-semibold text-slate-700">
                          • {req.units} {req.units > 1 ? "Units" : "Unit"} Required
                        </span>

                        {req.requiredWithin && (
                          <span className="text-[11px] font-medium text-[#317786] bg-[#317786]/10 px-2 py-0.5 rounded flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{req.requiredWithin}</span>
                          </span>
                        )}
                      </div>

                      <h2 className="font-serif text-lg sm:text-xl font-bold text-[#053845] truncate">
                        {req.hospitalName}
                      </h2>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1 text-[#317786] font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-[#B94F30] shrink-0" />
                          <span>{req.distance}</span>
                        </span>
                        <span>•</span>
                        <span className="truncate">{req.location}</span>
                        <span>•</span>
                        <span className="text-slate-400">{req.postedTime}</span>
                      </div>

                      {req.caseDetails && (
                        <p className="text-xs text-slate-600 line-clamp-2 max-w-2xl pt-1">
                          {req.caseDetails}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2.5 self-start md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedRequest(req)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#317786]" />
                      <span>View Details</span>
                    </button>

                    {hasResponded ? (
                      <div className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Response Sent</span>
                      </div>
                    ) : (
                      <Link
                        href={`/donor/requests/${req.rawId || req.id.replace(/^REQ-/, "")}/donate`}
                        className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 bg-[#317786] hover:bg-[#245964] text-white shadow-2xs"
                      >
                        <Heart className="w-3.5 h-3.5 fill-current" />
                        <span>I Can Donate</span>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      <RequestDetailModal
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onConfirmDonation={handleRespond}
        hasResponded={selectedRequest ? respondedIds.includes(selectedRequest.id) : false}
      />
    </div>
  );
}
