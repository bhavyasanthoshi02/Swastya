"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { api } from "@/lib/api";

export default function NewBloodDonationCampPage() {
  const router = useRouter();

  // Basic Details
  const [campName, setCampName] = useState("");
  const [description, setDescription] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Schedule
  const [campDate, setCampDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [regOpeningDate, setRegOpeningDate] = useState("");
  const [regDeadline, setRegDeadline] = useState("");

  // Venue & Location
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [latitude, setLatitude] = useState<number | "">("");
  const [longitude, setLongitude] = useState<number | "">("");

  // Registration & Rules
  const [isRegistrationRequired, setIsRegistrationRequired] = useState(true);
  const [maxCapacity, setMaxCapacity] = useState<number | "">(100);
  const [registrationInstructions, setRegistrationInstructions] = useState("");
  const [donorInstructions, setDonorInstructions] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");

  // Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      {/* 1. Header with Back Button */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <Link
            href="/bloodbank/camps"
            className="w-10 h-10 rounded-2xl bg-white border border-[#F3E9D1] text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] flex items-center justify-center shrink-0 shadow-2xs transition-colors"
            title="Back to Camp Management"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="space-y-0.5 min-w-0">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              Create Blood Donation Camp
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Schedule, configure and publish an upcoming voluntary blood donation drive.
            </p>
          </div>
        </div>
      </header>

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
                placeholder="e.g. Lions Club of Pune / Infosys Foundation"
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
                placeholder="e.g. Dr. Rajesh Kulkarni (Camp Coordinator)"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Public Contact Phone (Optional)
              </label>
              <input
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Displayed on public camp details for donor inquiries.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                disabled
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/70 text-slate-500 text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Camp Description (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Briefly describe the purpose of the camp, partner organizations, or key highlights..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Date & Time Schedule */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <Calendar className="w-4 h-4 text-[#317786]" />
            <span>2. Date & Time Schedule</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Camp Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={campDate}
                onChange={(e) => handleCampDateChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Time (24h) <span className="text-rose-500">*</span>
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
                End Time (24h) <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            {isRegistrationRequired && (
              <>
                <div className="md:col-span-1.5">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registration Opens At <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={regOpeningDate}
                    onChange={(e) => setRegOpeningDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                    required={isRegistrationRequired}
                  />
                </div>

                <div className="md:col-span-1.5">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registration Deadline <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={regDeadline}
                    onChange={(e) => setRegDeadline(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                    required={isRegistrationRequired}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Section 3: Venue & Location */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <MapPin className="w-4 h-4 text-[#317786]" />
            <span>3. Venue & Geographic Location</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Venue Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Community Center Auditorium / Tech Park Amphitheatre"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Complete Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Sector 2, Phase 1, Hinjawadi Rajiv Gandhi Infotech Park"
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
                District (Optional)
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
                PIN Code <span className="text-rose-500">*</span>
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
                Latitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 18.5913"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value ? parseFloat(e.target.value) : "")}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Longitude (Optional)
              </label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 73.7389"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value ? parseFloat(e.target.value) : "")}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Registration & Capacity Configuration */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <Users className="w-4 h-4 text-[#317786]" />
            <span>4. Registration & Capacity Settings</span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isRegRequired"
                checked={isRegistrationRequired}
                onChange={(e) => setIsRegistrationRequired(e.target.checked)}
                className="w-4 h-4 rounded text-[#053845] border-[#F3E9D1] focus:ring-[#317786]"
              />
              <label htmlFor="isRegRequired" className="text-xs font-semibold text-slate-800 cursor-pointer">
                Require Advance Online Registration for Donors
              </label>
            </div>

            {!isRegistrationRequired && (
              <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] text-xs">
                <strong>Walk-in Model:</strong> Donors can discover this camp on Swastya Donor Network without reserving in advance.
              </div>
            )}

            {isRegistrationRequired && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Maximum Registration Capacity (Optional)
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 150 (Leave blank for unlimited)"
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(e.target.value ? parseInt(e.target.value) : "")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Registration automatically closes once capacity is reached.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Registration Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bring government photo ID and booking confirmation SMS."
                    value={registrationInstructions}
                    onChange={(e) => setRegistrationInstructions(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 5: Preparation & Eligibility Instructions */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F3E9D1]/60 text-[#053845] font-serif font-bold text-sm tracking-wide">
            <FileText className="w-4 h-4 text-[#317786]" />
            <span>5. Donor Guidelines & Preparation</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Preparation Instructions (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Ensure sound sleep of at least 6 hours, drink plenty of water, and have a light meal before donation."
                value={donorInstructions}
                onChange={(e) => setDonorInstructions(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Organizer-Specific Eligibility Notes (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Age 18-65, weight > 45 kg, hemoglobin >= 12.5 g/dL. No recent antibiotic therapy in the last 7 days."
                value={eligibilityNotes}
                onChange={(e) => setEligibilityNotes(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF6EE]/40 border border-[#F3E9D1] text-xs text-[#053845] focus:outline-none focus:ring-1 focus:ring-[#317786]"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/bloodbank/camps"
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
