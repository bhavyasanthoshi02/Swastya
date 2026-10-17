"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Droplet,
  Building2,
  ShieldCheck,
  ChevronLeft,
  ArrowRight,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  MapPin,
  Calendar,
  User,
  Phone,
  FileText,
  AlertTriangle,
  Plus,
  Minus,
} from "lucide-react";
import { api, CreateBloodRequestDto } from "@/lib/api";
import { AuthHospital } from "@/lib/auth";

// Blood Group configurations
const BLOOD_GROUPS = [
  { value: "A_POSITIVE", label: "A+" },
  { value: "A_NEGATIVE", label: "A-" },
  { value: "B_POSITIVE", label: "B+" },
  { value: "B_NEGATIVE", label: "B-" },
  { value: "AB_POSITIVE", label: "AB+" },
  { value: "AB_NEGATIVE", label: "AB-" },
  { value: "O_POSITIVE", label: "O+" },
  { value: "O_NEGATIVE", label: "O-" },
];

// Blood Component configurations
const BLOOD_COMPONENTS = [
  {
    value: "WHOLE_BLOOD",
    label: "Whole Blood",
    desc: "Standard 450ml transfusion for trauma, acute hemorrhage, or surgical care.",
  },
  {
    value: "PLATELETS",
    label: "Platelets (PRP/SDP)",
    desc: "Platelet concentrate for thrombocytopenia, dengue, or oncology patients.",
  },
  {
    value: "PLASMA",
    label: "Fresh Frozen Plasma (FFP)",
    desc: "Coagulation factors for acute coagulopathy, liver disease, or severe burns.",
  },
  {
    value: "RBC",
    label: "Packed Red Blood Cells (PRBC)",
    desc: "Concentrated erythrocytes for severe anemia, hematology, or ICU care.",
  },
];

// Urgency levels
const URGENCY_LEVELS = [
  {
    value: "CRITICAL",
    label: "Critical Emergency",
    subtext: "Immediate life-saving requirement. Broadcasts high-priority alerts.",
    badgeClass: "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/30",
    color: "#A2363A",
  },
  {
    value: "HIGH",
    label: "Urgent Requisition",
    subtext: "Required within 12 - 24 hours. Surgery, acute admission, or trauma care.",
    badgeClass: "bg-[#f9eee9] text-[#B94F30] border-[#B94F30]/30",
    color: "#B94F30",
  },
  {
    value: "MEDIUM",
    label: "Priority Case",
    subtext: "Required within 24 - 48 hours for scheduled procedures or chemotherapy.",
    badgeClass: "bg-[#e8f3f5] text-[#317786] border-[#317786]/30",
    color: "#317786",
  },
  {
    value: "LOW",
    label: "Standard / Planned",
    subtext: "Elective procedures or planned surgical reserve requirement.",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    color: "#64748b",
  },
];

const SEARCH_RADII = [5, 10, 15, 25, 50];

export default function HospitalNewBloodRequestPage() {
  const router = useRouter();

  // Authenticated Hospital State
  const [hospital, setHospital] = useState<AuthHospital | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Form Field States
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState<"MALE" | "FEMALE" | "OTHER" | "">("");
  const [patientContact, setPatientContact] = useState("");

  const [bloodGroup, setBloodGroup] = useState("");
  const [bloodComponent, setBloodComponent] = useState("WHOLE_BLOOD");
  const [unitsRequired, setUnitsRequired] = useState(1);

  const [urgencyLevel, setUrgencyLevel] = useState("HIGH");
  const [isEmergency, setIsEmergency] = useState(false);
  const [searchRadius, setSearchRadius] = useState(15);

  // Quick preset for required date & time (default 4 hours from now)
  const getInitialDateTime = (hoursFromNow = 4) => {
    const d = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return { date: dateStr, time: `${hours}:${minutes}` };
  };

  const initial = getInitialDateTime(4);
  const [requiredByDate, setRequiredByDate] = useState(initial.date);
  const [requiredByTime, setRequiredByTime] = useState(initial.time);

  // Hospital Specific Clinical Notes
  const [wardRoom, setWardRoom] = useState("");
  const [attendingDoctor, setAttendingDoctor] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");

  // Validation & UI State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch hospital profile to confirm identity
  useEffect(() => {
    async function loadHospital() {
      try {
        const res = await api.hospital.getProfile();
        if (res.success && res.hospital) {
          setHospital(res.hospital);
        }
      } catch (err: any) {
        setSubmitError(err?.message || "Failed to load hospital profile credentials.");
      } finally {
        setIsLoadingProfile(false);
      }
    }
    loadHospital();
  }, []);

  // Sync Emergency flag with Critical Urgency
  const handleUrgencyChange = (val: string) => {
    setUrgencyLevel(val);
    if (val === "CRITICAL") {
      setIsEmergency(true);
    }
  };

  // Preset time setter
  const applyTimePreset = (hours: number) => {
    const preset = getInitialDateTime(hours);
    setRequiredByDate(preset.date);
    setRequiredByTime(preset.time);
  };

  // Field validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!patientName.trim()) {
      errs.patientName = "Patient name is required";
    } else if (patientName.trim().length < 2) {
      errs.patientName = "Patient name must be at least 2 characters";
    } else if (patientName.trim().length > 100) {
      errs.patientName = "Patient name cannot exceed 100 characters";
    }

    const ageNum = parseInt(patientAge, 10);
    if (!patientAge || isNaN(ageNum)) {
      errs.patientAge = "Patient age is required";
    } else if (ageNum <= 0 || ageNum > 125) {
      errs.patientAge = "Age must be between 1 and 125";
    }

    if (!patientGender) {
      errs.patientGender = "Patient gender is required";
    }

    const cleanContact = patientContact.trim().replace(/[\s-]/g, "");
    if (!cleanContact) {
      errs.patientContact = "Contact phone number is required";
    } else if (!/^[0-9+]{10,15}$/.test(cleanContact)) {
      errs.patientContact = "Enter a valid phone number (10 to 15 digits)";
    }

    if (!bloodGroup) {
      errs.bloodGroup = "Please select the required blood group";
    }

    if (!bloodComponent) {
      errs.bloodComponent = "Please select blood component";
    }

    if (!unitsRequired || unitsRequired < 1 || unitsRequired > 100) {
      errs.unitsRequired = "Units required must be between 1 and 100";
    }

    if (!requiredByDate) {
      errs.requiredByDate = "Required-by date is required";
    }
    if (!requiredByTime) {
      errs.requiredByTime = "Required-by time is required";
    }

    if (requiredByDate && requiredByTime) {
      const selectedDt = new Date(`${requiredByDate}T${requiredByTime}:00`);
      if (isNaN(selectedDt.getTime())) {
        errs.requiredByDate = "Invalid date and time";
      } else if (selectedDt.getTime() < Date.now() - 5 * 60 * 1000) {
        errs.requiredByDate = "Required date and time cannot be in the past";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (validate()) {
      setShowReviewModal(true);
    } else {
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey) {
        const el = document.getElementById(firstErrorKey);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const handleFinalSubmit = async () => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const requiredDateTime = new Date(`${requiredByDate}T${requiredByTime}:00`);

      // Assemble structured clinical notes
      const notesParts: string[] = [];
      if (hospital?.hospitalname) {
        notesParts.push(`Hospital Facility: ${hospital.hospitalname} (${hospital.city || "Direct Entry"})`);
      }
      if (wardRoom.trim()) {
        notesParts.push(`Ward / Room / Bed: ${wardRoom.trim()}`);
      }
      if (attendingDoctor.trim()) {
        notesParts.push(`Attending Doctor: ${attendingDoctor.trim()}`);
      }
      if (clinicalNotes.trim()) {
        notesParts.push(`Clinical Instructions: ${clinicalNotes.trim()}`);
      }

      const finalNotes = notesParts.join(" | ");

      const payload: CreateBloodRequestDto = {
        patientname: patientName.trim(),
        patientage: parseInt(patientAge, 10),
        patientgender: patientGender,
        patientcontact: patientContact.trim(),
        bloodgroup: bloodGroup,
        bloodcomponent: bloodComponent,
        unitsrequired: unitsRequired,
        urgencylevel: urgencyLevel,
        isemergency: isEmergency,
        searchradius: searchRadius,
        requiredby: requiredDateTime.toISOString(),
        notes: finalNotes || undefined,
      };

      const res = await api.hospital.createBloodRequest(payload);

      if (res && res.requestid) {
        router.push(`/hospital/requests/${res.requestid}`);
      } else {
        throw new Error("Invalid response received from blood request service");
      }
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to create blood request. Please check inputs and try again.");
      setShowReviewModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading hospital authorization profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-16">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link
          href="/hospital/requests"
          className="hover:text-[#053845] transition-colors inline-flex items-center gap-1 font-semibold"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Assigned Requisitions</span>
        </Link>
        <span>/</span>
        <span className="font-semibold text-slate-800">Direct Facility Requisition</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[10px] tracking-wider uppercase font-bold text-[#317786] bg-[#e8f3f5] border border-[#317786]/30 px-2.5 py-0.5 rounded-full">
              Hospital Sourced
            </span>
            <span className="text-[10px] tracking-wider uppercase font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              Direct Clinical Dispatch
            </span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Create Hospital Blood Request
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Register an official clinical blood request under{" "}
            <strong className="text-slate-700 font-semibold">{hospital?.hospitalname || "this hospital facility"}</strong>.
          </p>
        </div>

        {/* Facility Credentials Pill */}
        <div className="flex items-center gap-2 bg-[#FAF6EE] border border-[#F3E9D1] rounded-xl px-3 py-2 text-xs shrink-0">
          <Building2 className="w-4 h-4 text-[#317786] shrink-0" />
          <div className="text-left">
            <span className="block font-bold text-[#053845] text-xs truncate max-w-[200px]">
              {hospital?.hospitalname || "Registered Facility"}
            </span>
            <span className="block text-[10px] text-slate-500 font-mono">
              {hospital?.registrationnumber || "LIC-ACTIVE"} &bull; {hospital?.city || "Regional Network"}
            </span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {submitError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold">Requisition Submission Error:</strong> {submitError}
          </div>
        </div>
      )}

      {/* Creation Form */}
      <form onSubmit={handleReview} className="space-y-6">
        {/* SECTION 1: PATIENT DEMOGRAPHICS */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
              <User className="w-4 h-4 text-[#317786]" />
              <span>1. Patient Demographics & Identification</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">* Required for clinical matching</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Patient Name */}
            <div className="sm:col-span-2" id="patientName">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Patient Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => {
                  setPatientName(e.target.value);
                  if (errors.patientName) setErrors({ ...errors, patientName: "" });
                }}
                placeholder="e.g. Ramesh Chandra Verma"
                className={`w-full px-3 py-2 text-xs rounded-xl border bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.patientName
                    ? "border-rose-300 ring-2 ring-rose-100 text-rose-900"
                    : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20 text-slate-800"
                }`}
              />
              {errors.patientName && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.patientName}</p>
              )}
            </div>

            {/* Patient Age */}
            <div id="patientAge">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Age (Years) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="125"
                value={patientAge}
                onChange={(e) => {
                  setPatientAge(e.target.value);
                  if (errors.patientAge) setErrors({ ...errors, patientAge: "" });
                }}
                placeholder="e.g. 42"
                className={`w-full px-3 py-2 text-xs rounded-xl border bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.patientAge
                    ? "border-rose-300 ring-2 ring-rose-100 text-rose-900"
                    : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20 text-slate-800"
                }`}
              />
              {errors.patientAge && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.patientAge}</p>
              )}
            </div>

            {/* Patient Gender */}
            <div id="patientGender">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Gender <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(["MALE", "FEMALE", "OTHER"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setPatientGender(g);
                      if (errors.patientGender) setErrors({ ...errors, patientGender: "" });
                    }}
                    className={`py-2 text-[11px] font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                      patientGender === g
                        ? "bg-[#053845] text-white border-[#053845] shadow-2xs font-bold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-[#FAF6EE]"
                    }`}
                  >
                    {g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : "Other"}
                  </button>
                ))}
              </div>
              {errors.patientGender && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.patientGender}</p>
              )}
            </div>

            {/* Contact Number */}
            <div className="sm:col-span-2" id="patientContact">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Patient / Attendant Phone <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={patientContact}
                  onChange={(e) => {
                    setPatientContact(e.target.value);
                    if (errors.patientContact) setErrors({ ...errors, patientContact: "" });
                  }}
                  placeholder="e.g. +91 98765 43210"
                  className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                    errors.patientContact
                      ? "border-rose-300 ring-2 ring-rose-100 text-rose-900"
                      : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20 text-slate-800"
                  }`}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Protected by strict clinical privacy controls; only revealed upon verified volunteer response.
              </p>
              {errors.patientContact && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.patientContact}</p>
              )}
            </div>

            {/* Ward / Room / Bed */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ward / Room / Bed (Optional)
              </label>
              <input
                type="text"
                value={wardRoom}
                onChange={(e) => setWardRoom(e.target.value)}
                placeholder="e.g. ICU-3 Bed 14 / Cardiology Ward 2B"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: BLOOD REQUIREMENTS */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
              <Droplet className="w-4 h-4 text-[#B94F30]" />
              <span>2. Transfusion Requisition Details</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">* Select specific blood group & component</span>
          </div>

          {/* Blood Group Selector */}
          <div id="bloodGroup">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Required Blood Group <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {BLOOD_GROUPS.map((bg) => (
                <button
                  key={bg.value}
                  type="button"
                  onClick={() => {
                    setBloodGroup(bg.value);
                    if (errors.bloodGroup) setErrors({ ...errors, bloodGroup: "" });
                  }}
                  className={`py-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    bloodGroup === bg.value
                      ? "bg-[#053845] text-white border-[#053845] shadow-xs ring-2 ring-[#053845]/20 font-bold scale-[1.02]"
                      : "bg-[#FAF6EE]/60 text-slate-800 border-[#F3E9D1] hover:bg-[#FAF6EE] hover:border-[#317786]"
                  }`}
                >
                  <span className="text-sm font-bold font-serif">{bg.label}</span>
                  <span className="text-[9px] opacity-70">ABO Rh</span>
                </button>
              ))}
            </div>
            {errors.bloodGroup && (
              <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.bloodGroup}</p>
            )}
          </div>

          {/* Blood Component Selector */}
          <div id="bloodComponent">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Blood Component <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BLOOD_COMPONENTS.map((comp) => (
                <button
                  key={comp.value}
                  type="button"
                  onClick={() => setBloodComponent(comp.value)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    bloodComponent === comp.value
                      ? "bg-[#e8f3f5] border-[#317786] shadow-2xs ring-1 ring-[#317786]"
                      : "bg-white border-slate-200 hover:bg-[#FAF6EE]/70 hover:border-slate-300"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border ${
                      bloodComponent === comp.value
                        ? "bg-[#317786] border-[#317786] text-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {bloodComponent === comp.value && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#053845]">{comp.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      {comp.desc}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Units Required Stepper */}
          <div id="unitsRequired" className="pt-2">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Units Required <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-[#FAF6EE]/50 p-1">
                <button
                  type="button"
                  onClick={() => setUnitsRequired(Math.max(1, unitsRequired - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
                  disabled={unitsRequired <= 1}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-12 text-center text-sm font-bold text-[#053845] font-serif">
                  {unitsRequired}
                </span>
                <button
                  type="button"
                  onClick={() => setUnitsRequired(Math.min(100, unitsRequired + 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer"
                  disabled={unitsRequired >= 100}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 6].map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnitsRequired(u)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      unitsRequired === u
                        ? "bg-[#053845] text-white border-[#053845]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-[#FAF6EE]"
                    }`}
                  >
                    {u} {u === 1 ? "unit" : "units"}
                  </button>
                ))}
              </div>
            </div>
            {errors.unitsRequired && (
              <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{errors.unitsRequired}</p>
            )}
          </div>
        </div>

        {/* SECTION 3: URGENCY & SCHEDULE */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#317786]" />
              <span>3. Clinical Urgency & Schedule</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">* Set priority & required-by timeframe</span>
          </div>

          {/* Urgency Level Cards */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Clinical Urgency Level <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {URGENCY_LEVELS.map((lvl) => (
                <button
                  key={lvl.value}
                  type="button"
                  onClick={() => handleUrgencyChange(lvl.value)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    urgencyLevel === lvl.value
                      ? `${lvl.badgeClass} ring-2 ring-current font-semibold shadow-xs`
                      : "bg-white border-slate-200 text-slate-700 hover:bg-[#FAF6EE]/60"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold">{lvl.label}</span>
                    {urgencyLevel === lvl.value && (
                      <span className="w-2 h-2 rounded-full bg-current" />
                    )}
                  </div>
                  <span className="text-[11px] opacity-80 leading-relaxed">{lvl.subtext}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emergency Override Toggle */}
          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/60 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="block text-xs font-bold text-amber-900">Emergency Protocol Flag</span>
                <span className="block text-[11px] text-amber-700">
                  Activates immediate rapid notifications to compatible verified donors within proximity.
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#B94F30]"></div>
            </label>
          </div>

          {/* Required By Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div id="requiredByDate">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Required By Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={requiredByDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setRequiredByDate(e.target.value);
                  if (errors.requiredByDate) setErrors({ ...errors, requiredByDate: "" });
                }}
                className={`w-full px-3 py-2 text-xs rounded-xl border bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.requiredByDate
                    ? "border-rose-300 ring-2 ring-rose-100 text-rose-900"
                    : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20 text-slate-800"
                }`}
              />
              {errors.requiredByDate && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.requiredByDate}</p>
              )}
            </div>

            <div id="requiredByTime">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Required By Time <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={requiredByTime}
                onChange={(e) => {
                  setRequiredByTime(e.target.value);
                  if (errors.requiredByTime) setErrors({ ...errors, requiredByTime: "" });
                }}
                className={`w-full px-3 py-2 text-xs rounded-xl border bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.requiredByTime
                    ? "border-rose-300 ring-2 ring-rose-100 text-rose-900"
                    : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20 text-slate-800"
                }`}
              />
              {errors.requiredByTime && (
                <p className="text-[11px] text-rose-600 mt-1 font-medium">{errors.requiredByTime}</p>
              )}
            </div>
          </div>

          {/* Quick Schedule Presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-500 font-medium mr-1">Quick Presets:</span>
            <button
              type="button"
              onClick={() => applyTimePreset(2)}
              className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
            >
              +2 Hours (Immediate)
            </button>
            <button
              type="button"
              onClick={() => applyTimePreset(4)}
              className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
            >
              +4 Hours (Standard Urgent)
            </button>
            <button
              type="button"
              onClick={() => applyTimePreset(12)}
              className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
            >
              +12 Hours (Next Shift)
            </button>
            <button
              type="button"
              onClick={() => applyTimePreset(24)}
              className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
            >
              +24 Hours (Tomorrow)
            </button>
          </div>

          {/* Search Radius */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Donor Search Radius
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {SEARCH_RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSearchRadius(r)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    searchRadius === r
                      ? "bg-[#053845] text-white border-[#053845] shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-[#FAF6EE]"
                  }`}
                >
                  {r} km
                </button>
              ))}
              <span className="text-[11px] text-slate-400 ml-1">
                (Radius around {hospital?.city || "hospital location"})
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 4: CLINICAL NOTES & DOCTOR DETAILS */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#317786]" />
              <span>4. Clinical Notes & Attending Physician</span>
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">Diagnostic context</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attending Physician / Surgeon
              </label>
              <input
                type="text"
                value={attendingDoctor}
                onChange={(e) => setAttendingDoctor(e.target.value)}
                placeholder="e.g. Dr. Ananya Sharma (Cardiothoracic)"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Indication / Diagnosis
              </label>
              <input
                type="text"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="e.g. Pre-operative CABG surgery reserve / Acute G.I. bleeding"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-[#FAF6EE]/40 focus:bg-white focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Form Submission Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <Link
            href="/hospital/requests"
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 transition-colors text-center"
          >
            Cancel & Return
          </Link>

          <button
            type="submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-md cursor-pointer"
          >
            <span>Review Requisition Details</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* REVIEW & CONFIRMATION MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#B94F30]">
                  <Droplet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-[#053845]">
                    Confirm Blood Requisition
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Verify clinical particulars before broadcasting to donors
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold p-1"
                disabled={isSubmitting}
              >
                &times;
              </button>
            </div>

            {/* Summary Grid */}
            <div className="bg-[#FAF6EE]/70 rounded-xl p-4 border border-[#F3E9D1] space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-[#F3E9D1]/60 pb-2">
                <span className="text-slate-500">Facility:</span>
                <span className="font-bold text-[#053845]">{hospital?.hospitalname || "Hospital Facility"}</span>
              </div>

              <div className="flex items-center justify-between border-b border-[#F3E9D1]/60 pb-2">
                <span className="text-slate-500">Patient:</span>
                <span className="font-semibold text-slate-800">
                  {patientName} ({patientAge} yrs, {patientGender})
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-[#F3E9D1]/60 pb-2">
                <span className="text-slate-500">Required Group:</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white border border-[#F3E9D1] text-[#B94F30]">
                  {bloodGroup.replace("_", "+").replace("POSITIVE", "+").replace("NEGATIVE", "-")}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-[#F3E9D1]/60 pb-2">
                <span className="text-slate-500">Component & Units:</span>
                <span className="font-semibold text-slate-800">
                  {unitsRequired} unit(s) of {bloodComponent.replace(/_/g, " ")}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-[#F3E9D1]/60 pb-2">
                <span className="text-slate-500">Urgency Level:</span>
                <span className="font-bold text-rose-700 uppercase">
                  {urgencyLevel} {isEmergency && "(Emergency Flag Active)"}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-[#F3E9D1]/60 pb-2">
                <span className="text-slate-500">Required By:</span>
                <span className="font-semibold text-slate-800">
                  {requiredByDate} at {requiredByTime}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500">Search Radius:</span>
                <span className="font-semibold text-slate-800">{searchRadius} km regional radius</span>
              </div>
            </div>

            {/* Clinical Warning */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                By confirming, this requisition will immediately appear on the Swastya donor network. Compatible donors in your regional search radius will be eligible to volunteer.
              </span>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Modify Form
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Broadcasting Requisition...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm & Broadcast Requisition</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
