"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Tent,
  Calendar,
  Clock,
  MapPin,
  Building2,
  Users,
  Search,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Compass,
  BookmarkCheck,
} from "lucide-react";
import { api } from "@/lib/api";

interface CampItem {
  campid: string;
  campname: string;
  description?: string | null;
  organizername: string;
  organizingbloodbank: string;
  contactperson: string;
  contactphone?: string | null;
  campdate: string;
  starttime: string;
  endtime: string;
  timezone: string;
  venuename: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  isregistrationrequired: boolean;
  registrationstatus: "OPEN" | "CLOSED";
  isregistrationopen: boolean;
  registrationdeadline: string;
  registrationinstructions?: string | null;
  donorinstructions?: string | null;
  eligibilitynotes?: string | null;
  maxcapacity?: number | null;
  registeredcount: number;
  remainingcapacity?: number | null;
  distancekm?: number | null;
}

export default function DonorCampDiscoveryPage() {
  const [camps, setCamps] = useState<CampItem[]>([]);
  const [registeredCampIds, setRegisteredCampIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [radiusFilter, setRadiusFilter] = useState<number | "">("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Fetch camps and donor's existing registrations
  const fetchCamps = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params: any = {};
      if (search.trim()) params.search = search.trim();
      if (cityFilter.trim()) params.city = cityFilter.trim();
      if (stateFilter.trim()) params.state = stateFilter.trim();
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (userCoords && radiusFilter) {
        params.latitude = userCoords.lat;
        params.longitude = userCoords.lng;
        params.radiusKm = Number(radiusFilter);
      }

      const [campsRes, myRegsRes] = await Promise.all([
        api.camps.discover(params),
        api.camps.getMyRegistrations().catch(() => ({ success: false, data: [] })),
      ]);

      if (campsRes.success && campsRes.data) {
        setCamps(campsRes.data.camps || []);
      } else {
        setError("Failed to discover blood donation camps.");
      }

      if (myRegsRes.success && Array.isArray(myRegsRes.data)) {
        const activeIds = new Set<string>();
        myRegsRes.data.forEach((r: any) => {
          if (r.registrationstatus === "REGISTERED" && r.camp?.campid) {
            activeIds.add(r.camp.campid);
          }
        });
        setRegisteredCampIds(activeIds);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya server to discover camps.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCamps();
  }, [userCoords, radiusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCamps();
  };

  const handleClearFilters = () => {
    setSearch("");
    setCityFilter("");
    setStateFilter("");
    setDateFrom("");
    setDateTo("");
    setRadiusFilter("");
    setUserCoords(null);
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!radiusFilter) setRadiusFilter(25); // default to 25 km
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        alert(`Location access denied or unavailable (${err.message}). Showing address-based search.`);
      },
      { timeout: 10000 }
    );
  };

  const formatCampDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
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

        <Link
          href="/donor/my-camps"
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-[#F3E9D1] text-xs font-semibold text-[#053845] hover:bg-[#FAF6EE] shadow-2xs transition-all"
        >
          <BookmarkCheck className="w-3.5 h-3.5 text-[#317786]" />
          <span>My Registrations</span>
          {registeredCampIds.size > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#317786] text-white text-[10px] font-bold flex items-center justify-center ml-0.5">
              {registeredCampIds.size}
            </span>
          )}
        </Link>
      </div>

      {/* Header matching Donor Dashboard & Blood Requests */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Tent className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Nearby Blood Donation Camps
              </h1>
              {!isLoading && !error && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {camps.length} {camps.length === 1 ? "Camp" : "Camps"} Available
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600">
              Discover verified mobile camps organized by certified blood banks. Participate as a walk-in donor or reserve your preferred time slot in advance.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchCamps}
          disabled={isLoading}
          className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] hover:bg-[#FAF6EE] shadow-2xs transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#317786] ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Search & Filter Bar */}
      <section aria-label="Search and filter blood camps">
        <form
          onSubmit={handleSearchSubmit}
          className="p-3.5 sm:p-4 bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
        >
          {/* Keyword Search */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search camp name, venue, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-slate-50/50 text-[#053845] placeholder:text-slate-400 focus:outline-none focus:border-[#317786] transition-colors"
            />
          </div>

          {/* City / District */}
          <div>
            <input
              type="text"
              placeholder="City or District"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-slate-50/50 text-[#053845] placeholder:text-slate-400 focus:outline-none focus:border-[#317786] transition-colors"
            />
          </div>

          {/* Date Picker */}
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From Date"
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-slate-50/50 text-[#053845] focus:outline-none focus:border-[#317786] transition-colors"
            />
          </div>

          {/* Actions: Search Button & Location toggle */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 py-2 px-4 rounded-xl bg-[#317786] hover:bg-[#245964] text-white text-xs font-semibold shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>

            <button
              type="button"
              onClick={requestGeolocation}
              disabled={isLocating}
              title="Detect Nearby Camps via Geolocation"
              className={`p-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                userCoords
                  ? "bg-[#317786] text-white border-[#317786]"
                  : "bg-white text-[#053845] border-[#F3E9D1] hover:bg-[#FAF6EE]"
              }`}
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#317786]" />
              ) : (
                <Compass className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>

        {/* Active Radius Filter Pill if Location Active */}
        {userCoords && (
          <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium text-[11px]">
              <Compass className="w-3.5 h-3.5 text-emerald-600" />
              Using your coordinates
            </span>
            <select
              value={radiusFilter}
              onChange={(e) => setRadiusFilter(e.target.value ? Number(e.target.value) : "")}
              className="px-2 py-1 text-xs bg-white border border-[#F3E9D1] rounded-lg text-[#053845] focus:outline-none"
            >
              <option value="">All Distances</option>
              <option value="10">Within 10 km</option>
              <option value="25">Within 25 km</option>
              <option value="50">Within 50 km</option>
              <option value="100">Within 100 km</option>
            </select>
            <button
              type="button"
              onClick={handleClearFilters}
              className="text-xs text-slate-500 hover:text-[#053845] underline ml-2 cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        )}
      </section>

      {/* Main Content: Camp Listing */}
      <section aria-label="Available Blood Camps List">
        {/* Error State */}
        {error && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-sm">Unable to load blood camps</p>
              <p className="text-amber-700 mt-0.5">{error}</p>
            </div>
            <button
              onClick={fetchCamps}
              className="text-xs font-semibold text-amber-900 underline hover:no-underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#317786]" />
            <p className="text-xs font-medium text-slate-500">Discovering verified blood camps nearby...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && camps.length === 0 && (
          <div className="p-10 sm:p-14 text-center bg-white rounded-3xl border border-[#F3E9D1] shadow-2xs max-w-md mx-auto my-6">
            <div className="w-12 h-12 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 flex items-center justify-center mx-auto text-[#317786] mb-4">
              <Tent className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#053845]">No blood donation camps found</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              There are currently no upcoming published camps matching your selected filters. Try broadening your location or date parameters.
            </p>
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-5 px-4 py-2 rounded-xl bg-[#317786] hover:bg-[#245964] text-white text-xs font-semibold shadow-2xs cursor-pointer transition-all"
            >
              Clear Search Filters
            </button>
          </div>
        )}

        {/* Cards Grid */}
        {!isLoading && !error && camps.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {camps.map((camp) => {
              const isRegistered = registeredCampIds.has(camp.campid);
              const isWalkInOnly = !camp.isregistrationrequired;
              const isCapacityFull = camp.maxcapacity !== null && camp.maxcapacity !== undefined && camp.registeredcount >= camp.maxcapacity;

              return (
                <div
                  key={camp.campid}
                  className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs hover:shadow-xs transition-all flex flex-col overflow-hidden group"
                >
                  {/* Card Header Banner */}
                  <div className="p-4 sm:p-5 pb-3.5 border-b border-[#F3E9D1]/70 flex items-start justify-between gap-3 bg-[#FAF6EE]/40">
                    <div className="min-w-0 flex-1">
                      {/* Walk-in vs Registration Pill */}
                      {isWalkInOnly ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#317786]/10 text-[#317786] border border-[#317786]/20 mb-2">
                          Walk-in Welcome
                        </span>
                      ) : camp.isregistrationopen ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                          Registration Open
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 mb-2">
                          Registration Closed
                        </span>
                      )}

                      <h3 className="font-serif text-base font-bold text-[#053845] group-hover:text-[#317786] transition-colors truncate">
                        {camp.campname}
                      </h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{camp.organizingbloodbank}</span>
                      </p>
                    </div>

                    {/* Already Registered Indicator */}
                    {isRegistered && (
                      <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold shrink-0 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Registered
                      </span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5 text-xs text-slate-600">
                      {/* Date & Time */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#317786]/10 flex items-center justify-center shrink-0 text-[#317786]">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-[#053845]">
                          {formatCampDate(camp.campdate)}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span>
                          {camp.starttime} – {camp.endtime}
                        </span>
                      </div>

                      {/* Location & Distance */}
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#317786]/10 flex items-center justify-center shrink-0 text-[#317786] mt-0.5">
                          <MapPin className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 line-clamp-1">{camp.venuename}</p>
                          <p className="text-slate-500 text-[11px] truncate">
                            {camp.city}, {camp.state}
                          </p>
                        </div>

                        {camp.distancekm !== null && camp.distancekm !== undefined && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600 shrink-0">
                            {camp.distancekm} km
                          </span>
                        )}
                      </div>

                      {/* Capacity Status */}
                      {!isWalkInOnly && camp.maxcapacity && (
                        <div className="flex items-center gap-2 pt-1">
                          <div className="w-6 h-6 rounded-lg bg-[#317786]/10 flex items-center justify-center shrink-0 text-[#317786]">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-slate-500">Slots:</span>
                              <span className="font-bold text-[#053845]">
                                {camp.remainingcapacity ?? 0} left of {camp.maxcapacity}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isCapacityFull ? "bg-amber-500" : "bg-[#317786]"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (camp.registeredcount / camp.maxcapacity) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer Button */}
                    <div className="pt-3 border-t border-[#F3E9D1]/60">
                      <Link
                        href={`/donor/camps/${camp.campid}`}
                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-2xs ${
                          isRegistered
                            ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                            : "bg-[#317786] hover:bg-[#245964] text-white"
                        }`}
                      >
                        {isRegistered ? (
                          <>
                            <span>View Registration Ticket</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        ) : isWalkInOnly ? (
                          <>
                            <span>View Walk-in Details</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            <span>View Details & Register</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
