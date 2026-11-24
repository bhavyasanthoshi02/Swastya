"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Save,
  Loader2,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  AuthHospital,
  setStoredUser,
  getStoredUser,
  getStoredDonor,
  getStoredRequester,
} from "@/lib/auth";

export default function HospitalProfilePage() {
  const [hospital, setHospital] = useState<AuthHospital | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Editable Form Fields
  const [hospitalName, setHospitalName] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [contactPersonPhone, setContactPersonPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.hospital.getProfile();
      if (res.success && res.hospital) {
        const h = res.hospital;
        setHospital(h);
        setHospitalName(h.hospitalname || "");
        setContactPersonName(h.contactpersonname || "");
        setContactPersonPhone(h.contactpersonphone || "");
        setAddress(h.address || "");
        setCity(h.city || "");
        setState(h.state || "");
        setPincode(h.pincode || "");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load facility profile");
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

    if (!hospitalName.trim()) {
      setError("Hospital name is required");
      return;
    }
    if (!contactPersonName.trim()) {
      setError("Representative contact person name is required");
      return;
    }
    if (!contactPersonPhone.trim()) {
      setError("Contact phone number is required");
      return;
    }
    if (!address.trim()) {
      setError("Facility address is required");
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
      setError("PIN code is required");
      return;
    }

    try {
      setIsSaving(true);
      const res = await api.hospital.updateProfile({
        hospitalname: hospitalName.trim(),
        contactpersonname: contactPersonName.trim(),
        contactpersonphone: contactPersonPhone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
      });

      if (res.success && res.hospital) {
        setHospital(res.hospital);
        setSuccessMessage("Facility profile updated successfully.");

        // Update stored hospital in localStorage
        const user = getStoredUser();
        if (user) {
          setStoredUser(user, getStoredDonor(), getStoredRequester(), res.hospital);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to update hospital profile.");
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
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>
      </div>

      {/* 2. Page Header */}
      <div className="pb-2 border-b border-[#317786]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Facility Profile
          </h1>
          <p className="hidden sm:block text-xs sm:text-sm text-slate-500">
            Manage your hospital&apos;s institutional details and contact information.
          </p>
        </div>
      </div>

      {/* 3. Feedback Messages */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">{successMessage}</div>
        </div>
      )}

      {/* 4. Main Profile Card */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {/* Compact Facility Identification Strip */}
        <div className="px-5 py-3.5 bg-[#FAF6EE]/60 border-b border-[#F3E9D1] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#F3E9D1] flex items-center justify-center text-[#317786] shrink-0 shadow-2xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#053845]">
                  {hospital?.hospitalname || hospitalName || "Hospital Facility"}
                </h2>
                {hospital?.approvalstatus === "VERIFIED" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Verified</span>
                  </span>
                )}
                {hospital?.approvalstatus === "PENDING" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>Pending Verification</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Registration:{" "}
                <span className="font-semibold text-slate-700">
                  {hospital?.registrationnumber || "Pending"}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Institutional Information Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          <div className="pb-1 border-b border-slate-100">
            <h3 className="font-serif text-base font-bold text-[#053845]">
              Institutional Information
            </h3>
          </div>

          <div className="space-y-4">
            {/* Row 1: Facility Name & Registration / License Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Facility Name <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="e.g., Apollo Hospital"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 flex items-center justify-between">
                  <span>Registration / License Number</span>
                  <span className="text-[10px] text-slate-400 font-normal inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Read-only
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={hospital?.registrationnumber || ""}
                    disabled
                    className="w-full h-10 pl-3.5 pr-8 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-mono text-xs sm:text-sm cursor-not-allowed"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {/* Row 2: Clinical Representative Name & Contact Phone Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Clinical Representative Name <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="text"
                  value={contactPersonName}
                  onChange={(e) => setContactPersonName(e.target.value)}
                  placeholder="e.g., Dr. Ramesh Sharma"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Contact Phone Number <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="tel"
                  value={contactPersonPhone}
                  onChange={(e) => setContactPersonPhone(e.target.value)}
                  placeholder="e.g., 9876543210"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
                />
              </div>
            </div>

            {/* Row 3: Physical Facility Address (Full Width) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#053845]">
                Physical Facility Address <span className="text-[#A2363A]">*</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g., Plot 12, Health City, Sector 4"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
              />
            </div>

            {/* Row 4: City, State, Area PIN Code */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  City <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g., Hyderabad"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  State <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g., Telangana"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Area PIN Code <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="e.g., 500081"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* 5. Save Action (Bottom Right) */}
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
