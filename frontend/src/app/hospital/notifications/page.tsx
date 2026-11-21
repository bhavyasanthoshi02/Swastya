"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  Trash2,
  RefreshCw,
  AlertCircle,
  Clock,
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  Users,
  Activity,
  Layers,
} from "lucide-react";
import { api, NotificationItem } from "@/lib/api";
import { formatTimeAgo, cleanNotificationMessage } from "@/lib/mappers";

type FilterTab = "all" | "unread" | "read";

export default function HospitalNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (background = false) => {
    try {
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const res = await api.notifications.getAll();
      if (res.success) {
        const notifs = res.notifications || [];
        setNotifications(notifs);
        setUnreadCount(
          res.unreadCount !== undefined
            ? res.unreadCount
            : notifs.filter((n) => !n.isread).length
        );
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load notifications");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const handleExternalUpdate = () => {
      fetchNotifications(true);
    };

    window.addEventListener("swastya-notifications-change", handleExternalUpdate);
    return () => {
      window.removeEventListener("swastya-notifications-change", handleExternalUpdate);
    };
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.notificationid === id ? { ...n, isread: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(new Event("swastya-notifications-change"));
    } catch {
      // Ignore error
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isread: true })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("swastya-notifications-change"));
    } catch {
      // Ignore error
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.notifications.delete(id);
      const removed = notifications.find((n) => n.notificationid === id);
      setNotifications((prev) => prev.filter((n) => n.notificationid !== id));
      if (removed && !removed.isread) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      window.dispatchEvent(new Event("swastya-notifications-change"));
    } catch {
      // Ignore error
    }
  };

  const getTypeConfig = (type?: string, title?: string) => {
    const lowerType = type?.toLowerCase() || "";
    const lowerTitle = title?.toLowerCase() || "";

    if (lowerType === "match" || lowerTitle.includes("match") || lowerTitle.includes("donor")) {
      return {
        icon: Users,
        iconColor: "text-[#B94F30]",
        iconBg: "bg-[#B94F30]/10",
      };
    }
    if (
      lowerType === "request" ||
      lowerTitle.includes("request") ||
      lowerTitle.includes("requisition")
    ) {
      return {
        icon: Activity,
        iconColor: "text-[#317786]",
        iconBg: "bg-[#317786]/10",
      };
    }
    if (lowerType === "inventory" || lowerTitle.includes("inventory") || lowerTitle.includes("bank")) {
      return {
        icon: Layers,
        iconColor: "text-amber-700",
        iconBg: "bg-amber-50",
      };
    }
    return {
      icon: Bell,
      iconColor: "text-[#053845]",
      iconBg: "bg-[#FAF6EE]",
    };
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.isread;
    if (filter === "read") return n.isread;
    return true;
  });

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-16">
      {/* 1. Back to Dashboard Navigation */}
      <div>
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>
      </div>

      {/* 2. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#317786]/15">
        <div className="space-y-0.5">
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Notifications
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Stay updated on blood requests, donor responses and important activities.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-[#317786]" />
              <span>Mark all read</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchNotifications(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh notifications"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 3. Notification Filters */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="inline-flex p-1 bg-white rounded-xl border border-[#F3E9D1] shadow-2xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-[#053845] text-white shadow-2xs"
                : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              filter === "unread"
                ? "bg-[#053845] text-white shadow-2xs"
                : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  filter === "unread" ? "bg-white text-[#053845]" : "bg-[#B94F30] text-white"
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("read")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filter === "read"
                ? "bg-[#053845] text-white shadow-2xs"
                : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
            }`}
          >
            Read
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:inline">
          {filteredNotifications.length} {filter === "all" ? "total" : filter} notification
          {filteredNotifications.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchNotifications(false)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Notifications List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-center">
          <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
          <p className="text-xs text-slate-500">Loading notifications...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-10 text-center shadow-2xs">
          <div className="w-10 h-10 rounded-full bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#317786]" />
          </div>
          <h3 className="font-serif text-base font-bold text-[#053845]">
            You&apos;re all caught up
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            No notifications to display right now.
          </p>
        </div>
      ) : (
        /* Notification Cards */
        <div className="space-y-2.5">
          {filteredNotifications.map((n) => {
            const typeConfig = getTypeConfig(n.type, n.title);
            const TypeIcon = typeConfig.icon;
            const isUnread = !n.isread;

            return (
              <div
                key={n.notificationid}
                className={`bg-white rounded-2xl border p-3.5 sm:p-4 shadow-2xs transition-colors flex items-start justify-between gap-3.5 ${
                  isUnread
                    ? "border-[#317786]/35 border-l-4 border-l-[#317786]"
                    : "border-[#F3E9D1] hover:border-[#317786]/30"
                }`}
              >
                {/* Left Icon (Circular) */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${typeConfig.iconBg}`}
                >
                  <TypeIcon className={`w-4 h-4 ${typeConfig.iconColor}`} />
                </div>

                {/* Center Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`text-xs sm:text-sm leading-snug ${
                        isUnread ? "font-bold text-[#053845]" : "font-semibold text-slate-800"
                      }`}
                    >
                      {n.title}
                    </h3>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                    {cleanNotificationMessage(n.message)}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px]">
                    <span className="text-slate-400 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(n.sentat || n.createdat)}</span>
                    </span>

                    {n.requestid && (
                      <Link
                        href={`/hospital/requests/${n.requestid}`}
                        className="inline-flex items-center gap-1 font-semibold text-[#317786] hover:text-[#053845] transition-colors"
                      >
                        <span>View Assigned Requisition</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Right: Unread Indicator & Action Menu */}
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  {isUnread && (
                    <>
                      <span
                        className="w-2 h-2 rounded-full bg-[#317786] shrink-0 mr-1"
                        title="Unread"
                      />
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(n.notificationid)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#317786] hover:bg-[#FAF6EE] transition-colors cursor-pointer"
                        title="Mark as read"
                        aria-label="Mark as read"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(n.notificationid)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete notification"
                    aria-label="Delete notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
