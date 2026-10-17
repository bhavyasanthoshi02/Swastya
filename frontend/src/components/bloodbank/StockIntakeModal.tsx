"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  GitMerge,
} from "lucide-react";
import { api, InventoryItem } from "@/lib/api";
import { generateIdempotencyKey } from "@/lib/idempotency";

interface StockIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bloodBankId: string;
  existingInventory: InventoryItem[];
  onSuccess: (message: string, isMerged: boolean) => void;
}

const BLOOD_GROUPS = [
  { value: "A+", label: "A+ (A Positive)" },
  { value: "A-", label: "A- (A Negative)" },
  { value: "B+", label: "B+ (B Positive)" },
  { value: "B-", label: "B- (B Negative)" },
  { value: "AB+", label: "AB+ (AB Positive)" },
  { value: "AB-", label: "AB- (AB Negative)" },
  { value: "O+", label: "O+ (O Positive)" },
  { value: "O-", label: "O- (O Negative)" },
];

const BLOOD_COMPONENTS = [
  { value: "WHOLE_BLOOD", label: "Whole Blood", shelfLife: "35–42 days" },
  { value: "RBC", label: "Packed Red Blood Cells (PRBC)", shelfLife: "42 days" },
  { value: "PLATELETS", label: "Platelet Concentrate (RDP / SDP)", shelfLife: "5 days" },
  { value: "PLASMA", label: "Fresh Frozen Plasma (FFP)", shelfLife: "1 year" },
];

export function StockIntakeModal({
  isOpen,
  onClose,
  bloodBankId,
  existingInventory,
  onSuccess,
}: StockIntakeModalProps) {
  // Tomorrow's date formatted as YYYY-MM-DD for min expiry date
  const minExpiryDate = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }, []);

  // Form state
  const [bloodGroup, setBloodGroup] = useState<string>("O+");
  const [bloodComponent, setBloodComponent] = useState<string>("WHOLE_BLOOD");
  const [quantity, setQuantity] = useState<number>(5);
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [reason, setReason] = useState<string>("Voluntary blood donation camp intake");

  // Idempotency state: key is preserved on retry of same payload, regenerated on changes
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  // Submission & error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset idempotency key when modal opens or payload fields change
  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(generateIdempotencyKey());
      setError(null);
      // Default expiry date to 30 days from now
      const defaultExp = new Date();
      defaultExp.setDate(defaultExp.getDate() + 30);
      setExpiryDate(defaultExp.toISOString().split("T")[0]);
    }
  }, [isOpen]);

  // Regenerate idempotency key whenever user alters logical payload
  const handlePayloadChange = (updater: () => void) => {
    updater();
    setIdempotencyKey(generateIdempotencyKey());
  };

  // Helper to normalize blood group for comparison
  const normalizeGroup = (bg: string) => {
    return bg
      .replace("_POSITIVE", "+")
      .replace("_NEGATIVE", "-")
      .replace("POSITIVE", "+")
      .replace("NEGATIVE", "-");
  };

  // Check if a matching lot already exists in this facility's inventory
  const matchingLot = useMemo(() => {
    if (!bloodGroup || !bloodComponent || !expiryDate) return null;
    return (
      existingInventory.find((item) => {
        const itemGroup = normalizeGroup(item.bloodgroup);
        const inputGroup = normalizeGroup(bloodGroup);
        const itemExp = item.expirydate ? item.expirydate.split("T")[0] : "";
        return (
          itemGroup === inputGroup &&
          item.bloodcomponent === bloodComponent &&
          itemExp === expiryDate
        );
      }) || null
    );
  }, [existingInventory, bloodGroup, bloodComponent, expiryDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!bloodGroup) {
      setError("Please select a blood group");
      return;
    }
    if (!bloodComponent) {
      setError("Please select a blood component");
      return;
    }
    if (!quantity || !Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      setError("Quantity must be a positive integer greater than zero");
      return;
    }
    if (!expiryDate) {
      setError("Please select a valid expiry date");
      return;
    }
    if (expiryDate < minExpiryDate) {
      setError("Expiry date must be strictly in the future (after today)");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api.bloodbank.addInventory(
        bloodBankId,
        {
          bloodgroup: bloodGroup,
          bloodcomponent: bloodComponent,
          quantity: Number(quantity),
          expirydate: expiryDate,
          reason: reason.trim() || "Standard inventory intake",
        },
        idempotencyKey
      );

      if (res.success) {
        const successMsg = res.merged
          ? `Successfully merged ${quantity} units into existing batch. Available stock is now ${res.inventory.unitsavailable} units.`
          : `Successfully registered new batch of ${quantity} units (${bloodGroup} ${bloodComponent.replace(/_/g, " ")}).`;
        onSuccess(successMsg, res.merged);
        onClose();
      } else {
        setError(res.message || "Failed to register inventory lot");
      }
    } catch (err: unknown) {
      // Keep same idempotencyKey so caller can safely retry
      setError(
        (err as Error)?.message ||
          "Network or server error encountered during inventory registration. You may safely retry."
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
              <PackagePlus className="w-5 h-5 text-[#F3E9D1]" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#053845]">
                Blood Stock Intake & Registration
              </h2>
              <p className="text-xs text-slate-500">
                Register verified units into the licensed facility vault
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

          {/* Dynamic Matching Lot / Merge Warning */}
          {matchingLot && (
            <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
              <GitMerge className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>Matching Vault Batch Found</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-200/70 text-amber-900 font-mono">
                    {matchingLot.inventoryid.slice(0, 8)}...
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  A batch with identical group, component, and expiry date currently has{" "}
                  <strong>{matchingLot.unitsavailable} available units</strong>. Submitting this intake
                  will automatically merge these units into the existing lot, incrementing available
                  stock to <strong>{matchingLot.unitsavailable + (Number(quantity) || 0)} units</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Blood Group and Component */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Blood Group <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={bloodGroup}
                  onChange={(e) => handlePayloadChange(() => setBloodGroup(e.target.value))}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                >
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg.value} value={bg.value}>
                      {bg.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Blood Component <span className="text-rose-500">*</span>
              </label>
              <select
                value={bloodComponent}
                onChange={(e) => handlePayloadChange(() => setBloodComponent(e.target.value))}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
              >
                {BLOOD_COMPONENTS.map((comp) => (
                  <option key={comp.value} value={comp.value}>
                    {comp.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity and Expiry Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Units to Intake (Bags) <span className="text-rose-500">*</span>
              </label>
              <div className="space-y-1.5">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) =>
                    handlePayloadChange(() => setQuantity(parseInt(e.target.value) || 0))
                  }
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Quick add:</span>
                  {[1, 5, 10, 20].map((num) => (
                    <button
                      type="button"
                      key={num}
                      onClick={() => handlePayloadChange(() => setQuantity(num))}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                    >
                      +{num}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Expiry Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  min={minExpiryDate}
                  value={expiryDate}
                  onChange={(e) => handlePayloadChange(() => setExpiryDate(e.target.value))}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Must be strictly after today</p>
            </div>
          </div>

          {/* Reason / Reference */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Intake Reference / Clinical Source Notes
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => handlePayloadChange(() => setReason(e.target.value))}
              placeholder="e.g. Voluntary blood donation camp, hospital excess transfer, routine procurement"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#317786] focus:ring-2 focus:ring-[#317786]/20"
            />
          </div>

          {/* Idempotency Audit Badge */}
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Idempotent audit transaction enabled</span>
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
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl bg-[#053845] hover:bg-[#317786] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering Stock...</span>
                </>
              ) : matchingLot ? (
                <>
                  <GitMerge className="w-3.5 h-3.5 text-[#F3E9D1]" />
                  <span>Confirm & Merge Units</span>
                </>
              ) : (
                <>
                  <PackagePlus className="w-3.5 h-3.5 text-[#F3E9D1]" />
                  <span>Register Inventory Batch</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
