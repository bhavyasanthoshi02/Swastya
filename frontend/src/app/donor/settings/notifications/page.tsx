"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tent,
  Clock,
  AlertTriangle,
  MapPin,
  Save,
  Shield,
  Sliders,
} from "lucide-react";
import { api, DonorNotificationPreferences } from "@/lib/api";

export default function DonorNotificationPreferencesPage() {
  const [preferences, setPreferences] = useState<DonorNotificationPreferences | null>(null);
  const [nearbyCamps, setNearbyCamps] = useState(true);
  const [campReminders, setCampReminders] = useState(true);
  const [campUpdates, setCampUpdates] = useState(true);
  const [campCancellations, setCampCancellations] = useState(true);
  const [preferredCity, setPreferredCity] = useState("");
  const [preferredRadiusKm, setPreferredRadiusKm] = useState(25);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.donor.getNotificationPreferences();
      const p = res.data || (res as any).preferences;
      if (res.success && p) {
        setPreferences(p);
        setNearbyCamps(p.nearbycamps ?? true);
        setCampReminders(p.campreminders ?? true);
        setCampUpdates(p.campupdates ?? true);
        setCampCancellations(p.campcancellations ?? true);
        setPreferredCity(p.preferredcity || "");
        setPreferredRadiusKm(p.preferredradiuskm ?? 25);
      } else {
        setError((res as any).message || "Failed to load notification preferences.");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to Swastya. Please check your connection."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isLoading) return;

    try {
      setIsSaving(true);
      setError(null);
      setSaved(false);

      const res = await api.donor.updateNotificationPreferences({
        nearbycamps: nearbyCamps,
        campreminders: campReminders,
        campupdates: campUpdates,
        campcancellations: campCancellations,
        preferredcity: preferredCity.trim() || undefined,
        preferredradiuskm: Number(preferredRadiusKm),
      });

      const updated = res.data || (res as any).preferences;
      if (res.success && updated) {
        setPreferences(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 3500);
      } else {
        setError(res.message || "Failed to update notification preferences.");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while saving preferences."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div>
        <Link
          href="/donor/settings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#053845] mb-2.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Settings</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#317786]/15 pb-4">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              Notification Preferences
            </h1>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-600 mt-0.5">
              Customize which in-app updates, reminders, and blood camp alerts you receive.
            </p>
          </div>
          <Link
            href="/donor/notifications"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#F3E9D1] text-[#053845] hover:bg-[#FAF6EE] shadow-2xs"
          >
            <Bell className="w-3.5 h-3.5 text-[#317786]" />
            <span>View Notifications</span>
          </Link>
        </div>
      </div>

      {/* Strict In-App Notice */}
      <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-start gap-2.5 text-xs text-slate-600">
        <Shield className="w-4 h-4 text-[#317786] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#053845]">In-App Privacy Guarantee:</strong> Swastya alerts are
          delivered exclusively inside your donor portal notification center. We never spam your phone
          with promotional SMS, emails, or third-party marketing.
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2.5 text-xs">
          <AlertCircle className="w-4 h-4 text-[#A2363A] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success banner */}
      {saved && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Your notification preferences have been successfully updated.</span>
        </div>
      )}

      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs">
          <Loader2 className="w-6 h-6 animate-spin text-[#317786] mx-auto mb-2" />
          <p className="text-xs text-slate-500">Loading your preferences...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Blood Camp Alerts Section */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#F3E9D1]">
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <Tent className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Blood Donation Camp Notifications
                </h2>
                <p className="text-xs text-slate-500">
                  Control in-app alerts for scheduled donation drives and your registrations.
                </p>
              </div>
            </div>

            {/* Preference 1: Nearby Camps */}
            <div className="flex items-start justify-between gap-4 pt-1">
              <div className="space-y-0.5 max-w-lg">
                <label
                  htmlFor="toggle-nearby-camps"
                  className="text-sm font-semibold text-[#053845] cursor-pointer"
                >
                  Nearby Blood Donation Camps
                </label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Receive an in-app alert when a certified blood bank publishes a new donation camp
                  matching your preferred city or within your chosen distance radius.
                </p>
              </div>
              <input
                id="toggle-nearby-camps"
                type="checkbox"
                checked={nearbyCamps}
                onChange={(e) => setNearbyCamps(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#053845] rounded cursor-pointer shrink-0"
              />
            </div>

            {/* City & Radius sub-options (shown if nearby camps enabled) */}
            {nearbyCamps && (
              <div className="ml-0 sm:ml-4 p-4 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#053845] mb-1">
                      <MapPin className="w-3.5 h-3.5 inline mr-1 text-[#317786]" />
                      Preferred Camp City
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai, Pune, Delhi"
                      value={preferredCity}
                      onChange={(e) => setPreferredCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-white border border-[#F3E9D1] focus:outline-none focus:border-[#317786] text-slate-800"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Leave empty to use your registered donor profile city.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#053845] mb-1">
                      <Sliders className="w-3.5 h-3.5 inline mr-1 text-[#317786]" />
                      Discovery Radius
                    </label>
                    <select
                      value={preferredRadiusKm}
                      onChange={(e) => setPreferredRadiusKm(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-white border border-[#F3E9D1] focus:outline-none focus:border-[#317786] text-slate-800 cursor-pointer"
                    >
                      <option value={10}>Within 10 km</option>
                      <option value={25}>Within 25 km (Recommended)</option>
                      <option value={50}>Within 50 km</option>
                      <option value={100}>Within 100 km</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Maximum distance from your coordinates to trigger nearby alerts.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <hr className="border-[#F3E9D1]" />

            {/* Preference 2: Camp Reminders */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5 max-w-lg">
                <label
                  htmlFor="toggle-camp-reminders"
                  className="text-sm font-semibold text-[#053845] cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Clock className="w-4 h-4 text-[#317786]" />
                  <span>Camp Reminders (24h & 2h)</span>
                </label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Receive scheduled in-app reminders 24 hours and 2 hours before the start of camps
                  you are registered for, including preparation tips and venue details.
                </p>
              </div>
              <input
                id="toggle-camp-reminders"
                type="checkbox"
                checked={campReminders}
                onChange={(e) => setCampReminders(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#053845] rounded cursor-pointer shrink-0"
              />
            </div>

            <hr className="border-[#F3E9D1]" />

            {/* Preference 3: Camp Updates */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5 max-w-lg">
                <label
                  htmlFor="toggle-camp-updates"
                  className="text-sm font-semibold text-[#053845] cursor-pointer"
                >
                  Schedule & Venue Updates
                </label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Get notified promptly if an organizer updates the camp timings, venue location,
                  or adds important instructions for donors.
                </p>
              </div>
              <input
                id="toggle-camp-updates"
                type="checkbox"
                checked={campUpdates}
                onChange={(e) => setCampUpdates(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#053845] rounded cursor-pointer shrink-0"
              />
            </div>

            <hr className="border-[#F3E9D1]" />

            {/* Preference 4: Camp Cancellations */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5 max-w-lg">
                <label
                  htmlFor="toggle-camp-cancellations"
                  className="text-sm font-semibold text-[#053845] cursor-pointer inline-flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4 text-[#A2363A]" />
                  <span>Camp Cancellations</span>
                </label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Receive an immediate alert if an upcoming camp you have registered for is
                  cancelled by the blood bank organizer.
                </p>
              </div>
              <input
                id="toggle-camp-cancellations"
                type="checkbox"
                checked={campCancellations}
                onChange={(e) => setCampCancellations(e.target.checked)}
                className="w-5 h-5 mt-0.5 accent-[#053845] rounded cursor-pointer shrink-0"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/donor/settings"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Preferences...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Preferences</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
