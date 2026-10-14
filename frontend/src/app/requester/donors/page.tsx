"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Droplet,
  Phone,
  Clock,
  CheckCircle2,
  Building,
  MapPin,
  Search,
  Filter,
  PlusCircle,
  ExternalLink,
  AlertCircle,
  Car,
} from "lucide-react";
import { api, AvailableDonorItem, BloodRequestItem } from "@/lib/api";
import { formatTimeAgo, mapBloodGroupToDisplay } from "@/lib/mappers";

export default function RequesterAvailableDonorsPage() {
  const searchParams = useSearchParams();
  const initialRequestId = searchParams?.get("requestId") || "all";

  const [donors, setDonors] = useState<AvailableDonorItem[]>([]);
  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string>(initialRequestId);
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>("all");
  const [selectedArrival, setSelectedArrival] = useState<string>("all");
  const [selectedTransit, setSelectedTransit] = useState<string>("all");

  const handleUpdateDonorStatus = async (donor: AvailableDonorItem, newStatus: string) => {
    try {
      setIsUpdatingStatus(donor.notificationId);
      const res = await api.requester.updateDonorTransitStatus(
        donor.requestId,
        newStatus,
        donor.donorUserId
      );
      if (res.success) {
        setDonors((prev) =>
          prev.map((d) =>
            d.notificationId === donor.notificationId
              ? {
                  ...d,
                  transitStatus: newStatus,
                  status: newStatus,
                  startedAt: newStatus === "STARTED" ? new Date().toISOString() : d.startedAt,
                  reachedAt: newStatus === "REACHED_LOCATION" ? new Date().toISOString() : d.reachedAt,
                  completedAt: newStatus === "COMPLETED" ? new Date().toISOString() : d.completedAt,
                }
              : d
          )
        );
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update donor transit status.");
    } finally {
      setIsUpdatingStatus(null);
    }
  };

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
    } catch (err: any) {
      setError(err?.message || "Failed to load available donors from Swastya network.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      d.donorBloodGroup === selectedBloodGroup.replace("+", "_POSITIVE").replace("-", "_NEGATIVE");

    const matchesArrival =
      selectedArrival === "all" ||
      (selectedArrival === "urgent" && d.estimatedArrival.toLowerCase().includes("1 hour")) ||
      (selectedArrival === "today" &&
        (d.estimatedArrival.toLowerCase().includes("hour") ||
          d.estimatedArrival.toLowerCase().includes("afternoon")));

    const currentTransit = d.transitStatus || "DONOR_FOUND";
    const matchesTransit =
      selectedTransit === "all" || currentTransit === selectedTransit;

    return matchesSearch && matchesRequest && matchesBloodGroup && matchesArrival && matchesTransit;
  });

  const totalScreenedAndEligible = donors.filter((d) => d.isEligible).length;
  const immediateArrivalDonors = donors.filter(
    (d) =>
      d.estimatedArrival.toLowerCase().includes("1 hour") ||
      d.estimatedArrival.toLowerCase().includes("urgent")
  ).length;
  const enRouteDonors = donors.filter(
    (d) => (d.transitStatus || "DONOR_FOUND") === "STARTED"
  ).length;
  const reachedLocationDonors = donors.filter(
    (d) => (d.transitStatus || "DONOR_FOUND") === "REACHED_LOCATION"
  ).length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Requester Dashboard</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/requester/requests/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] transition-colors shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Raise New Blood Request</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Page Header */}
        <div className="p-6 sm:p-8 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#317786]" />
                <span className="text-xs font-bold text-[#317786] uppercase tracking-wider">
                  Live Donor Commitments
                </span>
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                Available Donors
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
                Verified voluntary donors pledged for your active blood requisitions.
              </p>
            </div>

            {/* Total count badge */}
            <div className="flex items-center gap-2 sm:self-center shrink-0">
              <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1] shadow-2xs flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#317786]" />
                <span>{donors.length} Donors Connected</span>
              </span>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-2 border-t border-[#F3E9D1]/60">
            <div className="p-3 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total Volunteers
              </span>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#053845] mt-0.5 block">
                {donors.length}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Screened &amp; Eligible
              </span>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#317786] mt-0.5 block">
                {totalScreenedAndEligible}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Started / En Route
              </span>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#317786] mt-0.5 block">
                {enRouteDonors}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Reached Hospital
              </span>
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#B94F30] mt-0.5 block">
                {reachedLocationDonors}
              </span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-5 sm:p-6 bg-[#FAF6EE]/50 border-b border-[#F3E9D1] space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="md:col-span-4 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by donor name, city, patient name, or hospital..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-hidden focus:ring-2 focus:ring-[#317786] transition-all"
              />
            </div>

            {/* Requisition Dropdown */}
            <div className="md:col-span-3">
              <select
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-hidden focus:ring-2 focus:ring-[#317786] text-slate-700 font-semibold cursor-pointer"
              >
                <option value="all">All Blood Requisitions</option>
                {requests.map((req) => (
                  <option key={req.requestid} value={req.requestid}>
                    Patient: {req.patientname} ({mapBloodGroupToDisplay(req.bloodgroup)})
                  </option>
                ))}
              </select>
            </div>

            {/* Blood Group Filter */}
            <div className="md:col-span-1">
              <select
                value={selectedBloodGroup}
                onChange={(e) => setSelectedBloodGroup(e.target.value)}
                className="w-full px-2 py-2.5 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-hidden focus:ring-2 focus:ring-[#317786] text-slate-700 font-semibold cursor-pointer"
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

            {/* Transit Stage Filter */}
            <div className="md:col-span-2">
              <select
                value={selectedTransit}
                onChange={(e) => setSelectedTransit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-hidden focus:ring-2 focus:ring-[#317786] text-slate-700 font-semibold cursor-pointer"
              >
                <option value="all">All Transit Stages</option>
                <option value="DONOR_FOUND">1. Donor Found</option>
                <option value="STARTED">2. Started (En Route)</option>
                <option value="REACHED_LOCATION">3. Reached Location</option>
                <option value="COMPLETED">4. Donation Completed</option>
              </select>
            </div>

            {/* Arrival Filter */}
            <div className="md:col-span-2">
              <select
                value={selectedArrival}
                onChange={(e) => setSelectedArrival(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-hidden focus:ring-2 focus:ring-[#317786] text-slate-700 font-semibold cursor-pointer"
              >
                <option value="all">All Arrival Windows</option>
                <option value="urgent">Urgent (&lt; 1 hour)</option>
                <option value="today">Today</option>
              </select>
            </div>
          </div>

          {/* Active Filter Indicators */}
          {(searchTerm || selectedRequestId !== "all" || selectedBloodGroup !== "all" || selectedArrival !== "all" || selectedTransit !== "all") && (
            <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
              <span>Filtering results:</span>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedRequestId("all");
                  setSelectedBloodGroup("all");
                  setSelectedArrival("all");
                  setSelectedTransit("all");
                }}
                className="text-[#B94F30] font-semibold hover:underline cursor-pointer"
              >
                Reset all filters
              </button>
            </div>
          )}
        </div>

        {/* Donors List Body */}
        {isLoading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#317786] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading available donors...</p>
          </div>
        ) : filteredDonors.length === 0 ? (
          <div className="p-12 sm:p-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-3xl bg-[#FAF6EE] text-slate-400 mx-auto flex items-center justify-center border border-[#F3E9D1]">
              <Users className="w-7 h-7 text-[#317786]" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-bold text-[#053845]">
                {donors.length === 0
                  ? "No Voluntary Donors Have Responded Yet"
                  : "No Donors Match Your Filter Criteria"}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {donors.length === 0
                  ? "When matching voluntary donors view your requisitions and complete their mandatory pre-donation screening, their contact details and verified clearance will appear here in real time."
                  : "Try clearing search filters or selecting 'All Requisitions' to view all connected volunteers."}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <Link
                href="/requester/requests"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
              >
                View My Requisitions
              </Link>
              <button
                type="button"
                onClick={loadData}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors cursor-pointer"
              >
                Refresh Donors Feed
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#F3E9D1]">
            {filteredDonors.map((donor) => {
              const bloodDisplay = mapBloodGroupToDisplay(donor.donorBloodGroup);
              const patientBloodDisplay = mapBloodGroupToDisplay(donor.requiredBloodGroup);

              return (
                <div
                  key={donor.notificationId}
                  className="p-5 sm:p-6 hover:bg-[#FAF6EE]/30 transition-colors space-y-4"
                >
                  {/* Top Row: Donor info + Blood badges + Action */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      {/* Blood Group Badge */}
                      <div className="w-12 h-12 rounded-2xl bg-[#A2363A] text-white font-serif font-bold text-base flex flex-col items-center justify-center shrink-0 shadow-xs">
                        <span className="text-[7px] uppercase tracking-wider text-white/80 leading-none">
                          DONOR
                        </span>
                        <span className="mt-0.5">{bloodDisplay}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
                            {donor.donorName}
                          </h3>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-[#317786]" />
                            <span>Screened &bull; Eligible</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-[#B94F30]" />
                            <span>{donor.donorCity}{donor.donorState ? `, ${donor.donorState}` : ""}</span>
                          </span>
                          <span>&bull;</span>
                          <span>Volunteered {formatTimeAgo(donor.respondedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Contact & Requisition Actions */}
                    <div className="flex items-center gap-2 sm:self-center shrink-0 flex-wrap">
                      {donor.donorPhone ? (
                        <a
                          href={`tel:${donor.donorPhone}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#053845] hover:bg-[#317786] shadow-2xs transition-all cursor-pointer"
                          title="Call Donor Directly"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call Donor ({donor.donorPhone})</span>
                        </a>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200">
                          <Phone className="w-3.5 h-3.5" />
                          <span>Phone on File with Desk</span>
                        </div>
                      )}

                      <Link
                        href={`/requester/requests/${donor.requestId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#317786]" />
                        <span>View Request</span>
                      </Link>
                    </div>
                  </div>

                  {/* Live Donor Journey Stepper (Donor Found -> Started -> Reached Location -> Completed) */}
                  <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-3">
                    {/* Header: Stage Badge + Requester Blood Received Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#F3E9D1]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Live Donor Journey Status:
                        </span>

                        {(!donor.transitStatus || donor.transitStatus === "DONOR_FOUND") && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white text-[#053845] border border-[#F3E9D1] shadow-2xs">
                            <Clock className="w-3.5 h-3.5 text-[#317786]" />
                            <span>1. Donor Found &bull; Preparing to Depart</span>
                          </span>
                        )}

                        {donor.transitStatus === "STARTED" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white text-[#053845] border border-[#317786]/40 shadow-2xs">
                            <Car className="w-3.5 h-3.5 text-[#317786]" />
                            <span>2. Started &bull; En Route to Hospital</span>
                          </span>
                        )}

                        {donor.transitStatus === "REACHED_LOCATION" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white text-[#053845] border border-[#B94F30]/40 shadow-2xs">
                            <MapPin className="w-3.5 h-3.5 text-[#B94F30]" />
                            <span>3. Reached Location &bull; At Blood Bank Desk</span>
                          </span>
                        )}

                        {donor.transitStatus === "COMPLETED" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white text-[#053845] border border-[#317786] shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#317786]" />
                            <span>4. Blood Received &bull; Requisition Fulfilled</span>
                          </span>
                        )}
                      </div>

                      {/* Requester Action: Only Mark Blood Received */}
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        {donor.transitStatus !== "COMPLETED" ? (
                          <button
                            type="button"
                            onClick={() => handleUpdateDonorStatus(donor, "COMPLETED")}
                            disabled={isUpdatingStatus === donor.notificationId}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#B94F30] hover:bg-[#a14023] transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isUpdatingStatus === donor.notificationId ? "Updating..." : "Mark Blood Received"}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#053845] bg-white border border-[#F3E9D1]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#317786]" />
                            <span>Blood Received</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Visual 4-Stage Track using Swastya Color Palette */}
                    <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                      {/* Step 1: Donor Found */}
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <div className="w-full h-1 bg-[#317786] rounded-l-full" />
                          <div className="w-7 h-7 rounded-full bg-[#053845] text-white flex items-center justify-center shrink-0 text-xs shadow-xs ring-2 ring-[#FAF6EE]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <div className={`w-full h-1 rounded-r-full ${
                            donor.transitStatus === "STARTED" || donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                              ? "bg-[#317786]"
                              : "bg-[#F3E9D1]"
                          }`} />
                        </div>
                        <span className="block font-bold text-[11px] text-[#053845] mt-1">1. Donor Found</span>
                        <span className="block text-[9px] text-slate-500">Screened &bull; Pledged</span>
                      </div>

                      {/* Step 2: Started */}
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <div className={`w-full h-1 rounded-l-full ${
                            donor.transitStatus === "STARTED" || donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                              ? "bg-[#317786]"
                              : "bg-[#F3E9D1]"
                          }`} />
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs ${
                            donor.transitStatus === "STARTED" || donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                              ? "bg-[#317786] text-white ring-2 ring-[#FAF6EE]"
                              : "bg-white border border-[#F3E9D1] text-slate-400"
                          }`}>
                            <Car className="w-3.5 h-3.5" />
                          </div>
                          <div className={`w-full h-1 rounded-r-full ${
                            donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                              ? "bg-[#317786]"
                              : "bg-[#F3E9D1]"
                          }`} />
                        </div>
                        <span className={`block font-bold text-[11px] mt-1 ${
                          donor.transitStatus === "STARTED" || donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                            ? "text-[#053845]"
                            : "text-slate-400"
                        }`}>2. Started</span>
                        <span className="block text-[9px] text-slate-500">
                          {donor.startedAt ? formatTimeAgo(donor.startedAt) : "En Route"}
                        </span>
                      </div>

                      {/* Step 3: Reached Location */}
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <div className={`w-full h-1 rounded-l-full ${
                            donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                              ? "bg-[#317786]"
                              : "bg-[#F3E9D1]"
                          }`} />
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs ${
                            donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                              ? "bg-[#B94F30] text-white ring-2 ring-[#FAF6EE]"
                              : "bg-white border border-[#F3E9D1] text-slate-400"
                          }`}>
                            <MapPin className="w-3.5 h-3.5" />
                          </div>
                          <div className={`w-full h-1 rounded-r-full ${
                            donor.transitStatus === "COMPLETED" ? "bg-[#317786]" : "bg-[#F3E9D1]"
                          }`} />
                        </div>
                        <span className={`block font-bold text-[11px] mt-1 ${
                          donor.transitStatus === "REACHED_LOCATION" || donor.transitStatus === "COMPLETED"
                            ? "text-[#053845]"
                            : "text-slate-400"
                        }`}>3. Reached Location</span>
                        <span className="block text-[9px] text-slate-500">
                          {donor.reachedAt ? formatTimeAgo(donor.reachedAt) : "Hospital Desk"}
                        </span>
                      </div>

                      {/* Step 4: Donation Completed / Blood Received */}
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <div className={`w-full h-1 rounded-l-full ${
                            donor.transitStatus === "COMPLETED" ? "bg-[#317786]" : "bg-[#F3E9D1]"
                          }`} />
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs shadow-xs ${
                            donor.transitStatus === "COMPLETED"
                              ? "bg-[#053845] text-white ring-2 ring-[#FAF6EE]"
                              : "bg-white border border-[#F3E9D1] text-slate-400"
                          }`}>
                            <Droplet className="w-3.5 h-3.5" />
                          </div>
                          <div className="w-full h-1 bg-transparent rounded-r-full" />
                        </div>
                        <span className={`block font-bold text-[11px] mt-1 ${
                          donor.transitStatus === "COMPLETED" ? "text-[#053845]" : "text-slate-400"
                        }`}>4. Blood Received</span>
                        <span className="block text-[9px] text-slate-500">
                          {donor.completedAt ? formatTimeAgo(donor.completedAt) : "Fulfilled"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Requisition & ETA Summary */}
                  <div className="p-3.5 rounded-2xl bg-white border border-[#F3E9D1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#FAF6EE] text-[#053845] flex items-center justify-center shrink-0 border border-[#F3E9D1]">
                        <Building className="w-4 h-4 text-[#317786]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#053845]">
                            For: {donor.patientName}
                          </span>
                          <span className="text-[10px] font-bold text-[#A2363A] bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                            Needs {patientBloodDisplay} ({donor.unitsRequired} {donor.unitsRequired > 1 ? "Units" : "Unit"})
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {donor.hospitalName} &bull; {donor.hospitalCity}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-600 bg-[#FAF6EE] px-3 py-1.5 rounded-xl border border-[#F3E9D1] sm:self-center shrink-0">
                      <Clock className="w-3.5 h-3.5 text-[#317786]" />
                      <span className="text-xs">ETA: <strong className="text-[#053845]">{donor.estimatedArrival}</strong></span>
                    </div>
                  </div>

                  {donor.notes && (
                    <p className="text-[11px] text-slate-600 italic px-1">
                      &ldquo;{donor.notes}&rdquo;
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
