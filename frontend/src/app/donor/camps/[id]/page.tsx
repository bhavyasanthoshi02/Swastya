"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Tent,
  Calendar,
  Clock,
  MapPin,
  Building2,
  Users,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Phone,
  ShieldCheck,
  Info,
  CalendarCheck,
  AlertTriangle,
  X,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";

interface CampDetails {
  campid: string;
  campname: string;
  description?: string | null;
  organizername: string;
  organizingbloodbank: string;
  contactperson: string;
  contactphone?: string | null;
  campdate: string;
  starttime: string;
  endtime: string;
  timezone: string;
  venuename: string;
  address: string;
  city: string;
  district?: string | null;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  isregistrationrequired: boolean;
  registrationstatus: "OPEN" | "CLOSED";
  isregistrationopen: boolean;
  registrationopeningdate?: string;
  registrationdeadline?: string;
  registrationinstructions?: string | null;
  donorinstructions?: string | null;
  eligibilitynotes?: string | null;
  maxcapacity?: number | null;
  registeredcount: number;
  remainingcapacity?: number | null;
}

interface ExistingRegistration {
  registrationid: string;
  registrationreference: string;
  registrationdate: string;
  registrationstatus: "REGISTERED" | "CANCELLED";
  attendancestatus: "PENDING" | "ATTENDED" | "NOT_ATTENDED";
  attendedat?: string | null;
  unitsdonated?: number | null;
  camp: {
    campid: string;
  };
}

export default function DonorCampDetailPage() {
  const params = useParams();
  const campId = (params?.id as string) || "";

  const [camp, setCamp] = useState<CampDetails | null>(null);
  const [existingReg, setExistingReg] = useState<ExistingRegistration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Registration modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [declarationChecked, setDeclarationChecked] = useState(false);
  const [successReference, setSuccessReference] = useState<string | null>(null);

  // Copied reference state
  const [copiedRef, setCopiedRef] = useState(false);

  const fetchCampData = async () => {
    if (!campId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [campRes, myRegsRes] = await Promise.all([
        api.camps.getPublicById(campId),
        api.camps.getMyRegistrations().catch(() => ({ success: false, data: [] })),
      ]);

      if (campRes.success && campRes.data) {
        setCamp(campRes.data);
      } else {
        setError("Camp not found or is no longer published.");
      }

      if (myRegsRes.success && Array.isArray(myRegsRes.data)) {
        const found = myRegsRes.data.find(
          (r: any) => r.camp?.campid === campId && r.registrationstatus === "REGISTERED"
        );
        if (found) {
          setExistingReg(found);
        } else {
          setExistingReg(null);
        }
      }
    } catch (err: any) {
      console.error("Error fetching camp details:", err);
      setError(err?.message || "Failed to load camp details. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampData();
  }, [campId]);

  const handleCopyReference = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const handleConfirmRegistration = async () => {
    if (!declarationChecked) {
      setRegisterError("Please confirm your eligibility and consent declaration.");
      return;
    }

    try {
      setIsRegistering(true);
      setRegisterError(null);

      const res = await api.camps.register(campId);
      if (res.success && res.data) {
        setSuccessReference(res.data.registrationreference);
        fetchCampData();
      } else {
        setRegisterError(res.message || "Failed to complete registration.");
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      setRegisterError(err?.message || "Failed to register. Please check slot availability and try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-[#317786] mb-3" />
        <p className="text-xs font-medium text-slate-500">Loading camp details...</p>
      </div>
    );
  }

  if (error || !camp) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl border border-amber-200 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="font-serif text-lg font-bold text-[#053845] mb-2">Camp Unavailable</h2>
        <p className="text-xs text-slate-600 mb-6">{error || "The requested donation camp could not be found."}</p>
        <Link
          href="/donor/camps"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#317786] hover:bg-[#245964] text-white font-semibold text-xs rounded-xl shadow-2xs transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Camp Discovery
        </Link>
      </div>
    );
  }

  const campDateFormatted = new Date(camp.campdate).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const mapsQuery = encodeURIComponent(
    `${camp.venuename}, ${camp.address}, ${camp.city}, ${camp.state} ${camp.pincode}`
  );
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const isFull = camp.remainingcapacity !== null && camp.remainingcapacity !== undefined && camp.remainingcapacity <= 0;

  return (
    <div className="space-y-5 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/donor/camps"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Discover Camps</span>
        </Link>
      </div>

      {/* Main Camp Banner Card */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {/* Brand Deep Teal Gradient Hero Banner */}
        <div className="bg-gradient-to-r from-[#053845] via-[#0b4857] to-[#125869] px-6 sm:px-8 py-8 text-white">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 backdrop-blur-xs text-white text-xs font-semibold rounded-full border border-white/20">
              <Tent className="w-3.5 h-3.5" />
              Blood Donation Camp
            </span>

            {camp.isregistrationrequired ? (
              existingReg ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/90 text-white text-xs font-semibold rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  You Are Registered
                </span>
              ) : camp.isregistrationopen ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full border border-white/20">
                  Registration Open
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-400 text-amber-950 text-xs font-semibold rounded-full">
                  Registration Closed
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-teal-300 text-teal-950 text-xs font-semibold rounded-full">
                Walk-ins Welcome
              </span>
            )}
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            {camp.campname}
          </h1>
          <p className="text-teal-50/90 text-sm max-w-3xl leading-relaxed">
            {camp.description || "Join fellow voluntary donors to donate blood and help save precious lives in our community."}
          </p>
        </div>

        {/* Camp Key Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#F3E9D1] bg-[#FAF6EE]/50 p-6">
          <div className="flex items-start gap-3.5 py-2 md:py-0 md:pr-4">
            <div className="w-10 h-10 rounded-2xl bg-[#317786]/10 text-[#317786] border border-[#317786]/20 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date & Schedule</p>
              <p className="text-sm font-semibold text-[#053845] mt-0.5">{campDateFormatted}</p>
              <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-[#317786]" />
                {camp.starttime} – {camp.endtime} ({camp.timezone || "IST"})
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 py-2 md:py-0 md:px-4">
            <div className="w-10 h-10 rounded-2xl bg-[#317786]/10 text-[#317786] border border-[#317786]/20 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Venue Location</p>
              <p className="text-sm font-semibold text-[#053845] mt-0.5">{camp.venuename}</p>
              <p className="text-xs text-slate-600 mt-0.5">
                {camp.city}, {camp.state} - {camp.pincode}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 py-2 md:py-0 md:pl-4">
            <div className="w-10 h-10 rounded-2xl bg-[#053845]/10 text-[#053845] border border-[#053845]/20 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Organizing Facility</p>
              <p className="text-sm font-semibold text-[#053845] mt-0.5">{camp.organizingbloodbank}</p>
              <p className="text-xs text-slate-600 mt-0.5">Organized by {camp.organizername}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Existing Registration Ticket Banner */}
      {existingReg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 sm:p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm sm:text-base font-bold text-emerald-950">
                  Your Registration is Confirmed!
                </h3>
              </div>
              <p className="text-xs text-emerald-800">
                Present this reference code when you arrive at the camp registration desk.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs font-semibold text-slate-600">Reference:</span>
                <span className="font-mono text-sm font-bold text-[#053845] bg-white px-3 py-1 rounded-lg border border-emerald-200">
                  {existingReg.registrationreference}
                </span>
                <button
                  onClick={() => handleCopyReference(existingReg.registrationreference)}
                  className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-100 rounded-lg transition cursor-pointer"
                  title="Copy Reference"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {copiedRef && <span className="text-xs text-emerald-700 font-semibold">Copied!</span>}
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Link
                href="/donor/my-camps"
                className="w-full sm:w-auto text-center px-4 py-2 bg-[#317786] hover:bg-[#245964] text-white text-xs font-semibold rounded-xl transition shadow-2xs"
              >
                Manage My Registrations
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Walk-in or Advance Registration Action Card */}
      {!existingReg && (
        <>
          {!camp.isregistrationrequired ? (
            /* Walk-in Camp Guide Card */
            <div className="bg-white border border-[#F3E9D1] rounded-2xl p-5 sm:p-6 shadow-2xs">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-[#317786]/10 text-[#317786] border border-[#317786]/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-serif text-base font-bold text-[#053845]">
                    Walk-in Donors Welcome – No Advance Registration Needed
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    This blood donation camp does not require advance slot booking. All eligible voluntary donors are invited to walk in directly at the venue during camp operating hours. Please bring a valid government-issued photo identity proof (Aadhaar, Voter ID, Driving License, or Passport).
                  </p>
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#317786] hover:bg-[#245964] text-white text-xs font-semibold rounded-xl transition shadow-2xs"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Get Venue Directions
                    </a>
                    {camp.contactphone && (
                      <a
                        href={`tel:${camp.contactphone}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#F3E9D1] text-[#053845] text-xs font-semibold rounded-xl hover:bg-[#FAF6EE] transition shadow-2xs"
                      >
                        <Phone className="w-3.5 h-3.5 text-[#317786]" />
                        Call Organizer ({camp.contactphone})
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Registration Required Card */
            <div className="bg-white border border-[#F3E9D1] rounded-2xl p-5 sm:p-6 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-base font-bold text-[#053845]">
                    Camp Slot Reservation
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                    {camp.maxcapacity ? (
                      <span>
                        Capacity: <strong className="text-[#053845]">{camp.registeredcount}</strong> / {camp.maxcapacity} registered
                        {camp.remainingcapacity !== null && (
                          <span className="text-emerald-700 font-semibold ml-1">
                            ({camp.remainingcapacity} slots remaining)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span>
                        Registered: <strong className="text-[#053845]">{camp.registeredcount}</strong> donors
                      </span>
                    )}

                    {camp.registrationdeadline && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-[#317786]" />
                        Deadline: {new Date(camp.registrationdeadline).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {camp.isregistrationopen ? (
                    <button
                      onClick={() => setShowRegisterModal(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#317786] hover:bg-[#245964] text-white font-semibold text-xs sm:text-sm rounded-xl transition shadow-2xs cursor-pointer"
                    >
                      <CalendarCheck className="w-4 h-4" />
                      Register to Donate
                    </button>
                  ) : (
                    <button
                      disabled
                      className="px-5 py-2.5 bg-slate-100 text-slate-400 font-semibold text-xs sm:text-sm rounded-xl cursor-not-allowed border border-slate-200"
                    >
                      {isFull ? "Slots Full" : "Registration Closed"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Two Column Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left Column: Instructions and Notes (2 cols) */}
        <div className="md:col-span-2 space-y-5">
          {/* Donor Instructions */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-[#053845] font-serif font-bold text-base">
              <Info className="w-5 h-5 text-[#317786]" />
              <h3>Donor Guidelines & Preparation</h3>
            </div>
            {camp.donorinstructions ? (
              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                {camp.donorinstructions}
              </p>
            ) : (
              <ul className="text-xs text-slate-600 space-y-2 list-disc pl-5 leading-relaxed">
                <li>Get a good night’s rest (at least 6 hours of sleep) before donating.</li>
                <li>Drink plenty of water and have a healthy, non-fatty meal 2-3 hours before visiting.</li>
                <li>Avoid alcohol consumption for at least 24 hours prior to donation.</li>
                <li>Avoid smoking for at least 2 hours before and after blood donation.</li>
                <li>Bring a valid government-issued photo ID (Aadhaar Card, Driving License, Voter ID, or Passport).</li>
              </ul>
            )}
          </div>

          {/* Registration Instructions & Eligibility */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-[#053845] font-serif font-bold text-base">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3>Eligibility Criteria</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#FAF6EE]/60 rounded-xl border border-[#F3E9D1]">
                <p className="font-semibold text-[#053845]">Age & Weight</p>
                <p className="text-slate-600 mt-1">18 – 65 years old, minimum body weight 45 kg.</p>
              </div>
              <div className="p-3 bg-[#FAF6EE]/60 rounded-xl border border-[#F3E9D1]">
                <p className="font-semibold text-[#053845]">Donation Frequency</p>
                <p className="text-slate-600 mt-1">At least 90 days since last whole blood donation (120 days for females).</p>
              </div>
              <div className="p-3 bg-[#FAF6EE]/60 rounded-xl border border-[#F3E9D1]">
                <p className="font-semibold text-[#053845]">Hemoglobin Level</p>
                <p className="text-slate-600 mt-1">Minimum 12.5 g/dL (will be tested on-site by medical staff).</p>
              </div>
              <div className="p-3 bg-[#FAF6EE]/60 rounded-xl border border-[#F3E9D1]">
                <p className="font-semibold text-[#053845]">Health Condition</p>
                <p className="text-slate-600 mt-1">Free from active infection, fever, or antibiotic treatment in past 14 days.</p>
              </div>
            </div>

            {camp.eligibilitynotes && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <p className="font-semibold mb-1">Organizer Specific Eligibility Note:</p>
                <p className="leading-relaxed">{camp.eligibilitynotes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Venue and Contact Info */}
        <div className="space-y-5">
          {/* Venue & Location */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-4">
            <h3 className="font-serif font-bold text-[#053845] text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#317786]" />
              Venue & Address
            </h3>

            <div className="space-y-1 text-xs text-slate-600">
              <p className="font-semibold text-[#053845] text-sm">{camp.venuename}</p>
              <p className="leading-relaxed">{camp.address}</p>
              <p>
                {camp.city}, {camp.district ? `${camp.district}, ` : ""}{camp.state} - {camp.pincode}
              </p>
            </div>

            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#FAF6EE] hover:bg-[#F3E9D1]/50 text-[#053845] border border-[#F3E9D1] text-xs font-semibold rounded-xl transition shadow-2xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in Google Maps
            </a>
          </div>

          {/* Organizer & Support Contacts */}
          <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-2xs space-y-4">
            <h3 className="font-serif font-bold text-[#053845] text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-[#317786]" />
              Organizer Contacts
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <p className="text-slate-500 font-medium">Camp Coordinator</p>
                <p className="font-semibold text-[#053845] mt-0.5">{camp.contactperson}</p>
              </div>

              {camp.contactphone && (
                <div>
                  <p className="text-slate-500 font-medium">Phone Support</p>
                  <a
                    href={`tel:${camp.contactphone}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#317786] hover:text-[#245964] mt-0.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {camp.contactphone}
                  </a>
                </div>
              )}

              <div>
                <p className="text-slate-500 font-medium">Licensed Blood Bank</p>
                <p className="font-semibold text-[#053845] mt-0.5">{camp.organizingbloodbank}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Registration Confirmation Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-[#F3E9D1] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {successReference ? (
              /* Success confirmation view */
              <div className="p-6 sm:p-8 text-center space-y-4">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-bold text-[#053845]">
                    Registration Confirmed!
                  </h3>
                  <p className="text-xs text-slate-600">
                    You have successfully reserved your slot for <strong>{camp.campname}</strong>.
                  </p>
                </div>

                <div className="p-4 bg-[#FAF6EE] rounded-2xl border border-[#F3E9D1] space-y-2">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                    Your Registration Reference
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-base font-bold text-[#053845] bg-white px-3 py-1.5 rounded-xl border border-[#F3E9D1]">
                      {successReference}
                    </span>
                    <button
                      onClick={() => handleCopyReference(successReference)}
                      className="p-2 text-slate-600 hover:text-[#317786] hover:bg-white rounded-lg transition cursor-pointer"
                      title="Copy Reference"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  {copiedRef && <p className="text-xs text-emerald-700 font-semibold">Copied to clipboard!</p>}
                  <p className="text-[11px] text-slate-500">
                    Please take a screenshot or note this reference number for check-in at the camp venue.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <Link
                    href="/donor/my-camps"
                    className="w-full text-center px-4 py-2.5 bg-[#317786] hover:bg-[#245964] text-white font-semibold text-xs rounded-xl transition shadow-2xs"
                  >
                    View in My Registrations
                  </Link>
                  <button
                    onClick={() => {
                      setShowRegisterModal(false);
                      setSuccessReference(null);
                    }}
                    className="w-full text-center px-4 py-2.5 bg-[#FAF6EE] hover:bg-[#F3E9D1]/50 text-[#053845] border border-[#F3E9D1] font-semibold text-xs rounded-xl transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              /* Registration Form / Declaration view */
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#317786]/10 text-[#317786] border border-[#317786]/20 flex items-center justify-center">
                      <Tent className="w-4 h-4" />
                    </div>
                    <h3 className="font-serif text-base font-bold text-[#053845]">Confirm Camp Registration</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowRegisterModal(false);
                      setRegisterError(null);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {registerError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <span>{registerError}</span>
                  </div>
                )}

                {/* Summary */}
                <div className="p-3.5 bg-[#FAF6EE]/70 rounded-xl border border-[#F3E9D1] space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Camp:</span>
                    <span className="font-semibold text-[#053845]">{camp.campname}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date:</span>
                    <span className="font-semibold text-[#053845]">{campDateFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Time:</span>
                    <span className="font-semibold text-[#053845]">{camp.starttime} – {camp.endtime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Venue:</span>
                    <span className="font-semibold text-[#053845] text-right truncate max-w-[220px]">
                      {camp.venuename}, {camp.city}
                    </span>
                  </div>
                </div>

                {/* Mandatory Donor Declaration Checkbox */}
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 bg-[#FAF6EE] border border-[#F3E9D1] rounded-xl cursor-pointer hover:bg-[#F3E9D1]/30 transition">
                    <input
                      type="checkbox"
                      checked={declarationChecked}
                      onChange={(e) => setDeclarationChecked(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#317786] focus:ring-[#317786]"
                    />
                    <div className="text-xs text-slate-700 space-y-0.5">
                      <p className="font-semibold text-[#053845]">
                        Voluntary Donor Self-Declaration & Consent
                      </p>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        I confirm that I am between 18 and 65 years old, weigh at least 45 kg, am in good health, have not donated blood in the last 90 days, have no infectious diseases, and commit to attending this scheduled camp.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRegisterModal(false);
                      setRegisterError(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-[#FAF6EE] border border-[#F3E9D1] rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isRegistering || !declarationChecked}
                    onClick={handleConfirmRegistration}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#317786] hover:bg-[#245964] disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs rounded-xl transition shadow-2xs cursor-pointer"
                  >
                    {isRegistering && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm Registration
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
