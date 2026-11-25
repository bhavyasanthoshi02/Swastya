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
  Loader2,
  Check,
  X,
  AlertCircle,
  Send,
  Thermometer,
  PackageCheck,
  ShieldCheck,
  Layers,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
import {
  api,
  RequisitionAssignmentItem,
  BloodReservationItem,
  ReservationItemDetail,
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
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null);

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
  const [verifiers, setVerifiers] = useState<Array<{ userid: string; name: string; email: string; role: string }>>([]);
  const [selectedVerifierId, setSelectedVerifierId] = useState("");

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
        const [res, verRes] = await Promise.all([
          api.bloodbank.getAssignments(activeBb.bloodbankid),
          api.bloodbank.getVerifiers(activeBb.bloodbankid).catch(() => ({ success: false, verifiers: [] })),
        ]);
        if (res.success) {
          setAssignments(res.assignments || []);
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
      setError(err?.message || "Failed to load dispatch reservations");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedVerifierId]);

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
    if (!selectedVerifierId) {
      setCrossmatchError("An eligible second authorized clinical verifier is required for crossmatch dual sign-off.");
      return;
    }

    try {
      setIsSubmittingCrossmatch(true);
      setCrossmatchError(null);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.recordCrossmatch(
        bloodbank.bloodbankid,
        {
          verifiedByUserId: selectedVerifierId,
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
    const items = reservation.items || [];
    const allCompatible =
      items.length > 0 &&
      items.every((it) => {
        const matches = it.crossmatches || [];
        const latest = matches[0];
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
        const q = searchQuery.toLowerCase().trim();
        const patientName = res.bloodrequests?.patientname?.toLowerCase() || "";
        const resId = res.reservationid.toLowerCase();
        const group = res.bloodrequests?.bloodgroup?.toLowerCase() || "";
        const groupDisplay = formatBloodGroup(res.bloodrequests?.bloodgroup).toLowerCase();
        return patientName.includes(q) || resId.includes(q) || group.includes(q) || groupDisplay.includes(q);
      }
      return true;
    });
  }, [allReservations, statusFilter, searchQuery]);

  // Counts
  const readyCrossmatchCount = allReservations.filter((r) => r.status === "RESERVED").length;
  const readyDispatchCount = allReservations.filter((r) => r.status === "PREPARED").length;
  const inTransitCount = allReservations.filter((r) => r.status === "DISPATCHED").length;
  const deliveredCount = allReservations.filter((r) => r.status === "DELIVERED").length;

  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "ALL";

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
            Showing {filteredReservations.length} of {allReservations.length}{" "}
            {allReservations.length === 1 ? "reservation" : "reservations"}
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

      {/* 1. Compact Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Clinical Crossmatching &amp; Dispatch
              </h1>
              {!isLoading && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {allReservations.length} Orders
                </span>
              )}
            </div>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-500">
              Manage blood compatibility checks and hospital deliveries.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh dispatch orders"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Four Compact Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Awaiting Crossmatch */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Awaiting Crossmatch</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
              <Layers className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {readyCrossmatchCount}
          </div>
          <p className="text-[11px] text-amber-700 font-medium">Reserved units to test</p>
        </div>

        {/* Ready for Dispatch */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Ready for Dispatch</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
              <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {readyDispatchCount}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium">Compatible and packed</p>
        </div>

        {/* In Transit */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">In Transit</span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-700">
              <Truck className="w-3.5 h-3.5 text-sky-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {inTransitCount}
          </div>
          <p className="text-[11px] text-sky-700 font-medium">Cold box en route</p>
        </div>

        {/* Delivered */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Delivered</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {deliveredCount}
          </div>
          <p className="text-[11px] text-teal-700 font-medium">Receipt confirmed</p>
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
              placeholder="Search by Patient Name, Reservation ID, or Blood Group..."
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

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
            >
              <option value="ALL">All Reservations</option>
              <option value="RESERVED">Awaiting Crossmatch</option>
              <option value="PREPARED">Ready for Dispatch</option>
              <option value="DISPATCHED">In Transit</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
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

      {/* 4. Dispatch Records Table (Primary Focus) */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-7 h-7 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading dispatch orders...</p>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#317786] mx-auto">
              <Truck className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-serif text-base font-bold text-[#053845]">
                {allReservations.length === 0 ? "No Dispatch Records Found" : "No matching dispatch orders"}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {allReservations.length === 0
                  ? "Accept hospital orders in the Requisitions section to begin crossmatching and dispatch."
                  : "No reservation orders match your active filter and search criteria."}
              </p>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
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
                  <th className="py-3 px-4">Reservation ID</th>
                  <th className="py-3 px-4">Patient / Hospital</th>
                  <th className="py-3 px-3">Blood Group</th>
                  <th className="py-3 px-3">Component</th>
                  <th className="py-3 px-2.5 text-center">Units</th>
                  <th className="py-3 px-3 text-center">Crossmatch Status</th>
                  <th className="py-3 px-3 text-center">Dispatch Status</th>
                  <th className="py-3 px-3">Required By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredReservations.map((reservation) => {
                  const req = reservation.bloodrequests;
                  const items = reservation.items || [];
                  const isReserved = reservation.status === "RESERVED";
                  const isPrepared = reservation.status === "PREPARED";
                  const isDispatched = reservation.status === "DISPATCHED";
                  const isDelivered = reservation.status === "DELIVERED";
                  const isCancelled = reservation.status === "CANCELLED";
                  const displayGroup = formatBloodGroup(req?.bloodgroup);
                  const isExpanded = expandedReservationId === reservation.reservationid;

                  // Evaluate crossmatch status across all items
                  const allTestedAndCompatible =
                    items.length > 0 &&
                    items.every((it) => {
                      const latest = (it.crossmatches || [])[0];
                      return latest && latest.crossmatchresult === "COMPATIBLE";
                    });

                  const hasIncompatible = items.some(
                    (it) => (it.crossmatches || [])[0]?.crossmatchresult === "INCOMPATIBLE"
                  );

                  return (
                    <React.Fragment key={reservation.reservationid}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        {/* Reservation ID */}
                        <td className="py-3.5 px-4 font-mono font-medium text-xs text-slate-600">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReservationId(isExpanded ? null : reservation.reservationid)
                            }
                            className="inline-flex items-center gap-1.5 hover:text-[#053845] cursor-pointer"
                            title="Toggle unit details"
                          >
                            <span>#{reservation.reservationid.slice(0, 8)}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>
                        </td>

                        {/* Patient / Hospital */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#053845]">
                            {req?.patientname || "Emergency Patient"}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Hospital Order</span>
                          </div>
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
                          {formatComponentLabel(req?.bloodcomponent)}
                        </td>

                        {/* Units */}
                        <td className="py-3.5 px-2.5 text-center font-mono text-xs font-bold text-[#053845]">
                          {items.length} units
                        </td>

                        {/* Crossmatch Status */}
                        <td className="py-3.5 px-3 text-center">
                          {hasIncompatible ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3" />
                              <span>Incompatible</span>
                            </span>
                          ) : allTestedAndCompatible ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Compatible</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Awaiting Check</span>
                            </span>
                          )}
                        </td>

                        {/* Dispatch Status */}
                        <td className="py-3.5 px-3 text-center">
                          {isDelivered && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Delivered</span>
                            </span>
                          )}
                          {isDispatched && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                              <Truck className="w-3 h-3" />
                              <span>In Transit</span>
                            </span>
                          )}
                          {isPrepared && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <PackageCheck className="w-3 h-3" />
                              <span>Ready</span>
                            </span>
                          )}
                          {isReserved && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3" />
                              <span>Awaiting</span>
                            </span>
                          )}
                          {isCancelled && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              <X className="w-3 h-3" />
                              <span>Cancelled</span>
                            </span>
                          )}
                        </td>

                        {/* Required By */}
                        <td className="py-3.5 px-3 text-slate-600">
                          {req?.requiredby ? (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{formatDate(req.requiredby)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Immediate</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {(isReserved || isPrepared) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedReservationId(isExpanded ? null : reservation.reservationid)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#053845] transition-colors cursor-pointer shadow-2xs"
                              >
                                <Layers className="w-3.5 h-3.5 text-slate-500" />
                                <span>Units</span>
                              </button>
                            )}

                            {(isReserved || isPrepared) && (
                              <button
                                type="button"
                                onClick={() => openDispatchModal(reservation)}
                                disabled={!allTestedAndCompatible}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                title={
                                  !allTestedAndCompatible
                                    ? "All units must be certified COMPATIBLE before departure"
                                    : "Dispatch cold box"
                                }
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Dispatch</span>
                              </button>
                            )}

                            {(isReserved || isPrepared) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelTarget(reservation);
                                  setCancellationReason("");
                                }}
                                title="Cancel reservation"
                                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Allocated Units Checklist */}
                      {isExpanded && (
                        <tr className="bg-[#FAF6EE]/40 border-b border-[#F3E9D1]">
                          <td colSpan={9} className="p-4 sm:p-5">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                                  Allocated Units for Reservation #{reservation.reservationid.slice(0, 8)} ({items.length} units)
                                </span>
                                {reservation.couriertemperature_c != null && (
                                  <span className="inline-flex items-center gap-1 text-xs text-[#317786] font-semibold bg-white px-2 py-0.5 rounded-lg border border-[#F3E9D1]">
                                    <Thermometer className="w-3.5 h-3.5" />
                                    Courier Departure Temp: {reservation.couriertemperature_c}°C
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {items.map((item) => {
                                  const crossmatches = item.crossmatches || [];
                                  const latestCrossmatch = crossmatches[0];
                                  const isComp = latestCrossmatch?.crossmatchresult === "COMPATIBLE";
                                  const isIncomp = latestCrossmatch?.crossmatchresult === "INCOMPATIBLE";

                                  return (
                                    <div
                                      key={item.reservationitemid}
                                      className="p-3 rounded-xl border border-[#F3E9D1] bg-white flex items-center justify-between gap-2 shadow-2xs"
                                    >
                                      <div>
                                        <span className="font-mono font-bold text-xs text-[#053845] block">
                                          {item.unitbarcode || item.inventoryunits?.unitbarcode || item.unitid.slice(0, 8)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                          {item.bloodgroup || req?.bloodgroup} • {item.bloodcomponent || req?.bloodcomponent}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {isComp && (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                            <Check className="w-2.5 h-2.5" /> Compatible
                                          </span>
                                        )}
                                        {isIncomp && (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                                            <X className="w-2.5 h-2.5" /> Incompatible
                                          </span>
                                        )}
                                        {!isComp && !isIncomp && (
                                          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                            Pending
                                          </span>
                                        )}

                                        {(isReserved || isPrepared) && (
                                          <button
                                            type="button"
                                            onClick={() => openCrossmatchModal(reservation, item)}
                                            className="px-2 py-1 rounded-lg bg-[#053845] hover:bg-[#317786] text-white font-semibold text-[10px] transition-colors cursor-pointer"
                                          >
                                            {latestCrossmatch ? "Re-test" : "Certify"}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Certify Crossmatch Modal */}
      {crossmatchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Certify Pre-Transfusion Crossmatch
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
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
                <strong className="text-slate-700">Recipient Patient:</strong> {crossmatchTarget.reservation.bloodrequests?.patientname || "Emergency Patient"}
              </div>
              <div>
                <strong className="text-slate-700">Group Compatibility:</strong> Donor Unit ({crossmatchTarget.item.bloodgroup}) with Recipient ({crossmatchTarget.reservation.bloodrequests?.bloodgroup})
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Crossmatch Test Result</label>
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

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Testing Method</label>
                <input
                  type="text"
                  value={crossmatchMethod}
                  onChange={(e) => setCrossmatchMethod(e.target.value)}
                  placeholder="e.g. Gel Column Coombs, Tube Saline, Immediate Spin..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  Technologist Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={technologistName}
                  onChange={(e) => setTechnologistName(e.target.value)}
                  placeholder="e.g. A. Patel, Blood Bank Tech"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  Second Clinical Verifier (Dual Sign-off) <span className="text-rose-600">*</span>
                </label>
                {verifiers.length === 0 ? (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    No second active verifier available. Dual sign-off requires a second authorized BLOOD_BANK or ADMIN user.
                  </div>
                ) : (
                  <select
                    value={selectedVerifierId}
                    onChange={(e) => setSelectedVerifierId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 bg-white focus:outline-none focus:border-[#317786]"
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
                <label className="font-semibold text-slate-700">Clinical Observations (Optional)</label>
                <input
                  type="text"
                  value={crossmatchNotes}
                  onChange={(e) => setCrossmatchNotes(e.target.value)}
                  placeholder="Minor antibody screen negative, clear reaction..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCrossmatchTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordCrossmatch}
                disabled={isSubmittingCrossmatch || verifiers.length === 0 || !selectedVerifierId}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCrossmatch ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Certifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Commit Certificate</span>
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
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Dispatch Temperature-Monitored Cold Box
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Reservation #{dispatchTarget.reservationid.slice(0, 8)} ({dispatchTarget.items?.length || 0} unit(s) certified)
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

            <div className="p-3 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-[#053845] font-bold">
                <Thermometer className="w-4 h-4 text-[#317786]" />
                <span>Cold-Chain Regulatory Compliance (2°C–6°C)</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Whole blood and red cells must depart the blood bank strictly within 2°C to 6°C using validated insulated transport containers.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  Courier Departure Temperature (°C) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={courierTempC}
                  onChange={(e) => setCourierTempC(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786] font-mono font-bold"
                />
                <span className="text-[11px] text-slate-500">
                  Recommended calibrated dispatch temperature: 4.0°C
                </span>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Courier / Transport Notes (Optional)</label>
                <input
                  type="text"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Courier vehicle #, sealed cold box lock ID..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-[#317786]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDispatchTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDispatchReservation}
                disabled={isSubmittingDispatch}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
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
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-rose-900">
                  Cancel Blood Reservation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Reservation #{cancelTarget.reservationid.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setCancelTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Cancellation Reason <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Reason (e.g. Crossmatch incompatibility, patient surgery postponed, requisition modified)..."
                rows={3}
                className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 text-slate-800 placeholder:text-slate-400"
              />
              <p className="text-[11px] text-slate-500">
                Cancelling releases all reserved units back to AVAILABLE vault stock in the immutable ledger.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleCancelReservation}
                disabled={isSubmittingCancel || cancellationReason.trim().length < 5}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
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
