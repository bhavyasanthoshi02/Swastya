"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  ArrowRight,
  User,
  Compass,
  Droplet,
  PlusCircle,
  ShieldCheck,
} from "lucide-react";
import { AuthUser, AuthRequester } from "@/lib/auth";

interface RequesterProfileSummaryProps {
  user?: AuthUser | null;
  requester: AuthRequester | null;
  activeRequestsCount?: number;
  totalRequestsCount?: number;
}

export function RequesterProfileSummary({
  user: _user,
  requester,
  activeRequestsCount = 0,
  totalRequestsCount = 0,
}: RequesterProfileSummaryProps) {
  const [localRadius, setLocalRadius] = useState<number>(15);

  const requesterId = requester?.requesterid
    ? `REQ-${requester.requesterid.slice(0, 8).toUpperCase()}`
    : "REQ-CLINICAL";

  const city = requester?.city && requester.city !== "Not Provided" ? requester.city : "Regional Network";
  const address = requester?.address && requester.address !== "Not Provided" ? requester.address : "Area Transfusion Center";

  return (
    <section className="bg-white rounded-3xl border border-[#F3E9D1] p-5 sm:p-6 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F3E9D1]/70">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#FAF6EE] text-[#053845] flex items-center justify-center border border-[#F3E9D1]">
            <User className="w-4 h-4 text-[#317786]" />
          </div>
          <div>
            <h2 className="font-serif text-base font-bold text-[#053845]">
              Requester Coordination Desk
            </h2>
            <p className="text-[11px] text-slate-500 font-mono">ID: {requesterId}</p>
          </div>
        </div>

        <Link
          href="/requester/profile"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group"
        >
          <span>Full Profile</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Attributes Row (mirrors DonorProfileSummary) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Active Requisitions */}
        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
            <Droplet className="w-3 h-3 text-[#B94F30]" />
            Active Needs
          </span>
          <div className="font-serif text-2xl font-bold text-[#053845] mt-0.5">
            {activeRequestsCount}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            {activeRequestsCount === 1 ? "Requisition In Progress" : "Requisitions In Progress"}
          </span>
        </div>

        {/* Total Lifetime Raised */}
        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#317786]" />
            Total Requests
          </span>
          <div className="font-serif text-2xl font-bold text-[#053845] mt-0.5">
            {totalRequestsCount}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">
            Clinical Records Logged
          </span>
        </div>
      </div>

      {/* Desk Coordination Status & Perimeter Slider */}
      <div className="p-4 rounded-2xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Emergency Coordination Status
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Online (Direct Blood Bank Link)</span>
              </span>
            </div>
          </div>

          <Link
            href="/requester/requests/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#B94F30] hover:bg-[#a14023] text-white transition-all cursor-pointer shadow-2xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Raise Need</span>
          </Link>
        </div>

        {/* Coverage Perimeter interactive slider */}
        <div className="pt-2 border-t border-[#F3E9D1]/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#317786]" />
              <span>Donor Search Radius</span>
              <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 rounded">
                Dynamic
              </span>
            </span>
            <span className="font-bold text-[#053845] font-mono px-2 py-0.5 rounded bg-white border border-[#F3E9D1]">
              {localRadius} km
            </span>
          </div>

          <input
            type="range"
            min="3"
            max="35"
            step="1"
            value={localRadius}
            onChange={(e) => setLocalRadius(Number(e.target.value))}
            className="w-full accent-[#317786] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 truncate max-w-[200px]">
              <MapPin className="w-3 h-3 text-[#B94F30] shrink-0" />
              <span className="truncate">{city} • {address}</span>
            </span>
            <span className="text-slate-400 text-[10px]">
              Expands emergency broadcast
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
