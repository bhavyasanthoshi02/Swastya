"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Droplet,
  AlertCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Trash2,
  Inbox,
  ShieldCheck,
  Activity,
  Layers,
  Users,
} from "lucide-react";
import { api, NotificationItem } from "@/lib/api";
import { formatTimeAgo, mapBloodGroupToDisplay } from "@/lib/mappers";

type FilterTab = "all" | "unread";

export default function RequesterNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(
    async (showLoadingSpinner = false) => {
      try {
        if (showLoadingSpinner) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);

        // Fetch based on the current filter tab
        const res = await api.notifications.getAll({
          unreadOnly: filter === "unread",
        });

        if (res.success) {
          setNotifications(res.notifications || []);
          setUnreadCount(res.unreadCount || 0);
          setTotalCount(res.total || 0);
        } else {
          setError("Failed to retrieve notifications from the network.");
        }
      } catch (err: any) {
        console.error("Error fetching notifications:", err);
        setError(
          err?.message ||
            "Unable to connect to the clinical notification server. Please verify your connection."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    fetchNotifications(true);
  }, [fetchNotifications]);

  // Synchronize when external events (e.g. topnav mark all read) fire
  useEffect(() => {
    const handleExternalUpdate = () => {
      fetchNotifications(false);
    };

    window.addEventListener("swastya-notifications-change", handleExternalUpdate);
    return () => {
      window.removeEventListener("swastya-notifications-change", handleExternalUpdate);
    };
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (updatingId) return;

    try {
      setUpdatingId(id);
      const res = await api.notifications.markRead(id);
      if (res.success) {
        setNotifications((prev) =>
          prev.map((item) =>
            item.notificationid === id ? { ...item, isread: true, readat: new Date().toISOString() } : item
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        // Notify TopNav
        window.dispatchEvent(new Event("swastya-notifications-change"));
      }
    } catch (err: any) {
      console.error("Error marking notification read:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (isMarkingAll || unreadCount === 0) return;

    try {
      setIsMarkingAll(true);
      const res = await api.notifications.markAllRead();
      if (res.success) {
        setNotifications((prev) =>
          prev.map((item) => ({ ...item, isread: true, readat: new Date().toISOString() }))
        );
        setUnreadCount(0);
        // Notify TopNav
        window.dispatchEvent(new Event("swastya-notifications-change"));
      }
    } catch (err: any) {
      console.error("Error marking all notifications read:", err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingId) return;

    try {
      setUpdatingId(id);
      const res = await api.notifications.delete(id);
      if (res.success) {
        const removed = notifications.find((n) => n.notificationid === id);
        setNotifications((prev) => prev.filter((n) => n.notificationid !== id));
        if (removed && !removed.isread) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        setTotalCount((prev) => Math.max(0, prev - 1));
        // Notify TopNav
        window.dispatchEvent(new Event("swastya-notifications-change"));
      }
    } catch (err: any) {
      console.error("Error deleting notification:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Helper for notification type styling & iconography
  const getTypeConfig = (type: string, title: string) => {
    const lowerType = type?.toLowerCase() || "";
    const lowerTitle = title?.toLowerCase() || "";

    if (lowerType === "match" || lowerTitle.includes("match") || lowerTitle.includes("donor")) {
      return {
        label: "Donor Response",
        icon: Users,
        iconColor: "text-[#B94F30]",
        iconBg: "bg-[#B94F30]/10",
        badgeBg: "bg-[#B94F30]/10 text-[#B94F30] border-[#B94F30]/20",
      };
    }
    if (lowerType === "request" || lowerTitle.includes("request")) {
      return {
        label: "Requisition Update",
        icon: Activity,
        iconColor: "text-[#317786]",
        iconBg: "bg-[#317786]/10",
        badgeBg: "bg-[#317786]/10 text-[#317786] border-[#317786]/20",
      };
    }
    if (lowerType === "inventory" || lowerTitle.includes("inventory") || lowerTitle.includes("bank")) {
      return {
        label: "Blood Reserve",
        icon: Layers,
        iconColor: "text-amber-700",
        iconBg: "bg-amber-100",
        badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
      };
    }
    if (lowerType === "verification") {
      return {
        label: "Verification",
        icon: ShieldCheck,
        iconColor: "text-emerald-700",
        iconBg: "bg-emerald-100",
        badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    }
    return {
      label: "System Notice",
      icon: Bell,
      iconColor: "text-[#053845]",
      iconBg: "bg-[#FAF6EE]",
      badgeBg: "bg-slate-100 text-slate-700 border-slate-200",
    };
  };

  const formatTimestamp = (dateStr?: string | null) => {
    if (!dateStr) return "Recently";
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      }).format(date);
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#F3E9D1]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              Notifications
            </h1>
            {unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#B94F30]/10 text-[#B94F30] border border-[#B94F30]/20 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B94F30]" />
                {unreadCount} Unread
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#317786]/10 text-[#317786] border border-[#317786]/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All Caught Up
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time updates on donor commitments, medical review confirmations, and emergency requisition statuses.
          </p>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchNotifications(false)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] hover:text-[#053845] transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Refresh notifications"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#317786]" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={isMarkingAll || unreadCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#074758] transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck className={`w-4 h-4 ${isMarkingAll ? "animate-bounce" : ""}`} />
            <span>Mark all as read</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex p-1 bg-white rounded-xl border border-[#F3E9D1] shadow-2xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filter === "all"
                ? "bg-[#053845] text-white shadow-2xs"
                : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
            }`}
          >
            All Notifications
            {filter === "all" && totalCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white">
                {totalCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === "unread"
                ? "bg-[#053845] text-white shadow-2xs"
                : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
            }`}
          >
            <span>Unread Only</span>
            {unreadCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  filter === "unread"
                    ? "bg-[#B94F30] text-white"
                    : "bg-[#B94F30]/10 text-[#B94F30]"
                }`}
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="text-xs text-slate-500 hidden sm:block">
          Showing {notifications.length} {filter === "unread" ? "unread" : "total"} records
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <h3 className="text-sm font-bold">Communication Error</h3>
            <p className="text-xs text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => fetchNotifications(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer flex-shrink-0"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xs animate-pulse space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-200" />
                  <div className="space-y-1.5">
                    <div className="w-36 h-3.5 bg-slate-200 rounded" />
                    <div className="w-20 h-2.5 bg-slate-200 rounded" />
                  </div>
                </div>
                <div className="w-24 h-3 bg-slate-200 rounded" />
              </div>
              <div className="w-full h-3 bg-slate-200 rounded" />
              <div className="w-2/3 h-3 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && notifications.length === 0 && (
        <div className="py-16 px-6 text-center rounded-3xl bg-white border border-[#F3E9D1] shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-4">
            {filter === "unread" ? (
              <CheckCheck className="w-7 h-7 text-[#317786]" />
            ) : (
              <Inbox className="w-7 h-7 text-slate-400" />
            )}
          </div>
          <h3 className="font-serif text-lg font-bold text-[#053845]">
            {filter === "unread" ? "No Unread Notifications" : "No Notifications Yet"}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
            {filter === "unread"
              ? "You are completely up to date. You can view past messages by switching to the 'All Notifications' tab."
              : "When matching voluntary donors volunteer or hospital coordinators verify your blood requisitions, alert dispatches will appear here."}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {filter === "unread" ? (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#053845] text-white hover:bg-[#074758] transition-colors cursor-pointer shadow-xs"
              >
                View All Notifications
              </button>
            ) : (
              <Link
                href="/requester/requests/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#B94F30] text-white hover:bg-[#9E3E22] transition-colors shadow-xs"
              >
                <Droplet className="w-3.5 h-3.5 fill-current" />
                <span>Raise a Blood Request</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Notifications List */}
      {!isLoading && !error && notifications.length > 0 && (
        <div className="space-y-3">
          {notifications.map((item) => {
            const typeConfig = getTypeConfig(item.type, item.title);
            const TypeIcon = typeConfig.icon;
            const isUnread = !item.isread;
            const relatedRequestId = item.requestid || item.bloodrequests?.requestid;

            return (
              <div
                key={item.notificationid}
                className={`group relative rounded-2xl border transition-all duration-150 p-4 sm:p-5 shadow-2xs ${
                  isUnread
                    ? "bg-[#FAF6EE]/80 border-[#E5D7B7] border-l-4 border-l-[#B94F30]"
                    : "bg-white border-[#F3E9D1] hover:border-slate-300"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  {/* Left Icon and Content */}
                  <div className="flex items-start gap-3.5 flex-grow">
                    {/* Status Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${typeConfig.iconBg}`}
                    >
                      <TypeIcon className={`w-5 h-5 ${typeConfig.iconColor}`} />
                    </div>

                    {/* Notification Body */}
                    <div className="space-y-1.5 flex-grow">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeConfig.badgeBg}`}
                        >
                          {typeConfig.label}
                        </span>

                        {isUnread && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#B94F30] text-white">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            NEW
                          </span>
                        )}

                        <span className="text-[11px] text-slate-400 font-medium">
                          • {formatTimeAgo(item.sentat || item.createdat)}
                        </span>
                      </div>

                      <h3
                        className={`text-sm sm:text-base leading-snug ${
                          isUnread
                            ? "font-bold text-[#053845]"
                            : "font-semibold text-slate-800"
                        }`}
                      >
                        {item.title}
                      </h3>

                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                        {item.message}
                      </p>

                      {/* Related Blood Request Badge & Navigation Link */}
                      {relatedRequestId && (
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/requester/requests/${relatedRequestId}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-[#F3E9D1] text-[#317786] hover:text-[#053845] hover:border-[#317786] transition-all shadow-2xs group/link"
                          >
                            <Droplet className="w-3.5 h-3.5 text-[#B94F30] fill-current" />
                            <span>
                              Requisition REQ-{relatedRequestId.slice(0, 8).toUpperCase()}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-0.5 transition-transform" />
                          </Link>

                          {item.bloodrequests && (
                            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                              <span>Patient: {item.bloodrequests.patientname}</span>
                              <span>•</span>
                              <span className="font-bold text-[#053845]">
                                {mapBloodGroupToDisplay(item.bloodrequests.bloodgroup)}
                              </span>
                              <span>•</span>
                              <span className="text-xs font-semibold uppercase text-slate-600">
                                {item.bloodrequests.status.replace(/_/g, " ")}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions & Exact Timestamp */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex-shrink-0">
                    <span
                      className="text-[11px] text-slate-400 whitespace-nowrap flex items-center gap-1"
                      title={formatTimestamp(item.sentat || item.createdat)}
                    >
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(item.sentat || item.createdat)}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(item.notificationid, e)}
                          disabled={updatingId === item.notificationid}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#317786] hover:text-white hover:bg-[#317786] bg-[#317786]/10 border border-[#317786]/20 transition-all cursor-pointer flex items-center gap-1"
                          title="Mark as read"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>Mark Read</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDelete(item.notificationid, e)}
                        disabled={updatingId === item.notificationid}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Safety & Information Notice */}
      <div className="p-4 rounded-2xl bg-white border border-[#F3E9D1] text-xs text-slate-500 flex items-start gap-3 shadow-2xs">
        <ShieldCheck className="w-4 h-4 text-[#317786] flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-[#053845]">
            Verified Notification Dispatch System
          </p>
          <p className="leading-relaxed">
            Notifications are generated exclusively when authenticated voluntary donors respond to regional requisitions, or when certified blood banks and hospital medical coordinators process status transitions. No unverified third-party notifications are routed to your clinical account.
          </p>
        </div>
      </div>
    </div>
  );
}
