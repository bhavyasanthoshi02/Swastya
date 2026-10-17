"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Droplets,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ExternalLink,
  Plus,
  Users,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { formatTimeAgo } from "@/lib/mappers";

interface HospitalTopNavProps {
  hospitalName?: string;
  representativeName?: string;
  registrationNumber?: string;
  city?: string;
  approvalStatus?: string;
}

export function HospitalTopNav({
  hospitalName = "Hospital Facility",
  representativeName = "Medical Officer",
  registrationNumber = "REG-PENDING",
  city = "Clinical Network",
  approvalStatus = "PENDING",
}: HospitalTopNavProps) {
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
          href: n.requestid ? `/hospital/requests` : "/hospital/notifications",
        }));
        setNotifications(mapped);
      }
    } catch {
      // Ignore background notification fetch errors
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
    const interval = setInterval(fetchNotifications, 45000);

    const handleNotifChange = () => fetchNotifications();
    window.addEventListener("swastya-notifications-change", handleNotifChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("swastya-notifications-change", handleNotifChange);
    };
  }, []);

  // Close dropdowns on outside clicks
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    };

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

  // Clean 3 core links matching Donor and Requester
  const navLinks = [
    {
      href: "/hospital/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: pathname === "/hospital/dashboard" || pathname === "/hospital",
    },
    {
      href: "/hospital/requests",
      label: "Blood Requests",
      icon: Droplets,
      active: pathname.startsWith("/hospital/requests") && pathname !== "/hospital/requests/new",
    },
    {
      href: "/hospital/donors",
      label: "Donor Registry",
      icon: Users,
      active: pathname.startsWith("/hospital/donors"),
    },
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
        {/* Left: Brand Logo & Clean 3-link Navigation */}
        <div className="flex items-center gap-6 lg:gap-8 min-w-0">
          <Link
            href="/hospital/dashboard"
            className="flex items-center gap-2 group focus:outline-none shrink-0"
            aria-label="Swastya Hospital Portal Home"
          >
            <Logo showText={false} />
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-bold tracking-tight text-[#053845]">
                Swastya
              </span>
              <span className="text-[10px] tracking-wider uppercase font-semibold text-[#317786] bg-[#FAF6EE] border border-[#F3E9D1] px-2 py-0.5 rounded-full hidden sm:inline-block whitespace-nowrap">
                Hospital Portal
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav
            className="hidden md:flex items-center gap-1.5"
            aria-label="Hospital Primary Navigation"
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

        {/* Right: Live Status Pill, Create Request, Notifications, Profile, Mobile Menu */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Live Facility Verification Chip */}
          <div
            className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
              approvalStatus === "VERIFIED"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : approvalStatus === "REJECTED"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
            title={`Clinical Approval Status: ${approvalStatus}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                approvalStatus === "VERIFIED"
                  ? "bg-emerald-500 animate-pulse"
                  : approvalStatus === "REJECTED"
                  ? "bg-rose-500"
                  : "bg-amber-500"
              }`}
            />
            <span className="truncate max-w-[170px]">
              {approvalStatus === "VERIFIED"
                ? `Verified • ${city}`
                : "Verification Pending"}
            </span>
          </div>

          {/* Quick Action: Create Request */}
          <Link
            href="/hospital/requests/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#053845] hover:bg-[#317786] transition-all shadow-2xs hover:scale-[1.02]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Request</span>
          </Link>

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

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-88 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#F3E9D1]/70 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif text-sm font-bold text-[#053845]">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF6EE] text-[#B94F30] border border-[#F3E9D1]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[11px] text-[#317786] hover:text-[#053845] font-medium transition-colors cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-[#F3E9D1]/40">
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      No facility notifications yet.
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <Link
                        key={notif.id}
                        href={notif.href}
                        onClick={() => setIsNotificationsOpen(false)}
                        className="block p-2.5 rounded-xl hover:bg-[#FAF6EE]/60 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-semibold text-[#053845] line-clamp-1">
                            {notif.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {notif.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                          {notif.desc}
                        </p>
                      </Link>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-[#F3E9D1]/70 mt-1 text-center">
                  <Link
                    href="/hospital/notifications"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors inline-flex items-center gap-1"
                  >
                    <span>View all notifications</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Profile Dropdown */}
          <div className="relative shrink-0" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setIsProfileOpen(!isProfileOpen);
                setIsNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1 rounded-full sm:rounded-xl hover:bg-[#FAF6EE] border border-transparent hover:border-[#F3E9D1] transition-all focus:outline-none cursor-pointer"
              aria-label="Facility Profile Menu"
              aria-expanded={isProfileOpen}
            >
              <div className="w-8 h-8 rounded-full bg-[#053845] text-white flex items-center justify-center text-xs font-bold font-serif shadow-xs">
                {getInitials(hospitalName)}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block mr-1" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2.5 bg-[#FAF6EE]/70 rounded-xl mb-1.5 border border-[#F3E9D1]/60">
                  <span className="block text-xs font-bold text-[#053845] truncate">
                    {hospitalName}
                  </span>
                  <span className="block text-[11px] text-slate-600 truncate">
                    {representativeName}
                  </span>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span className="font-mono truncate">{registrationNumber}</span>
                    <span className="text-[#317786] font-medium">{city}</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <Link
                    href="/hospital/profile"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Facility Profile</span>
                  </Link>
                  <Link
                    href="/hospital/requests"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <Droplets className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Blood Requests</span>
                  </Link>
                  <Link
                    href="/hospital/donors"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <Users className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Donor Registry</span>
                  </Link>
                  <Link
                    href="/hospital/requests/new"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Create Blood Request</span>
                  </Link>
                </div>

                <div className="border-t border-[#F3E9D1]/70 my-1 pt-1">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-b border-[#F3E9D1] bg-white px-4 pt-2 pb-4 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#F3E9D1] mb-2">
            <span className="block text-xs font-bold text-[#053845] truncate">
              {hospitalName}
            </span>
            <span className="block text-[11px] text-slate-500">
              {city} &bull; {approvalStatus === "VERIFIED" ? "Verified Facility" : "Pending Verification"}
            </span>
          </div>

          <div className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                    link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]"
                      : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}

            <Link
              href="/hospital/requests/new"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#053845]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Blood Request</span>
            </Link>

            <Link
              href="/hospital/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-[#FAF6EE]"
            >
              <Building2 className="w-4 h-4 text-[#317786]" />
              <span>Facility Profile</span>
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 text-left"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
