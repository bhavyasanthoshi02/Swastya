"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Building2,
  Droplets,
  Calendar,
  Lock,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
  X,
  PackageCheck,
  AlertCircle,
  Eye,
} from "lucide-react";
import {
  api,
  RequisitionAssignmentItem,
  InventoryUnitItem,
} from "@/lib/api";
import { getStoredBloodBank, AuthBloodBank } from "@/lib/auth";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { formatDate } from "@/lib/mappers";

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

function formatBloodGroup(bg?: string | null): string {
  if (!bg) return "—";
  return bg
    .replace("_POSITIVE", "+")
    .replace("_NEGATIVE", "-")
    .replace("POSITIVE", "+")
    .replace("NEGATIVE", "-");
}

function checkDonorCompatibility(donor?: string | null, recipient?: string | null, component?: string | null): boolean {
  if (!donor || !recipient) return false;
  const norm = (bg: string) =>
    bg
      .replace("_POSITIVE", "+")
      .replace("_NEGATIVE", "-")
      .replace("POSITIVE", "+")
      .replace("NEGATIVE", "-")
      .trim();

  const d = norm(donor);
  const r = norm(recipient);
  const comp = component || "WHOLE_BLOOD";

  if (comp === "WHOLE_BLOOD") {
    return d === r;
  }

  if (comp === "RBC") {
    if (d === "O-") return true;
    if (d === "O+") return ["O+", "A+", "B+", "AB+"].includes(r);
    if (d === "A-") return ["A-", "A+", "AB-", "AB+"].includes(r);
    if (d === "A+") return ["A+", "AB+"].includes(r);
    if (d === "B-") return ["B-", "B+", "AB-", "AB+"].includes(r);
    if (d === "B+") return ["B+", "AB+"].includes(r);
    if (d === "AB-") return ["AB-", "AB+"].includes(r);
    if (d === "AB+") return r === "AB+";
    return d === r;
  }

  if (comp === "PLASMA") {
    if (d === "AB+" || d === "AB-") return true;
    if (d === "A+" || d === "A-") return ["A+", "A-", "O+", "O-"].includes(r);
    if (d === "B+" || d === "B-") return ["B+", "B-", "O+", "O-"].includes(r);
    if (d === "O+" || d === "O-") return ["O+", "O-"].includes(r);
    return d === r;
  }

  return d === r;
}

function getAssignmentStatus(assignment: RequisitionAssignmentItem): string {
  return assignment.assignmentstatus || assignment.status || "PENDING_ACCEPTANCE";
}

function isPendingStatus(status: string): boolean {
  return status === "PENDING_ACCEPTANCE" || status === "PENDING";
}

function isAcceptedStatus(status: string): boolean {
  return status === "ACCEPTED";
}

function isDeclinedStatus(status: string): boolean {
  return status === "DECLINED" || status === "REJECTED";
}

function isCancelledStatus(status: string): boolean {
  return status === "CANCELLED" || status === "SUPERSEDED";
}

export default function BloodBankRequisitionsPage() {
  const [bloodbank, setBloodBank] = useState<AuthBloodBank | null>(null);
  const [assignments, setAssignments] = useState<RequisitionAssignmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Details Modal State
  const [selectedDetailAssignment, setSelectedDetailAssignment] = useState<RequisitionAssignmentItem | null>(null);
  const [detailConfirmAction, setDetailConfirmAction] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [detailDeclineReason, setDetailDeclineReason] = useState("");
  const [isSubmittingDetailAction, setIsSubmittingDetailAction] = useState(false);
  const [detailActionError, setDetailActionError] = useState<string | null>(null);

  // Rejection Modal State
  const [rejectionTarget, setRejectionTarget] = useState<RequisitionAssignmentItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);

  // Acceptance Modal State
  const [acceptanceTarget, setAcceptanceTarget] = useState<RequisitionAssignmentItem | null>(null);
  const [isSubmittingAcceptance, setIsSubmittingAcceptance] = useState(false);

  // Reservation Modal State
  const [reservationTarget, setReservationTarget] = useState<RequisitionAssignmentItem | null>(null);
  const [availableUnits, setAvailableUnits] = useState<InventoryUnitItem[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [reservationNotes, setReservationNotes] = useState("");
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);
  const [isSubmittingReservation, setIsSubmittingReservation] = useState(false);
  const [reservationError, setReservationError] = useState<string | null>(null);

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
        setError("Facility authentication profile not found. Please log in again.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load requisition assignments");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load available units when opening reservation modal
  const openReservationModal = async (assignment: RequisitionAssignmentItem) => {
    setReservationTarget(assignment);
    setSelectedUnitIds([]);
    setReservationNotes("");
    setReservationError(null);

    if (!bloodbank || !assignment.bloodrequests) return;

    try {
      setIsLoadingUnits(true);
      const res = await api.bloodbank.getUnits(bloodbank.bloodbankid, {
        status: "AVAILABLE",
        bloodcomponent: assignment.bloodrequests.bloodcomponent,
      });

      if (res.success) {
        const reqGroup = assignment.bloodrequests.bloodgroup;
        const reqComp = assignment.bloodrequests.bloodcomponent;

        // Filter units that:
        // - Match requested group or clinically compatible donor group
        // - Have passed TTI screening
        // - Are in AVAILABLE status
        // - Are not expired
        const passedUnits = (res.units || []).filter((u: InventoryUnitItem) => {
          const isAvail = u.status === "AVAILABLE";
          const screeningPassed =
            u.ttiscreeningstatus === "PASSED" ||
            u.screeningstatus === "PASSED" ||
            u.currentscreening?.overallstatus === "PASSED";
          const isUnexpired = new Date(u.expirydate).getTime() > Date.now();
          const isCompatible = checkDonorCompatibility(u.bloodgroup, reqGroup, reqComp);
          return isAvail && screeningPassed && isUnexpired && isCompatible;
        });
        setAvailableUnits(passedUnits);
      }
    } catch (err: any) {
      setReservationError(err?.message || "Failed to load available units for reservation");
    } finally {
      setIsLoadingUnits(false);
    }
  };

  // Handle Acceptance Submit
  const handleAcceptAssignment = async (target?: RequisitionAssignmentItem) => {
    const item = target || acceptanceTarget;
    if (!bloodbank || !item) return;

    try {
      setIsSubmittingAcceptance(true);
      setIsSubmittingDetailAction(true);
      setDetailActionError(null);
      const idempotencyKey = generateIdempotencyKey();
      const res = await api.bloodbank.updateAssignment(
        bloodbank.bloodbankid,
        item.assignmentid,
        {
          action: "ACCEPT",
          status: "ACCEPTED",
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage("Requisition accepted. You can now reserve verified units for dispatch.");
        setAcceptanceTarget(null);
        setDetailConfirmAction(null);
        if (selectedDetailAssignment && selectedDetailAssignment.assignmentid === item.assignmentid) {
          setSelectedDetailAssignment(
            res.assignment || {
              ...selectedDetailAssignment,
              assignmentstatus: "ACCEPTED",
              status: "ACCEPTED",
            }
          );
        }
        await loadData(true);
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to accept requisition assignment";
      setError(msg);
      setDetailActionError(msg);
    } finally {
      setIsSubmittingAcceptance(false);
      setIsSubmittingDetailAction(false);
    }
  };

  // Handle Rejection Submit
  const handleRejectAssignment = async (
    target?: RequisitionAssignmentItem,
    reasonOverride?: string
  ) => {
    const item = target || rejectionTarget;
    const reasonToUse = (reasonOverride !== undefined ? reasonOverride : rejectionReason).trim();
    if (!bloodbank || !item) return;

    if (reasonToUse.length < 5) {
      const msg = "Please provide a valid clinical or operational reason for declining (minimum 5 characters).";
      setError(msg);
      setDetailActionError(msg);
      return;
    }

    try {
      setIsSubmittingRejection(true);
      setIsSubmittingDetailAction(true);
      setDetailActionError(null);
      const idempotencyKey = generateIdempotencyKey();
      const res = await api.bloodbank.updateAssignment(
        bloodbank.bloodbankid,
        item.assignmentid,
        {
          action: "DECLINE",
          status: "DECLINED",
          declineReason: reasonToUse,
          rejectionreason: reasonToUse,
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage("Requisition declined and returned to regional pool.");
        setRejectionTarget(null);
        setRejectionReason("");
        setDetailConfirmAction(null);
        setDetailDeclineReason("");
        if (selectedDetailAssignment && selectedDetailAssignment.assignmentid === item.assignmentid) {
          setSelectedDetailAssignment(
            res.assignment || {
              ...selectedDetailAssignment,
              assignmentstatus: "DECLINED",
              status: "DECLINED",
              declinereason: reasonToUse,
            }
          );
        }
        await loadData(true);
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to decline requisition assignment";
      setError(msg);
      setDetailActionError(msg);
    } finally {
      setIsSubmittingRejection(false);
      setIsSubmittingDetailAction(false);
    }
  };

  // Handle Reservation Submit
  const handleCreateReservation = async () => {
    if (!bloodbank || !reservationTarget || !reservationTarget.bloodrequests) return;

    const unitsRequired = reservationTarget.bloodrequests.unitsrequired || 1;
    if (selectedUnitIds.length !== unitsRequired) {
      setReservationError(
        `Please select exactly ${unitsRequired} unit(s) to fulfill this requisition (currently ${selectedUnitIds.length} selected).`
      );
      return;
    }

    try {
      setIsSubmittingReservation(true);
      setReservationError(null);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.bloodbank.createReservation(
        bloodbank.bloodbankid,
        {
          assignmentid: reservationTarget.assignmentid,
          bloodgroup: reservationTarget.bloodrequests.bloodgroup,
          bloodcomponent: reservationTarget.bloodrequests.bloodcomponent,
          quantity: selectedUnitIds.length,
          requestedunitids: selectedUnitIds,
          notes: reservationNotes.trim() || undefined,
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage(
          `Successfully reserved ${selectedUnitIds.length} unit(s). Allocated to Requisition #${reservationTarget.requestid.slice(0, 8)}. Ready for crossmatching in Dispatch.`
        );
        setReservationTarget(null);
        setSelectedUnitIds([]);
        setReservationNotes("");
        await loadData(true);
      }
    } catch (err: any) {
      setReservationError(err?.message || "Failed to create blood unit reservation.");
    } finally {
      setIsSubmittingReservation(false);
    }
  };

  // Toggle unit selection
  const toggleUnitSelection = (unitId: string) => {
    const unitsRequired = reservationTarget?.bloodrequests?.unitsrequired || 1;
    setSelectedUnitIds((prev) => {
      if (prev.includes(unitId)) {
        return prev.filter((id) => id !== unitId);
      }
      if (prev.length >= unitsRequired) {
        return prev;
      }
      return [...prev, unitId];
    });
  };

  // Filtered Assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      const rawStatus = getAssignmentStatus(item);

      // Status filter
      if (statusFilter !== "ALL") {
        if (statusFilter === "PENDING" && !isPendingStatus(rawStatus)) {
          return false;
        }
        if (statusFilter === "ACCEPTED" && !isAcceptedStatus(rawStatus)) {
          return false;
        }
        if (statusFilter === "REJECTED" && !isDeclinedStatus(rawStatus)) {
          return false;
        }
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hospitalName = item.bloodrequests?.hospitals?.hospitalname?.toLowerCase() || "";
        const patientName = item.bloodrequests?.patientname?.toLowerCase() || "";
        const reqId = item.requestid?.toLowerCase() || "";
        const assignId = item.assignmentid?.toLowerCase() || "";
        const group = item.bloodrequests?.bloodgroup?.toLowerCase() || "";
        const groupDisplay = formatBloodGroup(item.bloodrequests?.bloodgroup).toLowerCase();
        const comp = item.bloodrequests?.bloodcomponent?.toLowerCase() || "";
        const compDisplay = formatComponentLabel(item.bloodrequests?.bloodcomponent).toLowerCase();
        return (
          hospitalName.includes(q) ||
          patientName.includes(q) ||
          reqId.includes(q) ||
          assignId.includes(q) ||
          group.includes(q) ||
          groupDisplay.includes(q) ||
          comp.includes(q) ||
          compDisplay.includes(q)
        );
      }
      return true;
    });
  }, [assignments, statusFilter, searchQuery]);

  // Quick Metrics
  const pendingCount = assignments.filter((a) => isPendingStatus(getAssignmentStatus(a))).length;
  const acceptedCount = assignments.filter((a) => isAcceptedStatus(getAssignmentStatus(a))).length;
  const rejectedCount = assignments.filter((a) => isDeclinedStatus(getAssignmentStatus(a))).length;

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
            Showing {filteredAssignments.length} of {assignments.length}{" "}
            {assignments.length === 1 ? "requisition" : "requisitions"}
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
            <ClipboardList className="w-5 h-5 text-[#317786]" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
                Hospital Requisitions
              </h1>
              {!isLoading && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#317786]/10 border border-[#317786]/20 text-[#317786]">
                  {assignments.length} Assigned
                </span>
              )}
            </div>
            <p className="hidden sm:block text-xs sm:text-sm text-slate-500">
              Review and manage incoming blood requests from hospitals.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh requisitions"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* 2. Four Compact Summary Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Pending Review */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending Review</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {pendingCount}
          </div>
          <p className="text-[11px] text-amber-700 font-medium">Awaiting response</p>
        </div>

        {/* Accepted / Reserved */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Accepted / Reserved</span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {acceptedCount}
          </div>
          <p className="text-[11px] text-teal-700 font-medium">In fulfillment</p>
        </div>

        {/* Declined / Returned */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Declined / Returned</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-700">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-rose-900">
            {rejectedCount}
          </div>
          <p className="text-[11px] text-rose-700 font-medium">Returned to pool</p>
        </div>

        {/* Total Assignments */}
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Assignments</span>
            <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#053845]">
              <ClipboardList className="w-3.5 h-3.5 text-[#053845]" />
            </div>
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {assignments.length}
          </div>
          <p className="text-[11px] text-slate-500 font-medium">All assignments</p>
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
              placeholder="Search by Patient Name, Requisition ID, or Blood Group..."
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

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold focus:outline-none focus:border-[#317786]"
            >
              <option value="ALL">All Requisitions</option>
              <option value="PENDING">Pending Review</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Declined</option>
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

      {/* 4. Requisition Records Table */}
      <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <RefreshCw className="w-7 h-7 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading hospital requisitions...</p>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center text-[#317786] mx-auto">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-serif text-base font-bold text-[#053845]">
                {assignments.length === 0 ? "No hospital requisitions found" : "No matching requisitions"}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {assignments.length === 0
                  ? "New hospital blood requests will appear here."
                  : "No requisition assignments match your active search and filter criteria."}
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
                  <th className="py-3 px-5">Requisition ID</th>
                  <th className="py-3 px-4">Hospital & Patient</th>
                  <th className="py-3 px-4">Blood Group</th>
                  <th className="py-3 px-4">Component</th>
                  <th className="py-3 px-4 text-center">Units</th>
                  <th className="py-3 px-4">Urgency</th>
                  <th className="py-3 px-4">Required By</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredAssignments.map((assignment) => {
                  const req = assignment.bloodrequests;
                  const rawStatus = getAssignmentStatus(assignment);
                  const isPending = isPendingStatus(rawStatus);
                  const isAccepted = isAcceptedStatus(rawStatus);
                  const isDeclined = isDeclinedStatus(rawStatus);
                  const isCancelled = isCancelledStatus(rawStatus);
                  const hasReservation = (assignment.bloodreservations || []).length > 0;
                  const displayGroup = formatBloodGroup(req?.bloodgroup);

                  return (
                    <tr
                      key={assignment.assignmentid}
                      onClick={() => setSelectedDetailAssignment(assignment)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      {/* Requisition ID */}
                      <td className="py-3.5 px-5 font-mono text-[11px] text-slate-600">
                        #{assignment.requestid.slice(0, 8)}
                      </td>

                      {/* Hospital & Patient */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#053845] flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-[#317786] shrink-0" />
                          <span>{req?.hospitals?.hospitalname || "Hospital Requisition"}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {req?.hospitals?.city
                            ? `${req.hospitals.city}${req.hospitals.state ? `, ${req.hospitals.state}` : ""}`
                            : req?.patientname
                            ? `Patient: ${req.patientname}`
                            : "Clinical Requisition"}
                        </div>
                      </td>

                      {/* Blood Group */}
                      <td className="py-3.5 px-4 font-bold text-[#053845]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]">
                          <Droplets className="w-3 h-3 text-[#B94F30]" />
                          <span>{displayGroup}</span>
                        </span>
                      </td>

                      {/* Component */}
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {formatComponentLabel(req?.bloodcomponent)}
                      </td>

                      {/* Units */}
                      <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-[#053845]">
                        {req?.unitsrequired || 1} units
                      </td>

                      {/* Urgency */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            req?.urgencylevel === "CRITICAL" || req?.urgencylevel === "HIGH"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-sky-50 text-sky-800 border border-sky-200"
                          }`}
                        >
                          {req?.urgencylevel === "CRITICAL" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                          )}
                          <span>{req?.urgencylevel || "MEDIUM"}</span>
                        </span>
                      </td>

                      {/* Required By */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {req?.requiredby ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{formatDate(req.requiredby)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Immediate</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Acceptance</span>
                          </span>
                        )}
                        {isAccepted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Accepted</span>
                          </span>
                        )}
                        {isDeclined && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-[#A2363A] border border-rose-200">
                            <XCircle className="w-3 h-3 text-[#A2363A]" />
                            <span>Declined</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <span>Cancelled</span>
                          </span>
                        )}
                        {!isPending && !isAccepted && !isDeclined && !isCancelled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <span>{rawStatus}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedDetailAssignment(assignment)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#FAF6EE] text-[#053845] font-semibold text-xs border border-[#F3E9D1] shadow-2xs transition-all cursor-pointer"
                            title="View Requisition Details"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#317786]" />
                            <span>Details</span>
                          </button>

                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => setAcceptanceTarget(assignment)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Accept</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectionTarget(assignment);
                                  setRejectionReason("");
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs border border-rose-200 transition-all cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Decline</span>
                              </button>
                            </>
                          )}

                          {isAccepted && !hasReservation && (
                            <button
                              type="button"
                              onClick={() => openReservationModal(assignment)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs shadow-2xs transition-all cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Reserve Units</span>
                            </button>
                          )}

                          {isAccepted && hasReservation && (
                            <Link
                              href="/bloodbank/dispatch"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FAF6EE] hover:bg-[#FAF6EE]/80 text-[#317786] font-semibold text-xs border border-[#F3E9D1] transition-all"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>View Dispatch</span>
                            </Link>
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

      {/* Accept Requisition Modal */}
      {acceptanceTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Accept Hospital Blood Requisition
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Requisition ID: #{acceptanceTarget.requestid.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setAcceptanceTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-2 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient:</span>
                <span className="font-semibold text-[#053845]">
                  {acceptanceTarget.bloodrequests?.patientname || "Emergency Patient"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Required:</span>
                <span className="font-bold text-[#053845]">
                  {acceptanceTarget.bloodrequests?.unitsrequired} Unit(s) of{" "}
                  {formatBloodGroup(acceptanceTarget.bloodrequests?.bloodgroup)} (
                  {formatComponentLabel(acceptanceTarget.bloodrequests?.bloodcomponent)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Urgency:</span>
                <span className="font-semibold text-rose-700">
                  {acceptanceTarget.bloodrequests?.urgencylevel}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Accepting this requisition commits your facility to locking stock and processing crossmatch tests for the requesting hospital.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAcceptanceTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAcceptAssignment()}
                disabled={isSubmittingAcceptance}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isSubmittingAcceptance ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm Acceptance</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Requisition Modal */}
      {rejectionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-rose-900">
                  Decline Hospital Blood Requisition
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Requisition ID: #{rejectionTarget.requestid.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setRejectionTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Reason for Declining <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Specify clinical or operational reason (e.g. Insufficient cleared inventory in vault, cold-chain maintenance)..."
                rows={3}
                className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 text-slate-800 placeholder:text-slate-400"
              />
              <p className="text-[11px] text-slate-500">
                This reason will be recorded in the audit log and notified to the requesting hospital.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectionTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRejectAssignment()}
                disabled={isSubmittingRejection || rejectionReason.trim().length < 5}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isSubmittingRejection ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Declining...</span>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    <span>Decline Requisition</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Reservation Modal */}
      {reservationTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Reserve Blood Units for Transfusion
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  Allocate tested AVAILABLE units to Requisition #{reservationTarget.requestid.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setReservationTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reservationError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{reservationError}</span>
              </div>
            )}

            {/* Requisition Order Details */}
            <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Patient</span>
                <p className="font-bold text-[#053845] truncate">
                  {reservationTarget.bloodrequests?.patientname || "Emergency Patient"}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Group</span>
                <p className="font-bold text-[#053845]">
                  {formatBloodGroup(reservationTarget.bloodrequests?.bloodgroup)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Component</span>
                <p className="font-bold text-[#053845] truncate">
                  {formatComponentLabel(reservationTarget.bloodrequests?.bloodcomponent)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Quantity Needed</span>
                <p className="font-bold text-[#B94F30]">
                  {reservationTarget.bloodrequests?.unitsrequired} Unit(s)
                </p>
              </div>
            </div>

            {/* Unit Selection Section */}
            {(() => {
              const unitsRequired = reservationTarget.bloodrequests?.unitsrequired || 1;
              const isExactMatched = selectedUnitIds.length === unitsRequired;

              return (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="text-xs font-bold text-slate-700">
                      Select Certified Eligible Units ({selectedUnitIds.length} / {unitsRequired} selected)
                    </label>
                    <span className="text-[11px]">
                      {isExactMatched ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Exact quantity matched ({unitsRequired} unit(s))</span>
                        </span>
                      ) : (
                        <span className="text-amber-800 font-semibold">
                          Select exactly {unitsRequired} unit(s) ({unitsRequired - selectedUnitIds.length} remaining)
                        </span>
                      )}
                    </span>
                  </div>

                  {isLoadingUnits ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin text-[#317786]" />
                      <span className="text-xs">Searching vault inventory for eligible stock...</span>
                    </div>
                  ) : availableUnits.length === 0 ? (
                    <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-center space-y-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto" />
                      <h4 className="text-xs font-bold text-amber-900">
                        No Eligible Cleared Units Found
                      </h4>
                      <p className="text-[11px] text-amber-800 leading-relaxed max-w-md mx-auto">
                        There are currently no certified AVAILABLE units matching group{" "}
                        <strong>{formatBloodGroup(reservationTarget.bloodrequests?.bloodgroup)}</strong> and component{" "}
                        <strong>{formatComponentLabel(reservationTarget.bloodrequests?.bloodcomponent)}</strong>. Ensure units have passed 5-panel TTI screening in the Screening portal.
                      </p>
                      <Link
                        href="/bloodbank/screening"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#317786] underline pt-1"
                      >
                        <span>Go to TTI Screening Portal</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2.5">
                      {availableUnits.map((unit) => {
                        const isSelected = selectedUnitIds.includes(unit.unitid);
                        return (
                          <div
                            key={unit.unitid}
                            onClick={() => toggleUnitSelection(unit.unitid)}
                            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer transition-all ${
                              isSelected
                                ? "border-[#317786] bg-[#FAF6EE] shadow-2xs ring-1 ring-[#317786]/20"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="rounded text-[#317786] focus:ring-[#317786] mt-0.5"
                              />
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-[#053845]">
                                    {unit.unitbarcode}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]">
                                    <Droplets className="w-3 h-3 text-[#B94F30]" />
                                    <span>{formatBloodGroup(unit.bloodgroup)}</span>
                                  </span>
                                  <span className="text-xs font-medium text-slate-700">
                                    {formatComponentLabel(unit.bloodcomponent)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                                  <span>Collected: {unit.collectiondate ? formatDate(unit.collectiondate) : "N/A"}</span>
                                  <span>•</span>
                                  <span className="text-amber-800 font-medium">Expires: {formatDate(unit.expirydate)}</span>
                                  <span>•</span>
                                  <span className="text-[#317786]">Vault Location: {unit.storagebinlocation || "Main Cold Vault"}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>TTI PASSED</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Confirmation Summary Box before Reservation */}
                  {isExactMatched && (
                    <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 space-y-2 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-teal-900">
                        <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                        <span>Reservation Confirmation Summary</span>
                      </div>
                      <div className="text-slate-700 space-y-1">
                        <p>
                          Allocating <strong>{selectedUnitIds.length} unit(s)</strong> of{" "}
                          <strong>
                            {formatBloodGroup(reservationTarget.bloodrequests?.bloodgroup)} (
                            {formatComponentLabel(reservationTarget.bloodrequests?.bloodcomponent)})
                          </strong>{" "}
                          to Requisition #{reservationTarget.requestid.slice(0, 8)}.
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedUnitIds.map((id) => {
                            const u = availableUnits.find((unit) => unit.unitid === id);
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-white border border-teal-300 text-[#053845]"
                              >
                                <span>{u?.unitbarcode || id.slice(0, 8)}</span>
                                <span className="text-[10px] text-slate-500">
                                  ({u?.storagebinlocation || "Vault"})
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <p className="text-[11px] text-teal-800 italic pt-1">
                        Allocating will lock these units in the physical inventory ledger and forward them for crossmatch certification in Dispatch.
                      </p>
                    </div>
                  )}

                  {/* Optional Notes */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Allocation Notes (Optional)</label>
                    <input
                      type="text"
                      value={reservationNotes}
                      onChange={(e) => setReservationNotes(e.target.value)}
                      placeholder="Cold-chain container #, courier instructions, etc..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800 placeholder:text-slate-400"
                    />
                  </div>

                  {/* Modal Actions */}
                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setReservationTarget(null)}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateReservation}
                      disabled={isSubmittingReservation || !isExactMatched}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingReservation ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Allocating...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>Confirm Unit Reservation</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Requisition Details Modal */}
      {selectedDetailAssignment && (() => {
        const req = selectedDetailAssignment.bloodrequests;
        const rawStatus = getAssignmentStatus(selectedDetailAssignment);
        const isPending = isPendingStatus(rawStatus);
        const isAccepted = isAcceptedStatus(rawStatus);
        const isDeclined = isDeclinedStatus(rawStatus);
        const isCancelled = isCancelledStatus(rawStatus);
        const hasReservation = (selectedDetailAssignment.bloodreservations || []).length > 0;
        const displayGroup = formatBloodGroup(req?.bloodgroup);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-bold text-[#053845]">
                      Hospital Blood Requisition
                    </h3>
                    {isPending && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Pending Acceptance</span>
                      </span>
                    )}
                    {isAccepted && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Accepted</span>
                      </span>
                    )}
                    {isDeclined && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-[#A2363A] border border-rose-200">
                        <XCircle className="w-3.5 h-3.5 text-[#A2363A]" />
                        <span>Declined</span>
                      </span>
                    )}
                    {isCancelled && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <span>Cancelled</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    Requisition ID: #{selectedDetailAssignment.requestid.slice(0, 8)} &bull; Assigned: {formatDate(selectedDetailAssignment.assignedat)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedDetailAssignment(null);
                    setDetailConfirmAction(null);
                    setDetailActionError(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {detailActionError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{detailActionError}</span>
                </div>
              )}

              {/* Requesting Hospital Info */}
              <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#317786] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Requesting Facility</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <div className="font-bold text-[#053845] text-sm">
                    {req?.hospitals?.hospitalname || "Hospital Requisition"}
                  </div>
                  {(req?.hospitals?.city || req?.hospitals?.state) && (
                    <div className="text-slate-600 font-medium">
                      {req?.hospitals?.city}{req?.hospitals?.state ? `, ${req.hospitals.state}` : ""}
                    </div>
                  )}
                </div>
                {req?.hospitals?.address && (
                  <div className="text-xs text-slate-600">
                    <span className="text-slate-400">Address: </span>
                    {req.hospitals.address}
                  </div>
                )}
                {req?.hospitals?.contactpersonname && (
                  <div className="text-xs text-slate-600">
                    <span className="text-slate-400">Contact: </span>
                    {req.hospitals.contactpersonname} ({req.hospitals.contactpersonphone || "N/A"})
                  </div>
                )}
              </div>

              {/* Clinical Requirements Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Blood Group</span>
                  <div className="font-bold text-[#053845] text-base flex items-center gap-1">
                    <Droplets className="w-4 h-4 text-[#B94F30]" />
                    <span>{displayGroup}</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Component</span>
                  <div className="font-semibold text-slate-800 text-xs">
                    {formatComponentLabel(req?.bloodcomponent)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Units Required</span>
                  <div className="font-bold text-[#053845] text-base font-mono">
                    {req?.unitsrequired || 1} units
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Urgency</span>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        req?.urgencylevel === "CRITICAL" || req?.urgencylevel === "HIGH"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-sky-50 text-sky-800 border border-sky-200"
                      }`}
                    >
                      {req?.urgencylevel || "MEDIUM"}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5 col-span-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Required By</span>
                  <div className="text-xs text-slate-700 font-medium flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{req?.requiredby ? formatDate(req.requiredby) : "Immediate Delivery Needed"}</span>
                  </div>
                </div>
              </div>

              {/* Patient & Notes Card */}
              <div className="p-3.5 rounded-xl border border-slate-200/80 space-y-2 text-xs text-slate-700">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Patient:</span>
                  <span className="font-semibold text-[#053845]">
                    {req?.patientname || (isAccepted ? "Patient name not specified" : "Protected (revealed upon acceptance)")}
                  </span>
                </div>
                {(req?.patientage || req?.patientgender) && (
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">Demographics:</span>
                    <span className="font-medium text-slate-700">
                      {req?.patientage ? `${req.patientage} yrs` : ""}{req?.patientgender ? ` / ${req.patientgender}` : ""}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 font-medium block mb-1">Clinical Notes:</span>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-relaxed font-sans">
                    {req?.notes || "No clinical notes attached to this requisition."}
                  </p>
                </div>
                {isDeclined && (selectedDetailAssignment.declinereason || selectedDetailAssignment.rejectionreason) && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                      <AlertCircle className="w-4 h-4 text-[#A2363A] shrink-0" />
                      <span>
                        {(selectedDetailAssignment.declinereason || selectedDetailAssignment.rejectionreason || "").includes(
                          "Insufficient eligible blood stock"
                        )
                          ? "System Auto-Declined (Insufficient Stock)"
                          : "Reason for Declining"}
                      </span>
                    </div>
                    <p className="text-xs">
                      {selectedDetailAssignment.declinereason || selectedDetailAssignment.rejectionreason}
                    </p>
                    {selectedDetailAssignment.respondedat && (
                      <p className="text-[10px] text-rose-600 font-mono">
                        Responded: {formatDate(selectedDetailAssignment.respondedat)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Allocated Units & Traceability Section */}
              {hasReservation && (
                <div className="p-3.5 rounded-xl bg-teal-50/60 border border-teal-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-teal-900">
                      <PackageCheck className="w-4 h-4 text-teal-700" />
                      <span>Allocated Blood Units & Traceability</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      RESERVED (ACTIVE)
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {(selectedDetailAssignment.bloodreservations || [])
                      .flatMap((res) => res.reservationitems || res.items || [])
                      .map((item, idx) => {
                        const unit = item.inventoryunits;
                        return (
                          <div
                            key={item.itemid || item.reservationitemid || idx}
                            className="p-2.5 rounded-lg bg-white border border-teal-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#053845]">
                                  {unit?.unitbarcode || item.unitbarcode || item.unitid.slice(0, 8)}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                                  {formatBloodGroup(unit?.bloodgroup || item.bloodgroup || req?.bloodgroup)}
                                </span>
                                <span className="text-slate-500 text-[11px]">
                                  {formatComponentLabel(unit?.bloodcomponent || item.bloodcomponent || req?.bloodcomponent)}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>Location: {unit?.storagebinlocation || "Main Cold Vault"}</span>
                                {unit?.expirydate && <span>• Expires: {formatDate(unit.expirydate)}</span>}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200 self-start sm:self-center">
                              {item.itemstatus || item.status || "RESERVED"}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  <div className="pt-1 flex justify-end">
                    <Link
                      href="/bloodbank/dispatch"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#317786] hover:underline"
                    >
                      <span>Proceed to Clinical Crossmatching & Dispatch</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}

              {/* Action Confirmation Forms inside Details Modal */}
              {detailConfirmAction === "ACCEPT" && (
                <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-teal-900">Confirm Acceptance</h4>
                      <p className="text-xs text-teal-800 leading-relaxed">
                        Accepting this requisition commits your facility to locking stock and performing crossmatch compatibility. Are you sure you want to proceed?
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDetailConfirmAction(null)}
                      disabled={isSubmittingDetailAction}
                      className="px-3 py-1.5 rounded-lg border border-teal-200 text-xs font-semibold text-teal-900 hover:bg-teal-100/50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcceptAssignment(selectedDetailAssignment)}
                      disabled={isSubmittingDetailAction}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingDetailAction ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Confirming...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Yes, Accept Requisition</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {detailConfirmAction === "DECLINE" && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-[#A2363A] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-rose-900">Decline Hospital Requisition</h4>
                      <p className="text-xs text-rose-800">
                        Please provide a clinical or operational reason (minimum 5 characters).
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={detailDeclineReason}
                    onChange={(e) => setDetailDeclineReason(e.target.value)}
                    placeholder="E.g. Inadequate tested inventory available, cold-chain maintenance in progress..."
                    rows={3}
                    className="w-full p-2.5 text-xs rounded-xl border border-rose-200 bg-white focus:outline-none focus:border-rose-500 text-slate-800 placeholder:text-slate-400"
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailConfirmAction(null);
                        setDetailDeclineReason("");
                      }}
                      disabled={isSubmittingDetailAction}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-900 hover:bg-rose-100/50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectAssignment(selectedDetailAssignment, detailDeclineReason)}
                      disabled={isSubmittingDetailAction || detailDeclineReason.trim().length < 5}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingDetailAction ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Declining...</span>
                        </>
                      ) : (
                        <>
                          <X className="w-3.5 h-3.5" />
                          <span>Confirm Decline</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDetailAssignment(null);
                    setDetailConfirmAction(null);
                    setDetailActionError(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Close
                </button>

                {!detailConfirmAction && (
                  <div className="flex items-center gap-2">
                    {isPending && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setDetailConfirmAction("DECLINE");
                            setDetailDeclineReason("");
                            setDetailActionError(null);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs border border-rose-200 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDetailConfirmAction("ACCEPT");
                            setDetailActionError(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept Requisition</span>
                        </button>
                      </>
                    )}

                    {isAccepted && !hasReservation && (
                      <button
                        type="button"
                        onClick={() => {
                          const assign = selectedDetailAssignment;
                          setSelectedDetailAssignment(null);
                          openReservationModal(assign);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs shadow-2xs transition-all cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Reserve Units Now</span>
                      </button>
                    )}

                    {isAccepted && hasReservation && (
                      <Link
                        href="/bloodbank/dispatch"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#053845] hover:bg-[#317786] text-white font-semibold text-xs shadow-2xs transition-all"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>View in Dispatch</span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
