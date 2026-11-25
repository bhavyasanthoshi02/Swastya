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
import { formatTimeAgo, mapBloodGroupToDisplay, cleanNotificationMessage } from "@/lib/mappers";

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
      } catch (err: unknown) {
        console.error("Error fetching notifications:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Unable to connect to the clinical notification server. Please verify your connection."
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
            item.notificationid === id
              ? { ...item, isread: true, readat: new Date().toISOString() }
              : item
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        window.dispatchEvent(new Event("swastya-notifications-change"));
      }
    } catch (err: unknown) {
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
        window.dispatchEvent(new Event("swastya-notifications-change"));
      }
    } catch (err: unknown) {
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
        window.dispatchEvent(new Event("swastya-notifications-change"));
      }
    } catch (err: unknown) {
      console.error("Error deleting notification:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const getTypeConfig = (type: string, title: string) => {
    const lowerType = type?.toLowerCase() || "";
    const lowerTitle = title?.toLowerCase() || "";

    if (lowerType === "match" || lowerTitle.includes("match") || lowerTitle.includes("donor")) {
      return {
        label: "Donor Response",
        icon: Users,
        iconColor: "text-[#B94F30]",
        iconBg: "bg-[#B94F30]/10",
      };
    }
    if (lowerType === "request" || lowerTitle.includes("request")) {
      return {
        label: "Requisition Update",
        icon: Activity,
        iconColor: "text-[#317786]",
        iconBg: "bg-[#317786]/10",
      };
    }
    if (lowerType === "inventory" || lowerTitle.includes("inventory") || lowerTitle.includes("bank")) {
      return {
        label: "Blood Reserve",
        icon: Layers,
        iconColor: "text-amber-700",
        iconBg: "bg-amber-50",
      };
    }
    if (lowerType === "verification") {
      return {
        label: "Verification",
        icon: ShieldCheck,
        iconColor: "text-emerald-700",
        iconBg: "bg-emerald-50",
      };
    }
    return {
      label: "System Notice",
      icon: Bell,
      iconColor: "text-[#053845]",
      iconBg: "bg-[#FAF6EE]",
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
    <div className="space-y-4 max-w-5xl mx-auto pb-8">
      {/* 1. Compact Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#317786]/15">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] tracking-tight">
              Notifications
            </h1>
            {unreadCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#B94F30]/10 text-[#B94F30] border border-[#B94F30]/20">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B94F30]" />
                <span>{unreadCount} Unread</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#317786]/10 text-[#317786] border border-[#317786]/20">
                <CheckCircle2 className="w-3 h-3" />
                <span>All Caught Up</span>
              </span>
            )}
          </div>
          <p className="hidden sm:block text-xs sm:text-sm text-slate-600">
            Updates on donor responses, hospital reviews and requisition activity.
          </p>
        </div>

        {/* Refresh & Mark All as Read */}
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => fetchNotifications(false)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 bg-white border border-[#F3E9D1] hover:bg-[#FAF6EE] hover:text-[#053845] transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
            title="Refresh notifications"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#317786]" : "text-[#317786]"}`}
            />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={isMarkingAll || unreadCount === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-colors cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All as Read</span>
          </button>
        </div>
      </header>

      {/* 2. Compact Notification Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-white rounded-xl border border-[#F3E9D1] shadow-2xs">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              filter === "all"
                ? "bg-[#053845] text-white shadow-2xs"
                : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
            }`}
          >
            <span>All Notifications</span>
            {totalCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  filter === "all"
                    ? "bg-white/20 text-white"
                    : "bg-[#FAF6EE] text-slate-600"
                }`}
              >
                {totalCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("unread")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
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

        <div className="text-xs text-slate-500">
          Showing {notifications.length} {filter === "unread" ? "unread" : "total"} records
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchNotifications(true)}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer shrink-0"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xs animate-pulse space-y-2"
            >
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="h-3 w-full bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* 3. Compact Empty State */}
      {!isLoading && !error && notifications.length === 0 && (
        <div className="w-full py-8 px-5 text-center rounded-2xl bg-white border border-[#F3E9D1] shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] flex items-center justify-center mx-auto mb-2.5">
            {filter === "unread" ? (
              <CheckCheck className="w-5 h-5 text-[#317786]" />
            ) : (
              <Inbox className="w-5 h-5 text-[#317786]" />
            )}
          </div>

          <h2 className="font-serif text-base sm:text-lg font-bold text-[#053845]">
            {filter === "unread" ? "No Unread Notifications" : "You're All Caught Up"}
          </h2>

          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1">
            {filter === "unread"
              ? "You're up to date. Switch to All Notifications to view previous updates."
              : "Updates about donor commitments and hospital reviews will appear here."}
          </p>

          {filter === "unread" && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#053845] text-white hover:bg-[#317786] transition-colors cursor-pointer"
              >
                View All Notifications
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Compact Notification Cards */}
      {!isLoading && !error && notifications.length > 0 && (
        <div className="space-y-2.5">
          {notifications.map((item) => {
            const typeConfig = getTypeConfig(item.type, item.title);
            const TypeIcon = typeConfig.icon;
            const isUnread = !item.isread;
            const relatedRequestId = item.requestid || item.bloodrequests?.requestid;

            return (
              <article
                key={item.notificationid}
                className={`rounded-2xl border transition-colors p-3.5 sm:p-4 shadow-2xs bg-white ${
                  isUnread
                    ? "border-[#317786]/40 border-l-4 border-l-[#317786]"
                    : "border-[#F3E9D1] hover:border-[#317786]/35"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${typeConfig.iconBg}`}
                    >
                      <TypeIcon className={`w-4 h-4 ${typeConfig.iconColor}`} />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {isUnread && (
                          <span
                            className="w-2 h-2 rounded-full bg-[#B94F30] shrink-0"
                            aria-label="Unread"
                          />
                        )}
                        <span className="font-semibold text-[#317786]">{typeConfig.label}</span>
                        <span className="text-slate-300">&bull;</span>
                        <span className="text-slate-400">
                          {formatTimeAgo(item.sentat || item.createdat)}
                        </span>
                      </div>

                      <h2
                        className={`text-sm leading-snug ${
                          isUnread ? "font-bold text-[#053845]" : "font-semibold text-slate-800"
                        }`}
                      >
                        {item.title}
                      </h2>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {cleanNotificationMessage(item.message)}
                      </p>

                      {relatedRequestId && (
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/requester/requests/${relatedRequestId}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FAF6EE] border border-[#F3E9D1] text-[#317786] hover:text-[#053845] hover:border-[#317786]/40 transition-colors"
                          >
                            <Droplet className="w-3 h-3 text-[#B94F30] fill-current" />
                            <span>REQ-{relatedRequestId.slice(0, 8).toUpperCase()}</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>

                          {item.bloodrequests && (
                            <span className="text-[11px] text-slate-500">
                              {item.bloodrequests.patientname} &middot;{" "}
                              <strong className="text-[#053845]">
                                {mapBloodGroupToDisplay(item.bloodrequests.bloodgroup)}
                              </strong>{" "}
                              &middot; {item.bloodrequests.status.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamp & Row Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F3E9D1]/60 shrink-0">
                    <span
                      className="text-[11px] text-slate-400 whitespace-nowrap inline-flex items-center gap-1"
                      title={formatTimestamp(item.sentat || item.createdat)}
                    >
                      <Clock className="w-3 h-3" />
                      <span>{formatTimestamp(item.sentat || item.createdat)}</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(item.notificationid, e)}
                          disabled={updatingId === item.notificationid}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#317786] hover:text-white hover:bg-[#317786] bg-[#317786]/10 border border-[#317786]/20 transition-colors cursor-pointer inline-flex items-center gap-1"
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
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#A2363A] hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
