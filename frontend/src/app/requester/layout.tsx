"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { RequesterTopNav } from "@/components/requester/RequesterTopNav";
import { api, ApiError } from "@/lib/api";
import {
  getAuthToken,
  setStoredUser,
  clearAuthToken,
  AuthUser,
  AuthRequester,
} from "@/lib/auth";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

export default function RequesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [requester, setRequester] = useState<AuthRequester | null>(null);
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

        // Role authorization guard: allow only REQUESTER, legacy PATIENT, or ADMIN
        const isRequesterRole =
          res.user.role === "REQUESTER" ||
          (res.user.role as any) === "PATIENT" ||
          res.user.role === "ADMIN";

        if (!isRequesterRole) {
          if (res.user.role === "DONOR") {
            router.replace("/donor/dashboard");
          } else {
            router.replace("/dashboard");
          }
          return;
        }

        setStoredUser(res.user, res.donor, res.requester, undefined, undefined, { silent: true });
        setUser(res.user);
        setRequester(res.requester || null);
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
              Verifying Requester Access
            </h2>
            <p className="text-xs text-slate-500">
              Connecting securely to Swastya Clinical Network...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
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
      <RequesterTopNav
        requesterName={user.name}
        requesterEmail={user.email}
        city={requester?.city || "Regional Network"}
      />

      {/* Main Content Area */}
      <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
        {children}
      </main>

      {/* Supporting Footer */}
      <footer className="border-t border-[#F3E9D1] py-6 px-4 text-xs text-slate-500 bg-[#FAF6EE]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-[#053845]">Swastya</span>
            <span className="text-slate-300">•</span>
            <span>Clinical Blood Coordination &amp; Patient Transfusion Network</span>
          </div>
          <span className="text-slate-400">
            Emergency requisitions dispatched with certified hospital &amp; blood bank partner registries
          </span>
        </div>
      </footer>
    </div>
  );
}
