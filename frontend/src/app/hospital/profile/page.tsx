"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  ShieldCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Phone,
  MapPin,
  FileBadge,
  User,
  Save,
  Loader2,
  Lock,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { AuthHospital, setStoredUser, getStoredUser, getStoredDonor, getStoredRequester } from "@/lib/auth";

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
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-16">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
          Hospital Facility Profile
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage clinical facility contact information and view platform accreditation status
        </p>
      </div>

      {/* Accreditation Status Card */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845] shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#053845]">
              Accreditation & Approval Status
            </h3>
            <p className="text-xs text-slate-500">
              Registration Number: <strong className="font-mono text-slate-800">{hospital?.registrationnumber || "Pending"}</strong>
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {hospital?.approvalstatus === "VERIFIED" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verified Care Facility</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Verification In Progress</span>
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>{successMessage}</div>
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-8 shadow-xs space-y-6">
        <h2 className="font-serif text-base font-bold text-[#053845] pb-3 border-b border-slate-100">
          Institutional Details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Facility Name
            </label>
            <input
              type="text"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Registration / License Number</span>
              <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                <Lock className="w-3 h-3" /> Immutable
              </span>
            </label>
            <input
              type="text"
              value={hospital?.registrationnumber || ""}
              disabled
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-mono cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Clinical Representative Name
            </label>
            <input
              type="text"
              value={contactPersonName}
              onChange={(e) => setContactPersonName(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Contact Phone Number
            </label>
            <input
              type="text"
              value={contactPersonPhone}
              onChange={(e) => setContactPersonPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
            Physical Facility Address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
              State
            </label>
            <input
              type="text"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Area PIN Code
            </label>
            <input
              type="text"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Facility Profile</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
