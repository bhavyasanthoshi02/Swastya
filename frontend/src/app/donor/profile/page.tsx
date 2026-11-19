"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  Edit2,
  Save,
  X,
  Droplet,
  Heart,
  AlertCircle,
  RefreshCw,
  Compass,
  User,
  Lock,
  Scale,
  Calendar,
  Activity,
  Building,
  ArrowRight,
} from "lucide-react";
import { DonorProfile } from "@/components/donor/DonorTypes";
import { api } from "@/lib/api";
import {
  mapBackendDonorToProfile,
  mapBloodGroupToDisplay,
  mapDisplayToBloodGroup,
} from "@/lib/mappers";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function DonorProfilePage() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [rawWeight, setRawWeight] = useState<number | null>(null);
  const [rawAddress, setRawAddress] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    city: "",
    state: "",
    pincode: "",
    address: "",
    weight: "",
    bloodGroup: "",
    latitude: "",
    longitude: "",
  });

  const hydrateFromDonor = useCallback((donor: any, eligibility: any, stats?: any) => {
    const user = donor?.users;
    const mapped = mapBackendDonorToProfile(donor, user, stats, eligibility);
    setProfile(mapped);

    const actualWeight =
      donor?.weight !== undefined && donor?.weight !== null && !isNaN(Number(donor.weight))
        ? Number(donor.weight)
        : null;
    const actualAddress =
      donor?.address && donor.address !== "Not Provided" ? String(donor.address) : "";
    const actualCity = donor?.city && donor.city !== "Not Provided" ? String(donor.city) : "";
    const actualState = donor?.state && donor.state !== "Not Provided" ? String(donor.state) : "";
    const actualPincode =
      donor?.pincode && donor.pincode !== "000000" ? String(donor.pincode) : "";

    setRawWeight(actualWeight);
    setRawAddress(actualAddress);

    setFormData({
      city: actualCity,
      state: actualState,
      pincode: actualPincode,
      address: actualAddress,
      weight: actualWeight !== null ? String(actualWeight) : "",
      bloodGroup: mapBloodGroupToDisplay(donor?.bloodgroup),
      latitude:
        donor?.latitude !== undefined && donor?.latitude !== null ? String(donor.latitude) : "",
      longitude:
        donor?.longitude !== undefined && donor?.longitude !== null ? String(donor.longitude) : "",
    });
  }, []);

  const fetchProfile = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) setIsLoading(true);
        setError(null);
        const res = await api.donor.getProfile();

        if (res.success && res.donor) {
          hydrateFromDonor(res.donor, res.eligibility, (res as any).stats);
        } else {
          setError("Failed to load donor profile data.");
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to connect to Swastya server."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [hydrateFromDonor]
  );

  useEffect(() => {
    fetchProfile(true);
  }, [fetchProfile]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formData.pincode.trim() && !/^\d{6}$/.test(formData.pincode.trim())) {
      errors.pincode = "PIN code must be a 6-digit number.";
    }

    if (formData.weight.trim()) {
      const w = parseFloat(formData.weight);
      if (isNaN(w) || w <= 0 || w > 300) {
        errors.weight = "Enter a valid weight in kg.";
      }
    }

    if (formData.latitude.trim()) {
      const lat = parseFloat(formData.latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        errors.latitude = "Latitude must be between -90 and 90.";
      }
    }

    if (formData.longitude.trim()) {
      const lng = parseFloat(formData.longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        errors.longitude = "Longitude must be between -180 and 180.";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDetectLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeoStatus("Geolocation is not supported by your browser.");
      return;
    }
    setIsDetectingLocation(true);
    setGeoStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setIsDetectingLocation(false);
        setGeoStatus("GPS coordinates detected.");
        setTimeout(() => setGeoStatus(null), 3500);
      },
      () => {
        setIsDetectingLocation(false);
        setGeoStatus("Location access unavailable. You can enter coordinates manually.");
        setTimeout(() => setGeoStatus(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleCancel = () => {
    if (profile) {
      setFormData({
        city: profile.city === "Not Provided" ? "" : profile.city || "",
        state: profile.state === "Not Provided" ? "" : profile.state || "",
        pincode: profile.pincode === "000000" ? "" : profile.pincode || "",
        address: rawAddress,
        weight: rawWeight !== null ? String(rawWeight) : "",
        bloodGroup: profile.bloodGroup,
        latitude:
          typeof profile.latitude === "number" ? String(profile.latitude) : "",
        longitude:
          typeof profile.longitude === "number" ? String(profile.longitude) : "",
      });
    }
    setValidationErrors({});
    setError(null);
    setGeoStatus(null);
    setIsEditing(false);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile || isSaving) return;

    if (!validateForm()) return;

    setIsSaving(true);
    setError(null);
    setSavedSuccess(false);

    const updatePayload: Record<string, unknown> = {
      city: formData.city.trim() || undefined,
      state: formData.state.trim() || undefined,
      pincode: formData.pincode.trim() || undefined,
      address: formData.address.trim() || undefined,
    };

    if (formData.weight.trim()) {
      const parsedWeight = parseFloat(formData.weight);
      if (!isNaN(parsedWeight) && parsedWeight > 0) {
        updatePayload.weight = parsedWeight;
      }
    }

    if (formData.latitude.trim() !== "" && formData.longitude.trim() !== "") {
      const lat = parseFloat(formData.latitude);
      const lng = parseFloat(formData.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        updatePayload.latitude = lat;
        updatePayload.longitude = lng;
      }
    }

    if (formData.bloodGroup && formData.bloodGroup !== profile.bloodGroup) {
      updatePayload.bloodgroup = mapDisplayToBloodGroup(formData.bloodGroup);
    }

    try {
      const res = await api.donor.updateProfile(updatePayload as any);
      if (res.success && res.donor) {
        hydrateFromDonor(res.donor, res.eligibility, (res as any).stats);
        setIsEditing(false);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 5000);

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("swastya-auth-change"));
        }
      } else {
        setError(res.message || "Failed to update profile.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const hasValidCoords =
    typeof profile?.latitude === "number" &&
    typeof profile?.longitude === "number" &&
    !isNaN(profile.latitude) &&
    !isNaN(profile.longitude);

  const initials = profile?.name ? profile.name.slice(0, 2).toUpperCase() : "DN";

  return (
    <div className="space-y-3.5 max-w-6xl mx-auto pb-4">
      {/* Top Breadcrumb & Save Feedback */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {savedSuccess && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile updated successfully</span>
          </span>
        )}
      </div>

      {/* 1. Compact Full-Width Profile Header */}
      <header className="bg-white rounded-2xl border border-[#F3E9D1] px-5 py-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-[#053845] text-white font-serif font-bold text-lg flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] truncate">
                  {profile?.name || "Donor Profile"}
                </h1>
                {profile && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Verified Donor</span>
                  </span>
                )}
              </div>
              {profile && (
                <p className="text-xs text-slate-500 font-mono">
                  Swastya Donor ID: {profile.donorId}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-center">
            {profile && (
              <div className="px-3 py-1.5 rounded-xl bg-[#B94F30] text-white flex items-center gap-1.5 text-xs font-semibold shadow-2xs">
                <Droplet className="w-3.5 h-3.5 fill-current" />
                <span>Blood Group {profile.bloodGroup}</span>
              </div>
            )}

            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={isLoading || !profile}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer disabled:opacity-50"
              >
                <Edit2 className="w-3.5 h-3.5 text-[#317786]" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#053845] transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#A2363A] shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchProfile(true)}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-[#A2363A] hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-pulse">
          <div className="lg:col-span-6 h-72 rounded-2xl bg-white border border-[#F3E9D1]" />
          <div className="lg:col-span-6 h-72 rounded-2xl bg-white border border-[#F3E9D1]" />
        </div>
      )}

      {/* 2. Balanced Two-Column Card Layout */}
      {!isLoading && profile && (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Left Column: Personal & Contact Details */}
          <section className="lg:col-span-6 bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-3.5">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#F3E9D1]/70">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#317786]" />
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Personal &amp; Contact Details
                  </h2>
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isDetectingLocation}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#317786] bg-[#317786]/10 hover:bg-[#317786]/20 transition-colors cursor-pointer"
                  >
                    <Compass
                      className={`w-3.5 h-3.5 ${isDetectingLocation ? "animate-spin" : ""}`}
                    />
                    <span>{isDetectingLocation ? "Detecting..." : "Detect GPS"}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Full Legal Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845]">Full Legal Name</label>
                  <p className="text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                    {profile.name}
                  </p>
                </div>

                {/* Email Address (Read-Only) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                      <Mail className="w-3 h-3 text-[#317786]" />
                      <span>Email Address</span>
                    </label>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Read-Only</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200/80">
                    <span className="text-xs text-slate-700 font-medium truncate">
                      {profile.email || "Not provided"}
                    </span>
                  </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                    <Phone className="w-3 h-3 text-[#317786]" />
                    <span>Phone Number</span>
                  </label>
                  <p className="text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl font-mono">
                    {profile.phone || (
                      <span className="text-slate-400 font-sans font-normal text-xs">
                        Not provided
                      </span>
                    )}
                  </p>
                </div>

                {/* Weight */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                    <Scale className="w-3 h-3 text-[#317786]" />
                    <span>Weight (kg)</span>
                  </label>
                  {isEditing ? (
                    <div>
                      <input
                        type="number"
                        step="0.5"
                        min="30"
                        max="250"
                        value={formData.weight}
                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                        placeholder="e.g. 68"
                        className={`w-full h-9 px-3 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                          validationErrors.weight
                            ? "border-[#A2363A] bg-rose-50/30"
                            : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                        }`}
                      />
                      {validationErrors.weight && (
                        <p className="text-[11px] text-[#A2363A] mt-0.5">
                          {validationErrors.weight}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl">
                      {rawWeight !== null ? (
                        `${rawWeight} kg`
                      ) : (
                        <span className="text-slate-400 font-normal text-xs">Not recorded</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Street / Area Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                  <Building className="w-3 h-3 text-[#317786]" />
                  <span>Street / Residential Address</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    maxLength={255}
                    placeholder="Area, street or locality"
                    className="w-full h-9 px-3 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white transition-colors focus:outline-none"
                  />
                ) : (
                  <p className="text-xs sm:text-sm text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                    {rawAddress || <span className="text-slate-400">Not provided</span>}
                  </p>
                )}
              </div>

              {/* City, State, PIN Code in One Compact Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#B94F30]" />
                    <span>City</span>
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      maxLength={100}
                      className="w-full h-9 px-3 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white focus:outline-none"
                    />
                  ) : (
                    <p className="text-xs sm:text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                      {profile.city && profile.city !== "Not Provided" ? (
                        profile.city
                      ) : (
                        <span className="text-slate-400 font-normal">Not provided</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845]">State</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={100}
                      className="w-full h-9 px-3 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white focus:outline-none"
                    />
                  ) : (
                    <p className="text-xs sm:text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                      {profile.state && profile.state !== "Not Provided" ? (
                        profile.state
                      ) : (
                        <span className="text-slate-400 font-normal">Not provided</span>
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845]">PIN Code</label>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        value={formData.pincode}
                        onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                        maxLength={6}
                        className={`w-full h-9 px-3 rounded-xl text-xs sm:text-sm border focus:outline-none ${
                          validationErrors.pincode
                            ? "border-[#A2363A] bg-rose-50/30"
                            : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                        }`}
                      />
                      {validationErrors.pincode && (
                        <p className="text-[11px] text-[#A2363A] mt-0.5">
                          {validationErrors.pincode}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs sm:text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl font-mono">
                      {profile.pincode && profile.pincode !== "000000" ? (
                        profile.pincode
                      ) : (
                        <span className="text-slate-400 font-sans font-normal">Not provided</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Matching Coordinates */}
              <div className="pt-2.5 border-t border-[#F3E9D1]/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#053845] inline-flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Location-Aware Matching Coordinates</span>
                  </span>
                  {geoStatus && (
                    <span className="text-[11px] text-[#317786] font-medium">{geoStatus}</span>
                  )}
                </div>

                {isEditing ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-slate-400 block mb-0.5">
                        Latitude
                      </label>
                      <input
                        type="text"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        placeholder="e.g. 17.3850"
                        className={`w-full h-8 px-2.5 rounded-lg text-xs font-mono border focus:outline-none ${
                          validationErrors.latitude
                            ? "border-[#A2363A]"
                            : "border-[#F3E9D1] focus:border-[#317786]"
                        }`}
                      />
                      {validationErrors.latitude && (
                        <p className="text-[10px] text-[#A2363A] mt-0.5">
                          {validationErrors.latitude}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-slate-400 block mb-0.5">
                        Longitude
                      </label>
                      <input
                        type="text"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        placeholder="e.g. 78.4867"
                        className={`w-full h-8 px-2.5 rounded-lg text-xs font-mono border focus:outline-none ${
                          validationErrors.longitude
                            ? "border-[#A2363A]"
                            : "border-[#F3E9D1] focus:border-[#317786]"
                        }`}
                      />
                      {validationErrors.longitude && (
                        <p className="text-[10px] text-[#A2363A] mt-0.5">
                          {validationErrors.longitude}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] text-xs">
                    {hasValidCoords ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#053845] inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>GPS Enabled for Radius Matching</span>
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          ~{Number(profile.latitude).toFixed(4)}&deg;, ~
                          {Number(profile.longitude).toFixed(4)}&deg;
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-amber-800 inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>City Fallback Matching</span>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Uses {profile.city || "your city"} for matching
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-400 pt-2 border-t border-[#F3E9D1]/60">
              Coordinates stay confidential and are used only on the server to compute matching distance.
            </p>
          </section>

          {/* Right Column: Donor Coordination Profile */}
          <section className="lg:col-span-6 bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#F3E9D1]/70">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-[#B94F30]" />
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Donor Coordination Profile
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-400">{profile.donorId}</span>
              </div>

              <dl className="divide-y divide-[#F3E9D1]/70 text-xs">
                {/* ABO / Rh Blood Group */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <Droplet className="w-3.5 h-3.5 text-[#B94F30]" />
                    <span>ABO / Rh Blood Group</span>
                  </dt>
                  <dd>
                    {isEditing ? (
                      <select
                        value={formData.bloodGroup}
                        onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                        className="h-8 px-2.5 rounded-lg border border-[#F3E9D1] bg-white text-xs font-bold text-[#053845] focus:outline-none focus:border-[#317786]"
                      >
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>
                            {bg}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-serif text-sm font-bold text-[#B94F30]">
                        {profile.bloodGroup}
                      </span>
                    )}
                  </dd>
                </div>

                {/* Current Availability Status */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Current Availability Status</span>
                  </dt>
                  <dd>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        profile.availability === "Available"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          profile.availability === "Available" ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      <span>{profile.availability}</span>
                    </span>
                  </dd>
                </div>

                {/* Clinical Eligibility */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Clinical Eligibility</span>
                  </dt>
                  <dd>
                    <span
                      className={`font-semibold ${
                        profile.eligibility === "Eligible"
                          ? "text-emerald-700"
                          : profile.eligibility === "Cooldown"
                          ? "text-amber-700"
                          : "text-[#A2363A]"
                      }`}
                    >
                      {profile.eligibility}
                    </span>
                  </dd>
                </div>

                {/* Last Donation Date */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Last Donation Date</span>
                  </dt>
                  <dd className="font-semibold text-[#053845]">{profile.lastDonationDate}</dd>
                </div>

                {/* Total Lifetime Verified Donations */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Total Lifetime Verified Donations</span>
                  </dt>
                  <dd className="font-semibold text-[#053845]">
                    {profile.totalDonations}{" "}
                    {profile.totalDonations === 1 ? "Verified Donation" : "Verified Donations"}
                  </dd>
                </div>

                {/* Coverage Radius */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <dt className="text-slate-600 font-medium inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Coordination Area</span>
                  </dt>
                  <dd className="font-semibold text-[#053845] text-right truncate max-w-[200px]">
                    {profile.location && profile.location !== "Not Provided"
                      ? profile.location
                      : "Not specified"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Compact Footer Actions */}
            <div className="pt-3 border-t border-[#F3E9D1]/70 flex flex-wrap items-center justify-between gap-2 text-xs">
              <Link
                href="/donor/settings"
                className="inline-flex items-center gap-1 font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>Availability Settings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/donor/history"
                className="inline-flex items-center gap-1 font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>View Donation History</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
