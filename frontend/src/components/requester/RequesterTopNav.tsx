"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Droplets,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  PlusCircle,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Users,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { formatTimeAgo } from "@/lib/mappers";

interface RequesterTopNavProps {
  requesterName?: string;
  requesterEmail?: string;
  city?: string;
}

export function RequesterTopNav({
  requesterName = "Care Requester",
  requesterEmail = "requester@swastya.org",
  city = "Regional Network",
}: RequesterTopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      title: string;
      desc: string;
      time: string;
      type: string;
      href: string;
    }>
  >([]);

  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.notifications.getAll();
      if (res.success) {
        setUnreadCount(res.unreadCount || 0);
        const mapped = (res.notifications || []).slice(0, 5).map((n) => ({
          id: n.notificationid,
          title: n.title,
          desc: n.message,
          time: formatTimeAgo(n.sentat || n.createdat),
          type:
            n.type?.toLowerCase().includes("urgent") ||
            n.type?.toLowerCase().includes("emergency")
              ? "urgent"
              : "info",
          href: n.requestid ? `/requester/requests/${n.requestid}` : "/requester/notifications",
        }));
        setNotifications(mapped);
      }
    } catch {
      // Ignore background errors
    }
  };

  const handleSignOut = () => {
    setIsProfileOpen(false);
    setIsMobileMenuOpen(false);
    clearAuthToken();
    router.push("/signin");
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, type: "info" })));
      window.dispatchEvent(new Event("swastya-notifications-change"));
    } catch {
      // Ignore error
    }
  };

  useEffect(() => {
    fetchNotifications();

    const handleNotificationsUpdate = () => {
      fetchNotifications();
    };

    window.addEventListener("swastya-notifications-change", handleNotificationsUpdate);
    return () => {
      window.removeEventListener("swastya-notifications-change", handleNotificationsUpdate);
    };
  }, [pathname]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close menus on escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsProfileOpen(false);
        setIsNotificationsOpen(false);
        setIsMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsProfileOpen(false);
    setIsNotificationsOpen(false);
  }, [pathname]);

  interface NavLinkItem {
    href: string;
    label: string;
    icon: any;
    active: boolean;
    badge?: string;
  }

  const navLinks: NavLinkItem[] = [
    {
      href: "/requester/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: pathname === "/requester/dashboard" || pathname === "/requester",
    },
    {
      href: "/requester/requests",
      label: "My Blood Requests",
      icon: Droplets,
      active: pathname.startsWith("/requester/requests") && pathname !== "/requester/requests/new",
    },
    {
      href: "/requester/donors",
      label: "Available Donors",
      icon: Users,
      active: pathname.startsWith("/requester/donors"),
    },
  ];

  const profileLinks = [
    { href: "/requester/profile", label: "Requester Profile", icon: User },
    { href: "/requester/requests", label: "My Blood Requests", icon: Droplets },
    { href: "/requester/donors", label: "Available Donors", icon: Users },
    { href: "/requester/notifications", label: "Notifications", icon: Bell },
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#F3E9D1] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo & Navigation */}
        <div className="flex items-center gap-6 lg:gap-8 min-w-0">
          <Link
            href="/requester/dashboard"
            className="flex items-center gap-2 group focus:outline-none shrink-0"
            aria-label="Swastya Requester Portal Home"
          >
            <Logo showText={false} />
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-bold tracking-tight text-[#053845]">
                Swastya
              </span>
              <span className="text-[10px] tracking-wider uppercase font-semibold text-[#B94F30] bg-[#FAF6EE] border border-[#F3E9D1] px-2 py-0.5 rounded-full hidden sm:inline-block whitespace-nowrap">
                Requester Portal
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav
            className="hidden md:flex items-center gap-2"
            aria-label="Requester Primary Navigation"
          >
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs font-bold"
                      : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]/70"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Live Status Pill, Primary Action, Notifications, Profile, Mobile Menu */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">

          {/* Prominent Primary Action: Raise Blood Request */}
          <Link
            href="/requester/requests/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-xs hover:shadow transition-all whitespace-nowrap shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Raise Blood Request</span>
          </Link>

          <div className="hidden sm:block h-5 w-px bg-slate-200/80 mx-0.5 shrink-0" />

          {/* Notifications Dropdown */}
          <div className="relative shrink-0" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => {
                setIsNotificationsOpen(!isNotificationsOpen);
                setIsProfileOpen(false);
              }}
              className="relative p-2 rounded-xl text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] border border-transparent hover:border-[#F3E9D1] transition-all cursor-pointer"
              aria-label={`Notifications (${unreadCount} unread)`}
              aria-expanded={isNotificationsOpen}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#B94F30] ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notification Popover */}
            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2.5 border-b border-[#F3E9D1]/70 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif text-sm font-bold text-[#053845]">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#B94F30]/10 text-[#B94F30]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-medium text-[#317786] hover:text-[#053845] transition-colors cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="divide-y divide-[#F3E9D1]/40 max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No unread notifications
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <Link
                        key={notif.id}
                        href={notif.href}
                        onClick={() => setIsNotificationsOpen(false)}
                        className="p-3.5 hover:bg-[#FAF6EE]/50 transition-colors flex items-start gap-2.5 block text-left"
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            notif.type === "urgent"
                              ? "bg-[#B94F30]/10 text-[#B94F30]"
                              : "bg-[#317786]/10 text-[#317786]"
                          }`}
                        >
                          {notif.type === "urgent" ? (
                            <AlertCircle className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-semibold text-[#053845] truncate">
                              {notif.title}
                            </p>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {notif.time}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                            {notif.desc}
                          </p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>

                <div className="p-2 border-t border-[#F3E9D1]/70 bg-[#FAF6EE]/40 text-center">
                  <Link
                    href="/requester/notifications"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-xs font-semibold text-[#317786] hover:text-[#053845] transition-colors inline-flex items-center gap-1"
                  >
                    <span>View all notifications</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Requester Profile Menu */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setIsProfileOpen(!isProfileOpen);
                setIsNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-full sm:rounded-xl text-left hover:bg-[#FAF6EE] border border-transparent hover:border-[#F3E9D1] transition-all cursor-pointer"
              aria-label="Open requester profile menu"
              aria-expanded={isProfileOpen}
            >
              {/* Initials Avatar */}
              <div className="w-8 h-8 rounded-full bg-[#053845] text-white font-serif font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                {getInitials(requesterName)}
              </div>

              {/* Name & Desk Role */}
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-[#053845] leading-tight max-w-[120px] truncate">
                  {requesterName}
                </span>
                <span className="text-[10px] font-bold text-[#B94F30] leading-none">
                  Requester • {city}
                </span>
              </div>

              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform hidden sm:block ${
                  isProfileOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Profile Dropdown Panel */}
            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-[#F3E9D1] shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                {/* Header Summary */}
                <div className="px-4 py-3 border-b border-[#F3E9D1]/70 bg-[#FAF6EE]/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#053845] truncate">
                      {requesterName}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B94F30] text-white">
                      Requester
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {requesterEmail}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    Location: {city}
                  </p>
                </div>

                {/* Destinations */}
                <div className="p-1 space-y-0.5">
                  {profileLinks.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsProfileOpen(false)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-[#FAF6EE] text-[#053845] font-semibold"
                            : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]/60"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                {/* Logout Divider */}
                <div className="pt-1 mt-1 border-t border-[#F3E9D1]/70 px-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-[#A2363A] hover:bg-[#A2363A]/5 transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Navigation Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] border border-transparent hover:border-[#F3E9D1] transition-colors cursor-pointer"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[#F3E9D1] bg-white px-4 py-3 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#F3E9D1] mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#053845] text-white font-serif font-bold text-xs flex items-center justify-center">
                {getInitials(requesterName)}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-[#053845]">{requesterName}</span>
                <span className="text-[10px] text-slate-500">{city}</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#B94F30]/10 text-[#B94F30]">
              Requester
            </span>
          </div>

          <Link
            href="/requester/requests/new"
            onClick={() => setIsMobileMenuOpen(false)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-[#B94F30] shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Raise Blood Request</span>
          </Link>

          <div className="space-y-1">
            {navLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    item.active
                      ? "bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]"
                      : "text-slate-600 hover:bg-[#FAF6EE]/50 hover:text-[#053845]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[#B94F30]/10 text-[#B94F30]">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {profileLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1]"
                      : "text-slate-600 hover:bg-[#FAF6EE]/50 hover:text-[#053845]"
                  }`}
                >
                  <Icon className="w-4 h-4 text-slate-500" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#F3E9D1]">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-[#A2363A] hover:bg-[#A2363A]/5 transition-colors cursor-pointer text-left"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

