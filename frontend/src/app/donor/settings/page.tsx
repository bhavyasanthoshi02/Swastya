"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Compass,
  BellRing,
  Moon,
  MessageSquare,
  Power,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { mapAvailabilityToDisplay, mapDisplayToAvailability } from "@/lib/mappers";

export default function DonorSettingsPage() {
  const [distance, setDistance] = useState(15);
  const [sms, setSms] = useState(true);
  const [whatsapp, setWhatsapp] = useState(true);
  const [quiet, setQuiet] = useState(false);
  const [availability, setAvailability] = useState<"Available" | "Paused">("Available");
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getProfile();
      if (res.success && res.donor) {
        setAvailability(mapAvailabilityToDisplay(res.donor.availabilitystatus));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load current donor availability.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentSettings();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      const backendStatus = mapDisplayToAvailability(availability);
      const res = await api.donor.updateAvailability(backendStatus);

      if (res.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2600);

        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("swastya-auth-change"));
        }
      } else {
        setError(res.message || "Failed to persist availability to database.");
      }
    } catch (err: any) {
      setError(err?.message || "Network error updating availability.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {saved && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Availability saved to database!</span>
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
        <div className="pb-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
              Availability &amp; Match Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
              Configure your emergency donor readiness status and review preview notification settings.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 p-2.5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1]">
            <ShieldCheck className="w-4 h-4 text-[#317786]" />
            <span className="text-xs font-semibold text-[#053845]">
              Live PostgreSQL Database Sync
            </span>
          </div>
        </div>

        <div className="space-y-6 max-w-2xl">
          {/* Availability Active Switch - PERSISTED TO POSTGRESQL */}
          <div className="p-5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#053845] flex items-center gap-2">
                  <Power className="w-4 h-4 text-[#317786]" />
                  <span>Emergency Availability Mode</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Persisted
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                When active, your profile is considered by nearby certified hospitals for urgent whole blood matching.
              </p>
            </div>

            <button
              type="button"
              disabled={isLoading || isSaving}
              onClick={() =>
                setAvailability(availability === "Available" ? "Paused" : "Available")
              }
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 ${
                availability === "Available"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-slate-300 hover:bg-slate-400 text-slate-800"
              }`}
            >
              {availability === "Available" ? "Active (Available)" : "Paused (Standby)"}
            </button>
          </div>

          {/* Database Schema Notice */}
          <div className="p-3 rounded-2xl bg-[#e8f3f5] border border-[#317786]/20 text-[11px] text-[#053845] flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#317786] shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong className="font-semibold">Schema Notice:</strong> Availability status is stored in PostgreSQL (<code className="font-mono text-[10px]">donors.availabilitystatus</code>). Geographic radius and SMS notification settings below are UI client previews and are not yet stored in the current database schema.
            </p>
          </div>

          {/* Distance Slider (Client preview) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#F3E9D1] space-y-3 opacity-90">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#053845] flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#317786]" />
                  <span>Maximum Travel Perimeter</span>
                </span>
                <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Client Preview
                </span>
              </div>
              <span className="font-bold font-mono px-3 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] text-sm">
                {distance} km
              </span>
            </div>

            <input
              type="range"
              min="3"
              max="30"
              step="1"
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
              className="w-full accent-[#317786] h-2 bg-slate-200 rounded-lg cursor-pointer"
            />

            <div className="flex justify-between text-[11px] text-slate-400">
              <span>3 km (Walking / Immediate Zone)</span>
              <span>15 km (City Center)</span>
              <span>30 km (District Perimeter)</span>
            </div>
          </div>

          {/* Alert Channel Toggles (Client previews) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Notification Channel Previews
              </h2>
              <span className="text-[10px] text-slate-400 font-medium">
                Disabled from DB persistence
              </span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-white/60">
              <div className="flex items-start gap-3">
                <BellRing className="w-4 h-4 text-[#317786] mt-0.5" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#053845] block">
                      Critical Emergency SMS Alerts
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                      Unsupported in Schema
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Direct SMS dispatch upon urgent trauma matches.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={sms}
                onChange={(e) => setSms(e.target.checked)}
                className="h-4 w-4 rounded accent-[#317786] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-white/60">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 text-[#317786] mt-0.5" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#053845] block">
                      WhatsApp Coordination Notifications
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                      Unsupported in Schema
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Hospital desk location links and donation updates.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={whatsapp}
                onChange={(e) => setWhatsapp(e.target.checked)}
                className="h-4 w-4 rounded accent-[#317786] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-white/60">
              <div className="flex items-start gap-3">
                <Moon className="w-4 h-4 text-[#317786] mt-0.5" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#053845] block">
                      Quiet Hours (10:00 PM to 7:00 AM)
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                      Unsupported in Schema
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Mute routine elective alerts during night hours.
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={quiet}
                onChange={(e) => setQuiet(e.target.checked)}
                className="h-4 w-4 rounded accent-[#317786] cursor-pointer"
              />
            </div>
          </div>

          {/* Save Action Button */}
          <div className="pt-4">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className={`px-6 py-3 rounded-2xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-60 ${
                saved
                  ? "bg-emerald-600 text-white"
                  : "bg-[#053845] hover:bg-[#03252e] text-white"
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Availability...</span>
                </>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Availability Saved to Database</span>
                </>
              ) : (
                <span>Save Availability to Database</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
