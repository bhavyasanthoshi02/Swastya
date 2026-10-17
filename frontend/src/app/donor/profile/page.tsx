"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  Check,
  Edit2,
  Save,
  Droplet,
  Heart,
  Loader2,
  AlertCircle,
  RefreshCw,
  Navigation,
} from "lucide-react";
import { DonorProfile } from "@/components/donor/DonorTypes";
import { api } from "@/lib/api";
import {
  mapBackendDonorToProfile,
  mapBloodGroupToDisplay,
  mapDisplayToBloodGroup,
} from "@/lib/mappers";

export default function DonorProfilePage() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  // Editable Form state
  const [formData, setFormData] = useState({
    city: "",
    state: "",
    pincode: "",
    address: "",
    weight: "",
    bloodGroup: "O+",
    latitude: "",
    longitude: "",
  });

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getProfile();

      if (res.success && res.donor) {
        const user = (res.donor as any).users;
        const mapped = mapBackendDonorToProfile(res.donor, user, undefined, res.eligibility);
        setProfile(mapped);

        setFormData({
          city: res.donor.city || "",
          state: res.donor.state || "",
          pincode: res.donor.pincode || "",
          address: res.donor.address || "",
          weight: res.donor.weight ? String(res.donor.weight) : "65",
          bloodGroup: mapBloodGroupToDisplay(res.donor.bloodgroup),
          latitude:
            res.donor.latitude !== undefined && res.donor.latitude !== null
              ? String(res.donor.latitude)
              : "",
          longitude:
            res.donor.longitude !== undefined && res.donor.longitude !== null
              ? String(res.donor.longitude)
              : "",
        });
      } else {
        setError("Failed to load donor profile data.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDetectLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeoStatus("Geolocation is not supported by your browser. Please enter coordinates manually.");
      return;
    }
    setGeoStatus("Requesting browser GPS position...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setFormData((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
        }));
        setGeoStatus("GPS coordinates detected successfully!");
        setTimeout(() => setGeoStatus(null), 3500);
      },
      (_geoErr) => {
        setGeoStatus("Location access denied or unavailable. You can enter coordinates manually.");
        setTimeout(() => setGeoStatus(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    setError(null);

    const updatePayload: any = {
      city: formData.city.trim(),
      state: formData.state.trim(),
      pincode: formData.pincode.trim(),
      address: formData.address.trim() || undefined,
    };

    if (formData.weight) {
      const parsedWeight = parseFloat(formData.weight);
      if (!isNaN(parsedWeight) && parsedWeight > 0) {
        updatePayload.weight = parsedWeight;
      }
    }

    if (formData.latitude !== "" && formData.longitude !== "") {
      const lat = parseFloat(formData.latitude);
      const lng = parseFloat(formData.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          setError("Latitude must be between -90 and 90, Longitude between -180 and 180.");
          setIsSaving(false);
          return;
        }
        updatePayload.latitude = lat;
        updatePayload.longitude = lng;
      }
    }

    if (formData.bloodGroup && formData.bloodGroup !== profile.bloodGroup) {
      updatePayload.bloodgroup = mapDisplayToBloodGroup(formData.bloodGroup);
    }

    try {
      const res = await api.donor.updateProfile(updatePayload);
      if (res.success && res.donor) {
        const user = (res.donor as any).users;
        const mapped = mapBackendDonorToProfile(res.donor, user, undefined, res.eligibility);
        setProfile(mapped);
        setIsEditing(false);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("swastya-auth-change"));
        }
      } else {
        setError(res.message || "Failed to update profile.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save profile changes.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading clinical donor profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 max-w-lg mx-auto bg-white rounded-3xl border border-[#F3E9D1] text-center space-y-4 my-12">
        <AlertCircle className="w-8 h-8 text-[#A2363A] mx-auto" />
        <h2 className="font-serif text-lg font-bold text-[#053845]">Profile Not Found</h2>
        <p className="text-xs text-slate-600">{error || "Could not retrieve donor profile."}</p>
        <button
          type="button"
          onClick={fetchProfile}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Breadcrumb Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {savedSuccess && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Profile saved to database successfully!</span>
          </span>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-[#fdf2f2] border border-[#A2363A]/30 text-[#A2363A] text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-8 shadow-xs space-y-6 sm:space-y-8">
        {/* Header Profile Identity Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#053845] text-white font-serif font-bold text-2xl sm:text-3xl flex items-center justify-center shadow-sm">
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
                  {profile.name}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>Verified Donor</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Swastya Donor ID: {profile.donorId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="px-4 py-2 rounded-2xl bg-[#A2363A] text-white flex items-center gap-2 shadow-xs">
              <Droplet className="w-4 h-4 fill-current" />
              <span className="font-bold text-sm">Blood Group {profile.bloodGroup}</span>
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                if (isEditing) {
                  handleSave();
                } else {
                  setIsEditing(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] shadow-2xs transition-all cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-[#317786] animate-spin" />
                  <span>Saving...</span>
                </>
              ) : isEditing ? (
                <>
                  <Save className="w-3.5 h-3.5 text-[#317786]" />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <Edit2 className="w-3.5 h-3.5 text-[#317786]" />
                  <span>Edit Profile</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2 Column Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {/* Column 1: Contact & Geographic Location Details */}
          <div className="space-y-4">
            <h2 className="font-serif text-lg font-bold text-[#053845] flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#317786]" />
              <span>Contact &amp; Location Details</span>
            </h2>

            <div className="p-5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-4 text-xs">
              <div>
                <label className="text-slate-500 font-medium block mb-1">Full Legal Name</label>
                <span className="font-bold text-[#053845] text-sm">{profile.name}</span>
              </div>

              <div>
                <label className="text-slate-500 font-medium block mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>Phone Number</span>
                </label>
                <span className="font-mono font-semibold text-[#053845]">{profile.phone}</span>
              </div>

              <div>
                <label className="text-slate-500 font-medium block mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-slate-400" />
                  <span>Email Address</span>
                </label>
                <span className="font-mono font-semibold text-[#053845]">{profile.email}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#F3E9D1]/60">
                <div>
                  <label className="text-slate-500 font-medium block mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#B94F30]" />
                    <span>City</span>
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] focus:outline-none focus:border-[#317786]"
                    />
                  ) : (
                    <span className="font-semibold text-[#053845]">{profile.city}</span>
                  )}
                </div>

                <div>
                  <label className="text-slate-500 font-medium block mb-1">State</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] focus:outline-none focus:border-[#317786]"
                    />
                  ) : (
                    <span className="font-semibold text-[#053845]">{profile.state || "Karnataka"}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 font-medium block mb-1">Area PIN Code</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.pincode}
                      onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] focus:outline-none focus:border-[#317786]"
                    />
                  ) : (
                    <span className="font-semibold text-[#053845]">{profile.pincode || "560001"}</span>
                  )}
                </div>

                <div>
                  <label className="text-slate-500 font-medium block mb-1">Weight (kg)</label>
                  {isEditing ? (
                    <input
                      type="number"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] focus:outline-none focus:border-[#317786]"
                    />
                  ) : (
                    <span className="font-semibold text-[#053845]">{formData.weight} kg</span>
                  )}
                </div>
              </div>

              {/* Geographic Coordinates for Matching */}
              <div className="pt-3 border-t border-[#F3E9D1]/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-600 font-bold flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Location-Aware Matching Coordinates</span>
                  </label>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleDetectLocation}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#317786]/10 text-[#317786] hover:bg-[#317786]/20 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Use Current Location</span>
                    </button>
                  )}
                </div>

                {geoStatus && (
                  <p className="text-[11px] text-[#317786] font-medium animate-in fade-in">
                    {geoStatus}
                  </p>
                )}

                {isEditing ? (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Latitude (-90 to 90)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 12.9716"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-[#F3E9D1] bg-white text-xs font-mono text-[#053845] focus:outline-none focus:border-[#317786]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                        Longitude (-180 to 180)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 77.5946"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-[#F3E9D1] bg-white text-xs font-mono text-[#053845] focus:outline-none focus:border-[#317786]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white border border-[#F3E9D1] flex items-center justify-between">
                    <div>
                      {profile.latitude !== undefined && profile.longitude !== undefined ? (
                        <div className="space-y-0.5">
                          <span className="font-semibold text-[#053845] text-xs flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>GPS Enabled for Radius Matching</span>
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono block">
                            Confidential coordinates saved securely (~{Number(profile.latitude).toFixed(4)}°, ~{Number(profile.longitude).toFixed(4)}°)
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="font-semibold text-amber-700 text-xs flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>City Fallback Matching Only</span>
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            Exact coordinates not set. Matches will use {profile.city || "your city"}.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-slate-400 leading-tight">
                  Privacy notice: Your exact coordinates are confidential, never exposed publicly, and strictly used on the server to compute proximity distance to emergency requisitions.
                </p>
              </div>
            </div>
          </div>

          {/* Column 2: Clinical Coordination & Readiness Status */}
          <div className="space-y-4">
            <h2 className="font-serif text-lg font-bold text-[#053845] flex items-center gap-2">
              <Heart className="w-4 h-4 text-[#A2363A]" />
              <span>Transfusion &amp; Coordination Profile</span>
            </h2>

            <div className="p-5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
                <span className="text-slate-500 font-medium">ABO / Rh Phenotype</span>
                <span className="font-bold text-[#A2363A] text-sm">
                  {profile.bloodGroup}
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
                <span className="text-slate-500 font-medium">Current Availability Status</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {profile.availability}
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
                <span className="text-slate-500 font-medium">Clinical Eligibility</span>
                <span className="font-bold text-emerald-700">
                  {profile.eligibility}
                </span>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
                <span className="text-slate-500 font-medium">Last Donation Date</span>
                <span className="font-bold text-[#053845]">
                  {profile.lastDonationDate}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Total Lifetime Donations</span>
                <span className="font-bold text-[#053845]">
                  {profile.totalDonations} Completed Donations
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
