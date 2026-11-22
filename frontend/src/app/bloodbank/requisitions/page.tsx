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
        bloodgroup: assignment.bloodrequests.bloodgroup,
        bloodcomponent: assignment.bloodrequests.bloodcomponent,
      });

      if (res.success) {
        // Only include units that have passed screening
        const passedUnits = (res.units || []).filter(
          (u) => u.status === "AVAILABLE" && u.screeningstatus === "PASSED"
        );
        setAvailableUnits(passedUnits);
      }
    } catch (err: any) {
      setReservationError(err?.message || "Failed to load available units for reservation");
    } finally {
      setIsLoadingUnits(false);
    }
  };

  // Handle Acceptance Submit
  const handleAcceptAssignment = async () => {
    if (!bloodbank || !acceptanceTarget) return;

    try {
      setIsSubmittingAcceptance(true);
      const idempotencyKey = generateIdempotencyKey();
      const res = await api.bloodbank.updateAssignment(
        bloodbank.bloodbankid,
        acceptanceTarget.assignmentid,
        { status: "ACCEPTED" },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage("Requisition accepted. You can now reserve verified units for dispatch.");
        setAcceptanceTarget(null);
        await loadData(true);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to accept requisition assignment");
    } finally {
      setIsSubmittingAcceptance(false);
    }
  };

  // Handle Rejection Submit
  const handleRejectAssignment = async () => {
    if (!bloodbank || !rejectionTarget) return;
    if (rejectionReason.trim().length < 5) {
      setError("Please provide a valid clinical or operational reason for declining.");
      return;
    }

    try {
      setIsSubmittingRejection(true);
      const idempotencyKey = generateIdempotencyKey();
      const res = await api.bloodbank.updateAssignment(
        bloodbank.bloodbankid,
        rejectionTarget.assignmentid,
        {
          status: "REJECTED",
          rejectionreason: rejectionReason.trim(),
        },
        idempotencyKey
      );

      if (res.success) {
        setSuccessMessage("Requisition declined and returned to regional pool.");
        setRejectionTarget(null);
        setRejectionReason("");
        await loadData(true);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to reject requisition assignment");
    } finally {
      setIsSubmittingRejection(false);
    }
  };

  // Handle Reservation Submit
  const handleCreateReservation = async () => {
    if (!bloodbank || !reservationTarget || !reservationTarget.bloodrequests) return;

    const unitsRequired = reservationTarget.bloodrequests.unitsrequired;
    if (selectedUnitIds.length === 0) {
      setReservationError("Please select at least 1 unit to allocate.");
      return;
    }
    if (selectedUnitIds.length > unitsRequired) {
      setReservationError(`Cannot allocate more than requested quantity (${unitsRequired} units).`);
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
          `Successfully reserved ${selectedUnitIds.length} unit(s). Crossmatch certification now available in Dispatch.`
        );
        setReservationTarget(null);
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
    setSelectedUnitIds((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  // Filtered Assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      // Status filter
      if (statusFilter !== "ALL" && item.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const patientName = item.bloodrequests?.patientname?.toLowerCase() || "";
        const reqId = item.requestid?.toLowerCase() || "";
        const group = item.bloodrequests?.bloodgroup?.toLowerCase() || "";
        const groupDisplay = formatBloodGroup(item.bloodrequests?.bloodgroup).toLowerCase();
        return (
          patientName.includes(q) ||
          reqId.includes(q) ||
          group.includes(q) ||
          groupDisplay.includes(q)
        );
      }
      return true;
    });
  }, [assignments, statusFilter, searchQuery]);

  // Quick Metrics
  const pendingCount = assignments.filter((a) => a.status === "PENDING").length;
  const acceptedCount = assignments.filter((a) => a.status === "ACCEPTED").length;
  const rejectedCount = assignments.filter((a) => a.status === "REJECTED").length;

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
            <p className="text-xs sm:text-sm text-slate-500">
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
                  const isPending = assignment.status === "PENDING";
                  const isAccepted = assignment.status === "ACCEPTED";
                  const isRejected = assignment.status === "REJECTED";
                  const hasReservation = (assignment.bloodreservations || []).length > 0;
                  const displayGroup = formatBloodGroup(req?.bloodgroup);

                  return (
                    <tr
                      key={assignment.assignmentid}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Requisition ID */}
                      <td className="py-3.5 px-5 font-mono text-[11px] text-slate-600">
                        #{assignment.requestid.slice(0, 8)}
                      </td>

                      {/* Hospital & Patient */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#053845]">
                          {req?.patientname || "Emergency Patient"}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Hospital Requisition</span>
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
                            <span>Pending</span>
                          </span>
                        )}
                        {isAccepted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Accepted</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <XCircle className="w-3 h-3 text-slate-500" />
                            <span>Declined</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
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
                onClick={handleAcceptAssignment}
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
                onClick={handleRejectAssignment}
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
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Select Certified Units ({selectedUnitIds.length} /{" "}
                  {reservationTarget.bloodrequests?.unitsrequired} selected)
                </label>
                <span className="text-[11px] text-slate-500">
                  Must be AVAILABLE with PASSED screening
                </span>
              </div>

              {isLoadingUnits ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-[#317786]" />
                  <span className="text-xs">Searching vault inventory...</span>
                </div>
              ) : availableUnits.length === 0 ? (
                <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-center space-y-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto" />
                  <h4 className="text-xs font-bold text-amber-900">
                    No Eligible Cleared Units Found
                  </h4>
                  <p className="text-[11px] text-amber-800 leading-relaxed max-w-md mx-auto">
                    There are currently no certified AVAILABLE units matching group{" "}
                    <strong>{formatBloodGroup(reservationTarget.bloodrequests?.bloodgroup)}</strong>. Ensure individual units have passed 5-panel TTI screening in the Screening portal.
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
                <div className="max-h-56 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2.5">
                  {availableUnits.map((unit) => {
                    const isSelected = selectedUnitIds.includes(unit.unitid);
                    return (
                      <div
                        key={unit.unitid}
                        onClick={() => toggleUnitSelection(unit.unitid)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? "border-[#317786] bg-[#FAF6EE] shadow-2xs"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded text-[#317786] focus:ring-[#317786]"
                          />
                          <div>
                            <span className="font-mono text-xs font-bold text-[#053845]">
                              {unit.unitbarcode}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              <span>Vol: {unit.volume_ml} mL</span>
                              <span>•</span>
                              <span>Expires: {formatDate(unit.expirydate)}</span>
                            </div>
                          </div>
                        </div>

                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>TTI PASSED</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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
                disabled={
                  isSubmittingReservation ||
                  selectedUnitIds.length === 0 ||
                  selectedUnitIds.length > (reservationTarget.bloodrequests?.unitsrequired || 1)
                }
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
        </div>
      )}
    </div>
  );
}
