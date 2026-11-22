"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Droplets,
  Boxes,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  MapPin,
  Calendar,
  AlertCircle,
  Layers,
  PackagePlus,
  SlidersHorizontal,
  CheckCircle2,
  Loader2,
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
      <div className="space-y-5 animate-pulse max-w-6xl mx-auto pb-12">
        <div className="h-16 rounded-2xl bg-white border border-[#F3E9D1] p-4 flex items-center justify-between">
          <div className="h-5 w-48 bg-slate-200 rounded"></div>
          <div className="h-8 w-32 bg-slate-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-white border border-[#F3E9D1] p-4"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 h-64 rounded-2xl bg-white border border-[#F3E9D1]"></div>
          <div className="h-64 rounded-2xl bg-white border border-[#F3E9D1]"></div>
        </div>
      </div>
    );
  }

  // Unlinked facility profile prompt
  if (!bloodbank) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto text-[#317786]">
          <Building2 className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h1 className="font-serif text-xl font-bold text-[#053845]">
            Complete Your Blood Bank Profile
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your account is authenticated as a Blood Bank user, but your facility profile has not been registered yet. Complete setup to begin managing licensed inventory.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/bloodbank/profile"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white font-semibold text-xs shadow-2xs transition-colors"
          >
            <span>Register Facility Profile</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const approvalStatus = bloodbank.approvalstatus || "APPROVED";
  const isRejected = approvalStatus === "REJECTED";
  const isApproved = !isRejected;

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      {/* 1. Compact Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#317786]/15">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              {bloodbank.bloodbankname}
            </h1>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                isApproved
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : isRejected
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isApproved ? "bg-emerald-500" : isRejected ? "bg-rose-500" : "bg-amber-500"
                }`}
              />
              <span>
                {isApproved
                  ? "Verified"
                  : isRejected
                  ? "Deactivated"
                  : "Pending Verification"}
              </span>
            </span>
          </div>

          <p className="text-xs sm:text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#317786]" />
              <span>{bloodbank.city ? `${bloodbank.city}, ${bloodbank.state || ""}` : "Regional Storage Center"}</span>
            </span>
            {bloodbank.licensenumber && (
              <>
                <span className="text-slate-300">•</span>
                <span className="font-mono text-[11px]">License: {bloodbank.licensenumber}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh dashboard stats"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/bloodbank/inventory"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] shadow-2xs transition-colors cursor-pointer"
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Manage Inventory</span>
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => loadData()}
            className="font-semibold text-rose-700 hover:text-rose-900 underline cursor-pointer text-xs shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Four Compact Summary Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Available Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Available Units</span>
            <div className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center">
              <Droplets className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#053845]">
            {dashboard?.totalUnitsAvailable ?? 0}
          </div>
        </div>

        {/* Reserved Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Reserved Units</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Boxes className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#053845]">
            {dashboard?.totalUnitsReserved ?? 0}
          </div>
        </div>

        {/* Active Batches */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Active Batches</span>
            <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] text-[#053845] flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="font-serif text-2xl font-bold text-[#053845]">
            {dashboard?.totalInventoryRecords ?? 0}
          </div>
        </div>

        {/* Verification Status */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Verification Status</span>
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isApproved
                  ? "bg-emerald-50 text-emerald-700"
                  : isRejected
                  ? "bg-rose-50 text-rose-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div
            className={`font-serif text-lg sm:text-xl font-bold ${
              isApproved ? "text-emerald-700" : isRejected ? "text-rose-700" : "text-amber-700"
            }`}
          >
            {isApproved ? "Verified" : isRejected ? "Deactivated" : "Pending"}
          </div>
        </div>
      </div>

      {/* 3. Main Two-Column Layout: Left (Recent Inventory), Right (Facility Details) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column (2 Cols): Recent Inventory Activity */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#F3E9D1] flex items-center justify-between">
              <h2 className="font-serif text-base font-bold text-[#053845]">
                Recent Inventory Activity
              </h2>
              <Link
                href="/bloodbank/inventory"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                <span>View all ({dashboard?.totalInventoryRecords ?? 0})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* List / Clean Empty State */}
            {!dashboard?.recentInventory || dashboard.recentInventory.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-2 text-[#317786]">
                  <Droplets className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-[#053845]">
                  No Inventory Records Available
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-0.5">
                  No stock units logged yet. Register stock intake to populate this vault.
                </p>
                <div className="mt-3.5">
                  <Link
                    href="/bloodbank/inventory"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors shadow-2xs cursor-pointer"
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>Stock Intake / Register Lot</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[#F3E9D1]/60">
                {dashboard.recentInventory.map((item) => (
                  <div
                    key={item.inventoryid}
                    className="p-3.5 sm:p-4 hover:bg-[#FAF6EE]/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {/* Blood Group Badge */}
                      <div className="w-10 h-10 rounded-xl bg-[#B94F30]/10 border border-[#B94F30]/25 text-[#B94F30] flex items-center justify-center font-serif text-sm font-bold shrink-0">
                        {formatBloodGroup(item.bloodgroup)}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-xs sm:text-sm text-[#053845]">
                            {formatComponent(item.bloodcomponent)}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                            LOT #{item.inventoryid.slice(0, 8)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
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
                          <span className="text-slate-400 flex items-center gap-1">
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

                    <div className="shrink-0 self-end sm:self-center">
                      <Link
                        href="/bloodbank/inventory"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#317786] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors"
                      >
                        <SlidersHorizontal className="w-3 h-3 text-[#317786]" />
                        <span>Manage</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1 Col): Compact Facility Details Card */}
        <div>
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#F3E9D1]">
              <h2 className="font-serif text-sm font-bold text-[#053845] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#317786]" />
                <span>Facility Details</span>
              </h2>
              <Link
                href="/bloodbank/profile"
                className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
              >
                Edit
              </Link>
            </div>

            <dl className="space-y-2.5 text-xs">
              <div>
                <dt className="text-[11px] text-slate-400 font-medium">Facility Name</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">{bloodbank.bloodbankname}</dd>
              </div>

              <div>
                <dt className="text-[11px] text-slate-400 font-medium">License Number</dt>
                <dd className="font-mono text-slate-800 mt-0.5">{bloodbank.licensenumber}</dd>
              </div>

              <div>
                <dt className="text-[11px] text-slate-400 font-medium">Authorized Officer</dt>
                <dd className="text-slate-800 mt-0.5">{bloodbank.contactpersonname}</dd>
              </div>

              <div>
                <dt className="text-[11px] text-slate-400 font-medium">Phone Number</dt>
                <dd className="font-mono text-slate-800 mt-0.5">{bloodbank.contactpersonphone}</dd>
              </div>

              <div>
                <dt className="text-[11px] text-slate-400 font-medium">Location</dt>
                <dd className="text-slate-800 mt-0.5">
                  {bloodbank.city}, {bloodbank.state} ({bloodbank.pincode})
                </dd>
              </div>
            </dl>

            {/* Small, simple compliance indicator */}
            <div className="pt-2 border-t border-[#F3E9D1]/70 flex items-center gap-1.5 text-[11px] text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>2°C to 6°C Cold Storage &amp; Audit Compliant</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Bottom Quick Actions: Stock Intake & Adjust Inventory */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Link
          href="/bloodbank/inventory"
          className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs hover:border-[#317786]/40 transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#317786]/10 text-[#317786] flex items-center justify-center shrink-0">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#053845] group-hover:text-[#317786] transition-colors">
                Stock Intake
              </h3>
              <p className="text-xs text-slate-500">
                Register new incoming blood units or lot intake
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#317786] transition-colors shrink-0" />
        </Link>

        <Link
          href="/bloodbank/inventory"
          className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs hover:border-[#317786]/40 transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#053845] group-hover:text-[#317786] transition-colors">
                Adjust Inventory
              </h3>
              <p className="text-xs text-slate-500">
                Perform audited stock updates and quantity corrections
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#317786] transition-colors shrink-0" />
        </Link>
      </div>
    </div>
  );
}
