"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  SlidersHorizontal,
  Lock,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Droplets,
} from "lucide-react";
import { api, InventoryItem } from "@/lib/api";
import { generateIdempotencyKey } from "@/lib/idempotency";

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bloodBankId: string;
  lot: InventoryItem | null;
  onSuccess: (message: string) => void;
}

export function StockAdjustmentModal({
  isOpen,
  onClose,
  bloodBankId,
  lot,
  onSuccess,
}: StockAdjustmentModalProps) {
  // Adjustment state
  const [operation, setOperation] = useState<"INCREMENT" | "DECREMENT">("INCREMENT");
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>("");

  // Idempotency state: preserved across retries of same payload, regenerated on changes
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  // Submission & error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to format blood group
  const formatBloodGroup = (bg: string) => {
    return bg
      .replace("_POSITIVE", "+")
      .replace("_NEGATIVE", "-")
      .replace("POSITIVE", "+")
      .replace("NEGATIVE", "-");
  };

  // Reset or initialize state whenever modal opens or lot changes
  useEffect(() => {
    if (isOpen && lot) {
      setOperation("INCREMENT");
      setQuantity(1);
      setReason("");
      setError(null);
      setIdempotencyKey(generateIdempotencyKey());
    }
  }, [isOpen, lot]);

  // Handle changes and refresh idempotency key so different payloads never share keys
  const handleParamChange = (updater: () => void) => {
    updater();
    setIdempotencyKey(generateIdempotencyKey());
  };

  const availableUnits = lot?.unitsavailable ?? 0;
  const reservedUnits = lot?.unitsreserved ?? 0;

  // Real-time calculation of new available units
  const newAvailableUnits = useMemo(() => {
    const q = Number(quantity) || 0;
    if (operation === "INCREMENT") {
      return availableUnits + q;
    } else {
      return availableUnits - q;
    }
  }, [availableUnits, operation, quantity]);

  // Validation logic
  const isOverDecrement = operation === "DECREMENT" && quantity > availableUnits;

  if (!isOpen || !lot) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Strict validation
    if (!quantity || !Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      setError("Adjustment quantity must be a positive integer greater than zero");
      return;
    }

    if (isOverDecrement) {
      setError(
        `Cannot decrement ${quantity} units: exceeds current available stock of ${availableUnits} units`
      );
      return;
    }

    if (!reason || reason.trim().length < 5) {
      setError("A non-empty clinical / audit reason (minimum 5 characters) is mandatory");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.bloodbank.adjustInventory(
        bloodBankId,
        lot.inventoryid,
        {
          operation,
          quantity: Number(quantity),
          reason: reason.trim(),
        },
        idempotencyKey
      );

      if (res.success) {
        const sign = operation === "INCREMENT" ? "+" : "-";
        const successMsg = `Stock adjustment recorded: ${sign}${quantity} units (${res.inventory.unitsavailable} available now).`;
        onSuccess(successMsg);
        onClose();
      } else {
        setError(res.message || "Failed to adjust inventory stock");
      }
    } catch (err: unknown) {
      // Retain the same idempotency key for safe replay on network retry
      setError(
        (err as Error)?.message ||
          "Network or server error encountered during adjustment. You may safely retry."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-[#FAF6EE]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#053845] text-white flex items-center justify-center shadow-xs">
              <SlidersHorizontal className="w-5 h-5 text-[#F3E9D1]" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#053845]">
                Adjust Available Stock
              </h2>
              <p className="text-xs text-slate-500">
                Audited inventory corrections under immutable governance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Target Lot Summary Card */}
          <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Target Inventory Batch
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                ID: {lot.inventoryid}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-[10px] text-slate-400 block">Blood Group</span>
                <span className="inline-flex items-center gap-1 font-bold text-xs text-[#053845] mt-0.5">
                  <Droplets className="w-3.5 h-3.5 text-[#B94F30]" />
                  <span>{formatBloodGroup(lot.bloodgroup)}</span>
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block">Component</span>
                <span className="font-semibold text-xs text-slate-800 capitalize mt-0.5 block">
                  {lot.bloodcomponent ? lot.bloodcomponent.replace(/_/g, " ").toLowerCase() : "Whole Blood"}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block">Available Ready</span>
                <span className="font-mono text-sm font-bold text-[#053845] mt-0.5 block">
                  {availableUnits} units
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block flex items-center gap-1">
                  <span>Reserved</span>
                  <Lock className="w-2.5 h-2.5 text-amber-600" />
                </span>
                <span className="font-mono text-sm font-bold text-amber-700 mt-0.5 block">
                  {reservedUnits} units
                </span>
              </div>
            </div>
          </div>

          {/* Reserved Stock Invariance Explainer */}
          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/60 text-[11px] text-amber-800 flex items-start gap-2.5">
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Reserved units cannot be modified:</strong> Reserved stock is committed to active
              emergency requisitions and is strictly invariant during manual inventory adjustments.
            </div>
          </div>

          {/* Operation Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Adjustment Operation <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleParamChange(() => setOperation("INCREMENT"))}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                  operation === "INCREMENT"
                    ? "bg-[#053845] text-white border-[#053845] shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Correction (+) Increment</span>
              </button>

              <button
                type="button"
                onClick={() => handleParamChange(() => setOperation("DECREMENT"))}
                disabled={isSubmitting}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                  operation === "DECREMENT"
                    ? "bg-[#A2363A] text-white border-[#A2363A] shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Minus className="w-4 h-4" />
                <span>Correction (-) Decrement</span>
              </button>
            </div>
          </div>

          {/* Quantity Input with live arithmetic preview */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Adjustment Quantity (Units) <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-1.5">
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) =>
                  handleParamChange(() => setQuantity(parseInt(e.target.value) || 0))
                }
                disabled={isSubmitting}
                className={`w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border bg-white text-slate-800 focus:outline-none focus:ring-2 ${
                  isOverDecrement
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
                    : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20"
                }`}
              />

              {/* Quick selectors */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Quick adjust:</span>
                {[1, 2, 5, 10].map((num) => (
                  <button
                    type="button"
                    key={num}
                    onClick={() => handleParamChange(() => setQuantity(num))}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Arithmetic Preview Box */}
            <div
              className={`mt-2 p-3 rounded-xl border text-xs flex items-center justify-between ${
                isOverDecrement
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              <span>Balance Transition:</span>
              <span className="font-mono font-bold">
                {availableUnits} {operation === "INCREMENT" ? "+" : "-"} {quantity || 0} ={" "}
                <span className={newAvailableUnits < 0 ? "text-rose-600 underline" : "text-[#053845]"}>
                  {newAvailableUnits} units
                </span>
              </span>
            </div>

            {isOverDecrement && (
              <p className="text-[11px] text-rose-600 font-medium mt-1">
                Over-decrement prevented: Cannot reduce stock below 0. Maximum decrement possible is{" "}
                {availableUnits} unit(s).
              </p>
            )}
          </div>

          {/* Mandatory Reason Textarea */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Audited Rationale / Regulatory Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => handleParamChange(() => setReason(e.target.value))}
              placeholder="e.g. Regular physical audit discrepancy reconciliation, laboratory recount correction, intake verification adjustment"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20 placeholder:text-slate-400"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Recorded in the permanent, immutable inventory ledger with actor user attribution.
            </p>
          </div>

          {/* Idempotency Audit Badge */}
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Idempotent adjustment transaction enabled</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              Key: {idempotencyKey.slice(0, 12)}...
            </span>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOverDecrement}
              className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
                operation === "DECREMENT"
                  ? "bg-[#A2363A] hover:bg-[#852B2F]"
                  : "bg-[#053845] hover:bg-[#317786]"
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Committing Adjustment...</span>
                </>
              ) : (
                <>
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#F3E9D1]" />
                  <span>
                    Commit {operation === "INCREMENT" ? "+ Increment" : "- Decrement"} Adjustment
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
