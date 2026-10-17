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
  ShieldAlert,
  Loader2,
  Check,
  X,
  History,
  Trash2,
  FileText,
  AlertCircle,
  Eye,
} from "lucide-react";
import {
  api,
  InventoryUnitItem,
  UnitScreeningRecordItem,
} from "@/lib/api";
import { getStoredBloodBank, AuthBloodBank } from "@/lib/auth";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { formatDate } from "@/lib/mappers";

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
        const res = await api.bloodbank.getUnits(activeBb.bloodbankid);
        if (res.success) {
          setUnits(res.units || []);
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
  }, []);

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

    try {
      setIsSubmittingScreening(true);
      setScreeningError(null);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.recordScreening(
        bloodbank.bloodbankid,
        screeningTarget.unitid,
        {
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
      if (groupFilter !== "ALL" && unit.bloodgroup !== groupFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const barcode = unit.unitbarcode.toLowerCase();
        const group = unit.bloodgroup.toLowerCase();
        const comp = unit.bloodcomponent.toLowerCase();
        return barcode.includes(q) || group.includes(q) || comp.includes(q);
      }
      return true;
    });
  }, [units, statusFilter, groupFilter, searchQuery]);

  // Counts
  const pendingCount = units.filter((u) => u.screeningstatus === "PENDING").length;
  const passedCount = units.filter((u) => u.screeningstatus === "PASSED").length;
  const failedCount = units.filter((u) => u.screeningstatus === "FAILED").length;

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EE] border border-[#F3E9D1] text-xs font-semibold text-[#317786]">
            <FlaskConical className="w-3.5 h-3.5 text-[#317786]" />
            <span>National CDSCO 5-Panel Pathogen Clearance Desk</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#053845] leading-tight">
            Transfusion-Transmissible Infection (TTI) Screening
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Record certified laboratory tests for HIV 1 &amp; 2, Hepatitis B (HBsAg), Hepatitis C (HCV), Syphilis, and Malaria. Units remain in strict{" "}
            <strong className="text-amber-800">QUARANTINE</strong> until dual clinical sign-off clears them into available inventory.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#317786] ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh Registry</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 Metric Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pending Screening
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {pendingCount}
          </div>
          <p className="text-[11px] text-slate-500">Quarantined awaiting lab clearance</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Certified Available
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {passedCount}
          </div>
          <p className="text-[11px] text-slate-500">Passed 5-panel TTI with sign-off</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Failed / Reactive
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-rose-900">
            {failedCount}
          </div>
          <p className="text-[11px] text-slate-500">Segregated for medical disposal</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <Droplets className="w-3.5 h-3.5 text-[#053845]" />
            Total Vault Units
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {units.length}
          </div>
          <p className="text-[11px] text-slate-500">Individual unit barcodes tracked</p>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Filter and Search Bar */}
        <div className="p-5 sm:p-6 border-b border-[#F3E9D1] bg-white space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Barcode, blood group, or component..."
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
                >
                  <option value="ALL">All Screening States</option>
                  <option value="PENDING">Pending Screening</option>
                  <option value="PASSED">Passed / Cleared</option>
                  <option value="FAILED">Failed / Reactive</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-medium">Group:</span>
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
            </div>
          </div>
        </div>

        {/* Units Table */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading unit screening registry...</p>
          </div>
        ) : filteredUnits.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <FlaskConical className="w-7 h-7 text-[#317786]" />
            </div>
            <h3 className="text-base font-serif font-bold text-[#053845]">No Blood Units Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
              When individual unit barcodes are registered into lot inventory, they will appear here awaiting mandatory 5-panel TTI testing.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F3E9D1] bg-[#FAF6EE]/60 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-3.5 px-6">Unit Barcode</th>
                  <th className="py-3.5 px-6">Group & Component</th>
                  <th className="py-3.5 px-6">Volume</th>
                  <th className="py-3.5 px-6">Expiry Date</th>
                  <th className="py-3.5 px-6">Shelf State</th>
                  <th className="py-3.5 px-6">TTI Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9D1]/60 text-xs">
                {filteredUnits.map((unit) => {
                  const isPending = unit.screeningstatus === "PENDING";
                  const isPassed = unit.screeningstatus === "PASSED";
                  const isFailed = unit.screeningstatus === "FAILED";
                  const isDiscarded = unit.status === "DISCARDED";

                  return (
                    <tr key={unit.unitid} className="hover:bg-[#FAF6EE]/40 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold text-[#053845]">
                        {unit.unitbarcode}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold font-serif text-xs bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                            {unit.bloodgroup}
                          </span>
                          <span className="text-[11px] font-medium text-slate-600">
                            {unit.bloodcomponent}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-slate-600 font-medium">
                        {unit.volume_ml} mL
                      </td>
                      <td className="py-4 px-6 text-slate-600">
                        {formatDate(unit.expirydate)}
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {unit.status}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>PENDING</span>
                          </span>
                        )}
                        {isPassed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>PASSED</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>REACTIVE</span>
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && !isDiscarded && (
                            <button
                              type="button"
                              onClick={() => openScreeningModal(unit)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#053845] hover:bg-[#03252e] text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Screen Unit</span>
                            </button>
                          )}

                          {!isPending && (
                            <button
                              type="button"
                              onClick={() => openHistoryModal(unit)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF6EE] text-[#317786] font-semibold text-xs border border-[#F3E9D1] transition-all cursor-pointer"
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
                              title="Discard or segregate unit"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
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
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#053845]">
                  Certify 5-Panel Pathogen Screening
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Unit Barcode: <span className="font-mono font-bold text-[#053845]">{screeningTarget.unitbarcode}</span> ({screeningTarget.bloodgroup} {screeningTarget.bloodcomponent})
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
            <div className="space-y-4">
              <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Infectious Disease Test Results
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* HIV */}
                <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">HIV 1 &amp; 2 (Ab/Ag)</label>
                  <select
                    value={hivResult}
                    onChange={(e) => setHivResult(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NON_REACTIVE">Non-Reactive (Clear)</option>
                    <option value="REACTIVE">Reactive (Positive)</option>
                  </select>
                </div>

                {/* HBV */}
                <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Hepatitis B (HBsAg)</label>
                  <select
                    value={hbvResult}
                    onChange={(e) => setHbvResult(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NEGATIVE">Negative (Clear)</option>
                    <option value="POSITIVE">Positive (Reactive)</option>
                  </select>
                </div>

                {/* HCV */}
                <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Hepatitis C (HCV Ab)</label>
                  <select
                    value={hcvResult}
                    onChange={(e) => setHcvResult(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NEGATIVE">Negative (Clear)</option>
                    <option value="POSITIVE">Positive (Reactive)</option>
                  </select>
                </div>

                {/* Syphilis */}
                <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Syphilis (VDRL / RPR)</label>
                  <select
                    value={syphilisResult}
                    onChange={(e) => setSyphilisResult(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NON_REACTIVE">Non-Reactive (Clear)</option>
                    <option value="REACTIVE">Reactive (Positive)</option>
                  </select>
                </div>

                {/* Malaria */}
                <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1] space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700">Malaria Parasite / Antigen</label>
                  <select
                    value={malariaResult}
                    onChange={(e) => setMalariaResult(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                  >
                    <option value="NEGATIVE">Negative (Clear)</option>
                    <option value="POSITIVE">Positive (Infected)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Overall Computed Outcome Banner */}
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between text-xs ${
                overallStatus === "PASSED"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {overallStatus === "PASSED" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                )}
                <div>
                  <strong>Screening Result: {overallStatus}</strong>
                  <p className="text-[11px] opacity-90">
                    {overallStatus === "PASSED"
                      ? "All 5 markers are non-reactive. Unit will transition to AVAILABLE inventory."
                      : "One or more markers reactive. Unit will be locked in QUARANTINE."}
                  </p>
                </div>
              </div>
            </div>

            {/* Clinical Sign-Off Fields */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Mandatory Dual Sign-Off (CDSCO / NABH Standards)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Laboratory Technician Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={labTechnicianName}
                    onChange={(e) => setLabTechnicianName(e.target.value)}
                    placeholder="e.g. S. Sharma, MLT"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Medical Officer / Pathologist <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={medicalOfficerName}
                    onChange={(e) => setMedicalOfficerName(e.target.value)}
                    placeholder="e.g. Dr. R. Iyer, MD Transfusion"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Test Kit &amp; Methodology</label>
                <input
                  type="text"
                  value={testKitDetails}
                  onChange={(e) => setTestKitDetails(e.target.value)}
                  placeholder="Manufacturer, lot number, machine calibration ID..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Clinical Notes (Optional)</label>
                <input
                  type="text"
                  value={screeningNotes}
                  onChange={(e) => setScreeningNotes(e.target.value)}
                  placeholder="Incubation time, repeat confirmation details, etc..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setScreeningTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordScreening}
                disabled={isSubmittingScreening}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#053845] hover:bg-[#03252e] text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmittingScreening ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing Certificate...</span>
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
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#053845]">
                  Screening Certificate Audit Trail
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Immutable laboratory test records for Unit {historyTarget.unitbarcode}
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
              <div className="space-y-4">
                {historyRecords.map((rec) => (
                  <div
                    key={rec.recordid}
                    className="p-4 rounded-2xl border border-[#F3E9D1] bg-[#FAF6EE]/40 space-y-3 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-[#F3E9D1] pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
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
                      <span className="text-[11px] text-slate-400">
                        Record ID: {rec.recordid.slice(0, 8)}...
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">HIV</span>
                        <span className="font-semibold text-slate-700">{rec.hivstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">HBV</span>
                        <span className="font-semibold text-slate-700">{rec.hbvstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">HCV</span>
                        <span className="font-semibold text-slate-700">{rec.hcvstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Syphilis</span>
                        <span className="font-semibold text-slate-700">{rec.syphilisstatus}</span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-100 sm:col-span-1 col-span-2">
                        <span className="text-slate-400 block text-[9px] uppercase font-bold">Malaria</span>
                        <span className="font-semibold text-slate-700">{rec.malariastatus}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-600 gap-2 pt-1 border-t border-[#F3E9D1]/50">
                      <div>
                        <strong>Technician:</strong> {rec.labtechnicianname}
                      </div>
                      <div>
                        <strong>Medical Officer:</strong> {rec.medicalofficername}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
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
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-rose-900">
                  Discard Blood Unit
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Unit Barcode: <span className="font-mono font-bold">{discardTarget.unitbarcode}</span>
                </p>
              </div>
              <button
                onClick={() => setDiscardTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                Disposal / Segregation Reason <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={discardReason}
                onChange={(e) => setDiscardReason(e.target.value)}
                placeholder="Reason (e.g. TTI screening reactive, gross haemolysis, bag leakage, expired)..."
                rows={3}
                className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-slate-800 placeholder:text-slate-400"
              />
              <p className="text-[11px] text-slate-500">
                Discarded units are permanently decommissioned and decremented from vault inventory in the immutable ledger.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDiscardTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardUnit}
                disabled={isSubmittingDiscard || discardReason.trim().length < 5}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
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
