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
  XCircle,
  HelpCircle,
  Compass,
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
      setError("Valid regulatory license number is required for facility registration");
      return;
    }
    if (!contactPersonName.trim()) {
      setError("Authorized medical or administrative contact person name is required");
      return;
    }
    if (!contactPersonPhone.trim()) {
      setError("Direct emergency contact phone number is required");
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
        // Create initial blood bank profile
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
          setSuccessMessage("Facility profile created successfully. Status set to Pending Verification.");

          // Update stored blood bank in localStorage
          const user = getStoredUser();
          if (user) {
            setStoredUser(user, getStoredDonor(), getStoredRequester(), getStoredHospital(), res);
          }
        }
      } else {
        // Update existing blood bank profile
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

          // Update stored blood bank in localStorage
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
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Retrieving Facility Credentials...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-16">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          href="/bloodbank/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blood Bank Dashboard</span>
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
          {isNewFacility ? "Register Blood Bank Facility" : "Blood Bank Facility Profile"}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          {isNewFacility
            ? "Complete initial institutional details to onboard your facility to the Swastya network."
            : "Manage licensed facility contact information, emergency dispatch coordinates, and view CDSCO verification status."}
        </p>
      </div>

      {/* Accreditation Status Card (If exists) */}
      {!isNewFacility && bloodbank && (
        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845] shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#053845] flex items-center gap-2">
                <span>Accreditation & Regulatory Status</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                License: <strong className="font-mono text-slate-800">{bloodbank.licensenumber}</strong>
                <span className="mx-2 text-slate-300">•</span>
                Facility ID: <span className="font-mono text-[11px] text-slate-500">{bloodbank.bloodbankid.slice(0, 8)}...</span>
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {bloodbank.approvalstatus === "APPROVED" && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Platform Approved Facility</span>
              </span>
            )}
            {bloodbank.approvalstatus === "PENDING" && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Verification In Progress</span>
              </span>
            )}
            {bloodbank.approvalstatus === "REJECTED" && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Approval Rejected</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Notice about immutable privileged fields */}
      <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs text-[#053845]/90 flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-[#317786] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#053845]">Institutional Security Policy</p>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            In compliance with national blood banking regulations and Swastya API security policies,
            facility ownership and regulatory approval status are strictly immutable by facility users.
            Any updates to CDSCO license numbers or ownership reassignment must be submitted to State Blood Transfusion Council administrators.
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="font-medium">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="font-medium">{successMessage}</div>
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-8 shadow-xs space-y-6">
        <h2 className="font-serif text-base font-bold text-[#053845] pb-3 border-b border-slate-100 flex items-center justify-between">
          <span>Facility Identification</span>
          <span className="text-[11px] font-normal text-slate-400">All fields required unless marked optional</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Blood Bank Facility Name
            </label>
            <input
              type="text"
              required
              value={bloodBankName}
              onChange={(e) => setBloodBankName(e.target.value)}
              placeholder="e.g. City Central Red Cross Blood Centre"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Regulatory License Number</span>
              {!isNewFacility && (
                <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Immutable
                </span>
              )}
            </label>
            <input
              type="text"
              required
              disabled={!isNewFacility}
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="e.g. BB-2026-DL-0891"
              className={`w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 font-mono ${
                !isNewFacility
                  ? "bg-slate-50 text-slate-500 cursor-not-allowed"
                  : "focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
              }`}
            />
          </div>
        </div>

        <h2 className="font-serif text-base font-bold text-[#053845] pt-2 pb-3 border-b border-slate-100">
          Authorized Representative
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Contact Person / Medical Officer Name
            </label>
            <input
              type="text"
              required
              value={contactPersonName}
              onChange={(e) => setContactPersonName(e.target.value)}
              placeholder="e.g. Dr. Rajesh Sharma"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Emergency Contact Phone
            </label>
            <input
              type="tel"
              required
              value={contactPersonPhone}
              onChange={(e) => setContactPersonPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        <h2 className="font-serif text-base font-bold text-[#053845] pt-2 pb-3 border-b border-slate-100">
          Physical Location & Geocoding
        </h2>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
            Physical Street Address
          </label>
          <input
            type="text"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Plot 14, Health Park, Sector 5"
            className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
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
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
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
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
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
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Latitude (Optional)</span>
              <span className="text-[10px] text-slate-400 font-normal">Decimal degrees (-90 to 90)</span>
            </label>
            <input
              type="text"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="e.g. 28.6139"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Longitude (Optional)</span>
              <span className="text-[10px] text-slate-400 font-normal">Decimal degrees (-180 to 180)</span>
            </label>
            <input
              type="text"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="e.g. 77.2090"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] text-slate-500">
            Coordinates enable precise emergency responder and ambulance radius dispatch.
          </p>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{isNewFacility ? "Registering Facility..." : "Saving Profile..."}</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{isNewFacility ? "Submit Facility Registration" : "Save Facility Changes"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
