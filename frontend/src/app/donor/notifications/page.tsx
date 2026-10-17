"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Droplet,
  CheckCircle2,
  Bell,
  Trash2,
  CheckCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatTimeAgo, cleanNotificationMessage } from "@/lib/mappers";

interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "emergency" | "info" | "system";
  isRead: boolean;
  href: string;
}

export default function DonorNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "emergency">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.notifications.getAll();

      if (res.success) {
        const mapped: NotificationItem[] = (res.notifications || []).map((n) => {
          const isUrgent =
            n.type?.toLowerCase().includes("urgent") ||
            n.type?.toLowerCase().includes("emergency") ||
            n.title?.toLowerCase().includes("emergency");

          return {
            id: n.notificationid,
            title: n.title,
            description: cleanNotificationMessage(n.message),
            time: formatTimeAgo(n.createdat),
            type: isUrgent ? "emergency" : "info",
            isRead: n.isread,
            href: isUrgent ? (n.requestid ? `/donor/requests?requestId=${n.requestid}` : "/donor/requests") : "/donor/dashboard",
          };
        });
        setItems(mapped);
      } else {
        setError("Failed to load notifications.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to Swastya server.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch {
      // optimistic fallback
    }
  };

  const markSingleRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, isRead: true } : item))
      );
    } catch {
      // ignore
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await api.notifications.delete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // ignore
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === "unread") return !item.isRead;
    if (filter === "emergency") return item.type === "emergency";
    return true;
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/donor/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Donor Dashboard</span>
        </Link>

        {items.some((i) => !i.isRead) && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-[#F3E9D1] shadow-xs overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-[#F3E9D1] bg-gradient-to-r from-white via-[#FAF6EE]/40 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-[#317786] uppercase tracking-wider">
                Clinical Communication Log
              </span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
              Notifications &amp; Alerts
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
              Urgent blood requisitions, cooldown eligibility updates, and clinical dispatch alerts.
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filter === "all"
                  ? "bg-[#053845] text-white shadow-2xs"
                  : "bg-[#FAF6EE] text-slate-600 hover:text-[#053845] border border-[#F3E9D1]"
              }`}
            >
              All Alerts ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filter === "unread"
                  ? "bg-[#317786] text-white shadow-2xs"
                  : "bg-[#FAF6EE] text-slate-600 hover:text-[#317786] border border-[#F3E9D1]"
              }`}
            >
              Unread ({items.filter((i) => !i.isRead).length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("emergency")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filter === "emergency"
                  ? "bg-[#A2363A] text-white shadow-2xs"
                  : "bg-[#FAF6EE] text-slate-600 hover:text-[#A2363A] border border-[#F3E9D1]"
              }`}
            >
              Emergencies
            </button>
          </div>
        </div>

        {/* Notifications List */}
        {isLoading ? (
          <div className="p-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#317786] animate-spin mx-auto" />
            <p className="text-xs text-slate-500">Retrieving system notifications...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-[#A2363A] mx-auto" />
            <h3 className="font-serif text-base font-bold text-[#053845]">Failed to Load Notifications</h3>
            <p className="text-xs text-slate-500">{error}</p>
            <button
              type="button"
              onClick={fetchNotifications}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#317786] hover:bg-[#245964] transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 text-center space-y-2">
            <Bell className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="font-serif text-base font-bold text-[#053845]">
              No Notifications Found
            </h3>
            <p className="text-xs text-slate-500">
              You are all caught up with recent alerts and requisitions.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`p-5 sm:p-6 transition-colors flex items-start justify-between gap-4 ${
                  !item.isRead ? "bg-[#FAF6EE]/40" : "hover:bg-[#FAF6EE]/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
                      item.type === "emergency"
                        ? "bg-[#A2363A]/10 text-[#A2363A]"
                        : "bg-[#317786]/10 text-[#317786]"
                    }`}
                  >
                    {item.type === "emergency" ? (
                      <Droplet className="w-5 h-5 fill-current" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs sm:text-sm font-bold text-[#053845]">
                        {item.title}
                      </h2>
                      {!item.isRead && (
                        <span className="w-2 h-2 rounded-full bg-[#A2363A]" />
                      )}
                      <span className="text-[10px] text-slate-400">
                        • {item.time}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
                      {item.description}
                    </p>

                    <div className="pt-1 flex items-center gap-3">
                      <Link
                        href={item.href}
                        onClick={() => !item.isRead && markSingleRead(item.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors"
                      >
                        <span>View details</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>

                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={() => markSingleRead(item.id)}
                          className="text-[11px] text-slate-400 hover:text-[#317786] transition-colors"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteNotification(item.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#A2363A] hover:bg-white transition-colors cursor-pointer"
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
