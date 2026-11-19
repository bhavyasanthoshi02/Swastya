"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Droplet,
  AlertCircle,
  CheckCircle2,
  Building2,
  ChevronLeft,
  ArrowRight,
  Loader2,
  Check,
  UploadCloud,
  FileText,
  X,
  MapPin,
  Calendar,
} from "lucide-react";
import { api, HospitalItem } from "@/lib/api";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
} from "@/lib/mappers";
import {
  SwastyaDatePicker,
  SwastyaTimePicker,
} from "@/components/ui/SwastyaDateTimePickers";

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

const URGENCY_LEVELS = [
  {
    value: "CRITICAL",
    label: "Critical Emergency",
    subtext: "Immediate life threat. Bypasses cooldown queues & alerts regional coordinators.",
    badgeClass: "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/30",
    activeCardClass: "border-[#A2363A] bg-[#A2363A]/5 ring-1 ring-[#A2363A]/40",
    dotColor: "bg-[#A2363A]",
  },
  {
    value: "HIGH",
    label: "Urgent Requisition",
    subtext: "Required within 12 - 24 hours. Surgery, ICU admission, or trauma care.",
    badgeClass: "bg-[#f9eee9] text-[#B94F30] border-[#B94F30]/30",
    activeCardClass: "border-[#B94F30] bg-[#B94F30]/5 ring-1 ring-[#B94F30]/40",
    dotColor: "bg-[#B94F30]",
  },
  {
    value: "MEDIUM",
    label: "Priority Case",
    subtext: "Required within 24 - 48 hours for scheduled transfusions or chemotherapy.",
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
  const [step3Touched, setStep3Touched] = useState(false);

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

  // Prescription Upload States
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [doctorName, setDoctorName] = useState("");
  const [prescriptionHospitalName, setPrescriptionHospitalName] = useState("");

  // Validation & UI State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdSuccess, setCreatedSuccess] = useState<{
    requestId: string;
    patientName: string;
  } | null>(null);

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

  const handleUrgencyChange = (val: string) => {
    setUrgencyLevel(val);
    setStep3Touched(true);
    if (val === "CRITICAL") {
      setIsEmergency(true);
    }
  };

  const handleSelectPrescriptionFile = (file: File) => {
    setPrescriptionFile(file);
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy.prescriptionFile;
      return copy;
    });
  };

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

    if (!prescriptionFile) {
      errs.prescriptionFile =
        "Clinical prescription document is required. Please upload a valid PDF, JPEG, or PNG.";
    } else {
      const allowedExts = [".pdf", ".jpg", ".jpeg", ".png"];
      const ext = prescriptionFile.name
        .slice(prescriptionFile.name.lastIndexOf("."))
        .toLowerCase();
      if (!allowedExts.includes(ext)) {
        errs.prescriptionFile =
          "Invalid file type. Allowed formats: PDF, JPEG, JPG, PNG.";
      } else if (prescriptionFile.size > 5 * 1024 * 1024) {
        errs.prescriptionFile = `Prescription file size exceeds the 5 MB limit (${(
          prescriptionFile.size /
          (1024 * 1024)
        ).toFixed(2)} MB).`;
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

      const formData = new FormData();
      formData.append("patientname", patientName.trim());
      formData.append("patientage", String(parseInt(patientAge, 10)));
      formData.append("patientgender", patientGender);
      formData.append("patientcontact", patientContact.trim());
      formData.append("bloodgroup", bloodGroup);
      formData.append("bloodcomponent", bloodComponent);
      formData.append("unitsrequired", String(unitsRequired));
      formData.append("urgencylevel", urgencyLevel);
      formData.append("isemergency", String(isEmergency));
      formData.append("searchradius", String(searchRadius));
      formData.append("requiredby", requiredDateTime.toISOString());
      if (finalNotes) {
        formData.append("notes", finalNotes);
      }
      if (selectedHospitalId && selectedHospitalId !== "OTHER") {
        formData.append("hospitalid", selectedHospitalId);
      }
      if (prescriptionFile) {
        formData.append("prescription", prescriptionFile);
      }
      if (doctorName.trim()) {
        formData.append("doctorname", doctorName.trim());
      }
      if (prescriptionHospitalName.trim()) {
        formData.append("hospitalname", prescriptionHospitalName.trim());
      } else if (selectedHospitalId && selectedHospitalId !== "OTHER") {
        const h = hospitals.find((item) => item.hospitalid === selectedHospitalId);
        if (h) formData.append("hospitalname", h.hospitalname);
      }

      const res = await api.bloodRequests.create(formData);

      if (res && res.requestid) {
        setCreatedSuccess({
          requestId: res.requestid,
          patientName: res.patientname || patientName,
        });
        setShowReviewModal(false);

        setTimeout(() => {
          router.push(`/requester/dashboard?created=true&requestId=${res.requestid}`);
        }, 1800);
      } else {
        throw new Error("Invalid response received from blood request service");
      }
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to submit blood requisition. Please verify clinical inputs and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];

  // Progress Indicator Step Completion State (derived from real form values & validation rules)
  const cleanNameVal = patientName.trim();
  const parsedAge = parseInt(patientAge, 10);
  const cleanContactVal = patientContact.trim().replace(/[\s-]/g, "");
  const step1Complete =
    cleanNameVal.length >= 2 &&
    cleanNameVal.length <= 100 &&
    patientAge.trim() !== "" &&
    !isNaN(parsedAge) &&
    parsedAge >= 0 &&
    parsedAge <= 125 &&
    (patientGender === "MALE" || patientGender === "FEMALE" || patientGender === "OTHER") &&
    /^[0-9+]{10,15}$/.test(cleanContactVal);

  const selectedRequiredDt =
    requiredByDate && requiredByTime
      ? new Date(`${requiredByDate}T${requiredByTime}:00`)
      : null;
  const isRequiredDtValid =
    selectedRequiredDt !== null &&
    !isNaN(selectedRequiredDt.getTime()) &&
    selectedRequiredDt.getTime() >= Date.now() - 5 * 60 * 1000;

  const step2Complete =
    Boolean(bloodGroup) &&
    Boolean(bloodComponent) &&
    unitsRequired >= 1 &&
    unitsRequired <= 20 &&
    isRequiredDtValid;

  const step3Complete =
    step3Touched &&
    Boolean(urgencyLevel) &&
    SEARCH_RADII.includes(searchRadius);

  const step4Complete =
    (Boolean(selectedHospitalId) && selectedHospitalId !== "OTHER") ||
    Boolean(hospitalNameManual.trim()) ||
    Boolean(hospitalLocationManual.trim());

  const allowedPrescriptionExts = [".pdf", ".jpg", ".jpeg", ".png"];
  const prescriptionExt = prescriptionFile
    ? prescriptionFile.name
        .slice(prescriptionFile.name.lastIndexOf("."))
        .toLowerCase()
    : "";
  const step5Complete =
    Boolean(prescriptionFile) &&
    allowedPrescriptionExts.includes(prescriptionExt) &&
    (prescriptionFile?.size ?? 0) <= 5 * 1024 * 1024;

  const steps = [
    { num: 1, label: "Patient Information", complete: step1Complete, target: "step-1" },
    { num: 2, label: "Blood Requirements", complete: step2Complete, target: "step-2" },
    { num: 3, label: "Urgency & Matching", complete: step3Complete, target: "step-3" },
    { num: 4, label: "Hospital Details", complete: step4Complete, target: "step-4" },
    { num: 5, label: "Prescription Upload", complete: step5Complete, target: "step-5" },
  ];

  const firstIncompleteStep = steps.find((s) => !s.complete)?.num ?? 5;

  const scrollToStep = (targetId: string) => {
    const el = document.getElementById(targetId);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      {/* Top Back Navigation & Subtle Emergency Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/requester/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Requester Dashboard</span>
        </Link>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
            isEmergency || urgencyLevel === "CRITICAL"
              ? "bg-[#fdf2f2] text-[#A2363A] border-[#A2363A]/30"
              : "bg-white text-[#B94F30] border-[#F3E9D1]"
          }`}
        >
          <Droplet className="w-3 h-3" />
          <span>
            {isEmergency || urgencyLevel === "CRITICAL"
              ? "Critical Emergency Requisition"
              : "Emergency Requisition"}
          </span>
        </span>
      </div>

      {/* 2. Compact Page Header */}
      <header className="space-y-1 pb-4 border-b border-[#317786]/15">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#317786] block">
          PATIENT TRANSFUSION REQUISITION
        </span>
        <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
          Raise a Blood Request
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
          Submit blood component requirements to cross-match with certified blood banks and notify nearby eligible donors.
        </p>
      </header>

      {/* 3. Horizontal 5-Step Progress Indicator */}
      <nav
        aria-label="Requisition form sections"
        className="bg-white rounded-2xl border border-[#F3E9D1] px-4 py-3 shadow-2xs"
      >
        <div className="grid grid-cols-5 gap-2 items-start">
          {steps.map((step, idx) => {
            const isCompleted = step.complete;
            const isCurrent = !isCompleted && step.num === firstIncompleteStep;

            return (
              <button
                key={step.num}
                type="button"
                onClick={() => scrollToStep(step.target)}
                className="group flex flex-col items-center text-center cursor-pointer focus:outline-none"
              >
                <div className="flex items-center w-full">
                  <div
                    className={`flex-1 h-0.5 ${
                      idx === 0
                        ? "bg-transparent"
                        : isCompleted || isCurrent
                        ? "bg-[#317786]"
                        : "bg-[#F3E9D1]"
                    }`}
                  />
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                      isCompleted
                        ? "bg-[#317786] text-white"
                        : isCurrent
                        ? "bg-[#053845] text-white ring-2 ring-[#317786]/25"
                        : "bg-[#FAF6EE] border border-[#F3E9D1] text-slate-400 group-hover:border-[#317786]/40"
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.num}
                  </div>
                  <div
                    className={`flex-1 h-0.5 ${
                      idx === steps.length - 1
                        ? "bg-transparent"
                        : isCompleted
                        ? "bg-[#317786]"
                        : "bg-[#F3E9D1]"
                    }`}
                  />
                </div>
                <span
                  className={`mt-1.5 text-[11px] leading-tight hidden sm:block ${
                    isCurrent
                      ? "font-semibold text-[#053845]"
                      : isCompleted
                      ? "font-medium text-[#317786]"
                      : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Submission Success Banner */}
      {createdSuccess && (
        <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-2xs space-y-2.5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-bold text-emerald-900">
                Blood Requisition Dispatched Successfully
              </h3>
              <p className="text-xs sm:text-sm text-emerald-800">
                Requisition{" "}
                <strong>REQ-{createdSuccess.requestId.slice(0, 8).toUpperCase()}</strong> for{" "}
                <strong>{createdSuccess.patientName}</strong> has been logged. Redirecting to dashboard...
              </p>
            </div>
          </div>
          <Link
            href={`/requester/dashboard?created=true&requestId=${createdSuccess.requestId}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white font-semibold text-xs hover:bg-emerald-800 transition-colors"
          >
            <span>Go to Dashboard Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Global Error Banner */}
      {submitError && (
        <div className="p-4 rounded-2xl bg-[#fdf2f2] border border-[#A2363A]/30 flex items-start gap-3 text-xs sm:text-sm text-[#A2363A]">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Submission Error</span>
            <span>{submitError}</span>
          </div>
        </div>
      )}

      {/* Main Single-Page Form */}
      <form onSubmit={handleReview} className="space-y-5" noValidate>
        {/* SECTION 1: Patient & Attendant Information */}
        <section
          id="step-1"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4 scroll-mt-6"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                1
              </span>
              <div>
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Patient &amp; Attendant Information
                </h2>
              </div>
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
                  min="0"
                  max="125"
                  value={patientAge}
                  onChange={(e) => {
                    setPatientAge(e.target.value);
                    if (errors.patientAge) {
                      setErrors((prev) => ({ ...prev, patientAge: "" }));
                    }
                  }}
                  placeholder="e.g., 42"
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
                  Patient Gender <span className="text-[#A2363A]">*</span>
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
                            ? "bg-[#317786]/10 text-[#053845] border-[#317786] ring-1 ring-[#317786]/30"
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

            {/* Full-width Contact Phone */}
            <div className="space-y-1" id="patientContact">
              <label className="block text-xs font-semibold text-[#053845]">
                Emergency Attendant / Patient Contact Phone{" "}
                <span className="text-[#A2363A]">*</span>
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
              <p className="text-[11px] text-slate-500">
                Hospital coordinators and donor dispatch desks use this number to coordinate transfusion.
              </p>
              {errors.patientContact && (
                <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{errors.patientContact}</span>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: Blood Specification & Transfusion Units */}
        <section
          id="step-2"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4 scroll-mt-6"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                2
              </span>
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Blood Specification &amp; Transfusion Units
              </h2>
            </div>
          </div>

          {/* Compact Blood Group Tiles */}
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

          {/* Units Required & Required Date/Time aligned in one row on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1 items-start">
            <div className="space-y-1.5" id="unitsRequired">
              <label className="block text-xs font-semibold text-[#053845]">
                Units Required <span className="text-[#A2363A]">*</span>
              </label>
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
                  max="20"
                  value={unitsRequired}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setUnitsRequired(Math.min(20, Math.max(1, v)));
                  }}
                  className="w-16 h-10 text-center rounded-xl border border-slate-200 text-sm font-bold text-[#053845] focus:outline-none focus:border-[#317786]"
                />
                <button
                  type="button"
                  onClick={() => setUnitsRequired((prev) => Math.min(20, prev + 1))}
                  className="w-10 h-10 rounded-xl bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] text-[#053845] font-bold text-base flex items-center justify-center transition-colors cursor-pointer"
                >
                  +
                </button>
                <span className="text-xs text-slate-500 ml-1">
                  {unitsRequired} {unitsRequired === 1 ? "unit" : "units"} (~{unitsRequired * 450} ml)
                </span>
              </div>
              {errors.unitsRequired && (
                <p className="text-[11px] text-[#A2363A] flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{errors.unitsRequired}</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5" id="requiredByDate">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#053845]">
                <Calendar className="w-3.5 h-3.5 text-[#317786]" />
                <span>
                  Required By (Date &amp; Time) <span className="text-[#A2363A]">*</span>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
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
                  hasError={Boolean(errors.requiredByDate)}
                  onChange={(val) => {
                    setRequiredByTime(val);
                    if (errors.requiredByDate) {
                      setErrors((prev) => ({ ...prev, requiredByDate: "" }));
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
            </div>
          </div>
        </section>

        {/* SECTION 3: Urgency Level & Matching Radius */}
        <section
          id="step-3"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4 scroll-mt-6"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                3
              </span>
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Urgency Level &amp; Matching Radius
              </h2>
            </div>
          </div>

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
              onChange={(e) => {
                setIsEmergency(e.target.checked);
                setStep3Touched(true);
              }}
              className="w-4 h-4 text-[#A2363A] rounded border-rose-300 focus:ring-rose-400 mt-0.5 cursor-pointer"
            />
            <label htmlFor="isEmergencyToggle" className="cursor-pointer">
              <span className="text-xs font-semibold text-[#A2363A] block">
                Flag as Immediate Critical Emergency
              </span>
              <span className="text-[11px] text-slate-600 block mt-0.5">
                Activates high-priority push notifications and bypasses standard delay batching for voluntary donors in range.
              </span>
            </label>
          </div>

          {/* Compact Segmented Search Radius */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#053845]">
                Donor Search Radius:{" "}
                <span className="text-[#317786]">{searchRadius} km</span>
              </label>
              <span className="text-[11px] text-slate-500">
                Recommended: 15 km in urban districts
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1]">
              {SEARCH_RADII.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => {
                    setSearchRadius(r);
                    setStep3Touched(true);
                  }}
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

        {/* SECTION 4: Hospital & Care Facility Location */}
        <section
          id="step-4"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4 scroll-mt-6"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                4
              </span>
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Hospital &amp; Care Facility Location
              </h2>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#053845]">
                Select Accredited Network Hospital (Optional)
              </label>
              <select
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-[#F3E9D1] text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786] cursor-pointer text-[#053845]"
              >
                <option value="">
                  {isLoadingHospitals
                    ? "Loading accredited hospitals..."
                    : "— Select from accredited hospital network —"}
                </option>
                {hospitals.map((h) => (
                  <option key={h.hospitalid} value={h.hospitalid}>
                    {h.hospitalname} ({h.city}, {h.state})
                  </option>
                ))}
                <option value="OTHER">
                  Other / Private Clinic / Facility Not in Network
                </option>
              </select>
            </div>

            {(selectedHospitalId === "OTHER" || !selectedHospitalId) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[#053845]">
                    Facility / Hospital Name
                  </label>
                  <input
                    type="text"
                    value={hospitalNameManual}
                    onChange={(e) => setHospitalNameManual(e.target.value)}
                    placeholder="e.g., St. Martha's Hospital, Indira Nagar"
                    className="w-full h-10 px-3 rounded-xl border border-[#F3E9D1] text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-[#053845]">
                    <MapPin className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Ward, ICU, or Room Details</span>
                  </label>
                  <input
                    type="text"
                    value={hospitalLocationManual}
                    onChange={(e) => setHospitalLocationManual(e.target.value)}
                    placeholder="e.g., Trauma ICU, Bed 04, 3rd Floor"
                    className="w-full h-10 px-3 rounded-xl border border-[#317786]/35 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
                  />
                </div>
              </div>
            )}

            {selectedHospitalId && selectedHospitalId !== "OTHER" && (
              <div className="p-3 rounded-xl bg-white border border-[#317786]/25 flex items-start gap-2.5">
                <Building2 className="w-4 h-4 text-[#317786] shrink-0 mt-0.5" />
                {(() => {
                  const h = hospitals.find((item) => item.hospitalid === selectedHospitalId);
                  if (!h) return null;
                  return (
                    <div className="text-xs">
                      <span className="font-semibold text-[#053845] block">
                        {h.hospitalname}
                      </span>
                      <span className="text-slate-600 block">
                        {h.address}, {h.city} ({h.pincode})
                      </span>
                      {h.contactpersonphone && (
                        <span className="text-slate-500 block">
                          Desk Phone: {h.contactpersonphone}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[#053845]">
              Additional Medical Notes &amp; Instructions (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Cross-matching sample already drawn; transfusion scheduled for tomorrow morning."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
            />
          </div>
        </section>

        {/* SECTION 5: Clinical Prescription Upload */}
        <section
          id="step-5"
          className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-5 space-y-4 scroll-mt-6"
        >
          <div id="prescriptionFile" className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center font-bold text-xs shrink-0">
                5
              </span>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-base font-bold text-[#053845]">
                  Clinical Prescription Upload
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#fdf2f2] text-[#A2363A] border border-[#A2363A]/20">
                  Required
                </span>
              </div>
            </div>
          </div>

          {!prescriptionFile ? (
            <label
              htmlFor="prescriptionInput"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleSelectPrescriptionFile(e.dataTransfer.files[0]);
                }
              }}
              className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                errors.prescriptionFile
                  ? "border-[#A2363A]/60 bg-[#fdf2f2]/40"
                  : isDraggingFile
                  ? "border-[#317786] bg-[#317786]/5"
                  : "border-[#F3E9D1] bg-[#FAF6EE]/50 hover:bg-[#FAF6EE] hover:border-[#317786]/50"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-white border border-[#F3E9D1] flex items-center justify-center text-[#317786] mb-2 shadow-2xs">
                <UploadCloud className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-[#053845] text-center">
                Click to browse or drag &amp; drop prescription file
              </span>
              <span className="text-[11px] text-slate-500 text-center mt-0.5">
                PDF, JPEG, JPG, PNG (Max 5 MB)
              </span>
              <input
                id="prescriptionInput"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleSelectPrescriptionFile(e.target.files[0]);
                  }
                }}
              />
            </label>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#053845] block truncate">
                    {prescriptionFile.name}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {(prescriptionFile.size / (1024 * 1024)).toFixed(2)} MB &middot;{" "}
                    {prescriptionFile.type || "Document"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPrescriptionFile(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-[#A2363A] hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                title="Remove file"
              >
                <X className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          )}

          {errors.prescriptionFile && (
            <p className="text-xs text-[#A2363A] flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errors.prescriptionFile}</span>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#053845]">
                Prescribing Doctor / Attending Physician
              </label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="e.g., Dr. Rajesh Kumar, MD"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#053845]">
                Issuing Clinic / Hospital Name
              </label>
              <input
                type="text"
                value={prescriptionHospitalName}
                onChange={(e) => setPrescriptionHospitalName(e.target.value)}
                placeholder="e.g., City Memorial Hospital"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:border-[#317786]"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 bg-[#FAF6EE]/70 border border-[#F3E9D1] rounded-xl px-3.5 py-2.5">
            Prescriptions are stored in encrypted storage and reviewed by the assigned hospital before blood arrangement.
          </p>
        </section>

        {/* 9. Clean Final Action Area */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link
            href="/requester/dashboard"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-[#FAF6EE] transition-colors text-center"
          >
            Cancel Requisition
          </Link>

          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Review &amp; Dispatch Blood Request</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Review Summary Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reviewModalTitle"
            className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Compact Header */}
            <div className="px-5 py-3.5 border-b border-[#F3E9D1] flex items-center justify-between gap-3 shrink-0 bg-white">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#317786] block">
                  Pre-Submission Review
                </span>
                <h3
                  id="reviewModalTitle"
                  className="font-serif text-lg font-bold text-[#053845] leading-tight"
                >
                  Confirm Blood Requisition
                </h3>
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

            {/* Single Controlled Scroll Area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
              {/* Section A – Blood Requirement */}
              <div className="px-4 py-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded-xl bg-[#317786]/10 border border-[#317786]/25 text-[#053845] font-serif text-lg font-bold leading-none shrink-0">
                    {mapBloodGroupToDisplay(bloodGroup)}
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 block">
                      Blood Requirement
                    </span>
                    <span className="font-serif text-base font-bold text-[#053845]">
                      {unitsRequired} {unitsRequired === 1 ? "Unit" : "Units"} &bull;{" "}
                      {mapBloodComponentToDisplay(bloodComponent)}
                    </span>
                  </div>
                </div>

                {isEmergency && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#fdf2f2] text-[#A2363A] border border-[#A2363A]/30">
                    Critical Emergency
                  </span>
                )}
              </div>

              {/* Compact Two-Column Information Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Left Column */}
                <div className="space-y-3.5">
                  {/* Section B – Patient Details */}
                  <div className="p-3.5 rounded-xl bg-white border border-[#F3E9D1] space-y-2">
                    <h4 className="font-serif text-sm font-bold text-[#053845] pb-1.5 border-b border-[#F3E9D1]/70">
                      Patient Details
                    </h4>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div className="col-span-2">
                        <dt className="text-[11px] text-slate-500">Patient Name</dt>
                        <dd className="font-semibold text-[#053845]">{patientName}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Age &amp; Gender</dt>
                        <dd className="font-medium text-slate-700">
                          {patientAge} yrs &bull; {patientGender}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Contact Number</dt>
                        <dd className="font-medium text-slate-700">{patientContact}</dd>
                      </div>
                    </dl>
                  </div>

                  {/* Section C – Urgency & Schedule */}
                  <div className="p-3.5 rounded-xl bg-white border border-[#F3E9D1] space-y-2">
                    <h4 className="font-serif text-sm font-bold text-[#053845] pb-1.5 border-b border-[#F3E9D1]/70">
                      Urgency &amp; Schedule
                    </h4>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <dt className="text-[11px] text-slate-500">Urgency Level</dt>
                        <dd className="font-semibold text-[#B94F30]">
                          {URGENCY_LEVELS.find((u) => u.value === urgencyLevel)?.label ||
                            urgencyLevel}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Broadcast Radius</dt>
                        <dd className="font-medium text-slate-700">{searchRadius} km</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-[11px] text-slate-500">Required Date &amp; Time</dt>
                        <dd className="font-medium text-[#053845]">
                          {requiredByDate} at {requiredByTime}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-3.5">
                  {/* Section D – Hospital Details */}
                  <div className="p-3.5 rounded-xl bg-white border border-[#F3E9D1] space-y-2">
                    <h4 className="font-serif text-sm font-bold text-[#053845] pb-1.5 border-b border-[#F3E9D1]/70">
                      Hospital Details
                    </h4>
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-[11px] text-slate-500">Hospital / Facility</dt>
                        <dd className="font-semibold text-[#053845]">
                          {selectedHospitalId && selectedHospitalId !== "OTHER"
                            ? hospitals.find((h) => h.hospitalid === selectedHospitalId)
                                ?.hospitalname || "Registered Hospital"
                            : hospitalNameManual || "Local Clinical Facility"}
                        </dd>
                      </div>
                      {hospitalLocationManual && (
                        <div>
                          <dt className="text-[11px] text-slate-500">Ward / ICU / Room</dt>
                          <dd className="font-medium text-slate-700">
                            {hospitalLocationManual}
                          </dd>
                        </div>
                      )}
                      {notes.trim() && (
                        <div>
                          <dt className="text-[11px] text-slate-500">Additional Notes</dt>
                          <dd className="text-slate-600 line-clamp-2">{notes.trim()}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Section E – Prescription */}
                  <div className="p-3.5 rounded-xl bg-white border border-[#F3E9D1] space-y-2">
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#F3E9D1]/70">
                      <h4 className="font-serif text-sm font-bold text-[#053845]">
                        Prescription
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Attached &bull; Pending Review
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#317786] shrink-0" />
                      <span className="font-semibold text-[#053845] truncate">
                        {prescriptionFile ? prescriptionFile.name : "Prescription Document"}
                      </span>
                      {prescriptionFile && (
                        <span className="text-[11px] text-slate-500 shrink-0">
                          ({(prescriptionFile.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      )}
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-0.5">
                      <div>
                        <dt className="text-[11px] text-slate-500">Prescribing Doctor</dt>
                        <dd className="font-medium text-slate-700 truncate">
                          {doctorName.trim() || "Not specified"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-slate-500">Issuing Clinic</dt>
                        <dd className="font-medium text-slate-700 truncate">
                          {prescriptionHospitalName.trim() || "Not specified"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-[#fdf2f2] border border-[#A2363A]/30 text-xs text-[#A2363A]">
                  {submitError}
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="px-5 py-3.5 border-t border-[#F3E9D1] bg-[#FAF6EE]/60 flex items-center justify-end gap-3 shrink-0">
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
                className="px-6 py-2.5 rounded-xl bg-[#B94F30] hover:bg-[#a14023] text-white text-xs font-semibold shadow-2xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60"
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
