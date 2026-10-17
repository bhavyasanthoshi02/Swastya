"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Activity, Clock, ShieldCheck, Heart, AlertCircle } from "lucide-react";
import { RecentActivityItem } from "./DonorTypes";
import { cleanNotificationMessage } from "@/lib/mappers";

interface RecentActivityPreviewProps {
  activities: RecentActivityItem[];
}

export function RecentActivityPreview({ activities }: RecentActivityPreviewProps) {
  const getIcon = (type: RecentActivityItem["type"]) => {
    switch (type) {
      case "alert":
        return <AlertCircle className="w-3.5 h-3.5 text-[#A2363A]" />;
      case "donation":
        return <Heart className="w-3.5 h-3.5 text-emerald-600" />;
      case "availability":
      default:
        return <ShieldCheck className="w-3.5 h-3.5 text-[#317786]" />;
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs p-5 sm:p-6 space-y-4">
      {/* Header */}
      <div className="pb-3 border-b border-[#F3E9D1]/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#FAF6EE] text-[#317786] flex items-center justify-center border border-[#F3E9D1]">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-serif text-base font-bold text-[#053845]">
              Recent Activity &amp; Logs
            </h2>
          </div>
        </div>

        <Link
          href="/donor/notifications"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1 group"
        >
          <span>All Alerts</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-3">
        {activities.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="p-3 rounded-2xl bg-[#FAF6EE]/40 border border-[#F3E9D1]/60 hover:bg-[#FAF6EE] transition-colors flex items-start gap-3"
          >
            <div className="w-7 h-7 rounded-lg bg-white border border-[#F3E9D1] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              {getIcon(item.type)}
            </div>

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#053845] truncate">
                  {item.title}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {item.timeAgo}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {cleanNotificationMessage(item.description)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
