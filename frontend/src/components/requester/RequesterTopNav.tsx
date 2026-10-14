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
  ShieldAlert,
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
          time: formatTimeAgo(n.createdat),
          type:
            n.type?.toLowerCase().includes("urgent") ||
            n.type?.toLowerCase().includes("emergency")
              ? "urgent"
              : "info",
          href: "/requester/notifications",
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
    } catch {
      // Ignore error
    }
  };

  useEffect(() => {
    fetchNotifications();
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

  const navLinks = [
    {
      name: "Dashboard",
      href: "/requester/dashboard",
      icon: LayoutDashboard,
      active: pathname === "/requester/dashboard" || pathname === "/requester",
    },
    {
      name: "My Requests",
      href: "/requester/requests",
      icon: Droplets,
      active: pathname.startsWith("/requester/requests"),
    },
    {
      name: "Notifications",
      href: "/requester/notifications",
      icon: Bell,
      active: pathname === "/requester/notifications",
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      name: "Profile",
      href: "/requester/profile",
      icon: User,
      active: pathname === "/requester/profile",
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
    <header className="border-b border-[#F3E9D1] bg-white/95 backdrop-blur-md sticky top-0 z-40 flex-shrink-0 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left Brand Logo & Portal Identification */}
          <div className="flex items-center gap-6">
            <Link href="/requester/dashboard" className="flex items-center gap-2.5 group">
              <Logo showText={false} />
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl font-bold tracking-tight text-[#053845] leading-none group-hover:text-[#317786] transition-colors">
                  Swastya
                </span>
                <span className="text-[10px] tracking-wider uppercase font-semibold text-[#B94F30] bg-[#FAF6EE] border border-[#F3E9D1] px-2 py-0.5 rounded-full hidden sm:inline-block">
                  Requester Portal
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-200">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      link.active
                        ? "bg-[#317786]/10 text-[#053845] font-semibold"
                        : "text-slate-600 hover:text-[#053845] hover:bg-slate-100/70"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${link.active ? "text-[#317786]" : "text-slate-500"}`} />
                    <span>{link.name}</span>
                    {link.badge && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#B94F30] text-white">
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Icons & User Dropdown */}
          <div className="flex items-center gap-3">
            {/* Prominent Header Action: Raise Request */}
            <Link
              href="/requester/create-request"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#B94F30] hover:bg-[#a14023] shadow-xs hover:shadow transition-all"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Raise Request</span>
            </Link>

            {/* Notifications Menu */}
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-2 rounded-lg text-slate-500 hover:text-[#053845] hover:bg-slate-100 transition-colors relative cursor-pointer"
                aria-label="View notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#B94F30] ring-2 ring-white animate-pulse" />
                )}
              </button>

              {/* Notifications Popover */}
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-[#F3E9D1] shadow-lg py-3 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 pb-2.5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-serif text-sm font-bold text-[#053845]">
                        Notifications
                      </span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#B94F30]/10 text-[#B94F30]">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-medium text-[#317786] hover:underline cursor-pointer"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <Link
                          key={n.id}
                          href={n.href}
                          onClick={() => setIsNotificationsOpen(false)}
                          className="block px-4 py-3 hover:bg-[#FAF6EE]/50 transition-colors"
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                n.type === "urgent" ? "bg-[#B94F30]" : "bg-[#317786]"
                              }`}
                            />
                            <div className="flex-grow">
                              <p className="text-xs font-semibold text-[#053845] leading-snug">
                                {n.title}
                              </p>
                              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                {n.desc}
                              </p>
                              <span className="text-[10px] text-slate-400 mt-1 block">
                                {n.time}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="py-8 text-center px-4">
                        <Bell className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-medium text-slate-600">No new notifications</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Updates on matching donors and blood bank reserves will appear here.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 px-4 border-t border-slate-100 text-center">
                    <Link
                      href="/requester/notifications"
                      onClick={() => setIsNotificationsOpen(false)}
                      className="text-xs font-semibold text-[#317786] hover:underline"
                    >
                      View all notification logs →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            {/* Profile Menu Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full hover:bg-slate-100 transition-all cursor-pointer border border-transparent hover:border-slate-200"
                aria-label="User menu"
              >
                <div className="w-8 h-8 rounded-full bg-[#B94F30]/10 text-[#B94F30] font-bold text-xs flex items-center justify-center border border-[#B94F30]/30 shadow-2xs">
                  {getInitials(requesterName)}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-bold text-[#053845] leading-none max-w-[120px] truncate">
                    {requesterName}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5 max-w-[120px] truncate">
                    {city}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {/* Profile Dropdown Popover */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-[#F3E9D1] shadow-lg py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-bold text-[#053845] truncate">{requesterName}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{requesterEmail}</p>
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#B94F30]/10 text-[#B94F30] text-[10px] font-bold uppercase tracking-wider">
                      Requester
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/requester/profile"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-[#FAF6EE] hover:text-[#053845] transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Requester Profile</span>
                    </Link>
                    <Link
                      href="/requester/requests"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-[#FAF6EE] hover:text-[#053845] transition-colors"
                    >
                      <Droplets className="w-3.5 h-3.5 text-slate-400" />
                      <span>My Blood Requests</span>
                    </Link>
                    <Link
                      href="/requester/create-request"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-[#FAF6EE] hover:text-[#053845] transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-[#B94F30]" />
                      <span className="font-semibold text-[#B94F30]">Raise Blood Request</span>
                    </Link>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-[#A2363A] hover:bg-[#fdf2f2] transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-[#053845] hover:bg-slate-100 md:hidden cursor-pointer"
              aria-label="Toggle navigation"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[#F3E9D1] bg-white px-4 pt-3 pb-5 space-y-2 animate-in slide-in-from-top-2 duration-150">
          <div className="p-3 bg-[#FAF6EE] rounded-xl border border-[#F3E9D1] mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#B94F30]/15 text-[#B94F30] font-bold text-xs flex items-center justify-center">
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
            href="/requester/create-request"
            onClick={() => setIsMobileMenuOpen(false)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-[#B94F30] shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Raise Blood Request</span>
          </Link>

          <div className="space-y-1 pt-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium ${
                    link.active
                      ? "bg-[#317786]/10 text-[#053845] font-semibold"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${link.active ? "text-[#317786]" : "text-slate-400"}`} />
                    <span>{link.name}</span>
                  </div>
                  {link.badge && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#B94F30] text-white">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-[#A2363A] hover:bg-[#fdf2f2] rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
