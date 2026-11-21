"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  ArrowLeft,
  Loader2,
  Check,
  X,
  AlertCircle,
  Thermometer,
  ShieldAlert,
  Package,
  Calendar,
} from "lucide-react";
import {
  api,
  BloodRequestItem,
  BloodReservationItem,
} from "@/lib/api";
import { getStoredHospital, AuthHospital } from "@/lib/auth";
import { generateIdempotencyKey } from "@/lib/idempotency";
import {
  mapBloodGroupToDisplay,
  mapBloodComponentToDisplay,
  formatDate,
} from "@/lib/mappers";

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
          `Delivery verified & accepted. ${res.deliveredCount} unit(s) accepted into hospital care at ${parsedTemp}°C.`
        );
      } else if (res.excursionCount > 0) {
        setSuccessMessage(
          `Temperature excursion flagged (${parsedTemp}°C). ${res.excursionCount} unit(s) quarantined.`
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

  // Dynamic counts
  const inTransitCount = allShipments.filter((s) => s.reservation.status === "DISPATCHED").length;
  const deliveredCount = allShipments.filter((s) => s.reservation.status === "DELIVERED").length;
  const preparedCount = allShipments.filter((s) => s.reservation.status === "PREPARED").length;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-12">
      {/* Top Breadcrumb Navigation & Refresh */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>

        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#317786] ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh Deliveries</span>
        </button>
      </div>

      {/* 1. Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#317786]/15">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              Blood Delivery Receipt &amp; Temperature Inspection
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              Inspect courier cold-box temperatures, verify blood bag integrity, and confirm incoming shipments.
            </p>
          </div>
        </div>
      </header>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer font-bold text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {/* 2. Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-[#317786]" />
            <span>In Cold-Box Transit</span>
          </span>
          <div className="font-serif text-2xl font-bold text-[#053845]">
            {inTransitCount}
          </div>
          <p className="text-[11px] text-slate-400">Dispatched, arriving shortly</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Delivered &amp; Transfused</span>
          </span>
          <div className="font-serif text-2xl font-bold text-emerald-800">
            {deliveredCount}
          </div>
          <p className="text-[11px] text-slate-400">Verified and accepted on-site</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Prepared at Blood Bank</span>
          </span>
          <div className="font-serif text-2xl font-bold text-amber-800">
            {preparedCount}
          </div>
          <p className="text-[11px] text-slate-400">Crossmatched, awaiting departure</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-[#053845]" />
            <span>Total Shipments</span>
          </span>
          <div className="font-serif text-2xl font-bold text-[#053845]">
            {allShipments.length}
          </div>
          <p className="text-[11px] text-slate-400">Facility dispatch orders</p>
        </div>
      </div>

      {/* 3. Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#317786] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, blood group, ID..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[#F3E9D1] bg-white shadow-2xs focus:outline-none focus:border-[#317786] text-[#053845] placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-[#053845] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
            }`}
          >
            All Shipments ({allShipments.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DISPATCHED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "DISPATCHED"
                ? "bg-[#317786] text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
            }`}
          >
            In Transit ({inTransitCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DELIVERED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "DELIVERED"
                ? "bg-emerald-700 text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-emerald-700 border border-[#F3E9D1]"
            }`}
          >
            Delivered ({deliveredCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PREPARED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === "PREPARED"
                ? "bg-amber-700 text-white shadow-2xs"
                : "bg-white text-slate-600 hover:text-amber-700 border border-[#F3E9D1]"
            }`}
          >
            Prepared ({preparedCount})
          </button>
        </div>
      </div>

      {/* 4. Shipments Content: Full-width Cards or Compact Empty State */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center space-y-3 shadow-2xs">
          <Loader2 className="w-6 h-6 text-[#317786] animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading incoming blood shipments...</p>
        </div>
      ) : filteredShipments.length === 0 ? (
        /* 5. Compact Empty State */
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-8 sm:p-10 text-center space-y-2 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#317786]/10 border border-[#317786]/20 text-[#317786] flex items-center justify-center mx-auto mb-1">
            <Truck className="w-5 h-5" />
          </div>
          <h3 className="font-serif text-base font-bold text-[#053845]">
            No Blood Shipments Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Blood bank shipments will appear here once dispatched.
          </p>
        </div>
      ) : (
        /* Full-Width Shipment Cards */
        <div className="space-y-3">
          {filteredShipments.map(({ request, reservation }) => {
            const isDispatched = reservation.status === "DISPATCHED";
            const isDelivered = reservation.status === "DELIVERED";
            const isPrepared = reservation.status === "PREPARED";
            const itemCount = (reservation.items || []).length;
            const bloodGroupDisplay = mapBloodGroupToDisplay(request.bloodgroup);
            const componentDisplay = mapBloodComponentToDisplay(request.bloodcomponent);

            return (
              <article
                key={reservation.reservationid}
                className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs hover:border-[#317786]/45 transition-colors space-y-3"
              >
                {/* Top Row: Patient Name, IDs, Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-[#F3E9D1]/70">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <h2 className="font-serif text-base font-bold text-[#053845] truncate">
                      {request.patientname || "Emergency Patient"}
                    </h2>
                    <span className="text-xs font-mono font-medium text-slate-400 shrink-0">
                      REQ #{request.requestid.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-xs font-mono font-medium text-slate-400 shrink-0">
                      · SHP #{reservation.reservationid.slice(0, 8).toUpperCase()}
                    </span>
                  </div>

                  <div>
                    {isDispatched && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                        <span>IN TRANSIT</span>
                      </span>
                    )}
                    {isDelivered && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>DELIVERED</span>
                      </span>
                    )}
                    {isPrepared && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>PREPARED</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Content & Action Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {/* Blood Group & Component */}
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#317786]/10 border border-[#317786]/20 shrink-0">
                      <span className="font-serif font-bold text-sm text-[#053845]">
                        {bloodGroupDisplay}
                      </span>
                      <span className="text-[11px] font-medium text-[#317786]">
                        {componentDisplay}
                      </span>
                    </div>

                    {/* Units */}
                    <span className="font-semibold text-slate-700">
                      {itemCount > 0 ? `${itemCount} unit(s)` : `${request.unitsrequired} unit(s)`}
                    </span>

                    {/* Temperature */}
                    <div className="flex items-center gap-1 text-slate-600">
                      <Thermometer className="w-3.5 h-3.5 text-[#317786]" />
                      <span>
                        {reservation.couriertemperature_c != null
                          ? `${reservation.couriertemperature_c}°C departure`
                          : "Calibrated cold-box"}
                      </span>
                    </div>

                    {/* Dispatched Date */}
                    {reservation.dispatchedat && (
                      <div className="flex items-center gap-1 text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Dispatched {formatDate(reservation.dispatchedat)}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {isDispatched && (
                      <button
                        type="button"
                        onClick={() => openReceiptModal({ request, reservation })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#053845] hover:bg-[#317786] text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verify &amp; Receive</span>
                      </button>
                    )}

                    {isDelivered && (
                      <span className="text-emerald-700 font-semibold text-xs inline-flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <Check className="w-3.5 h-3.5" />
                        <span>Transfusion Ready</span>
                      </span>
                    )}

                    {isPrepared && (
                      <span className="text-slate-400 text-xs italic">
                        Awaiting courier departure
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Hospital Delivery Receipt & Temperature Inspection Modal */}
      {receiptTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#053845]">
                  Blood Delivery Inspection
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Requisition #{receiptTarget.request.requestid.slice(0, 8)} · Patient: {receiptTarget.request.patientname}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {receiptError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{receiptError}</span>
              </div>
            )}

            {/* Shipment Summary */}
            <div className="p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Blood Product:</span>
                <span className="font-semibold text-[#053845]">
                  {(receiptTarget.reservation.items || []).length || receiptTarget.request.unitsrequired} unit(s) of {mapBloodGroupToDisplay(receiptTarget.request.bloodgroup)} ({mapBloodComponentToDisplay(receiptTarget.request.bloodcomponent)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Departure Cold Box:</span>
                <span className="font-semibold text-[#317786]">
                  {receiptTarget.reservation.couriertemperature_c != null
                    ? `${receiptTarget.reservation.couriertemperature_c}°C`
                    : "Calibrated cold-box"}
                </span>
              </div>
            </div>

            {/* Arrival Temperature Reading */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Arrival Cold-Box Temperature (°C) <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Thermometer className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.1"
                  value={arrivalTempC}
                  onChange={(e) => setArrivalTempC(e.target.value)}
                  placeholder="e.g. 4.2"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] font-mono font-bold text-slate-800"
                />
              </div>

              {/* Temperature Evaluation Banner */}
              {isCompliantTemp && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Compliant Cold Chain (2°C–6°C). Safe to accept for transfusion.</span>
                </div>
              )}

              {isMinorWarming && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Minor Warming (6°C–10°C). Verify with clinical coordinator.</span>
                </div>
              )}

              {isSevereExcursion && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Severe Excursion (&gt;10°C or &lt;1°C). Shipment will be quarantined.</span>
                </div>
              )}
            </div>

            {/* Recipient Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Receiving Staff / Nurse Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. Nurse in charge, ICU"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
              />
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Inspection Remarks (Optional)
              </label>
              <input
                type="text"
                value={receiptRemarks}
                onChange={(e) => setReceiptRemarks(e.target.value)}
                placeholder="Seals intact, cold packs verified..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-[#317786] text-slate-800"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReceiptTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReceipt}
                disabled={isSubmittingReceipt || !recipientName.trim() || !isTempValidNumber}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                  isSevereExcursion
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-[#053845] hover:bg-[#317786]"
                }`}
              >
                {isSubmittingReceipt ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : isSevereExcursion ? (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Reject to Quarantine</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Accept</span>
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
