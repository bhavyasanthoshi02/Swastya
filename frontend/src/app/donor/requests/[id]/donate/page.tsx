"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  ShieldCheck,
  AlertTriangle,
  Clock,
  MapPin,
  Phone,
  CheckCircle2,
  XCircle,
  FileText,
  Navigation,
  Sparkles,
  Info,
  Calendar,
  Building,
  Car,
} from "lucide-react";
import { api } from "@/lib/api";
import { mapBackendRequestToPreview } from "@/lib/mappers";
import { RequestPreviewItem } from "@/components/donor/DonorTypes";

export default function DonorScreeningAndDonatePage() {
  const params = useParams();
  const router = useRouter();
  const requestIdParam = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const [request, setRequest] = useState<RequestPreviewItem | null>(null);
  const [donorProfile, setDonorProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Transit Tracking State
  const [transitStatus, setTransitStatus] = useState<"DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED">("DONOR_FOUND");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState<string | null>(null);

  // Mandatory Questionnaire State
  // 1. Alcohol consumption (User's primary explicit requirement)
  const [drinksAlcohol, setDrinksAlcohol] = useState<boolean | null>(null);
  const [alcoholInPast24Hours, setAlcoholInPast24Hours] = useState<boolean | null>(null);

  // 2. Health & Symptoms
  const [feelingHealthy, setFeelingHealthy] = useState<boolean | null>(null);
  const [recentAntibioticsOrMedication, setRecentAntibioticsOrMedication] = useState<boolean | null>(null);

  // 3. Procedures & Intervals
  const [recentTattooOrSurgery, setRecentTattooOrSurgery] = useState<boolean | null>(null);
  const [donatedInLast90Days, setDonatedInLast90Days] = useState<boolean | null>(null);

  // 4. Chronic / Transmissible
  const [chronicIllness, setChronicIllness] = useState<boolean | null>(null);

  // 5. Female donor criteria (if applicable)
  const [isPregnantOrBreastfeeding, setIsPregnantOrBreastfeeding] = useState<boolean | null>(null);

  // Logistics
  const [estimatedArrival, setEstimatedArrival] = useState<string>("Within 1 - 2 hours");
  const [contactPhone, setContactPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        // Load donor profile
        const profileRes = await api.donor.getProfile();
        if (profileRes.success && profileRes.donor) {
          setDonorProfile(profileRes.donor);
          setContactPhone(profileRes.donor.users?.phonenumber || "");
        }

        // Load matching blood requests
        const reqRes = await api.donor.getMatchingRequests({ limit: 100 });
        if (reqRes.success && reqRes.requests) {
          const cleanedParam = (requestIdParam || "").toLowerCase().replace(/^req-/, "");
          const match = reqRes.requests.find((r: any) => {
            const rawId = (r.requestid || "").toLowerCase();
            const formatted = `req-${rawId.slice(0, 8)}`;
            return (
              rawId === cleanedParam ||
              formatted === (requestIdParam || "").toLowerCase() ||
              rawId.startsWith(cleanedParam)
            );
          });

          if (match) {
            setRequest(mapBackendRequestToPreview(match));
          } else if (reqRes.requests.length > 0) {
            // Fallback to first available if exact match not found
            setRequest(mapBackendRequestToPreview(reqRes.requests[0]));
          }
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to load requisition details.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [requestIdParam]);

  // Real-time Clinical Eligibility Evaluation
  const isFemale = donorProfile?.gender === "FEMALE";

  const allMandatoryAnswered =
    drinksAlcohol !== null &&
    (drinksAlcohol === false || alcoholInPast24Hours !== null) &&
    feelingHealthy !== null &&
    recentAntibioticsOrMedication !== null &&
    recentTattooOrSurgery !== null &&
    donatedInLast90Days !== null &&
    chronicIllness !== null &&
    (!isFemale || isPregnantOrBreastfeeding !== null);

  const deferralReasons: string[] = [];

  if (drinksAlcohol === true && alcoholInPast24Hours === true) {
    deferralReasons.push(
      "Alcohol consumed within the past 24 hours: Blood safety protocols mandate a 24-hour alcohol clearance to prevent hypovolemic donor reactions and safeguard plasma quality."
    );
  }

  if (feelingHealthy === false) {
    deferralReasons.push(
      "Current acute symptoms or illness: Donors must be in good health and symptom-free from infection, fever, or cough."
    );
  }

  if (recentAntibioticsOrMedication === true) {
    deferralReasons.push(
      "Recent antibiotics or prescription blood thinners: Clinical waiting periods apply before blood collection."
    );
  }

  if (recentTattooOrSurgery === true) {
    deferralReasons.push(
      "Tattoo, body piercing, or surgery within 6 months: A mandatory 6-month deferral applies for infectious clearance."
    );
  }

  if (donatedInLast90Days === true) {
    deferralReasons.push(
      "Whole blood donation within past 90 days: Mandatory 3-month physiological interval between whole blood donations."
    );
  }

  if (chronicIllness === true) {
    deferralReasons.push(
      "Chronic condition or transmissible viral history: Permanent safety deferral in effect."
    );
  }

  if (isFemale && isPregnantOrBreastfeeding === true) {
    deferralReasons.push(
      "Pregnancy or active breastfeeding: Temporary deferral to safeguard maternal iron levels and infant health."
    );
  }

  const isEligible = allMandatoryAnswered && deferralReasons.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEligible || !request) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const targetId = request.rawId || request.id.replace(/^REQ-/, "");

      const res = await api.donor.respondToRequest(targetId, {
        screeningAnswers: {
          drinksAlcohol: drinksAlcohol ?? false,
          alcoholInPast24Hours: alcoholInPast24Hours ?? false,
          feelingHealthy: feelingHealthy ?? true,
          recentAntibioticsOrMedication: recentAntibioticsOrMedication ?? false,
          recentTattooOrSurgery: recentTattooOrSurgery ?? false,
          donatedInLast90Days: donatedInLast90Days ?? false,
          chronicIllness: chronicIllness ?? false,
          isPregnantOrBreastfeeding: isPregnantOrBreastfeeding ?? false,
        },
        estimatedArrival,
        contactPhone,
        notes,
      });

      if (res.success) {
        setIsSubmitted(true);
        setTransitStatus("DONOR_FOUND");
      } else {
        setErrorMessage(res.message || "Failed to submit donation pledge.");
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          "Failed to record response. Please check your network connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTransit = async (
    newStatus: "DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED"
  ) => {
    if (!request) return;
    try {
      setIsUpdatingStatus(true);
      const targetId = request.rawId || request.id.replace(/^REQ-/, "");
      const res = await api.donor.updateTransitStatus(targetId, newStatus);
      if (res.success) {
        setTransitStatus(newStatus);
        setStatusUpdateSuccess(
          newStatus === "STARTED"
            ? "Status updated: Started Journey! Requester & Hospital notified."
            : newStatus === "REACHED_LOCATION"
            ? "Status updated: Reached Location! Hospital transfusion desk notified."
            : "Blood donation completed! Thank you for saving a life."
        );
        setTimeout(() => setStatusUpdateSuccess(null), 5000);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to update transit status. Please try again.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 border-3 border-[#317786] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading clinical screening form...</p>
      </div>
    );
  }

  if (isSubmitted && request) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-sm p-6 sm:p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Clinical Clearance Verified &bull; Pledge Active
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] pt-1">
              Thank You for Stepping Up to Save a Life!
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
              Your verified donor pledge has been transmitted directly to the requester and hospital transfusion desk.
            </p>
          </div>

          {statusUpdateSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusUpdateSuccess}</span>
            </div>
          )}

          {/* Live Donation Journey Tracker for Donor */}
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#FAF6EE] to-white border border-[#F3E9D1] text-left space-y-4 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#F3E9D1]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-[#053845] uppercase tracking-wider">
                  Live Donation Progress &bull; Milestone Stepper
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Visible to Requester in Real-Time
              </span>
            </div>

            {/* Stepper Progress Bar */}
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              {/* Step 1: Donor Found */}
              <div className="flex flex-col items-center space-y-1.5">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-emerald-600 text-white shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-emerald-700">Donor Found</span>
                <span className="text-[10px] text-slate-400">Pledged &amp; Screened</span>
              </div>

              {/* Step 2: Started */}
              <div className="flex flex-col items-center space-y-1.5">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                    transitStatus === "STARTED" ||
                    transitStatus === "REACHED_LOCATION" ||
                    transitStatus === "COMPLETED"
                      ? "bg-amber-500 text-white"
                      : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}
                >
                  <Car className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-bold ${
                    transitStatus === "STARTED" ||
                    transitStatus === "REACHED_LOCATION" ||
                    transitStatus === "COMPLETED"
                      ? "text-amber-700"
                      : "text-slate-400"
                  }`}
                >
                  Started
                </span>
                <span className="text-[10px] text-slate-400">On the Way</span>
              </div>

              {/* Step 3: Reached Location */}
              <div className="flex flex-col items-center space-y-1.5">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                    transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}
                >
                  <MapPin className="w-5 h-5" />
                </div>
                <span
                  className={`text-xs font-bold ${
                    transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                      ? "text-emerald-700"
                      : "text-slate-400"
                  }`}
                >
                  Reached Location
                </span>
                <span className="text-[10px] text-slate-400">At Hospital</span>
              </div>
            </div>

            {/* Donor Transit Status Update Actions */}
            <div className="pt-2 border-t border-[#F3E9D1] space-y-2.5">
              <span className="text-[11px] font-bold text-[#053845] block">
                Update Your Travel Progress:
              </span>

              {transitStatus === "DONOR_FOUND" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleUpdateTransit("STARTED")}
                  className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isUpdatingStatus ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Car className="w-4 h-4" />
                  )}
                  <span>I Have Started / On My Way to Hospital</span>
                </button>
              )}

              {transitStatus === "STARTED" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleUpdateTransit("REACHED_LOCATION")}
                  className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isUpdatingStatus ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <MapPin className="w-4 h-4" />
                  )}
                  <span>I Have Reached the Hospital / Location</span>
                </button>
              )}

              {transitStatus === "REACHED_LOCATION" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleUpdateTransit("COMPLETED")}
                  className="w-full py-3 px-4 rounded-2xl text-xs font-bold text-white bg-[#053845] hover:bg-[#124e5b] shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isUpdatingStatus ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Mark Blood Donation Completed</span>
                </button>
              )}

              {transitStatus === "COMPLETED" && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Donation Completed &bull; Blood unit collected successfully!</span>
                </div>
              )}
            </div>
          </div>

          {/* Requisition & Logistics Summary Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-left space-y-3">
            <div className="flex items-center justify-between border-b border-[#F3E9D1] pb-2.5">
              <span className="text-xs font-bold text-[#053845] flex items-center gap-1.5">
                <Building className="w-4 h-4 text-[#317786]" />
                <span>{request.hospitalName}</span>
              </span>
              <span className="text-xs font-mono font-bold text-[#A2363A]">
                {request.bloodGroup} Whole Blood
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#B94F30] shrink-0 mt-0.5" />
                <span>{request.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#317786] shrink-0" />
                <span>Pledged Arrival: <strong className="text-[#053845]">{estimatedArrival}</strong></span>
              </div>
              {contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#317786] shrink-0" />
                  <span>Contact Registered: <strong className="text-[#053845]">{contactPhone}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${request.hospitalName} ${request.location}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors shadow-2xs"
            >
              <Navigation className="w-4 h-4" />
              <span>Get Directions to Hospital</span>
            </a>

            <Link
              href="/donor/requests"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Blood Requests</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/donor/requests"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Matching Requests</span>
        </Link>
        <span className="text-xs text-slate-400 font-mono">
          Ref: {request?.id || requestIdParam}
        </span>
      </div>

      {/* Target Requisition Banner */}
      {request && (
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-[#053845] to-[#124e5b] text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#A2363A] text-white font-serif font-bold text-xl flex flex-col items-center justify-center shrink-0 shadow-xs border border-white/10">
              <span className="text-[9px] uppercase tracking-wider text-white/80 leading-none">
                TARGET
              </span>
              <span className="mt-0.5">{request.bloodGroup}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/15 px-2 py-0.5 rounded-md text-amber-200">
                  {request.urgency}
                </span>
                <span className="text-xs text-white/70">
                  {request.units} Unit(s) Whole Blood
                </span>
              </div>
              <h2 className="font-serif text-lg sm:text-xl font-bold mt-1">
                {request.hospitalName}
              </h2>
              <p className="text-xs text-white/80 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>{request.location} &bull; Approx. {request.distance}</span>
              </p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-xs text-xs space-y-1 sm:max-w-xs shrink-0 border border-white/10">
            <span className="font-bold text-amber-300 block">Pre-Donation Mandate</span>
            <p className="text-[11px] text-white/80 leading-snug">
              Complete the NBTC clinical clearance questions below to record your voluntary commitment.
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Mandatory Questionnaire Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Form Header */}
        <div className="p-6 sm:p-7 border-b border-[#F3E9D1] bg-[#FAF6EE]">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-[#A2363A]/10 text-[#A2363A] flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845]">
              Mandatory Donor Eligibility Screening
            </h1>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Please answer every question truthfully. Blood recipient safety and your physical well-being depend on accurate clinical screening.
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-7">
          {/* Section 1: Alcohol Consumption (User Requirement Highlight) */}
          <div className="p-5 rounded-2xl bg-amber-50/40 border border-amber-200/80 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block mb-0.5">
                  Section 1 &bull; Alcohol &amp; Substance Screening
                </span>
                <h3 className="font-serif text-sm sm:text-base font-bold text-[#053845]">
                  1. Do you consume alcohol?
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                Mandatory Check
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDrinksAlcohol(true);
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  drinksAlcohol === true
                    ? "bg-[#053845] text-white border-[#053845] shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Yes, I drink alcohol
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrinksAlcohol(false);
                  setAlcoholInPast24Hours(false);
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  drinksAlcohol === false
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                No, I do not drink alcohol
              </button>
            </div>

            {/* Conditional Sub-question for past 24 hours */}
            {drinksAlcohol === true && (
              <div className="pt-3 border-t border-amber-200/60 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                <div>
                  <h4 className="font-serif text-xs sm:text-sm font-bold text-[#053845]">
                    &rarr; Did you consume alcohol within the past 24 hours?
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Safety clearance requirement: You must be alcohol-free for at least 24 hours prior to donation.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAlcoholInPast24Hours(true)}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      alcoholInPast24Hours === true
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                    }`}
                  >
                    Yes, within past 24 hours
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlcoholInPast24Hours(false)}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      alcoholInPast24Hours === false
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                        : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    No, not in past 24 hours
                  </button>
                </div>

                {alcoholInPast24Hours === true && (
                  <div className="p-3 rounded-xl bg-rose-100/70 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Temporary Deferral Active</span>
                      <span className="text-[11px] leading-relaxed block mt-0.5">
                        Under clinical guidelines, donors who consumed alcohol in the last 24 hours are temporarily deferred to protect cardiovascular stability and blood component efficacy. Please wait 24 hours.
                      </span>
                    </div>
                  </div>
                )}

                {alcoholInPast24Hours === false && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-[11px]">
                      Alcohol Clearance Verified (24+ hours interval satisfied).
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: General Health & Vitals */}
          <div className="p-5 rounded-2xl bg-white border border-[#F3E9D1] space-y-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Section 2 &bull; General Health &amp; Medications
            </span>

            {/* Question 2.1 */}
            <div className="space-y-2">
              <label className="font-serif text-xs sm:text-sm font-bold text-[#053845] block">
                2. Are you feeling completely healthy, well, and free from fever, cough, or infections today?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFeelingHealthy(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    feelingHealthy === true
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  Yes, Feeling Great
                </button>
                <button
                  type="button"
                  onClick={() => setFeelingHealthy(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    feelingHealthy === false
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  No, Feeling Sick / Fever
                </button>
              </div>
            </div>

            {/* Question 2.2 */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="font-serif text-xs sm:text-sm font-bold text-[#053845] block">
                3. Have you taken any antibiotics, aspirin, or blood thinners in the past 48 - 72 hours?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRecentAntibioticsOrMedication(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    recentAntibioticsOrMedication === false
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  No, No Antibiotics
                </button>
                <button
                  type="button"
                  onClick={() => setRecentAntibioticsOrMedication(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    recentAntibioticsOrMedication === true
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  Yes, Active Medication
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Procedures & Interval */}
          <div className="p-5 rounded-2xl bg-white border border-[#F3E9D1] space-y-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Section 3 &bull; Procedures &amp; Donation Cooldown
            </span>

            {/* Question 3.1 */}
            <div className="space-y-2">
              <label className="font-serif text-xs sm:text-sm font-bold text-[#053845] block">
                4. Have you had a tattoo, body piercing, acupuncture, or major dental/surgical procedure in the last 6 months?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRecentTattooOrSurgery(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    recentTattooOrSurgery === false
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  No Procedures
                </button>
                <button
                  type="button"
                  onClick={() => setRecentTattooOrSurgery(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    recentTattooOrSurgery === true
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  Yes, in Last 6 Months
                </button>
              </div>
            </div>

            {/* Question 3.2 */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="font-serif text-xs sm:text-sm font-bold text-[#053845] block">
                5. Have you donated whole blood within the last 90 days (3 months)?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDonatedInLast90Days(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    donatedInLast90Days === false
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  No, &gt; 90 Days Ago
                </button>
                <button
                  type="button"
                  onClick={() => setDonatedInLast90Days(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    donatedInLast90Days === true
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  Yes, Donated Recently
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Chronic & Transmissible */}
          <div className="p-5 rounded-2xl bg-white border border-[#F3E9D1] space-y-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Section 4 &bull; Clinical Health History
            </span>

            <div className="space-y-2">
              <label className="font-serif text-xs sm:text-sm font-bold text-[#053845] block">
                6. Have you ever tested positive for HIV, Hepatitis B or C, or have chronic cardiac/respiratory disease?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setChronicIllness(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    chronicIllness === false
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  No, None of These
                </button>
                <button
                  type="button"
                  onClick={() => setChronicIllness(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    chronicIllness === true
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                  }`}
                >
                  Yes, History Present
                </button>
              </div>
            </div>
          </div>

          {/* Section 5: Female Donors (if applicable) */}
          {isFemale && (
            <div className="p-5 rounded-2xl bg-white border border-[#F3E9D1] space-y-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Section 5 &bull; Maternal Health Screening
              </span>

              <div className="space-y-2">
                <label className="font-serif text-xs sm:text-sm font-bold text-[#053845] block">
                  7. Are you currently pregnant or actively breastfeeding within the last 6 months?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPregnantOrBreastfeeding(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isPregnantOrBreastfeeding === false
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPregnantOrBreastfeeding(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isPregnantOrBreastfeeding === true
                        ? "bg-rose-600 text-white border-rose-600"
                        : "bg-[#FAF6EE] text-slate-700 border-[#F3E9D1] hover:bg-[#F3E9D1]/50"
                    }`}
                  >
                    Yes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section 6: Arrival Time & Contact */}
          <div className="p-5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-4">
            <span className="text-[10px] font-bold text-[#053845] uppercase tracking-wider block">
              Section {isFemale ? "6" : "5"} &bull; Donation Logistics &amp; Coordination
            </span>

            <div className="space-y-2">
              <label className="font-serif text-xs sm:text-sm font-bold text-[#053845] block">
                Estimated Arrival Time at Hospital Transfusion Desk
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  "Within 1 hour (Urgent)",
                  "Within 1 - 2 hours",
                  "Today Afternoon",
                  "Tomorrow Morning",
                ].map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setEstimatedArrival(time)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                      estimatedArrival === time
                        ? "bg-[#317786] text-white border-[#317786] shadow-2xs"
                        : "bg-white text-slate-700 border-[#F3E9D1] hover:bg-slate-50"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs font-bold text-[#053845] block mb-1">
                  Contact Phone Number
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-hidden focus:ring-2 focus:ring-[#317786]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#053845] block mb-1">
                  Remarks / Notes for Hospital Desk (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Taking metro, arriving with donor card"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-hidden focus:ring-2 focus:ring-[#317786]"
                />
              </div>
            </div>
          </div>

          {/* Dynamic Evaluation Card */}
          <div className="pt-2">
            {!allMandatoryAnswered ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 text-xs flex items-center gap-2.5">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  Please complete all screening questions above to evaluate clinical eligibility.
                </span>
              </div>
            ) : isEligible ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-sm block text-emerald-800">
                    Clinical Screening Passed &bull; You are Eligible to Donate!
                  </span>
                  <span className="text-[11px] text-emerald-700 leading-relaxed block mt-1">
                    Your answers comply with NBTC blood donation safety criteria. Submitting will register your commitment with the requester and hospital emergency coordination desk.
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>Temporarily Ineligible to Donate</span>
                </div>
                <ul className="text-[11px] text-rose-700 space-y-1 list-disc list-inside">
                  {deferralReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Modal/Page Footer */}
        <div className="p-5 sm:p-6 border-t border-[#F3E9D1] bg-[#FAF6EE] flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href="/donor/requests"
            className="text-xs font-semibold text-slate-500 hover:text-[#053845] transition-colors order-2 sm:order-1"
          >
            Cancel and Return
          </Link>

          <button
            type="submit"
            disabled={!isEligible || isSubmitting}
            className={`w-full sm:w-auto px-7 py-3 rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 order-1 sm:order-2 ${
              isEligible && !isSubmitting
                ? "bg-[#317786] hover:bg-[#245964] text-white cursor-pointer"
                : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/60"
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Verifying &amp; Registering Response...</span>
              </>
            ) : (
              <>
                <Heart className="w-4 h-4 fill-current" />
                <span>
                  {isEligible
                    ? "Confirm Donation Pledge & Transmit to Requester"
                    : "Complete Form to Verify Eligibility"}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
