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
    <section className="bg-white rounded-2xl border border-[#F3E9D1] shadow-2xs p-4 sm:p-5 space-y-3">
      <div className="pb-2.5 border-b border-[#F3E9D1]/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#317786]" />
          <h2 className="font-serif text-base font-bold text-[#053845]">
            Recent Activity &amp; Logs
          </h2>
        </div>

        <Link
          href="/donor/notifications"
          className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1"
        >
          <span>All Alerts</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="divide-y divide-[#F3E9D1]/60">
        {activities.slice(0, 3).map((item) => (
          <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center shrink-0 mt-0.5">
              {getIcon(item.type)}
            </div>

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#053845] truncate">
                  {item.title}
                </span>
                <span className="text-[11px] text-slate-400 shrink-0 inline-flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{item.timeAgo}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                {cleanNotificationMessage(item.description)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
