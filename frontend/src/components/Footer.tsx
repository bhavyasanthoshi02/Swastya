import React from "react";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="bg-[#053845] text-white pt-16 pb-12 border-t border-[#053845]" id="footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-white/10">
          {/* Col 1: Brand Info */}
          <div className="lg:col-span-6 space-y-4">
            <Logo variant="footer" />
            <p className="text-xs text-slate-300 leading-relaxed max-w-sm pt-1">
              Swastya is an open coordination framework connecting patients, medical institutions, and certified blood centers for safe, fast, and structured blood donor discovery.
            </p>
          </div>

          {/* Col 2: Quick Links */}
          <div className="lg:col-span-2 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#EFA27E]">
              Platform
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              <li>
                <a className="hover:text-white transition-colors" href="#hero">
                  Home
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#about">
                  About Swastya
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#how-it-works">
                  How It Works
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#features">
                  Clinical Features
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: User Portals */}
          <div className="lg:col-span-2 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#EFA27E]">
              Portals
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              <li>
                <a className="hover:text-white transition-colors" href="#portals">
                  Hospitals Portal
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#portals">
                  Blood Banks Registry
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#portals">
                  Volunteer Donors
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#portals">
                  Request Status Check
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Legal & Ethics */}
          <div className="lg:col-span-2 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#EFA27E]">
              Ethics &amp; Trust
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
              <li>
                <a className="hover:text-white transition-colors" href="#faq">
                  Medical Disclaimer
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#faq">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#faq">
                  Terms of Coordination
                </a>
              </li>
              <li>
                <a className="hover:text-white transition-colors" href="#faq">
                  Donor Code of Ethics
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Disclaimer & Copyright Bar */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between text-[11px] text-slate-400 gap-4">
          <p>© 2026
            Swastya Health Systems. All rights reserved. Platform designed solely for coordination support.</p>
          <p className="text-slate-400">
            Non-commercial initiative adhering to National Transfusion Services guidelines.
          </p>
        </div>
      </div>
    </footer>
  );
}
