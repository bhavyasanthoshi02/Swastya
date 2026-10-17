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
  Thermometer,
  ShieldCheck,
  Package,
} from "lucide-react";
import {
  api,
  BloodRequestItem,
  BloodReservationItem,
  ReservationItemDetail,
} from "@/lib/api";
import { getStoredHospital, AuthHospital } from "@/lib/auth";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { formatDate } from "@/lib/mappers";

export default function HospitalDeliveryReceiptPage() {
  const [hospital, setHospital] = useState<AuthHospital | null>(null);
  const [bloodRequests, setBloodRequests] = useState<BloodRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Receipt Inspection Modal State
  const [receiptTarget, setReceiptTarget] = useState<{
    request: BloodRequestItem;
    reservation: BloodReservationItem;
  } | null>(null);
  const [arrivalTempC, setArrivalTempC] = useState<string>("4.2");
  const [recipientName, setRecipientName] = useState("");
  const [receiptRemarks, setReceiptRemarks] = useState("");
  const [forceExcursionReject, setForceExcursionReject] = useState(false);
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const loadData = useCallback(async (background = false) => {
    try {
      if (background) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const [profRes, reqsRes] = await Promise.allSettled([
        api.hospital.getProfile(),
        api.hospital.getBloodRequests(),
      ]);

      if (profRes.status === "fulfilled" && profRes.value?.success) {
        setHospital(profRes.value.hospital);
      } else {
        const stored = getStoredHospital();
        if (stored) setHospital(stored);
      }

      if (reqsRes.status === "fulfilled" && Array.isArray(reqsRes.value)) {
        setBloodRequests(reqsRes.value);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load hospital incoming deliveries");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Flatten all reservations from hospital requests
  const allShipments = useMemo(() => {
    const list: Array<{
      request: BloodRequestItem;
      reservation: BloodReservationItem;
    }> = [];

    bloodRequests.forEach((req) => {
      // Reservations can be on req.bloodreservations or through assignments
      const resList: BloodReservationItem[] = (req as any).bloodreservations || [];
      resList.forEach((r) => {
        list.push({
          request: req,
          reservation: r,
        });
      });
    });

    return list;
  }, [bloodRequests]);

  // Open Receipt Modal
  const openReceiptModal = (shipment: {
    request: BloodRequestItem;
    reservation: BloodReservationItem;
  }) => {
    setReceiptTarget(shipment);
    setArrivalTempC("4.2");
    setRecipientName("");
    setReceiptRemarks("");
    setForceExcursionReject(false);
    setReceiptError(null);
  };

  // Temperature Evaluation
  const parsedTemp = parseFloat(arrivalTempC);
  const isTempValidNumber = !isNaN(parsedTemp);
  const isCompliantTemp = isTempValidNumber && parsedTemp >= 2.0 && parsedTemp <= 6.0;
  const isMinorWarming = isTempValidNumber && parsedTemp > 6.0 && parsedTemp <= 10.0;
  const isSevereExcursion = isTempValidNumber && (parsedTemp > 10.0 || parsedTemp < 1.0);

  // Submit Receipt Confirmation
  const handleConfirmReceipt = async () => {
    if (!receiptTarget) return;

    if (!recipientName.trim()) {
      setReceiptError("Receiving Clinical Officer / Technologist Name is mandatory.");
      return;
    }
    if (!isTempValidNumber) {
      setReceiptError("Please enter a valid numeric cold-box arrival temperature.");
      return;
    }

    // Determine status per item
    const shouldReject = forceExcursionReject || isSevereExcursion;
    const receivedStatus = shouldReject ? "REJECTED_EXCURSION" : "ACCEPTED";

    const items = receiptTarget.reservation.items || [];
    const itemReceipts = items.map((item) => ({
      itemId: item.reservationitemid,
      receivedStatus: receivedStatus as "ACCEPTED" | "REJECTED_EXCURSION",
      tempReading: parsedTemp,
      notes: receiptRemarks.trim() || undefined,
    }));

    try {
      setIsSubmittingReceipt(true);
      setReceiptError(null);
      const idempotencyKey = generateIdempotencyKey();

      const res = await api.hospital.confirmReceipt(
        receiptTarget.reservation.reservationid,
        { itemReceipts },
        idempotencyKey
      );

      if (res.deliveredCount > 0 && res.excursionCount === 0) {
        setSuccessMessage(
          `Delivery verified & accepted. ${res.deliveredCount} unit(s) delivered into hospital clinical care at ${parsedTemp}°C.`
        );
      } else if (res.excursionCount > 0) {
        setSuccessMessage(
          `Temperature excursion flagged (${parsedTemp}°C). ${res.excursionCount} unit(s) segregated into quarantine.`
        );
      } else {
        setSuccessMessage("Receipt processed successfully.");
      }

      setReceiptTarget(null);
      await loadData(true);
    } catch (err: any) {
      setReceiptError(err?.message || "Failed to confirm blood delivery receipt.");
    } finally {
      setIsSubmittingReceipt(false);
    }
  };

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return allShipments.filter(({ request, reservation }) => {
      if (statusFilter !== "ALL" && reservation.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const patientName = request.patientname?.toLowerCase() || "";
        const reqId = request.requestid?.toLowerCase() || "";
        const resId = reservation.reservationid?.toLowerCase() || "";
        const group = request.bloodgroup?.toLowerCase() || "";
        return patientName.includes(q) || reqId.includes(q) || resId.includes(q) || group.includes(q);
      }
      return true;
    });
  }, [allShipments, statusFilter, searchQuery]);

  // Counts
  const inTransitCount = allShipments.filter((s) => s.reservation.status === "DISPATCHED").length;
  const deliveredCount = allShipments.filter((s) => s.reservation.status === "DELIVERED").length;
  const preparedCount = allShipments.filter((s) => s.reservation.status === "PREPARED").length;

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EE] border border-[#F3E9D1] text-xs font-semibold text-[#317786]">
            <Truck className="w-3.5 h-3.5 text-[#317786]" />
            <span>Hospital Transfusion Receipt &amp; Verification Desk</span>
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#053845] leading-tight">
            Blood Delivery Receipt &amp; Temperature Inspection
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Inspect courier cold-box temperatures upon arrival at{" "}
            <strong className="text-[#053845] font-bold">
              {hospital?.hospitalname || "Hospital Facility"}
            </strong>
            . Verify blood bag integrity and confirm delivery into patient transfusion care.
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
            <span>Refresh Deliveries</span>
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
            <Truck className="w-3.5 h-3.5 text-[#317786]" />
            In Cold-Box Transit
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {inTransitCount}
          </div>
          <p className="text-[11px] text-slate-500">Dispatched, arriving shortly</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Delivered &amp; Transfused
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-emerald-900">
            {deliveredCount}
          </div>
          <p className="text-[11px] text-slate-500">Verified and accepted on-site</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Prepared at Blood Bank
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">
            {preparedCount}
          </div>
          <p className="text-[11px] text-slate-500">Crossmatched, awaiting departure</p>
        </div>

        <div className="bg-white rounded-3xl border border-[#F3E9D1] p-5 shadow-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-[#053845]" />
            Total Shipments
          </span>
          <div className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
            {allShipments.length}
          </div>
          <p className="text-[11px] text-slate-500">Facility dispatch orders on file</p>
        </div>
      </div>

      {/* Main Shipments Table Container */}
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
                <option value="ALL">All Shipments</option>
                <option value="DISPATCHED">In Transit</option>
                <option value="DELIVERED">Delivered</option>
                <option value="PREPARED">Prepared at Blood Bank</option>
              </select>
            </div>
          </div>
        </div>

        {/* Shipments List */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Loading incoming blood shipments...</p>
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <Truck className="w-7 h-7 text-[#317786]" />
            </div>
            <h3 className="text-base font-serif font-bold text-[#053845]">
              No Blood Shipments Currently Tracked
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
              When blood banks dispatch cold-box shipments against your requisitions, delivery tracking and temperature arrival inspection will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F3E9D1] bg-[#FAF6EE]/60 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-3.5 px-6">Requisition &amp; Patient</th>
                  <th className="py-3.5 px-6">Required Blood</th>
                  <th className="py-3.5 px-6">Units</th>
                  <th className="py-3.5 px-6">Courier Cold-Box</th>
                  <th className="py-3.5 px-6">Dispatched At</th>
                  <th className="py-3.5 px-6">Shipment Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9D1]/60 text-xs">
                {filteredShipments.map(({ request, reservation }) => {
                  const isDispatched = reservation.status === "DISPATCHED";
                  const isDelivered = reservation.status === "DELIVERED";
                  const isPrepared = reservation.status === "PREPARED";
                  const itemCount = (reservation.items || []).length;

                  return (
                    <tr
                      key={reservation.reservationid}
                      className="hover:bg-[#FAF6EE]/40 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="font-semibold text-[#053845]">
                          {request.patientname || "Emergency Patient"}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Req: {request.requestid.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold font-serif text-xs bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                            {request.bloodgroup}
                          </span>
                          <span className="text-[11px] font-medium text-slate-600">
                            {request.bloodcomponent}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-bold text-[#053845]">
                        {itemCount > 0 ? `${itemCount} unit(s)` : `${request.unitsrequired} unit(s)`}
                      </td>
                      <td className="py-4 px-6">
                        {reservation.couriertemperature_c != null ? (
                          <span className="inline-flex items-center gap-1 text-[#317786] font-semibold">
                            <Thermometer className="w-3.5 h-3.5" />
                            {reservation.couriertemperature_c}°C departure
                          </span>
                        ) : (
                          <span className="text-slate-400">Not recorded</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600">
                        {reservation.dispatchedat ? formatDate(reservation.dispatchedat) : "Pending departure"}
                      </td>
                      <td className="py-4 px-6">
                        {isDispatched && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                            <span>IN TRANSIT</span>
                          </span>
                        )}
                        {isDelivered && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>DELIVERED</span>
                          </span>
                        )}
                        {isPrepared && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                            <Clock className="w-3 h-3 text-teal-600" />
                            <span>PREPARED</span>
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isDispatched && (
                            <button
                              type="button"
                              onClick={() => openReceiptModal({ request, reservation })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#053845] hover:bg-[#03252e] text-white font-semibold text-xs shadow-2xs transition-all cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Verify &amp; Receive</span>
                            </button>
                          )}

                          {isDelivered && (
                            <span className="text-emerald-700 font-semibold text-xs inline-flex items-center gap-1">
                              <Check className="w-4 h-4" />
                              <span>Transfusion Ready</span>
                            </span>
                          )}

                          {isPrepared && (
                            <span className="text-slate-400 text-xs">
                              Awaiting courier departure
                            </span>
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

      {/* Hospital Delivery Receipt & Temperature Inspection Modal */}
      {receiptTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-bold text-[#053845]">
                  Hospital Blood Delivery Inspection
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Requisition: {receiptTarget.request.requestid.slice(0, 8)}... (Patient: {receiptTarget.request.patientname})
                </p>
              </div>
              <button
                onClick={() => setReceiptTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {receiptError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{receiptError}</span>
              </div>
            )}

            {/* Shipment Summary */}
            <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Blood Product:</span>
                <span className="font-bold text-[#053845]">
                  {(receiptTarget.reservation.items || []).length} unit(s) of {receiptTarget.request.bloodgroup} ({receiptTarget.request.bloodcomponent})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Departure Cold Box Temp:</span>
                <span className="font-semibold text-[#317786]">
                  {receiptTarget.reservation.couriertemperature_c != null
                    ? `${receiptTarget.reservation.couriertemperature_c}°C`
                    : "Calibrated cold-box"}
                </span>
              </div>
            </div>

            {/* Arrival Cold-Box Temperature Reading */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Arrival Cold-Box Temperature (°C) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Thermometer className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    step="0.1"
                    value={arrivalTempC}
                    onChange={(e) => setArrivalTempC(e.target.value)}
                    placeholder="e.g. 4.2"
                    className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Live Temperature Evaluation Alert */}
              {isCompliantTemp && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <strong>Compliant Transfusion Cold Chain (2°C–6°C)</strong>
                    <p className="text-[11px] opacity-90">
                      Temperature is optimal for red cells / whole blood. Safe to accept for transfusion.
                    </p>
                  </div>
                </div>
              )}

              {isMinorWarming && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <strong>Minor Warming Detected (6°C–10°C)</strong>
                    <p className="text-[11px] opacity-90">
                      Evaluate immediate transfusion timeline or return container with medical coordinator.
                    </p>
                  </div>
                </div>
              )}

              {isSevereExcursion && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <div>
                    <strong>Severe Temperature Excursion (&gt;10°C or &lt;1°C)</strong>
                    <p className="text-[11px] opacity-90">
                      In accordance with national blood standards, this shipment will be marked REJECTED_EXCURSION and segregated into quarantine.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Recipient Technologist / Nurse Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Receiving Technologist / Nurse Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. Sister Mary, ICU Transfusion Nurse"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
              />
            </div>

            {/* Clinical Receipt Remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Inspection Remarks (Optional)</label>
              <input
                type="text"
                value={receiptRemarks}
                onChange={(e) => setReceiptRemarks(e.target.value)}
                placeholder="Seals intact, bag verified, cold packs verified..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReceiptTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={isSubmittingReceipt || !recipientName.trim() || !isTempValidNumber}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 ${
                  isSevereExcursion
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-[#053845] hover:bg-[#03252e]"
                }`}
              >
                {isSubmittingReceipt ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : isSevereExcursion ? (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    <span>Reject into Quarantine</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm &amp; Accept Delivery</span>
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
