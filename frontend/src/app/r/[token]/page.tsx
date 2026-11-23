"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Clock, CheckCircle2, ShieldAlert, ArrowRight, UserCheck, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { getAuthToken, getStoredUser, clearAuthToken } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export default function ActionTokenRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const rawTokenParam = Array.isArray(params?.token) ? params.token[0] : (params?.token as string);

  const [isLoading, setIsLoading] = useState(true);
  const [errorType, setErrorType] = useState<"EXPIRED" | "ALREADY_USED" | "USER_MISMATCH" | "INVALID" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [tokenMeta, setTokenMeta] = useState<any>(null);

  useEffect(() => {
    async function resolveAndRedirect() {
      if (!rawTokenParam) {
        setErrorType("INVALID");
        setErrorMessage("Action link is missing or malformed.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // 1. Resolve token metadata (non-consuming peek)
        const res = await api.actionRedirect.resolve(rawTokenParam);

        if (!res.success) {
          if (res.code === "EXPIRED") {
            setErrorType("EXPIRED");
            setErrorMessage(res.message || "This secure SMS link has expired. Links expire for patient privacy and security.");
          } else if (res.code === "ALREADY_USED") {
            setErrorType("ALREADY_USED");
            setErrorMessage(res.message || "This secure SMS link has already been used. Single-use links cannot be replayed.");
          } else {
            setErrorType("INVALID");
            setErrorMessage(res.message || "This secure SMS link is invalid or no longer active.");
          }
          setIsLoading(false);
          return;
        }

        setTokenMeta(res);

        // 2. Check if user is logged in
        const authToken = getAuthToken();
        const currentUser = getStoredUser();

        if (!authToken || !currentUser) {
          // Not logged in -> forward to signin with return URL
          router.replace(`/signin?redirect=/r/${encodeURIComponent(rawTokenParam)}`);
          return;
        }

        // 3. Check intended user matching (prevent unauthorized account access via forwarded links)
        if (res.intendedUserId && currentUser.userid !== res.intendedUserId && currentUser.role !== "ADMIN") {
          setErrorType("USER_MISMATCH");
          setErrorMessage(`This notification link was issued specifically for recipient account ID ending in ...${res.intendedUserId.slice(-6)}. You are currently signed in as "${currentUser.name || currentUser.email}".`);
          setIsLoading(false);
          return;
        }

        // 4. Consume token and redirect to target page
        const consumeRes = await api.actionRedirect.consume(rawTokenParam);
        if (consumeRes.success && consumeRes.redirectUrl) {
          router.replace(consumeRes.redirectUrl);
        } else {
          router.replace(res.redirectUrl || "/dashboard");
        }
      } catch (err: any) {
        setIsLoading(false);
        if (err instanceof ApiError) {
          if (err.status === 410) {
            setErrorType("EXPIRED");
            setErrorMessage(err.data?.message || "This secure SMS link has expired.");
          } else if (err.status === 409) {
            setErrorType("ALREADY_USED");
            setErrorMessage(err.data?.message || "This secure SMS link has already been used.");
          } else if (err.status === 403) {
            setErrorType("USER_MISMATCH");
            setErrorMessage(err.data?.message || "Account mismatch. Please log in with the intended recipient account.");
          } else {
            setErrorType("INVALID");
            setErrorMessage(err.message || "Failed to resolve secure action link.");
          }
        } else {
          setErrorType("INVALID");
          setErrorMessage(err?.message || "An unexpected error occurred while resolving link.");
        }
      }
    }

    resolveAndRedirect();
  }, [rawTokenParam, router]);

  const handleSwitchAccount = () => {
    clearAuthToken();
    router.push(`/signin?redirect=/r/${encodeURIComponent(rawTokenParam)}`);
  };

  return (
    <div className="min-h-screen bg-[#FAF6EE] flex flex-col justify-between items-center p-4">
      {/* Header */}
      <header className="w-full max-w-md py-6 flex justify-center">
        <Logo />
      </header>

      {/* Main Content */}
      <main className="w-full max-w-md bg-white border border-[#F3E9D1] rounded-2xl shadow-sm p-6 sm:p-8 text-center">
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-10 h-10 text-[#317786] animate-spin" />
            <h2 className="text-lg font-semibold text-slate-800">Verifying secure link...</h2>
            <p className="text-xs text-slate-500 max-w-xs">
              Validating your encrypted token and routing you to Swastya.
            </p>
          </div>
        )}

        {!isLoading && errorType === "EXPIRED" && (
          <div className="space-y-5">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-200">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Link Has Expired</h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/signin"
                className="w-full py-2.5 px-4 bg-[#317786] text-white text-xs font-semibold rounded-xl hover:bg-[#265e6a] transition-colors"
              >
                Sign In to Dashboard
              </Link>
            </div>
          </div>
        )}

        {!isLoading && errorType === "ALREADY_USED" && (
          <div className="space-y-5">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-200">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Link Already Used</h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/dashboard"
                className="w-full py-2.5 px-4 bg-[#317786] text-white text-xs font-semibold rounded-xl hover:bg-[#265e6a] transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {!isLoading && errorType === "USER_MISMATCH" && (
          <div className="space-y-5">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-200">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Different Account Required</h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleSwitchAccount}
                className="w-full py-2.5 px-4 bg-[#317786] text-white text-xs font-semibold rounded-xl hover:bg-[#265e6a] transition-colors flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sign In as Intended Recipient
              </button>
              <Link
                href="/dashboard"
                className="w-full py-2.5 px-4 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Continue with Current Account
              </Link>
            </div>
          </div>
        )}

        {!isLoading && errorType === "INVALID" && (
          <div className="space-y-5">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-200">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Invalid Action Link</h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/signin"
                className="w-full py-2.5 px-4 bg-[#317786] text-white text-xs font-semibold rounded-xl hover:bg-[#265e6a] transition-colors"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer Disclaimer */}
      <footer className="w-full max-w-md py-4 text-center">
        <p className="text-[11px] text-slate-600">
          Swastya Healthcare Platform • Encrypted Single-Use Link
        </p>
      </footer>
    </div>
  );
}
