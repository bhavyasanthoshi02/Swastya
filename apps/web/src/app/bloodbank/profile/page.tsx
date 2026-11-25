"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Save,
  Loader2,
  Lock,
  ArrowLeft,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  AuthBloodBank,
  setStoredUser,
  getStoredUser,
  getStoredDonor,
  getStoredRequester,
  getStoredHospital,
} from "@/lib/auth";

export default function BloodBankProfilePage() {
  const [bloodbank, setBloodBank] = useState<AuthBloodBank | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isNewFacility, setIsNewFacility] = useState(false);

  // Form Fields
  const [bloodBankName, setBloodBankName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [contactPersonPhone, setContactPersonPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.bloodbank.getProfile();
      if (res.success && res.bloodbank) {
        const b = res.bloodbank;
        setBloodBank(b);
        setIsNewFacility(false);
        setBloodBankName(b.bloodbankname || "");
        setLicenseNumber(b.licensenumber || "");
        setContactPersonName(b.contactpersonname || "");
        setContactPersonPhone(b.contactpersonphone || "");
        setAddress(b.address || "");
        setCity(b.city || "");
        setState(b.state || "");
        setPincode(b.pincode || "");
        setLatitude(b.latitude != null ? String(b.latitude) : "");
        setLongitude(b.longitude != null ? String(b.longitude) : "");
      } else {
        setIsNewFacility(true);
      }
    } catch (err: any) {
      if (err?.message?.includes("not found") || err?.message?.includes("No blood bank profile linked")) {
        setIsNewFacility(true);
      } else {
        setError(err?.message || "Failed to load facility profile");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    // Validation
    if (!bloodBankName.trim()) {
      setError("Blood bank facility name is required");
      return;
    }
    if (isNewFacility && !licenseNumber.trim()) {
      setError("Valid regulatory license number is required");
      return;
    }
    if (!contactPersonName.trim()) {
      setError("Authorized representative name is required");
      return;
    }
    if (!contactPersonPhone.trim()) {
      setError("Contact phone number is required");
      return;
    }
    if (!address.trim()) {
      setError("Physical street address is required");
      return;
    }
    if (!city.trim()) {
      setError("City is required");
      return;
    }
    if (!state.trim()) {
      setError("State is required");
      return;
    }
    if (!pincode.trim()) {
      setError("Area PIN code is required");
      return;
    }

    const parsedLat = latitude.trim() ? parseFloat(latitude.trim()) : undefined;
    const parsedLng = longitude.trim() ? parseFloat(longitude.trim()) : undefined;

    if (parsedLat !== undefined && (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90)) {
      setError("Latitude must be a valid number between -90 and 90");
      return;
    }
    if (parsedLng !== undefined && (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180)) {
      setError("Longitude must be a valid number between -180 and 180");
      return;
    }

    try {
      setIsSaving(true);

      if (isNewFacility) {
        const res = await api.bloodbank.createProfile({
          bloodbankname: bloodBankName.trim(),
          licensenumber: licenseNumber.trim().toUpperCase(),
          contactpersonname: contactPersonName.trim(),
          contactpersonphone: contactPersonPhone.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          latitude: parsedLat,
          longitude: parsedLng,
        });

        if (res && res.bloodbankid) {
          setBloodBank(res);
          setIsNewFacility(false);
          setSuccessMessage("Facility profile created successfully.");

          const user = getStoredUser();
          if (user) {
            setStoredUser(user, getStoredDonor(), getStoredRequester(), getStoredHospital(), res);
          }
        }
      } else {
        const res = await api.bloodbank.updateProfile({
          bloodbankname: bloodBankName.trim(),
          contactpersonname: contactPersonName.trim(),
          contactpersonphone: contactPersonPhone.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          latitude: parsedLat,
          longitude: parsedLng,
        });

        if (res.success && res.bloodbank) {
          setBloodBank(res.bloodbank);
          setSuccessMessage("Facility profile updated successfully.");

          const user = getStoredUser();
          if (user) {
            setStoredUser(user, getStoredDonor(), getStoredRequester(), getStoredHospital(), res.bloodbank);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update blood bank profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-2 text-center">
        <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500">Loading facility credentials...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-16">
      {/* 1. Back to Dashboard Navigation */}
      <div>
        <Link
          href="/bloodbank/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blood Bank Dashboard</span>
        </Link>
      </div>

      {/* 2. Page Header */}
      <div className="pb-2 border-b border-[#317786]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Blood Bank Profile
          </h1>
          <p className="hidden sm:block text-xs sm:text-sm text-slate-500">
            Manage your facility information and contact details.
          </p>
        </div>
      </div>

      {/* 3. Feedback Messages */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-xs text-teal-800 flex items-start gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{successMessage}</div>
        </div>
      )}

      {/* 4. Compact Facility Identification Card */}
      {!isNewFacility && bloodbank && (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#317786] shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#053845]">
                  {bloodbank.bloodbankname || bloodBankName || "Blood Bank Facility"}
                </h2>
                {bloodbank.approvalstatus === "REJECTED" ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    <XCircle className="w-3 h-3 text-rose-600" />
                    <span>Rejected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Approved Facility</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                License:{" "}
                <span className="font-semibold text-slate-700">
                  {bloodbank.licensenumber || "Pending"}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. Main Profile Form */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
          {/* Facility Details */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="font-serif text-base font-bold text-[#053845]">
                Facility Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Blood Bank Facility Name
                </label>
                <input
                  type="text"
                  required
                  value={bloodBankName}
                  onChange={(e) => setBloodBankName(e.target.value)}
                  placeholder="e.g. Metro Blood Center"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Regulatory License Number</span>
                  {!isNewFacility && (
                    <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Read-only
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  disabled={!isNewFacility}
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="e.g. DL-BB-77291/CL"
                  className={`w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 font-mono ${
                    !isNewFacility
                      ? "bg-slate-50 text-slate-500 cursor-not-allowed"
                      : "focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="font-serif text-base font-bold text-[#053845]">
                Contact Information
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Authorized Representative / Medical Officer Name
                </label>
                <input
                  type="text"
                  required
                  value={contactPersonName}
                  onChange={(e) => setContactPersonName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Contact Phone Number
                </label>
                <input
                  type="tel"
                  required
                  value={contactPersonPhone}
                  onChange={(e) => setContactPersonPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="font-serif text-base font-bold text-[#053845]">
                Address Information
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Physical Street Address
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Red Cross Avenue, Sector 12"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. New Delhi"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    State
                  </label>
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Delhi"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Area PIN Code
                  </label>
                  <input
                    type="text"
                    required
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    placeholder="e.g. 110001"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Optional Geocoordinates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Latitude (Optional)
                  </label>
                  <input
                    type="text"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="e.g. 28.6139"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Longitude (Optional)
                  </label>
                  <input
                    type="text"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="e.g. 77.2090"
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{isNewFacility ? "Register Facility" : "Save Changes"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
