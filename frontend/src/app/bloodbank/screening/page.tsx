"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Droplets,
  Calendar,
  ShieldCheck,
  Loader2,
  Check,
  X,
  History,
  Trash2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import {
  api,
  InventoryUnitItem,
  UnitScreeningRecordItem,
} from "@/lib/api";
import { getStoredBloodBank, AuthBloodBank } from "@/lib/auth";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { formatDate } from "@/lib/mappers";

function formatBloodGroup(bg?: string | null): string {
  if (!bg) return "—";
  return bg
    .replace("_POSITIVE", "+")
    .replace("_NEGATIVE", "-")
    .replace("POSITIVE", "+")
    .replace("NEGATIVE", "-");
}

function formatComponentLabel(component?: string | null): string {
  if (!component) return "Whole Blood";
  if (component === "WHOLE_BLOOD") return "Whole Blood";
  if (component === "RBC") return "Packed Red Cells (RBC)";
  if (component === "PLATELETS") return "Platelets";
  if (component === "PLASMA") return "Plasma (FFP)";
  return component
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function renderMarkerBadge(status?: string | null, screeningStatus?: string) {
  if (!status) {
    if (screeningStatus === "PASSED") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
          <Check className="w-2.5 h-2.5" /> Neg
        </span>
      );
    }
    return (
      <span className="text-[10px] text-slate-400 font-mono">—</span>
    );
  }
  const isClear = status === "NON_REACTIVE" || status === "NEGATIVE" || status === "CLEAR";
  if (isClear) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
        <Check className="w-2.5 h-2.5" /> Neg
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
      <X className="w-2.5 h-2.5" /> Reactive
    </span>
  );
}

export default function BloodBankScreeningPage() {
  const [bloodbank, setBloodBank] = useState<AuthBloodBank | null>(null);
  const [units, setUnits] = useState<InventoryUnitItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Screening Modal State
  const [screeningTarget, setScreeningTarget] = useState<InventoryUnitItem | null>(null);
  const [hivResult, setHivResult] = useState<string>("NON_REACTIVE");
  const [hbvResult, setHbvResult] = useState<string>("NEGATIVE");
  const [hcvResult, setHcvResult] = useState<string>("NEGATIVE");
  const [syphilisResult, setSyphilisResult] = useState<string>("NON_REACTIVE");
  const [malariaResult, setMalariaResult] = useState<string>("NEGATIVE");
  const [labTechnicianName, setLabTechnicianName] = useState("");
  const [medicalOfficerName, setMedicalOfficerName] = useState("");
  const [testKitDetails, setTestKitDetails] = useState("4th Gen ELISA / CLIA Dual Verification");
  const [screeningNotes, setScreeningNotes] = useState("");
  const [isSubmittingScreening, setIsSubmittingScreening] = useState(false);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const [verifiers, setVerifiers] = useState<Array<{ userid: string; name: string; email: string; role: string }>>([]);
  const [selectedVerifierId, setSelectedVerifierId] = useState("");

  // Screening History Modal State
  const [historyTarget, setHistoryTarget] = useState<InventoryUnitItem | null>(null);
  const [historyRecords, setHistoryRecords] = useState<UnitScreeningRecordItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Discard Modal State
  const [discardTarget, setDiscardTarget] = useState<InventoryUnitItem | null>(null);
  const [discardReason, setDiscardReason] = useState("");
  const [isSubmittingDiscard, setIsSubmittingDiscard] = useState(false);

  const loadData = useCallback(async (background = false) => {
    try {
      if (background) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const profRes = await api.bloodbank.getProfile();
      const activeBb = profRes.success ? profRes.bloodbank : getStoredBloodBank();

      if (activeBb) {
        setBloodBank(activeBb);
        const [res, verRes] = await Promise.all([
          api.bloodbank.getUnits(activeBb.bloodbankid),
          api.bloodbank.getVerifiers(activeBb.bloodbankid).catch(() => ({ success: false, verifiers: [] })),
        ]);
        if (res.success) {
          setUnits(res.units || []);
        }
        if (verRes.success) {
          const list = verRes.verifiers || [];
          setVerifiers(list);
          if (list.length > 0 && !selectedVerifierId) {
            setSelectedVerifierId(list[0].userid);
          }
        }
      } else {
        setError("Facility profile not found. Please sign in again.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load blood units for screening");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedVerifierId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Screening Modal with defaults
  const openScreeningModal = (unit: InventoryUnitItem) => {
    setScreeningTarget(unit);
    setHivResult("NON_REACTIVE");
    setHbvResult("NEGATIVE");
    setHcvResult("NEGATIVE");
    setSyphilisResult("NON_REACTIVE");
    setMalariaResult("NEGATIVE");
    setLabTechnicianName("");
    setMedicalOfficerName("");
    setTestKitDetails("4th Gen ELISA / CLIA Dual Verification");
    setScreeningNotes("");
    setScreeningError(null);
  };

  // Open History Modal
  const openHistoryModal = async (unit: InventoryUnitItem) => {
    setHistoryTarget(unit);
    setHistoryRecords([]);
    if (!bloodbank) return;

    try {
      setIsLoadingHistory(true);
      const res = await api.bloodbank.getScreeningHistory(bloodbank.bloodbankid, unit.unitid);
      if (res.success) {
        setHistoryRecords(res.history || []);
      }
    } catch {
      // Ignore background error
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Determine Overall Status dynamically
  const isAllClear =
    hivResult === "NON_REACTIVE" &&
    hbvResult === "NEGATIVE" &&
    hcvResult === "NEGATIVE" &&
    syphilisResult === "NON_REACTIVE" &&
    malariaResult === "NEGATIVE";

  const overallStatus = isAllClear ? "PASSED" : "FAILED";

  // Submit Screening Certification
  const handleRecordScreening = async () => {
    if (!bloodbank || !screeningTarget) return;

    if (!labTechnicianName.trim()) {
      setScreeningError("Laboratory Technician Name is mandatory for clinical accreditation.");
      return;
    }
    if (!medicalOfficerName.trim()) {
      setScreeningError("Medical Officer Sign-off Name is required by national CDSCO standards.");
      return;
    }
    if (!selectedVerifierId) {
      setScreeningError("An eligible second authorized clinical verifier is required for dual sign-off.");
      return;
    }

    try {
      setIsSubmittingScreening(true);
      setScreeningError(null);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.recordScreening(
        bloodbank.bloodbankid,
        screeningTarget.unitid,
        {
          verifiedByUserId: selectedVerifierId,
          testresults: {
            hiv: hivResult,
            hbv: hbvResult,
            hcv: hcvResult,
            syphilis: syphilisResult,
            malaria: malariaResult,
          },
          overallstatus: overallStatus,
          labtechnicianname: labTechnicianName.trim(),
          medicalofficername: medicalOfficerName.trim(),
          testkitdetails: testKitDetails.trim() || undefined,
          notes: screeningNotes.trim() || undefined,
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage(
          `Screening successfully certified for Unit ${screeningTarget.unitbarcode}. Status: ${overallStatus}.`
        );
        setScreeningTarget(null);
        await loadData(true);
      }
    } catch (err: any) {
      setScreeningError(err?.message || "Failed to commit screening certification.");
    } finally {
      setIsSubmittingScreening(false);
    }
  };

  // Submit Discard Unit
  const handleDiscardUnit = async () => {
    if (!bloodbank || !discardTarget) return;
    if (discardReason.trim().length < 5) {
      setError("Please provide a valid disposal / segregation reason.");
      return;
    }

    try {
      setIsSubmittingDiscard(true);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.discardUnit(
        bloodbank.bloodbankid,
        discardTarget.unitid,
        {
          reason: discardReason.trim(),
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage(`Unit ${discardTarget.unitbarcode} discarded into biological waste.`);
        setDiscardTarget(null);
        setDiscardReason("");
        await loadData(true);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to discard unit.");
    } finally {
      setIsSubmittingDiscard(false);
    }
  };

  // Filtered Units
  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      // Screening status filter
      if (statusFilter !== "ALL" && unit.screeningstatus !== statusFilter) {
        return false;
      }
      // Group filter
      if (groupFilter !== "ALL" && unit.bloodgroup !== groupFilter && formatBloodGroup(unit.bloodgroup) !== groupFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const barcode = unit.unitbarcode.toLowerCase();
        const group = unit.bloodgroup.toLowerCase();
        const groupDisplay = formatBloodGroup(unit.bloodgroup).toLowerCase();
        const comp = unit.bloodcomponent.toLowerCase();
        return barcode.includes(q) || group.includes(q) || groupDisplay.includes(q) || comp.includes(q);
      }
      return true;
    });
  }, [units, statusFilter, groupFilter, searchQuery]);

  // Counts
  const pendingCount = units.filter((u) => u.screeningstatus === "PENDING").length;
  const passedCount = units.filter((u) => u.screeningstatus === "PASSED").length;
  const failedCount = units.filter((u) => u.screeningstatus === "FAILED").length;

  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL" || groupFilter !== "ALL";

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/bloodbank/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Blood Bank Dashboard</span>
        </Link>

        {!isLoading && !error && (
          <span className="text-xs text-slate-500">
            Showing {filteredUnits.length} of {units.length}{" "}
            {units.length === 1 ? "unit" : "units"}
          </span>
        )}
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 rounded-lg text-teal-600 hover:text-teal-800 hover:bg-teal-100/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-100/50 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <FlaskConical className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                TTI Screening
              </h1>
              {!isLoading && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {units.length} Units Tracked
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Manage blood unit screening results and laboratory clearance.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh screening units"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Four Compact Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Pending Screening */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending Screening</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {pendingCount}
          </div>
          <p className="text-[11px] text-amber-700 font-medium">Quarantined in lab</p>
        </div>

        {/* Certified Available */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Certified Available</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {passedCount}
          </div>
          <p className="text-[11px] text-teal-700 font-medium">Cleared for transfusion</p>
        </div>

        {/* Failed / Reactive */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Failed / Reactive</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-700">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-rose-900">
            {failedCount}
          </div>
          <p className="text-[11px] text-rose-700 font-medium">Segregated for disposal</p>
        </div>

        {/* Total Units */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Units</span>
            <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845]">
              <Droplets className="w-3.5 h-3.5 text-[#053845]" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {units.length}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">All registered units</p>
        </div>
      </section>

      {/* 3. Search and Filters */}
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-3.5 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Barcode, Blood Group, or Component..."
              className="w-full pl-10 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-1 focus:ring-[#317786]/30 text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium hidden sm:inline">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Screening</option>
                <option value="PASSED">Passed / Cleared</option>
                <option value="FAILED">Failed / Reactive</option>
              </select>
            </div>

            {/* Blood Group Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium hidden sm:inline">Group:</span>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
              >
                <option value="ALL">All Groups</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setGroupFilter("ALL");
                  setSearchQuery("");
                }}
                className="text-xs font-medium text-[#317786] hover:underline px-1 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 4. Screening Records Table */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-7 h-7 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading unit screening records...</p>
          </div>
        ) : filteredUnits.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#317786] mx-auto">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-serif text-base font-bold text-[#053845]">
                {units.length === 0 ? "No blood units awaiting screening" : "No matching blood units"}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {units.length === 0
                  ? "Registered blood units will appear here when they are ready for TTI screening."
                  : "No units match your active filter and search criteria."}
              </p>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setGroupFilter("ALL");
                  setSearchQuery("");
                }}
                className="text-xs font-semibold text-[#317786] hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF6EE]/70 text-[11px] font-semibold uppercase tracking-wider text-slate-600 border-b border-[#F3E9D1]">
                  <th className="py-3 px-4">Unit Barcode</th>
                  <th className="py-3 px-3">Blood Group</th>
                  <th className="py-3 px-3">Component</th>
                  <th className="py-3 px-3">Collection Date</th>
                  <th className="py-3 px-2.5 text-center">HIV 1 &amp; 2</th>
                  <th className="py-3 px-2.5 text-center">HBsAg</th>
                  <th className="py-3 px-2.5 text-center">HCV</th>
                  <th className="py-3 px-2.5 text-center">Syphilis</th>
                  <th className="py-3 px-2.5 text-center">Malaria</th>
                  <th className="py-3 px-3 text-center">Screening Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredUnits.map((unit) => {
                  const isPending = unit.screeningstatus === "PENDING";
                  const isPassed = unit.screeningstatus === "PASSED";
                  const isFailed = unit.screeningstatus === "FAILED";
                  const isDiscarded = unit.status === "DISCARDED";
                  const scr = unit.currentscreening;
                  const displayGroup = formatBloodGroup(unit.bloodgroup);
                  const collectionDate = unit.collectiondate || unit.createdat;

                  return (
                    <tr key={unit.unitid} className="hover:bg-slate-50/70 transition-colors">
                      {/* Unit Barcode */}
                      <td className="py-3.5 px-4 font-mono font-bold text-xs text-[#053845]">
                        {unit.unitbarcode}
                      </td>

                      {/* Blood Group */}
                      <td className="py-3.5 px-3 font-bold text-[#053845]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]">
                          <Droplets className="w-3 h-3 text-[#B94F30]" />
                          <span>{displayGroup}</span>
                        </span>
                      </td>

                      {/* Component */}
                      <td className="py-3.5 px-3 font-medium text-slate-800">
                        {formatComponentLabel(unit.bloodcomponent)}
                      </td>

                      {/* Collection Date */}
                      <td className="py-3.5 px-3 text-slate-600">
                        {collectionDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{formatDate(collectionDate)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* HIV */}
                      <td className="py-3.5 px-2.5 text-center">
                        {renderMarkerBadge(scr?.hivstatus, unit.screeningstatus)}
                      </td>

                      {/* HBsAg */}
                      <td className="py-3.5 px-2.5 text-center">
                        {renderMarkerBadge(scr?.hbvstatus, unit.screeningstatus)}
                      </td>

                      {/* HCV */}
                      <td className="py-3.5 px-2.5 text-center">
                        {renderMarkerBadge(scr?.hcvstatus, unit.screeningstatus)}
                      </td>

                      {/* Syphilis */}
                      <td className="py-3.5 px-2.5 text-center">
                        {renderMarkerBadge(scr?.syphilisstatus, unit.screeningstatus)}
                      </td>

                      {/* Malaria */}
                      <td className="py-3.5 px-2.5 text-center">
                        {renderMarkerBadge(scr?.malariastatus, unit.screeningstatus)}
                      </td>

                      {/* Screening Status */}
                      <td className="py-3.5 px-3 text-center">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending</span>
                          </span>
                        )}
                        {isPassed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Passed</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Reactive</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending && !isDiscarded && (
                            <button
                              type="button"
                              onClick={() => openScreeningModal(unit)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Screen</span>
                            </button>
                          )}

                          {!isPending && (
                            <button
                              type="button"
                              onClick={() => openHistoryModal(unit)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#317786] font-semibold text-xs border border-slate-200 transition-all cursor-pointer shadow-2xs"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>History</span>
                            </button>
                          )}

                          {!isDiscarded && (
                            <button
                              type="button"
                              onClick={() => {
                                setDiscardTarget(unit);
                                setDiscardReason("");
                              }}
                              title="Discard unit"
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TTI Screening Certification Modal */}
      {screeningTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Certify 5-Panel Pathogen Screening
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unit Barcode: <span className="font-mono font-bold text-[#053845]">{screeningTarget.unitbarcode}</span> ({formatBloodGroup(screeningTarget.bloodgroup)} {formatComponentLabel(screeningTarget.bloodcomponent)})
                </p>
              </div>
              <button
                onClick={() => setScreeningTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {screeningError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{screeningError}</span>
              </div>
            )}

            {/* Pathogen Markers Form */}
            <div className="space-y-3">
              <h4 className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                Infectious Disease Test Results
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* HIV */}
                <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                  <label className="text-xs font-semibold text-slate-700">HIV 1 &amp; 2 (Ab/Ag)</label>
                  <select
                    value={hivResult}
                    onChange={(e) => setHivResult(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NON_REACTIVE">Non-Reactive (Clear)</option>
                    <option value="REACTIVE">Reactive (Positive)</option>
                  </select>
                </div>

                {/* HBV */}
                <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Hepatitis B (HBsAg)</label>
                  <select
                    value={hbvResult}
                    onChange={(e) => setHbvResult(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NEGATIVE">Negative (Clear)</option>
                    <option value="POSITIVE">Positive (Reactive)</option>
                  </select>
                </div>

                {/* HCV */}
                <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Hepatitis C (HCV Ab)</label>
                  <select
                    value={hcvResult}
                    onChange={(e) => setHcvResult(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NEGATIVE">Negative (Clear)</option>
                    <option value="POSITIVE">Positive (Reactive)</option>
                  </select>
                </div>

                {/* Syphilis */}
                <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Syphilis (VDRL / RPR)</label>
                  <select
                    value={syphilisResult}
                    onChange={(e) => setSyphilisResult(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NON_REACTIVE">Non-Reactive (Clear)</option>
                    <option value="REACTIVE">Reactive (Positive)</option>
                  </select>
                </div>

                {/* Malaria */}
                <div className="p-3 rounded-xl bg-[#FAF6EE]/60 border border-[#F3E9D1] space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700">Malaria Parasite / Antigen</label>
                  <select
                    value={malariaResult}
                    onChange={(e) => setMalariaResult(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NEGATIVE">Negative (Clear)</option>
                    <option value="POSITIVE">Positive (Infected)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Overall Computed Outcome Banner */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                overallStatus === "PASSED"
                  ? "bg-teal-50 border-teal-200 text-teal-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {overallStatus === "PASSED" ? (
                  <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <div>
                  <strong>Outcome: {overallStatus}</strong>
                  <p className="text-[11px] opacity-90">
                    {overallStatus === "PASSED"
                      ? "All 5 markers are non-reactive. Unit will transition to AVAILABLE inventory."
                      : "One or more markers reactive. Unit will remain in QUARANTINE."}
                  </p>
                </div>
              </div>
            </div>

            {/* Clinical Sign-Off Fields */}
            <div className="space-y-3 pt-1">
              <h4 className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                Mandatory Dual Sign-Off (CDSCO Standards)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Laboratory Technician Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={labTechnicianName}
                    onChange={(e) => setLabTechnicianName(e.target.value)}
                    placeholder="e.g. S. Sharma, MLT"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Medical Officer / Pathologist <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={medicalOfficerName}
                    onChange={(e) => setMedicalOfficerName(e.target.value)}
                    placeholder="e.g. Dr. R. Iyer, MD Transfusion"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Test Kit &amp; Methodology</label>
                <input
                  type="text"
                  value={testKitDetails}
                  onChange={(e) => setTestKitDetails(e.target.value)}
                  placeholder="Manufacturer, lot number, machine calibration ID..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Second Clinical Verifier (Dual Sign-off) <span className="text-rose-600">*</span>
                </label>
                {verifiers.length === 0 ? (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    No second verifier (BLOOD_BANK or ADMIN user) available.
                  </div>
                ) : (
                  <select
                    value={selectedVerifierId}
                    onChange={(e) => setSelectedVerifierId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800 bg-white"
                  >
                    {verifiers.map((v) => (
                      <option key={v.userid} value={v.userid}>
                        {v.name} ({v.role} — {v.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Clinical Notes (Optional)</label>
                <input
                  type="text"
                  value={screeningNotes}
                  onChange={(e) => setScreeningNotes(e.target.value)}
                  placeholder="Incubation time, repeat confirmation details, etc..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setScreeningTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordScreening}
                disabled={isSubmittingScreening || verifiers.length === 0 || !selectedVerifierId}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isSubmittingScreening ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Commit Screening Clearance</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screening History Modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Screening Certificate Audit Trail
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unit Barcode: <span className="font-mono font-bold text-[#053845]">{historyTarget.unitbarcode}</span>
                </p>
              </div>
              <button
                onClick={() => setHistoryTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-[#317786]" />
                <span className="text-xs">Loading certification history...</span>
              </div>
            ) : historyRecords.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">
                No past screening certificates on file for this unit.
              </p>
            ) : (
              <div className="space-y-3">
                {historyRecords.map((rec) => (
                  <div
                    key={rec.recordid}
                    className="p-3.5 rounded-xl border border-[#F3E9D1] bg-[#FAF6EE]/50 space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-[#F3E9D1]/70 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            rec.overallstatus === "PASSED"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {rec.overallstatus}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          {formatDate(rec.testedat)}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        #{rec.recordid.slice(0, 8)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                      <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">HIV</span>
                        <span className="font-semibold text-slate-700">{rec.hivstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">HBV</span>
                        <span className="font-semibold text-slate-700">{rec.hbvstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">HCV</span>
                        <span className="font-semibold text-slate-700">{rec.hcvstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Syphilis</span>
                        <span className="font-semibold text-slate-700">{rec.syphilisstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100 sm:col-span-1 col-span-2">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Malaria</span>
                        <span className="font-semibold text-slate-700">{rec.malariastatus}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-600 gap-1 pt-1 border-t border-[#F3E9D1]/60">
                      <div>
                        <strong className="text-slate-700">Technician:</strong> {rec.labtechnicianname}
                      </div>
                      <div>
                        <strong className="text-slate-700">Medical Officer:</strong> {rec.medicalofficername}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard Unit Modal */}
      {discardTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-rose-900">
                  Discard Blood Unit
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unit Barcode: <span className="font-mono font-bold text-slate-700">{discardTarget.unitbarcode}</span>
                </p>
              </div>
              <button
                onClick={() => setDiscardTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Disposal / Segregation Reason <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={discardReason}
                onChange={(e) => setDiscardReason(e.target.value)}
                placeholder="Reason (e.g. TTI screening reactive, gross haemolysis, bag leakage, expired)..."
                rows={3}
                className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 text-slate-800 placeholder:text-slate-400"
              />
              <p className="text-[11px] text-slate-500">
                Discarded units are permanently decommissioned and decremented from vault inventory in the immutable ledger.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDiscardTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardUnit}
                disabled={isSubmittingDiscard || discardReason.trim().length < 5}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isSubmittingDiscard ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Discarding...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm Disposal</span>
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
