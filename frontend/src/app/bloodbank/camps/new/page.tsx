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
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  Loader2,
  Phone,
  Building,
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
        // Default deadline: day before camp at 23:59
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

    if (isRegistrationRequired) {
      if (!regOpeningDate || !regDeadline) {
        setErrorMessage("Registration opening date and deadline are required when registration is enabled.");
        return;
      }
      if (new Date(regOpeningDate) >= new Date(regDeadline)) {
        setErrorMessage("Registration opening date must be earlier than the registration deadline.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
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
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-24">
      {/* Top Banner */}
      <div className="bg-white border-b border-[#F3E9D1]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <Link
            href="/bloodbank/camps"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#053845] transition mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Camp Management</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Tent className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#053845]">Create Blood Donation Camp</h1>
              <p className="text-xs text-slate-500">
                Organize an upcoming voluntary blood donation drive.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Validation Error</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          {/* Section 1: Basic Information */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100">
              <Tent className="w-4 h-4 text-rose-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                1. Basic Camp Information
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Camp Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune Tech Park Voluntary Blood Donation Drive 2026"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Organizer / Sponsor Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lions Club of Pune / Infosys Foundation"
                  value={organizerName}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Contact Person Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Rajesh Kulkarni (Camp Coordinator)"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Public Contact Phone (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Displayed on public camp details for donor inquiries.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  value={timezone}
                  disabled
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Camp Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Briefly describe the purpose of the camp, partner organizations, or key highlights..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Date & Time Schedule */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                2. Date & Time Schedule
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Camp Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={campDate}
                  onChange={(e) => handleCampDateChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Start Time (24h) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  End Time (24h) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              {isRegistrationRequired && (
                <>
                  <div className="md:col-span-1.5">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Registration Opens At <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={regOpeningDate}
                      onChange={(e) => setRegOpeningDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                      required={isRegistrationRequired}
                    />
                  </div>

                  <div className="md:col-span-1.5">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Registration Deadline <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={regDeadline}
                      onChange={(e) => setRegDeadline(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                      required={isRegistrationRequired}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 3: Venue & Location */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                3. Venue & Geographic Location
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Venue Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Community Center Auditorium / Tech Park Amphitheatre"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Complete Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sector 2, Phase 1, Hinjawadi Rajiv Gandhi Infotech Park"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  City <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  District (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  State <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maharashtra"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  PIN Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 411057"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Latitude (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 18.5913"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Used by Feature 6 for accurate distance discovery.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Longitude (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 73.7389"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Registration & Capacity Configuration */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100">
              <Users className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                4. Registration & Capacity Settings
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="isRegRequired"
                  checked={isRegistrationRequired}
                  onChange={(e) => setIsRegistrationRequired(e.target.checked)}
                  className="w-4 h-4 rounded text-[#053845] border-slate-300 focus:ring-[#053845]"
                />
                <label htmlFor="isRegRequired" className="text-sm font-medium text-slate-800 cursor-pointer">
                  Require Advance Registration
                </label>
              </div>

              {!isRegistrationRequired && (
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs">
                  <strong>Walk-in Model:</strong> Donors can discover this camp on Feature 6 without registering in advance. No capacity limits will be enforced.
                </div>
              )}

              {isRegistrationRequired && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Maximum Registration Capacity (Optional)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 150 (Leave blank for unlimited)"
                      value={maxCapacity}
                      onChange={(e) => setMaxCapacity(e.target.value ? parseInt(e.target.value) : "")}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                    />
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Registration closes automatically once capacity is reached.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Registration Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bring government photo ID and registration reference code."
                      value={registrationInstructions}
                      onChange={(e) => setRegistrationInstructions(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Preparation & Eligibility Instructions */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-slate-100">
              <FileText className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                5. Donor Instructions & Eligibility Information
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Preparation Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Ensure sound sleep of at least 6 hours, drink plenty of water, and have a light meal before donation."
                  value={donorInstructions}
                  onChange={(e) => setDonorInstructions(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Organizer-Provided Eligibility Criteria (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Age 18-65, weight > 45 kg, hemoglobin >= 12.5 g/dL. No recent antibiotic therapy in the last 7 days."
                  value={eligibilityNotes}
                  onChange={(e) => setEligibilityNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link
              href="/bloodbank/camps"
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition"
            >
              Cancel
            </Link>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit("DRAFT")}
              className="px-5 py-2.5 rounded-xl border border-[#053845] text-[#053845] hover:bg-slate-50 text-sm font-semibold transition disabled:opacity-50"
            >
              Save as Draft
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit("PUBLISHED")}
              className="px-6 py-2.5 rounded-xl bg-[#053845] text-white hover:bg-[#074757] text-sm font-semibold shadow-sm transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Publish Camp</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
