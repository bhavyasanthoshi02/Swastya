"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Building2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { setAuthToken, setStoredUser } from "@/lib/auth";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("session") === "expired") {
      setStatusMessage("Your session has expired. Please sign in again to continue.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!email.includes("@")) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.auth.login({
        email: email.trim(),
        password,
      });

      if (res.success && res.token) {
        setAuthToken(res.token);
        setStoredUser(res.user, res.donor, res.requester, res.hospital);

        if (res.user.role === "DONOR") {
          router.push("/donor/dashboard");
        } else if (res.user.role === "REQUESTER" || (res.user.role as any) === "PATIENT") {
          router.push("/requester/dashboard");
        } else if (res.user.role === "HOSPITAL") {
          router.push("/hospital/dashboard");
        } else {
          router.push("/dashboard");
        }
      } else {
        setErrorMessage(res.message || "Failed to sign in. Please verify your credentials.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to connect to Swastya server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen max-h-screen w-full flex flex-col justify-between bg-[#FAF6EE] text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845] overflow-y-auto md:overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#F3E9D1] bg-white/80 backdrop-blur-sm sticky top-0 z-30 flex-shrink-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-12 sm:h-13 flex items-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#053845] hover:text-[#317786] transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:-translate-x-1" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content Area - Centered Card, Perfectly Fit to Screen */}
      <main className="flex-1 flex items-center justify-center p-3 sm:p-4 md:p-6 my-auto overflow-y-auto md:overflow-visible">
        <div className="w-full max-w-[420px]">
          <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-sm p-5 sm:p-6 sm:py-6">
            {/* Header / Brand */}
            <div className="flex flex-col items-center text-center mb-4 sm:mb-4.5">
              <Link href="/" className="mb-2 sm:mb-2.5 transition-opacity hover:opacity-90 inline-block">
                <Logo />
              </Link>
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-[#053845] tracking-tight">
                Sign in to your account
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter your details to continue to Swastya
              </p>
            </div>

            {/* Status Message Notification */}
            {statusMessage && (
              <div className="mb-3 p-2.5 rounded-lg bg-[#e8f3f5] border border-[#317786]/30 flex items-start gap-2 text-xs text-[#053845]">
                <CheckCircle2 className="w-4 h-4 text-[#317786] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Notice</span>
                  <span className="text-slate-600">{statusMessage}</span>
                </div>
              </div>
            )}

            {/* Error Message Notification */}
            {errorMessage && (
              <div className="mb-3 p-2.5 rounded-lg bg-[#fdf2f2] border border-[#A2363A]/30 flex items-start gap-2 text-xs text-[#A2363A]">
                <AlertCircle className="w-4 h-4 text-[#A2363A] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Sign In Failed</span>
                  <span className="text-slate-700">{errorMessage}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-3 sm:space-y-3.5">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-[10.5px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-3.5 w-3.5" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="name@hospital.org or personal email"
                    className={`w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border bg-white text-slate-800 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 ${
                      errors.email
                        ? "border-[#A2363A] bg-[#fdf2f2]/30 focus:ring-[#A2363A]"
                        : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20"
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-[11px] text-[#A2363A] font-medium flex items-center gap-1">
                    <span>•</span> {errors.email}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="password" className="block text-[10.5px] font-semibold uppercase tracking-wider text-slate-700">
                    Password
                  </label>
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="text-[11px] font-medium text-[#317786] hover:text-[#245964] hover:underline transition-colors"
                  >
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="Enter your account password"
                    className={`w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-lg border bg-white text-slate-800 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 ${
                      errors.password
                        ? "border-[#A2363A] bg-[#fdf2f2]/30 focus:ring-[#A2363A]"
                        : "border-slate-200 focus:border-[#317786] focus:ring-[#317786]/20"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-[11px] text-[#A2363A] font-medium flex items-center gap-1">
                    <span>•</span> {errors.password}
                  </p>
                )}
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#317786] focus:ring-[#317786] focus:ring-offset-0 transition-colors cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 text-xs text-slate-600 cursor-pointer select-none">
                  Remember my session for 30 days
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-lg font-medium text-xs sm:text-sm text-white bg-[#317786] hover:bg-[#245964] active:bg-[#1b444c] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-[#317786] focus:ring-offset-2 cursor-pointer flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isLoading ? "Signing in..." : "Sign In"}</span>
              </button>
            </form>

            {/* Registration Link */}
            <div className="mt-3.5 pt-3 border-t border-slate-100 text-center text-xs text-slate-600">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-semibold text-[#317786] hover:text-[#245964] hover:underline transition-colors"
              >
                Create one
              </Link>
            </div>

            {/* Institutional Access Information Panel */}
            <div className="mt-3 p-2.5 rounded-lg bg-[#FAF6EE] border border-[#F3E9D1] text-[11px] text-slate-600 flex items-start gap-2">
              <Building2 className="w-3.5 h-3.5 text-[#317786] flex-shrink-0 mt-0.5" />
              <p className="leading-snug">
                <span className="font-semibold text-[#053845]">Institutional Partners:</span> Hospital and blood bank staff should sign in using authorized facility credentials. Contact your coordination administrator for access clearance.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-[#F3E9D1] py-2 sm:py-2.5 text-center text-[10px] sm:text-[11px] text-slate-400 flex-shrink-0">
        <p>© 2026 Swastya Health Systems. All rights reserved. Platform designed solely for coordination support.</p>
      </footer>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF6EE] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#317786] animate-spin" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
