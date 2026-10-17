"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Droplets,
  Calendar,
  Building2,
  Lock,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Check,
  X,
  FileText,
  AlertCircle,
  Send,
  Thermometer,
  PackageCheck,
  ShieldCheck,
  Layers,
} from "lucide-react";
import {
  api,
  RequisitionAssignmentItem,
  BloodReservationItem,
  ReservationItemDetail,
  ClinicalCrossmatchItem,
} from "@/lib/api";
import { getStoredBloodBank, AuthBloodBank } from "@/lib/auth";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { formatDate } from "@/lib/mappers";

export default function BloodBankDispatchPage() {
  const [bloodbank, setBloodBank] = useState<AuthBloodBank | null>(null);
  const [assignments, setAssignments] = useState<RequisitionAssignmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Crossmatch Modal State
  const [crossmatchTarget, setCrossmatchTarget] = useState<{
    reservation: BloodReservationItem;
    item: ReservationItemDetail;
  } | null>(null);
  const [crossmatchResult, setCrossmatchResult] = useState<"COMPATIBLE" | "INCOMPATIBLE" | "INCONCLUSIVE">("COMPATIBLE");
  const [crossmatchMethod, setCrossmatchMethod] = useState("Gel Column Agglutination (LISS-Coombs)");
  const [technologistName, setTechnologistName] = useState("");
  const [crossmatchNotes, setCrossmatchNotes] = useState("");
  const [isSubmittingCrossmatch, setIsSubmittingCrossmatch] = useState(false);
  const [crossmatchError, setCrossmatchError] = useState<string | null>(null);

  // Dispatch Modal State
  const [dispatchTarget, setDispatchTarget] = useState<BloodReservationItem | null>(null);
  const [courierTempC, setCourierTempC] = useState<string>("4.0");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Cancel Reservation Modal State
  const [cancelTarget, setCancelTarget] = useState<BloodReservationItem | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const loadData = useCallback(async (background = false) => {
    try {
      if (background) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const profRes = await api.bloodbank.getProfile();
      const activeBb = profRes.success ? profRes.bloodbank : getStoredBloodBank();

      if (activeBb) {
        setBloodBank(activeBb);
        const res = await api.bloodbank.getAssignments(activeBb.bloodbankid);
        if (res.success) {
          setAssignments(res.assignments || []);
        }
      } else {
        setError("Facility profile not found. Please sign in again.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load dispatch reservations");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract all reservations across all assignments
  const allReservations: BloodReservationItem[] = useMemo(() => {
    const list: BloodReservationItem[] = [];
    assignments.forEach((assignment) => {
      (assignment.bloodreservations || []).forEach((res) => {
        list.push({
          ...res,
          bloodrequests: assignment.bloodrequests,
        });
      });
    });
    return list;
  }, [assignments]);

  // Open Crossmatch Modal
  const openCrossmatchModal = (
    reservation: BloodReservationItem,
    item: ReservationItemDetail
  ) => {
    setCrossmatchTarget({ reservation, item });
    setCrossmatchResult("COMPATIBLE");
    setCrossmatchMethod("Gel Column Agglutination (LISS-Coombs)");
    setTechnologistName("");
    setCrossmatchNotes("");
    setCrossmatchError(null);
  };

  // Submit Crossmatch
  const handleRecordCrossmatch = async () => {
    if (!bloodbank || !crossmatchTarget) return;

    if (!technologistName.trim()) {
      setCrossmatchError("Laboratory Technologist Name is required for certification.");
      return;
    }

    try {
      setIsSubmittingCrossmatch(true);
      setCrossmatchError(null);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.recordCrossmatch(
        bloodbank.bloodbankid,
        {
          reservationid: crossmatchTarget.reservation.reservationid,
          reservationitemid: crossmatchTarget.item.reservationitemid,
          unitid: crossmatchTarget.item.unitid,
          crossmatchresult: crossmatchResult,
          method: crossmatchMethod.trim() || undefined,
          technologistname: technologistName.trim(),
          notes: crossmatchNotes.trim() || undefined,
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage(
          `Crossmatch certified: ${crossmatchResult} for Unit ${crossmatchTarget.item.unitbarcode || crossmatchTarget.item.unitid.slice(0, 8)}.`
        );
        setCrossmatchTarget(null);
        await loadData(true);
      }
    } catch (err: any) {
      setCrossmatchError(err?.message || "Failed to record crossmatch certification.");
    } finally {
      setIsSubmittingCrossmatch(false);
    }
  };

  // Open Dispatch Modal
  const openDispatchModal = (reservation: BloodReservationItem) => {
    // Check that all items have COMPATIBLE crossmatch
    const items = reservation.items || [];
    const allCompatible =
      items.length > 0 &&
      items.every((it) => {
        const matches = it.crossmatches || [];
        const latest = matches[0]; // Ordered by testedat DESC
        return latest && latest.crossmatchresult === "COMPATIBLE";
      });

    if (!allCompatible) {
      setError(
        "Cannot dispatch: Every blood unit in this reservation must have a certified COMPATIBLE crossmatch record."
      );
      return;
    }

    setDispatchTarget(reservation);
    setCourierTempC("4.0");
    setDispatchNotes("");
    setDispatchError(null);
  };

  // Submit Dispatch
  const handleDispatchReservation = async () => {
    if (!bloodbank || !dispatchTarget) return;

    const temp = parseFloat(courierTempC);
    if (isNaN(temp)) {
      setDispatchError("Please enter a valid numeric temperature (°C).");
      return;
    }

    try {
      setIsSubmittingDispatch(true);
      setDispatchError(null);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.dispatchReservation(
        bloodbank.bloodbankid,
        dispatchTarget.reservationid,
        {
          couriertemperature_c: temp,
          dispatchnotes: dispatchNotes.trim() || undefined,
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage(
          `Reservation dispatched successfully in cold box at ${temp}°C. Delivery receipt notification sent to hospital.`
        );
        setDispatchTarget(null);
        await loadData(true);
      }
    } catch (err: any) {
      setDispatchError(err?.message || "Failed to dispatch reservation.");
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  // Submit Cancel Reservation
  const handleCancelReservation = async () => {
    if (!bloodbank || !cancelTarget) return;
    if (cancellationReason.trim().length < 5) {
      setError("Please provide a valid reason for cancelling this reservation.");
      return;
    }

    try {
      setIsSubmittingCancel(true);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.cancelReservation(
        bloodbank.bloodbankid,
        cancelTarget.reservationid,
        {
          reason: cancellationReason.trim(),
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage("Reservation cancelled. Reserved units returned to AVAILABLE inventory.");
        setCancelTarget(null);
        setCancellationReason("");
        await loadData(true);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to cancel reservation.");
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Filtered reservations
  const filteredReservations = useMemo(() => {
    return allReservations.filter((res) => {
      if (statusFilter !== "ALL" && res.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const patientName = res.bloodrequests?.patientname?.toLowerCase() || "";
        const resId = res.reservationid.toLowerCase();
        const group = res.bloodrequests?.bloodgroup?.toLowerCase() || "";
        return patientName.includes(q) || resId.includes(q) || group.includes(q);
      }
      return true;
    });
  }, [allReservations, statusFilter, searchQuery]);

  // Counts
  const readyCrossmatchCount = allReservations.filter((r) => r.status === "RESERVED").length;
  const readyDispatchCount = allReservations.filter((r) => r.status === "PREPARED").length;
  const inTransitCount = allReservations.filter((r) => r.status === "DISPATCHED").length;
  const deliveredCount = allReservations.filter((r) => r.status === "DELIVERED").length;

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EE] border border-[#F3E9D1] text-xs font-semibold text-[#317786]">
            <Truck className="w-3.5 h-3.5 text-[#317786]" />
            <span>Pre-Transfusion Testing &amp; Controlled Cold Chain</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#053845] leading-tight">
            Clinical Crossmatching &amp; Controlled Dispatch
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Perform pre-transfusion crossmatch compatibility testing on reserved blood units. Ensure courier cold-box packing maintains{" "}
            <strong className="text-[#053845]">2°C–6°C</strong> compliance prior to departure.
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
            <span>Refresh Dispatch</span>
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

      {/* 4 Quick Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            Awaiting Crossmatch
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {readyCrossmatchCount}
          </div>
          <p className="text-[11px] text-slate-500">Reserved units to be tested</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
            Ready for Dispatch
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {readyDispatchCount}
          </div>
          <p className="text-[11px] text-slate-500">All crossmatches compatible</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-[#317786]" />
            In Cold-Box Transit
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {inTransitCount}
          </div>
          <p className="text-[11px] text-slate-500">En route to hospital</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            Delivered &amp; Transfused
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {deliveredCount}
          </div>
          <p className="text-[11px] text-slate-500">Receipt confirmed by hospital</p>
        </div>
      </div>

      {/* Main Reservation Cards List */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Filters and Search Bar */}
        <div className="p-5 sm:p-6 border-b border-[#F3E9D1] bg-white space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Patient name, Reservation ID, or blood group..."
                className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
              >
                <option value="ALL">All Reservations</option>
                <option value="RESERVED">Awaiting Crossmatch</option>
                <option value="PREPARED">Prepared / Tested</option>
                <option value="DISPATCHED">In Transit</option>
                <option value="DELIVERED">Delivered</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reservations List */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading dispatch reservations...</p>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <Truck className="w-7 h-7 text-[#317786]" />
            </div>
            <h3 className="text-base font-serif font-bold text-[#053845]">No Reservations Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
              Accept hospital orders in the Requisitions Queue to create unit reservations for pre-transfusion crossmatching and cold-box delivery.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto divide-y divide-[#F3E9D1]/70">
            {filteredReservations.map((reservation) => {
              const req = reservation.bloodrequests;
              const items = reservation.items || [];
              const isReserved = reservation.status === "RESERVED";
              const isPrepared = reservation.status === "PREPARED";
              const isDispatched = reservation.status === "DISPATCHED";
              const isDelivered = reservation.status === "DELIVERED";
              const isCancelled = reservation.status === "CANCELLED";

              // Check if all items compatible
              const allCompatible =
                items.length > 0 &&
                items.every((it) => {
                  const latest = (it.crossmatches || [])[0];
                  return latest && latest.crossmatchresult === "COMPATIBLE";
                });

              return (
                <div key={reservation.reservationid} className="p-6 space-y-4 hover:bg-[#FAF6EE]/20 transition-colors">
                  {/* Reservation Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#053845]">
                          Reservation: {reservation.reservationid.slice(0, 8)}...
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-slate-500">
                          Order: {reservation.requestid.slice(0, 8)}...
                        </span>
                      </div>
                      <h4 className="font-serif text-base font-bold text-[#053845]">
                        Patient: {req?.patientname || "Emergency Patient"}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          isDelivered
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : isDispatched
                            ? "bg-sky-50 text-sky-800 border border-sky-200"
                            : isPrepared
                            ? "bg-teal-50 text-teal-800 border border-teal-200"
                            : isReserved
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {isDispatched && <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />}
                        {reservation.status}
                      </span>
                    </div>
                  </div>

                  {/* Allocated Items & Crossmatch Status */}
                  <div className="space-y-2">
                    <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">
                      Allocated Blood Units ({items.length})
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {items.map((item) => {
                        const crossmatches = item.crossmatches || [];
                        const latestCrossmatch = crossmatches[0];
                        const crossmatchStatus = latestCrossmatch
                          ? latestCrossmatch.crossmatchresult
                          : "PENDING";

                        return (
                          <div
                            key={item.reservationitemid}
                            className="p-3.5 rounded-2xl border border-[#F3E9D1] bg-[#FAF6EE]/40 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#053845]">
                                  {item.unitbarcode || item.inventoryunits?.unitbarcode || item.unitid.slice(0, 8)}
                                </span>
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md font-bold font-serif text-[11px] bg-white text-[#053845] border border-[#F3E9D1]">
                                  {item.bloodgroup || req?.bloodgroup}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Component: {item.bloodcomponent || req?.bloodcomponent}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {crossmatchStatus === "PENDING" && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  <Clock className="w-3 h-3" />
                                  <span>X-MATCH PENDING</span>
                                </span>
                              )}
                              {crossmatchStatus === "COMPATIBLE" && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>COMPATIBLE</span>
                                </span>
                              )}
                              {crossmatchStatus === "INCOMPATIBLE" && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                  <XCircle className="w-3 h-3" />
                                  <span>INCOMPATIBLE</span>
                                </span>
                              )}
                              {crossmatchStatus === "INCONCLUSIVE" && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>INCONCLUSIVE</span>
                                </span>
                              )}

                              {(isReserved || isPrepared) && (
                                <button
                                  type="button"
                                  onClick={() => openCrossmatchModal(reservation, item)}
                                  className="px-2.5 py-1 rounded-xl bg-[#053845] hover:bg-[#03252e] text-white font-semibold text-[11px] transition-all cursor-pointer"
                                >
                                  {crossmatchStatus === "PENDING" ? "Certify" : "Re-test"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reservation Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F3E9D1]/50 text-xs">
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Reserved: {formatDate(reservation.reservedat)}</span>
                      {reservation.couriertemperature_c != null && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-[#317786] font-semibold">
                            <Thermometer className="w-3.5 h-3.5" />
                            Courier Temp: {reservation.couriertemperature_c}°C
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {(isReserved || isPrepared) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelTarget(reservation);
                            setCancellationReason("");
                          }}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Cancel Reservation
                        </button>
                      )}

                      {(isReserved || isPrepared) && (
                        <button
                          type="button"
                          onClick={() => openDispatchModal(reservation)}
                          disabled={!allCompatible}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            !allCompatible
                              ? "All units must be certified COMPATIBLE before dispatch"
                              : "Dispatch cold box to hospital"
                          }
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Dispatch Cold-Box</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Certify Crossmatch Modal */}
      {crossmatchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#053845]">
                  Certify Pre-Transfusion Crossmatch
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Unit Barcode: {crossmatchTarget.item.unitbarcode || crossmatchTarget.item.unitid.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setCrossmatchTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {crossmatchError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{crossmatchError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs space-y-1">
              <div>
                <strong>Recipient Patient:</strong> {crossmatchTarget.reservation.bloodrequests?.patientname}
              </div>
              <div>
                <strong>Group Compatibility:</strong> Donor Unit ({crossmatchTarget.item.bloodgroup}) with Recipient ({crossmatchTarget.reservation.bloodrequests?.bloodgroup})
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Crossmatch Test Result</label>
                <select
                  value={crossmatchResult}
                  onChange={(e) => setCrossmatchResult(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#317786]"
                >
                  <option value="COMPATIBLE">COMPATIBLE (No Agglutination / Safe)</option>
                  <option value="INCOMPATIBLE">INCOMPATIBLE (Agglutination / Lysis)</option>
                  <option value="INCONCLUSIVE">INCONCLUSIVE (Requires Repeat Testing)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Testing Method</label>
                <input
                  type="text"
                  value={crossmatchMethod}
                  onChange={(e) => setCrossmatchMethod(e.target.value)}
                  placeholder="e.g. Gel Column Coombs, Tube Saline, Immediate Spin..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">
                  Technologist Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={technologistName}
                  onChange={(e) => setTechnologistName(e.target.value)}
                  placeholder="e.g. A. Patel, Blood Bank Tech"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Clinical Observations (Optional)</label>
                <input
                  type="text"
                  value={crossmatchNotes}
                  onChange={(e) => setCrossmatchNotes(e.target.value)}
                  placeholder="Minor antibody screen negative, clear reaction..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCrossmatchTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordCrossmatch}
                disabled={isSubmittingCrossmatch}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#053845] hover:bg-[#03252e] text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCrossmatch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Certifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Commit Crossmatch Certificate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Cold-Box Modal */}
      {dispatchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#053845]">
                  Dispatch Temperature-Monitored Cold Box
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Reservation {dispatchTarget.reservationid.slice(0, 8)} ({dispatchTarget.items?.length || 0} unit(s) certified)
                </p>
              </div>
              <button
                onClick={() => setDispatchTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {dispatchError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{dispatchError}</span>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[#053845] font-bold">
                <Thermometer className="w-4 h-4 text-[#317786]" />
                <span>Cold-Chain Regulatory Compliance (2°C–6°C)</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Whole blood and red cells must depart the blood bank strictly within 2°C to 6°C using validated insulated transport containers with data-loggers.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">
                  Courier Cold-Box Departure Temperature (°C) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={courierTempC}
                  onChange={(e) => setCourierTempC(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786] font-mono font-bold"
                />
                <span className="text-[11px] text-slate-500">
                  Recommended calibrated dispatch temperature: 4.0°C
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Courier / Transport Notes (Optional)</label>
                <input
                  type="text"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Courier vehicle #, sealed cold box lock ID..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDispatchTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDispatchReservation}
                disabled={isSubmittingDispatch}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmittingDispatch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Dispatching...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm Departure</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reservation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-rose-900">
                  Cancel Blood Reservation
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Reservation {cancelTarget.reservationid.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setCancelTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                Cancellation Reason <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Reason (e.g. Crossmatch incompatibility, patient surgery postponed, requisition modified)..."
                rows={3}
                className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-slate-800 placeholder:text-slate-400"
              />
              <p className="text-[11px] text-slate-500">
                Cancelling releases all reserved units back to AVAILABLE vault stock in the immutable ledger.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleCancelReservation}
                disabled={isSubmittingCancel || cancellationReason.trim().length < 5}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCancel ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    <span>Release &amp; Cancel</span>
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
