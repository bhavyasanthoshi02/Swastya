"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Users,
  Phone,
  Clock,
  Building,
  MapPin,
  Search,
  ExternalLink,
  AlertCircle,
  Car,
  X,
  RefreshCw,
} from "lucide-react";
import { api, AvailableDonorItem, BloodRequestItem } from "@/lib/api";
import { formatTimeAgo, mapBloodGroupToDisplay } from "@/lib/mappers";

const DONORS_NAV_STATE_KEY = "swastya_available_donors_state";

function getCurrentStageLabel(transitStatus?: string | null): string {
  switch (transitStatus) {
    case "STARTED":
      return "Started · En Route to Hospital";
    case "REACHED_LOCATION":
      return "Reached Location · At Blood Bank Desk";
    case "COMPLETED":
      return "Blood Received · Fulfilled";
    default:
      return "Donor Found · Preparing to Depart";
  }
}

function RequesterAvailableDonorsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRequestId = searchParams?.get("requestId") || "all";

  const [donors, setDonors] = useState<AvailableDonorItem[]>([]);
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string>(initialRequestId);
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>("all");
  const [selectedArrival, setSelectedArrival] = useState<string>("all");
  const [selectedTransit, setSelectedTransit] = useState<string>("all");

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [donorsRes, requestsRes] = await Promise.all([
        api.requester.getAvailableDonors(),
        api.requester.getBloodRequests(),
      ]);

      if (donorsRes.success) {
        setDonors(donorsRes.availableDonors || []);
      }
      if (requestsRes.success) {
        setRequests(requestsRes.bloodRequests || []);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load available donors from Swastya network."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = sessionStorage.getItem(DONORS_NAV_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.searchTerm === "string") setSearchTerm(parsed.searchTerm);
        if (typeof parsed.selectedRequestId === "string" && !searchParams?.get("requestId")) {
          setSelectedRequestId(parsed.selectedRequestId);
        }
        if (typeof parsed.selectedBloodGroup === "string") setSelectedBloodGroup(parsed.selectedBloodGroup);
        if (typeof parsed.selectedArrival === "string") setSelectedArrival(parsed.selectedArrival);
        if (typeof parsed.selectedTransit === "string") setSelectedTransit(parsed.selectedTransit);
        if (typeof parsed.scrollY === "number" && parsed.scrollY > 0) {
          requestAnimationFrame(() => window.scrollTo(0, parsed.scrollY));
        }
        sessionStorage.removeItem(DONORS_NAV_STATE_KEY);
      }
    } catch {}
  }, [searchParams]);

  const handleOpenDonorDetails = (donor: AvailableDonorItem) => {
    const commitmentId = donor.deliveryId || donor.notificationId;
    if (!donor.requestId || !commitmentId) return;

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          DONORS_NAV_STATE_KEY,
          JSON.stringify({
            searchTerm,
            selectedRequestId,
            selectedBloodGroup,
            selectedArrival,
            selectedTransit,
            scrollY: window.scrollY,
          })
        );
      } catch {}
    }

    router.push(`/requester/requests/${donor.requestId}/donors/${commitmentId}?from=available-donors`);
  };

  useEffect(() => {
    const q = searchParams?.get("requestId");
    if (q) {
      setSelectedRequestId(q);
    }
  }, [searchParams]);

  // Derived filtered donors
  const filteredDonors = donors.filter((d) => {
    const matchesSearch =
      d.donorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.donorCity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.hospitalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.requestId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRequest =
      selectedRequestId === "all" || d.requestId === selectedRequestId;

    const matchesBloodGroup =
      selectedBloodGroup === "all" ||
      d.donorBloodGroup === selectedBloodGroup ||
      d.donorBloodGroup ===
        selectedBloodGroup.replace("+", "_POSITIVE").replace("-", "_NEGATIVE");

    const matchesArrival =
      selectedArrival === "all" ||
      (selectedArrival === "urgent" && d.estimatedArrival.toLowerCase().includes("1 hour")) ||
      (selectedArrival === "today" &&
        (d.estimatedArrival.toLowerCase().includes("hour") ||
          d.estimatedArrival.toLowerCase().includes("afternoon")));

    const currentTransit = d.transitStatus || "DONOR_FOUND";
    const matchesTransit =
      selectedTransit === "all" || currentTransit === selectedTransit;

    return (
      matchesSearch &&
      matchesRequest &&
      matchesBloodGroup &&
      matchesArrival &&
      matchesTransit
    );
  });

  const enRouteDonors = donors.filter(
    (d) => (d.transitStatus || "DONOR_FOUND") === "STARTED"
  ).length;
  const reachedLocationDonors = donors.filter(
    (d) => (d.transitStatus || "DONOR_FOUND") === "REACHED_LOCATION"
  ).length;

  const hasActiveFilters =
    Boolean(searchTerm) ||
    selectedRequestId !== "all" ||
    selectedBloodGroup !== "all" ||
    selectedArrival !== "all" ||
    selectedTransit !== "all";

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedRequestId("all");
    setSelectedBloodGroup("all");
    setSelectedArrival("all");
    setSelectedTransit("all");
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Requester Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            Showing {filteredDonors.length} of {donors.length} volunteers
          </span>
        )}
      </div>

      {/* 1. Compact Page Heading directly on cream background */}
      <header className="flex items-center gap-3.5 pb-4 border-b border-[#317786]/15">
        <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Available Donors
          </h1>
          <p className="hidden sm:block text-sm text-slate-600">
            Track volunteers who have responded to your blood requests.
          </p>
        </div>
      </header>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 2. Three Compact KPI Cards */}
      <section
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        aria-label="Donor summary metrics"
      >
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Total Volunteers</p>
            <p className="font-serif text-xl sm:text-2xl font-bold text-[#053845] leading-tight">
              {donors.length}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Car className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Started / En Route</p>
            <p className="font-serif text-xl sm:text-2xl font-bold text-[#053845] leading-tight">
              {enRouteDonors}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EFA27E]/20 border border-[#EFA27E]/40 text-[#B94F30] flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 truncate">Reached Hospital</p>
            <p className="font-serif text-xl sm:text-2xl font-bold text-[#053845] leading-tight">
              {reachedLocationDonors}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Compact Search and Filters directly on cream background */}
      <section aria-label="Search and filter donors" className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search donor, city, patient, or hospital..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white border border-[#F3E9D1] shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845] transition-colors"
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

          <div className="lg:col-span-3">
            <select
              value={selectedRequestId}
              onChange={(e) => setSelectedRequestId(e.target.value)}
              aria-label="Filter by patient request"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-[#F3E9D1] shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845] font-medium cursor-pointer"
            >
              <option value="all">All Blood Requests</option>
              {requests.map((req) => (
                <option key={req.requestid} value={req.requestid}>
                  {req.patientname} ({mapBloodGroupToDisplay(req.bloodgroup)})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1">
            <select
              value={selectedBloodGroup}
              onChange={(e) => setSelectedBloodGroup(e.target.value)}
              aria-label="Filter by blood group"
              className="w-full px-2.5 py-2 rounded-xl text-xs bg-white border border-[#F3E9D1] shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845] font-medium cursor-pointer"
            >
              <option value="all">Group</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={selectedTransit}
              onChange={(e) => setSelectedTransit(e.target.value)}
              aria-label="Filter by transit stage"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-[#F3E9D1] shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845] font-medium cursor-pointer"
            >
              <option value="all">All Transit Stages</option>
              <option value="DONOR_FOUND">1. Donor Found</option>
              <option value="STARTED">2. Started (En Route)</option>
              <option value="REACHED_LOCATION">3. Reached Location</option>
              <option value="COMPLETED">4. Blood Received</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={selectedArrival}
              onChange={(e) => setSelectedArrival(e.target.value)}
              aria-label="Filter by arrival window"
              className="w-full px-3 py-2 rounded-xl text-xs bg-white border border-[#F3E9D1] shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845] font-medium cursor-pointer"
            >
              <option value="all">All Arrival Windows</option>
              <option value="urgent">Urgent (&lt; 1 hour)</option>
              <option value="today">Today</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#B94F30] hover:text-[#053845] cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          </div>
        )}
      </section>

      {/* 4. Individual Donor Cards */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-14 text-center space-y-3 shadow-2xs">
          <div className="w-7 h-7 border-2 border-[#317786] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading available donors...</p>
        </div>
      ) : donors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 sm:p-7 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
                No donor responses yet
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Donor volunteers will appear here when they respond to your requests.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/requester/requests"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
            >
              View My Requisitions
            </Link>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Donors</span>
            </button>
          </div>
        </div>
      ) : filteredDonors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
              <Search className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <h2 className="font-serif text-base font-bold text-[#053845]">
                No matching donors found
              </h2>
              <p className="text-xs text-slate-600">
                Try clearing your search or resetting the active filters.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredDonors.map((donor) => {
            const bloodDisplay = mapBloodGroupToDisplay(donor.donorBloodGroup);
            const patientBloodDisplay = mapBloodGroupToDisplay(donor.requiredBloodGroup);
            const acceptance = (donor.acceptanceStatus || "PENDING").toUpperCase();
            const isAccepted = acceptance === "ACCEPTED";
            const isRejected = acceptance === "REJECTED";
            const acceptanceBadge = isRejected
              ? { label: "Rejected", cls: "bg-rose-50 text-[#A2363A] border-rose-200" }
              : isAccepted
              ? { label: "Accepted", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
              : { label: "Pending Review", cls: "bg-amber-50 text-amber-800 border-amber-200" };

            return (
              <article
                key={donor.deliveryId || donor.notificationId}
                role="link"
                tabIndex={0}
                aria-label={`View details for donor ${donor.donorName}`}
                onClick={() => handleOpenDonorDetails(donor)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenDonorDetails(donor);
                  }
                }}
                className="group bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs hover:border-[#317786] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/50 transition-all space-y-3 cursor-pointer"
              >
                {/* Top Row: Donor Identity, Blood Group, Location, Acceptance & Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-[#317786]/10 border border-[#317786]/25 text-[#053845] font-serif font-bold text-base flex items-center justify-center shrink-0">
                      {bloodDisplay}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845] group-hover:text-[#317786] transition-colors truncate">
                          {donor.donorName}
                        </h2>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${acceptanceBadge.cls}`}
                        >
                          {acceptanceBadge.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                          <span>
                            {donor.donorCity}
                            {donor.donorState ? `, ${donor.donorState}` : ""}
                          </span>
                        </span>
                        <span>&middot;</span>
                        <span>Volunteered {formatTimeAgo(donor.respondedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Call Donor & View Request Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start md:self-center">
                    {donor.donorPhone ? (
                      <a
                        href={`tel:${donor.donorPhone}`}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs"
                        title="Call Donor Directly"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call Donor ({donor.donorPhone})</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 bg-[#FAF6EE] border border-[#F3E9D1]">
                        <Phone className="w-3.5 h-3.5 text-[#317786]" />
                        <span>Phone on File with Desk</span>
                      </span>
                    )}

                    <Link
                      href={`/requester/requests/${donor.requestId}`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#B94F30] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>View Request</span>
                    </Link>
                  </div>
                </div>

                {/* Compact Summary Bar: Patient/Request Reference, Journey Status & ETA */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="font-semibold text-[#053845]">
                      For {donor.patientName}
                    </span>
                    <span className="text-[#B94F30] font-semibold">
                      {patientBloodDisplay} &middot; {donor.unitsRequired}{" "}
                      {donor.unitsRequired === 1 ? "unit" : "units"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-600 min-w-0">
                      <Building className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                      <span className="truncate">
                        {donor.hospitalName}
                        {donor.hospitalCity ? `, ${donor.hospitalCity}` : ""}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <span className="font-semibold text-[#053845]">
                      {getCurrentStageLabel(donor.transitStatus)}
                    </span>
                    {donor.estimatedArrival && (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-[#317786]" />
                        <span>
                          ETA: <strong className="text-[#053845]">{donor.estimatedArrival}</strong>
                        </span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[#317786] font-semibold group-hover:translate-x-0.5 transition-transform">
                      <span>Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RequesterAvailableDonorsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-slate-500">
          Loading matched donors...
        </div>
      }
    >
      <RequesterAvailableDonorsContent />
    </Suspense>
  );
}
