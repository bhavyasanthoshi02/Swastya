"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Droplet,
  ChevronLeft,
  ArrowRight,
  Loader2,
  Check,
  AlertCircle,
  Clock,
  Calendar,
  User,
  Phone,
  FileText,
  AlertTriangle,
  Plus,
  Minus,
  X,
  ShieldCheck,
  Building2,
  UploadCloud,
  FileCheck,
  Trash2,
  Paperclip,
  Bookmark,
} from "lucide-react";
import { api, CreateBloodRequestDto } from "@/lib/api";
import { AuthHospital } from "@/lib/auth";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
} from "@/lib/mappers";
import {
  SwastyaDatePicker,
  SwastyaTimePicker,
} from "@/components/ui/SwastyaDateTimePickers";

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
    desc: "Standard 450ml transfusion for trauma, acute blood loss, or surgical care.",
  },
  {
    value: "PLATELETS",
    label: "Platelets (PRP/SDP)",
    desc: "Platelet concentrate for dengue, chemotherapy, or bleeding disorders.",
  },
  {
    value: "PLASMA",
    label: "Fresh Frozen Plasma (FFP)",
    desc: "Coagulation factors for liver disorders, shock, or severe burns.",
  },
  {
    value: "RBC",
    label: "Packed Red Blood Cells (PRBC)",
    desc: "Concentrated RBCs for severe anemia, hematology care, or ICU support.",
  },
];

// Urgency levels
const URGENCY_LEVELS = [
  {
    value: "CRITICAL",
    label: "Critical Emergency",
    subtext: "Immediate life threat. Broadcasts high-priority alerts to eligible donors.",
    badgeClass: "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/30",
    activeCardClass: "border-[#A2363A] bg-[#A2363A]/5 ring-1 ring-[#A2363A]/40",
    dotColor: "bg-[#A2363A]",
  },
  {
    value: "HIGH",
    label: "Urgent Requisition",
    subtext: "Required within 12 - 24 hours for acute admission, surgery, or trauma.",
    badgeClass: "bg-[#f9eee9] text-[#B94F30] border-[#B94F30]/30",
    activeCardClass: "border-[#B94F30] bg-[#B94F30]/5 ring-1 ring-[#B94F30]/40",
    dotColor: "bg-[#B94F30]",
  },
  {
    value: "MEDIUM",
    label: "Priority Case",
    subtext: "Required within 24 - 48 hours for scheduled procedures or chemotherapy.",
    badgeClass: "bg-[#e8f3f5] text-[#317786] border-[#317786]/30",
    activeCardClass: "border-[#317786] bg-[#317786]/5 ring-1 ring-[#317786]/40",
    dotColor: "bg-[#317786]",
  },
  {
    value: "LOW",
    label: "Standard / Planned",
    subtext: "Elective procedures or planned surgical reserve requirement.",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    activeCardClass: "border-[#053845] bg-[#053845]/5 ring-1 ring-[#053845]/30",
    dotColor: "bg-slate-500",
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
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Document Checklist & Validation State
  interface AttachedDoc {
    file: File;
    error?: string;
  }
  const [attachedDocs, setAttachedDocs] = useState<Record<string, AttachedDoc>>({});
  const [documentRequirements, setDocumentRequirements] = useState<
    Array<{ documentType: string; documentName: string; isMandatory: boolean; description: string }>
  >([
    {
      documentType: "PRESCRIPTION",
      documentName: "Clinical Prescription & Medical Order",
      isMandatory: true,
      description: "Official prescription or clinical transfusion order issued by the treating physician.",
    },
    {
      documentType: "DIAGNOSTIC_REPORT",
      documentName: "Diagnostic Blood Test / Crossmatch Report",
      isMandatory: false,
      description: "Recent blood grouping, antibody screen, or crossmatch laboratory analysis.",
    },
    {
      documentType: "CONSENT_FORM",
      documentName: "Patient / Attendant Transfusion Consent",
      isMandatory: false,
      description: "Informed consent signed by the patient or authorized family representative.",
    },
  ]);

  // Fetch configured requirements from backend
  useEffect(() => {
    async function loadRequirements() {
      try {
        const res = await api.hospital.getDocumentRequirements(urgencyLevel, isEmergency);
        if (res.success && res.requirements && res.requirements.length > 0) {
          setDocumentRequirements(res.requirements);
        }
      } catch {
        // Fallback to initial defaults
      }
    }
    loadRequirements();
  }, [urgencyLevel, isEmergency]);

  // Derived Document Completeness
  const mandatoryRequirements = documentRequirements.filter((r) => r.isMandatory);
  const mandatoryUploadedCount = mandatoryRequirements.filter(
    (r) => attachedDocs[r.documentType]?.file && !attachedDocs[r.documentType]?.error
  ).length;
  const isDocumentComplete = mandatoryUploadedCount === mandatoryRequirements.length;
  const completionPercentage =
    mandatoryRequirements.length === 0
      ? 100
      : Math.round((mandatoryUploadedCount / mandatoryRequirements.length) * 100);

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

  const handleFileSelect = (documentType: string, file: File | null) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setAttachedDocs((prev) => ({
        ...prev,
        [documentType]: {
          file,
          error: `File size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
        },
      }));
      return;
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const allowed = [".pdf", ".jpg", ".jpeg", ".png"];
    if (!allowed.includes(ext)) {
      setAttachedDocs((prev) => ({
        ...prev,
        [documentType]: {
          file,
          error: `Invalid file format "${ext}". Allowed formats are: PDF, JPG, PNG.`,
        },
      }));
      return;
    }

    setAttachedDocs((prev) => ({
      ...prev,
      [documentType]: { file },
    }));
  };

  const handleFileRemove = (documentType: string) => {
    setAttachedDocs((prev) => {
      const copy = { ...prev };
      delete copy[documentType];
      return copy;
    });
  };

  const handleSaveDraft = async () => {
    if (isSavingDraft || isSubmitting) return;

    if (!patientName.trim()) {
      setErrors((prev) => ({ ...prev, patientName: "Patient name is required to save a draft" }));
      const el = document.getElementById("patientName");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      setIsSavingDraft(true);
      setSubmitError(null);

      const requiredDateTime = new Date(`${requiredByDate}T${requiredByTime}:00`);

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
        patientage: parseInt(patientAge, 10) || 30,
        patientgender: patientGender || "OTHER",
        patientcontact: patientContact.trim() || hospital?.contactpersonphone || "9999999999",
        bloodgroup: bloodGroup || "O_POSITIVE",
        bloodcomponent: bloodComponent,
        unitsrequired: unitsRequired,
        urgencylevel: urgencyLevel,
        isemergency: isEmergency,
        searchradius: searchRadius,
        requiredby: isNaN(requiredDateTime.getTime()) ? new Date(Date.now() + 86400000).toISOString() : requiredDateTime.toISOString(),
        notes: finalNotes || undefined,
        isDraft: true,
      };

      const res = await api.hospital.createBloodRequest(payload);

      if (res && res.requestid) {
        for (const [docType, docItem] of Object.entries(attachedDocs)) {
          if (docItem.file && !docItem.error) {
            await api.hospital.uploadRequestDocument(res.requestid, docType, docItem.file);
          }
        }
        router.push(`/hospital/requests/${res.requestid}`);
      } else {
        throw new Error("Failed to save draft requisition");
      }
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to save draft requisition.");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!isDocumentComplete) {
      setSubmitError("Cannot proceed: All mandatory supporting documents must be attached before final review.");
      const el = document.getElementById("section-documents");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

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

      if (!isDocumentComplete) {
        setSubmitError("Cannot submit blood request: Mandatory supporting documents are missing.");
        setShowReviewModal(false);
        const el = document.getElementById("section-documents");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

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
        isDraft: true,
      };

      // 1. Create initial draft
      const res = await api.hospital.createBloodRequest(payload);

      if (!res || !res.requestid) {
        throw new Error("Invalid response received from blood request service");
      }

      // 2. Upload attached documents
      for (const [docType, docItem] of Object.entries(attachedDocs)) {
        if (docItem.file && !docItem.error) {
          await api.hospital.uploadRequestDocument(res.requestid, docType, docItem.file);
        }
      }

      // 3. Finalize and submit draft (backend re-verifies 100% completeness)
      await api.hospital.submitDraftRequest(res.requestid);

      router.push(`/hospital/requests/${res.requestid}`);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to create blood request. Please check inputs and try again.");
      setShowReviewModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  if (isLoadingProfile) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading hospital profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-16">
      {/* 1. Page Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link
          href="/hospital/dashboard"
          className="hover:text-[#053845] transition-colors"
        >
          Dashboard
        </Link>
        <span className="text-slate-300">/</span>
        <Link
          href="/hospital/requests"
          className="hover:text-[#053845] transition-colors"
        >
          Blood Requests
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-700">Create Request</span>
      </nav>

      {/* 2. Compact Page Header */}
      <header className="pb-4 border-b border-[#317786]/15 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Create Blood Request
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Enter patient and blood requirement details.
          </p>
        </div>
        {hospital?.hospitalname && (
          <div className="text-left sm:text-right shrink-0">
            <span className="text-[11px] text-slate-400 block">Sponsoring Facility</span>
            <span className="text-xs font-semibold text-[#053845]">
              {hospital.hospitalname}
              {hospital.city ? ` (${hospital.city})` : ""}
            </span>
          </div>
        )}
      </header>

      {/* Global Error Banner */}
      {submitError && (
        <div className="p-4 rounded-2xl bg-[#fdf2f2] border border-[#A2363A]/30 flex items-start gap-3 text-xs sm:text-sm text-[#A2363A]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">Submission Error</span>
            <span>{submitError}</span>
          </div>
        </div>
      )}

      {/* Main Single-Page Form */}
      <form onSubmit={handleReview} className="space-y-5" noValidate>
        {/* SECTION 1: Patient Details */}
        <section
          id="section-patient"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                1
              </span>
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Patient Details
              </h2>
            </div>
            <span className="text-[11px] text-[#A2363A] font-medium">* Required</span>
          </div>

          <div className="space-y-3.5">
            {/* Full-width Patient Name */}
            <div className="space-y-1" id="patientName">
              <label className="block text-xs font-semibold text-[#053845]">
                Patient Full Name <span className="text-[#A2363A]">*</span>
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => {
                  setPatientName(e.target.value);
                  if (errors.patientName) {
                    setErrors((prev) => ({ ...prev, patientName: "" }));
                  }
                }}
                placeholder="e.g., Rajesh Kumar"
                className={`w-full h-10 px-3.5 rounded-xl border text-xs sm:text-sm bg-white focus:outline-none transition-colors ${
                  errors.patientName
                    ? "border-[#A2363A] focus:border-[#A2363A]"
                    : "border-slate-200 focus:border-[#317786]"
                }`}
              />
              {errors.patientName && (
                <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{errors.patientName}</span>
                </p>
              )}
            </div>

            {/* Age & Gender 2-Column Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1" id="patientAge">
                <label className="block text-xs font-semibold text-[#053845]">
                  Patient Age (Years) <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="125"
                  value={patientAge}
                  onChange={(e) => {
                    setPatientAge(e.target.value);
                    if (errors.patientAge) {
                      setErrors((prev) => ({ ...prev, patientAge: "" }));
                    }
                  }}
                  placeholder="e.g., 34"
                  className={`w-full h-10 px-3.5 rounded-xl border text-xs sm:text-sm bg-white focus:outline-none transition-colors ${
                    errors.patientAge
                      ? "border-[#A2363A] focus:border-[#A2363A]"
                      : "border-slate-200 focus:border-[#317786]"
                  }`}
                />
                {errors.patientAge && (
                  <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{errors.patientAge}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1" id="patientGender">
                <label className="block text-xs font-semibold text-[#053845]">
                  Gender <span className="text-[#A2363A]">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["MALE", "FEMALE", "OTHER"] as const).map((g) => {
                    const isSelected = patientGender === g;
                    return (
                      <button
                        type="button"
                        key={g}
                        onClick={() => {
                          setPatientGender(g);
                          if (errors.patientGender) {
                            setErrors((prev) => ({ ...prev, patientGender: "" }));
                          }
                        }}
                        className={`h-10 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#317786]/10 text-[#053845] border-[#317786] ring-1 ring-[#317786]/30 font-bold"
                            : "bg-white text-slate-600 border-slate-200 hover:border-[#317786]/50"
                        }`}
                      >
                        {g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : "Other"}
                      </button>
                    );
                  })}
                </div>
                {errors.patientGender && (
                  <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{errors.patientGender}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Contact Phone & Ward/Room/Bed 2-Column Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1" id="patientContact">
                <label className="block text-xs font-semibold text-[#053845]">
                  Patient / Attendant Phone <span className="text-[#A2363A]">*</span>
                </label>
                <input
                  type="tel"
                  value={patientContact}
                  onChange={(e) => {
                    setPatientContact(e.target.value);
                    if (errors.patientContact) {
                      setErrors((prev) => ({ ...prev, patientContact: "" }));
                    }
                  }}
                  placeholder="e.g., 9876543210"
                  className={`w-full h-10 px-3.5 rounded-xl border text-xs sm:text-sm bg-white focus:outline-none transition-colors ${
                    errors.patientContact
                      ? "border-[#A2363A] focus:border-[#A2363A]"
                      : "border-slate-200 focus:border-[#317786]"
                  }`}
                />
                {errors.patientContact && (
                  <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{errors.patientContact}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#053845]">
                  Ward / Room / Bed <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={wardRoom}
                  onChange={(e) => setWardRoom(e.target.value)}
                  placeholder="e.g., ICU-3 Bed 14 / Ward 2B"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
                />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Blood Requirement */}
        <section
          id="section-blood"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                2
              </span>
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Blood Requirement
              </h2>
            </div>
            <span className="text-[11px] text-[#A2363A] font-medium">* Required</span>
          </div>

          {/* Compact Blood Group Buttons */}
          <div className="space-y-1.5" id="bloodGroup">
            <label className="block text-xs font-semibold text-[#053845]">
              Required Blood Group <span className="text-[#A2363A]">*</span>
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
                      if (errors.bloodGroup) {
                        setErrors((prev) => ({ ...prev, bloodGroup: "" }));
                      }
                    }}
                    className={`h-11 rounded-xl flex items-center justify-center font-serif text-base font-bold border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#B94F30] text-white border-[#B94F30] shadow-2xs"
                        : "bg-[#FAF6EE]/70 text-[#053845] border-[#F3E9D1] hover:border-[#B94F30]/50 hover:bg-[#FAF6EE]"
                    }`}
                  >
                    {bg.label}
                  </button>
                );
              })}
            </div>
            {errors.bloodGroup && (
              <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{errors.bloodGroup}</span>
              </p>
            )}
          </div>

          {/* Blood Component Cards */}
          <div className="space-y-1.5" id="bloodComponent">
            <label className="block text-xs font-semibold text-[#053845]">
              Blood Component <span className="text-[#A2363A]">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {BLOOD_COMPONENTS.map((comp) => {
                const isSelected = bloodComponent === comp.value;
                return (
                  <button
                    type="button"
                    key={comp.value}
                    onClick={() => setBloodComponent(comp.value)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-2.5 ${
                      isSelected
                        ? "bg-[#317786]/10 border-[#317786] ring-1 ring-[#317786]/30"
                        : "bg-white border-slate-200 hover:border-[#317786]/50"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "border-[#317786] bg-[#317786]"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[#053845]">
                        {comp.label}
                      </span>
                      <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
                        {comp.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Units Required Stepper */}
          <div className="space-y-1.5 pt-1" id="unitsRequired">
            <label className="block text-xs font-semibold text-[#053845]">
              Units Required <span className="text-[#A2363A]">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUnitsRequired((prev) => Math.max(1, prev - 1))}
                  className="w-10 h-10 rounded-xl bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] text-[#053845] font-bold text-base flex items-center justify-center transition-colors cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={unitsRequired}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setUnitsRequired(Math.min(100, Math.max(1, v)));
                  }}
                  className="w-16 h-10 text-center rounded-xl border border-slate-200 text-sm font-bold text-[#053845] focus:outline-none focus:border-[#317786]"
                />
                <button
                  type="button"
                  onClick={() => setUnitsRequired((prev) => Math.min(100, prev + 1))}
                  className="w-10 h-10 rounded-xl bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] text-[#053845] font-bold text-base flex items-center justify-center transition-colors cursor-pointer"
                >
                  +
                </button>
                <span className="text-xs text-slate-500 ml-1">
                  {unitsRequired} {unitsRequired === 1 ? "unit" : "units"} (~{unitsRequired * 450} ml)
                </span>
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
              <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{errors.unitsRequired}</span>
              </p>
            )}
          </div>
        </section>

        {/* SECTION 3: Urgency & Schedule */}
        <section
          id="section-urgency"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                3
              </span>
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Urgency &amp; Schedule
              </h2>
            </div>
            <span className="text-[11px] text-[#A2363A] font-medium">* Required</span>
          </div>

          {/* Urgency Level Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {URGENCY_LEVELS.map((u) => {
              const isSelected = urgencyLevel === u.value;
              return (
                <button
                  type="button"
                  key={u.value}
                  onClick={() => handleUrgencyChange(u.value)}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? u.activeCardClass
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${u.badgeClass}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${u.dotColor}`} />
                      <span>{u.label}</span>
                    </span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[#053845] shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                    {u.subtext}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Emergency Flag Checkbox */}
          <div className="p-3 rounded-xl bg-[#fdf2f2]/70 border border-[#A2363A]/20 flex items-start gap-3">
            <input
              type="checkbox"
              id="isEmergencyToggle"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              className="w-4 h-4 text-[#A2363A] rounded border-rose-300 focus:ring-rose-400 mt-0.5 cursor-pointer"
            />
            <label htmlFor="isEmergencyToggle" className="cursor-pointer">
              <span className="text-xs font-semibold text-[#A2363A] block">
                Flag as Immediate Critical Emergency
              </span>
              <span className="text-[11px] text-slate-600 block mt-0.5">
                Activates high-priority push notifications and alerts nearby donors and blood banks immediately.
              </span>
            </label>
          </div>

          {/* Required By Date & Time with Pickers */}
          <div className="space-y-2 pt-1" id="requiredByDate">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#053845]">
                <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                <span>
                  Required By (Date &amp; Time) <span className="text-[#A2363A]">*</span>
                </span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SwastyaDatePicker
                value={requiredByDate}
                min={todayStr}
                hasError={Boolean(errors.requiredByDate)}
                onChange={(val) => {
                  setRequiredByDate(val);
                  if (errors.requiredByDate) {
                    setErrors((prev) => ({ ...prev, requiredByDate: "" }));
                  }
                }}
              />
              <SwastyaTimePicker
                value={requiredByTime}
                hasError={Boolean(errors.requiredByDate || errors.requiredByTime)}
                onChange={(val) => {
                  setRequiredByTime(val);
                  if (errors.requiredByDate || errors.requiredByTime) {
                    setErrors((prev) => ({
                      ...prev,
                      requiredByDate: "",
                      requiredByTime: "",
                    }));
                  }
                }}
              />
            </div>
            {errors.requiredByDate && (
              <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{errors.requiredByDate}</span>
              </p>
            )}

            {/* Quick Schedule Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500 font-medium mr-1">Quick Presets:</span>
              <button
                type="button"
                onClick={() => applyTimePreset(2)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
              >
                +2h
              </button>
              <button
                type="button"
                onClick={() => applyTimePreset(4)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
              >
                +4h
              </button>
              <button
                type="button"
                onClick={() => applyTimePreset(12)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
              >
                +12h
              </button>
              <button
                type="button"
                onClick={() => applyTimePreset(24)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
              >
                +24h
              </button>
              <button
                type="button"
                onClick={() => applyTimePreset(48)}
                className="px-2.5 py-1 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845] hover:bg-[#F3E9D1] text-[11px] font-semibold transition-colors cursor-pointer"
              >
                +48h
              </button>
            </div>
          </div>

          {/* Donor Search Radius */}
          <div className="space-y-1.5 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#053845]">
                Donor Search Radius:{" "}
                <span className="text-[#317786]">{searchRadius} km</span>
              </label>
              <span className="text-[11px] text-slate-500">
                Recommended: 15 km in metropolitan districts
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
              {SEARCH_RADII.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setSearchRadius(r)}
                  className={`py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    searchRadius === r
                      ? "bg-[#317786] text-white shadow-2xs"
                      : "text-slate-600 hover:text-[#053845]"
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4: Additional Clinical Information */}
        <section
          id="section-clinical"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                4
              </span>
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Additional Clinical Information
              </h2>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Optional</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#053845]">
                Attending Physician / Surgeon
              </label>
              <input
                type="text"
                value={attendingDoctor}
                onChange={(e) => setAttendingDoctor(e.target.value)}
                placeholder="e.g., Dr. Ananya Sharma, MD"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#053845]">
                Clinical Indication / Diagnosis
              </label>
              <input
                type="text"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                placeholder="e.g., Pre-operative reserve / Acute hemorrhage"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] transition-colors"
              />
            </div>
          </div>
        </section>

        {/* SECTION 5: Supporting Clinical Documents */}
        <section
          id="section-documents"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#F3E9D1]/70 gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                5
              </span>
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Supporting Clinical Documents
                </h2>
                <p className="text-[11px] text-slate-500">
                  Ensure all mandatory clinical orders are attached prior to final submission.
                </p>
              </div>
            </div>

            {/* Progress Badge */}
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="text-[11px] font-semibold text-[#053845]">
                  {mandatoryUploadedCount} of {mandatoryRequirements.length} Mandatory Attached
                </span>
                <span className="text-[11px] text-slate-500 block">
                  ({completionPercentage}% complete)
                </span>
              </div>
              <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden border border-[#F3E9D1]">
                <div
                  className={`h-full transition-all duration-300 ${
                    isDocumentComplete ? "bg-emerald-600" : "bg-[#317786]"
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Checklist Items */}
          <div className="space-y-3">
            {documentRequirements.map((req) => {
              const docItem = attachedDocs[req.documentType];
              const isUploaded = Boolean(docItem?.file && !docItem?.error);

              return (
                <div
                  key={req.documentType}
                  className={`p-4 rounded-xl border transition-colors ${
                    isUploaded
                      ? "bg-emerald-50/40 border-emerald-200"
                      : req.isMandatory
                      ? "bg-amber-50/30 border-amber-200/80"
                      : "bg-[#FAF6EE]/40 border-[#F3E9D1]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-[#053845]">
                          {req.documentName}
                        </span>
                        {req.isMandatory ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-[#A2363A]/10 text-[#A2363A] border border-[#A2363A]/20">
                            Mandatory
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Optional
                          </span>
                        )}
                        {isUploaded ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                            <FileCheck className="w-3.5 h-3.5" />
                            Ready
                          </span>
                        ) : req.isMandatory ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-md">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Missing
                          </span>
                        ) : null}
                      </div>

                      <p className="text-xs text-slate-500">{req.description}</p>

                      {/* Display attached file info */}
                      {docItem?.file && (
                        <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium truncate max-w-[240px]">
                              {docItem.file.name}
                            </span>
                            <span className="text-slate-400 text-[11px] shrink-0">
                              ({(docItem.file.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFileRemove(req.documentType)}
                            className="text-slate-400 hover:text-[#A2363A] transition-colors p-1"
                            title="Remove attached file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Display error message if invalid */}
                      {docItem?.error && (
                        <p className="text-xs text-[#A2363A] font-medium flex items-center gap-1 pt-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{docItem.error}</span>
                        </p>
                      )}
                    </div>

                    {/* Upload / Replace Action Trigger */}
                    <div className="shrink-0 self-end sm:self-center">
                      <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-[#F3E9D1] text-[#053845] hover:bg-[#FAF6EE] hover:border-[#317786] transition-colors cursor-pointer shadow-2xs">
                        <UploadCloud className="w-4 h-4 text-[#317786]" />
                        <span>{isUploaded ? "Replace File" : "Choose File"}</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            handleFileSelect(req.documentType, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs text-slate-600 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#317786] shrink-0" />
            <span>
              Accepted file formats: PDF, JPEG, PNG (maximum 5 MB per document). Files are stored in secure private storage.
            </span>
          </div>
        </section>

        {/* Form Actions Footer */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href="/hospital/requests"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-[#FAF6EE] transition-colors text-center"
          >
            Cancel
          </Link>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSubmitting}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#F3E9D1] bg-white hover:bg-[#FAF6EE] text-slate-700 text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSavingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#317786]" />
                  <span>Saving Draft...</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4 text-[#317786]" />
                  <span>Save as Draft</span>
                </>
              )}
            </button>

            <button
              type="submit"
              disabled={isSavingDraft || isSubmitting}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                isDocumentComplete
                  ? "bg-[#053845] hover:bg-[#317786] text-white"
                  : "bg-slate-200 text-slate-400 hover:bg-slate-200"
              }`}
            >
              <span>Review Request</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>

      {/* Review Summary Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reviewModalTitle"
            className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xl max-w-[700px] w-full max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#F3E9D1] flex items-center justify-between gap-3 shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#B94F30] shrink-0">
                  <Droplet className="w-4 h-4" />
                </div>
                <div>
                  <h3
                    id="reviewModalTitle"
                    className="font-serif text-lg font-bold text-[#053845] leading-tight"
                  >
                    Confirm Blood Request
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review the request details before submitting.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmitting}
                aria-label="Close review modal"
                className="w-8 h-8 rounded-lg hover:bg-[#FAF6EE] text-slate-400 hover:text-[#053845] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
              {/* Request Summary in Clean Two-Column Label/Value Layout with Subtle Dividers */}
              <div className="bg-[#FAF6EE]/50 rounded-xl border border-[#F3E9D1] p-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Hospital / Facility</span>
                    <span className="font-semibold text-[#053845] text-right truncate max-w-[190px]">
                      {hospital?.hospitalname || "Registered Hospital"}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Patient Name</span>
                    <span className="font-semibold text-[#053845] text-right truncate max-w-[190px]">
                      {patientName}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Age and Gender</span>
                    <span className="font-medium text-slate-700 text-right">
                      {patientAge} yrs &bull; {patientGender === "MALE" ? "Male" : patientGender === "FEMALE" ? "Female" : patientGender || "—"}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Blood Group</span>
                    <span className="font-bold font-serif text-[#B94F30] text-sm text-right">
                      {mapBloodGroupToDisplay(bloodGroup)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Blood Component</span>
                    <span className="font-semibold text-[#053845] text-right">
                      {mapBloodComponentToDisplay(bloodComponent)}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Units Required</span>
                    <span className="font-semibold text-[#053845] text-right">
                      {unitsRequired} {unitsRequired === 1 ? "unit" : "units"}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Urgency</span>
                    <span className="text-right">
                      {urgencyLevel === "CRITICAL" || isEmergency ? (
                        <span className="inline-flex items-center gap-1.5 text-[#A2363A] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#A2363A]" />
                          Critical Emergency
                        </span>
                      ) : (
                        <span className="font-semibold text-[#053845]">
                          {URGENCY_LEVELS.find((u) => u.value === urgencyLevel)?.label || urgencyLevel}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Required Date and Time</span>
                    <span className="font-medium text-slate-700 text-right">
                      {requiredByDate} at {requiredByTime}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 sm:col-span-2 border-b border-[#F3E9D1]/70">
                    <span className="text-slate-500">Donor Search Radius</span>
                    <span className="font-medium text-slate-700 text-right">
                      {searchRadius} km radius
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between py-1.5 sm:col-span-2">
                    <span className="text-slate-500">Supporting Documents</span>
                    <span className="font-semibold text-emerald-700 text-right flex items-center gap-1">
                      <FileCheck className="w-3.5 h-3.5" />
                      {mandatoryUploadedCount} mandatory document(s) verified (100% complete)
                    </span>
                  </div>
                </div>
              </div>

              {/* Confirmation Notice */}
              <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] text-slate-600 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#317786] shrink-0" />
                <span>
                  Confirming this request will make it available to compatible donors within the selected search radius.
                </span>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-[#fdf2f2] border border-[#A2363A]/30 text-xs text-[#A2363A] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-5 py-3.5 border-t border-[#F3E9D1] bg-[#FAF6EE]/50 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors cursor-pointer disabled:opacity-50"
              >
                Back to Edit
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Broadcasting...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm &amp; Broadcast</span>
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
