"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Lock,
  Edit2,
  Save,
  X,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Compass,
  Droplets,
  Calendar,
  Building,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  AuthRequester,
  AuthUser,
  setStoredUser,
} from "@/lib/auth";

export default function RequesterProfilePage() {
  const [profile, setProfile] = useState<{
    user: AuthUser;
    requester: AuthRequester;
  } | null>(null);

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    name: "",
    phonenumber: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
  });

  const fetchProfile = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setIsLoading(true);
      setError(null);

      const res = await api.requester.getProfile();
      if (res.success && res.requester) {
        const user = res.requester.users || {
          userid: res.requester.userid,
          name: "Requester",
          email: "Not provided",
          phonenumber: null,
          role: "REQUESTER" as const,
        };

        const requesterData: AuthRequester = {
          requesterid: res.requester.requesterid,
          userid: res.requester.userid,
          address: res.requester.address || "",
          city: res.requester.city || "",
          state: res.requester.state || "",
          pincode: res.requester.pincode || "",
          latitude: res.requester.latitude ? Number(res.requester.latitude) : null,
          longitude: res.requester.longitude ? Number(res.requester.longitude) : null,
          createdat: res.requester.createdat,
          updatedat: res.requester.updatedat,
        };

        setProfile({
          user,
          requester: requesterData,
        });

        setFormData({
          name: user.name || "",
          phonenumber: user.phonenumber || "",
          address: requesterData.address === "Not Provided" ? "" : requesterData.address,
          city: requesterData.city === "Not Provided" ? "" : requesterData.city,
          state: requesterData.state === "Not Provided" ? "" : requesterData.state,
          pincode: requesterData.pincode === "000000" ? "" : requesterData.pincode,
          latitude: requesterData.latitude ? String(requesterData.latitude) : "",
          longitude: requesterData.longitude ? String(requesterData.longitude) : "",
        });
      } else {
        setError("Failed to load requester profile from the network.");
      }
    } catch (err: unknown) {
      console.error("Error loading requester profile:", err);
      setError(
        err instanceof Error ? err.message : "Failed to connect to Swastya clinical server."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile(true);
  }, [fetchProfile]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errors.name = "Full name must be at least 2 characters.";
    }

    if (formData.phonenumber.trim()) {
      const phoneClean = formData.phonenumber.replace(/[\s\-()]/g, "");
      if (!/^\+?[0-9]{10,15}$/.test(phoneClean)) {
        errors.phonenumber = "Please enter a valid 10-digit mobile number.";
      }
    }

    if (formData.pincode.trim()) {
      if (!/^\d{6}$/.test(formData.pincode.trim())) {
        errors.pincode = "Postal PIN code must be a 6-digit number.";
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
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setIsDetectingLocation(false);
      },
      (err) => {
        console.warn("Geolocation detection notice:", err.message);
        setIsDetectingLocation(false);
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleCancel = () => {
    if (!profile) return;
    setFormData({
      name: profile.user.name || "",
      phonenumber: profile.user.phonenumber || "",
      address: profile.requester.address === "Not Provided" ? "" : profile.requester.address,
      city: profile.requester.city === "Not Provided" ? "" : profile.requester.city,
      state: profile.requester.state === "Not Provided" ? "" : profile.requester.state,
      pincode: profile.requester.pincode === "000000" ? "" : profile.requester.pincode,
      latitude: profile.requester.latitude ? String(profile.requester.latitude) : "",
      longitude: profile.requester.longitude ? String(profile.requester.longitude) : "",
    });
    setValidationErrors({});
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || isSaving) return;

    if (!validateForm()) {
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSavedSuccess(false);

      const payload = {
        name: formData.name.trim(),
        phonenumber: formData.phonenumber.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        pincode: formData.pincode.trim() || undefined,
        latitude: formData.latitude.trim() ? parseFloat(formData.latitude) : undefined,
        longitude: formData.longitude.trim() ? parseFloat(formData.longitude) : undefined,
      };

      const res = await api.requester.updateProfile(payload);

      if (res.success && res.requester) {
        const updatedUser = res.requester.users || {
          ...profile.user,
          name: payload.name,
          phonenumber: payload.phonenumber || null,
        };

        const updatedRequester: AuthRequester = {
          requesterid: res.requester.requesterid,
          userid: res.requester.userid,
          address: res.requester.address || "",
          city: res.requester.city || "",
          state: res.requester.state || "",
          pincode: res.requester.pincode || "",
          latitude: res.requester.latitude ? Number(res.requester.latitude) : null,
          longitude: res.requester.longitude ? Number(res.requester.longitude) : null,
          createdat: res.requester.createdat,
          updatedat: res.requester.updatedat,
        };

        setProfile({
          user: updatedUser,
          requester: updatedRequester,
        });

        setStoredUser(updatedUser, null, updatedRequester);
        window.dispatchEvent(new Event("swastya-auth-change"));

        setIsEditing(false);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 5000);
      } else {
        setError(res.message || "Failed to update profile.");
      }
    } catch (err: unknown) {
      console.error("Error saving requester profile:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save profile changes. Please verify input fields."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Registered Member";
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
    } catch {
      return "Registered Member";
    }
  };

  const requesterCode = profile?.requester?.requesterid
    ? `REQ-${profile.requester.requesterid.slice(0, 8).toUpperCase()}`
    : "REQ-CARE";

  return (
    <div className="space-y-3.5 max-w-6xl mx-auto pb-4">
      {/* Top Breadcrumb & Save Feedback */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Requester Dashboard</span>
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
              {profile?.user?.name ? profile.user.name.slice(0, 2).toUpperCase() : "RQ"}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] truncate">
                  {profile?.user?.name || "Care Requester"}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Verified Care Requester</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Swastya Requester ID: {requesterCode}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-center">
            <div className="px-3 py-1.5 rounded-xl bg-[#B94F30] text-white flex items-center gap-1.5 text-xs font-semibold shadow-2xs">
              <Droplets className="w-3.5 h-3.5 fill-current" />
              <span>Requester Desk</span>
            </div>

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
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#9E3E22] transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
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
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchProfile(true)}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-pulse">
          <div className="lg:col-span-6 h-64 rounded-2xl bg-white border border-[#F3E9D1]" />
          <div className="lg:col-span-6 h-64 rounded-2xl bg-white border border-[#F3E9D1]" />
        </div>
      )}

      {/* Main Two-Column Desktop Layout */}
      {!isLoading && profile && (
        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Left Column: Account & Personal Identity */}
          <section className="lg:col-span-6 bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-3.5">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#F3E9D1]/70">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#317786]" />
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Account &amp; Personal Identity
                  </h2>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Calendar className="w-3 h-3" />
                  <span>Joined {formatDate(profile.user.createdat)}</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Full Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                    <span>Full Name</span>
                    {isEditing && <span className="text-[#A2363A]">*</span>}
                  </label>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        maxLength={100}
                        className={`w-full h-9 px-3 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                          validationErrors.name
                            ? "border-[#A2363A] bg-rose-50/30"
                            : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                        }`}
                        placeholder="e.g. Dr. Rajesh Sharma"
                      />
                      {validationErrors.name && (
                        <p className="text-[11px] text-[#A2363A] mt-0.5">
                          {validationErrors.name}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                      {profile.user.name}
                    </p>
                  )}
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
                      {profile.user.email}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded shrink-0">
                      Verified
                    </span>
                  </div>
                </div>

                {/* Contact Phone Number */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                    <Phone className="w-3 h-3 text-[#317786]" />
                    <span>Contact Number</span>
                  </label>
                  {isEditing ? (
                    <div>
                      <input
                        type="tel"
                        value={formData.phonenumber}
                        onChange={(e) =>
                          setFormData({ ...formData, phonenumber: e.target.value })
                        }
                        maxLength={15}
                        className={`w-full h-9 px-3 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                          validationErrors.phonenumber
                            ? "border-[#A2363A] bg-rose-50/30"
                            : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                        }`}
                        placeholder="e.g. 9876543210"
                      />
                      {validationErrors.phonenumber && (
                        <p className="text-[11px] text-[#A2363A] mt-0.5">
                          {validationErrors.phonenumber}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl">
                      {profile.user.phonenumber || (
                        <span className="text-slate-400 font-normal text-xs">Not provided</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Authorized Role */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#317786]" />
                    <span>Authorized Role</span>
                  </label>
                  <div className="flex items-center justify-between gap-2 py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#317786]/10 text-[#317786]">
                      {profile.user.role}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {requesterCode}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 pt-2 border-t border-[#F3E9D1]/60">
              Email changes require hospital administration verification.
            </p>
          </section>

          {/* Right Column: Regional Coordination + Compact Emergency CTA */}
          <div className="lg:col-span-6 flex flex-col gap-3.5">
            {/* Regional Coordination & Address */}
            <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3 flex-1">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#F3E9D1]/70">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#B94F30]" />
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Regional Coordination &amp; Address
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

              {/* Street / Facility Address */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#053845] flex items-center gap-1">
                  <Building className="w-3 h-3 text-[#317786]" />
                  <span>Street / Facility Address</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    maxLength={255}
                    className="w-full h-9 px-3 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white transition-colors focus:outline-none"
                    placeholder="e.g. Ward 4B, Metro Hospital, 12 Park Avenue"
                  />
                ) : (
                  <p className="text-xs sm:text-sm text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                    {profile.requester.address || (
                      <span className="text-slate-400">Not specified</span>
                    )}
                  </p>
                )}
              </div>

              {/* City, State, PIN Code in One Compact Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#053845]">City</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      maxLength={100}
                      className="w-full h-9 px-3 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white focus:outline-none"
                      placeholder="Hyderabad"
                    />
                  ) : (
                    <p className="text-xs sm:text-sm font-medium text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                      {profile.requester.city || (
                        <span className="text-slate-400 font-normal">Not set</span>
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
                      placeholder="Telangana"
                    />
                  ) : (
                    <p className="text-xs sm:text-sm font-medium text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                      {profile.requester.state || (
                        <span className="text-slate-400 font-normal">Not set</span>
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
                        placeholder="500001"
                      />
                      {validationErrors.pincode && (
                        <p className="text-[11px] text-[#A2363A] mt-0.5">
                          {validationErrors.pincode}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs sm:text-sm font-medium text-[#053845] py-1.5 px-3 bg-[#FAF6EE]/60 rounded-xl truncate">
                      {profile.requester.pincode || (
                        <span className="text-slate-400 font-normal">Not set</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Secondary Coordinates Row */}
              {isEditing ? (
                <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-[#F3E9D1]/70">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500">Latitude</label>
                    <input
                      type="text"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                      className={`w-full h-8 px-2.5 rounded-lg text-xs border focus:outline-none ${
                        validationErrors.latitude
                          ? "border-[#A2363A]"
                          : "border-[#F3E9D1] focus:border-[#317786]"
                      }`}
                      placeholder="17.385044"
                    />
                    {validationErrors.latitude && (
                      <p className="text-[10px] text-[#A2363A]">{validationErrors.latitude}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-500">Longitude</label>
                    <input
                      type="text"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                      className={`w-full h-8 px-2.5 rounded-lg text-xs border focus:outline-none ${
                        validationErrors.longitude
                          ? "border-[#A2363A]"
                          : "border-[#F3E9D1] focus:border-[#317786]"
                      }`}
                      placeholder="78.486671"
                    />
                    {validationErrors.longitude && (
                      <p className="text-[10px] text-[#A2363A]">{validationErrors.longitude}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-[#F3E9D1]/70 text-xs text-slate-500">
                  <span>
                    Latitude:{" "}
                    <span className="font-mono text-slate-700">
                      {profile.requester.latitude !== null &&
                      profile.requester.latitude !== undefined
                        ? String(profile.requester.latitude)
                        : "Not specified"}
                    </span>
                  </span>
                  <span>&middot;</span>
                  <span>
                    Longitude:{" "}
                    <span className="font-mono text-slate-700">
                      {profile.requester.longitude !== null &&
                      profile.requester.longitude !== undefined
                        ? String(profile.requester.longitude)
                        : "Not specified"}
                    </span>
                  </span>
                </div>
              )}
            </section>

            {/* 4. Compact Horizontal Emergency Action Section */}
            <section className="bg-white rounded-2xl border border-[#F3E9D1] px-4 py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#B94F30]/10 text-[#B94F30] flex items-center justify-center shrink-0">
                  <Droplets className="w-4 h-4 fill-current" />
                </div>
                <h3 className="font-serif text-sm font-bold text-[#053845] truncate">
                  Need Blood for an Emergency?
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/requester/requests"
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] hover:bg-[#F3E9D1] transition-colors"
                >
                  My Requisitions
                </Link>
                <Link
                  href="/requester/requests/new"
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#9E3E22] transition-colors shadow-2xs"
                >
                  Raise Request
                </Link>
              </div>
            </section>
          </div>
        </form>
      )}
    </div>
  );
}
