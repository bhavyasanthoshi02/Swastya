import React from "react";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  Droplet,
  ArrowRight,
  ShieldCheck,
  HeartHandshake,
} from "lucide-react";
import { LastDonationRecord } from "./DonorTypes";

interface MyLastDonationCardProps {
  record: LastDonationRecord | null;
  donorName?: string;
}

export function MyLastDonationCard({
  record,
}: MyLastDonationCardProps) {

  if (!record) {
    return (
      <section className="bg-white rounded-3xl border border-[#F3E9D1] p-6 sm:p-7 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-[#F3E9D1]/70">
          <h2 className="font-serif text-lg font-bold text-[#053845]">
            My Last Donation
          </h2>
          <Link
            href="/donor/history"
            className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group"
          >
            <span>View Donation History</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="py-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] text-slate-400 mx-auto flex items-center justify-center">
            <HeartHandshake className="w-6 h-6 text-[#317786]" />
          </div>
          <h3 className="font-serif text-base font-semibold text-[#053845]">
            No Prior Donations Recorded
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            When you complete a voluntary donation, your verified transfusion safety record will appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-3xl border border-[#F3E9D1] p-5 sm:p-7 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#F3E9D1]/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold text-[#053845]">
              My Last Donation &amp; Verification
            </h2>
            <p className="text-xs text-slate-500">
              Logged &amp; verified in the national transfusion network
            </p>
          </div>
        </div>

        <Link
          href="/donor/history"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group"
        >
          <span>All History</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Cooldown & Eligibility Progress Bar */}
      <div className="p-4 rounded-2xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[#053845] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>90-Day Whole Blood Cooldown: Satisfied</span>
          </span>
          <span className="text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full text-[11px]">
            Ready to Donate Today
          </span>
        </div>

        {/* Meter */}
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
            style={{ width: "100%" }}
          />
        </div>

        <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
          <span>Last Donated: {record.date}</span>
          <span>Next Eligible: Anytime (Current)</span>
        </div>
      </div>

      {/* 3 Detail Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/40 border border-[#F3E9D1] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#317786]" />
            Donation Date
          </span>
          <div className="font-serif font-bold text-base text-[#053845]">
            {record.date}
          </div>
          <p className="text-[11px] text-slate-500">
            Verified clinical collection
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/40 border border-[#F3E9D1] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <MapPin className="w-3 h-3 text-[#B94F30]" />
            Facility
          </span>
          <div className="font-serif font-bold text-sm text-[#053845] truncate">
            {record.location}
          </div>
          <p className="text-[11px] text-slate-500">
            Authorized blood bank
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#FAF6EE]/40 border border-[#F3E9D1] space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
            <Droplet className="w-3 h-3 text-[#A2363A]" />
            Component
          </span>
          <div className="font-serif font-bold text-sm text-[#053845]">
            {record.componentType || "Whole Blood (450 ml)"}
          </div>
          <p className="text-[11px] text-slate-500">
            Group {record.bloodGroup}
          </p>
        </div>
      </div>

      {/* Verification Summary */}
      <div className="p-4 rounded-2xl bg-[#FAF6EE]/60 border border-[#F3E9D1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
            Record Reference:
          </span>
          <span className="font-mono font-semibold text-[#053845]">
            {record.recordReference}
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Clinical Verification Completed</span>
        </div>
      </div>
    </section>
  );
}
