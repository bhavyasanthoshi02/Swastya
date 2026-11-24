"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Droplets,
  ClipboardList,
  FlaskConical,
  Truck,
  TrendingUp,
  Building,
  Building2,
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  X,
  ExternalLink,
  Tent,
  Wrench,
  MessageSquare,
  SlidersHorizontal,
  Layers,
  Calendar,
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
  approvalStatus = "APPROVED",
}: BloodBankTopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isOperationsOpen, setIsOperationsOpen] = useState(false);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
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
  const operationsRef = useRef<HTMLDivElement>(null);
  const assetsRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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
          href: n.requestid ? `/bloodbank/requisitions` : "/bloodbank/dashboard",
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
    setIsOperationsOpen(false);
    setIsAssetsOpen(false);
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
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (operationsRef.current && !operationsRef.current.contains(event.target as Node)) {
        setIsOperationsOpen(false);
      }
      if (assetsRef.current && !assetsRef.current.contains(event.target as Node)) {
        setIsAssetsOpen(false);
      }
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        setIsChatOpen(false);
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
        setIsOperationsOpen(false);
        setIsAssetsOpen(false);
        setIsChatOpen(false);
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
    setIsOperationsOpen(false);
    setIsAssetsOpen(false);
    setIsChatOpen(false);
  }, [pathname]);

  // Primary 3 core navigation links
  const coreLinks = [
    {
      href: "/bloodbank/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      active: pathname === "/bloodbank/dashboard" || pathname === "/bloodbank",
    },
    {
      href: "/bloodbank/inventory",
      label: "Inventory",
      icon: Droplets,
      active: pathname.startsWith("/bloodbank/inventory"),
    },
    {
      href: "/bloodbank/requisitions",
      label: "Requisitions",
      icon: ClipboardList,
      active: pathname.startsWith("/bloodbank/requisitions"),
    },
  ];

  // Group 1: Clinical Processing & Logistics Operations
  const operationLinks = [
    {
      href: "/bloodbank/screening",
      label: "Screening & Testing",
      desc: "Serological screening, viral markers & blood qualification",
      icon: FlaskConical,
      active: pathname.startsWith("/bloodbank/screening"),
    },
    {
      href: "/bloodbank/dispatch",
      label: "Dispatch & Logistics",
      desc: "Cold-chain hospital delivery, custody logs & transit tracking",
      icon: Truck,
      active: pathname.startsWith("/bloodbank/dispatch"),
    },
  ];

  // Group 2: Outreach, Assets & Regional Intelligence
  const assetLinks = [
    {
      href: "/bloodbank/predictor",
      label: "AI Shortage Predictor",
      desc: "7/14/30-day shortage forecasts, depletion runway & AI insights",
      icon: TrendingUp,
      active: pathname.startsWith("/bloodbank/predictor"),
    },
    {
      href: "/bloodbank/camps",
      label: "Blood Donation Camps",
      desc: "Community drives, schedule dates & voluntary donor registration",
      icon: Tent,
      active: pathname.startsWith("/bloodbank/camps"),
    },
    {
      href: "/bloodbank/camp-planner",
      label: "Smart Camp Planner",
      desc: "AI-driven location & date recommendations for blood drives",
      icon: Calendar,
      active: pathname.startsWith("/bloodbank/camp-planner"),
    },
    {
      href: "/bloodbank/equipment",
      label: "Equipment & Calibration",
      desc: "Asset registry, maintenance records & calibration compliance",
      icon: Wrench,
      active: pathname.startsWith("/bloodbank/equipment"),
    },
  ];

  // Group 3: Dedicated Real-time Chat Navigation
  const chatLinks = [
    {
      href: "/bloodbank/messages",
      label: "Blood Bank Chat",
      desc: "Direct in-app messaging with registered peer blood banks",
      icon: Droplets,
      active: pathname === "/bloodbank/messages",
    },
    {
      href: "/bloodbank/messages/hospitals",
      label: "Hospital Chat",
      desc: "Cross-organization communication with partner hospitals",
      icon: Building2,
      active: pathname.startsWith("/bloodbank/messages/hospitals"),
    },
    {
      href: "/bloodbank/sms",
      label: "Custom SMS",
      desc: "Send personalized broadcast & emergency donor SMS alerts",
      icon: MessageSquare,
      active: pathname.startsWith("/bloodbank/sms"),
    },
  ];

  const isOperationsActive = operationLinks.some((l) => l.active);
  const isAssetsActive = assetLinks.some((l) => l.active);
  const isChatActive = chatLinks.some((l) => l.active);

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 lg:gap-6">
        {/* Left: Brand Logo & Navigation */}
        <div className="flex items-center gap-4 lg:gap-7 min-w-0">
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

          {/* Desktop Navigation Links (Grouped & Spacious) */}
          <nav
            className="hidden md:flex items-center gap-1 lg:gap-1.5"
            aria-label="Blood Bank Primary Navigation"
          >
            {/* 1. Core Workflow Links */}
            {coreLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs font-bold"
                      : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]/70"
                    }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{link.label}</span>
                </Link>
              );
            })}

            {/* 2. Operations Dropdown (Screening + Dispatch) */}
            <div className="relative" ref={operationsRef}>
              <button
                type="button"
                onClick={() => {
                  setIsOperationsOpen(!isOperationsOpen);
                  setIsAssetsOpen(false);
                  setIsProfileOpen(false);
                  setIsNotificationsOpen(false);
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${isOperationsActive || isOperationsOpen
                    ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs font-bold"
                    : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]/70"
                  }`}
                aria-expanded={isOperationsOpen}
                aria-label="Operations Menu"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>Operations</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${isOperationsOpen ? "rotate-180" : ""
                    }`}
                />
              </button>

              {isOperationsOpen && (
                <div className="absolute left-0 mt-2 w-80 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-[#F3E9D1]/50 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Processing & Logistics
                    </span>
                  </div>
                  <div className="space-y-1">
                    {operationLinks.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsOperationsOpen(false)}
                          className={`flex items-start gap-3 p-2.5 rounded-xl transition-all ${item.active
                              ? "bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845]"
                              : "hover:bg-[#FAF6EE]/60 text-slate-700"
                            }`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center shrink-0 mt-0.5">
                            <ItemIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <span className="block text-xs font-bold text-[#053845]">
                              {item.label}
                            </span>
                            <span className="block text-[11px] text-slate-500 leading-tight">
                              {item.desc}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Outreach & Assets Dropdown (Camps + Equipment + Custom SMS) */}
            <div className="relative" ref={assetsRef}>
              <button
                type="button"
                onClick={() => {
                  setIsAssetsOpen(!isAssetsOpen);
                  setIsOperationsOpen(false);
                  setIsProfileOpen(false);
                  setIsNotificationsOpen(false);
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${isAssetsActive || isAssetsOpen
                    ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs font-bold"
                    : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]/70"
                  }`}
                aria-expanded={isAssetsOpen}
                aria-label="Outreach and Facility Assets Menu"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Outreach & Assets</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${isAssetsOpen ? "rotate-180" : ""
                    }`}
                />
              </button>

              {isAssetsOpen && (
                <div className="absolute left-0 mt-2 w-84 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-[#F3E9D1]/50 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Community Drives, Facility & AI
                    </span>
                  </div>
                  <div className="space-y-1">
                    {assetLinks.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsAssetsOpen(false)}
                          className={`flex items-start gap-3 p-2.5 rounded-xl transition-all ${item.active
                              ? "bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845]"
                              : "hover:bg-[#FAF6EE]/60 text-slate-700"
                            }`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center shrink-0 mt-0.5">
                            <ItemIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <span className="block text-xs font-bold text-[#053845]">
                              {item.label}
                            </span>
                            <span className="block text-[11px] text-slate-500 leading-tight">
                              {item.desc}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Chat Dropdown Menu (Blood Bank & Hospital Direct Messaging) */}
            <div className="relative" ref={chatRef}>
              <button
                type="button"
                onClick={() => {
                  setIsChatOpen(!isChatOpen);
                  setIsAssetsOpen(false);
                  setIsOperationsOpen(false);
                  setIsProfileOpen(false);
                  setIsNotificationsOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${isChatActive || isChatOpen
                    ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] shadow-2xs font-bold"
                    : "text-slate-600 hover:text-[#053845] hover:bg-[#FAF6EE]/70"
                  }`}
                aria-expanded={isChatOpen}
                aria-label="Chat and Direct Messaging Menu"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>Chat</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${isChatOpen ? "rotate-180" : ""
                    }`}
                />
              </button>

              {isChatOpen && (
                <div className="absolute left-0 mt-2 w-80 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-[#F3E9D1]/50 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      In-App Peer & Hospital Messaging
                    </span>
                  </div>
                  <div className="space-y-1">
                    {chatLinks.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsChatOpen(false)}
                          className={`flex items-start gap-3 p-2.5 rounded-xl transition-all ${item.active
                              ? "bg-[#FAF6EE] border border-[#F3E9D1] text-[#053845]"
                              : "hover:bg-[#FAF6EE]/60 text-slate-700"
                            }`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center shrink-0 mt-0.5">
                            <ItemIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <span className="block text-xs font-bold text-[#053845]">
                              {item.label}
                            </span>
                            <span className="block text-[11px] text-slate-500 leading-tight">
                              {item.desc}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Right Section: Notifications & Profile Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Notifications Dropdown */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setIsNotificationsOpen(!isNotificationsOpen);
                setIsProfileOpen(false);
                setIsOperationsOpen(false);
                setIsAssetsOpen(false);
              }}
              className="relative p-2 rounded-xl text-slate-500 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors focus:outline-none cursor-pointer"
              aria-label="View notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#A2363A] rounded-full ring-2 ring-white" />
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xl py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 pb-2 border-b border-[#F3E9D1]/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm font-bold text-[#053845]">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="bg-[#A2363A]/10 text-[#A2363A] text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-[#317786] hover:underline font-medium cursor-pointer"
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
                        className="block px-4 py-3 hover:bg-[#FAF6EE]/60 transition-colors text-left"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-[#053845]">
                            {n.title}
                          </p>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {n.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                          {n.desc}
                        </p>
                      </Link>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-[#F3E9D1]/70 mt-1 text-center">
                  <Link
                    href="/bloodbank/requisitions"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-xs font-semibold text-[#053845] hover:text-[#317786] transition-colors inline-flex items-center gap-1"
                  >
                    <span>View all requisitions</span>
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
                setIsOperationsOpen(false);
                setIsAssetsOpen(false);
              }}
              className="flex items-center gap-2 p-1 rounded-full sm:rounded-xl hover:bg-[#FAF6EE] border border-transparent hover:border-[#F3E9D1] transition-all focus:outline-none cursor-pointer"
              aria-label="Facility Profile Menu"
              aria-expanded={isProfileOpen}
            >
              <div className="w-8 h-8 rounded-full bg-[#053845] text-white flex items-center justify-center text-xs font-bold font-serif shadow-xs">
                {getInitials(bloodBankName)}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block mr-1" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-[#F3E9D1] shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2.5 bg-[#FAF6EE]/70 rounded-xl mb-1.5 border border-[#F3E9D1]/60">
                  <span className="block text-xs font-bold text-[#053845] truncate">
                    {bloodBankName}
                  </span>
                  <span className="block text-[11px] text-slate-600 truncate">
                    {representativeName}
                  </span>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span className="font-mono truncate">{licenseNumber}</span>
                    <span className="text-[#317786] font-medium">{city}</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <Link
                    href="/bloodbank/profile"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <Building className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Facility Profile</span>
                  </Link>
                  <Link
                    href="/bloodbank/inventory"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <Droplets className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Blood Inventory</span>
                  </Link>
                  <Link
                    href="/bloodbank/requisitions"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Requisitions</span>
                  </Link>
                  <Link
                    href="/bloodbank/predictor"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-[#053845] hover:bg-[#FAF6EE] transition-colors"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-[#317786]" />
                    <span>Shortage Predictor</span>
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
        <div className="md:hidden border-b border-[#F3E9D1] bg-white px-4 pt-2 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-150">
          <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#F3E9D1]">
            <span className="block text-xs font-bold text-[#053845] truncate">
              {bloodBankName}
            </span>
            <span className="block text-[11px] text-slate-500">
              {city} &bull; {licenseNumber}
            </span>
          </div>

          {/* 1. Core Section */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
              Core Workflows
            </span>
            {coreLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] font-bold"
                      : "text-slate-600 hover:bg-[#FAF6EE]/70"
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-[#317786]" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* 2. Operations Section */}
          <div className="space-y-1 pt-1 border-t border-[#F3E9D1]/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
              Clinical Operations
            </span>
            {operationLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] font-bold"
                      : "text-slate-600 hover:bg-[#FAF6EE]/70"
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-[#317786]" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* 3. Outreach & Assets Section */}
          <div className="space-y-1 pt-1 border-t border-[#F3E9D1]/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
              Outreach, Assets & AI
            </span>
            {assetLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] font-bold"
                      : "text-slate-600 hover:bg-[#FAF6EE]/70"
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-[#317786]" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* 4. Chat Section */}
          <div className="space-y-1 pt-1 border-t border-[#F3E9D1]/50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
              In-App Chat
            </span>
            {chatLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold ${link.active
                      ? "text-[#053845] bg-[#FAF6EE] border border-[#F3E9D1] font-bold"
                      : "text-slate-600 hover:bg-[#FAF6EE]/70"
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-[#317786]" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#F3E9D1]/70">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
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
