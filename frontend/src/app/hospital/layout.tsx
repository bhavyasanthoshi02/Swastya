"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { HospitalTopNav } from "@/components/hospital/HospitalTopNav";
import { api, ApiError } from "@/lib/api";
import {
  getAuthToken,
  setStoredUser,
  clearAuthToken,
  AuthUser,
  AuthHospital,
} from "@/lib/auth";
import { Loader2, AlertCircle, Building2 } from "lucide-react";
import Link from "next/link";

export default function HospitalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hospital, setHospital] = useState<AuthHospital | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const inFlightRef = useRef(false);

  const verifyAndLoadProfile = useCallback(async () => {
    if (inFlightRef.current) return;
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setHospital(null);
      setIsVerifying(false);
      router.replace("/signin");
      return;
    }

    inFlightRef.current = true;
    try {
      const res = await api.auth.me();
      if (!res.success || !res.user) {
        clearAuthToken();
        setUser(null);
        setHospital(null);
        router.replace("/signin");
        return;
      }

      // Role authorization guard: allow only HOSPITAL or ADMIN
      const isHospitalRole = res.user.role === "HOSPITAL" || res.user.role === "ADMIN";

      if (!isHospitalRole) {
        if (res.user.role === "DONOR") {
          router.replace("/donor/dashboard");
        } else if (res.user.role === "REQUESTER" || (res.user.role as string) === "PATIENT") {
          router.replace("/requester/dashboard");
        } else if (res.user.role === "BLOOD_BANK") {
          router.replace("/bloodbank/dashboard");
        } else {
          router.replace("/signin");
        }
        return;
      }

      setStoredUser(res.user, res.donor, res.requester, res.hospital, res.bloodbank, { silent: true });
      setUser(res.user);
      setHospital(res.hospital || null);
    } catch (err: unknown) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearAuthToken();
        setUser(null);
        setHospital(null);
        router.replace("/signin");
      }
    } finally {
      inFlightRef.current = false;
      setIsVerifying(false);
    }
  }, [router]);

  useEffect(() => {
    verifyAndLoadProfile();

    const handleAuthChange = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail?.reason === "profile-sync") return;
      verifyAndLoadProfile();
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === null || event.key === "swastya_auth_token" || event.key === "swastya_auth_user") {
        verifyAndLoadProfile();
      }
    };

    window.addEventListener("swastya-auth-change", handleAuthChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("swastya-auth-change", handleAuthChange);
      window.removeEventListener("storage", handleStorageChange);
    };
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
              Verifying Hospital Access
            </h2>
            <p className="text-xs text-slate-500">
              Connecting securely to Swastya Clinical Coordination Network...
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
      <HospitalTopNav
        hospitalName={hospital?.hospitalname || user.name || "Medical Care Facility"}
        representativeName={hospital?.contactpersonname || user.name || "Authorized Coordinator"}
        registrationNumber={hospital?.registrationnumber || "UNLINKED-ACCOUNT"}
        city={hospital?.city || "Regional Network"}
        approvalStatus={hospital?.approvalstatus || "PENDING"}
      />

      {/* Legacy / Unlinked Profile Warning Banner */}
      {!hospital && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-xs text-amber-800">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Unlinked Hospital Account:</strong> Your user account does not have a linked hospital facility record yet.
              </span>
            </div>
            <Link
              href="/hospital/profile"
              className="inline-flex items-center gap-1 font-semibold text-amber-900 underline hover:text-amber-700 shrink-0"
            >
              <span>Setup Facility Profile</span>
            </Link>
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
          <span>Swastya Hospital Coordination Network &copy; {new Date().getFullYear()}</span>
          <span className="text-[11px] text-slate-400">
            Encrypted Clinical Data Transmission &bull; ISO-Compliant Blood Traceability
          </span>
        </div>
      </footer>
    </div>
  );
}
