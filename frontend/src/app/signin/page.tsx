"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, Building2, HeartHandshake, CheckCircle2 } from "lucide-react";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col justify-between bg-[#FAF6EE] text-slate-800 antialiased selection:bg-[#EFA27E]/30 selection:text-[#053845]">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#F3E9D1] bg-white/80 backdrop-blur-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-13 sm:h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#053845] hover:text-[#317786] transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back to Home
          </Link>

          {/* Right Action */}
          <div className="text-xs sm:text-sm text-slate-600">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-[#317786] hover:text-[#245964] hover:underline">
              Create one
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow flex items-center justify-center py-2 sm:py-4 px-4 sm:px-6 lg:px-8 overflow-y-auto lg:overflow-visible">
        <div className="w-full max-w-4xl lg:max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-center my-auto">
          {/* Left Brand Panel */}
          <div className="lg:col-span-5 space-y-3 sm:space-y-3.5 lg:pr-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#317786]/10 border border-[#317786]/20 text-[#053845] text-[10px] sm:text-xs font-semibold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#317786]" />
              SECURE COORDINATION PORTAL
            </div>

            <div className="space-y-1.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#053845] leading-tight">
                Welcome back to Swastya
              </h1>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
                Connecting patients, hospitals, blood banks and donors to make blood coordination simpler when it matters most.
              </p>
            </div>

            {/* Platform Highlights */}
            <div className="space-y-2 pt-1">
              <div className="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-lg bg-white/70 border border-[#F3E9D1]">
                <div className="w-7 h-7 rounded-md bg-[#317786]/10 text-[#317786] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#053845]">Clinical & Hospital Access</h4>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Streamlined intake and rapid coordination with certified blood banks.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-lg bg-white/70 border border-[#F3E9D1]">
                <div className="w-7 h-7 rounded-md bg-[#EFA27E]/20 text-[#B94F30] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <HeartHandshake className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#053845]">Voluntary Donor Network</h4>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Privacy-first donor discovery and availability scheduling.</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 sm:p-2.5 rounded-lg bg-white/70 border border-[#F3E9D1]">
                <div className="w-7 h-7 rounded-md bg-[#317786]/10 text-[#317786] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#053845]">Traceable Requests</h4>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Real-time status updates without chaotic external phone chains.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Form Card */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl border border-[#F3E9D1] shadow-sm p-4 sm:p-6 lg:p-7">
              <div className="mb-3.5 sm:mb-4">
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#053845]">
                  Sign in to your account
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Enter your details to continue to Swastya.
                </p>
              </div>

              {/* Status Message Notification */}
              {statusMessage && (
                <div className="mb-3.5 p-3 rounded-lg bg-[#e8f3f5] border border-[#317786]/30 flex items-start gap-2.5 text-xs sm:text-sm text-[#053845]">
                  <CheckCircle2 className="w-4 h-4 text-[#317786] flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Notice</span>
                    <span className="text-slate-600">{statusMessage}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-3 sm:space-y-3.5">
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700 mb-1">
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
                    <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-700">
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
                      className={`w-full pl-9 pr-10 py-2 text-xs sm:text-sm rounded-lg border bg-white text-slate-800 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 ${
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
                  className="w-full py-2.5 px-4 rounded-lg font-medium text-xs sm:text-sm text-white bg-[#317786] hover:bg-[#245964] active:bg-[#1b444c] shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-[#317786] focus:ring-offset-2 cursor-pointer"
                >
                  Sign In
                </button>
              </form>

              {/* Registration Link */}
              <div className="mt-3.5 pt-2.5 border-t border-slate-100 text-center text-xs text-slate-600">
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
        </div>
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-[#F3E9D1] py-2 text-center text-[10px] sm:text-[11px] text-slate-400 flex-shrink-0">
        <p>© 2026 Swastya Health Systems. All rights reserved. Platform designed solely for coordination support.</p>
      </footer>
    </div>
  );
}
