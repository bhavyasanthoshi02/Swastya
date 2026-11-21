"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { DonorTopNav } from "@/components/donor/DonorTopNav";
import { api, ApiError } from "@/lib/api";
import { getAuthToken, setStoredUser, clearAuthToken } from "@/lib/auth";
import { mapBackendDonorToProfile } from "@/lib/mappers";
import { DonorProfile } from "@/components/donor/DonorTypes";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

export default function DonorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [transientError, setTransientError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const verifyAndLoadProfile = useCallback(async () => {
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const token = getAuthToken();
    if (!token) {
      setIsVerifying(false);
      router.replace("/signin");
      return;
    }

    const run = (async () => {
      try {
        setTransientError(null);
        const res = await api.auth.me();
        if (!res.success || !res.user) {
          clearAuthToken();
          router.replace("/signin");
          return;
        }

        // Role authorization guard: Do not route non-donors to the donor portal
        if (res.user.role !== "DONOR" && res.user.role !== "ADMIN") {
          router.replace("/dashboard");
          return;
        }

        setStoredUser(res.user, res.donor, undefined, undefined, undefined, { silent: true });

        if (res.donor) {
          const mapped = mapBackendDonorToProfile(res.donor, res.user);
          setProfile(mapped);
        } else {
          // Fallback for admin or account without donor record yet
          setProfile({
            name: res.user.name,
            bloodGroup: "O+",
            phone: res.user.phonenumber || "+91 Contact",
            email: res.user.email,
            location: res.user?.city ? `${res.user.city}, ${res.user.state || ""}` : "Location unavailable",
            city: res.user?.city || "Location unavailable",
            state: res.user?.state || "",
            pincode: res.user?.pincode || "",
            availability: "Available",
            eligibility: "Eligible",
            lastDonationDate: "No Prior Donations",
            daysSinceLastDonation: 90,
            matchingCount: 0,
            nearbyCount: 0,
            totalDonations: 0,
            livesSaved: 0,
            donorId: "SW-DON-ADM",
            radiusKm: 15,
            emergencySms: false,
            quietHours: false,
          });
        }
      } catch (err: any) {
        const status = err instanceof ApiError ? err.status : err?.status;
        if (status === 401 || status === 403) {
          clearAuthToken();
          router.replace("/signin");
        } else {
          setTransientError(
            err?.message || "Temporary connection error while verifying your session. Please retry."
          );
        }
      } finally {
        setIsVerifying(false);
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = run;
    return run;
  }, [router]);

  useEffect(() => {
    verifyAndLoadProfile();

    const handleAuthChange = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (detail?.reason === "profile-sync") {
        return;
      }
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
              Verifying Voluntary Donor Access
            </h2>
            <p className="text-xs text-slate-500">
              Connecting securely to Swastya Clinical Network...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    if (transientError) {
      return (
        <div className="min-h-screen bg-[#FAF6EE] flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#F3E9D1] p-6 max-w-md w-full text-center space-y-4 shadow-xs">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <div className="space-y-1">
              <h2 className="font-serif text-base font-bold text-[#053845]">Connection Interrupted</h2>
              <p className="text-xs text-slate-600">{transientError}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsVerifying(true);
                verifyAndLoadProfile();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#053845] text-white text-xs font-semibold hover:bg-[#03252e] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Verification</span>
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845] flex flex-col">
      {/* Top Navigation */}
      <DonorTopNav
        donorName={profile.name}
        bloodGroup={profile.bloodGroup}
        location={profile.location}
        availability={profile.availability}
      />

      {/* Main Content Area */}
      <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        {children}
      </main>

      {/* Subtle Supporting Footer */}
      <footer className="border-t border-[#F3E9D1] py-6 px-4 text-xs text-slate-500 bg-[#FAF6EE]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-[#053845]">Swastya</span>
            <span className="text-slate-300">•</span>
            <span>Ethical Voluntary Blood Coordination System</span>
          </div>
          <span className="text-slate-400">
            Emergency response verified by licensed regional blood banks &amp; transfusion units
          </span>
        </div>
      </footer>
    </div>
  );
}
