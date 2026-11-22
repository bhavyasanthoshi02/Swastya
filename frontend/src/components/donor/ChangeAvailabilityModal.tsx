"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Power, AlertCircle, Loader2 } from "lucide-react";

interface ChangeAvailabilityModalProps {
  isOpen: boolean;
  currentStatus: "Available" | "Paused";
  onClose: () => void;
  onStatusChange: (newStatus: "Available" | "Paused") => Promise<void> | void;
}

export function ChangeAvailabilityModal({
  isOpen,
  currentStatus,
  onClose,
  onStatusChange,
}: ChangeAvailabilityModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<"Available" | "Paused">(currentStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedStatus(currentStatus);
  }, [currentStatus, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      setIsSubmitting(true);
      await onStatusChange(selectedStatus);
      onClose();
    } catch {
      // Error handling is managed by parent or toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#053845]/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]">
          <div>
            <h2 id="availability-modal-title" className="font-serif text-lg font-bold text-[#053845]">
              Change Donor Availability
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Control whether you receive urgent blood requests in your area
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Available Option */}
          <button
            type="button"
            onClick={() => setSelectedStatus("Available")}
            className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
              selectedStatus === "Available"
                ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20"
                : "bg-white border-[#F3E9D1] hover:bg-[#FAF6EE]/50"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                selectedStatus === "Available"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {selectedStatus === "Available" && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[#053845]">Available to Donate</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                You are ready to receive verified blood match requisitions matching your blood group in your area.
              </p>
            </div>
          </button>

          {/* Paused Option */}
          <button
            type="button"
            onClick={() => setSelectedStatus("Paused")}
            className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
              selectedStatus === "Paused"
                ? "bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20"
                : "bg-white border-[#F3E9D1] hover:bg-[#FAF6EE]/50"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                selectedStatus === "Paused"
                  ? "border-amber-600 bg-amber-600 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {selectedStatus === "Paused" && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[#053845]">Paused / On Standby</span>
                <span className="w-2 h-2 rounded-full bg-slate-400" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Temporarily pause match notifications if you are traveling, unwell, or unavailable. You can reactivate anytime.
              </p>
            </div>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#317786] hover:bg-[#245964] text-white transition-all shadow-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Updating...</span>
              </>
            ) : (
              <span>Save Status</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
