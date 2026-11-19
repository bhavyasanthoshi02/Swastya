"use client";

import React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Heart,
  Loader2,
  MapPin,
  Navigation,
  XCircle,
} from "lucide-react";
import { RequestPreviewItem } from "./DonorTypes";

interface DonorCommitmentActionsProps {
  item: RequestPreviewItem;
  hasResponded: boolean;
  isUpdating?: boolean;
  onUpdateTransit?: (
    requestId: string,
    status: "STARTED" | "REACHED_LOCATION",
    deliveryId?: string
  ) => void | Promise<void>;
  donateHref?: string;
}

export function DonorCommitmentActions({
  item,
  hasResponded,
  isUpdating = false,
  onUpdateTransit,
  donateHref,
}: DonorCommitmentActionsProps) {
  const rawRequestId = item.rawId || item.id.replace(/^REQ-/, "");
  const commitment = item.myCommitment;

  if (!commitment && !hasResponded) {
    return (
      <Link
        href={donateHref || `/donor/requests/${rawRequestId}/donate`}
        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#317786] hover:bg-[#245964] text-white transition-colors"
      >
        <Heart className="w-3.5 h-3.5 fill-current" />
        <span>I Can Donate</span>
      </Link>
    );
  }

  const acceptance = (commitment?.acceptanceStatus || "PENDING").toUpperCase();
  const transit = (commitment?.transitStatus || "DONOR_FOUND").toUpperCase();

  if (acceptance === "REJECTED") {
    return (
      <span className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-[#A2363A] border border-rose-200">
        <XCircle className="w-3.5 h-3.5" />
        <span>Offer Not Selected</span>
      </span>
    );
  }

  if (acceptance !== "ACCEPTED") {
    return (
      <span className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
        <Clock className="w-3.5 h-3.5" />
        <span>Awaiting Requester Decision</span>
      </span>
    );
  }

  if (transit === "COMPLETED") {
    return (
      <span className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Blood Received – Confirmed</span>
      </span>
    );
  }

  if (transit === "REACHED_LOCATION") {
    return (
      <span className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-50 text-[#317786] border border-[#317786]/30">
        <MapPin className="w-3.5 h-3.5" />
        <span>Awaiting Blood Receipt Confirmation</span>
      </span>
    );
  }

  if (transit === "STARTED") {
    return onUpdateTransit ? (
      <button
        type="button"
        disabled={isUpdating}
        onClick={() => onUpdateTransit(rawRequestId, "REACHED_LOCATION", commitment?.deliveryId)}
        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white transition-colors cursor-pointer"
      >
        {isUpdating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <MapPin className="w-3.5 h-3.5" />
        )}
        <span>Reached Hospital</span>
      </button>
    ) : (
      <span className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
        <Navigation className="w-3.5 h-3.5" />
        <span>Journey Started</span>
      </span>
    );
  }

  return onUpdateTransit ? (
    <button
      type="button"
      disabled={isUpdating}
      onClick={() => onUpdateTransit(rawRequestId, "STARTED", commitment?.deliveryId)}
      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#317786] hover:bg-[#053845] disabled:opacity-50 text-white transition-colors cursor-pointer"
    >
      {isUpdating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Navigation className="w-3.5 h-3.5" />
      )}
      <span>Start Journey</span>
    </button>
  ) : (
    <span className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3.5 h-3.5" />
      <span>Accepted · Ready to Start</span>
    </span>
  );
}
