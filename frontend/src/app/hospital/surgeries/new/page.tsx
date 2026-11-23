"use client";

import React, { useState, useEffect, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  ArrowLeft,
  Calendar,
  Clock,
  Droplets,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Info,
  Loader2,
  BookOpen,
} from "lucide-react";
import {
  api,
  ProcedureConfigItem,
  ProcedureEstimateResult,
} from "@/lib/api";

const BLOOD_GROUPS = [
  { value: "TYPING_PENDING", label: "Typing Pending / Unknown (Pre-Op Lab Ordered)" },
  { value: "O_POSITIVE", label: "O Positive (O+)" },
  { value: "O_NEGATIVE", label: "O Negative (O-)" },
  { value: "A_POSITIVE", label: "A Positive (A+)" },
  { value: "A_NEGATIVE", label: "A Negative (A-)" },
  { value: "B_POSITIVE", label: "B Positive (B+)" },
  { value: "B_NEGATIVE", label: "B Negative (B-)" },
  { value: "AB_POSITIVE", label: "AB Positive (AB+)" },
  { value: "AB_NEGATIVE", label: "AB Negative (AB-)" },
];

export default function NewSurgeryPlanPage() {
  const router = useRouter();
  const procedureDatalistId = useId();

  // Form State
  const [patientReference, setPatientReference] = useState("");
  const [patientAge, setPatientAge] = useState<number | "">(45);
  const [patientGender, setPatientGender] = useState("MALE");
  const [patientBloodGroup, setPatientBloodGroup] = useState("TYPING_PENDING");
  const [procedureName, setProcedureName] = useState("");
  const [category, setCategory] = useState("General Surgery");
  const [scheduledDate, setScheduledDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | "">(120);
  const [clinicalNotes, setClinicalNotes] = useState("");

  // Optional Clinician Override
  const [hasClinicianSpecification, setHasClinicianSpecification] = useState(false);
  const [clinicianComponent, setClinicianComponent] = useState("RBC");
  const [clinicianUnits, setClinicianUnits] = useState<number>(2);

  // Guidelines & Dynamic Estimation State
  const [configs, setConfigs] = useState<ProcedureConfigItem[]>([]);
  const [estimate, setEstimate] = useState<ProcedureEstimateResult | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Minimum allowed date-time is tomorrow or 2 hours from now
  const minDateTime = new Date(Date.now() + 2 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  // Fetch hospital approved procedure guidelines on mount
  useEffect(() => {
    async function loadConfigs() {
      try {
        const res = await api.hospital.surgeries.getConfigs();
        if (res.success) {
          setConfigs(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch procedure configs:", err);
      }
    }
    loadConfigs();
  }, []);

  // Calculate dynamic estimate when procedureName changes
  useEffect(() => {
    if (!procedureName.trim()) {
      setEstimate(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsEstimating(true);
      try {
        const res = await api.hospital.surgeries.getEstimate(procedureName.trim());
        if (res.success) {
          setEstimate(res.data);
          if (res.data.category) {
            setCategory(res.data.category);
          }
        }
      } catch (err) {
        console.error("Error calculating estimate:", err);
      } finally {
        setIsEstimating(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [procedureName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!patientReference.trim()) {
      setErrorMessage("Patient reference / Case ID is required.");
      return;
    }

    if (!procedureName.trim()) {
      setErrorMessage("Procedure name is required.");
      return;
    }

    if (!scheduledDate) {
      setErrorMessage("Scheduled surgery date and time is required.");
      return;
    }

    const surgeryTime = new Date(scheduledDate).getTime();
    if (isNaN(surgeryTime) || surgeryTime <= Date.now()) {
      setErrorMessage("Surgery date must be set in the future for pre-operative planning.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        patientreference: patientReference.trim(),
        patientage: Number(patientAge) || 45,
        patientgender: patientGender,
        patientbloodgroup:
          patientBloodGroup === "TYPING_PENDING" ? null : patientBloodGroup,
        procedurename: procedureName.trim(),
        category: category.trim() || null,
        scheduleddate: new Date(scheduledDate).toISOString(),
        expecteddurationminutes: Number(durationMinutes) || 120,
        clinicalnotes: clinicalNotes.trim() || null,
      };

      if (hasClinicianSpecification) {
        payload.clinicianspecifiedcomponent = clinicianComponent;
        payload.clinicianspecifiedunits = clinicianUnits;
      }

      const res = await api.hospital.surgeries.create(payload);
      if (res.success && res.data?.surgeryid) {
        router.push(`/hospital/surgeries/${res.data.surgeryid}`);
      } else {
        router.push("/hospital/surgeries");
      }
    } catch (err: any) {
      console.error("Failed to create surgery plan:", err);
      setErrorMessage(
        err?.message || "Failed to schedule surgery plan. Please check all fields."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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
          href="/hospital/surgeries"
          className="hover:text-[#053845] transition-colors"
        >
          Surgery Planner
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-700">Plan New Surgery</span>
      </nav>

      {/* 2. Compact Page Header */}
      <header className="pb-4 border-b border-[#317786]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#053845]">
              Plan New Surgical Procedure
            </h1>
            <p className="text-xs text-slate-500">
              Pre-operative blood requirement planning and hospital MSBOS guideline crossmatch.
            </p>
          </div>
        </div>

        <Link
          href="/hospital/surgeries"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#F3E9D1] bg-white text-xs font-semibold text-[#053845] hover:bg-[#FAF6EE] shadow-2xs transition-all self-start sm:self-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Surgeries</span>
        </Link>
      </header>

      <div className="mt-2">
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Patient Information */}
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-serif font-bold text-[#053845] mb-4 flex items-center gap-2">
              <span>1. Patient & Demographics</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Patient Reference */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Patient Reference / Case ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PAT-2026-8941 or UHID-9021"
                  value={patientReference}
                  onChange={(e) => setPatientReference(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Confidential hospital case ID or clinical registration identifier.
                </span>
              </div>

              {/* Patient Blood Group */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Blood Group (ABO/Rh) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={patientBloodGroup}
                  onChange={(e) => setPatientBloodGroup(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                >
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg.value} value={bg.value}>
                      {bg.label}
                    </option>
                  ))}
                </select>
                {patientBloodGroup === "TYPING_PENDING" ? (
                  <span className="text-[11px] text-amber-700 mt-1 flex items-center gap-1 font-medium">
                    <Info className="w-3.5 h-3.5" />
                    Pre-op typing is pending. Compatibility checks will require lab confirmation.
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Confirmed recipient blood group.
                  </span>
                )}
              </div>

              {/* Age */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Patient Age <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="125"
                  required
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Patient Gender <span className="text-rose-500">*</span>
                </label>
                <select
                  value={patientGender}
                  onChange={(e) => setPatientGender(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Procedure & Scheduling */}
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-serif font-bold text-[#053845] mb-4">
              2. Procedure Details & Schedule
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Procedure Name with Suggestions */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Surgical Procedure Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list={procedureDatalistId}
                  placeholder="Select or enter surgery, e.g. Coronary Artery Bypass Graft (CABG), Total Knee Arthroplasty (TKA)..."
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                />
                <datalist id={procedureDatalistId}>
                  {configs.map((c) => (
                    <option key={c.configid} value={c.procedurename}>
                      {c.category} — {c.defaultunits} unit(s) {c.defaultcomponent}
                    </option>
                  ))}
                </datalist>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Select an approved hospital guideline or type any scheduled procedure.
                </span>
              </div>

              {/* Surgery Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Surgical Specialty / Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Cardiothoracic, Orthopedic, General Surgery"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                />
              </div>

              {/* Expected Duration */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Expected Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : "")}
                  placeholder="120"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                />
              </div>

              {/* Scheduled Date & Time */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Scheduled Surgery Date & Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  min={minDateTime}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Pre-operative planning date must be in the future.
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic MSBOS Clinical Requirement Box */}
          <div className="bg-[#FAF8F5] border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#317786]" />
                <h2 className="text-base font-serif font-bold text-[#053845]">
                  Clinical Blood Requirement Baseline (MSBOS)
                </h2>
              </div>
              {isEstimating && (
                <div className="flex items-center gap-1.5 text-xs text-[#317786]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating guidelines...</span>
                </div>
              )}
            </div>

            {!procedureName.trim() ? (
              <p className="text-xs text-slate-500 italic">
                Enter or select a surgical procedure above to load approved MSBOS blood order recommendations.
              </p>
            ) : estimate?.estimateAvailable ? (
              <div className="bg-white rounded-xl p-4 border border-emerald-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">
                      <CheckCircle2 className="w-3 h-3" />
                      Hospital-Approved Protocol
                    </span>
                    <h3 className="text-lg font-serif font-bold text-[#053845] mt-2">
                      Recommended: {estimate.defaultUnits} unit(s) of {estimate.defaultComponent}
                      {estimate.secondaryUnits ? ` + ${estimate.secondaryUnits} unit(s) of ${estimate.secondaryComponent}` : ""}
                    </h3>
                  </div>

                  {estimate.transfusionProbability !== null && (
                    <div className="text-right shrink-0">
                      <span className="text-xs text-slate-500 block">Transfusion Probability</span>
                      <span className="text-lg font-bold text-[#317786]">
                        {estimate.transfusionProbability}%
                      </span>
                    </div>
                  )}
                </div>

                {estimate.clinicalRationale && (
                  <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="font-semibold text-slate-700">Clinical Rationale: </span>
                    {estimate.clinicalRationale}
                  </p>
                )}

                {/* Audit & Governance Citations */}
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-500">
                  <div>
                    <span className="font-semibold block text-slate-700">Guideline Source:</span>
                    <span>{estimate.guidelineSource} (v{estimate.guidelineVersion})</span>
                    {estimate.guidelineCitation && (
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Citation: {estimate.guidelineCitation}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-700">Approval Authority:</span>
                    <span>{estimate.approvalAuthority}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-slate-700">Effective Date:</span>
                    <span>{estimate.effectiveDate ? new Date(estimate.effectiveDate).toLocaleDateString() : "Active"}</span>
                  </div>
                </div>

                {estimate.requiresHospitalApproval && (
                  <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <span className="font-semibold">Institutional Review Required: </span>
                    This surgical baseline protocol requires individual hospital transfusion committee ratification before clinical order execution.
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900">
                <div className="flex items-center gap-2 font-semibold text-sm text-amber-800">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Estimate unavailable – Clinical review required</span>
                </div>
                <p className="text-xs text-amber-800/80 mt-1">
                  In accordance with medical safety policies, arbitrary transfusion estimates are not
                  generated. Once planned, an authorized clinical reviewer will set and approve the patient&apos;s
                  pre-operative requirements.
                </p>
              </div>
            )}

            {/* Optional Clinician Specification at Scheduling Time */}
            <div className="mt-4 pt-4 border-t border-[#F3E9D1]">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={hasClinicianSpecification}
                  onChange={(e) => setHasClinicianSpecification(e.target.checked)}
                  className="rounded text-[#317786] focus:ring-[#317786]"
                />
                <span>Specify Clinician Requirement at planning time (Optional)</span>
              </label>

              {hasClinicianSpecification && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 bg-white p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Component
                    </label>
                    <select
                      value={clinicianComponent}
                      onChange={(e) => setClinicianComponent(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                      <option value="RBC">Red Blood Cells (RBC)</option>
                      <option value="WHOLE_BLOOD">Whole Blood</option>
                      <option value="PLASMA">Plasma (FFP)</option>
                      <option value="PLATELETS">Platelets</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Units Required
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={clinicianUnits}
                      onChange={(e) => setClinicianUnits(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Notes & Pre-Op Considerations */}
          <div className="bg-white border border-[#F3E9D1] rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-serif font-bold text-[#053845] mb-2">
              3. Clinical Notes & Pre-Op Considerations
            </h2>
            <textarea
              rows={3}
              placeholder="e.g. Patient on antiplatelet therapy, crossmatch serum sent to blood bank, autologous donation planned, etc."
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#317786]/20 focus:border-[#317786]"
            />
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link
              href="/hospital/surgeries"
              className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#317786] text-white hover:bg-[#286370] font-medium text-sm shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Surgery Plan...</span>
                </>
              ) : (
                <span>Confirm & Create Surgery Plan</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
