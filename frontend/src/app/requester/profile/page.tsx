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

  // Form State
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
    } catch (err: any) {
      console.error("Error loading requester profile:", err);
      setError(err?.message || "Failed to connect to Swastya clinical server.");
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

        // Update local memory and global auth store
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
    } catch (err: any) {
      console.error("Error saving requester profile:", err);
      setError(err?.message || "Failed to save profile changes. Please verify input fields.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "Registered Member";
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(d);
    } catch {
      return "Registered Member";
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Breadcrumb Navigation (mirrors DonorProfilePage) */}
      <div className="flex items-center justify-between">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Requester Dashboard</span>
        </Link>

        {savedSuccess && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile saved to database successfully!</span>
          </span>
        )}
      </div>

      {/* Page Header Strip (mirrors DonorProfilePage) */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-8 shadow-xs space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#053845] text-white font-serif font-bold text-2xl sm:text-3xl flex items-center justify-center shadow-sm">
              {profile?.user?.name ? profile.user.name.slice(0, 2).toUpperCase() : "RQ"}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                  {profile?.user?.name || "Care Requester"}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Verified Care Requester</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Swastya Requester ID: REQ-{profile?.requester?.requesterid ? profile.requester.requesterid.slice(0, 8).toUpperCase() : "CARE"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="px-4 py-2 rounded-2xl bg-[#B94F30] text-white flex items-center gap-2 shadow-xs">
              <Droplets className="w-4 h-4 fill-current" />
              <span className="font-bold text-sm">Requester Desk</span>
            </div>

            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={isLoading || !profile}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] shadow-2xs transition-all cursor-pointer disabled:opacity-50"
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
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] transition-all cursor-pointer disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#9E3E22] transition-all cursor-pointer shadow-xs disabled:opacity-50"
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
      </div>

      {/* Success Notification */}
      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3 shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <h3 className="text-sm font-bold">Profile Updated</h3>
            <p className="text-xs text-emerald-700 mt-0.5">
              Your requester contact details and regional dispatch address have been saved to the clinical registry.
            </p>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <h3 className="text-sm font-bold">Update Notice</h3>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchProfile(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-44 rounded-3xl bg-white border border-[#F3E9D1] p-6 space-y-4" />
          <div className="h-64 rounded-3xl bg-white border border-[#F3E9D1] p-6 space-y-4" />
        </div>
      )}

      {/* Profile Form */}
      {!isLoading && profile && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Identity & Account Card */}
          <div className="p-6 rounded-3xl bg-white border border-[#F3E9D1] shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845]">
                  <User className="w-4 h-4 text-[#317786]" />
                </div>
                <div>
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Account &amp; Personal Identity
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Official clinical identity used for regional blood bank authorizations
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                <span>Joined {formatDate(profile.user.createdat)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#053845] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Full Name</span>
                  {isEditing && <span className="text-rose-500">*</span>}
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      maxLength={100}
                      className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                        validationErrors.name
                          ? "border-rose-400 focus:border-rose-500 bg-rose-50/30"
                          : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                      }`}
                      placeholder="e.g. Dr. Rajesh Sharma"
                    />
                    {validationErrors.name && (
                      <p className="text-[11px] text-rose-600 mt-1">{validationErrors.name}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#053845] py-2 px-3.5 bg-[#FAF6EE]/50 rounded-xl border border-transparent">
                    {profile.user.name}
                  </p>
                )}
              </div>

              {/* Email Address (Strictly Read-Only) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#053845] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Email Address</span>
                  </label>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    <Lock className="w-2.5 h-2.5" />
                    Read-Only
                  </span>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs sm:text-sm text-slate-700 font-medium truncate">
                    {profile.user.email}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-100/70 px-2 py-0.5 rounded">
                    Verified
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  To modify your clinical email address, please submit a credential change ticket to hospital administration.
                </p>
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#053845] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>Contact Phone Number</span>
                </label>
                {isEditing ? (
                  <div>
                    <input
                      type="tel"
                      value={formData.phonenumber}
                      onChange={(e) => setFormData({ ...formData, phonenumber: e.target.value })}
                      maxLength={15}
                      className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                        validationErrors.phonenumber
                          ? "border-rose-400 focus:border-rose-500 bg-rose-50/30"
                          : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                      }`}
                      placeholder="e.g. 9876543210"
                    />
                    {validationErrors.phonenumber && (
                      <p className="text-[11px] text-rose-600 mt-1">
                        {validationErrors.phonenumber}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#053845] py-2 px-3.5 bg-[#FAF6EE]/50 rounded-xl border border-transparent">
                    {profile.user.phonenumber || (
                      <span className="text-slate-400 font-normal italic">
                        No phone number provided
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Account Role & Reference */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#053845] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Authorized Role</span>
                </label>
                <div className="flex items-center gap-2 py-2 px-3.5 bg-[#FAF6EE]/50 rounded-xl border border-transparent">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-[#317786]/10 text-[#317786]">
                    {profile.user.role}
                  </span>
                  <span className="text-xs text-slate-400">
                    Ref: REQ-{profile.requester.requesterid.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Regional Dispatch & Location Card */}
          <div className="p-6 rounded-3xl bg-white border border-[#F3E9D1] shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845]">
                  <MapPin className="w-4 h-4 text-[#B94F30]" />
                </div>
                <div>
                  <h2 className="font-serif text-base font-bold text-[#053845]">
                    Regional Coordination &amp; Address
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Used to calculate proximity to nearby blood banks and emergency donor routing
                  </p>
                </div>
              </div>

              {isEditing && (
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={isDetectingLocation}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#317786] bg-[#317786]/10 hover:bg-[#317786]/20 transition-colors cursor-pointer"
                  title="Detect GPS coordinates"
                >
                  <Compass className={`w-3.5 h-3.5 ${isDetectingLocation ? "animate-spin" : ""}`} />
                  <span>{isDetectingLocation ? "Detecting..." : "Detect Location"}</span>
                </button>
              )}
            </div>

            <div className="space-y-4">
              {/* Street Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#053845] flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span>Street / Hospital / Facility Address</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    maxLength={255}
                    className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white transition-colors focus:outline-none"
                    placeholder="e.g. Ward 4B, Metro Hospital, 12 Park Avenue"
                  />
                ) : (
                  <p className="text-sm text-slate-800 py-2 px-3.5 bg-[#FAF6EE]/50 rounded-xl border border-transparent">
                    {profile.requester.address || (
                      <span className="text-slate-400 italic">No street address specified</span>
                    )}
                  </p>
                )}
              </div>

              {/* City, State, PIN Code Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* City */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#053845]">City</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      maxLength={100}
                      className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white transition-colors focus:outline-none"
                      placeholder="e.g. Hyderabad"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-[#053845] py-2 px-3.5 bg-[#FAF6EE]/50 rounded-xl border border-transparent">
                      {profile.requester.city || (
                        <span className="text-slate-400 font-normal italic">Not set</span>
                      )}
                    </p>
                  )}
                </div>

                {/* State */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#053845]">State</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={100}
                      className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-[#F3E9D1] focus:border-[#317786] bg-white transition-colors focus:outline-none"
                      placeholder="e.g. Telangana"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-[#053845] py-2 px-3.5 bg-[#FAF6EE]/50 rounded-xl border border-transparent">
                      {profile.requester.state || (
                        <span className="text-slate-400 font-normal italic">Not set</span>
                      )}
                    </p>
                  )}
                </div>

                {/* PIN Code */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#053845]">Postal PIN Code</label>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        value={formData.pincode}
                        onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                        maxLength={6}
                        className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                          validationErrors.pincode
                            ? "border-rose-400 focus:border-rose-500 bg-rose-50/30"
                            : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                        }`}
                        placeholder="e.g. 500001"
                      />
                      {validationErrors.pincode && (
                        <p className="text-[11px] text-rose-600 mt-1">
                          {validationErrors.pincode}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-[#053845] py-2 px-3.5 bg-[#FAF6EE]/50 rounded-xl border border-transparent">
                      {profile.requester.pincode || (
                        <span className="text-slate-400 font-normal italic">Not set</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Coordinates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Latitude</label>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                          validationErrors.latitude
                            ? "border-rose-400 focus:border-rose-500"
                            : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                        }`}
                        placeholder="e.g. 17.385044"
                      />
                      {validationErrors.latitude && (
                        <p className="text-[11px] text-rose-600 mt-1">
                          {validationErrors.latitude}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 font-mono py-2 px-3.5 bg-slate-50 rounded-xl border border-slate-100">
                      {profile.requester.latitude !== null && profile.requester.latitude !== undefined
                        ? String(profile.requester.latitude)
                        : "Not specified"}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500">Longitude</label>
                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        className={`w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm border transition-colors focus:outline-none ${
                          validationErrors.longitude
                            ? "border-rose-400 focus:border-rose-500"
                            : "border-[#F3E9D1] focus:border-[#317786] bg-white"
                        }`}
                        placeholder="e.g. 78.486671"
                      />
                      {validationErrors.longitude && (
                        <p className="text-[11px] text-rose-600 mt-1">
                          {validationErrors.longitude}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 font-mono py-2 px-3.5 bg-slate-50 rounded-xl border border-slate-100">
                      {profile.requester.longitude !== null && profile.requester.longitude !== undefined
                        ? String(profile.requester.longitude)
                        : "Not specified"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Footer Banner */}
          <div className="p-5 rounded-3xl bg-white border border-[#F3E9D1] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#B94F30]/10 flex items-center justify-center text-[#B94F30]">
                <Droplets className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="font-serif text-sm font-bold text-[#053845]">
                  Need Blood for an Emergency?
                </h3>
                <p className="text-xs text-slate-500">
                  Raise an urgent requisition broadcast to certified donors and blood bank reserves.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/requester/requests"
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] transition-all"
              >
                My Requisitions
              </Link>
              <Link
                href="/requester/requests/new"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#9E3E22] transition-all shadow-xs"
              >
                Raise Request
              </Link>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
