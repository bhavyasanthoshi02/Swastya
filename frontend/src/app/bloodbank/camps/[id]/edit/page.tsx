"use client";

import React, { useState, useEffect, use } from "react";
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
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { api, DonationCampItem } from "@/lib/api";

export default function EditBloodDonationCampPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const campId = resolvedParams.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [originalCamp, setOriginalCamp] = useState<DonationCampItem | null>(null);

  // Form State
  const [campName, setCampName] = useState("");
  const [description, setDescription] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [campDate, setCampDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [regOpeningDate, setRegOpeningDate] = useState("");
  const [regDeadline, setRegDeadline] = useState("");

  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [latitude, setLatitude] = useState<number | "">("");
  const [longitude, setLongitude] = useState<number | "">("");

  const [isRegistrationRequired, setIsRegistrationRequired] = useState(true);
  const [maxCapacity, setMaxCapacity] = useState<number | "">("");
  const [registrationInstructions, setRegistrationInstructions] = useState("");
  const [donorInstructions, setDonorInstructions] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");

  useEffect(() => {
    async function loadCamp() {
      setIsLoading(true);
      try {
        const res = await api.bloodbank.camps.getById(campId);
        if (res.success && res.data) {
          const c = res.data;
          setOriginalCamp(c);
          setCampName(c.campname);
          setDescription(c.description || "");
          setOrganizerName(c.organizername);
          setContactPerson(c.contactperson);
          setContactPhone(c.contactphone || "");

          setCampDate(new Date(c.campdate).toISOString().slice(0, 10));
          setStartTime(c.starttime);
          setEndTime(c.endtime);
          setRegOpeningDate(new Date(c.registrationopeningdate).toISOString().slice(0, 16));
          setRegDeadline(new Date(c.registrationdeadline).toISOString().slice(0, 16));

          setVenueName(c.venuename);
          setAddress(c.address);
          setCity(c.city);
          setDistrict(c.district || "");
          setState(c.state);
          setPincode(c.pincode);
          setLatitude(c.latitude ? Number(c.latitude) : "");
          setLongitude(c.longitude ? Number(c.longitude) : "");

          setIsRegistrationRequired(c.isregistrationrequired);
          setMaxCapacity(c.maxcapacity !== null && c.maxcapacity !== undefined ? c.maxcapacity : "");
          setRegistrationInstructions(c.registrationinstructions || "");
          setDonorInstructions(c.donorinstructions || "");
          setEligibilityNotes(c.eligibilitynotes || "");
        }
      } catch (err: any) {
        console.error("Error loading camp for edit:", err);
        setErrorMessage(err?.message || "Failed to load camp details.");
      } finally {
        setIsLoading(false);
      }
    }
    loadCamp();
  }, [campId]);

  const handleUpdate = async () => {
    setErrorMessage(null);
    if (!campName.trim() || !venueName.trim() || !address.trim() || !city.trim() || !state.trim()) {
      setErrorMessage("Camp name, venue name, address, city, and state are required.");
      return;
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
        registrationopeningdate: isRegistrationRequired ? regOpeningDate : undefined,
        registrationdeadline: isRegistrationRequired ? regDeadline : undefined,
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
      };

      const res = await api.bloodbank.camps.update(campId, payload);
      if (res.success) {
        router.push(`/bloodbank/camps/${campId}`);
      } else {
        setErrorMessage(res.message || "Failed to update camp details.");
      }
    } catch (err: any) {
      console.error("Update camp error:", err);
      setErrorMessage(err?.message || "Failed to update camp details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] flex items-center justify-center p-6">
        <RefreshCw className="w-8 h-8 animate-spin text-[#053845]" />
      </div>
    );
  }

  const isPublished = originalCamp?.status === "PUBLISHED";

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#053845] pb-24">
      {/* Top Banner */}
      <div className="bg-white border-b border-[#F3E9D1]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <Link
            href={`/bloodbank/camps/${campId}`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#053845] transition mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Camp Details</span>
          </Link>

          <h1 className="text-xl font-bold text-[#053845]">Edit Donation Camp</h1>
          <p className="text-xs text-slate-500">
            Update schedule, venue, capacity, or instructions for &quot;{originalCamp?.campname}&quot;.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
        {isPublished && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Published Camp Notice</span>
              Modifying the camp date, time, or venue for a published camp will automatically notify all registered donors through the Swastya notification system.
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Error</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          {/* Section 1: Basic Information */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100">
              1. Basic Camp Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Camp Name</label>
                <input
                  type="text"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Organizer / Sponsor Name</label>
                <input
                  type="text"
                  value={organizerName}
                  onChange={(e) => setOrganizerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Public Contact Phone</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Date & Time Schedule */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100">
              2. Date & Schedule
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Camp Date</label>
                <input
                  type="date"
                  value={campDate}
                  onChange={(e) => setCampDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">End Time</label>
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
                    <label className="block text-xs font-medium text-slate-700 mb-1">Registration Opens At</label>
                    <input
                      type="datetime-local"
                      value={regOpeningDate}
                      onChange={(e) => setRegOpeningDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                    />
                  </div>

                  <div className="md:col-span-1.5">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Registration Deadline</label>
                    <input
                      type="datetime-local"
                      value={regDeadline}
                      onChange={(e) => setRegDeadline(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 3: Venue & Location */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4 pb-2 border-b border-slate-100">
              3. Venue & Location
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Venue Name</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Complete Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">District</label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">PIN Code</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value ? parseFloat(e.target.value) : "")}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#053845]"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link
              href={`/bloodbank/camps/${campId}`}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition"
            >
              Cancel
            </Link>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleUpdate}
              className="px-6 py-2.5 rounded-xl bg-[#053845] text-white hover:bg-[#074757] text-sm font-semibold shadow-sm transition disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
