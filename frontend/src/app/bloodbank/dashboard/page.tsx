"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building,
  Building2,
  Droplets,
  Boxes,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  MapPin,
  Phone,
  FileBadge,
  Calendar,
  AlertCircle,
  Activity,
  Layers,
  Sparkles,
  PackagePlus,
  SlidersHorizontal,
  CheckCircle2,
} from "lucide-react";
import { api, BloodBankDashboardData } from "@/lib/api";
import { AuthBloodBank, getStoredBloodBank } from "@/lib/auth";

export default function BloodBankDashboardPage() {
  const [bloodbank, setBloodbank] = useState<AuthBloodBank | null>(null);
  const [dashboard, setDashboard] = useState<BloodBankDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      // 1. Fetch authenticated blood bank profile
      const profileRes = await api.bloodbank.getProfile();
      if (!profileRes.success || !profileRes.bloodbank) {
        setBloodbank(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const bb = profileRes.bloodbank;
      setBloodbank(bb);

      // 2. Fetch dashboard metrics using real facility ID
      const dashRes = await api.bloodbank.getDashboard(bb.bloodbankid);
      setDashboard(dashRes);
    } catch (err: any) {
      console.error("Error loading blood bank dashboard:", err);
      // Fallback to locally stored profile if network or unlinked
      const stored = getStoredBloodBank();
      if (stored) {
        setBloodbank(stored);
        try {
          const dashRes = await api.bloodbank.getDashboard(stored.bloodbankid);
          setDashboard(dashRes);
        } catch {
          setErrorMessage("Failed to load live metrics. Please try again.");
        }
      } else {
        setErrorMessage(
          err?.status === 404
            ? "No blood bank profile linked to this account yet."
            : err?.message || "Failed to load dashboard data."
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatBloodGroup = (bg: string): string => {
    const map: Record<string, string> = {
      A_POSITIVE: "A+",
      A_NEGATIVE: "A-",
      B_POSITIVE: "B+",
      B_NEGATIVE: "B-",
      AB_POSITIVE: "AB+",
      AB_NEGATIVE: "AB-",
      O_POSITIVE: "O+",
      O_NEGATIVE: "O-",
    };
    return map[bg] || bg;
  };

  const formatComponent = (comp: string): string => {
    const map: Record<string, string> = {
      WHOLE_BLOOD: "Whole Blood",
      PLATELETS: "Platelets",
      PLASMA: "Plasma",
      RBC: "Packed Red Blood Cells (RBC)",
    };
    return map[comp] || comp.replace(/_/g, " ");
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-48 rounded-3xl bg-[#053845]/20 p-8 flex flex-col justify-between">
          <div className="h-6 w-1/3 bg-[#053845]/30 rounded-md"></div>
          <div className="h-4 w-1/2 bg-[#053845]/20 rounded-md"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white border border-[#F3E9D1] p-4"></div>
          ))}
        </div>
        <div className="h-64 rounded-3xl bg-white border border-[#F3E9D1]"></div>
      </div>
    );
  }

  // Unlinked facility profile prompt
  if (!bloodbank) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto text-[#317786]">
          <Building className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-bold text-[#053845]">
            Complete Your Blood Bank Profile
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            Your account is authenticated as a Blood Bank user, but your facility profile has not been registered yet. Complete setup to begin managing licensed inventory.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/bloodbank/profile"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#317786] text-white font-semibold text-sm hover:bg-[#245964] transition-all shadow-xs"
          >
            <span>Register Facility Profile</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const approvalStatus = bloodbank.approvalstatus || "PENDING";
  const isPending = approvalStatus === "PENDING";
  const isApproved = approvalStatus === "APPROVED";
  const isRejected = approvalStatus === "REJECTED";

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Hero Welcome & Vital Readiness Bar (mirrors Donor and Hospital hero layout) */}
      <section className="bg-gradient-to-br from-[#053845] via-[#0b4d5e] to-[#053845] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Ambient background glow orbs */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#EFA27E]/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-1/3 -top-10 w-48 h-48 bg-[#317786]/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-[#EFA27E]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Accredited Clinical Blood Storage Vault</span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
              {bloodbank.bloodbankname}
            </h1>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              Storage and distribution desk active for{" "}
              <strong className="text-white font-bold">{bloodbank.city || "Regional Network"}</strong>. License:{" "}
              <strong className="font-mono text-[#EFA27E]">{bloodbank.licensenumber}</strong>. Currently maintaining{" "}
              <strong className="text-white font-bold">
                {dashboard?.totalUnitsAvailable ?? 0} units available
              </strong>{" "}
              across{" "}
              <strong className="text-white font-bold">
                {dashboard?.totalInventoryRecords ?? 0} active {dashboard?.totalInventoryRecords === 1 ? "batch" : "batches"}
              </strong>{" "}
              ready for clinical dispatch.
            </p>
          </div>

          <div className="flex flex-wrap md:flex-col items-start md:items-end gap-3 shrink-0">
            <Link
              href="/bloodbank/inventory"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-[1.02] cursor-pointer"
            >
              <Boxes className="w-4 h-4" />
              <span>Manage Inventory</span>
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-all cursor-pointer disabled:opacity-50"
                title="Refresh dashboard stats"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <span className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isApproved
                      ? "bg-emerald-400 animate-pulse"
                      : isRejected
                      ? "bg-rose-400"
                      : "bg-amber-400"
                  }`}
                />
                <span>
                  {isApproved
                    ? "Verified Vault"
                    : isRejected
                    ? "Deactivated"
                    : "Verification Pending"}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* 4 Vital Quick Stats Bar inside Hero */}
        <div className="relative z-10 mt-6 pt-6 border-t border-white/15 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Droplets className="w-3 h-3 text-[#EFA27E]" />
              Units Available
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-white">
              {dashboard?.totalUnitsAvailable ?? 0}
            </div>
            <p className="text-[11px] text-slate-300">Ready for clinical release</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Boxes className="w-3 h-3 text-amber-300" />
              Units Reserved
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-300">
              {dashboard?.totalUnitsReserved ?? 0}
            </div>
            <p className="text-[11px] text-slate-300">Assigned to hospital orders</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3 text-white" />
              Vault Batches
            </span>
            <div className="font-serif text-2xl sm:text-3xl font-bold text-white">
              {dashboard?.totalInventoryRecords ?? 0}
            </div>
            <p className="text-[11px] text-slate-300">Distinct component records</p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-300" />
              Accreditation
            </span>
            <div className="font-serif text-lg sm:text-xl font-bold text-emerald-300">
              {isApproved ? "CDSCO Verified" : "Review Pending"}
            </div>
            <p className="text-[11px] text-slate-300">
              {isApproved ? "Approved for emergency dispatch" : "Regulatory review active"}
            </p>
          </div>
        </div>
      </section>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong>Error loading facility metrics:</strong> {errorMessage}
            <button
              onClick={() => loadData()}
              className="ml-2 font-semibold underline hover:text-rose-900 cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout (mirrors Hospital & Requester layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        {/* Left Column (2 Cols): Recent Inventory Activity & Operational Actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
            <div className="p-6 border-b border-[#F3E9D1] bg-[#FAF6EE]/40 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#B94F30] animate-pulse" />
                  <span className="text-xs font-bold text-[#B94F30] uppercase tracking-wider">
                    Vault Inventory Pipeline
                  </span>
                </div>
                <h2 className="font-serif text-xl font-bold text-[#053845]">
                  Recent Inventory Activity
                </h2>
              </div>
              <Link
                href="/bloodbank/inventory"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>View all ({dashboard?.totalInventoryRecords ?? 0})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* List / Empty State */}
            {!dashboard?.recentInventory || dashboard.recentInventory.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
                  <Droplets className="w-7 h-7 text-[#317786]" />
                </div>
                <h3 className="text-base font-serif font-bold text-[#053845]">
                  No Inventory Records Available
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                  Your facility has not logged any stock units yet. Log stock intake or merge matching lots to populate this vault.
                </p>
                <div className="mt-5">
                  <Link
                    href="/bloodbank/inventory"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-xs"
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>Stock Intake / Register Lot</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#F3E9D1]/50">
                {dashboard.recentInventory.map((item) => (
                  <div
                    key={item.inventoryid}
                    className="p-5 hover:bg-[#FAF6EE]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      {/* Blood Group Badge */}
                      <div className="w-12 h-12 rounded-2xl bg-[#B94F30]/10 border border-[#B94F30]/25 text-[#B94F30] flex flex-col items-center justify-center font-serif text-base font-bold shrink-0 shadow-2xs">
                        <span className="leading-none">{formatBloodGroup(item.bloodgroup)}</span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-[#053845]">
                            {formatComponent(item.bloodcomponent)}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                            LOT #{item.inventoryid.slice(0, 8)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {item.unitsavailable} available
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1 text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {item.unitsreserved} reserved
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            Exp:{" "}
                            {item.expirydate
                              ? new Date(item.expirydate).toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                      <Link
                        href="/bloodbank/inventory"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
                        title="Manage batch"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-[#317786]" />
                        <span>Manage</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Vault Operations Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#317786]">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-sm font-bold text-[#053845]">
                  Stock Intake & Lot Merging
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Log newly received donor units with automatic detection of matching shelf lots for safe, idempotent intake.
                </p>
              </div>
              <Link
                href="/bloodbank/inventory"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#317786] hover:text-[#053845] pt-1 transition-colors"
              >
                <span>Open Intake Form</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-sm font-bold text-[#053845]">
                  Audited Stock Adjustments
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Perform regulatory quantity corrections with mandatory clinical reason logging and over-decrement safety.
                </p>
              </div>
              <Link
                href="/bloodbank/inventory"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#317786] hover:text-[#053845] pt-1 transition-colors"
              >
                <span>Adjust Vault Batches</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Cold Chain Governance & Facility Credentials */}
        <div className="space-y-6">
          {/* Cold Chain & Clinical Governance Card */}
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#e8f3f5] border border-[#317786]/25 flex items-center justify-center text-[#317786]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-sm font-bold text-[#053845]">
                  Cold Chain & Governance
                </h3>
                <p className="text-[11px] text-slate-500">CDSCO & WHO Safe Blood Standards</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              All stock intake, merges, and adjustments are written to an append-only, tamper-evident audit ledger with operator attribution and idempotency protection.
            </p>

            <div className="space-y-2.5 pt-1 text-xs text-slate-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>2°C to 6°C Red Cell Cold Storage Protocol</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Append-Only Ledger with Idempotency Guard</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Zero Over-Decrement Balance Protection</span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/bloodbank/inventory"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
              >
                <Boxes className="w-4 h-4 text-[#317786]" />
                <span>Open Vault Inventory</span>
              </Link>
            </div>
          </div>

          {/* Facility Credentials Card */}
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#F3E9D1]/70 mb-4">
              <h2 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#317786]" />
                <span>Facility Credentials</span>
              </h2>
              <Link
                href="/bloodbank/profile"
                className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                Edit
              </Link>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Facility Name
                </span>
                <span className="font-semibold text-slate-800 mt-0.5 block">
                  {bloodbank.bloodbankname}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  License Number
                </span>
                <span className="font-mono text-slate-800 mt-0.5 block">
                  {bloodbank.licensenumber}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Authorized Officer
                </span>
                <span className="text-slate-800 mt-0.5 block font-medium">
                  {bloodbank.contactpersonname}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Phone Number
                </span>
                <span className="text-slate-800 mt-0.5 block font-mono">
                  {bloodbank.contactpersonphone}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                  Location
                </span>
                <span className="text-slate-800 mt-0.5 block">
                  {bloodbank.city}, {bloodbank.state} ({bloodbank.pincode})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
