"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Lock,
  ArrowRight,
  RefreshCw,
  Droplets,
} from "lucide-react";
import { api } from "@/lib/api";
import { setAuthToken, setStoredUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";

function ActivateDonorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isVerifying, setIsVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsVerifying(false);
      setErrorMessage("Missing activation token. Please check the link provided by your hospital.");
      return;
    }

    const verify = async () => {
      try {
        const res = await api.auth.verifyActivationToken(token);
        if (res.success && res.valid) {
          setTokenValid(true);
          setDonorName(res.user?.name || "Donor");
          setDonorEmail(res.user?.email || "");
        } else {
          setErrorMessage(res.message || "This activation link is invalid or has already been used.");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Invalid or expired activation link.");
      } finally {
        setIsVerifying(false);
      }
    };

    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await api.auth.activateDonor({
        token,
        password,
      });

      if (res.success) {
        setSuccess(true);
        if (res.token && res.user) {
          setAuthToken(res.token);
          setStoredUser(res.user, res.donor || null, null, null);
          setTimeout(() => {
            router.push("/donor/dashboard");
          }, 2000);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to activate account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h2 className="mt-4 font-serif text-2xl sm:text-3xl font-bold text-[#053845]">
          Activate Your Donor Account
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-slate-600">
          Swastya Clinical Donor Network
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-[#F3E9D1] sm:px-10">
          {isVerifying ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-[#317786]" />
              <p className="text-sm font-medium text-slate-600">
                Verifying your secure invitation token...
              </p>
            </div>
          ) : success ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-800">
                Account Activated!
              </h3>
              <p className="text-xs text-slate-600">
                Welcome to Swastya, <strong>{donorName}</strong>. You are being redirected to your donor portal...
              </p>
              <div className="pt-2">
                <Link
                  href="/donor/dashboard"
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#053845] hover:underline"
                >
                  Go to Dashboard Now <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : tokenValid ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#F3E9D1] text-xs space-y-1">
                <div className="text-slate-500">Activating Account for:</div>
                <div className="font-bold text-[#053845] text-sm">{donorName}</div>
                {donorEmail && <div className="text-slate-600">{donorEmail}</div>}
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <p className="text-xs text-slate-500">
                Please establish your private password to activate your account. You will use this password to sign in going forward.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Choose New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#317786]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-[#053845] hover:bg-[#317786] disabled:opacity-40 transition-colors shadow-xs"
              >
                {isSubmitting ? "Activating Account..." : "Set Password & Complete Activation"}
              </button>
            </form>
          ) : (
            <div className="py-6 text-center space-y-4">
              <div className="w-12 h-12 bg-rose-50 border border-rose-200 rounded-full flex items-center justify-center mx-auto text-rose-600">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-lg font-bold text-slate-800">
                Invalid Activation Link
              </h3>
              <p className="text-xs text-slate-600 max-w-xs mx-auto">
                {errorMessage || "This activation link is invalid, expired, or has already been used."}
              </p>
              <div className="pt-2">
                <Link
                  href="/signin"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#053845] bg-[#FAF6EE] hover:bg-[#F3E9D1] transition-colors"
                >
                  Return to Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActivateDonorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF6EE] flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-[#317786]" />
        </div>
      }
    >
      <ActivateDonorContent />
    </Suspense>
  );
}
