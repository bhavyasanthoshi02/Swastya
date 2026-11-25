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

export function MyLastDonationCard({ record }: MyLastDonationCardProps) {
  if (!record) {
    return (
      <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#F3E9D1]/70">
          <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
            My Last Donation
          </h2>
          <Link
            href="/donor/history"
            className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1"
          >
            <span>View Donation History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex items-center gap-3.5 py-2">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] flex items-center justify-center shrink-0">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h3 className="font-serif text-sm font-bold text-[#053845]">
              No Prior Donations Recorded
            </h3>
            <p className="text-xs text-slate-500">
              Verified donation records will appear here once you complete a donation.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-[#F3E9D1] p-4 sm:p-5 shadow-2xs space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-[#F3E9D1]/70">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#317786]" />
          <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
            My Last Donation
          </h2>
        </div>

        <Link
          href="/donor/history"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1"
        >
          <span>View Donation History</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Cooldown Bar */}
      <div className="p-3 rounded-xl bg-[#FAF6EE]/70 border border-[#F3E9D1] space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-[#053845]">
            90-Day Whole Blood Cooldown: Satisfied
          </span>
          <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px]">
            Ready to Donate
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div className="bg-[#317786] h-1.5 rounded-full w-full" />
        </div>
      </div>

      {/* 3 Detail Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
        <div className="p-3 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#317786]" />
            <span>Donation Date</span>
          </span>
          <div className="font-serif font-bold text-sm text-[#053845] mt-0.5">
            {record.date}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-[#B94F30]" />
            <span>Facility</span>
          </span>
          <div className="font-serif font-bold text-sm text-[#053845] mt-0.5 truncate">
            {record.location}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#FAF6EE]/50 border border-[#F3E9D1]">
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Droplet className="w-3 h-3 text-[#A2363A]" />
            <span>Component</span>
          </span>
          <div className="font-serif font-bold text-sm text-[#053845] mt-0.5">
            {record.componentType || "Whole Blood"} ({record.bloodGroup})
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
        <span>
          Record Ref: <strong className="font-mono text-[#053845]">{record.recordReference}</strong>
        </span>
        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Verified Collection</span>
        </span>
      </div>
    </section>
  );
}
