"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Droplet,
  AlertCircle,
  CheckCircle2,
  Building2,
  ShieldCheck,
  ChevronLeft,
  ArrowRight,
  Loader2,
  Check,
} from "lucide-react";
import { api, CreateBloodRequestDto, HospitalItem } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
} from "@/lib/mappers";

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
    desc: "Standard 450ml transfusion for trauma, acute blood loss, or surgery.",
  },
  {
    value: "PLATELETS",
    label: "Platelets (PRP/SDP)",
    desc: "Single donor or random platelets for dengue, chemotherapy, or bleeding disorders.",
  },
  {
    value: "PLASMA",
    label: "Fresh Frozen Plasma (FFP)",
    desc: "Coagulation factors for liver disorders, shock, or severe burns.",
  },
  {
    value: "RBC",
    label: "Packed Red Blood Cells (PRBC)",
    desc: "Concentrated RBCs for severe anemia, hematology care, or cardiac surgeries.",
  },
];

// Urgency levels
const URGENCY_LEVELS = [
  {
    value: "CRITICAL",
    label: "Critical Emergency",
    subtext: "Immediate life threat. Bypasses cooldown queues & alerts regional coordinators.",
    badgeClass: "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/30",
    color: "#A2363A",
  },
  {
    value: "HIGH",
    label: "Urgent Requisition",
    subtext: "Required within 12 - 24 hours. Surgery, ICU admission, or trauma care.",
    badgeClass: "bg-[#f9eee9] text-[#B94F30] border-[#B94F30]/30",
    color: "#B94F30",
  },
  {
    value: "MEDIUM",
    label: "Priority Case",
    subtext: "Required within 24 - 48 hours for scheduled transfusions or chemotherapy.",
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

export default function NewBloodRequestPage() {
  const router = useRouter();

  // Registered hospitals fetched from backend
  const [hospitals, setHospitals] = useState<HospitalItem[]>([]);
  const [isLoadingHospitals, setIsLoadingHospitals] = useState(true);

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

  // Calculate default required date & time (4 hours from now)
  const getInitialDateTime = () => {
    const d = new Date(Date.now() + 4 * 3600 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return { date: dateStr, time: `${hours}:${minutes}` };
  };

  const initial = getInitialDateTime();
  const [requiredByDate, setRequiredByDate] = useState(initial.date);
  const [requiredByTime, setRequiredByTime] = useState(initial.time);

  // Hospital & Location States
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [hospitalNameManual, setHospitalNameManual] = useState("");
  const [hospitalLocationManual, setHospitalLocationManual] = useState("");
  const [notes, setNotes] = useState("");

  // Validation & UI State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdSuccess, setCreatedSuccess] = useState<{
    requestId: string;
    patientName: string;
  } | null>(null);

  // Fetch registered hospitals on mount
  useEffect(() => {
    async function loadHospitals() {
      try {
        const res = await api.hospitals.getAll();
        if (Array.isArray(res)) {
          setHospitals(res);
        }
      } catch {
        // Fallback gracefully; manual entry remains available
      } finally {
        setIsLoadingHospitals(false);
      }
    }
    loadHospitals();
  }, []);

  // Sync Emergency flag with Critical Urgency
  const handleUrgencyChange = (val: string) => {
    setUrgencyLevel(val);
    if (val === "CRITICAL") {
      setIsEmergency(true);
    }
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
    } else if (ageNum < 0 || ageNum > 125) {
      errs.patientAge = "Age must be between 0 and 125";
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

    if (!unitsRequired || unitsRequired < 1 || unitsRequired > 20) {
      errs.unitsRequired = "Units required must be between 1 and 20";
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
      // Scroll to the first error
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

      if (selectedHospitalId === "OTHER" || !selectedHospitalId) {
        if (hospitalNameManual.trim()) {
          notesParts.push(`Facility / Hospital: ${hospitalNameManual.trim()}`);
        }
      } else {
        const matched = hospitals.find((h) => h.hospitalid === selectedHospitalId);
        if (matched) {
          notesParts.push(`Selected Facility: ${matched.hospitalname} (${matched.city})`);
        }
      }

      if (hospitalLocationManual.trim()) {
        notesParts.push(`Ward / Room: ${hospitalLocationManual.trim()}`);
      }

      if (notes.trim()) {
        notesParts.push(`Clinical Instructions: ${notes.trim()}`);
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
        hospitalid:
          selectedHospitalId && selectedHospitalId !== "OTHER"
            ? selectedHospitalId
            : undefined,
      };

      const res = await api.bloodRequests.create(payload);

      if (res && res.requestid) {
        setCreatedSuccess({
          requestId: res.requestid,
          patientName: res.patientname || patientName,
        });
        setShowReviewModal(false);

        // Redirect after a short delay so the user sees the confirmation
        setTimeout(() => {
          router.push(`/requester/dashboard?created=true&requestId=${res.requestid}`);
        }, 1800);
      } else {
        throw new Error("Invalid response received from blood request service");
      }
    } catch (err: any) {
      setSubmitError(
        err?.message ||
          "Failed to submit blood requisition. Please verify clinical inputs and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Requester Dashboard</span>
        </Link>

        <span className="text-[11px] font-semibold text-[#B94F30] bg-[#FAF6EE] border border-[#F3E9D1] px-2.5 py-1 rounded-full uppercase tracking-wider">
          Step 2.6 • Emergency Requisition
        </span>
      </div>

      {/* Main Form Header Banner */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#EFA27E]/10 rounded-full blur-2xl pointer-events-none -mr-16 -mt-16" />
        
        <div className="space-y-2 relative">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#B94F30]/10 border border-[#B94F30]/20 text-[#B94F30] text-[10px] font-bold tracking-wider uppercase">
            <Droplet className="w-3 h-3 fill-current" />
            PATIENT TRANSFUSION REQUISITION
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            Raise a Blood Request
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm max-w-2xl leading-relaxed">
            Submit critical blood component requisitions into the Swastya Clinical Network. Requisitions are instantly cross-matched with certified blood banks and notified to nearby eligible donors.
          </p>
        </div>
      </div>

      {/* Submission Success Banner */}
      {createdSuccess && (
        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-sm space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-bold text-emerald-900">
                Blood Requisition Dispatched Successfully!
              </h3>
              <p className="text-xs sm:text-sm text-emerald-800">
                Requisition <strong>REQ-{createdSuccess.requestId.slice(0, 8).toUpperCase()}</strong> for patient <strong>{createdSuccess.patientName}</strong> has been logged in the clinical register.
              </p>
              <p className="text-xs text-emerald-700">
                Redirecting to your requester coordination dashboard...
              </p>
            </div>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <Link
              href={`/requester/dashboard?created=true&requestId=${createdSuccess.requestId}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white font-semibold text-xs hover:bg-emerald-800 transition-colors shadow-xs"
            >
              <span>Go to Dashboard Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Global Error Banner */}
      {submitError && (
        <div className="p-4 rounded-xl bg-[#fdf2f2] border border-[#A2363A]/30 flex items-start gap-3 text-xs sm:text-sm text-[#A2363A]">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <span className="font-bold block">Submission Error</span>
            <span>{submitError}</span>
          </div>
        </div>
      )}

      {/* The Multi-Section Form */}
      <form onSubmit={handleReview} className="space-y-6" noValidate>
        {/* SECTION 1: Patient Information */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs">
                1
              </div>
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Patient &amp; Attendant Information
                </h2>
                <p className="text-[11px] text-slate-500">
                  Primary clinical identification for the recipient
                </p>
              </div>
            </div>
            <span className="text-[10px] text-rose-500 font-semibold">* Required fields</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Patient Name */}
            <div className="sm:col-span-2 space-y-1.5" id="patientName">
              <label className="block text-xs font-bold text-[#053845]">
                Patient Full Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => {
                    setPatientName(e.target.value);
                    if (errors.patientName) setErrors((prev) => ({ ...prev, patientName: "" }));
                  }}
                  placeholder="e.g., Rajesh Kumar"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm bg-white focus:outline-none transition-all ${
                    errors.patientName
                      ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                      : "border-slate-200 focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                  }`}
                />
              </div>
              {errors.patientName && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.patientName}</span>
                </p>
              )}
            </div>

            {/* Patient Age */}
            <div className="space-y-1.5" id="patientAge">
              <label className="block text-xs font-bold text-[#053845]">
                Patient Age (Years) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="125"
                value={patientAge}
                onChange={(e) => {
                  setPatientAge(e.target.value);
                  if (errors.patientAge) setErrors((prev) => ({ ...prev, patientAge: "" }));
                }}
                placeholder="e.g., 42"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm bg-white focus:outline-none transition-all ${
                  errors.patientAge
                    ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                    : "border-slate-200 focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                }`}
              />
              {errors.patientAge && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.patientAge}</span>
                </p>
              )}
            </div>

            {/* Patient Gender */}
            <div className="space-y-1.5" id="patientGender">
              <label className="block text-xs font-bold text-[#053845]">
                Patient Gender <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["MALE", "FEMALE", "OTHER"] as const).map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => {
                      setPatientGender(g);
                      if (errors.patientGender) setErrors((prev) => ({ ...prev, patientGender: "" }));
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      patientGender === g
                        ? "bg-[#317786] text-white border-[#317786] shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : "Other"}
                  </button>
                ))}
              </div>
              {errors.patientGender && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.patientGender}</span>
                </p>
              )}
            </div>

            {/* Primary Contact Number */}
            <div className="sm:col-span-2 space-y-1.5" id="patientContact">
              <label className="block text-xs font-bold text-[#053845]">
                Emergency Attendant / Patient Contact Phone <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={patientContact}
                  onChange={(e) => {
                    setPatientContact(e.target.value);
                    if (errors.patientContact) setErrors((prev) => ({ ...prev, patientContact: "" }));
                  }}
                  placeholder="e.g., 9876543210"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm bg-white focus:outline-none transition-all ${
                    errors.patientContact
                      ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                      : "border-slate-200 focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                  }`}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Hospital coordinators and certified donor dispatch desks will reach this contact to coordinate transfusion.
              </p>
              {errors.patientContact && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.patientContact}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 2: Blood Requisition Details */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#B94F30]/10 text-[#B94F30] flex items-center justify-center font-bold text-xs">
                2
              </div>
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Blood Specification &amp; Transfusion Units
                </h2>
                <p className="text-[11px] text-slate-500">
                  Exact blood group and component verified by attending clinician
                </p>
              </div>
            </div>
          </div>

          {/* Blood Group Picker */}
          <div className="space-y-2" id="bloodGroup">
            <label className="block text-xs font-bold text-[#053845]">
              Select Required Blood Group <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {BLOOD_GROUPS.map((bg) => {
                const isSelected = bloodGroup === bg.value;
                return (
                  <button
                    type="button"
                    key={bg.value}
                    onClick={() => {
                      setBloodGroup(bg.value);
                      if (errors.bloodGroup) setErrors((prev) => ({ ...prev, bloodGroup: "" }));
                    }}
                    className={`h-12 rounded-xl flex flex-col items-center justify-center font-serif text-base font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#B94F30] text-white border-[#B94F30] shadow-sm scale-102"
                        : "bg-[#FAF6EE]/60 text-[#053845] border-[#F3E9D1] hover:bg-[#FAF6EE] hover:border-[#B94F30]/40"
                    }`}
                  >
                    <span>{bg.label}</span>
                  </button>
                );
              })}
            </div>
            {errors.bloodGroup && (
              <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.bloodGroup}</span>
              </p>
            )}
          </div>

          {/* Blood Component Selector */}
          <div className="space-y-2" id="bloodComponent">
            <label className="block text-xs font-bold text-[#053845]">
              Blood Component <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {BLOOD_COMPONENTS.map((comp) => {
                const isSelected = bloodComponent === comp.value;
                return (
                  <div
                    key={comp.value}
                    onClick={() => setBloodComponent(comp.value)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? "bg-[#317786]/5 border-[#317786] ring-1 ring-[#317786]"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? "border-[#317786] bg-[#317786]"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-[#053845]">
                        {comp.label}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                        {comp.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Units Required & Required-by Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Units Stepper */}
            <div className="space-y-1.5" id="unitsRequired">
              <label className="block text-xs font-bold text-[#053845]">
                Units Required (Pints / Bags) <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUnitsRequired((prev) => Math.max(1, prev - 1))}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#053845] font-bold text-lg flex items-center justify-center transition-colors cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={unitsRequired}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setUnitsRequired(Math.min(20, Math.max(1, v)));
                  }}
                  className="w-20 text-center py-2 rounded-xl border border-slate-200 text-sm font-bold text-[#053845] focus:outline-none focus:border-[#317786]"
                />
                <button
                  type="button"
                  onClick={() => setUnitsRequired((prev) => Math.min(20, prev + 1))}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#053845] font-bold text-lg flex items-center justify-center transition-colors cursor-pointer"
                >
                  +
                </button>
                <span className="text-xs text-slate-500 ml-2">
                  {unitsRequired} {unitsRequired === 1 ? "unit" : "units"} (approx. {unitsRequired * 450} ml)
                </span>
              </div>
              {errors.unitsRequired && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.unitsRequired}</span>
                </p>
              )}
            </div>

            {/* Required By Date & Time */}
            <div className="space-y-1.5" id="requiredByDate">
              <label className="block text-xs font-bold text-[#053845]">
                Required By (Date &amp; Time) <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="date"
                    min={todayStr}
                    value={requiredByDate}
                    onChange={(e) => {
                      setRequiredByDate(e.target.value);
                      if (errors.requiredByDate) setErrors((prev) => ({ ...prev, requiredByDate: "" }));
                    }}
                    className={`w-full px-3 py-2 rounded-xl border text-xs sm:text-sm bg-white focus:outline-none transition-all ${
                      errors.requiredByDate
                        ? "border-rose-400 focus:border-rose-500"
                        : "border-slate-200 focus:border-[#317786]"
                    }`}
                  />
                </div>
                <div>
                  <input
                    type="time"
                    value={requiredByTime}
                    onChange={(e) => {
                      setRequiredByTime(e.target.value);
                      if (errors.requiredByDate) setErrors((prev) => ({ ...prev, requiredByDate: "" }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
                  />
                </div>
              </div>
              {errors.requiredByDate && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.requiredByDate}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: Urgency & Search Scope */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 flex items-center justify-center font-bold text-xs">
                3
              </div>
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Urgency Level &amp; Matching Radius
                </h2>
                <p className="text-[11px] text-slate-500">
                  Prioritization parameters for regional donor and blood bank notifications
                </p>
              </div>
            </div>
          </div>

          {/* Urgency selector cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {URGENCY_LEVELS.map((u) => {
              const isSelected = urgencyLevel === u.value;
              return (
                <div
                  key={u.value}
                  onClick={() => handleUrgencyChange(u.value)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? `border-[#053845] bg-[#053845]/5 ring-1 ring-[#053845]`
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${u.badgeClass}`}
                    >
                      {u.label}
                    </span>
                    {isSelected && (
                      <span className="w-4 h-4 rounded-full bg-[#053845] text-white flex items-center justify-center text-[10px]">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                    {u.subtext}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Emergency Flag Checkbox */}
          <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200/60 flex items-start gap-3">
            <input
              type="checkbox"
              id="isEmergencyToggle"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              className="w-4 h-4 text-[#A2363A] rounded border-rose-300 focus:ring-rose-400 mt-0.5 cursor-pointer"
            />
            <label htmlFor="isEmergencyToggle" className="cursor-pointer">
              <span className="text-xs font-bold text-[#A2363A] block">
                Flag as Immediate Critical Emergency
              </span>
              <span className="text-[11px] text-slate-600 leading-relaxed block mt-0.5">
                Activates high-priority push notifications and bypasses standard delay batching for voluntary donors in range.
              </span>
            </label>
          </div>

          {/* Search Radius */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#053845]">
                Donor Search Radius: <span className="text-[#317786]">{searchRadius} km</span>
              </label>
              <span className="text-[11px] text-slate-500">
                Recommended: 15 km in urban districts
              </span>
            </div>
            <div className="flex items-center gap-2">
              {SEARCH_RADII.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setSearchRadius(r)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    searchRadius === r
                      ? "bg-[#317786] text-white border-[#317786] shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 4: Hospital or Location Details */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold text-xs">
                4
              </div>
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Hospital &amp; Care Facility Location
                </h2>
                <p className="text-[11px] text-slate-500">
                  Where blood units must be delivered and transfused
                </p>
              </div>
            </div>
          </div>

          {/* Hospital Selection Dropdown */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#053845]">
              Select Accredited Network Hospital (Optional)
            </label>
            <select
              value={selectedHospitalId}
              onChange={(e) => setSelectedHospitalId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] cursor-pointer"
            >
              <option value="">— Select from accredited hospital network —</option>
              {hospitals.map((h) => (
                <option key={h.hospitalid} value={h.hospitalid}>
                  {h.hospitalname} ({h.city}, {h.state})
                </option>
              ))}
              <option value="OTHER">Other / Private Clinic / Facility Not in Network</option>
            </select>
            <p className="text-[11px] text-slate-400">
              If your hospital is not listed, choose &quot;Other&quot; to specify facility details below.
            </p>
          </div>

          {/* Manual Hospital details when not choosing from network */}
          {(selectedHospitalId === "OTHER" || !selectedHospitalId) && (
            <div className="space-y-3 p-4 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] animate-in fade-in duration-150">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Facility / Hospital Name
                </label>
                <input
                  type="text"
                  value={hospitalNameManual}
                  onChange={(e) => setHospitalNameManual(e.target.value)}
                  placeholder="e.g., St. Martha's Hospital, Indira Nagar"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Ward, ICU, or Room Details
                </label>
                <input
                  type="text"
                  value={hospitalLocationManual}
                  onChange={(e) => setHospitalLocationManual(e.target.value)}
                  placeholder="e.g., Trauma ICU, Bed 04, 3rd Floor"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
                />
              </div>
            </div>
          )}

          {/* If hospital selected from dropdown, show hospital badge summary */}
          {selectedHospitalId && selectedHospitalId !== "OTHER" && (
            <div className="p-3.5 rounded-xl bg-[#e8f3f5] border border-[#317786]/30 flex items-start gap-3">
              <Building2 className="w-5 h-5 text-[#317786] flex-shrink-0 mt-0.5" />
              <div>
                {(() => {
                  const h = hospitals.find((item) => item.hospitalid === selectedHospitalId);
                  if (!h) return null;
                  return (
                    <div className="text-xs">
                      <span className="font-bold text-[#053845] block">{h.hospitalname}</span>
                      <span className="text-slate-600 block mt-0.5">{h.address}, {h.city} ({h.pincode})</span>
                      {h.contactpersonphone && (
                        <span className="text-slate-500 block mt-0.5">Desk Phone: {h.contactpersonphone}</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Additional Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#053845]">
              Additional Medical Notes &amp; Instructions (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Cross-matching sample already drawn; transfusion scheduled for tomorrow morning."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
            />
            <p className="text-[11px] text-slate-400">
              Provide any specific clinical remarks, cross-match requirements, or attending doctor details.
            </p>
          </div>
        </div>

        {/* SECTION 5: Clinical Prescription & Verification Notice */}
        {/*
          NOTE: As documented in Step 2.6 audit, the Prescription model exists in the database
          schema, but the dedicated upload API / document storage route is deferred to Phase 2.7.
          We provide clear, honest clinical documentation here rather than a non-functional file upload.
        */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-sm font-bold text-[#053845]">
                  Clinical Prescription Verification Notice
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                  Physical Verification
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                In compliance with clinical transfusion protocols, blood components cannot be dispatched without a valid physician prescription.
              </p>
              <div className="pt-1 text-[11px] text-slate-500 space-y-1 bg-[#FAF6EE] p-3 rounded-xl border border-[#F3E9D1]">
                <p>
                  • <strong>Online Requisition:</strong> Submitting this form immediately activates donor matching algorithms and checks regional blood bank inventories.
                </p>
                <p>
                  • <strong>Physical Handover:</strong> Present the original physical prescription to the attending hospital coordinator or blood bank upon donor arrival.
                </p>
                <p className="text-slate-400 italic">
                  * Note: Direct digital prescription document upload integration is deferred to Phase 2.7 clinical document storage rollout.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Action Bar */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/requester/dashboard"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors text-center"
          >
            Cancel Requisition
          </Link>

          <button
            type="submit"
            className="w-full sm:w-auto px-7 py-3 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white text-xs sm:text-sm font-semibold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Review &amp; Dispatch Blood Request</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Review Summary Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#B94F30] bg-[#FAF6EE] px-2 py-0.5 rounded-full border border-[#F3E9D1]">
                  Pre-Submission Review
                </span>
                <h3 className="font-serif text-lg font-bold text-[#053845] mt-1">
                  Confirm Blood Requisition
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmitting}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Summary Grid */}
            <div className="space-y-3 text-xs">
              {/* Highlight Banner */}
              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 block">
                    Required Component
                  </span>
                  <span className="font-serif text-lg font-bold text-[#053845] block">
                    {unitsRequired} {unitsRequired === 1 ? "Unit" : "Units"} • {mapBloodComponentToDisplay(bloodComponent)}
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#B94F30] text-white flex flex-col items-center justify-center font-serif text-lg font-bold shadow-xs">
                  {mapBloodGroupToDisplay(bloodGroup)}
                </div>
              </div>

              {/* Patient Data */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Patient</span>
                  <span className="font-bold text-[#053845]">{patientName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Age / Gender</span>
                  <span className="font-semibold text-slate-700">
                    {patientAge} yrs • {patientGender}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Contact Phone</span>
                  <span className="font-semibold text-slate-700">{patientContact}</span>
                </div>
              </div>

              {/* Urgency & Timing */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Urgency Status</span>
                  <span className="font-bold text-[#B94F30]">{urgencyLevel}</span>
                  {isEmergency && (
                    <span className="text-[10px] text-[#A2363A] font-bold block">
                      Critical Emergency Flagged
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Required By</span>
                  <span className="font-semibold text-slate-700">
                    {requiredByDate} at {requiredByTime}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200/60">
                  <span className="text-[10px] text-slate-500 uppercase block">Broadcast Radius</span>
                  <span className="font-semibold text-slate-700">{searchRadius} km perimeter</span>
                </div>
              </div>

              {/* Location */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase block">Facility / Location</span>
                <span className="font-semibold text-[#053845] block">
                  {selectedHospitalId && selectedHospitalId !== "OTHER"
                    ? hospitals.find((h) => h.hospitalid === selectedHospitalId)?.hospitalname || "Registered Hospital"
                    : hospitalNameManual || "Local Clinical Facility"}
                </span>
                {hospitalLocationManual && (
                  <span className="text-slate-600 block text-[11px]">
                    Ward / Room: {hospitalLocationManual}
                  </span>
                )}
              </div>
            </div>

            {/* Error in modal if any */}
            {submitError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {submitError}
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Back to Edit
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white text-xs font-semibold shadow-xs hover:shadow transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Transmitting Requisition...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm &amp; Transmit Requisition</span>
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
