"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { clearAuthToken, getAuthToken } from "@/lib/auth";

export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const resolvePortal = async () => {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      try {
        const res = await api.auth.me();
        if (!res.success || !res.user) {
          clearAuthToken();
          router.replace("/signin");
          return;
        }

        const role = res.user.role;
        if (role === "DONOR") {
          router.replace("/donor/dashboard");
        } else if (role === "REQUESTER" || (role as string) === "PATIENT") {
          router.replace("/requester/dashboard");
        } else if (role === "HOSPITAL") {
          router.replace("/hospital/dashboard");
        } else if (role === "BLOOD_BANK") {
          router.replace("/bloodbank/dashboard");
        } else {
          router.replace("/requester/dashboard");
        }
      } catch {
        clearAuthToken();
        router.replace("/signin");
      }
    };

    resolvePortal();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F3E9D1] flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl bg-white border border-[#F3E9D1] flex items-center justify-center shadow-xs">
          <Loader2 className="w-6 h-6 text-[#317786] animate-spin" />
        </div>
        <div className="space-y-0.5">
          <h1 className="font-serif text-base font-bold text-[#053845]">
            Redirecting to Your Portal
          </h1>
          <p className="text-xs text-slate-600">
            Verifying your Swastya session...
          </p>
        </div>
      </div>
    </div>
  );
}
