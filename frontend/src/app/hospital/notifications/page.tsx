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
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { api, NotificationItem } from "@/lib/api";
import { formatTimeAgo, cleanNotificationMessage } from "@/lib/mappers";

export default function HospitalNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterUnread, setFilterUnread] = useState(false);
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

      const res = await api.notifications.getAll({ unreadOnly: filterUnread });
      if (res.success) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load notifications");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filterUnread]);

  useEffect(() => {
    fetchNotifications();
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
      setNotifications((prev) => prev.filter((n) => n.notificationid !== id));
      window.dispatchEvent(new Event("swastya-notifications-change"));
    } catch {
      // Ignore error
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto pb-16">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/hospital/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Hospital Dashboard</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
            Facility Notifications
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time requisition alerts, donor volunteer matching, and clinical milestones
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] border border-[#F3E9D1] transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-[#317786]" />
              <span>Mark all read</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => fetchNotifications(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#F3E9D1] pb-3">
        <button
          type="button"
          onClick={() => setFilterUnread(false)}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
            !filterUnread
              ? "bg-[#053845] text-white shadow-xs"
              : "text-slate-600 hover:bg-[#FAF6EE]"
          }`}
        >
          All Notifications
        </button>
        <button
          type="button"
          onClick={() => setFilterUnread(true)}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
            filterUnread
              ? "bg-[#053845] text-white shadow-xs"
              : "text-slate-600 hover:bg-[#FAF6EE]"
          }`}
        >
          <span>Unread Only</span>
          {unreadCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filterUnread ? "bg-white text-[#053845]" : "bg-[#B94F30] text-white"
            }`}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Notifications List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-center">
          <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
          <p className="text-xs text-slate-500">Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#F3E9D1] p-12 text-center">
          <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No notifications</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {filterUnread
              ? "You have marked all notifications as read."
              : "No activity notifications have been generated for this facility yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.notificationid}
              className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs transition-all flex items-start justify-between gap-4 ${
                !n.isread ? "border-[#317786]/40 bg-[#FAF6EE]/30 ring-1 ring-[#317786]/10" : "border-[#F3E9D1]"
              }`}
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  {!n.isread && (
                    <span className="w-2 h-2 rounded-full bg-[#317786] shrink-0" />
                  )}
                  <h4 className="font-semibold text-sm text-[#053845]">
                    {n.title}
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    &bull; {formatTimeAgo(n.sentat || n.createdat)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {cleanNotificationMessage(n.message)}
                </p>
                {n.requestid && (
                  <div className="pt-1.5">
                    <Link
                      href={`/hospital/requests/${n.requestid}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#317786] hover:text-[#053845] transition-colors"
                    >
                      <span>View Assigned Requisition</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                {!n.isread && (
                  <button
                    type="button"
                    onClick={() => handleMarkAsRead(n.notificationid)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#317786] hover:bg-[#FAF6EE] transition-colors"
                    title="Mark as read"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(n.notificationid)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Delete notification"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
