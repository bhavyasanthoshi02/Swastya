"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { getAuthToken, clearAuthToken, AuthUser } from "@/lib/auth";
import { Loader2, ShieldCheck, MessageSquare, LogOut } from "lucide-react";
import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const inFlightRef = useRef(false);

  const verifyAndLoadAdmin = useCallback(async () => {
    if (inFlightRef.current) return;
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setIsVerifying(false);
      router.replace("/signin");
      return;
    }

    inFlightRef.current = true;
    try {
      const res = await api.auth.me();
      if (!res.success || !res.user) {
        clearAuthToken();
        router.replace("/signin");
        return;
      }

      if (res.user.role !== "ADMIN") {
        if (res.user.role === "HOSPITAL") {
          router.replace("/hospital/dashboard");
        } else if (res.user.role === "BLOOD_BANK") {
          router.replace("/bloodbank/dashboard");
        } else if (res.user.role === "DONOR") {
          router.replace("/donor/dashboard");
        } else {
          router.replace("/requester/dashboard");
        }
        return;
      }

      setUser(res.user);
    } catch {
      clearAuthToken();
      router.replace("/signin");
    } finally {
      setIsVerifying(false);
      inFlightRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    verifyAndLoadAdmin();
  }, [verifyAndLoadAdmin]);

  const handleSignOut = () => {
    clearAuthToken();
    router.replace("/signin");
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-[#317786] animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Verifying administrator authorization...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-slate-900 flex flex-col">
      {/* Admin Top Navigation */}
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#F3E9D1] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link href="/admin/sms" className="flex items-center gap-2 shrink-0">
              <Logo />
              <span className="px-2 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold uppercase rounded-md tracking-wider hidden sm:inline-block">
                Admin Console
              </span>
            </Link>
            <nav className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/admin/sms"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#FAF6EE] text-[#317786] font-semibold text-xs rounded-lg border border-[#F3E9D1] truncate"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Custom </span>SMS Dispatch
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="max-w-[100px] sm:max-w-none truncate">{user?.name || "Admin"}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
