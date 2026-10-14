import React from "react";
import { LotusIcon } from "@/components/Logo";

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden pt-5 pb-16 lg:pt-8 lg:pb-20 bg-gradient-to-b from-white via-[#FCFAF5] to-white border-b border-slate-100"
      id="hero"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Hero Text Column */}
          <div className="lg:col-span-7 space-y-6">
            {/* Category Tag / Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#317786]/10 border border-[#317786]/20 text-[#053845] text-xs font-semibold tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-[#317786]" />
              SMART BLOOD COORDINATION
            </div>

            {/* Main Heading */}
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-[#053845] tracking-tight leading-[1.18]">
              Connecting Blood Needs with the Right Support.
            </h1>

            {/* Supporting Paragraph */}
            <p className="text-slate-600 text-lg leading-relaxed max-w-2xl font-normal">
              Swastya brings hospitals, blood banks, donors, and patients together to make blood requests easier to coordinate, track, and respond to.
            </p>

            {/* Hero Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-3">
              <a
                className="inline-flex justify-center items-center px-7 py-3.5 rounded-md font-medium text-base text-white bg-[#B94F30] hover:bg-[#a14023] shadow-md shadow-[#B94F30]/20 transition-all focus:ring-2 focus:ring-[#B94F30] focus:ring-offset-2"
                href="#request-modal"
              >
                Request Blood
              </a>
              <a
                className="inline-flex justify-center items-center px-7 py-3.5 rounded-md font-medium text-base text-[#053845] border border-[#053845] bg-transparent hover:bg-[#053845]/5 transition-all focus:ring-2 focus:ring-[#053845] focus:ring-offset-2"
                href="#portals"
              >
                Become a Donor
              </a>
            </div>

            {/* Trust Indicator / Subtext */}
            <div className="pt-4 flex items-center gap-2 text-sm text-slate-500 font-medium">
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-[#317786] flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              <span>Supporting a more connected blood donation network.</span>
            </div>
          </div>

          {/* Hero UI Mockup Column */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <div className="relative w-full max-w-[500px] aspect-square flex items-center justify-center">
              {/* Outer circle */}
              <div className="absolute inset-4 rounded-full bg-[#FAF6EE] border border-[#F3E9D1]" />
              {/* Inner ring */}
              <div className="absolute w-[68%] h-[68%] rounded-full border border-[#317786]/30" />
              {/* Crosshair lines */}
              <div className="absolute h-full w-[1px] bg-[#317786]/30" />
              <div className="absolute w-full h-[1px] bg-[#317786]/30" />

              {/* Cardinal dots */}
              <span className="absolute top-[16%] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#B94F30]" />
              <span className="absolute bottom-[16%] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#B94F30]" />
              <span className="absolute left-[16%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#B94F30]" />
              <span className="absolute right-[16%] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#B94F30]" />

              {/* Diagonal dots */}
              <span className="absolute top-[28%] left-[23%] w-1.5 h-1.5 rounded-full bg-[#EFA27E]" />
              <span className="absolute top-[28%] right-[23%] w-1.5 h-1.5 rounded-full bg-[#EFA27E]" />
              <span className="absolute bottom-[28%] left-[23%] w-1.5 h-1.5 rounded-full bg-[#EFA27E]" />
              <span className="absolute bottom-[28%] right-[23%] w-1.5 h-1.5 rounded-full bg-[#EFA27E]" />

              {/* Center Badge */}
              <div className="absolute z-20 w-[158px] h-[158px] sm:w-[172px] sm:h-[172px] rounded-full bg-white border border-slate-200 shadow-md flex flex-col items-center justify-center p-3 text-center">
                <LotusIcon className="h-8 w-auto mb-1 flex-shrink-0" />
                <span className="font-serif text-lg font-bold text-[#053845] leading-tight">
                  Swastya
                </span>
                <span className="text-[8px] tracking-wider uppercase font-semibold text-[#317786] mt-0.5">
                  PEOPLE • CARE • TOGETHER
                </span>
              </div>

              {/* Node 1: Top - Hospitals */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-[140px] sm:w-[155px] bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center mb-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v4m-2-2h4" />
                  </svg>
                </div>
                <h3 className="font-serif text-sm font-bold text-[#053845]">Hospitals</h3>
                <p className="text-[11px] text-slate-500 leading-tight mt-1">
                  Create blood requests and coordinate.
                </p>
              </div>

              {/* Node 2: Left - Patients */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-[140px] sm:w-[155px] bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center mb-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <h3 className="font-serif text-sm font-bold text-[#053845]">Patients</h3>
                <p className="text-[11px] text-slate-500 leading-tight mt-1">
                  Submit or follow blood requests.
                </p>
              </div>

              {/* Node 3: Right - Blood Banks */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-[140px] sm:w-[155px] bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center mb-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
                    />
                  </svg>
                </div>
                <h3 className="font-serif text-sm font-bold text-[#053845]">Blood Banks</h3>
                <p className="text-[11px] text-slate-500 leading-tight mt-1">
                  Manage inventory and respond to requests.
                </p>
              </div>

              {/* Node 4: Bottom - Blood Donors */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 w-[140px] sm:w-[155px] bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3.5 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-lg bg-[#317786]/10 text-[#317786] flex items-center justify-center mb-1.5 relative">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#EFA27E] flex items-center justify-center text-white">
                    <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 20 20">
                      <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                    </svg>
                  </span>
                </div>
                <h3 className="font-serif text-sm font-bold text-[#053845]">Blood Donors</h3>
                <p className="text-[11px] text-slate-500 leading-tight mt-1">
                  Register, set availability and help save lives.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
