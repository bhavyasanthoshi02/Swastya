"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  Navigation,
  Info,
  Building,
  Car,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { mapBackendRequestToPreview } from "@/lib/mappers";
import { RequestPreviewItem } from "@/components/donor/DonorTypes";

export default function DonorScreeningAndDonatePage() {
  const params = useParams();
  const requestIdParam = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const [request, setRequest] = useState<RequestPreviewItem | null>(null);
  const [donorGender, setDonorGender] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live Transit Tracking State
  const [transitStatus, setTransitStatus] = useState<
    "DONOR_FOUND" | "STARTED" | "REACHED_LOCATION" | "COMPLETED"
  >("DONOR_FOUND");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState<string | null>(null);
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [thankYouDismissed, setThankYouDismissed] = useState(false);

  // Mandatory Questionnaire State
  const [drinksAlcohol, setDrinksAlcohol] = useState<boolean | null>(null);
  const [alcoholInPast24Hours, setAlcoholInPast24Hours] = useState<boolean | null>(null);
  const [feelingHealthy, setFeelingHealthy] = useState<boolean | null>(null);
  const [recentAntibioticsOrMedication, setRecentAntibioticsOrMedication] = useState<
    boolean | null
  >(null);
  const [recentTattooOrSurgery, setRecentTattooOrSurgery] = useState<boolean | null>(null);
  const [donatedInLast90Days, setDonatedInLast90Days] = useState<boolean | null>(null);
  const [chronicIllness, setChronicIllness] = useState<boolean | null>(null);
  const [isPregnantOrBreastfeeding, setIsPregnantOrBreastfeeding] = useState<boolean | null>(
    null
  );

  // Logistics
  const [estimatedArrival, setEstimatedArrival] = useState<string>("Within 1 - 2 hours");
  const [contactPhone, setContactPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const profileRes = await api.donor.getProfile();
        if (profileRes.success && profileRes.donor) {
          setDonorGender(profileRes.donor.gender || null);
          setContactPhone(profileRes.donor.users?.phonenumber || "");
        }

        const rawParam = (requestIdParam || "").trim().toLowerCase();
        const cleanedParam = rawParam.replace(/^req-/, "");

        let loadedRequest: any = null;
        let loadedCommitment: any = null;

        const reqRes = await api.donor.getMatchingRequests({ limit: 50 }).catch(() => null);
        if (reqRes?.success && reqRes.requests) {
          const match = rawParam
            ? reqRes.requests.find((r: { requestid?: string }) => {
                const rawId = (r.requestid || "").toLowerCase();
                const formatted = `req-${rawId.slice(0, 8)}`;
                return (
                  rawId === rawParam ||
                  rawId === cleanedParam ||
                  formatted === rawParam ||
                  (cleanedParam.length >= 8 && rawId.startsWith(cleanedParam))
                );
              })
            : undefined;

          if (match) {
            loadedRequest = mapBackendRequestToPreview(match);
          }
        }

        // If not found in matching pool or already committed/fulfilled, fetch direct requisition
        const lookupId = loadedRequest?.rawId || cleanedParam || rawParam;
        if (lookupId) {
          const directRes = await api.bloodRequests.getById(lookupId).catch(() => null);
          if (directRes && (directRes.requestid || (directRes as any).id)) {
            if (!loadedRequest) {
              loadedRequest = mapBackendRequestToPreview(directRes);
            }
            if ((directRes as any).myCommitment) {
              loadedCommitment = (directRes as any).myCommitment;
            }
          }
        }

        if (loadedRequest) {
          setRequest(loadedRequest);
          if (loadedCommitment) {
            setIsSubmitted(true);
            const transit = (loadedCommitment.transitStatus || loadedCommitment.status || "DONOR_FOUND") as any;
            setTransitStatus(transit);
            if (transit === "COMPLETED" || loadedRequest.requestStatus === "FULFILLED") {
              setShowThankYouModal(true);
            }
          } else if (loadedRequest.requestStatus === "FULFILLED") {
            setIsSubmitted(true);
            setTransitStatus("COMPLETED");
            setShowThankYouModal(true);
          }
        } else {
          setRequest(null);
          setErrorMessage(
            "Blood request not found or no longer available for matching."
          );
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load requisition details."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [requestIdParam]);

  // Real-time Clinical Eligibility Evaluation
  const isFemale = donorGender === "FEMALE";

  const requiredQuestionStates = [
    drinksAlcohol !== null,
    ...(drinksAlcohol === true ? [alcoholInPast24Hours !== null] : []),
    feelingHealthy !== null,
    recentAntibioticsOrMedication !== null,
    recentTattooOrSurgery !== null,
    donatedInLast90Days !== null,
    chronicIllness !== null,
    ...(isFemale ? [isPregnantOrBreastfeeding !== null] : []),
  ];

  const totalQuestions = requiredQuestionStates.length;
  const answeredQuestions = requiredQuestionStates.filter(Boolean).length;
  const remainingQuestions = totalQuestions - answeredQuestions;
  const completionPercent =
    totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;

  const allMandatoryAnswered = remainingQuestions === 0;

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
  const cleanPhone = contactPhone.trim().replace(/[\s()-]/g, "");
  const isPhoneValid = cleanPhone === "" || /^\+?[0-9]{10,15}$/.test(cleanPhone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEligible || !isPhoneValid || !request) return;

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
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to record response. Please check your network connection and try again."
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
        if (newStatus === "COMPLETED") {
          setShowThankYouModal(true);
        }
        setStatusUpdateSuccess(
          newStatus === "STARTED"
            ? "Status updated: Started Journey! Requester & Hospital notified."
            : newStatus === "REACHED_LOCATION"
            ? "Status updated: Reached Location! Hospital transfusion desk notified."
            : "Blood donation completed! Thank you for saving a life."
        );
        setTimeout(() => setStatusUpdateSuccess(null), 5000);
      }
    } catch (err: unknown) {
      alert(
        err instanceof Error
          ? err.message
          : "Failed to update transit status. Please try again."
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  useEffect(() => {
    if ((transitStatus === "COMPLETED" || request?.requestStatus === "FULFILLED") && !thankYouDismissed && !showThankYouModal) {
      setShowThankYouModal(true);
    }
  }, [transitStatus, request?.requestStatus, thankYouDismissed, showThankYouModal]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 space-y-3">
        <Loader2 className="w-7 h-7 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">
          Loading clinical screening form...
        </p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-[#A2363A] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h1 className="font-serif text-xl font-bold text-[#053845]">
              Blood Request Not Found
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              {errorMessage ||
                "The requested blood requisition could not be located or is no longer active for matching."}
            </p>
          </div>
          <Link
            href="/donor/requests"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Matching Requests</span>
          </Link>
        </div>
      </div>
    );
  }

  if (isSubmitted && request) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 pb-12">
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-6 text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-3 py-0.5 rounded-full border border-emerald-200 inline-block">
              Clinical Clearance Verified &bull; Pledge Active
            </span>
            <h1 className="font-serif text-2xl font-bold text-[#053845] pt-1">
              Thank You for Stepping Up to Save a Life!
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
              Your verified donor pledge has been transmitted directly to the requester and hospital transfusion desk.
            </p>
          </div>

          {statusUpdateSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusUpdateSuccess}</span>
            </div>
          )}

          {/* Live Donation Journey Tracker */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-left space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#F3E9D1]">
              <span className="text-xs font-bold text-[#053845]">
                Live Donation Progress
              </span>
              <span className="text-[11px] text-slate-500">Visible to requester</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col items-center space-y-1">
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-[#317786] text-white">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-[#053845]">Donor Found</span>
              </div>

              <div className="flex flex-col items-center space-y-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    transitStatus === "STARTED" ||
                    transitStatus === "REACHED_LOCATION" ||
                    transitStatus === "COMPLETED"
                      ? "bg-[#317786] text-white"
                      : "bg-white text-slate-400 border border-[#F3E9D1]"
                  }`}
                >
                  <Car className="w-4 h-4" />
                </div>
                <span
                  className={`text-xs font-semibold ${
                    transitStatus === "STARTED" ||
                    transitStatus === "REACHED_LOCATION" ||
                    transitStatus === "COMPLETED"
                      ? "text-[#053845]"
                      : "text-slate-400"
                  }`}
                >
                  Started
                </span>
              </div>

              <div className="flex flex-col items-center space-y-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                      ? "bg-[#317786] text-white"
                      : "bg-white text-slate-400 border border-[#F3E9D1]"
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                </div>
                <span
                  className={`text-xs font-semibold ${
                    transitStatus === "REACHED_LOCATION" || transitStatus === "COMPLETED"
                      ? "text-[#053845]"
                      : "text-slate-400"
                  }`}
                >
                  Reached Location
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#F3E9D1] space-y-2">
              {transitStatus === "DONOR_FOUND" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleUpdateTransit("STARTED")}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Car className="w-4 h-4" />
                  <span>I Have Started / On My Way to Hospital</span>
                </button>
              )}

              {transitStatus === "STARTED" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleUpdateTransit("REACHED_LOCATION")}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <MapPin className="w-4 h-4" />
                  <span>I Have Reached the Hospital / Location</span>
                </button>
              )}

              {transitStatus === "REACHED_LOCATION" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleUpdateTransit("COMPLETED")}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mark Blood Donation Completed</span>
                </button>
              )}

              {transitStatus === "COMPLETED" && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold text-emerald-900 text-sm">Donation Completed &amp; Requisition Closed</p>
                      <p className="text-emerald-800 text-xs">
                        Blood unit collected successfully! Thank you for saving a life.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowThankYouModal(true)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors cursor-pointer shrink-0"
                  >
                    View Thank You Card
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Requisition Summary */}
          <div className="p-4 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] text-left space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-[#F3E9D1] pb-2">
              <span className="font-semibold text-[#053845] flex items-center gap-1.5">
                <Building className="w-4 h-4 text-[#317786]" />
                <span>{request.hospitalName}</span>
              </span>
              <span className="font-semibold text-[#B94F30]">
                {request.bloodGroup} &middot; {request.bloodComponent || "Whole Blood"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
              {request.location !== "Location not specified" && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#317786] shrink-0 mt-0.5" />
                  <span>{request.location}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                <span>
                  Pledged Arrival: <strong className="text-[#053845]">{estimatedArrival}</strong>
                </span>
              </div>
              {contactPhone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                  <span>
                    Contact Registered: <strong className="text-[#053845]">{contactPhone}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${request.hospitalName} ${request.location}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-colors"
            >
              <Navigation className="w-4 h-4" />
              <span>Get Directions to Hospital</span>
            </a>

            <Link
              href="/donor/requests"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-[#053845] bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Blood Requests</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasRealLocation =
    Boolean(request.location) && request.location !== "Location not specified";
  const hasRealDistance =
    typeof request.distanceKm === "number" || request.locationMatch === "COORDINATES";

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between text-xs">
        <Link
          href="/donor/requests"
          className="inline-flex items-center gap-1.5 font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Matching Requests</span>
        </Link>
        <span className="text-slate-400 font-mono">{request.id}</span>
      </div>

      {/* 1. Compact Secondary Request Summary Header */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] px-4 py-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="px-3 py-1.5 rounded-xl bg-[#317786]/10 border border-[#317786]/25 text-[#053845] font-serif font-bold text-base leading-none shrink-0">
            {request.bloodGroup}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-slate-400">{request.id}</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFA27E]/20 text-[#B94F30] border border-[#EFA27E]/45">
                {request.urgencyLabel || request.urgency}
              </span>
              <span className="font-semibold text-[#053845]">
                {request.units} {request.units > 1 ? "units" : "unit"} &middot;{" "}
                {request.bloodComponent || "Whole Blood"}
              </span>
            </div>
            <p className="font-serif text-base font-bold text-[#053845] truncate">
              {request.hospitalName}
            </p>
            {(hasRealLocation || hasRealDistance) && (
              <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2">
                {hasRealLocation && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#317786]" />
                    <span>{request.location}</span>
                  </span>
                )}
                {hasRealDistance && (
                  <span className="text-[#317786] font-medium">{request.distance}</span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 bg-[#FAF6EE]/80 border border-[#F3E9D1] rounded-xl px-3 py-2 sm:max-w-[230px] shrink-0">
          <span className="font-semibold text-[#053845] block">Pre-Donation Mandate</span>
          <span>Complete the NBTC screening below to register your pledge.</span>
        </div>
      </section>

      {/* 2. Screening Page Heading */}
      <header className="flex items-start gap-3 pt-1">
        <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Donor Eligibility Screening
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Truthful answers are required for clinical screening, recipient safety, and your own well-being.
          </p>
        </div>
      </header>

      {/* 3. Compact Screening Progress Indicator */}
      <section
        aria-label="Screening progress"
        className="bg-white rounded-2xl border border-[#F3E9D1] px-4 py-3 shadow-2xs space-y-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-[#053845]">
            {answeredQuestions} of {totalQuestions} questions answered
          </span>
          <div className="flex items-center gap-3">
            <span className="text-slate-500">{remainingQuestions} remaining</span>
            <span className="font-semibold text-[#317786] tabular-nums">
              {completionPercent}%
            </span>
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[#FAF6EE] overflow-hidden">
          <div
            className="h-full bg-[#317786] rounded-full transition-all duration-200"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </section>

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#A2363A] shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Screening Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Section 1: Alcohol & Substance Screening */}
        <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#F3E9D1]/70">
            <span className="text-xs font-semibold text-[#317786]">
              1. Alcohol &amp; Substance Screening
            </span>
            <span className="text-[11px] font-medium text-[#B94F30]">Mandatory</span>
          </div>

          <div className="space-y-2.5">
            <p className="text-sm font-medium text-[#053845] leading-snug">
              1. Do you consume alcohol?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDrinksAlcohol(true);
                  if (drinksAlcohol === false) {
                    setAlcoholInPast24Hours(null);
                  }
                }}
                className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  drinksAlcohol === true
                    ? "bg-[#317786] text-white border-[#317786]"
                    : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
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
                className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  drinksAlcohol === false
                    ? "bg-[#317786] text-white border-[#317786]"
                    : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                }`}
              >
                No, I do not drink alcohol
              </button>
            </div>
          </div>

          {drinksAlcohol === true && (
            <div className="pt-3 border-t border-[#F3E9D1]/70 space-y-2.5">
              <div>
                <p className="text-sm font-medium text-[#053845] leading-snug">
                  &rarr; Did you consume alcohol within the past 24 hours?
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Safety clearance requirement: You must be alcohol-free for at least 24 hours prior to donation.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setAlcoholInPast24Hours(true)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    alcoholInPast24Hours === true
                      ? "bg-[#A2363A] text-white border-[#A2363A]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#A2363A]/45"
                  }`}
                >
                  Yes, within past 24 hours
                </button>
                <button
                  type="button"
                  onClick={() => setAlcoholInPast24Hours(false)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    alcoholInPast24Hours === false
                      ? "bg-[#317786] text-white border-[#317786]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                  }`}
                >
                  No, not in past 24 hours
                </button>
              </div>

              {alcoholInPast24Hours === true && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-[#A2363A] shrink-0 mt-0.5" />
                  <span>
                    <strong>Temporary Deferral:</strong> Donors who consumed alcohol in the last 24 hours are temporarily deferred. Please wait 24 hours.
                  </span>
                </div>
              )}

              {alcoholInPast24Hours === false && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">
                    Alcohol Clearance Verified (24+ hours interval satisfied).
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 2: General Health & Medications */}
        <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="pb-2 border-b border-[#F3E9D1]/70">
            <span className="text-xs font-semibold text-[#317786]">
              2. General Health &amp; Medications
            </span>
          </div>

          <div className="divide-y divide-[#F3E9D1]/60 space-y-3.5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#053845] leading-snug">
                2. Are you feeling completely healthy, well, and free from fever, cough, or infections today?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFeelingHealthy(true)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    feelingHealthy === true
                      ? "bg-[#317786] text-white border-[#317786]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                  }`}
                >
                  Yes, Feeling Great
                </button>
                <button
                  type="button"
                  onClick={() => setFeelingHealthy(false)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    feelingHealthy === false
                      ? "bg-[#A2363A] text-white border-[#A2363A]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#A2363A]/45"
                  }`}
                >
                  No, Feeling Sick / Fever
                </button>
              </div>
            </div>

            <div className="pt-3.5 space-y-2">
              <p className="text-sm font-medium text-[#053845] leading-snug">
                3. Have you taken any antibiotics, aspirin, or blood thinners in the past 48 - 72 hours?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRecentAntibioticsOrMedication(false)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    recentAntibioticsOrMedication === false
                      ? "bg-[#317786] text-white border-[#317786]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                  }`}
                >
                  No, No Antibiotics
                </button>
                <button
                  type="button"
                  onClick={() => setRecentAntibioticsOrMedication(true)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    recentAntibioticsOrMedication === true
                      ? "bg-[#A2363A] text-white border-[#A2363A]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#A2363A]/45"
                  }`}
                >
                  Yes, Active Medication
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Procedures & Donation Cooldown */}
        <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="pb-2 border-b border-[#F3E9D1]/70">
            <span className="text-xs font-semibold text-[#317786]">
              3. Procedures &amp; Donation Cooldown
            </span>
          </div>

          <div className="divide-y divide-[#F3E9D1]/60 space-y-3.5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#053845] leading-snug">
                4. Have you had a tattoo, body piercing, acupuncture, or major dental/surgical procedure in the last 6 months?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRecentTattooOrSurgery(false)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    recentTattooOrSurgery === false
                      ? "bg-[#317786] text-white border-[#317786]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                  }`}
                >
                  No Procedures
                </button>
                <button
                  type="button"
                  onClick={() => setRecentTattooOrSurgery(true)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    recentTattooOrSurgery === true
                      ? "bg-[#A2363A] text-white border-[#A2363A]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#A2363A]/45"
                  }`}
                >
                  Yes, in Last 6 Months
                </button>
              </div>
            </div>

            <div className="pt-3.5 space-y-2">
              <p className="text-sm font-medium text-[#053845] leading-snug">
                5. Have you donated whole blood within the last 90 days (3 months)?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDonatedInLast90Days(false)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    donatedInLast90Days === false
                      ? "bg-[#317786] text-white border-[#317786]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                  }`}
                >
                  No, &gt; 90 Days Ago
                </button>
                <button
                  type="button"
                  onClick={() => setDonatedInLast90Days(true)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    donatedInLast90Days === true
                      ? "bg-[#A2363A] text-white border-[#A2363A]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#A2363A]/45"
                  }`}
                >
                  Yes, Donated Recently
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Clinical Health History (+ Maternal Screening if Female) */}
        <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="pb-2 border-b border-[#F3E9D1]/70">
            <span className="text-xs font-semibold text-[#317786]">
              4. Clinical Health History
            </span>
          </div>

          <div className="divide-y divide-[#F3E9D1]/60 space-y-3.5">
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#053845] leading-snug">
                6. Have you ever tested positive for HIV, Hepatitis B or C, or have chronic cardiac/respiratory disease?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setChronicIllness(false)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    chronicIllness === false
                      ? "bg-[#317786] text-white border-[#317786]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                  }`}
                >
                  No, None of These
                </button>
                <button
                  type="button"
                  onClick={() => setChronicIllness(true)}
                  className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    chronicIllness === true
                      ? "bg-[#A2363A] text-white border-[#A2363A]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#A2363A]/45"
                  }`}
                >
                  Yes, History Present
                </button>
              </div>
            </div>

            {isFemale && (
              <div className="pt-3.5 space-y-2">
                <p className="text-sm font-medium text-[#053845] leading-snug">
                  7. Are you currently pregnant or actively breastfeeding within the last 6 months?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsPregnantOrBreastfeeding(false)}
                    className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      isPregnantOrBreastfeeding === false
                        ? "bg-[#317786] text-white border-[#317786]"
                        : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPregnantOrBreastfeeding(true)}
                    className={`py-2 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      isPregnantOrBreastfeeding === true
                        ? "bg-[#A2363A] text-white border-[#A2363A]"
                        : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#A2363A]/45"
                    }`}
                  >
                    Yes
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 5: Donation Logistics & Coordination */}
        <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3.5">
          <div className="pb-2 border-b border-[#F3E9D1]/70">
            <span className="text-xs font-semibold text-[#317786]">
              5. Donation Logistics &amp; Coordination
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#053845] block">
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
                  className={`py-2 px-2.5 rounded-xl text-xs font-semibold border text-center transition-colors cursor-pointer ${
                    estimatedArrival === time
                      ? "bg-[#317786] text-white border-[#317786]"
                      : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:border-[#317786]/45"
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#053845] block">
                Contact Phone Number
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="e.g. +91 9876543210"
                className={`w-full h-10 px-3 rounded-xl text-xs bg-white border focus:outline-none transition-colors ${
                  !isPhoneValid
                    ? "border-[#A2363A]"
                    : "border-[#F3E9D1] focus:border-[#317786]"
                }`}
              />
              {!isPhoneValid && (
                <p className="text-[11px] text-[#A2363A]">
                  Enter a valid 10 to 15 digit phone number.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#053845] block">
                Remarks / Notes for Hospital Desk (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Taking metro, arriving with donor card"
                className="w-full h-10 px-3 rounded-xl text-xs bg-white border border-[#F3E9D1] focus:outline-none focus:border-[#317786]"
              />
            </div>
          </div>
        </section>

        {/* 6. Clinical Eligibility Feedback */}
        <section aria-live="polite">
          {!allMandatoryAnswered ? (
            <div className="p-3.5 rounded-2xl bg-white border border-[#F3E9D1] text-slate-600 text-xs flex items-center gap-2.5 shadow-2xs">
              <Info className="w-4 h-4 text-[#317786] shrink-0" />
              <span>
                {remainingQuestions}{" "}
                {remainingQuestions === 1 ? "question remains" : "questions remain"} to evaluate your clinical eligibility.
              </span>
            </div>
          ) : isEligible ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-sm block text-emerald-800">
                  Clinical Screening Passed &bull; Eligible to Donate
                </span>
                <span className="text-xs text-emerald-700 block mt-0.5">
                  Your answers comply with NBTC blood donation safety criteria.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-[#A2363A] text-sm">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>Temporarily Ineligible to Donate</span>
              </div>
              <ul className="text-xs text-rose-800 space-y-1 list-disc list-inside">
                {deferralReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 7. Clean Sticky Bottom Action Area */}
        <div className="sticky bottom-3 z-30 bg-white/95 backdrop-blur-xs rounded-2xl border border-[#F3E9D1] p-3.5 sm:px-5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <Link
            href="/donor/requests"
            className="text-xs font-semibold text-slate-500 hover:text-[#053845] transition-colors order-2 sm:order-1"
          >
            Cancel and Return
          </Link>

          <button
            type="submit"
            disabled={!isEligible || !isPhoneValid || isSubmitting}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 order-1 sm:order-2 ${
              isEligible && isPhoneValid && !isSubmitting
                ? "bg-[#317786] hover:bg-[#245964] text-white cursor-pointer shadow-2xs"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying &amp; Registering Response...</span>
              </>
            ) : (
              <>
                <Heart className="w-4 h-4 fill-current" />
                <span>
                  {isEligible
                    ? "Confirm Donation Pledge & Transmit to Requester"
                    : "Complete Screening to Verify Eligibility"}
                </span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Celebration Thank You Modal */}
      {showThankYouModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 sm:p-7 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#317786] to-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Heart className="w-8 h-8 fill-current animate-pulse text-white" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Requisition Fulfilled &amp; Closed</span>
              </span>
              <h2 className="font-serif text-2xl font-bold text-[#053845]">
                Thank You So Much, Hero!
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                A life was saved today! You stepped up and made a real difference by donating your life-saving blood for patient{" "}
                <strong>{(request as any)?.patientname || (request as any)?.patientName || "the patient"}</strong>. Your heroism and generosity are deeply appreciated.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs space-y-1.5 text-left">
              <div className="flex justify-between text-slate-600">
                <span>Care Facility:</span>
                <span className="font-bold text-[#053845]">{request?.hospitalName || "Hospital"}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Blood Group:</span>
                <span className="font-bold text-[#053845]">{request?.bloodGroup} ({request?.bloodComponent || "Whole Blood"})</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Donation Status:</span>
                <span className="font-bold text-emerald-700">Fulfilled &amp; Closed</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowThankYouModal(false);
                  setThankYouDismissed(true);
                }}
                className="w-full sm:w-1/2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                View Closed Request
              </button>
              <Link
                href="/donor/dashboard"
                className="w-full sm:w-1/2 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#053845] hover:bg-[#317786] transition-colors"
              >
                <span>Return to Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
