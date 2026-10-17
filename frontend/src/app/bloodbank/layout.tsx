"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BloodBankTopNav } from "@/components/bloodbank/BloodBankTopNav";
import { api } from "@/lib/api";
import {
  getAuthToken,
  setStoredUser,
  clearAuthToken,
  AuthUser,
  AuthBloodBank,
} from "@/lib/auth";
import { Loader2, AlertCircle, Clock, Building } from "lucide-react";
import Link from "next/link";

export default function BloodBankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bloodbank, setBloodbank] = useState<AuthBloodBank | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  const verifyAndLoadProfile = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      router.replace("/signin?redirect=/bloodbank/dashboard");
      return;
    }

    try {
      const res = await api.auth.me();
      if (!res.success || !res.user) {
        clearAuthToken();
        router.replace("/signin?redirect=/bloodbank/dashboard");
        return;
      }

      // Role authorization guard: allow only BLOOD_BANK or ADMIN
      const isBloodBankRole = res.user.role === "BLOOD_BANK" || res.user.role === "ADMIN";

      if (!isBloodBankRole) {
        if (res.user.role === "DONOR") {
          router.replace("/donor/dashboard");
        } else if (res.user.role === "REQUESTER" || (res.user.role as any) === "PATIENT") {
          router.replace("/requester/dashboard");
        } else if (res.user.role === "HOSPITAL") {
          router.replace("/hospital/dashboard");
        } else {
          router.replace("/dashboard");
        }
        return;
      }

      setStoredUser(res.user, res.donor, res.requester, res.hospital, res.bloodbank);
      setUser(res.user);
      setBloodbank(res.bloodbank || null);

      // If bloodbank profile is not on /auth/me yet, try fetching from /bloodbanks/me
      if (!res.bloodbank && isBloodBankRole) {
        try {
          const profileRes = await api.bloodbank.getProfile();
          if (profileRes.success && profileRes.bloodbank) {
            setBloodbank(profileRes.bloodbank);
            setStoredUser(res.user, res.donor, res.requester, res.hospital, profileRes.bloodbank);
          }
        } catch {
          // Unlinked blood bank account
        }
      }
    } catch {
      clearAuthToken();
      router.replace("/signin?redirect=/bloodbank/dashboard");
    } finally {
      setIsVerifying(false);
    }
  }, [router]);

  useEffect(() => {
    verifyAndLoadProfile();

    const handleAuthChange = () => {
      verifyAndLoadProfile();
    };

    window.addEventListener("swastya-auth-change", handleAuthChange);
    return () => window.removeEventListener("swastya-auth-change", handleAuthChange);
  }, [verifyAndLoadProfile]);

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white border border-[#F3E9D1] flex items-center justify-center shadow-xs">
            <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
          </div>
          <div className="space-y-0.5">
            <h2 className="font-serif text-base font-bold text-[#053845]">
              Verifying Blood Bank Access
            </h2>
            <p className="text-xs text-slate-500">
              Connecting securely to Swastya Blood Storage & Distribution Network...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845] flex flex-col">
      {/* Top Navigation Bar */}
      <BloodBankTopNav
        bloodBankName={bloodbank?.bloodbankname || user.name || "Blood Center"}
        representativeName={bloodbank?.contactpersonname || user.name || "Authorized Officer"}
        licenseNumber={bloodbank?.licensenumber || "UNLINKED-ACCOUNT"}
        city={bloodbank?.city || "Regional Network"}
        approvalStatus={bloodbank?.approvalstatus || "PENDING"}
      />

      {/* Unlinked Profile Warning Banner */}
      {!bloodbank && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-xs text-amber-800">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Unlinked Blood Bank Account:</strong> Your user account does not have a linked blood bank facility record yet.
              </span>
            </div>
            <Link
              href="/bloodbank/profile"
              className="inline-flex items-center gap-1 font-semibold text-amber-900 underline hover:text-amber-700 shrink-0"
            >
              <span>Setup Facility Profile</span>
            </Link>
          </div>
        </div>
      )}

      {/* Pending Approval Banner */}
      {bloodbank && bloodbank.approvalstatus === "PENDING" && (
        <div className="bg-sky-50 border-b border-sky-200 px-4 py-2.5 text-xs text-sky-800">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#317786] shrink-0" />
            <span>
              <strong>Facility Verification in Progress:</strong> Your blood bank registration is currently under administrative review. Read-only inventory overview and profile updates remain available.
            </span>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Clean Minimalist Clinical Footer */}
      <footer className="border-t border-[#F3E9D1] bg-white/60 py-4 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Swastya Blood Bank Network &copy; {new Date().getFullYear()}</span>
          <span className="text-[11px] text-slate-400">
            Certified Blood Storage Infrastructure &bull; Traceable Distribution Records
          </span>
        </div>
      </footer>
    </div>
  );
}
