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
  ShieldAlert,
  Loader2,
  Check,
  X,
  Plus,
  Send,
  AlertCircle,
  PackageCheck,
} from "lucide-react";
import {
  api,
  RequisitionAssignmentItem,
  InventoryUnitItem,
  BloodReservationItem,
} from "@/lib/api";
import { getStoredBloodBank, AuthBloodBank } from "@/lib/auth";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { formatDate, formatTimeAgo } from "@/lib/mappers";

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
          `Successfully reserved ${selectedUnitIds.length} unit(s). Crossmatch certification now available in Dispatch & Crossmatch.`
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
        return patientName.includes(q) || reqId.includes(q) || group.includes(q);
      }
      return true;
    });
  }, [assignments, statusFilter, searchQuery]);

  // Quick Metrics
  const pendingCount = assignments.filter((a) => a.status === "PENDING").length;
  const acceptedCount = assignments.filter((a) => a.status === "ACCEPTED").length;
  const rejectedCount = assignments.filter((a) => a.status === "REJECTED").length;

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EE] border border-[#F3E9D1] text-xs font-semibold text-[#317786]">
            <ClipboardList className="w-3.5 h-3.5 text-[#317786]" />
            <span>Regional Transfusion Coordination Desk</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#053845] leading-tight">
            Hospital Requisition Queue
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Review incoming hospital blood orders assigned to{" "}
            <strong className="text-[#053845] font-bold">
              {bloodbank?.bloodbankname || "Blood Center"}
            </strong>
            . Accept assignments to lock inventory, perform crossmatching, and coordinate cold-box dispatch.
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
            <span>Refresh Queue</span>
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

      {/* 4 Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pending Review
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {pendingCount}
          </div>
          <p className="text-[11px] text-slate-500">Awaiting blood bank action</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Accepted / Reserved
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {acceptedCount}
          </div>
          <p className="text-[11px] text-slate-500">In fulfillment pipeline</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Declined / Returned
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-rose-900">
            {rejectedCount}
          </div>
          <p className="text-[11px] text-slate-500">Reassigned to network</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-[#053845]" />
            Total Assignments
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {assignments.length}
          </div>
          <p className="text-[11px] text-slate-500">Lifetime hospital requisitions</p>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Filter & Search Bar */}
        <div className="p-5 sm:p-6 border-b border-[#F3E9D1] bg-white space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Patient name, Requisition ID, or blood group..."
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
                <option value="ALL">All Requisitions</option>
                <option value="PENDING">Pending Review</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="REJECTED">Declined</option>
              </select>
            </div>
          </div>
        </div>

        {/* Requisition Table */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading hospital requisitions...</p>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <ClipboardList className="w-7 h-7 text-[#317786]" />
            </div>
            <h3 className="text-base font-serif font-bold text-[#053845]">
              No Hospital Requisitions Found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
              When regional hospitals assign emergency or standard blood requisitions to this facility, they will appear in this clinical queue.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F3E9D1] bg-[#FAF6EE]/60 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-3.5 px-6">Requisition ID</th>
                  <th className="py-3.5 px-6">Patient & Hospital</th>
                  <th className="py-3.5 px-6">Required Blood</th>
                  <th className="py-3.5 px-6">Units</th>
                  <th className="py-3.5 px-6">Urgency</th>
                  <th className="py-3.5 px-6">Required By</th>
                  <th className="py-3.5 px-6">Assignment Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9D1]/60 text-xs">
                {filteredAssignments.map((assignment) => {
                  const req = assignment.bloodrequests;
                  const isPending = assignment.status === "PENDING";
                  const isAccepted = assignment.status === "ACCEPTED";
                  const isRejected = assignment.status === "REJECTED";
                  const hasReservation = (assignment.bloodreservations || []).length > 0;

                  return (
                    <tr
                      key={assignment.assignmentid}
                      className="hover:bg-[#FAF6EE]/40 transition-colors"
                    >
                      <td className="py-4 px-6 font-mono text-[11px] text-slate-600">
                        {assignment.requestid.slice(0, 8)}...
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-semibold text-[#053845]">
                          {req?.patientname || "Emergency Patient"}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>Hospital Requisition</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold font-serif text-xs bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                            {req?.bloodgroup || "O+"}
                          </span>
                          <span className="text-[11px] font-medium text-slate-600">
                            {req?.bloodcomponent || "WHOLE_BLOOD"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-bold text-[#053845]">
                        {req?.unitsrequired || 1} unit(s)
                      </td>
                      <td className="py-4 px-6">
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
                      <td className="py-4 px-6 text-slate-600">
                        {req?.requiredby ? formatDate(req.requiredby) : "Immediate"}
                      </td>
                      <td className="py-4 px-6">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Review</span>
                          </span>
                        )}
                        {isAccepted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Accepted</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            <XCircle className="w-3 h-3 text-slate-500" />
                            <span>Declined</span>
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => setAcceptanceTarget(assignment)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#053845] hover:bg-[#03252e] text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer"
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
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs border border-rose-200 transition-all cursor-pointer"
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] font-bold text-xs shadow-2xs transition-all cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Reserve Units</span>
                            </button>
                          )}

                          {isAccepted && hasReservation && (
                            <Link
                              href="/bloodbank/dispatch"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FAF6EE] hover:bg-[#FAF6EE]/80 text-[#317786] font-semibold text-xs border border-[#F3E9D1] transition-all"
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
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#053845]">
                  Accept Hospital Blood Requisition
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Requisition ID: {acceptanceTarget.requestid}
                </p>
              </div>
              <button
                onClick={() => setAcceptanceTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-2 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient:</span>
                <span className="font-semibold text-[#053845]">
                  {acceptanceTarget.bloodrequests?.patientname}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Required:</span>
                <span className="font-bold text-[#053845]">
                  {acceptanceTarget.bloodrequests?.unitsrequired} Unit(s) of{" "}
                  {acceptanceTarget.bloodrequests?.bloodgroup} (
                  {acceptanceTarget.bloodrequests?.bloodcomponent})
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

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAcceptanceTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAcceptAssignment}
                disabled={isSubmittingAcceptance}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#053845] hover:bg-[#03252e] text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
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
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-rose-900">
                  Decline Hospital Blood Requisition
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Requisition ID: {rejectionTarget.requestid}
                </p>
              </div>
              <button
                onClick={() => setRejectionTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                Reason for Declining <span className="text-rose-600">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Specify clinical or operational reason (e.g. Insufficient cleared inventory in vault, cold-chain maintenance)..."
                rows={3}
                className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-slate-800 placeholder:text-slate-400"
              />
              <p className="text-[11px] text-slate-500">
                This reason will be recorded in the immutable audit log and notified to the requesting hospital coordinator.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectionTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectAssignment}
                disabled={isSubmittingRejection || rejectionReason.trim().length < 5}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
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
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#053845]">
                  Reserve Blood Units for Transfusion
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Allocate tested AVAILABLE units to Requisition {reservationTarget.requestid.slice(0, 8)}
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
            <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Patient</span>
                <p className="font-bold text-[#053845]">
                  {reservationTarget.bloodrequests?.patientname}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Group</span>
                <p className="font-bold text-[#053845]">
                  {reservationTarget.bloodrequests?.bloodgroup}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Component</span>
                <p className="font-bold text-[#053845]">
                  {reservationTarget.bloodrequests?.bloodcomponent}
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Select Certified Units from Vault ({selectedUnitIds.length} /{" "}
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
                <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
                  <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto" />
                  <h4 className="text-xs font-bold text-amber-900">
                    No Eligible Cleared Units Found
                  </h4>
                  <p className="text-[11px] text-amber-800 leading-relaxed max-w-md mx-auto">
                    There are currently no certified AVAILABLE units matching group{" "}
                    <strong>{reservationTarget.bloodrequests?.bloodgroup}</strong>. Ensure individual units have passed 5-panel TTI screening in the Screening portal.
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
                <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-2xl p-3">
                  {availableUnits.map((unit) => {
                    const isSelected = selectedUnitIds.includes(unit.unitid);
                    return (
                      <div
                        key={unit.unitid}
                        onClick={() => toggleUnitSelection(unit.unitid)}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? "border-[#317786] bg-[#FAF6EE] shadow-2xs"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Controlled by row click
                            className="rounded text-[#317786] focus:ring-[#317786]"
                          />
                          <div>
                            <span className="font-mono text-xs font-bold text-[#053845]">
                              {unit.unitbarcode}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
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
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Allocation Notes (Optional)</label>
              <input
                type="text"
                value={reservationNotes}
                onChange={(e) => setReservationNotes(e.target.value)}
                placeholder="Cold-chain container #, courier instructions, etc..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800 placeholder:text-slate-400"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReservationTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#EFA27E] hover:bg-[#EFA27E]/90 text-[#053845] text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
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
