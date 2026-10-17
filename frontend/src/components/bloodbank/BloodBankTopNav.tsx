"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building,
  Droplets,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ClipboardList,
  FlaskConical,
  Truck,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { formatTimeAgo } from "@/lib/mappers";

interface BloodBankTopNavProps {
  bloodBankName?: string;
  representativeName?: string;
  licenseNumber?: string;
  city?: string;
  approvalStatus?: string;
}

export function BloodBankTopNav({
  bloodBankName = "Blood Bank Facility",
  representativeName = "Authorized Officer",
  licenseNumber = "LIC-PENDING",
  city = "Regional Network",
  approvalStatus = "PENDING",
}: BloodBankTopNavProps) {
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
          href: "/bloodbank/dashboard",
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

  const navLinks = [
    {
      href: "/bloodbank/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: pathname === "/bloodbank/dashboard" || pathname === "/bloodbank",
    },
    {
      href: "/bloodbank/inventory",
      label: "Inventory Overview",
      icon: Droplets,
      active: pathname.startsWith("/bloodbank/inventory"),
    },
    {
      href: "/bloodbank/requisitions",
      label: "Requisitions Queue",
      icon: ClipboardList,
      active: pathname.startsWith("/bloodbank/requisitions"),
    },
    {
      href: "/bloodbank/screening",
      label: "TTI Screening",
      icon: FlaskConical,
      active: pathname.startsWith("/bloodbank/screening"),
    },
    {
      href: "/bloodbank/dispatch",
      label: "Dispatch & Crossmatch",
      icon: Truck,
      active: pathname.startsWith("/bloodbank/dispatch"),
    },
    {
      href: "/bloodbank/profile",
      label: "Facility Profile",
      icon: Building,
      active: pathname.startsWith("/bloodbank/profile"),
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return {
          label: "Verified Facility",
          icon: ShieldCheck,
          className: "bg-emerald-50 text-emerald-800 border-emerald-200",
        };
      case "REJECTED":
        return {
          label: "Deactivated / Rejected",
          icon: AlertTriangle,
          className: "bg-rose-50 text-rose-800 border-rose-200",
        };
      default:
        return {
          label: "Pending Verification",
          icon: Clock,
          className: "bg-amber-50 text-amber-800 border-amber-200",
        };
    }
  };

  const statusBadge = getStatusBadge(approvalStatus);
  const StatusIcon = statusBadge.icon;

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#F3E9D1] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo & Navigation */}
        <div className="flex items-center gap-6 lg:gap-8 min-w-0">
          <Link
            href="/bloodbank/dashboard"
            className="flex items-center gap-2 group focus:outline-none shrink-0"
            aria-label="Swastya Blood Bank Portal Home"
          >
            <Logo showText={false} />
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-bold tracking-tight text-[#053845]">
                Swastya
              </span>
              <span className="text-[10px] tracking-wider uppercase font-semibold text-[#317786] bg-[#FAF6EE] border border-[#F3E9D1] px-2 py-0.5 rounded-full hidden sm:inline-block whitespace-nowrap">
                Blood Bank Portal
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav
            className="hidden md:flex items-center gap-1.5"
            aria-label="Blood Bank Primary Navigation"
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
                      : "text-slate-600 hover:text-[#053845] hover:bg-slate-50"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      link.active ? "text-[#317786]" : "text-slate-400"
                    }`}
                  />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Section: Status Badge, Notifications & Profile Dropdown */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Facility Status Badge */}
          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusBadge.className}`}
          >
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{statusBadge.label}</span>
          </div>

          {/* Notifications Dropdown */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setIsNotificationsOpen(!isNotificationsOpen);
                setIsProfileOpen(false);
              }}
              className="relative p-2 rounded-xl text-slate-500 hover:text-[#053845] hover:bg-slate-100/80 transition-colors focus:outline-none"
              aria-label="View notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#A2363A] rounded-full ring-2 ring-white" />
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-[#F3E9D1] shadow-xl py-3 z-50">
                <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm font-bold text-[#053845]">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="bg-[#A2363A]/10 text-[#A2363A] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-[#317786] hover:underline font-medium"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      No new notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <Link
                        key={n.id}
                        href={n.href}
                        onClick={() => setIsNotificationsOpen(false)}
                        className="block px-4 py-3 hover:bg-slate-50/80 transition-colors text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-[#053845]">
                            {n.title}
                          </p>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {n.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                          {n.desc}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => {
                setIsProfileOpen(!isProfileOpen);
                setIsNotificationsOpen(false);
              }}
              className="flex items-center gap-2 p-1 pl-2 sm:pr-2.5 rounded-xl border border-slate-200/80 hover:border-[#317786]/50 bg-white hover:bg-slate-50 transition-all text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-[#FAF6EE] text-[#053845] border border-[#F3E9D1] flex items-center justify-center font-bold text-xs shrink-0">
                {getInitials(bloodBankName)}
              </div>
              <div className="hidden sm:block text-left max-w-[130px] lg:max-w-[160px] truncate">
                <p className="text-xs font-bold text-[#053845] truncate">
                  {bloodBankName}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {city}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block shrink-0" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-[#F3E9D1] shadow-xl p-2 z-50">
                <div className="px-3 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-bold text-[#053845] truncate">
                    {bloodBankName}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    Lic: {licenseNumber}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Contact: {representativeName}
                  </p>
                </div>

                <div className="py-1">
                  <Link
                    href="/bloodbank/dashboard"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-slate-50"
                  >
                    <LayoutDashboard className="w-4 h-4 text-slate-400" />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    href="/bloodbank/inventory"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-slate-50"
                  >
                    <Droplets className="w-4 h-4 text-slate-400" />
                    <span>Inventory Overview</span>
                  </Link>
                  <Link
                    href="/bloodbank/profile"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-slate-50"
                  >
                    <Building className="w-4 h-4 text-slate-400" />
                    <span>Facility Profile</span>
                  </Link>
                </div>

                <div className="pt-1 border-t border-slate-100">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-[#053845] hover:bg-slate-100"
            aria-label="Toggle mobile navigation menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[#F3E9D1] bg-white px-4 pt-3 pb-6 space-y-3 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <p className="text-xs font-bold text-[#053845] truncate">
                {bloodBankName}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                Lic: {licenseNumber}
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge.className}`}
            >
              <StatusIcon className="w-3 h-3 shrink-0" />
              <span>{statusBadge.label}</span>
            </div>
          </div>

          <nav className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold ${
                    link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1]"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      link.active ? "text-[#317786]" : "text-slate-400"
                    }`}
                  />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              <LogOut className="w-4 h-4 text-rose-600" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
