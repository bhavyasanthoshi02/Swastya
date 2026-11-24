"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Tent,
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertCircle,
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";

function NewCampFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromParam = searchParams.get("from");
  const isFromPlanner = fromParam === "planner";

  // Basic Details
  const [campName, setCampName] = useState(searchParams.get("name") || "");
  const [description, setDescription] = useState(searchParams.get("description") || "");
  const [organizerName, setOrganizerName] = useState(searchParams.get("organizer") || "");
  const [contactPerson, setContactPerson] = useState(searchParams.get("contactPerson") || "");
  const [contactPhone, setContactPhone] = useState(searchParams.get("contactPhone") || "");

  // Schedule
  const [campDate, setCampDate] = useState(searchParams.get("date") || "");
  const [startTime, setStartTime] = useState(searchParams.get("startTime") || "09:00");
  const [endTime, setEndTime] = useState(searchParams.get("endTime") || "17:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [regOpeningDate, setRegOpeningDate] = useState("");
  const [regDeadline, setRegDeadline] = useState("");

  // Venue & Location
  const [venueName, setVenueName] = useState(searchParams.get("venue") || "");
  const [address, setAddress] = useState(searchParams.get("address") || "");
  const [city, setCity] = useState(searchParams.get("city") || "");
  const [district, setDistrict] = useState(searchParams.get("district") || "");
  const [state, setState] = useState(searchParams.get("state") || "");
  const [pincode, setPincode] = useState(searchParams.get("pincode") || "");
  const [latitude, setLatitude] = useState<number | "">(
    searchParams.get("lat") ? Number(searchParams.get("lat")) : ""
  );
  const [longitude, setLongitude] = useState<number | "">(
    searchParams.get("lon") ? Number(searchParams.get("lon")) : ""
  );

  // Registration & Rules
  const [isRegistrationRequired, setIsRegistrationRequired] = useState(true);
  const [maxCapacity, setMaxCapacity] = useState<number | "">(
    searchParams.get("capacity") ? Number(searchParams.get("capacity")) : 100
  );
  const [registrationInstructions, setRegistrationInstructions] = useState(
    isFromPlanner
      ? "Advance voluntary registration through Swastya SMS link or donor portal."
      : ""
  );
  const [donorInstructions, setDonorInstructions] = useState(
    isFromPlanner
      ? "Please ensure adequate hydration, 6+ hours sleep, and carry government photo ID."
      : ""
  );
  const [eligibilityNotes, setEligibilityNotes] = useState("");

  // Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-fill dates if query date is provided
  useEffect(() => {
    const qDate = searchParams.get("date");
    if (qDate) {
      setCampDate(qDate);
      const now = new Date();
      setRegOpeningDate(now.toISOString().slice(0, 16));
      const d = new Date(qDate);
      d.setDate(d.getDate() - 1);
      d.setHours(23, 59, 0, 0);
      setRegDeadline(d.toISOString().slice(0, 16));
    }
  }, [searchParams]);

  // Set default registration opening date to now, and deadline to camp date
  const handleCampDateChange = (val: string) => {
    setCampDate(val);
    if (val) {
      if (!regOpeningDate) {
        setRegOpeningDate(new Date().toISOString().slice(0, 16));
      }
      if (!regDeadline) {
        const d = new Date(val);
        d.setDate(d.getDate() - 1);
        d.setHours(23, 59, 0, 0);
        setRegDeadline(d.toISOString().slice(0, 16));
      }
    }
  };

  const handleSubmit = async (submitStatus: "DRAFT" | "PUBLISHED") => {
    setErrorMessage(null);

    // Basic Validation
    if (!campName.trim()) {
      setErrorMessage("Camp name is required.");
      return;
    }
    if (!organizerName.trim()) {
      setErrorMessage("Organizer name is required.");
      return;
    }
    if (!contactPerson.trim()) {
      setErrorMessage("Contact person is required.");
      return;
    }
    if (!campDate) {
      setErrorMessage("Camp date is required.");
      return;
    }
    if (!venueName.trim() || !address.trim() || !city.trim() || !state.trim()) {
      setErrorMessage("Complete venue name, address, city, and state are required.");
      return;
    }
    if (!pincode.trim()) {
      setErrorMessage("Postal PIN code is required.");
      return;
    }

    if (isRegistrationRequired) {
      if (!regOpeningDate || !regDeadline) {
        setErrorMessage("Registration opening date and deadline are required for advance registration.");
        return;
      }
      if (new Date(regOpeningDate) >= new Date(regDeadline)) {
        setErrorMessage("Registration opening date must be earlier than the deadline.");
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const payload: any = {
        campname: campName.trim(),
        description: description.trim() || null,
        organizername: organizerName.trim(),
        contactperson: contactPerson.trim(),
        contactphone: contactPhone.trim() || null,
        campdate: campDate,
        starttime: startTime,
        endtime: endTime,
        timezone,
        registrationopeningdate: isRegistrationRequired ? regOpeningDate : new Date().toISOString(),
        registrationdeadline: isRegistrationRequired ? regDeadline : new Date(campDate).toISOString(),
        venuename: venueName.trim(),
        address: address.trim(),
        city: city.trim(),
        district: district.trim() || null,
        state: state.trim(),
        pincode: pincode.trim(),
        latitude: latitude !== "" ? Number(latitude) : null,
        longitude: longitude !== "" ? Number(longitude) : null,
        isregistrationrequired: isRegistrationRequired,
        maxcapacity: isRegistrationRequired && maxCapacity !== "" ? Number(maxCapacity) : null,
        registrationinstructions: registrationInstructions.trim() || null,
        donorinstructions: donorInstructions.trim() || null,
        eligibilitynotes: eligibilityNotes.trim() || null,
        status: submitStatus,
      };

      const res = await api.bloodbank.camps.create(payload);
      if (res.success && res.data) {
        router.push(`/bloodbank/camps/${res.data.campid}`);
      } else {
        setErrorMessage(res.message || "Failed to create camp");
      }
    } catch (err: any) {
      console.error("Camp creation error:", err);
      setErrorMessage(err?.message || "Failed to create donation camp. Please verify your input.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* 1. Header with Dynamic Back Navigation */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href={isFromPlanner ? "/bloodbank/camp-planner" : "/bloodbank/camps"}
            className="w-10 h-10 rounded-2xl bg-white border border-[#F3E9D1] text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] flex items-center justify-center shrink-0 shadow-2xs transition-colors"
            title={isFromPlanner ? "Back to Smart Camp Planner" : "Back to Camp Management"}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Create Blood Donation Camp
              </h1>
              {isFromPlanner && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786] inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#317786]" />
                  AI Recommended Drive
                </span>
              )}
            </div>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-500">
              {isFromPlanner
                ? "Pre-populated with optimal location and date recommendations. Review or adjust any details before scheduling."
                : "Schedule, configure and publish an upcoming voluntary blood donation drive."}
            </p>
          </div>
        </div>
      </header>

      {/* AI Recommendation Context Banner if navigated from Camp Planner */}
      {isFromPlanner && (
        <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-200/80 text-xs text-teal-950 flex items-start gap-3 shadow-2xs">
          <Sparkles className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="font-bold text-teal-900 block">
              Pre-populated from Smart Blood Donation Camp Planner
            </strong>
            <p className="text-slate-600 leading-relaxed">
              Venue, capacity, targeted blood groups, and timing have been automatically filled using your facility&apos;s shortage forecast and regional donor density. You may review and customize any parameters before publishing.
            </p>
          </div>
        </div>
      )}

      {/* Validation Error Message */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-3 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Validation Error</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {/* Section 1: Basic Information */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <Tent className="w-4 h-4 text-[#317786]" />
            <span>1. Basic Camp Information</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Camp Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Pune Tech Park Voluntary Blood Donation Drive 2026"
                value={campName}
                onChange={(e) => setCampName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Organizer / Sponsor Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Rotary Club / Infosys CSR / Swastya Blood Bank"
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Person Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Rajesh Sharma"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Phone Number
              </label>
              <input
                type="text"
                placeholder="+91 98765 43210"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Camp Description & Objectives
              </label>
              <textarea
                rows={3}
                placeholder="Describe the target donor community, purpose of the drive, or corporate partner collaboration..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Schedule & Timings */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <Calendar className="w-4 h-4 text-[#317786]" />
            <span>2. Schedule & Operational Hours</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Camp Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={campDate}
                onChange={(e) => handleCampDateChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                End Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>
          </div>

          {isRegistrationRequired && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#F3E9D1]/50">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registration Opening Date & Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={regOpeningDate}
                  onChange={(e) => setRegOpeningDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Registration Deadline <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={regDeadline}
                  onChange={(e) => setRegDeadline(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                  required
                />
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Venue & Location */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <MapPin className="w-4 h-4 text-[#317786]" />
            <span>3. Venue & Geographic Location</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Venue Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Club House Auditorium / Community Hall"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Street Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Plot 14, Phase 2, Rajiv Gandhi Infotech Park, Hinjawadi"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                City <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Pune"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                District
              </label>
              <input
                type="text"
                placeholder="e.g. Pune"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                State <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Maharashtra"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Postal PIN Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 411057"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GPS Latitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 18.5913"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GPS Longitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 73.7389"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Capacity, Registration & Donor Rules */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <Users className="w-4 h-4 text-[#317786]" />
            <span>4. Capacity & Advance Registration Rules</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="regRequired"
                checked={isRegistrationRequired}
                onChange={(e) => setIsRegistrationRequired(e.target.checked)}
                className="w-4 h-4 text-[#053845] rounded-md border-[#F3E9D1] focus:ring-[#317786]"
              />
              <label htmlFor="regRequired" className="text-xs font-semibold text-slate-800 cursor-pointer">
                Require advance voluntary donor slot registration
              </label>
            </div>

            {isRegistrationRequired && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Maximum Donor Target Capacity
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 100"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full sm:w-1/2 px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registration Instructions (Displayed to Donors upon Signup)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Advance slots ensure zero waiting time. Carry government photo ID..."
                value={registrationInstructions}
                onChange={(e) => setRegistrationInstructions(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pre-Donation Preparation Instructions
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Ensure 6+ hours of sleep, have a light meal 2 hours prior, and stay well hydrated..."
                value={donorInstructions}
                onChange={(e) => setDonorInstructions(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-4 border-t border-[#F3E9D1]">
          <Link
            href={isFromPlanner ? "/bloodbank/camp-planner" : "/bloodbank/camps"}
            className="px-4 py-2.5 rounded-xl border border-[#F3E9D1] bg-white text-slate-600 hover:bg-[#FAF6EE] text-xs font-semibold transition-colors shadow-2xs"
          >
            Cancel
          </Link>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit("DRAFT")}
            className="px-4 py-2.5 rounded-xl border border-[#F3E9D1] bg-white text-[#053845] hover:bg-[#FAF6EE] text-xs font-semibold transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            Save as Draft
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit("PUBLISHED")}
            className="px-5 py-2.5 rounded-xl bg-[#053845] text-white hover:bg-[#317786] text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>Publish Camp Immediately</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewBloodDonationCampPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        </div>
      }
    >
      <NewCampFormContent />
    </Suspense>
  );
}
