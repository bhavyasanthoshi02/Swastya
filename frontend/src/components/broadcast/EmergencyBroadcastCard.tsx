"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Radio,
  RadioTower,
  Users,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Maximize2,
  RefreshCw,
  MapPin,
  Heart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";

interface BroadcastData {
  broadcastid: string;
  triggertype: string;
  triggerreason: string | null;
  radiuskm: number;
  status: string;
  totalmatched: number;
  totalnotified: number;
  totalresponded: number;
  createdat: string;
}

interface DeliveryData {
  deliveryid: string;
  matchtype: string;
  distancekm: number | null;
  deliverystatus: string;
  attemptcount: number;
  response: string | null;
  respondedat: string | null;
  transitstatus: string | null;
  donorCity?: string;
  donorState?: string;
  donorBloodGroup?: string;
}

interface EmergencyBroadcastCardProps {
  requestId: string;
  isEmergency: boolean;
  urgencyLevel: string;
  canManage: boolean;
  isTerminal: boolean;
  onRefreshParent?: () => void;
}

export default function EmergencyBroadcastCard({
  requestId,
  isEmergency,
  urgencyLevel,
  canManage,
  isTerminal,
  onRefreshParent,
}: EmergencyBroadcastCardProps) {
  const [hasBroadcast, setHasBroadcast] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastData | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanding, setIsExpanding] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState<number>(25);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showDeliveriesList, setShowDeliveriesList] = useState(false);

  const fetchBroadcastStatus = useCallback(async () => {
    if (!requestId) return;
    try {
      setIsLoading(true);
      const res = await api.bloodRequests.getBroadcastStatus(requestId);
      setHasBroadcast(res.hasBroadcast);
      setBroadcast(res.broadcast || null);
      setDeliveries(res.deliveries || []);
      if (res.broadcast?.radiuskm) {
        // Set default expansion to next step
        const cur = res.broadcast.radiuskm;
        if (cur < 25) setSelectedRadius(25);
        else if (cur < 50) setSelectedRadius(50);
        else if (cur < 75) setSelectedRadius(75);
        else if (cur < 100) setSelectedRadius(100);
      }
    } catch (err: any) {
      console.error("Failed to load broadcast status:", err);
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchBroadcastStatus();
  }, [fetchBroadcastStatus]);

  const handleExpandOrTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || isExpanding) return;

    try {
      setIsExpanding(true);
      setFeedbackMessage(null);

      const res = await api.bloodRequests.triggerBroadcast(requestId, {
        radiusKm: selectedRadius,
        reason: hasBroadcast
          ? `Emergency broadcast radius expanded to ${selectedRadius} km`
          : "Emergency broadcast initiated",
      });

      setFeedbackMessage({
        type: "success",
        text: res.message || `Broadcast updated to ${selectedRadius} km radius.`,
      });

      await fetchBroadcastStatus();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedbackMessage({
        type: "error",
        text: err?.message || "Failed to trigger or expand emergency broadcast.",
      });
    } finally {
      setIsExpanding(false);
    }
  };

  const isCriticalOrEmergency = isEmergency || urgencyLevel === "CRITICAL";

  if (!isCriticalOrEmergency && !hasBroadcast) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-base font-bold text-[#053845] flex items-center gap-2">
                Emergency Blood Broadcast
              </h2>
              {hasBroadcast && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    broadcast?.status === "ACTIVE" || broadcast?.status === "DONOR_RESPONDED"
                      ? "bg-rose-100 text-rose-800 border border-rose-200"
                      : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  {broadcast?.status === "DONOR_RESPONDED" ? "Donor Responded" : broadcast?.status || "Active"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Secure in-app broadcast alerts dispatched to compatible voluntary blood donors.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchBroadcastStatus()}
          disabled={isLoading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Feedback banner */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {feedbackMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Broadcast Content */}
      {isLoading && !broadcast ? (
        <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-[#317786]" />
          <span>Loading broadcast telemetry...</span>
        </div>
      ) : hasBroadcast && broadcast ? (
        <div className="space-y-4">
          {/* Telemetry Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#317786]" />
                Radius
              </span>
              <span className="text-lg font-bold text-slate-800 block">
                {broadcast.radiuskm} km
              </span>
              <span className="text-[10px] text-slate-500">Active geofence</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Users className="w-3 h-3 text-[#317786]" />
                Matched
              </span>
              <span className="text-lg font-bold text-slate-800 block">
                {broadcast.totalmatched}
              </span>
              <span className="text-[10px] text-slate-500">Eligible donors</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Bell className="w-3 h-3 text-rose-500" />
                Notified
              </span>
              <span className="text-lg font-bold text-rose-700 block">
                {broadcast.totalnotified}
              </span>
              <span className="text-[10px] text-slate-500">In-app alerts sent</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Heart className="w-3 h-3 text-emerald-600" />
                Responded
              </span>
              <span className="text-lg font-bold text-emerald-700 block">
                {broadcast.totalresponded}
              </span>
              <span className="text-[10px] text-slate-500">Volunteers pledged</span>
            </div>
          </div>

          {/* Expansion Form (for active non-terminal requests) */}
          {canManage && !isTerminal && broadcast.radiuskm < 100 && (
            <form
              onSubmit={handleExpandOrTrigger}
              className="p-4 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
            >
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-[#053845] flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-[#317786]" />
                  <span>Expand Broadcast Coverage</span>
                </span>
                <p className="text-[11px] text-slate-600">
                  Broadcast to newly eligible donors within an expanded search radius. Previously notified donors will not receive duplicate alerts.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selectedRadius}
                  onChange={(e) => setSelectedRadius(Number(e.target.value))}
                  disabled={isExpanding}
                  className="px-3 py-1.5 rounded-lg border border-[#F3E9D1] bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                >
                  {[15, 25, 50, 75, 100].map((r) => (
                    <option key={r} value={r} disabled={r <= broadcast.radiuskm}>
                      {r} km {r <= broadcast.radiuskm ? "(Current/Past)" : ""}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  disabled={isExpanding || selectedRadius <= broadcast.radiuskm}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#053845] hover:bg-[#317786] text-white text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                >
                  {isExpanding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RadioTower className="w-3.5 h-3.5" />}
                  <span>Expand Radius</span>
                </button>
              </div>
            </form>
          )}

          {/* Delivery Telemetry Toggle */}
          {deliveries.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowDeliveriesList(!showDeliveriesList)}
                className="inline-flex items-center gap-1.5 text-xs text-[#317786] font-semibold hover:underline cursor-pointer"
              >
                {showDeliveriesList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>
                  {showDeliveriesList
                    ? "Hide Donor Delivery Telemetry"
                    : `View Delivery Telemetry (${deliveries.length} dispatched records)`}
                </span>
              </button>

              {showDeliveriesList && (
                <div className="pt-3 space-y-2">
                  <div className="text-[11px] text-slate-500 italic pb-1">
                    Privacy Protection: Personal donor identifiers, phone numbers, and raw GPS coordinates are masked to protect donor privacy.
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                    {deliveries.map((del) => (
                      <div
                        key={del.deliveryid}
                        className="p-3 bg-white hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">
                              Donor #{del.deliveryid.slice(0, 8)}
                            </span>
                            <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]">
                              {del.donorBloodGroup || "Compatible"}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {del.matchtype === "COORDINATE_RADIUS" && del.distancekm !== null
                                ? `~${del.distancekm} km away`
                                : `Location Match (${del.donorCity || "City Match"})`}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Status: <span className="text-slate-600 font-medium">{del.deliverystatus}</span> | Attempts: {del.attemptcount}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          {del.response === "ACCEPTED" ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Volunteered
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                              Pending Response
                            </span>
                          )}
                          {del.transitstatus && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                              {del.transitstatus.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Emergency Request without active broadcast */
        <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold text-rose-900 block">
                Emergency Broadcast Not Yet Triggered
              </span>
              <p className="text-xs text-rose-800">
                This requisition is flagged as an emergency. You can initiate an emergency broadcast now to dispatch instant in-app alerts to compatible donors within the configured radius.
              </p>
            </div>
          </div>

          {canManage && !isTerminal && (
            <button
              type="button"
              onClick={handleExpandOrTrigger}
              disabled={isExpanding}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 shadow-2xs"
            >
              {isExpanding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              <span>Initiate Emergency Broadcast</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
