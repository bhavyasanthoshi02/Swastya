"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Heart,
  Building2,
  Building,
  Users,
  ShieldCheck,
  Droplets,
  Calendar,
  MapPin,
  FileBadge,
  Briefcase,
  Check,
} from "lucide-react";

type RoleType = "donor" | "hospital" | "bloodbank" | "patient";

interface RoleOption {
  id: RoleType;
  title: string;
  category: string;
  description: string;
  icon: React.ElementType;
}

const ROLES: RoleOption[] = [
  {
    id: "donor",
    title: "Blood Donor",
    category: "Voluntary Community",
    description: "Register to help patients find compatible donors when every minute counts.",
    icon: Heart,
  },
  {
    id: "hospital",
    title: "Hospital",
    category: "Clinical Care",
    description: "Coordinate clinical blood requests and connect with accredited storage facilities.",
    icon: Building2,
  },
  {
    id: "bloodbank",
    title: "Blood Bank",
    category: "Storage & Supply",
    description: "Maintain licensed inventory readiness and respond directly to clinical requests.",
    icon: Building,
  },
  {
    id: "patient",
    title: "Patient / Requester",
    category: "Patients & Families",
    description: "Submit and follow urgent blood requirements with clear status traceability.",
    icon: Users,
  },
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function SignUpPage() {
  const router = useRouter();

  // Wizard state: 'role' (Step 1) or 'form' (Step 2)
  const [step, setStep] = useState<"role" | "form">("role");
  const [role, setRole] = useState<RoleType>("donor");

  // Common Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Donor-Specific Fields
  const [dob, setDob] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [donorState, setDonorState] = useState("");
  const [donorCity, setDonorCity] = useState("");
  const [donorPincode, setDonorPincode] = useState("");

  // Institutional Fields (Hospital / Blood Bank)
  const [orgName, setOrgName] = useState("");
  const [designation, setDesignation] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [address, setAddress] = useState("");
  const [instState, setInstState] = useState("");
  const [instCity, setInstCity] = useState("");
  const [instPincode, setInstPincode] = useState("");

  // Patient / Requester Fields
  const [patientCity, setPatientCity] = useState("");

  const handleContinueToForm = () => {
    setStep("form");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Frontend-only: proceed directly to next page (dashboard)
    router.push("/dashboard");
  };

  const activeRoleConfig = ROLES.find((r) => r.id === role)!;

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#FAF6EE] text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845]">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#F3E9D1] bg-white/80 backdrop-blur-sm sticky top-0 z-30 flex-shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {step === "form" ? (
            <button
              type="button"
              onClick={() => setStep("role")}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#053845] hover:text-[#317786] transition-colors group cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Change Role
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#053845] hover:text-[#317786] transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              Back to Home
            </Link>
          )}

          <div className="text-xs sm:text-sm text-slate-600">
            Have an account?{" "}
            <Link href="/signin" className="font-semibold text-[#317786] hover:text-[#245964] hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow flex items-center justify-center py-6 sm:py-10 px-4 sm:px-6">
        {step === "role" ? (
          /* =========================================================================
             STEP 1: REFINED ROLE SELECTION (Centered 2x2 Grid with Continue Button)
             ========================================================================= */
          <div className="w-full max-w-2xl mx-auto space-y-6">
            {/* Header Introduction */}
            <div className="text-center space-y-1.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Create your Swastya account
              </h1>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed max-w-lg mx-auto">
                Join the smart blood coordination network. Select how you will participate to access the dedicated tools suited to your workflow.
              </p>
            </div>

            {/* 2 x 2 Role Selection Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {ROLES.map((r) => {
                const IconComponent = r.icon;
                const isSelected = role === r.id;

                return (
                  <div
                    key={r.id}
                    onClick={() => setRole(r.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setRole(r.id);
                      }
                    }}
                    className={`text-left p-4 sm:p-5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? "bg-[#317786]/5 border-[#317786] shadow-xs"
                        : "bg-white border-slate-200/90 hover:border-[#317786]/40 hover:bg-slate-50/50 shadow-2xs"
                    }`}
                  >
                    <div>
                      {/* Top Row: Category Label & Selection Indicator */}
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span
                          className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${
                            isSelected
                              ? "bg-[#317786]/15 text-[#317786]"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {r.category}
                        </span>

                        {/* Subtle Selection Indicator */}
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                            isSelected
                              ? "border-[#317786] bg-[#317786] text-white"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                      </div>

                      {/* Role Header with Icon */}
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected
                              ? "bg-[#317786] text-white"
                              : "bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]"
                          }`}
                        >
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <h2 className="font-serif text-lg font-bold text-[#053845] leading-tight">
                          {r.title}
                        </h2>
                      </div>

                      {/* Full Concise Description (No truncation) */}
                      <p className="text-xs text-slate-600 leading-relaxed mt-1">
                        {r.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions: Prominent Continue Button */}
            <div className="space-y-3 pt-1 text-center">
              <button
                type="button"
                onClick={handleContinueToForm}
                className="w-full sm:w-auto min-w-[220px] py-3 px-8 rounded-xl font-medium text-sm text-white bg-[#317786] hover:bg-[#245964] active:bg-[#1b444c] shadow-xs hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#317786] focus:ring-offset-2 cursor-pointer inline-flex items-center justify-center gap-2"
              >
                Continue as {activeRoleConfig.title}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="text-xs text-slate-500">
                Already registered on Swastya?{" "}
                <Link href="/signin" className="font-semibold text-[#317786] hover:text-[#245964] hover:underline">
                  Sign in to your account
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             STEP 2: ROLE-SPECIFIC REGISTRATION FORM (Proceeds directly to dashboard)
             ========================================================================= */
          <div className="w-full max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-xs p-5 sm:p-7">
              {/* Form Title */}
              <div className="pb-3.5 mb-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] uppercase tracking-wider font-bold text-[#317786]">
                      {activeRoleConfig.category}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs font-semibold text-[#053845]">{activeRoleConfig.title}</span>
                  </div>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] mt-0.5">
                    {role === "donor" && "Blood Donor Registration"}
                    {role === "hospital" && "Hospital Facility Registration"}
                    {role === "bloodbank" && "Blood Bank Registration"}
                    {role === "patient" && "Patient / Requester Registration"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setStep("role")}
                  className="text-xs text-[#317786] hover:text-[#245964] hover:underline font-medium cursor-pointer"
                >
                  Change role
                </button>
              </div>

              <form onSubmit={handleSubmit} noValidate className="space-y-3">
                {/* ROLE 1: DONOR */}
                {role === "donor" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-8">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Full Legal Name
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Arun Kumar"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Blood Group
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[#B94F30]">
                            <Droplets className="h-3.5 w-3.5" />
                          </div>
                          <select
                            value={bloodGroup}
                            onChange={(e) => setBloodGroup(e.target.value)}
                            className="w-full pl-8 pr-2 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 cursor-pointer"
                          >
                            {BLOOD_GROUPS.map((bg) => (
                              <option key={bg} value={bg}>{bg}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Date of Birth
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Calendar className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="date"
                            value={dob}
                            onChange={(e) => setDob(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={donorCity}
                          onChange={(e) => setDonorCity(e.target.value)}
                          placeholder="e.g. Hyderabad"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={donorState}
                          onChange={(e) => setDonorState(e.target.value)}
                          placeholder="e.g. Telangana"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Area or PIN Code
                        </label>
                        <input
                          type="text"
                          value={donorPincode}
                          onChange={(e) => setDonorPincode(e.target.value)}
                          placeholder="e.g. 500081"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] text-slate-600 flex items-start gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#317786] flex-shrink-0 mt-0.5" />
                      <p className="leading-snug">
                        <span className="font-semibold text-[#053845]">Eligibility Note:</span> A brief clinical eligibility check will be required before you are available for donor matching.
                      </p>
                    </div>
                  </>
                )}

                {/* ROLE 2: HOSPITAL */}
                {role === "hospital" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Hospital / Clinic Name
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Building2 className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            placeholder="e.g. City General Hospital"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Representative Full Name
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Dr. Meera Nambiar"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Representative Designation
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Briefcase className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={designation}
                            onChange={(e) => setDesignation(e.target.value)}
                            placeholder="e.g. Transfusion Officer"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Registration / License Number
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <FileBadge className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={regNumber}
                            onChange={(e) => setRegNumber(e.target.value)}
                            placeholder="e.g. HOSP-2024-912"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Facility Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Plot 14, Health Park, Medical Square"
                          className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={instCity}
                          onChange={(e) => setInstCity(e.target.value)}
                          placeholder="e.g. Bengaluru"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={instState}
                          onChange={(e) => setInstState(e.target.value)}
                          placeholder="e.g. Karnataka"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          PIN Code
                        </label>
                        <input
                          type="text"
                          value={instPincode}
                          onChange={(e) => setInstPincode(e.target.value)}
                          placeholder="e.g. 560001"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] text-slate-600 flex items-start gap-2">
                      <Building2 className="w-3.5 h-3.5 text-[#317786] flex-shrink-0 mt-0.5" />
                      <p className="leading-snug">
                        <span className="font-semibold text-[#053845]">Verification Note:</span> Hospital accounts undergo administrative verification before accessing inter-facility coordination channels.
                      </p>
                    </div>
                  </>
                )}

                {/* ROLE 3: BLOOD BANK */}
                {role === "bloodbank" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Blood Bank / Center Name
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Building className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            placeholder="e.g. Metro Blood Center"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Blood Bank License Number
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <FileBadge className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={regNumber}
                            onChange={(e) => setRegNumber(e.target.value)}
                            placeholder="e.g. DL-BB-77291/CL"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          In-Charge / Officer Name
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Dr. K. S. Raman"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Officer Designation
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Briefcase className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={designation}
                            onChange={(e) => setDesignation(e.target.value)}
                            placeholder="e.g. Chief Blood Bank Officer"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                        Facility Street Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="e.g. 108 Red Cross Avenue, Central Wing"
                          className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={instCity}
                          onChange={(e) => setInstCity(e.target.value)}
                          placeholder="e.g. Mumbai"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={instState}
                          onChange={(e) => setInstState(e.target.value)}
                          placeholder="e.g. Maharashtra"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          PIN Code
                        </label>
                        <input
                          type="text"
                          value={instPincode}
                          onChange={(e) => setInstPincode(e.target.value)}
                          placeholder="e.g. 400001"
                          className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                        />
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] text-slate-600 flex items-start gap-2">
                      <Building className="w-3.5 h-3.5 text-[#317786] flex-shrink-0 mt-0.5" />
                      <p className="leading-snug">
                        <span className="font-semibold text-[#053845]">Inventory Protocol:</span> Component inventory counts are managed post-verification inside your secure registry.
                      </p>
                    </div>
                  </>
                )}

                {/* ROLE 4: PATIENT / REQUESTER */}
                {role === "patient" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          Full Name (Patient or Attendant)
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="e.g. Priya Venkatesh"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                          City or PIN Code
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <MapPin className="h-3.5 w-3.5" />
                          </div>
                          <input
                            type="text"
                            value={patientCity}
                            onChange={(e) => setPatientCity(e.target.value)}
                            placeholder="e.g. Chennai or 600001"
                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] text-slate-600 flex items-start gap-2">
                      <Users className="w-3.5 h-3.5 text-[#317786] flex-shrink-0 mt-0.5" />
                      <p className="leading-snug">
                        <span className="font-semibold text-[#053845]">Lightweight Registration:</span> Medical records and blood unit counts are provided only when raising a specific blood request.
                      </p>
                    </div>
                  </>
                )}

                {/* COMMON: EMAIL & PHONE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="h-3.5 w-3.5" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Phone className="h-3.5 w-3.5" />
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="10-digit contact number"
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                      />
                    </div>
                  </div>
                </div>

                {/* COMMON: PASSWORDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-3.5 w-3.5" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-3.5 w-3.5" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                      />
                    </div>
                  </div>
                </div>

                {/* TERMS CHECKBOX */}
                <div className="pt-1">
                  <div className="flex items-start">
                    <input
                      id="agreeTerms"
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="h-3.5 w-3.5 mt-0.5 rounded border-slate-300 text-[#317786] focus:ring-[#317786] focus:ring-offset-0 cursor-pointer"
                    />
                    <label htmlFor="agreeTerms" className="ml-2 text-[11px] text-slate-600 cursor-pointer select-none leading-snug">
                      I agree to Swastya&apos;s <span className="font-semibold text-[#053845]">Terms of Service</span> and <span className="font-semibold text-[#053845]">Privacy Policy</span>.
                    </label>
                  </div>
                </div>

                {/* SUBMIT BUTTON */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl font-medium text-xs sm:text-sm text-white bg-[#317786] hover:bg-[#245964] active:bg-[#1b444c] shadow-xs hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-[#317786] focus:ring-offset-2 cursor-pointer"
                  >
                    Create {activeRoleConfig.title} Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-[#F3E9D1] py-3 text-center text-[10px] sm:text-[11px] text-slate-400 bg-white/40 flex-shrink-0">
        <p>© 2026 Swastya Health Systems. All rights reserved. Platform designed solely for coordination support.</p>
      </footer>
    </div>
  );
}
