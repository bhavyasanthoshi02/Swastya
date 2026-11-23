"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Tent,
  Calendar,
  Clock,
  MapPin,
  Building2,
  Users,
  Search,
  Filter,
  ArrowRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  Compass,
  ChevronRight,
  CalendarDays,
  Phone,
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
    <div className="min-h-screen bg-[#FBF9F4] text-slate-800 pb-16">
      {/* Top Banner / Hero */}
      <section className="bg-gradient-to-b from-white via-white to-[#FBF9F4] border-b border-[#F3E9D1] pt-8 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#EFA27E]/15 text-[#053845] border border-[#EFA27E]/30 mb-3">
                <Tent className="w-3.5 h-3.5 text-[#317786]" />
                <span>Community Blood Drives</span>
              </div>
              <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#053845] tracking-tight">
                Nearby Blood Donation Camps
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-2xl leading-relaxed">
                Discover verified mobile camps organized by certified blood banks. Participate as a walk-in donor or reserve your preferred time slot in advance.
              </p>
            </div>

            {/* Quick Action to My Registrations */}
            <div className="flex items-center gap-3">
              <Link
                href="/donor/my-camps"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#F3E9D1] text-sm font-semibold text-[#053845] hover:bg-[#FAF6EE] shadow-sm transition-all"
              >
                <BookmarkCheck className="w-4 h-4 text-[#317786]" />
                <span>My Registrations</span>
                {registeredCampIds.size > 0 && (
                  <span className="w-5 h-5 rounded-full bg-[#317786] text-white text-[11px] font-bold flex items-center justify-center ml-1">
                    {registeredCampIds.size}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="mt-8 p-4 bg-white rounded-2xl border border-[#F3E9D1] shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
          >
            {/* Keyword Search */}
            <div className="relative lg:col-span-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                placeholder="Search camp name, venue, city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#317786]/30 focus:border-[#317786]"
              />
            </div>

            {/* City / District */}
            <div>
              <input
                type="text"
                placeholder="City or District"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#317786]/30 focus:border-[#317786]"
              />
            </div>

            {/* Date Picker */}
            <div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="From Date"
                className="w-full px-3 py-2 text-sm bg-slate-50/60 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#317786]/30 focus:border-[#317786]"
              />
            </div>

            {/* Actions: Search Button & Location toggle */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-2 px-4 rounded-xl bg-[#053845] hover:bg-[#074b5c] text-white text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>Search</span>
              </button>

              <button
                type="button"
                onClick={requestGeolocation}
                disabled={isLocating}
                title="Detect Nearby Camps via Geolocation"
                className={`p-2 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                  userCoords
                    ? "bg-[#317786] text-white border-[#317786]"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {isLocating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Compass className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>

          {/* Active Radius Filter Pill if Location Active */}
          {userCoords && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                <Compass className="w-3.5 h-3.5 text-emerald-600" />
                Using your coordinates
              </span>
              <select
                value={radiusFilter}
                onChange={(e) => setRadiusFilter(e.target.value ? Number(e.target.value) : "")}
                className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
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
                className="text-xs text-slate-500 hover:text-slate-800 underline ml-2 cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Main Content: Camp Listing */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Results Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#F3E9D1]">
          <h2 className="text-base sm:text-lg font-bold text-[#053845] font-serif flex items-center gap-2">
            <span>Upcoming Drives</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FAF6EE] text-[#317786] border border-[#F3E9D1]">
              {camps.length} camps available
            </span>
          </h2>

          <button
            type="button"
            onClick={fetchCamps}
            disabled={isLoading}
            className="text-xs font-medium text-slate-500 hover:text-[#053845] flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold">Unable to load blood camps</p>
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
            <p className="text-sm">Discovering verified blood camps nearby...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && camps.length === 0 && (
          <div className="mt-10 p-12 text-center bg-white rounded-2xl border border-[#F3E9D1] max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto text-[#317786] mb-4">
              <Tent className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#053845]">No blood donation camps found</h3>
            <p className="text-sm text-slate-500 mt-2">
              There are currently no upcoming published camps matching your selected filters. Try broadening your location or date parameters.
            </p>
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-5 px-4 py-2 rounded-xl bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1] text-xs font-semibold hover:bg-[#F3E9D1]/50 cursor-pointer transition-all"
            >
              Clear Search Filters
            </button>
          </div>
        )}

        {/* Cards Grid */}
        {!isLoading && !error && camps.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {camps.map((camp) => {
              const isRegistered = registeredCampIds.has(camp.campid);
              const isWalkInOnly = !camp.isregistrationrequired;
              const isCapacityFull = camp.maxcapacity !== null && camp.maxcapacity !== undefined && camp.registeredcount >= camp.maxcapacity;

              return (
                <div
                  key={camp.campid}
                  className="bg-white rounded-2xl border border-[#F3E9D1] shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden group"
                >
                  {/* Card Header Banner */}
                  <div className="p-5 pb-4 border-b border-[#F3E9D1]/60 flex items-start justify-between gap-3 bg-[#FAF6EE]/30">
                    <div>
                      {/* Walk-in vs Registration Pill */}
                      {isWalkInOnly ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mb-2">
                          Walk-in Welcome
                        </span>
                      ) : camp.isregistrationopen ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                          Registration Open
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 mb-2">
                          Registration Closed
                        </span>
                      )}

                      <h3 className="font-serif text-base font-bold text-[#053845] group-hover:text-[#317786] transition-colors line-clamp-1">
                        {camp.campname}
                      </h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{camp.organizingbloodbank}</span>
                      </p>
                    </div>

                    {/* Already Registered Indicator */}
                    {isRegistered && (
                      <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Registered
                      </span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2.5 text-xs text-slate-600">
                      {/* Date & Time */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#FAF6EE] flex items-center justify-center shrink-0 text-[#317786]">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-slate-800">
                          {formatCampDate(camp.campdate)}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span>
                          {camp.starttime} – {camp.endtime}
                        </span>
                      </div>

                      {/* Location & Distance */}
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#FAF6EE] flex items-center justify-center shrink-0 text-[#317786] mt-0.5">
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
                          <div className="w-6 h-6 rounded-lg bg-[#FAF6EE] flex items-center justify-center shrink-0 text-[#317786]">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-slate-500">Slots:</span>
                              <span className="font-bold text-slate-800">
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
                    <div className="pt-3 border-t border-[#F3E9D1]/50">
                      <Link
                        href={`/donor/camps/${camp.campid}`}
                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          isRegistered
                            ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                            : "bg-[#053845] hover:bg-[#074b5c] text-white shadow-sm"
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
      </main>
    </div>
  );
}
